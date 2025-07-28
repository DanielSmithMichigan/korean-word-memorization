import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAllWordPairs, fetchAudio } from '../actions/quizApi';

export const useQuizEngine = ({ userId, vocabulary: initialVocabulary, hardMode = false }) => {
  const location = useLocation();
  const [allWordPairs, setAllWordPairs] = useState(initialVocabulary || location.state?.words || []);
  const [wordStats, setWordStats] = useState({});
  const [loadingState, setLoadingState] = useState(initialVocabulary || location.state?.words ? 'loaded' : 'loading');
  const [currentWord, setCurrentWord] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [streakHistory, setStreakHistory] = useState([]);
  const [audioStore, setAudioStore] = useState({});
  const [useGoogleCloud, setUseGoogleCloud] = useState(true);
  const [quizMode, setQuizMode] = useState('english-to-korean');
  const wordHistoryRef = useRef([]);
  
  const audioPromises = useRef({});
  const audioStoreRef = useRef(audioStore);
  useEffect(() => {
    audioStoreRef.current = audioStore;
  }, [audioStore]);

  const useGoogleCloudRef = useRef(useGoogleCloud);
  useEffect(() => {
    useGoogleCloudRef.current = useGoogleCloud;
  }, [useGoogleCloud]);

  // Fetch initial word pairs
  useEffect(() => {
    if (initialVocabulary) {
      setAllWordPairs(initialVocabulary);
      setLoadingState(initialVocabulary.length > 0 ? 'loaded' : 'no-words');
    } else if (location.state?.words) {
      const words = location.state.words;
      setAllWordPairs(words);
      setLoadingState(words.length > 0 ? 'loaded' : 'no-words');
    } else if (userId) {
      setLoadingState('loading');
      fetchAllWordPairs(userId)
        .then(pairs => {
          setAllWordPairs(pairs);
          setLoadingState(pairs.length > 0 ? 'loaded' : 'no-words');
        })
        .catch(error => {
          console.error('Error fetching word pairs:', error);
          setLoadingState('error');
        });
    }
  }, [userId, initialVocabulary, location.state]);

  const ensureAudioFetched = useCallback(async (koreanWord, overwrite = false) => {
    const audio = audioStoreRef.current[koreanWord];

    if (audio?.status === 'loaded' && !overwrite) {
        return audio.url;
    }

    if (audioPromises.current[koreanWord] && !overwrite) {
        return audioPromises.current[koreanWord];
    }

    setAudioStore(prev => ({ ...prev, [koreanWord]: { status: 'loading', url: null } }));
    const fetchPromise = fetchAudio(koreanWord, useGoogleCloudRef.current, overwrite)
        .then(audioUrl => {
            setAudioStore(prev => ({ ...prev, [koreanWord]: { status: 'loaded', url: audioUrl } }));
            delete audioPromises.current[koreanWord];
            return audioUrl;
        })
        .catch(error => {
            console.error(`Error fetching audio for ${koreanWord}:`, error);
            setAudioStore(prev => ({ ...prev, [koreanWord]: { status: 'error', url: null } }));
            delete audioPromises.current[koreanWord];
            throw error;
        });

    audioPromises.current[koreanWord] = fetchPromise;
    return fetchPromise;
  }, []);

  // Pre-fetch all audio
  useEffect(() => {
    const prefetchAllAudio = () => {
      allWordPairs.forEach(wordPair => {
        ensureAudioFetched(wordPair.korean);
      });
    };

    if (allWordPairs.length > 0) {
      prefetchAllAudio();
    }
  }, [allWordPairs, ensureAudioFetched]);

  const wordsWithProbability = useMemo(() => {
    if (allWordPairs.length === 0) return [];

    const defaultStats = {
      sessionAttempts: 0,
      sessionSuccesses: 0,
      recentSuccessRate: 0,
    };

    const temperature = 0.75;
    const maxSessionAttempts = Math.max(...allWordPairs.map(w => (wordStats[w.korean] || defaultStats).sessionAttempts), 1);
    
    const successRates = allWordPairs.map(w => (wordStats[w.korean] || defaultStats).recentSuccessRate);
    const minSuccessRate = Math.min(...successRates);
    const maxSuccessRate = Math.max(...successRates);
    const successRateRange = maxSuccessRate - minSuccessRate;

    const weightedWords = allWordPairs.map(word => {
      const stats = wordStats[word.korean] || defaultStats;
      const normalizedSessionAttempts = stats.sessionAttempts / maxSessionAttempts;
      const successRate = Math.min(stats.recentSuccessRate, 0.95);
      const normalizedSuccessRate = successRateRange > 0 ? (successRate - minSuccessRate) / successRateRange : (maxSuccessRate > 0 ? successRate / maxSuccessRate : 0);
      const score = 0.4 * normalizedSessionAttempts + 0.6 * (1 - normalizedSuccessRate);
      
      return {
          ...word,
          score,
          attempts: stats.sessionAttempts,
          successes: stats.sessionSuccesses,
          recentSuccessRate: stats.recentSuccessRate,
      };
    });

    const totalScore = weightedWords.reduce((sum, word) => sum + Math.exp(word.score / temperature), 0);
    return weightedWords.map(word => ({
      ...word,
      probability: Math.exp(word.score / temperature) / totalScore,
    })).sort((a, b) => b.probability - a.probability);
  }, [allWordPairs, wordStats]);

  const selectWord = useCallback(() => {
    if (wordsWithProbability.length === 0) {
      return;
    }

    const pickRandomWord = () => {
      let random = Math.random();
      let selected = null;
      for (const word of wordsWithProbability) {
        random -= word.probability;
        if (random <= 0) {
          selected = word;
          break;
        }
      }
      return selected || wordsWithProbability[wordsWithProbability.length - 1];
    };

    let selectedWord = pickRandomWord();

    if (allWordPairs.length > 1 && wordHistoryRef.current.length === 4 && wordHistoryRef.current.every(w => w.korean === selectedWord.korean)) {
      let tempWord = selectedWord;
      let attempts = 0;
      // Try to get a different word
      while (tempWord.korean === selectedWord.korean && attempts < 10) {
        tempWord = pickRandomWord();
        attempts++;
      }
      
      // If we still got the same word, find the first different word and use it.
      if (tempWord.korean === selectedWord.korean) {
        const differentWord = wordsWithProbability.find(w => w.korean !== selectedWord.korean);
        if (differentWord) {
          tempWord = differentWord;
        }
      }
      selectedWord = tempWord;
    }

    wordHistoryRef.current = [...wordHistoryRef.current, selectedWord].slice(-4);
    setCurrentWord(selectedWord);

    if (hardMode) {
      const modes = ['english-to-korean', 'korean-to-english', 'audio-to-english'];
      const randomMode = modes[Math.floor(Math.random() * modes.length)];
      setQuizMode(randomMode);
    } else {
      setQuizMode('english-to-korean');
    }
  }, [wordsWithProbability, hardMode, allWordPairs.length]);

  useEffect(() => {
    if (wordsWithProbability.length > 0 && !currentWord) {
      selectWord();
    }
  }, [wordsWithProbability, currentWord, selectWord]);

  const handleGuess = async ({ englishGuess, koreanGuess, wasFlipped }) => {
    let isCorrect;
    const englishAnswers = currentWord.english.split(',').map(w => w.trim().toLowerCase());
    const koreanAnswer = currentWord.korean.trim().toLowerCase();

    const submittedEnglishGuess = englishGuess.trim().toLowerCase();

    if (hardMode && quizMode === 'audio-to-english') {
        isCorrect = englishAnswers.includes(submittedEnglishGuess) &&
                    koreanGuess.trim().toLowerCase() === koreanAnswer;
    } else if (quizMode === 'korean-to-english' || quizMode === 'audio-to-english') {
      isCorrect = englishAnswers.includes(submittedEnglishGuess);
    } else { // 'english-to-korean'
      isCorrect = koreanGuess.trim().toLowerCase() === koreanAnswer;
    }
    setAttemptCount(prev => prev + 1);
    
    setWordStats(prevStats => {
        const key = currentWord.korean;
        const currentStats = prevStats[key] || {
            sessionAttempts: 0,
            sessionSuccesses: 0,
            recentAttempts: [],
        };

        const wasSuccessful = isCorrect && !wasFlipped;

        const newRecentAttempts = [...currentStats.recentAttempts, (wasSuccessful ? 1 : 0)];
        if (newRecentAttempts.length > 10) {
            newRecentAttempts.shift();
        }
        
        const recentSuccessRate = newRecentAttempts.length > 0 ? newRecentAttempts.reduce((a, b) => a + b, 0) / newRecentAttempts.length : 0;

        return {
            ...prevStats,
            [key]: {
                sessionAttempts: currentStats.sessionAttempts + 1,
                sessionSuccesses: currentStats.sessionSuccesses + (wasSuccessful ? 1 : 0),
                recentAttempts: newRecentAttempts,
                recentSuccessRate,
            }
        };
    });

    if (isCorrect) {
      if (!wasFlipped) {
        setCorrectCount(c => c + 1);
        setStreakHistory(prev => [...prev, true].slice(-10));
      } else {
        setStreakHistory(prev => [...prev, false].slice(-10));
      }
    } else {
      setStreakHistory(prev => [...prev, false].slice(-10));
    }

    return isCorrect;
  };

  const handlePlayAudio = async (koreanWord, overwrite = false) => {
    try {
        const url = await ensureAudioFetched(koreanWord, overwrite);
        if (url) {
            new Audio(url).play();
        }
        return 'loaded';
    } catch (error) {
        return 'error';
    }
  };

  return {
    loadingState,
    allWordPairs,
    currentWord,
    wordsWithProbability,
    correctCount,
    attemptCount,
    streakHistory,
    audioStore,
    useGoogleCloud,
    setUseGoogleCloud,
    selectWord,
    handleGuess,
    handlePlayAudio,
    quizMode,
  };
};
