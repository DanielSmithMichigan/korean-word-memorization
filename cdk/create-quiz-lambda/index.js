const path = require('path');
const fs = require('fs');
const Joi = require('@hapi/joi');
const { GoogleGenAI, FunctionCallingConfigMode } = require("@google/genai");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// --- Model Definitions ---
const STRONGER_MODEL = 'gemini-1.5-pro-latest';
const WEAKER_MODEL = 'gemini-2.5-flash-lite-preview-06-17';

const GEMINI_SECRET_NAME = process.env.GEMINI_SECRET_NAME;
const QUIZ_TABLE_NAME = process.env.QUIZ_TABLE_NAME;
const KOREAN_AUDIO_BUCKET_NAME = process.env.KOREAN_AUDIO_BUCKET_NAME;

let genAI;
let dynamoDbClient;
let s3Client;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const createQuizFunctionDeclaration = {
  name: 'createQuiz',
  parameters: {
    type: 'object',
    properties: {
      character: { type: 'string' },
      korean_sentence: { type: 'string' },
      english_sentence: { type: 'string' },
      conciseTranslationExplanation: { type: 'string' },
      vocabulary: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            korean: { type: 'string' },
            english: { type: 'string' },
          },
          required: ['korean', 'english'],
        },
      },
      korean_choices: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            correct: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
          required: ['correct', 'options'],
        },
      },
      english_choices: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            correct: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
          required: ['correct', 'options'],
        },
      },
    },
    required: ['korean_sentence', 'english_sentence', 'conciseTranslationExplanation', 'vocabulary', 'korean_choices', 'english_choices'],
  },
};

const quizSchema = Joi.object({
  character: Joi.string(),
  korean_sentence: Joi.string().required(),
  english_sentence: Joi.string().required(),
  conciseTranslationExplanation: Joi.string().required(),
  vocabulary: Joi.array().items(Joi.object({
    korean: Joi.string().required(),
    english: Joi.string().required(),
  })).optional(),
  korean_choices: Joi.array().items(Joi.object({
    correct: Joi.string().required(),
    options: Joi.array().items(Joi.string()).min(2).required(),
  })).min(1).required(),
  english_choices: Joi.array().items(Joi.object({
    correct: Joi.string().required(),
    options: Joi.array().items(Joi.string()).min(2).required(),
  })).min(1).required(),
});

async function initializeClients() {
  if (!genAI) {
    console.log("Initializing Gemini Client...");
    const smClient = new SecretsManagerClient();
    const command = new GetSecretValueCommand({ SecretId: GEMINI_SECRET_NAME });
    const response = await smClient.send(command);
    const secrets = JSON.parse(response.SecretString);
    if (!secrets.apiKey) {
      throw new Error(`Secret '${GEMINI_SECRET_NAME}' must contain 'apiKey' for Gemini.`);
    }
    genAI = new GoogleGenAI({ apiKey: secrets.apiKey });
  }
  if (!dynamoDbClient) {
    console.log("Initializing DynamoDB Client...");
    const client = new DynamoDBClient({});
    dynamoDbClient = DynamoDBDocumentClient.from(client);
  }
  if (!s3Client) {
    console.log("Initializing S3 Client...");
    s3Client = new S3Client({});
  }
}

