import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAllWordPairs, fetchAudio } from '../actions/quizApi';

export const useQuizEngine = ({ userId, vocabulary: initialVocabulary }) => {
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

  // Pre-fetch all audio
  useEffect(() => {
    const prefetchAllAudio = async () => {
      const promises = allWordPairs.map(async (wordPair) => {
        if (!audioStore[wordPair.korean] || audioStore[wordPair.korean]?.status === 'error') {
          setAudioStore(prev => ({ ...prev, [wordPair.korean]: { status: 'loading', url: null } }));
          try {
            const audioUrl = await fetchAudio(wordPair.korean, useGoogleCloud);
            setAudioStore(prev => ({ ...prev, [wordPair.korean]: { status: 'loaded', url: audioUrl } }));
          } catch (error) {
            console.error(`Error pre-fetching audio for ${wordPair.korean}:`, error);
            setAudioStore(prev => ({ ...prev, [wordPair.korean]: { status: 'error', url: null } }));
          }
        }
      });
      await Promise.all(promises);
    };

    if (allWordPairs.length > 0) {
      prefetchAllAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allWordPairs]);

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
    let random = Math.random();
    let selectedWord = null;
    for (const word of wordsWithProbability) {
      random -= word.probability;
      if (random <= 0) {
        selectedWord = word;
        break;
      }
    }
    if (!selectedWord) {
      selectedWord = wordsWithProbability[wordsWithProbability.length - 1];
    }
    setCurrentWord(selectedWord);
  }, [wordsWithProbability]);

  useEffect(() => {
    if (wordsWithProbability.length > 0 && !currentWord) {
      selectWord();
    }
  }, [wordsWithProbability, currentWord, selectWord]);

  const handleGuess = async ({ guess, wasFlipped }) => {
    const isCorrect = guess.trim().toLowerCase() === currentWord.korean.trim().toLowerCase();
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
    const audio = audioStore[koreanWord];
    if (!overwrite && audio && audio.status === 'loaded') {
      new Audio(audio.url).play();
      return null; // Return null to indicate no loading state change
    }
    if (audio?.status === 'loading' && !overwrite) return null;

    setAudioStore(prev => ({ ...prev, [koreanWord]: { status: 'loading', url: null } }));
    try {
      const audioUrl = await fetchAudio(koreanWord, useGoogleCloud, overwrite);
      setAudioStore(prev => ({ ...prev, [koreanWord]: { status: 'loaded', url: audioUrl } }));
      new Audio(audioUrl).play();
      return 'loaded';
    } catch (error) {
      console.error(`Error fetching audio (overwrite: ${overwrite}):`, error);
      setAudioStore(prev => ({ ...prev, [koreanWord]: { status: 'error', url: null } }));
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
  };
};


