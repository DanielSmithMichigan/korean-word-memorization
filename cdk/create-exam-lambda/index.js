const { randomUUID } = require('crypto');
const Joi = require('joi');
const { GoogleGenAI } = require('@google/genai');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const STRONGER_MODEL = 'gemini-2.5-flash-preview-09-2025';
const WEAKER_MODEL = 'gemini-2.5-flash-lite-preview-09-2025';

const EXAMS_TABLE_NAME = process.env.EXAMS_TABLE_NAME;
const QUESTIONS_TABLE_NAME = process.env.QUESTIONS_TABLE_NAME;
const GEMINI_SECRET_NAME = process.env.GEMINI_SECRET_NAME;

let genAI;
let docClient;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

async function createExam(body) {
    const { userId, settings, theme, allowedWords } = body;
    if (!userId) throw new Error('Missing userId');

    const examId = randomUUID();
    const now = new Date().toISOString();

    const exam = {
        userId,
        examId,
        createdAt: now,
        settings: settings || {},
        theme: theme || '',
        allowedWords: allowedWords || '',
        status: 'creating', // creating -> ready
    };

    await docClient.send(new PutCommand({
        TableName: EXAMS_TABLE_NAME,
        Item: exam,
    }));

    return { examId };
}

async function generateQuestion(body) {
    const { examId, type, theme, allowedWords } = body;
    if (!examId || !type) throw new Error('Missing examId or type');

    // Phase 1: Strong AI (Unstructured)
    const strongPrompt = `
    Generate ONE unique practice question for a Korean language exam.
    Type: ${type}
    Theme: ${theme || 'General'}
    ${allowedWords ? `Must use at least one of these words: ${allowedWords}` : ''}
    
    Requirements by type:
    - "fill-in-the-blank": Provide a Korean sentence with a missing word/particle, and the answer.
    - "translate-en-to-ko": Provide an English sentence to translate to Korean.
    - "translate-ko-to-en": Provide a Korean sentence to translate to English.
    - "audio-translation": Provide a Korean text (which will be TTS'd later) to translate to English.

    Output ONLY the raw content. No JSON yet.
  `;

    const strongResp = await genAI.models.generateContent({
        model: STRONGER_MODEL,
        contents: [{ role: 'user', parts: [{ text: strongPrompt }] }],
    });
    const unstructuredText = strongResp.text || '';

    // Phase 2: Weak AI (Structured)
    const schemaPrompt = `
    Convert the following unstructured quiz question into a structured JSON object.
    
    Unstructured Input:
    ${unstructuredText}

    Type: ${type}

    Required JSON Structure:
    {
      "questionText": "The main text to display (or audio script)",
      "answer": "The correct answer or translation",
      "hint": "Optional hint",
      "type": "${type}"
    }
  `;

    const weakResp = await genAI.models.generateContent({
        model: WEAKER_MODEL,
        contents: [{ role: 'user', parts: [{ text: schemaPrompt }] }],
        config: {
            responseMimeType: 'application/json',
        }
    });

    const structured = JSON.parse(weakResp.text || '{}');
    const questionId = randomUUID();

    // Phase 3: Storage
    const questionItem = {
        examId,
        questionId,
        ...structured,
        createdAt: new Date().toISOString(),
    };

    await docClient.send(new PutCommand({
        TableName: QUESTIONS_TABLE_NAME,
        Item: questionItem,
    }));

    return questionItem;
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }

        await initializeClients();
        const body = JSON.parse(event.body || '{}');
        const op = body.op;

        let result;
        if (op === 'createExam') {
            result = await createExam(body);
        } else if (op === 'generateQuestion') {
            result = await generateQuestion(body);
        } else {
            return { statusCode: 400, headers, body: JSON.stringify({ message: 'Invalid op' }) };
        }

        return { statusCode: 200, headers, body: JSON.stringify(result) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, headers, body: JSON.stringify({ message: err.message }) };
    }
};