async function generateContentWithRetry(prompt, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to generate content with ${STRONGER_MODEL}...`);
      const result = await genAI.models.generateContent({
        model: STRONGER_MODEL,
        contents: prompt
      });
      const text = result.text;
      if (!text || text.length < 10) {
        throw new Error('Generated content is empty or too short.');
      }
      console.log('Successfully generated raw content.');
      return text;
    } catch (error) {
      console.error(`Content generation attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        throw new Error(`Failed to generate valid content after ${maxRetries} attempts.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function sanitizeChoices(choices) {
  if (!choices || !Array.isArray(choices)) {
    return [];
  }

  const punctuationRegex = /[.,!?;:()\[\]{}'"]/g;

  const sanitizedChoices = choices.map(choice => {
    const sanitizedCorrect = choice.correct.replace(punctuationRegex, '').trim();
    const sanitizedOptions = choice.options
      .map(opt => opt.replace(punctuationRegex, '').trim())
      .filter(opt => opt.length > 0);

    return {
      ...choice,
      correct: sanitizedCorrect,
      options: sanitizedOptions,
    };
  });

  return sanitizedChoices.filter(choice => {
    if (choice.correct.length === 0) {
      console.log('Filtering out choice because correct answer is empty after sanitization.');
      return false;
    }
    if (choice.options.length < 2) {
      console.log('Filtering out choice because there are less than 2 options after sanitization.');
      return false;
    }
    return true;
  });
}

function ensureCorrectChoiceExists(choices) {
  if (!choices || !Array.isArray(choices)) {
    return;
  }
  choices.forEach(choice => {
    if (choice && choice.options && !choice.options.includes(choice.correct)) {
      console.log(`Correct answer "${choice.correct}" not found in options. Replacing a random option.`);
      const randomIndex = Math.floor(Math.random() * choice.options.length);
      choice.options[randomIndex] = choice.correct;
    }
  });
}

async function structureQuizWithRetry(prompt, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt} to structure quiz with ${WEAKER_MODEL}...`);
      const response = await genAI.models.generateContent({
        model: WEAKER_MODEL,
        contents: prompt,
        config: {
          toolConfig: {
            functionCallingConfig: {
              mode: FunctionCallingConfigMode.ANY,
              allowedFunctionNames: ['createQuiz'],
            }
          },
          tools: [{ functionDeclarations: [createQuizFunctionDeclaration] }]
        }
      });

      const functionCall = response.functionCalls[0];
      if (!functionCall) {
        throw new Error('No function call was returned by the model.');
      }

      const quizData = functionCall.args;

      // Sanitize choices before validation
      quizData.korean_choices = sanitizeChoices(quizData.korean_choices);
      quizData.english_choices = sanitizeChoices(quizData.english_choices);
      
      const { error } = quizSchema.validate(quizData);
      if (error) {
        throw new Error(`Joi validation failed: ${error.details.map(d => d.message).join(', ')}`);
      }

      // Ensure the correct choice is always in the options array
      ensureCorrectChoiceExists(quizData.korean_choices);
      ensureCorrectChoiceExists(quizData.english_choices);

      console.log('Successfully generated and validated quiz data.');
      return quizData;
    } catch (error) {
      console.error(`Structuring attempt ${attempt} failed:`, error.message);
      if (attempt === maxRetries) {
        throw new Error(`Failed to generate valid quiz data after ${maxRetries} attempts.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

async function generateAndSaveQuiz(bundleId, koreanPhrase, korean_audio_key, strongerPromptTemplate, weakerPromptTemplate) {
  console.log(`Generating quiz for phrase: ${koreanPhrase} in bundle: ${bundleId}`);

  const parts = bundleId.split('/');
  let characterName = null;
  let strongerPrompt = strongerPromptTemplate.replace('{{KOREAN_PHRASE}}', koreanPhrase);

  if (parts.length >= 2 && parts[0]) {
    characterName = parts[0];
    strongerPrompt = strongerPrompt.replace('{{OVERWATCH_CHARACTER}}', characterName);
  } else {
    strongerPrompt = strongerPrompt.replace('The character who is speaking is {{OVERWATCH_CHARACTER}}.\n', '');
  }

  const rawAiOutput = await generateContentWithRetry(strongerPrompt);

  const weakerPrompt = weakerPromptTemplate
    .replace('{{KOREAN_PHRASE}}', koreanPhrase)
    .replace('{{RAW_AI_OUTPUT}}', rawAiOutput);

  const quizData = await structureQuizWithRetry(weakerPrompt);

  if (characterName) {
    quizData.character = characterName;
  }

  quizData.bundle_id = bundleId;
  quizData.id = koreanPhrase;
  quizData.korean_audio_key = korean_audio_key;

  const putCommand = new PutCommand({
    TableName: QUIZ_TABLE_NAME,
    Item: quizData,
  });

  await dynamoDbClient.send(putCommand);
  console.log(`Successfully saved quiz for ${koreanPhrase} to DynamoDB.`);

  if (quizData.korean_audio_key) {
    console.log('Begin presign');
    const command = new GetObjectCommand({
      Bucket: KOREAN_AUDIO_BUCKET_NAME,
      Key: quizData.korean_audio_key,
    });
    quizData.korean_audio_url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    console.log('Presign finished');
  }

  console.log('finished');
  return quizData;
}

exports.handler = async (event) => {
  try {
    await initializeClients();
    const strongerPromptTemplate = fs.readFileSync(path.join(__dirname, 'stronger_prompt.md'), 'utf-8');
    const weakerPromptTemplate = fs.readFileSync(path.join(__dirname, 'weaker_prompt.md'), 'utf-8');

    // S3 Trigger
    if (event.Records) {
      for (const record of event.Records) {
        const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
        const s3Prefix = path.dirname(key);
        const filename = path.basename(key, path.extname(key));
        const hyphenIndex = filename.indexOf('-');
        const koreanPhrase = hyphenIndex !== -1 ? filename.substring(hyphenIndex + 1) : filename;
        await generateAndSaveQuiz(s3Prefix, koreanPhrase, key, strongerPromptTemplate, weakerPromptTemplate);
      }
      return { statusCode: 200, headers, body: JSON.stringify('S3 processing complete.') };
    }

    // Direct Lambda Invocation
    if (event.action === 'regenerate') {
      const { bundleId, koreanPhrase, korean_audio_key } = event.payload;
      if (!bundleId || !koreanPhrase || !korean_audio_key) {
        throw new Error('Missing bundleId, koreanPhrase, or korean_audio_key in payload.');
      }
      const quizData = await generateAndSaveQuiz(bundleId, koreanPhrase, korean_audio_key, strongerPromptTemplate, weakerPromptTemplate);
      return { statusCode: 200, headers, body: JSON.stringify(quizData) };
    }

    // API Gateway Invocation
    if (event.httpMethod) {
      if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
      }
      if (event.httpMethod === 'POST' && event.body) {
        const { bundleId, koreanPhrase, korean_audio_key } = JSON.parse(event.body);
        if (!bundleId || !koreanPhrase || !korean_audio_key) {
          return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing bundleId, koreanPhrase, or korean_audio_key in request body.' }) };
        }
        const quizData = await generateAndSaveQuiz(bundleId, koreanPhrase, korean_audio_key, strongerPromptTemplate, weakerPromptTemplate);
        return { statusCode: 200, headers, body: JSON.stringify(quizData) };
      }
    }

    return { statusCode: 404, headers, body: JSON.stringify({ message: "Not found. This function supports S3 triggers, direct invocation, and POST requests." }) };

  } catch (err) {
    console.error("Error processing event:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};