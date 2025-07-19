const GET_WORD_PAIRS_API_ENDPOINT = 'https://jygcfrju3b.execute-api.us-east-1.amazonaws.com/prod/';
const PROCESS_GUESS_API_ENDPOINT = 'https://2ifsj48vm8.execute-api.us-east-1.amazonaws.com/prod/';
const TEXT_TO_SPEECH_API_ENDPOINT = 'https://dratlusk5a.execute-api.us-east-1.amazonaws.com/prod/';

export const fetchAllWordPairs = async (userId) => {
  let pairs = [];
  let lastEvaluatedKey = null;
  do {
    const url = new URL(GET_WORD_PAIRS_API_ENDPOINT);
    url.searchParams.append('userId', userId);
    if (lastEvaluatedKey) {
      url.searchParams.append('lastEvaluatedKey', lastEvaluatedKey);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch word pairs');
    }
    const data = await response.json();
    pairs = pairs.concat(data.wordPairs);
    lastEvaluatedKey = data.lastEvaluatedKey;
  } while (lastEvaluatedKey);
  return pairs;
};

export const processGuess = async (guessData) => {
  const response = await fetch(PROCESS_GUESS_API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(guessData),
  });
  if (!response.ok) {
    throw new Error('Failed to process guess');
  }
  return response.json();
};

export const fetchAudio = async (koreanWord, useGoogleCloud, overwrite = false) => {
    const response = await fetch(TEXT_TO_SPEECH_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            korean_word: koreanWord,
            overwrite,
            api_choice: useGoogleCloud ? 'gctts' : 'gemini'
        }),
    });
    if (!response.ok) {
        throw new Error(`Network response was not ok (${response.status})`);
    }
    const data = await response.json();
    if (!data.presignedUrl) {
        throw new Error('No presigned URL in response');
    }
    const audioBlobResponse = await fetch(data.presignedUrl);
    if (!audioBlobResponse.ok) {
        throw new Error('Failed to fetch audio from presigned URL');
    }
    const blob = await audioBlobResponse.blob();
    return URL.createObjectURL(blob);
};
