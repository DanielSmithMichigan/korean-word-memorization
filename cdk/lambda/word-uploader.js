const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { randomUUID } = require('crypto');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const sqsClient = new SQSClient({});

const { TABLE_NAME, QUEUE_URL } = process.env;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  const { userId } = event.queryStringParameters;
  const { wordPairs, customIdentifier, id } = JSON.parse(event.body);

  if (!userId || !Array.isArray(wordPairs) || wordPairs.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing userId or valid wordPairs array' }),
    };
  }

  try {
    const newId = await upsertRecord(userId, wordPairs, customIdentifier, id);

    // const messagePromises = wordPairs.map(pair => {
    //   const command = new SendMessageCommand({
    //     QueueUrl: QUEUE_URL,
    //     MessageBody: JSON.stringify({ korean_word: pair.korean, api_choice: "gctts" }),
    //   });
    //   return sqsClient.send(command);
    // });

    // await Promise.all(messagePromises);

    const message = id ? 'Word package updated successfully.' : 'Word pairs added successfully and queued for audio generation.';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message, id: newId }),
    };
  } catch (error)
  {
    console.error(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error processing word pairs' }),
    };
  }
};

async function upsertRecord(userId, wordPairs, customIdentifier, id) {
  const length = wordPairs.length;
  let recordId = id;

  if (customIdentifier === 'favorites') {
    recordId = 'favorites';
  } else if (!recordId) {
    recordId = randomUUID();
  }

  const Item = {
    id: recordId,
    userId,
    timestamp: Date.now(),
    wordPairs,
    attempts: Array(length).fill(0),
    successes: Array(length).fill(0),
    recentSuccessRate: Array(length).fill(1),
  };

  if (customIdentifier) {
    Item.customIdentifier = customIdentifier;
  }

  const command = new PutCommand({
    TableName: TABLE_NAME,
    Item,
  });

  await docClient.send(command);
  return recordId;
}
