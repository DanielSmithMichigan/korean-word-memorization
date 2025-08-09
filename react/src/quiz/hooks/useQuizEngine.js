import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { fetchAllWordPairs, fetchAudio, postWordPairs } from '../actions/quizApi';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect } from '../utils/quizUtil';

const QUIZ_MODES = [
  { type: 'english-to-korean', weight: 3 },
  { type: 'korean-to-english', weight: 3 },
  { type: 'audio-to-english', weight: 3 },
  { type: 'bulk-korean-to-english', weight: 1 },
  { type: 'bulk-english-to-korean', weight: 1 },
];

const getWeightedRandomQuizMode = () => {
  const totalWeight = QUIZ_MODES.reduce((sum, mode) => sum + mode.weight, 0);
  let random = Math.random() * totalWeight;
  for (const mode of QUIZ_MODES) {
    random -= mode.weight;
    if (random <= 0) {
      return mode.type;
    }
  }
  return QUIZ_MODES[0].type; // fallback
};

export const useQuizEngine = ({
  userId,
  vocabulary: initialVocabulary,
  hardMode = false,
  activeWindowSize = 3,
  consecutiveSuccessesRequired = 5,
  graduatedWordRecurrenceRate = 0.05,
}) => {
  const location = useLocation();
  const [allWordPairs, setAllWordPairs] = useState(initialVocabulary || location.state?.words || []);
  const [favoritesPackage, setFavoritesPackage] = useState(null);
  const [wordStats, setWordStats] = useState({});
  const [loadingState, setLoadingState] = useState(initialVocabulary || location.state?.words ? 'loaded' : 'loading');
  
  const [activeWordPairs, setActiveWordPairs] = useState([]);
  const [graduatedWordPairs, setGraduatedWordPairs] = useState([]);
  const [pendingWordPairs, setPendingWordPairs] = useState([]);
  const [wordSuccessCounters, setWordSuccessCounters] = useState({});

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

  useEffect(() => {
    if (allWordPairs.length > 0) {
      const flattenedPairs = packages.flatMap((pkg, pkgIndex) =>
        pkg.wordPairs.map((pair, pairIndex) => ({
          ...pair,
          id: `${pkg.id}-${pairIndex}`,
          parentId: pkg.id,
          originalIndex: pairIndex,
          packageName: pkg.customIdentifier || `Package ${pkgIndex + 1}`
        }))
      );
      
      const initialActive = flattenedPairs.slice(0, activeWindowSize);
      const initialPending = flattenedPairs.slice(activeWindowSize);
      
      setActiveWordPairs(initialActive);
      setPendingWordPairs(initialPending);
      setGraduatedWordPairs([]);
      setWordSuccessCounters({});
    }
  }, [allWordPairs, activeWindowSize, packages]);

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
      fetchAllWordPairs(userId, { id: 'favorites' })
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

  const wordsWithProbability = useMemo(() => {
    const wordPairsForProbs = [...activeWordPairs];
    if (wordPairsForProbs.length === 0) return [];

    const defaultStats = {
      sessionAttempts: 0,
      sessionSuccesses: 0,
      recentSuccessRate: 0,
    };

    const temperature = 0.75;
    const maxSessionAttempts = Math.max(...wordPairsForProbs.map(w => (wordStats[w.korean] || defaultStats).sessionAttempts), 1);
    
    const successRates = wordPairsForProbs.map(w => (wordStats[w.korean] || defaultStats).recentSuccessRate);
    const minSuccessRate = Math.min(...successRates);
    const maxSuccessRate = Math.max(...successRates);
    const successRateRange = maxSuccessRate - minSuccessRate;

    const weightedWords = wordPairsForProbs.map(word => {
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
  }, [activeWordPairs, wordStats]);

  const displayWords = useMemo(() => {
    const active = wordsWithProbability.map(w => ({ ...w, status: 'Active' }));
    
    const defaultStats = {
      sessionAttempts: 0,
      sessionSuccesses: 0,
      recentSuccessRate: 0,
    };

    const addStats = (word) => {
        const stats = wordStats[word.korean] || defaultStats;
        return {
            ...word,
            attempts: stats.sessionAttempts,
            successes: stats.sessionSuccesses,
            recentSuccessRate: stats.recentSuccessRate,
        }
    }

    const graduated = graduatedWordPairs.map(addStats).map(w => ({ ...w, status: 'Graduated' }));
    const pending = pendingWordPairs.map(addStats).map(w => ({ ...w, status: 'Pending' }));
    
    const all = [...active, ...graduated, ...pending];

    return all.sort((a, b) => {
      if (a.english && b.english) {
        return a.english.localeCompare(b.english);
      }
      return 0;
    });
  }, [wordsWithProbability, graduatedWordPairs, pendingWordPairs, wordStats]);

  const selectWord = useCallback(() => {
    if (activeWordPairs.length === 0 && graduatedWordPairs.length === 0) {
      return;
    }
    
    setBulkQuizWords([]);

    // Graduated word recurrence logic (skipped if override is set above)
    if (graduatedWordPairs.length > 0 && Math.random() < graduatedWordRecurrenceRate) {
      const randomIndex = Math.floor(Math.random() * graduatedWordPairs.length);
      const graduatedWord = graduatedWordPairs[randomIndex];
      setCurrentWord({ ...graduatedWord, isGraduated: true }); // Mark as graduated
      return;
    }

    if (hardMode) {
      const randomMode = getWeightedRandomQuizMode();
      const hasUnseenActive = activeWordPairs.some(w => (wordStats[w.korean]?.sessionAttempts || 0) === 0);
      // Only allow bulk after each active word has been seen at least once in this session
      if (!hasUnseenActive && randomMode.startsWith('bulk-')) {
        setQuizMode(randomMode);
        const bulkWords = wordsWithProbability.slice(0, 5);
        setBulkQuizWords(bulkWords);
        setCurrentWord(null);
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

    if (activeWordPairs.length > 1 && wordHistoryRef.current.length === 4 && wordHistoryRef.current.every(w => w.korean === selectedWord.korean)) {
      let tempWord = selectedWord;
      let attempts = 0;
      while (tempWord.korean === selectedWord.korean && attempts < 10) {
        tempWord = pickRandomWord();
        attempts++;
      }
      
      if (tempWord.korean === selectedWord.korean) {
        const differentWord = wordsWithProbability.find(w => w.korean !== selectedWord.korean);
        if (differentWord) {
          tempWord = differentWord;
        }
      }
      selectedWord = tempWord;
    }

    // Determine single-question quiz mode with rules for first-exposure and dynamic bias
    if (hardMode) {
      const key = selectedWord.korean;
      const stats = wordStats[key] || { recentSuccessRate: 0, sessionAttempts: 0 };
      // First time we see a word in this session: force english-to-korean
      if ((stats.sessionAttempts || 0) === 0) {
        setQuizMode('english-to-korean');
      } else {
        const sr = Math.max(0, Math.min(1, stats.recentSuccessRate || 0));
        const baseWeights = [
          { type: 'english-to-korean', weight: 2 },
          { type: 'korean-to-english', weight: 2 },
          { type: 'audio-to-english', weight: 2 },
        ];
        // Increase E->K weight as success rate decreases. Range bonus ~ [0, 4].
        const e2kBonus = 4 * (1 - sr);
        const adjusted = baseWeights.map(w => ({ ...w }));
        adjusted.find(w => w.type === 'english-to-korean').weight += e2kBonus;
        const total = adjusted.reduce((s, m) => s + m.weight, 0);
        let r = Math.random() * total;
        let chosen = adjusted[0].type;
        for (const m of adjusted) {
          r -= m.weight;
          if (r <= 0) { chosen = m.type; break; }
        }
        setQuizMode(chosen);
      }
    }

    wordHistoryRef.current = [...wordHistoryRef.current, selectedWord].slice(-4);
    setCurrentWord({ ...selectedWord, isGraduated: false });

  }, [wordsWithProbability, hardMode, activeWordPairs.length, graduatedWordPairs, graduatedWordRecurrenceRate, wordStats, activeWordPairs, wordHistoryRef]);

  useEffect(() => {
    // If we have words, but no current word is selected (and not in bulk mode), select one.
    // This is primarily for selecting the very first word of the quiz session.
    if (wordsWithProbability.length > 0 && !currentWord && bulkQuizWords.length === 0) {
      selectWord();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsWithProbability]);

  const handleGuess = async ({ englishGuess, koreanGuess, wasFlipped }) => {
    let isCorrect, englishCorrect = false, koreanCorrect = false;

    if (hardMode && quizMode === 'audio-to-english') {
        englishCorrect = isEnglishAnswerCorrect(englishGuess, currentWord);
        koreanCorrect = isKoreanAnswerCorrect(koreanGuess, currentWord);
        isCorrect = englishCorrect && koreanCorrect;
    } else if (quizMode === 'korean-to-english' || quizMode === 'audio-to-english') {
      isCorrect = isEnglishAnswerCorrect(englishGuess, currentWord);
      englishCorrect = isCorrect;
      koreanCorrect = true; 
    } else { // 'english-to-korean'
      isCorrect = isKoreanAnswerCorrect(koreanGuess, currentWord);
      koreanCorrect = isCorrect;
      englishCorrect = true;
    }
    setAttemptCount(prev => prev + 1);
    
    const wasSuccessful = isCorrect && !wasFlipped;

    // If the word was a graduated word, we don't update its status.
    if (!currentWord.isGraduated) {
      const key = currentWord.korean;
      const currentSuccessCount = wordSuccessCounters[key] || 0;

      if (wasSuccessful) {
        const newSuccessCount = currentSuccessCount + 1;
        if (newSuccessCount >= consecutiveSuccessesRequired) {
          // Graduate the word
          setGraduatedWordPairs(prev => [...prev, currentWord]);
          setActiveWordPairs(prev => prev.filter(w => w.korean !== key));
          setWordSuccessCounters(prev => {
            const newCounters = {...prev};
            delete newCounters[key];
            return newCounters;
          });

          // Add a new word from pending if available
          if (pendingWordPairs.length > 0) {
            const [nextWord, ...remainingPending] = pendingWordPairs;
            setActiveWordPairs(prev => [...prev, nextWord]);
            setPendingWordPairs(remainingPending);
          }
        } else {
          // Increment success counter
          setWordSuccessCounters(prev => ({...prev, [key]: newSuccessCount}));
        }
      } else {
        // Reset success counter on failure
        setWordSuccessCounters(prev => ({...prev, [key]: 0}));
      }
    }

    setWordStats(prevStats => {
        const key = currentWord.korean;
        const currentStats = prevStats[key] || {
            sessionAttempts: 0,
            sessionSuccesses: 0,
            recentAttempts: [],
        };

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

    return { isCorrect, englishCorrect, koreanCorrect };
  };

  const handleBulkGuess = async (results) => {
    setAttemptCount(prev => prev + results.length);
    let correctInRound = 0;
  
    const graduatingWords = [];
    const graduatingKeys = new Set();
  
    // Use a temporary object to calculate the next state of success counters
    const nextWordSuccessCounters = { ...wordSuccessCounters };
  
    results.forEach(result => {
      const key = result.word.korean;
      if (result.isCorrect) {
        const newSuccessCount = (nextWordSuccessCounters[key] || 0) + 1;
        if (newSuccessCount >= consecutiveSuccessesRequired) {
          graduatingWords.push(result.word);
          graduatingKeys.add(key);
          delete nextWordSuccessCounters[key];
        } else {
          nextWordSuccessCounters[key] = newSuccessCount;
        }
      } else {
        nextWordSuccessCounters[key] = 0; // Reset on failure
      }
    });
  
    setWordSuccessCounters(nextWordSuccessCounters);
  
    if (graduatingWords.length > 0) {
      setGraduatedWordPairs(prev => [...prev, ...graduatingWords]);
      
      setActiveWordPairs(prevActive => {
        const remainingActive = prevActive.filter(w => !graduatingKeys.has(w.korean));
        
        setPendingWordPairs(prevPending => {
          const newWordCount = Math.min(graduatingWords.length, prevPending.length);
          const newWordsToAdd = prevPending.slice(0, newWordCount);
          
          // This state update depends on the result of the one above, which is fine
          // because React batches these updates.
          setActiveWordPairs([...remainingActive, ...newWordsToAdd]);
          // No forced next quiz; first exposure rule will handle quiz type when those words are selected
          return prevPending.slice(newWordCount);
        });

        // We return the initially calculated remaining active words.
        // The update with new words from pending will be handled in the next render cycle.
        return remainingActive;
      });
    }
  
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
  
        const recentSuccessRate = newRecentAttempts.length > 0
          ? newRecentAttempts.reduce((a, b) => a + b, 0) / newRecentAttempts.length
          : 0;
  
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

  const removeCurrentWordFromSession = useCallback(() => {
    if (!currentWord) return;
    const key = currentWord.korean;
    if (!currentWord.isGraduated) {
      setWordSuccessCounters(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      // Remove from active, and promote one from pending if available (atomically)
      const filteredActive = activeWordPairs.filter(w => w.korean !== key);
      if (pendingWordPairs.length > 0) {
        const [nextWord, ...rest] = pendingWordPairs;
        setActiveWordPairs([...filteredActive, nextWord]);
        setPendingWordPairs(rest);
      } else {
        setActiveWordPairs(filteredActive);
      }
    }
    setCurrentWord(null);
    // Rely on effect that selects a new word when there's no currentWord
  }, [currentWord, selectWord]);

  const forceGraduateCurrentWord = useCallback(() => {
    if (!currentWord || currentWord.isGraduated) return;
    const key = currentWord.korean;
    setGraduatedWordPairs(prev => [...prev, currentWord]);
    // Remove from active and promote one from pending to maintain window size (atomically)
    const filteredActive = activeWordPairs.filter(w => w.korean !== key);
    if (pendingWordPairs.length > 0) {
      const [nextWord, ...rest] = pendingWordPairs;
      setActiveWordPairs([...filteredActive, nextWord]);
      setPendingWordPairs(rest);
    } else {
      setActiveWordPairs(filteredActive);
    }
    setWordSuccessCounters(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setCurrentWord(null);
    // Rely on effect that selects a new word when there's no currentWord
  }, [currentWord, selectWord]);

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
    try {
      // Always fetch the latest favorites package
      const favs = await fetchAllWordPairs(userId, { id: 'favorites' });
      let currentFavoritesPackage = favs.length > 0 ? favs[0] : null;

      const wordToToggle = { korean: word.korean, english: word.english };
      let updatedPackage;

      if (currentFavoritesPackage) {
        const existingIndex = currentFavoritesPackage.wordPairs.findIndex(
          p => p.korean === word.korean && p.english === word.english
        );

        if (existingIndex > -1) {
          // Remove from favorites
          const newWordPairs = currentFavoritesPackage.wordPairs.filter((_, index) => index !== existingIndex);
          updatedPackage = { ...currentFavoritesPackage, wordPairs: newWordPairs };
        } else {
          // Add to favorites
          const newWordPairs = [...currentFavoritesPackage.wordPairs, wordToToggle];
          updatedPackage = { ...currentFavoritesPackage, wordPairs: newWordPairs };
        }
      } else {
        // Create new favorites package
        updatedPackage = {
          id: 'favorites',
          wordPairs: [wordToToggle],
          customIdentifier: 'favorites',
        };
      }

      const response = await postWordPairs(userId, updatedPackage);
      if (response.id) {
        setFavoritesPackage({ ...updatedPackage, id: response.id });
      } else {
        setFavoritesPackage(updatedPackage);
      }
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
    displayWords,
    wordSuccessCounters,
    removeCurrentWordFromSession,
    forceGraduateCurrentWord,
  };
};