const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
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
  const { wordPairs, customIdentifier, id, name, pinned } = JSON.parse(event.body);

  if (!userId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing userId' }),
    };
  }

  // Support meta-only updates (name and/or pinned) when id is provided and wordPairs is not.
  if ((!wordPairs || wordPairs.length === 0) && id && (typeof name === 'string' || typeof pinned === 'boolean')) {
    try {
      await updateMetaOnly(userId, id, { name, pinned });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Package metadata updated successfully.', id }),
      };
    } catch (error) {
      console.error(error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ message: 'Error updating package metadata' }),
      };
    }
  }

  if (!Array.isArray(wordPairs) || wordPairs.length === 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing valid wordPairs array' }),
    };
  }

  try {
    const newId = await upsertRecord(userId, wordPairs, customIdentifier, id, name, pinned);

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

async function upsertRecord(userId, wordPairs, customIdentifier, id, name, pinned) {
  const length = wordPairs.length;
  let recordId = id;

  if (customIdentifier === 'favorites') {
    recordId = 'favorites';
  } else if (!recordId) {
    recordId = randomUUID();
  }

  // Build update expression to overwrite word data while preserving unspecified fields (e.g., pinned)
  const sets = [
    '#ts = :ts',
    '#wp = :wp',
    '#at = :at',
    '#sc = :sc',
    '#rs = :rs',
  ];
  const names = {
    '#ts': 'timestamp',
    '#wp': 'wordPairs',
    '#at': 'attempts',
    '#sc': 'successes',
    '#rs': 'recentSuccessRate',
  };
  const values = {
    ':ts': Date.now(),
    ':wp': wordPairs,
    ':at': Array(length).fill(0),
    ':sc': Array(length).fill(0),
    ':rs': Array(length).fill(1),
  };

  if (customIdentifier) {
    sets.push('#ci = :ci');
    names['#ci'] = 'customIdentifier';
    values[':ci'] = customIdentifier;
  }
  if (typeof name === 'string') {
    sets.push('#n = :name');
    names['#n'] = 'name';
    values[':name'] = name;
  }
  if (typeof pinned === 'boolean') {
    sets.push('#p = :pinned');
    names['#p'] = 'pinned';
    values[':pinned'] = pinned;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, id: recordId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  });

  await docClient.send(command);
  return recordId;
}

async function updateMetaOnly(userId, id, { name, pinned }) {
  const sets = ['#ts = :ts'];
  const names = { '#ts': 'timestamp' };
  const values = { ':ts': Date.now() };

  if (typeof name === 'string') {
    sets.push('#n = :name');
    names['#n'] = 'name';
    values[':name'] = name;
  }
  if (typeof pinned === 'boolean') {
    sets.push('#p = :pinned');
    names['#p'] = 'pinned';
    values[':pinned'] = pinned;
  }

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { userId, id },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
    ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)'
  });
  await docClient.send(command);
}
