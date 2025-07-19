const { GoogleGenAI } = require("@google/genai");
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Writer } = require('wav');
const { TextToSpeechClient } = require("@google-cloud/text-to-speech");

const BUCKET_NAME = process.env.BUCKET_NAME;
// The secret containing the Gemini API Key
const GEMINI_SECRET_NAME = process.env.GEMINI_SECRET_NAME; 
// The secret containing the raw Google Cloud Service Account JSON
const GCP_SECRET_NAME = process.env.GCP_SECRET_NAME; 

// Scoped client variables to be initialized once per container
let s3Client;
let genAI;
let gcttsClient;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

async function initializeClients() {
    const smClient = new SecretsManagerClient();

    // Initialize Gemini client if it hasn't been already
    if (!genAI) {
        console.log("Initializing Gemini Client...");
        const command = new GetSecretValueCommand({ SecretId: GEMINI_SECRET_NAME });
        const response = await smClient.send(command);
        const secrets = JSON.parse(response.SecretString);
        
        if (!secrets.apiKey) {
            throw new Error(`Secret '${GEMINI_SECRET_NAME}' must contain 'apiKey' for Gemini.`);
        }
        
        genAI = new GoogleGenAI({ apiKey: secrets.apiKey });
    }

    // Initialize Google Cloud TTS Client if it hasn't been already
    if (!gcttsClient) {
        console.log("Initializing Google Cloud TTS Client...");
        const command = new GetSecretValueCommand({ SecretId: GCP_SECRET_NAME });
        const response = await smClient.send(command);
        
        // The entire secret string is the service account JSON
        const gcpCredentials = JSON.parse(response.SecretString);

        // A quick check to ensure the JSON looks like a service account file
        if (!gcpCredentials.client_email || !gcpCredentials.private_key) {
             throw new Error(`Secret '${GCP_SECRET_NAME}' does not appear to be a valid GCP service account JSON.`);
        }

        gcttsClient = new TextToSpeechClient({ credentials: gcpCredentials });
    }

    // Initialize S3 Client if it hasn't been already
    if (!s3Client) {
        s3Client = new S3Client({});
    }
}

// This function is specific to Gemini's PCM output and remains unmodified.
async function convertPcmToWav(pcmBuffer) {
    return new Promise((resolve, reject) => {
        const writer = new Writer({
            channels: 1,
            sampleRate: 24000,
            bitDepth: 16,
        });

        const chunks = [];
        writer.on('data', (chunk) => {
            chunks.push(chunk);
        });

        writer.on('end', () => {
            const wavBuffer = Buffer.concat(chunks);
            resolve(wavBuffer);
        });

        writer.on('error', reject);

        writer.write(pcmBuffer);
        writer.end();
    });
}

async function ensureAudioFileExists(koreanWord, overwrite = false, api_choice = 'gemini', isSqs = false) {
    if (!koreanWord) {
        throw new Error("korean_word is required.");
    }

    const objectKey = `${koreanWord}.wav`;

    if (!overwrite) {
        try {
            await s3Client.send(new HeadObjectCommand({
                Bucket: BUCKET_NAME,
                Key: objectKey,
            }));
            console.log(`File ${objectKey} already exists in S3.`);
            return objectKey;
        } catch (error) {
            if (error.name !== 'NotFound') {
                console.error(`Error checking for file ${objectKey} in S3:`, error);
                throw error;
            }
        }
    } else {
        console.log(`'overwrite' is true, forcing generation of ${objectKey}.`);
    }
    
    let wavBuffer;

    if (api_choice === 'gctts') {
        console.log(`Generating audio for "${koreanWord}" using Google Cloud TTS.`);
        
        // --- START OF FIX ---
        const request = {
            input: { text: koreanWord },
            voice: { languageCode: 'ko-KR', name: 'ko-KR-Wavenet-A' },
            // 1. Corrected audioEncoding to 'LINEAR16'
            // 2. Added sampleRateHertz to match convertPcmToWav
            audioConfig: { 
                audioEncoding: 'LINEAR16',
                sampleRateHertz: 24000 
            },
        };

        const [response] = await gcttsClient.synthesizeSpeech(request);
        const pcmBuffer = response.audioContent;

        if (!pcmBuffer || pcmBuffer.length === 0) {
            throw new Error("Could not extract audio data from the Google Cloud TTS response.");
        }
        
        // 3. Use the existing helper function to create a valid WAV file
        wavBuffer = await convertPcmToWav(pcmBuffer);
        // --- END OF FIX ---
    
    } else { // Default to Gemini
        console.log(`Generating audio for "${koreanWord}" using Gemini TTS.`);
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash-preview-tts", 
            contents: koreanWord,
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!audioData) {
            console.error("Failed to generate audio. Response:", JSON.stringify(response, null, 2));
            throw new Error("Could not extract audio data from the Gemini response.");
        }
        const pcmBuffer = Buffer.from(audioData, 'base64');
        
        wavBuffer = await convertPcmToWav(pcmBuffer);

        if (isSqs) {
            console.log('Waiting 5 seconds to give the gemini text to speech API some rest');
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }

    await s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        Body: wavBuffer,
        ContentLength: wavBuffer.length,
        ContentType: 'audio/wav'
    }));

    console.log(`Successfully generated and uploaded ${objectKey} to S3.`);
    return objectKey;
}

exports.handler = async (event) => {
    // Check for all required environment variables
    if (!GEMINI_SECRET_NAME || !GCP_SECRET_NAME || !BUCKET_NAME) {
        throw new Error("Environment variables SECRET_NAME, GCP_SECRET_NAME, and BUCKET_NAME must be set.");
    }

    // Initialize all clients and fetch secrets if needed
    await initializeClients();

    try {
        if (event.Records) { // SQS Trigger
            for (const record of event.Records) {
                const messageBody = JSON.parse(record.body);
                const overwrite = messageBody.overwrite || false;
                const api_choice = messageBody.api_choice || 'gemini';
                await ensureAudioFileExists(messageBody.korean_word, overwrite, api_choice, true);
            }
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify('SQS processing complete.'),
            };
        }
        
        else { // API Gateway Trigger
            const messageBody = JSON.parse(event.body);
            const overwrite = messageBody.overwrite || false;
            const api_choice = messageBody.api_choice || 'gemini';
            const objectKey = await ensureAudioFileExists(messageBody.korean_word, overwrite, api_choice, false);

            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: objectKey,
            });

            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ presignedUrl }),
            };
        }
    } catch (err) {
        console.error("Error processing event:", err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message || 'Error processing request.' }),
        };
    }
};