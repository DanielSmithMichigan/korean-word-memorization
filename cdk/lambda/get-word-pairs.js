
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const { TABLE_NAME, GSI_NAME } = process.env;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
  const { userId, lastEvaluatedKey, customIdentifier, id } = event.queryStringParameters;

  if (!userId) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing userId' }),
    };
  }

  try {
    let Items = [];
    let LastEvaluatedKey;

    if (id) {
      // Fetch a single item by id
      const command = new GetCommand({
        TableName: TABLE_NAME,
        Key: { id, userId },
      });
      const { Item } = await docClient.send(command);
      if (Item) {
        Items.push(Item);
      }
    } else {
      // Query for multiple items
      const command = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: GSI_NAME,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': userId },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey ? JSON.parse(Buffer.from(lastEvaluatedKey, 'base64').toString('utf-8')) : undefined,
      });

      const queryResult = await docClient.send(command);
      Items = queryResult.Items;
      LastEvaluatedKey = queryResult.LastEvaluatedKey;

      if (customIdentifier && Items) {
        Items = Items.filter(item => item.customIdentifier === customIdentifier);
        LastEvaluatedKey = undefined;
      }
    }

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
