const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const { TABLE_NAME } = process.env;

const ALPHA = 0.4;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { userId, id, englishGuess = '', koreanGuess = '' } =
    JSON.parse(event.body || '{}');

  if (!userId || !id || (!englishGuess && !koreanGuess)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ message: 'Missing required parameters' }),
    };
  }

  try {
    const pkg = await getPackage(userId, id);
    if (!pkg) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Word package not found' }),
      };
    }

    const lowerEn = englishGuess.trim().toLowerCase();
    const lowerKr = koreanGuess.trim().toLowerCase();

    const wpIndex = pkg.wordPairs.findIndex(
      ({ english = '', korean = '' }) =>
        english.toLowerCase() === lowerEn || korean.toLowerCase() === lowerKr
    );

    if (wpIndex === -1) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ message: 'Matching word pair not found' }),
      };
    }

    const { wordPairs, attempts, successes, recentSuccessRate } = pkg;

    const isSuccess =
      wordPairs[wpIndex].english.toLowerCase() === lowerEn &&
      wordPairs[wpIndex].korean.toLowerCase() === lowerKr;

    attempts[wpIndex]++;
    if (isSuccess) successes[wpIndex]++;

    recentSuccessRate[wpIndex] =
      recentSuccessRate[wpIndex] * (1 - ALPHA) + (isSuccess ? 1 : 0) * ALPHA;

    await updatePackageStats(userId, id, { attempts, successes, recentSuccessRate });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Guess processed successfully',
        result: {
          index: wpIndex,
          attempts: attempts[wpIndex],
          successes: successes[wpIndex],
          recentSuccessRate: recentSuccessRate[wpIndex],
        },
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Error processing guess' }),
    };
  }
};

async function getPackage(userId, id) {
  const { Item } = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId, id },
    })
  );
  return Item;
}

async function updatePackageStats(userId, id, { attempts, successes, recentSuccessRate }) {
  return docClient.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId, id },
      UpdateExpression:
        'SET attempts = :a, successes = :s, recentSuccessRate = :r',
      ExpressionAttributeValues: {
        ':a': attempts,
        ':s': successes,
        ':r': recentSuccessRate,
      },
    })
  );
}
