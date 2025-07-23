const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { LambdaClient, InvokeCommand } = require("@aws-sdk/client-lambda");

const QUIZ_TABLE_NAME = process.env.QUIZ_TABLE_NAME;
const BUNDLE_INDEX_NAME = 'bundle-id-index';
const KOREAN_AUDIO_BUCKET_NAME = process.env.KOREAN_AUDIO_BUCKET_NAME;
const CREATE_QUIZ_LAMBDA_NAME = process.env.CREATE_QUIZ_LAMBDA_NAME;

let dynamoDbClient;
let s3Client;
let lambdaClient;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function initializeClients() {
  if (!dynamoDbClient) {
    console.log("Initializing DynamoDB Client...");
    const client = new DynamoDBClient({});
    dynamoDbClient = DynamoDBDocumentClient.from(client);
  }
  if (!s3Client) {
    console.log("Initializing S3 Client...");
    s3Client = new S3Client({});
  }
  if (!lambdaClient) {
    console.log("Initializing Lambda Client...");
    lambdaClient = new LambdaClient({});
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    await initializeClients();

    const { httpMethod, path } = event;

    // GET /bundles
    if (httpMethod === 'GET' && path === '/bundles') {
      console.log('Fetching unique bundle names...');
      const scanCommand = new ScanCommand({
        TableName: QUIZ_TABLE_NAME,
        ProjectionExpression: 'bundle_id',
      });
      const { Items } = await dynamoDbClient.send(scanCommand);
      const bundleIds = new Set(Items.map(item => item.bundle_id));
      const uniqueBundleIds = Array.from(bundleIds);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(uniqueBundleIds),
      };
    }

    // GET /quizzes/{bundleId...}
    if (httpMethod === 'GET' && path.startsWith('/quizzes/')) {
      const bundleId = decodeURIComponent(path.substring('/quizzes/'.length));
      console.log(`Fetching quizzes for bundleId: ${bundleId}`);
      const queryCommand = new QueryCommand({
        TableName: QUIZ_TABLE_NAME,
        IndexName: BUNDLE_INDEX_NAME,
        KeyConditionExpression: 'bundle_id = :bundleId',
        ExpressionAttributeValues: {
          ':bundleId': bundleId,
        },
      });
      const { Items } = await dynamoDbClient.send(queryCommand);
      if (Items) {
        for (const item of Items) {
          if (item.korean_audio_key) {
            const command = new GetObjectCommand({
              Bucket: KOREAN_AUDIO_BUCKET_NAME,
              Key: item.korean_audio_key,
            });
            item.korean_audio_url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
          }
        }
      }
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(Items || []),
      };
    }
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not Found' }),
    };

  } catch (err) {
    console.error("Error processing event:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Error processing request.' }),
    };
  }
};