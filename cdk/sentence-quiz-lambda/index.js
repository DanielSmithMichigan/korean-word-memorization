const { randomUUID } = require('crypto');
const Joi = require('joi');
const { GoogleGenAI } = require('@google/genai');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME;
const GSI_NAME = process.env.GSI_NAME;
const GEMINI_SECRET_NAME = process.env.GEMINI_SECRET_NAME;

let genAI;
let docClient;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const sentenceQuizSchema = Joi.object({
  userId: Joi.string().required(),
  id: Joi.string().required(),
  quizzes: Joi.array().items(Joi.object({
    english: Joi.string().required(),
    korean: Joi.string().required(),
  })).min(1).required(),
  vocabulary: Joi.array().items(Joi.object({
    english: Joi.string().required(),
    korean: Joi.string().required(),
  })).required(),
  createdAt: Joi.string().isoDate().required(),
  updatedAt: Joi.string().isoDate().required(),
  packagesUsed: Joi.array().items(Joi.string()).required(),
  pinned: Joi.boolean().required(),
  customIdentifier: Joi.string().optional(),
});

async function initializeClients() {
  if (!docClient) {
    const client = new DynamoDBClient({});
    docClient = DynamoDBDocumentClient.from(client);
  }
  if (!genAI) {
    const sm = new SecretsManagerClient({});
    const secret = await sm.send(new GetSecretValueCommand({ SecretId: GEMINI_SECRET_NAME }));
    const { apiKey } = JSON.parse(secret.SecretString || '{}');
    if (!apiKey) throw new Error(`Secret ${GEMINI_SECRET_NAME} missing apiKey`);
    genAI = new GoogleGenAI({ apiKey });
  }
}

function buildPrompt({ allowedVocabulary, requiredWord }) {
  const vocabList = allowedVocabulary.map(v => `${v.korean} = ${v.english}`).join('\n');
  return [
    {
      role: 'user',
      parts: [
        {
          text: `You are a Korean language sentence generator. Generate exactly 5 Korean/English sentence pairs.
Constraints:
- Korean sentences may only use words from the allowed vocabulary list below.
- Each sentence must include the required word "${requiredWord.korean}" at least once; vary its grammatical role/placement (topic, object, etc).
- Provide the English translation for each sentence.
- Also return an exhaustive vocabulary list of all Korean words used across all sentences, in dictionary/indefinite forms with English translations.

Allowed vocabulary (korean = english):
${vocabList}
`
        }
      ]
    }
  ];
}

async function generateForRequiredWord(allowedVocabulary, requiredWord) {
  const prompt = buildPrompt({ allowedVocabulary, requiredWord });
  const response = await genAI.models.generateContent({
    model: 'gemini-1.5-pro-latest',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          quizzes: {
            type: 'array',
            minItems: 5,
            maxItems: 5,
            items: {
              type: 'object',
              properties: {
                english: { type: 'string' },
                korean: { type: 'string' },
              },
              required: ['english', 'korean'],
            },
          },
          vocabulary: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                english: { type: 'string' },
                korean: { type: 'string' },
              },
              required: ['english', 'korean'],
            },
          },
        },
        required: ['quizzes', 'vocabulary'],
      },
    },
  });
  const text = response.text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('Gemini did not return valid JSON');
  }
  const { quizzes = [], vocabulary = [] } = parsed || {};
  if (!Array.isArray(quizzes) || quizzes.length !== 5) {
    throw new Error('Expected exactly 5 sentences from Gemini');
  }
  return { quizzes, vocabulary };
}

function mergeResults(results) {
  const allQuizzes = [];
  const vocabMap = new Map();
  for (const r of results) {
    for (const q of r.quizzes || []) allQuizzes.push(q);
    for (const v of r.vocabulary || []) {
      const key = (v.korean || '').trim().toLowerCase();
      if (!key) continue;
      if (!vocabMap.has(key)) vocabMap.set(key, v);
    }
  }
  return { quizzes: allQuizzes, vocabulary: Array.from(vocabMap.values()) };
}

async function savePackage(pkg) {
  const put = new PutCommand({ TableName: TABLE_NAME, Item: pkg });
  await docClient.send(put);
  return pkg;
}

