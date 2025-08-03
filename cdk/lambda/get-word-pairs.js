
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
  const { userId, lastEvaluatedKey, customIdentifier } = event.queryStringParameters;

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

    let { Items, LastEvaluatedKey } = await docClient.send(command);

    if (customIdentifier && Items) {
      Items = Items.filter(item => item.customIdentifier === customIdentifier);
      // Since we are filtering, we might need to paginate on the client side if the item is not found.
      // For a unique identifier like 'favorites', we expect only one or zero items.
      // Clearing LastEvaluatedKey as the filtered result is likely not a full page.
      LastEvaluatedKey = undefined;
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
