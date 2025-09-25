import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Secret for the Gemini API Key
    const googleApiKeySecret = new secretsmanager.Secret(this, 'GoogleApiKey', {
      secretName: 'GoogleApiKey',
    });

    // --- NEW: Create the secret for the Google Cloud TTS Service Account JSON ---
    const gcpCredentialsSecret = new secretsmanager.Secret(this, 'GoogleTTSCreds', {
      secretName: 'GoogleTTSCreds',
    });


    const table = new dynamodb.Table(this, 'WordMemorization', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    table.addGlobalSecondaryIndex({
      indexName: 'user-timestamp-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
    });

    const textToSpeechDLQ = new sqs.Queue(this, 'TextToSpeechDLQ');

    const textToSpeechQueue = new sqs.Queue(this, 'TextToSpeechQueue', {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: textToSpeechDLQ,
      },
    });

    const wordUploaderLambda = new lambda.Function(this, 'WordUploader', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'word-uploader.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      environment: {
        TABLE_NAME: table.tableName,
        GSI_NAME: 'user-timestamp-index',
        QUEUE_URL: textToSpeechQueue.queueUrl,
      },
    });

    textToSpeechQueue.grantSendMessages(wordUploaderLambda);
    table.grantReadWriteData(wordUploaderLambda);

    new apigateway.LambdaRestApi(this, 'WordUploaderApi', {
      handler: wordUploaderLambda,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const getWordPairsLambda = new lambda.Function(this, 'GetWordPairs', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'get-word-pairs.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      environment: {
        TABLE_NAME: table.tableName,
        GSI_NAME: 'user-timestamp-index',
      },
    });

    table.grantReadData(getWordPairsLambda);

    new apigateway.LambdaRestApi(this, 'GetWordPairsApi', {
      handler: getWordPairsLambda,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const processGuessLambda = new lambda.Function(this, 'ProcessGuess', {
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'process-guess.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
        environment: {
            TABLE_NAME: table.tableName,
        },
    });

    table.grantReadWriteData(processGuessLambda);

    new apigateway.LambdaRestApi(this, 'ProcessGuessApi', {
        handler: processGuessLambda,
        defaultCorsPreflightOptions: {
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: ['POST', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
        },
    });

    // S3 bucket for audio files
    const audioBucket = new s3.Bucket(this, 'AudioBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    

    // Lambda function for text-to-speech
    const textToSpeechFunction = new lambda.Function(this, 'TextToSpeechFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('text-to-speech-lambda'),
      environment: {
        BUCKET_NAME: audioBucket.bucketName,
        // --- MODIFIED: Renamed for clarity to match Lambda code ---
        GEMINI_SECRET_NAME: googleApiKeySecret.secretName,
        // --- NEW: Add the environment variable for the GCP credentials secret ---
        GCP_SECRET_NAME: gcpCredentialsSecret.secretName,
      },
      timeout: cdk.Duration.seconds(60)
    });

    // Grant permissions
    googleApiKeySecret.grantRead(textToSpeechFunction);
    // --- NEW: Grant permission for the Lambda to read the new secret ---
    gcpCredentialsSecret.grantRead(textToSpeechFunction);
    
    audioBucket.grantReadWrite(textToSpeechFunction);
    textToSpeechQueue.grantConsumeMessages(textToSpeechFunction);

    // Add SQS event source to the text-to-speech lambda
    textToSpeechFunction.addEventSource(new SqsEventSource(textToSpeechQueue, {
      batchSize: 1,
    }));

    // API Gateway for the text-to-speech function
    new apigateway.LambdaRestApi(this, 'TextToSpeechApi', {
        handler: textToSpeechFunction,
        defaultCorsPreflightOptions: {
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: ['POST', 'OPTIONS'],
            allowHeaders: ['Content-Type', 'Authorization'],
        },
    });

    // DynamoDB table for Overwatch quizzes
    const quizTable = new dynamodb.Table(this, 'OverwatchQuizzes', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    quizTable.addGlobalSecondaryIndex({
      indexName: 'bundle-id-index',
      partitionKey: { name: 'bundle_id', type: dynamodb.AttributeType.STRING },
    });

    // S3 bucket for Korean audio uploads
    const koreanAudioBucket = new s3.Bucket(this, 'KoreanAudioBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Lambda to be triggered by S3 upload
    const createQuizLambda = new lambda.Function(this, 'CreateQuizLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('create-quiz-lambda'),
      environment: {
        QUIZ_TABLE_NAME: quizTable.tableName,
        GEMINI_SECRET_NAME: googleApiKeySecret.secretName,
        KOREAN_AUDIO_BUCKET_NAME: koreanAudioBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(60),
      reservedConcurrentExecutions: 1,
    });

    // Grant Lambda permissions to read the secret and write to the quiz table
    googleApiKeySecret.grantRead(createQuizLambda);
    quizTable.grantReadWriteData(createQuizLambda);
    koreanAudioBucket.grantRead(createQuizLambda);

    // Add S3 trigger to the Lambda (no filters)
    createQuizLambda.addEventSource(new cdk.aws_lambda_event_sources.S3EventSource(koreanAudioBucket, {
      events: [s3.EventType.OBJECT_CREATED],
    }));

    // API Gateway for the create-quiz function
    new apigateway.LambdaRestApi(this, 'CreateQuizApi', {
        handler: createQuizLambda,
        proxy: true, // Use proxy integration
        defaultCorsPreflightOptions: {
            allowOrigins: apigateway.Cors.ALL_ORIGINS,
            allowMethods: ['POST', 'OPTIONS', 'GET'],
            allowHeaders: ['Content-Type', 'Authorization'],
        },
    });

    // Lambda for quiz API
    const quizApiLambda = new lambda.Function(this, 'QuizApiLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('quiz-api-lambda'),
      environment: {
        QUIZ_TABLE_NAME: quizTable.tableName,
        BUNDLE_INDEX_NAME: 'bundle-id-index',
        KOREAN_AUDIO_BUCKET_NAME: koreanAudioBucket.bucketName,
        CREATE_QUIZ_LAMBDA_NAME: createQuizLambda.functionName,
      },
      memorySize: 512,
    });

    // Grant quiz API lambda permissions
    quizTable.grantReadWriteData(quizApiLambda);
    koreanAudioBucket.grantRead(quizApiLambda);
    createQuizLambda.grantInvoke(quizApiLambda);

    // API Gateway for the quiz API
    new apigateway.LambdaRestApi(this, 'QuizApi', {
      handler: quizApiLambda,
      proxy: true, // Use proxy integration
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // ---------------- Sentence Quiz Backend ----------------
    // DynamoDB table for sentence quizzes
    const sentenceQuizTable = new dynamodb.Table(this, 'SentenceQuizzes', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    sentenceQuizTable.addGlobalSecondaryIndex({
      indexName: 'user-createdAt-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // Lambda to generate and list sentence quizzes
    const sentenceQuizLambda = new lambda.Function(this, 'SentenceQuizLambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('sentence-quiz-lambda'),
      environment: {
        TABLE_NAME: sentenceQuizTable.tableName,
        GSI_NAME: 'user-createdAt-index',
        GEMINI_SECRET_NAME: googleApiKeySecret.secretName,
      },
      // Increased to allow slower Gemini responses and iterative front-end calls headroom
      timeout: cdk.Duration.seconds(180),
      memorySize: 1024,
    });

    sentenceQuizTable.grantReadWriteData(sentenceQuizLambda);
    googleApiKeySecret.grantRead(sentenceQuizLambda);

    const sentenceQuizApi = new apigateway.LambdaRestApi(this, 'SentenceQuizApi', {
      handler: sentenceQuizLambda,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    // Ensure CORS headers also appear on API Gateway 4XX/5XX responses
    sentenceQuizApi.addGatewayResponse('SentenceQuizDefault4XX', {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type, Authorization'",
        'Access-Control-Allow-Methods': "'GET, POST, OPTIONS'",
      },
    });
    sentenceQuizApi.addGatewayResponse('SentenceQuizDefault5XX', {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type, Authorization'",
        'Access-Control-Allow-Methods': "'GET, POST, OPTIONS'",
      },
    });
  }
}