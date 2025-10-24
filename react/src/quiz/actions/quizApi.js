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

export const generateSentenceQuizPackage = async ({ userId, requiredWords, activeVocabulary, packagesUsed, primaryPracticeGoal, mode = 'translateEnglishToKorean', sentencesPerPrompt = 5, promptsPerRequiredWord = 5, onProgress }) => {
  const safeSentences = Math.max(1, Math.min(10, Number(sentencesPerPrompt) || 5));
  const safePrompts = Math.max(1, Math.min(10, Number(promptsPerRequiredWord) || 5));
  if (isLiveSentenceQuizApiConfigured) {
    const paragraphs = [];
    const totalCalls = (requiredWords?.length || 0) * safePrompts;
    let completed = 0;

    for (let i = 0; i < (requiredWords || []).length; i++) {
      const requiredWord = requiredWords[i];
      for (let j = 0; j < safePrompts; j++) {
        const res = await fetch(SENTENCE_QUIZ_API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op: 'generateParagraph',
            userId,
            requiredWord,
            activeVocabulary,
            primaryPracticeGoal,
            sentencesPerPrompt: safeSentences,
          }),
        });
        if (!res.ok) throw new Error('Failed to generate paragraph');
        const data = await res.json();
        // data: { paragraph }
        paragraphs.push(data.paragraph);
        completed += 1;
        if (typeof onProgress === 'function' && totalCalls > 0) {
          onProgress(completed / totalCalls);
        }
      }
    }

    // Each paragraph becomes a single quiz item (paragraph has safeSentences sentences inside)
    const quizzes = paragraphs.map(p => ({ korean: p }));

    // Extract vocabulary once from all paragraphs
    const vocabRes = await fetch(SENTENCE_QUIZ_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'extractVocabulary',
        userId,
        paragraphs,
        activeVocabulary,
      }),
    });
    if (!vocabRes.ok) throw new Error('Failed to extract vocabulary');
    const { vocabulary = [] } = await vocabRes.json();

    // Store package
    const finalizeRes = await fetch(SENTENCE_QUIZ_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'storePackage',
        userId,
        quizzes,
        vocabulary,
        packagesUsed,
        customIdentifier: new Date().toISOString(),
        mode,
        sentencesPerPrompt: safeSentences,
      }),
    });
    if (!finalizeRes.ok) throw new Error('Failed to store sentence quiz');
    const pkg = await finalizeRes.json();
    if (typeof onProgress === 'function') onProgress(1);
    return pkg;
  }

  // Fallback: local mock
  const totalCalls = (requiredWords?.length || 0) * safePrompts;
  let completed = 0;
  const now = new Date().toISOString();
  const quizzes = [];
  for (const w of requiredWords || []) {
    for (let j = 0; j < safePrompts; j++) {
      for (let s = 0; s < safeSentences; s++) {
        quizzes.push({ korean: `${w.korean} (${j + 1}/${safePrompts})` });
      }
      completed += 1;
      if (typeof onProgress === 'function' && totalCalls > 0) onProgress(completed / totalCalls);
    }
  }
  const pkg = {
    userId,
    id: `sq-${Date.now()}`,
    quizzes,
    vocabulary: activeVocabulary || [],
    createdAt: now,
    updatedAt: now,
    packagesUsed: packagesUsed || [],
    pinned: false,
    customIdentifier: now,
    mode,
    sentencesPerPrompt: safeSentences,
  };
  const all = readSentenceQuizStorage();
  all.unshift(pkg);
  writeSentenceQuizStorage(all);
  if (typeof onProgress === 'function') onProgress(1);
  return pkg;
};

export const askSentenceFeedback = async ({ userId, userSentence, correctSentence, englishSentence }) => {
  const url = `${SENTENCE_QUIZ_API_ENDPOINT}feedback`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, userSentence, correctSentence, englishSentence }),
  });
  if (!res.ok) {
    throw new Error('Failed to get sentence feedback');
  }
  return res.json();
};

export const gradeSummaryFeedback = async ({ userId, koreanText, userSummaryEnglish, referenceEnglish }) => {
  const url = `${SENTENCE_QUIZ_API_ENDPOINT}feedback`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, mode: 'summarizeWrittenKoreanToEnglish', koreanText, userSummaryEnglish, referenceEnglish }),
  });
  if (!res.ok) {
    throw new Error('Failed to grade summary');
  }
  return res.json();
};
