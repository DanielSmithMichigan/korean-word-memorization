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
  }
}