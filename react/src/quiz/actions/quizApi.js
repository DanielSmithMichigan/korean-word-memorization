import {
    GET_WORD_PAIRS_API_ENDPOINT,
    PROCESS_GUESS_API_ENDPOINT,
    TEXT_TO_SPEECH_API_ENDPOINT,
    WORD_UPLOADER_API_ENDPOINT
} from '../../api/endpoints';

export const fetchAllWordPairs = async (userId, { customIdentifier, id } = {}) => {
  let allItems = [];
  let lastEvaluatedKey = null;
  
  do {
    const url = new URL(GET_WORD_PAIRS_API_ENDPOINT);
    url.searchParams.append('userId', userId);
    if (lastEvaluatedKey) {
      url.searchParams.append('lastEvaluatedKey', btoa(JSON.stringify(lastEvaluatedKey)));
    }
    if (customIdentifier) {
      url.searchParams.append('customIdentifier', customIdentifier);
    }
    if (id) {
      url.searchParams.append('id', id);
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch word pairs');
    }
    
    const data = await response.json();
    if (data.Items) {
      allItems = allItems.concat(data.Items);
    }
    lastEvaluatedKey = data.LastEvaluatedKey;
  } while (lastEvaluatedKey && !customIdentifier && !id); // Do not paginate if filtering for a specific item

  return allItems;
};

export const postWordPairs = async (userId, wordPackage) => {
  const url = new URL(WORD_UPLOADER_API_ENDPOINT);
  url.searchParams.append('userId', userId);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(wordPackage),
  });

  if (!response.ok) {
    throw new Error('Failed to post word pairs');
  }

  return response.json();
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
