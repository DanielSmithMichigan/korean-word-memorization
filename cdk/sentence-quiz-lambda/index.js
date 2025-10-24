const { randomUUID } = require('crypto');
const Joi = require('joi');
const { GoogleGenAI } = require('@google/genai');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { createFeedbackHandler } = require('./feedback');

const STRONGER_MODEL = 'gemini-2.5-flash-preview-09-2025';
const WEAKER_MODEL = 'gemini-2.5-flash-lite-preview-09-2025';

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
    korean: Joi.string().required(),
  })).min(1).required(),
  createdAt: Joi.string().isoDate().required(),
  updatedAt: Joi.string().isoDate().required(),
  packagesUsed: Joi.array().items(Joi.string()).required(),
  pinned: Joi.boolean().required(),
  customIdentifier: Joi.string().optional(),
  mode: Joi.string().valid(
    'translateEnglishToKorean',
    'summarizeKoreanAudioToEnglish',
    'summarizeWrittenKoreanToEnglish'
  ).required(),
  sentencesPerPrompt: Joi.number().integer().min(1).max(10).required(),
  vocabulary: Joi.array().items(Joi.object({
    english: Joi.string().required(),
    korean: Joi.string().required(),
  })).required(),
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

function buildStrongParagraphPrompt({ allowedVocabulary, requiredWord, primaryPracticeGoal, sentencesPerPrompt }) {
  const vocabList = allowedVocabulary.map(v => `${v.korean}`).join(',');
  const goalText = (primaryPracticeGoal && String(primaryPracticeGoal).trim().length > 0)
    ? `Primary practice goal: ${String(primaryPracticeGoal).trim()}`
    : '';
  return [
    {
      role: 'user',
      parts: [
        {
          text: `Pretend to be a korean person. And you are telling me something. Write ONE natural Korean paragraph consisting of exactly ${sentencesPerPrompt} sentences. It should flow naturally as one topic, each sentence adds onto the previous sentence.

Rules:
- Use ONLY words from the allowed vocabulary (you may conjugate/inflect them naturally).
- Include the required word "${requiredWord.korean}" in at least one of the sentences (more is fine; do not force awkwardness).
- Output ONLY the Korean paragraph text. No translation. No labels. No numbering. No extra commentary.

${goalText}

Allowed vocabulary (Korean only):
${vocabList}
`
        }
      ]
    }
  ];
}

function buildVocabExtractionPrompt({ paragraphs, allowedVocabulary }) {
  const allowed = allowedVocabulary.map(v => `${v.korean} = ${v.english}`).join('\n');
  const para = paragraphs.map((p, i) => `Paragraph ${i + 1}: ${p.paragraph}`).join('\n');
  return [
    {
      role: 'user',
      parts: [
        {
          text: `From the Korean paragraphs below, extract every unique Korean dictionary-form word that appears.
Only include words that exist in the allowed vocabulary list.
Map each Korean word to its English meaning using ONLY the allowed list.
Return JSON: { "vocabulary": [{ "korean": "...", "english": "..." }] }.

Allowed vocabulary (korean = english):
${allowed}

Paragraphs:
${para}
`
        }
      ]
    }
  ];
}

function buildFinalizeStrongPrompt({ paragraphs, vocabulary, sentencesPerPrompt, primaryPracticeGoal, mode }) {
  const para = paragraphs.map((p, i) => `Paragraph ${i + 1} (required: ${p.requiredWord?.korean || ''}): ${p.paragraph}`).join('\n');
  const vocabList = vocabulary.map(v => `${v.korean} = ${v.english}`).join('\n');
  const goalReminder = (primaryPracticeGoal && String(primaryPracticeGoal).trim().length > 0)
    ? `Primary practice goal: ${String(primaryPracticeGoal).trim()}`
    : '';
  const totalExpected = paragraphs.length * sentencesPerPrompt;
  return [
    {
      role: 'user',
      parts: [
        {
          text: `You are generating a quiz dataset from provided Korean paragraphs.

Tasks:
- Split each paragraph into exactly ${sentencesPerPrompt} sentences (natural splits; do not invent or remove content).
- For each sentence, provide an accurate English translation.
- Use the provided vocabulary list as the authoritative mapping; do not add words not present there.
- Preserve natural style; do not add numbering or extra notes.
${goalReminder}

Mode: ${mode}

Paragraphs:
${para}

Vocabulary (korean = english):
${vocabList}

Return JSON exactly in this shape:
{
  "quizzes": [{ "korean": "...", "english": "..." }]
}
The quizzes array must have exactly ${totalExpected} items.
`
        }
      ]
    }
  ];
}