function mergeIntoPackage(existingPkg, newResult, { userId, packagesUsed = [], customIdentifier }) {
  const baseQuizzes = Array.isArray(existingPkg?.quizzes) ? existingPkg.quizzes : [];
  const baseVocab = Array.isArray(existingPkg?.vocabulary) ? existingPkg.vocabulary : [];
  const merged = mergeResults([{ quizzes: baseQuizzes, vocabulary: baseVocab }, newResult]);

  const now = new Date().toISOString();
  const id = existingPkg?.id || randomUUID();

  const mergedPackagesUsed = Array.from(new Set([...(existingPkg?.packagesUsed || []), ...packagesUsed]));

  return {
    userId,
    id,
    quizzes: merged.quizzes,
    vocabulary: merged.vocabulary,
    createdAt: existingPkg?.createdAt || now,
    updatedAt: now,
    packagesUsed: mergedPackagesUsed,
    pinned: existingPkg?.pinned ?? false,
    customIdentifier: existingPkg?.customIdentifier || customIdentifier,
  };
}

async function handleGenerate(event) {
  const body = JSON.parse(event.body || '{}');
  const { userId } = body;
  if (!userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing userId' }) };
  }

  await initializeClients();

  // New incremental mode: expects a single requiredWord and optional existingPackage
  if (body.requiredWord) {
    const { requiredWord, activeVocabulary = [], existingPackage = null, packagesUsed = [], customIdentifier } = body;
    if (!requiredWord || !requiredWord.korean) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing requiredWord' }) };
    }

    const result = await generateForRequiredWord(activeVocabulary, requiredWord);
    const pkg = mergeIntoPackage(existingPackage, result, { userId, packagesUsed, customIdentifier });

    const { error } = sentenceQuizSchema.validate(pkg);
    if (error) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: `Validation failed: ${error.message}` }) };
    }

    await savePackage(pkg);
    return { statusCode: 200, headers, body: JSON.stringify(pkg) };
  }

  // Backward-compatible bulk mode: array of requiredWords
  const { requiredWords = [], activeVocabulary = [], packagesUsed = [], customIdentifier } = body;
  if (!Array.isArray(requiredWords) || requiredWords.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing requiredWords' }) };
  }

  const results = [];
  for (const rw of requiredWords) {
    // eslint-disable-next-line no-await-in-loop
    const r = await generateForRequiredWord(activeVocabulary, rw);
    results.push(r);
  }

  const { quizzes, vocabulary } = mergeResults(results);
  const now = new Date().toISOString();
  const id = randomUUID();
  const pkg = {
    userId,
    id,
    quizzes,
    vocabulary,
    createdAt: now,
    updatedAt: now,
    packagesUsed,
    pinned: false,
    customIdentifier,
  };

  const { error } = sentenceQuizSchema.validate(pkg);
  if (error) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: `Validation failed: ${error.message}` }) };
  }

  await savePackage(pkg);
  return { statusCode: 200, headers, body: JSON.stringify(pkg) };
}

async function handleList(userId) {
  const cmd = new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: GSI_NAME,
    KeyConditionExpression: 'userId = :u',
    ExpressionAttributeValues: { ':u': userId },
    ScanIndexForward: false,
  });
  const res = await docClient.send(cmd);
  return res.Items || [];
}

async function handleGet(userId, id) {
  const cmd = new GetCommand({ TableName: TABLE_NAME, Key: { userId, id } });
  const res = await docClient.send(cmd);
  return res.Item || null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod === 'POST') {
      return await handleGenerate(event);
    }

    // GET supports two modes: list by userId, or get by userId+id
    if (event.httpMethod === 'GET') {
      const qs = event.queryStringParameters || {};
      const { userId, id } = qs;
      if (!userId) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing userId' }) };
      }
      await initializeClients();
      if (id) {
        const item = await handleGet(userId, id);
        return { statusCode: 200, headers, body: JSON.stringify(item) };
      }
      const items = await handleList(userId);
      return { statusCode: 200, headers, body: JSON.stringify(items) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
  }
};


