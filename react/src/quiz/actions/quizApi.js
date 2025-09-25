import {
    GET_WORD_PAIRS_API_ENDPOINT,
    PROCESS_GUESS_API_ENDPOINT,
    TEXT_TO_SPEECH_API_ENDPOINT,
    WORD_UPLOADER_API_ENDPOINT,
    SENTENCE_QUIZ_API_ENDPOINT,
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

export const fetchAudio = async (word, useGoogleCloud, overwrite = false, language = 'ko') => {
    const response = await fetch(TEXT_TO_SPEECH_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ...(language === 'en' ? { english_word: word } : { korean_word: word }),
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

// ---- Sentence Quiz API: live backend with fallback to local storage mocks ----

const isLiveSentenceQuizApiConfigured = typeof SENTENCE_QUIZ_API_ENDPOINT === 'string' && !SENTENCE_QUIZ_API_ENDPOINT.includes('example.execute-api');

// Local storage fallback utils
const SENTENCE_QUIZ_STORAGE_KEY = 'sentence_quiz_packages';
const readSentenceQuizStorage = () => {
  try { const raw = localStorage.getItem(SENTENCE_QUIZ_STORAGE_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
};
const writeSentenceQuizStorage = (items) => { try { localStorage.setItem(SENTENCE_QUIZ_STORAGE_KEY, JSON.stringify(items)); } catch {}
};

export const listSentenceQuizPackages = async (userId) => {
  if (isLiveSentenceQuizApiConfigured) {
    const url = new URL(SENTENCE_QUIZ_API_ENDPOINT);
    url.searchParams.append('userId', userId);
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('Failed to list sentence quiz packages');
    return res.json();
  }
  const all = readSentenceQuizStorage();
  return all.filter((q) => q.userId === userId);
};

export const getSentenceQuizById = async (userId, id) => {
  if (isLiveSentenceQuizApiConfigured) {
    const url = new URL(SENTENCE_QUIZ_API_ENDPOINT);
    url.searchParams.append('userId', userId);
    url.searchParams.append('id', id);
    const res = await fetch(url.toString(), { method: 'GET' });
    if (!res.ok) throw new Error('Failed to fetch sentence quiz');
    return res.json();
  }
  const all = readSentenceQuizStorage();
  return all.find((q) => q.userId === userId && q.id === id) || null;
};

export const generateSentenceQuizPackage = async ({ userId, requiredWords, activeVocabulary, packagesUsed, onProgress }) => {
  if (isLiveSentenceQuizApiConfigured) {
    // New iterative flow: call lambda once per required word, sending the in-progress package
    let currentPackage = null;
    const total = (requiredWords || []).length;

    for (let index = 0; index < total; index++) {
      const requiredWord = requiredWords[index];
      const res = await fetch(SENTENCE_QUIZ_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          requiredWord,
          activeVocabulary,
          packagesUsed,
          existingPackage: currentPackage,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate sentence quiz');
      currentPackage = await res.json();
      if (typeof onProgress === 'function') {
        onProgress((index + 1) / total);
      }
    }
    return currentPackage;
  }

  // Fallback: create a minimal local package
  let progressCount = 0;
  const total = (requiredWords || []).length || 1;
  const now = new Date().toISOString();
  let pkg = {
    userId,
    id: `sq-${Date.now()}`,
    quizzes: [],
    vocabulary: [],
    createdAt: now,
    updatedAt: now,
    packagesUsed: packagesUsed || [],
    pinned: false,
    customIdentifier: now,
  };
  for (const w of requiredWords || []) {
    pkg.quizzes.push({ english: `${w.english}.`, korean: `${w.korean}.` });
    pkg.vocabulary = activeVocabulary || [];
    progressCount += 1;
    if (typeof onProgress === 'function') onProgress(progressCount / total);
  }
  const all = readSentenceQuizStorage();
  all.unshift(pkg);
  writeSentenceQuizStorage(all);
  if (typeof onProgress === 'function') onProgress(1);
  return pkg;
};
