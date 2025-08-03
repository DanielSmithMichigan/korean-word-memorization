import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAllWordPairs, fetchAudio, postWordPairs } from '../actions/quizApi';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect } from '../utils/quizUtil';

export const useQuizEngine = ({ userId, vocabulary: initialVocabulary, hardMode = false }) => {
  const location = useLocation();
  const [allWordPairs, setAllWordPairs] = useState(initialVocabulary || location.state?.words || []);
  const [favoritesPackage, setFavoritesPackage] = useState(null);
  const [wordStats, setWordStats] = useState({});
  const [loadingState, setLoadingState] = useState(initialVocabulary || location.state?.words ? 'loaded' : 'loading');
  const [currentWord, setCurrentWord] = useState(null);
  const [bulkQuizWords, setBulkQuizWords] = useState([]);
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

  // Fetch initial word pairs and favorites
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
      // Fetch all word pairs
      fetchAllWordPairs(userId)
        .then(pairs => {
          setAllWordPairs(pairs);
          setLoadingState(pairs.length > 0 ? 'loaded' : 'no-words');
        })
        .catch(error => {
          console.error('Error fetching word pairs:', error);
          setLoadingState('error');
        });
      
      // Fetch favorites
      fetchAllWordPairs(userId, 'favorites')
        .then(favs => {
          if (favs.length > 0) {
            setFavoritesPackage(favs[0]);
          }
        })
        .catch(error => console.error('Error fetching favorites:', error));
    } else if (initialVocabulary) {
      setAllWordPairs(initialVocabulary);
      setLoadingState(initialVocabulary.length > 0 ? 'loaded' : 'no-words');
    } else if (location.state?.words) {
      const words = location.state.words;
      setAllWordPairs(words);
      setLoadingState(words.length > 0 ? 'loaded' : 'no-words');
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
        if (wordPair.korean) {
          ensureAudioFetched(wordPair.korean);
        }
      });
    };

    if (allWordPairs.length > 0) {
      prefetchAllAudio();
    }
  }, [allWordPairs, ensureAudioFetched]);

  const packages = useMemo(() => {
    if (!allWordPairs.length) return [];
    // if items already look like { wordPairs: [...] }, use them directly
    if (allWordPairs[0].wordPairs) return allWordPairs;
    // otherwise wrap the flat list in a single package
    return [{
      id: 'initial-vocab',
      customIdentifier: 'initial',
      wordPairs: allWordPairs
    }];
  }, [allWordPairs]);

  const wordsWithProbability = useMemo(() => {
    // use `packages` in place of `allWordPairs`
    const flattenedPairs = packages.flatMap((pkg, pkgIndex) =>
      pkg.wordPairs.map((pair, pairIndex) => ({
        ...pair,
        id: `${pkg.id}-${pairIndex}`,
        parentId: pkg.id,
        originalIndex: pairIndex,
        packageName: pkg.customIdentifier || `Package ${pkgIndex + 1}`
      }))
    );
    
    if (allWordPairs.length === 0) return [];

    const defaultStats = {
      sessionAttempts: 0,
      sessionSuccesses: 0,
      recentSuccessRate: 0,
    };

    const temperature = 0.75;
    const maxSessionAttempts = Math.max(...flattenedPairs.map(w => (wordStats[w.korean] || defaultStats).sessionAttempts), 1);
    
    const successRates = flattenedPairs.map(w => (wordStats[w.korean] || defaultStats).recentSuccessRate);
    const minSuccessRate = Math.min(...successRates);
    const maxSuccessRate = Math.max(...successRates);
    const successRateRange = maxSuccessRate - minSuccessRate;

    const weightedWords = flattenedPairs.map(word => {
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
  }, [packages, wordStats]);

  const selectWord = useCallback(() => {
    if (wordsWithProbability.length === 0) {
      return;
    }
    
    setBulkQuizWords([]); // Reset bulk words

    if (hardMode) {
      const modes = ['english-to-korean', 'korean-to-english', 'audio-to-english', 'bulk-korean-to-english', 'bulk-english-to-korean'];
      const randomMode = modes[Math.floor(Math.random() * modes.length)];
      setQuizMode(randomMode);

      if (randomMode.startsWith('bulk-')) {
        const bulkWords = wordsWithProbability.slice(0, 5);
        setBulkQuizWords(bulkWords);
        setCurrentWord(null); // No single current word in bulk mode
        return;
      }
    } else {
      setQuizMode('english-to-korean');
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

  }, [wordsWithProbability, hardMode, allWordPairs.length]);

  useEffect(() => {
    // If we have words, but no current word is selected (and not in bulk mode), select one.
    // This is primarily for selecting the very first word of the quiz session.
    if (wordsWithProbability.length > 0 && !currentWord && bulkQuizWords.length === 0) {
      selectWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsWithProbability]);

  const handleGuess = async ({ englishGuess, koreanGuess, wasFlipped }) => {
    let isCorrect;

    if (hardMode && quizMode === 'audio-to-english') {
        isCorrect = isEnglishAnswerCorrect(englishGuess, currentWord) &&
                    isKoreanAnswerCorrect(koreanGuess, currentWord);
    } else if (quizMode === 'korean-to-english' || quizMode === 'audio-to-english') {
      isCorrect = isEnglishAnswerCorrect(englishGuess, currentWord);
    } else { // 'english-to-korean'
      isCorrect = isKoreanAnswerCorrect(koreanGuess, currentWord);
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

  const handleBulkGuess = async (results) => {
    setAttemptCount(prev => prev + results.length);
    let correctInRound = 0;

    setWordStats(prevStats => {
      const newStats = { ...prevStats };
      results.forEach(result => {
        const key = result.word.korean;
        const currentStats = newStats[key] || {
          sessionAttempts: 0,
          sessionSuccesses: 0,
          recentAttempts: [],
        };

        const wasSuccessful = result.isCorrect;
        if (wasSuccessful) correctInRound++;

        const newRecentAttempts = [...currentStats.recentAttempts, (wasSuccessful ? 1 : 0)];
        if (newRecentAttempts.length > 10) {
            newRecentAttempts.shift();
        }
        
        const recentSuccessRate = newRecentAttempts.length > 0 ? newRecentAttempts.reduce((a, b) => a + b, 0) / newRecentAttempts.length : 0;

        newStats[key] = {
          sessionAttempts: currentStats.sessionAttempts + 1,
          sessionSuccesses: currentStats.sessionSuccesses + (wasSuccessful ? 1 : 0),
          recentAttempts: newRecentAttempts,
          recentSuccessRate,
        };
      });
      return newStats;
    });

    setCorrectCount(c => c + correctInRound);
    const newStreakHistory = results.map(r => r.isCorrect);
    setStreakHistory(prev => [...prev, ...newStreakHistory].slice(-10));
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

  const toggleFavorite = async (word) => {
    let updatedPackage;
    const wordToToggle = { korean: word.korean, english: word.english };

    if (favoritesPackage) {
      const existingIndex = favoritesPackage.wordPairs.findIndex(
        p => p.korean === word.korean && p.english === word.english
      );

      if (existingIndex > -1) {
        // Remove from favorites
        const newWordPairs = favoritesPackage.wordPairs.filter((_, index) => index !== existingIndex);
        updatedPackage = { ...favoritesPackage, wordPairs: newWordPairs };
      } else {
        // Add to favorites
        const newWordPairs = [...favoritesPackage.wordPairs, wordToToggle];
        updatedPackage = { ...favoritesPackage, wordPairs: newWordPairs };
      }
    } else {
      // Create new favorites package
      updatedPackage = {
        wordPairs: [wordToToggle],
        customIdentifier: 'favorites',
      };
    }

    try {
      await postWordPairs(userId, updatedPackage);
      setFavoritesPackage(updatedPackage);
    } catch (error) {
      console.error('Error updating favorites:', error);
      // Optionally revert state or show an error to the user
    }
  };

  const updateWordPackages = (updatedPackages, newWord) => {
    const updatedPackagesMap = new Map(updatedPackages.map(p => [p.id, p]));
    
    setAllWordPairs(currentPackages =>
      currentPackages.map(p => updatedPackagesMap.get(p.id) || p)
    );
    
    if (currentWord && currentWord.id === newWord.id) {
      const newWordWithPackageInfo = {
        ...newWord,
        id: currentWord.id,
        parentId: currentWord.parentId,
        originalIndex: currentWord.originalIndex,
        packageName: currentWord.packageName,
      };
      setCurrentWord(newWordWithPackageInfo);
    }
  };

  return {
    loadingState,
    allWordPairs,
    currentWord,
    bulkQuizWords,
    wordsWithProbability,
    correctCount,
    attemptCount,
    streakHistory,
    audioStore,
    useGoogleCloud,
    setUseGoogleCloud,
    selectWord,
    handleGuess,
    handleBulkGuess,
    handlePlayAudio,
    quizMode,
    favoritesPackage,
    toggleFavorite,
    updateWordPackages,
  };
};

