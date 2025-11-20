const { GoogleGenAI } = require('@google/genai');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const EXAMS_TABLE_NAME = process.env.EXAMS_TABLE_NAME;
const QUESTIONS_TABLE_NAME = process.env.QUESTIONS_TABLE_NAME;
const ATTEMPTS_TABLE_NAME = process.env.ATTEMPTS_TABLE_NAME;
const GEMINI_SECRET_NAME = process.env.GEMINI_SECRET_NAME;

const STRONGER_MODEL = 'gemini-2.5-flash-preview-09-2025';

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

async function getExamQuestions(examId) {
    const cmd = new QueryCommand({
        TableName: QUESTIONS_TABLE_NAME,
        KeyConditionExpression: 'examId = :eid',
        ExpressionAttributeValues: { ':eid': examId },
    });
    const res = await docClient.send(cmd);
    return res.Items || [];
}

async function gradeSubmission(body) {
    const { userId, examId, answers } = body; // answers: [{ questionId, userAnswer }]
    if (!userId || !examId || !answers) throw new Error('Missing required fields');

    // 1. Fetch questions to get correct answers/context
    const questions = await getExamQuestions(examId);
    const questionMap = new Map(questions.map(q => [q.questionId, q]));

    // 2. AI Grading
    const gradingPrompt = `
    You are a strict but helpful Korean language teacher. Grade the following student answers.
    
    Questions and Answers:
    ${answers.map((a, i) => {
        const q = questionMap.get(a.questionId);
        return `
        Q${i + 1} (${q.type}): ${q.questionText}
        Correct Answer/Translation: ${q.answer}
        Student Answer: ${a.userAnswer}
      `;
    }).join('\n')}

    Provide a JSON response with:
    1. "results": Array of objects for each question with:
       - "questionId"
       - "isCorrect" (boolean)
       - "feedback" (string, explain why right/wrong)
    2. "overallGrade": Letter grade (A, B, C, D, F)
    3. "percentage": Number (0-100)
    4. "overallFeedback": Summary string
  `;

    const resp = await genAI.models.generateContent({
        model: STRONGER_MODEL,
        contents: [{ role: 'user', parts: [{ text: gradingPrompt }] }],
        config: { responseMimeType: 'application/json' }
    });

    const gradingResult = JSON.parse(resp.text || '{}');
    const attemptId = randomUUID();
    const now = new Date().toISOString();

    // 3. Store Results
    // Store overall result
    await docClient.send(new PutCommand({
        TableName: ATTEMPTS_TABLE_NAME,
        Item: {
            compositeKey: `${userId}-${examId}`,
            attemptKey: `OVERALL-${attemptId}`,
            timestamp: now,
            userId,
            examId,
            ...gradingResult
        }
    }));

    // Store individual question results (optional, but good for detailed history)
    /*
    for (const res of gradingResult.results || []) {
      await docClient.send(new PutCommand({
        TableName: ATTEMPTS_TABLE_NAME,
        Item: {
          compositeKey: `${userId}-${examId}`,
          attemptKey: `${res.questionId}-${attemptId}`,
          ...res
        }
      }));
    }
    */

    return { attemptId, ...gradingResult };
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === 'OPTIONS') {
            return { statusCode: 200, headers, body: '' };
        }

        await initializeClients();

        if (event.httpMethod === 'GET') {
            const { examId } = event.queryStringParameters || {};
            if (!examId) throw new Error('Missing examId');
            const questions = await getExamQuestions(examId);
            return { statusCode: 200, headers, body: JSON.stringify(questions) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body || '{}');
            // Assume path contains action or just default to submit
            const result = await gradeSubmission(body);
            return { statusCode: 200, headers, body: JSON.stringify(result) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (err) {
        console.error(err);
        return { statusCode: 500, headers, body: JSON.stringify({ message: err.message }) };
    }
};
