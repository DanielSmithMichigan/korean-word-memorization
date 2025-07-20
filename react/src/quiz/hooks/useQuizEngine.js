import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAllWordPairs, processGuess, fetchAudio } from '../actions/quizApi';

export const useQuizEngine = (userId) => {
  const location = useLocation();
  const [allWordPairs, setAllWordPairs] = useState(location.state?.words || []);
  const [loadingState, setLoadingState] = useState(location.state?.words ? 'loaded' : 'loading');
  const [currentWord, setCurrentWord] = useState(null);
  const [sessionAttempts, setSessionAttempts] = useState({});
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [streakHistory, setStreakHistory] = useState([]);
  const [audioStore, setAudioStore] = useState({});
  const [useGoogleCloud, setUseGoogleCloud] = useState(true);

  // Fetch initial word pairs
  useEffect(() => {
    if (userId && !location.state?.words) {
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
    } else if (location.state?.words) {
      const words = location.state.words;
      setAllWordPairs(words);
      setLoadingState(words.length > 0 ? 'loaded' : 'no-words');
    }
  }, [userId, location.state]);

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
    const temperature = 0.75;
    const maxSessionAttempts = Math.max(...allWordPairs.map(w => sessionAttempts[w.id] || 0), 1);
    const successRates = allWordPairs.map(w => Math.min(w.recentSuccessRate || 0, 0.95));
    const minSuccessRate = Math.min(...successRates);
    const maxSuccessRate = Math.max(...successRates);
    const successRateRange = maxSuccessRate - minSuccessRate;

    const weightedWords = allWordPairs.map(word => {
      const normalizedSessionAttempts = (sessionAttempts[word.id] || 0) / maxSessionAttempts;
      const successRate = Math.min(word.recentSuccessRate || 0, 0.95);
      const normalizedSuccessRate = successRateRange > 0 ? (successRate - minSuccessRate) / successRateRange : (maxSuccessRate > 0 ? successRate / maxSuccessRate : 0);
      const score = 0.4 * normalizedSessionAttempts + 0.6 * (1 - normalizedSuccessRate);
      return { ...word, score };
    });

    const totalScore = weightedWords.reduce((sum, word) => sum + Math.exp(word.score / temperature), 0);
    return weightedWords.map(word => ({
      ...word,
      probability: Math.exp(word.score / temperature) / totalScore,
    })).sort((a, b) => b.probability - a.probability);
  }, [allWordPairs, sessionAttempts]);

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
    setSessionAttempts(prev => ({ ...prev, [currentWord.id]: (prev[currentWord.id] || 0) + 1 }));

    const guessForApi = wasFlipped ? `FLIPPED_ANSWER_PENALTY_${Date.now()}` : guess.trim();
    const guessData = {
      userId,
      id: currentWord.packageId || currentWord.id,
      koreanGuess: guessForApi,
      englishGuess: currentWord.english,
    };

    try {
      const result = await processGuess(guessData);
      if (result?.result) {
        const { attempts, successes, recentSuccessRate } = result.result;
        setAllWordPairs(prev =>
          prev.map(w =>
            w.english === currentWord.english && w.korean === currentWord.korean
              ? { ...w, attempts, successes, recentSuccessRate }
              : w
          )
        );
      }
    } catch (err) {
      console.error('Error submitting guess:', err);
      // Optionally handle API error state in the UI
    }

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