async function generateParagraphForRequiredWord(allowedVocabulary, requiredWord, primaryPracticeGoal, sentencesPerPrompt) {
  const strongPrompt = buildStrongParagraphPrompt({ allowedVocabulary, requiredWord, primaryPracticeGoal, sentencesPerPrompt });
  const strongResponse = await genAI.models.generateContent({
    model: STRONGER_MODEL,
    contents: strongPrompt,
  });
  const strongText = (strongResponse.text || '').trim();
  if (!strongText) {
    throw new Error('Stronger model returned empty content');
  }
  return { paragraph: strongText };
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

function mergeIntoPackage(existingPkg, newResult, { userId, packagesUsed = [], customIdentifier, mode, sentencesPerPrompt }) {
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
    mode: existingPkg?.mode || mode,
    sentencesPerPrompt: existingPkg?.sentencesPerPrompt || sentencesPerPrompt,
  };
}

async function handleGenerate(event) {
  const body = JSON.parse(event.body || '{}');
  const { userId } = body;
  if (!userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing userId' }) };
  }

  await initializeClients();
  const op = body.op || null;

  // Phase 1: Generate one Korean paragraph (unstructured) for one required word
  if (op === 'generateParagraph') {
    const { requiredWord, activeVocabulary = [], primaryPracticeGoal, sentencesPerPrompt = 5 } = body;
    if (!requiredWord || !requiredWord.korean) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing requiredWord' }) };
    }
    const { paragraph } = await generateParagraphForRequiredWord(activeVocabulary, requiredWord, primaryPracticeGoal, Math.max(1, Math.min(10, sentencesPerPrompt)));
    return { statusCode: 200, headers, body: JSON.stringify({ paragraph, requiredWord }) };
  }

  // Phase 2: Store an aggregated package (no further model calls)
  if (op === 'storePackage') {
    const { quizzes = [], vocabulary = [], packagesUsed = [], customIdentifier, mode = 'translateEnglishToKorean', sentencesPerPrompt = 5 } = body;
    if (!Array.isArray(quizzes) || quizzes.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing quizzes' }) };
    }
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
      mode,
      sentencesPerPrompt: Math.max(1, Math.min(10, sentencesPerPrompt)),
    };
    const { error } = sentenceQuizSchema.validate(pkg);
    if (error) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: `Validation failed: ${error.message}` }) };
    }
    await savePackage(pkg);
    return { statusCode: 200, headers, body: JSON.stringify(pkg) };
  }

  // Optional: build vocabulary only from paragraphs via strong model JSON
  if (op === 'extractVocabulary') {
    const { paragraphs = [], activeVocabulary = [] } = body;
    if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing paragraphs' }) };
    }
    const vocabPrompt = buildVocabExtractionPrompt({ paragraphs: paragraphs.map(p => ({ paragraph: p })), allowedVocabulary: activeVocabulary });
    const vocabResp = await genAI.models.generateContent({
      model: STRONGER_MODEL,
      contents: vocabPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
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
          required: ['vocabulary'],
        },
      },
    });
    try {
      const parsed = JSON.parse(vocabResp.text || '{}');
      const vocabulary = Array.isArray(parsed?.vocabulary) ? parsed.vocabulary : [];
      return { statusCode: 200, headers, body: JSON.stringify({ vocabulary }) };
    } catch (e) {
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Failed to extract vocabulary JSON' }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid operation' }) };
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

const feedbackHandler = createFeedbackHandler({
  initializeClients,
  getGenAI: () => genAI,
  headers,
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod === 'POST') {
      console.log(event);
      if (event.path.includes('feedback')) {
        return await feedbackHandler(event);
      }
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

exports.feedbackHandler = feedbackHandler;


