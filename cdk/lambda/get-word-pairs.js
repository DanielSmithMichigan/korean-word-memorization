
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const { TABLE_NAME, GSI_NAME } = process.env;

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
  const { userId, lastEvaluatedKey } = event.queryStringParameters;

  if (!userId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing userId' }),
    };
  }

  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: GSI_NAME,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      ScanIndexForward: false,
      ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(Buffer.from(lastEvaluatedKey, 'base64').toString('utf-8')) : undefined,
    });

    const { Items, LastEvaluatedKey } = await docClient.send(command);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        Items,
        LastEvaluatedKey: LastEvaluatedKey ? Buffer.from(JSON.stringify(LastEvaluatedKey)).toString('base64') : undefined,
      }),
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error getting word pairs' }),
    };
  }
};
