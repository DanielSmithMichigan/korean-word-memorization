import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const GET_WORD_PAIRS_API_ENDPOINT = 'https://jygcfrju3b.execute-api.us-east-1.amazonaws.com/prod/';
const PROCESS_GUESS_API_ENDPOINT = 'https://2ifsj48vm8.execute-api.us-east-1.amazonaws.com/prod/';

function Quiz({ userId, onQuizFocus }) {
  const location = useLocation();
  const submitButtonRef = useRef(null);
  const inputRef = useRef(null); // Add a ref for the input element
  const [allWordPairs, setAllWordPairs] = useState(location.state?.words || []);
  const [currentWord, setCurrentWord] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [loadingState, setLoadingState] = useState(location.state?.words ? 'loaded' : 'loading');
  const [wordWithWeight, setWordWithWeight] = useState(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);
  const [hasGuessedWrongOnce, setHasGuessedWrongOnce] = useState(false);
  const [sessionAttempts, setSessionAttempts] = useState({});
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [wasFlipped, setWasFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Start of copy-pasting the existing logic ---

  const fetchAllWordPairs = async () => {
    setLoadingState('loading');
    let pairs = [];
    let lastEvaluatedKey = null;
    try {
      do {
        const url = new URL(GET_WORD_PAIRS_API_ENDPOINT);
        url.searchParams.append('userId', userId);
        if (lastEvaluatedKey) {
          url.searchParams.append('lastEvaluatedKey', lastEvaluatedKey);
        }
        const response = await fetch(url);
        const data = await response.json();
        pairs = pairs.concat(data.wordPairs);
        lastEvaluatedKey = data.lastEvaluatedKey;
      } while (lastEvaluatedKey);
      setAllWordPairs(pairs);
      if (pairs.length === 0) {
        setLoadingState('no-words');
      } else {
        setLoadingState('loaded');
      }
    } catch (error) {
      console.error('Error fetching word pairs:', error);
      setLoadingState('error');
    }
  };

  useEffect(() => {
    if (userId && !location.state?.words) {
      fetchAllWordPairs();
    } else if (location.state?.words) {
      setAllWordPairs(location.state.words);
      if (location.state.words.length === 0) {
        setLoadingState('no-words');
      } else {
        setLoadingState('loaded');
      }
    }
  }, [userId, location.state]);

  const wordsWithProbability = useMemo(() => {
    if (allWordPairs.length === 0) {
      return [];
    }
    const temperature = 0.75;

    // Lifetime attempts normalization
    const maxLifetimeAttempts = Math.max(...allWordPairs.map(w => w.attempts || 0), 1);

    // Session attempts normalization
    const sessionAttemptCounts = allWordPairs.map(w => sessionAttempts[w.id] || 0);
    const maxSessionAttempts = Math.max(...sessionAttemptCounts, 1);

    // Success rate normalization
    const successRates = allWordPairs.map(w => w.recentSuccessRate || 0);
    const minSuccessRate = Math.min(...successRates);
    const maxSuccessRate = Math.max(...successRates);
    const successRateRange = maxSuccessRate - minSuccessRate;

    const weightedWords = allWordPairs.map(word => {
      const normalizedSessionAttempts = (sessionAttempts[word.id] || 0) / maxSessionAttempts;
      
      const successRate = word.recentSuccessRate || 0;
      const normalizedSuccessRate = successRateRange > 0
        ? (successRate - minSuccessRate) / successRateRange
        : (maxSuccessRate > 0 ? successRate / maxSuccessRate : 0);

      const sessionScore = normalizedSessionAttempts;
      const successScore = 1 - normalizedSuccessRate;

      const score = 0.4 * sessionScore + 0.6 * successScore;

      return { ...word, score };
    });

    const totalScore = weightedWords.reduce((sum, word) => sum + Math.exp(word.score / temperature), 0);

    return weightedWords.map(word => ({
      ...word,
      probability: Math.exp(word.score / temperature) / totalScore,
    })).sort((a, b) => b.probability - a.probability);
  }, [allWordPairs, sessionAttempts]);


  const selectWord = () => {
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
    setWordWithWeight(selectedWord);
    setInputValue('');
    setHasGuessedWrongOnce(false);
    setIsFlipped(false); // Reset flip state for new card
    setIsCorrectGuess(false);
    setWasFlipped(false);
  };

  useEffect(() => {
    if (wordsWithProbability.length > 0 && !currentWord) {
      selectWord();          // first word only
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsWithProbability]);

  // Add this useEffect to focus the input when a new word is selected
  useEffect(() => {
    if (!isCorrectGuess && inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentWord, isCorrectGuess]);


  const tableWords = useMemo(() => {
    return [...wordsWithProbability].sort((a, b) =>
      a.english.localeCompare(b.english)
    );
  }, [wordsWithProbability]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        // If the user is typing in an input, let the form's onSubmit handle it to avoid double-firing.
        if (document.activeElement && document.activeElement.tagName.toLowerCase() === 'input') {
          return;
        }
        
        // If a submit button is present (either "Check" or "Continue"), click it.
        if (submitButtonRef.current) {
          event.preventDefault();
          submitButtonRef.current.click();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Empty dependency array ensures this effect runs only once on mount.


  const handleSubmit = async (event) => {
    event.preventDefault();

    // Handle "Continue" button clicks
    if (isCorrectGuess) {
      selectWord();
      return;
    }
    if (hasGuessedWrongOnce) {
      if (inputValue.trim().toLowerCase() === currentWord.korean.trim().toLowerCase()) {
        selectWord();
      }
      return;
    }

    const isCorrect = inputValue.trim().toLowerCase() === currentWord.korean.trim().toLowerCase();

    // Always count it as an attempt on the first submit
    setAttemptCount(prev => prev + 1);
    setSessionAttempts(prev => ({
        ...prev,
        [currentWord.id]: (prev[currentWord.id] || 0) + 1
    }));

    // If the card was flipped, send a fake incorrect guess to the backend for stat tracking.
    const guessForApi = wasFlipped ? `FLIPPED_ANSWER_PENALTY_${Date.now()}` : inputValue.trim();

    const answeredWord = currentWord;
    const guessData = {
      userId,
      id: answeredWord.packageId || answeredWord.id,
      koreanGuess: guessForApi,
      englishGuess: answeredWord.english,
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(PROCESS_GUESS_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(guessData),
      });

      const result = await response.json();

      if (response.ok && result?.result) {
        const { attempts, successes, recentSuccessRate } = result.result;

        // Update the master list of words with new stats from backend
        setAllWordPairs(prev =>
          prev.map(w =>
            w.english === answeredWord.english && w.korean === answeredWord.korean
              ? { ...w, attempts, successes, recentSuccessRate }
              : w
          )
        );

        // Now, update the UI based on the REAL user input
        if (isCorrect) {
            // Only increment internal correct count if they didn't flip
            if (!wasFlipped) {
                setCorrectCount(c => c + 1);
            }
            // Show the success UI and "Continue" button
            setIsCorrectGuess(true);
        } else {
            // They got it wrong
            setHasGuessedWrongOnce(true);
        }
      }
    } catch (err) {
      console.error('Error submitting guess:', err);
    } finally {
      setIsSubmitting(false);
    }
  };


  if (loadingState === 'loading') {
    return <div className="text-center text-gray-400">Loading quiz...</div>;
  }

  if (loadingState === 'no-words') {
    return <div className="text-center text-gray-400">No words found for this user. Please add some words above.</div>;
  }

  if (loadingState === 'error') {
    return <div className="text-center text-red-500">Error loading quiz. Please try again later.</div>;
  }

  if (!currentWord) {
    return <div className="text-center text-gray-400">Loading quiz...</div>;
  }

  const handleFocus = () => {
    onQuizFocus();
  }

  const handleFlip = () => {
    if (!isFlipped) { // Only set wasFlipped on the first flip-to-show
      setWasFlipped(true);
    }
    setIsFlipped(!isFlipped);
  };

  const successRate = attemptCount > 0 ? ((correctCount / attemptCount) * 100).toFixed(0) : 0;
  // --- End of copy-pasting the existing logic ---


  return (
    <>
      <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
        
        {/* --- Flashcard Section --- */}
        <div className="flashcard-container max-w-md mx-auto mb-6">
          <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
            {/* Card Front */}
            <div className="flashcard-front">
              <div className="text-center text-3xl sm:text-4xl font-semibold text-white">
                {currentWord.english}
              </div>
            </div>
            {/* Card Back */}
            <div className="flashcard-back">
              <div className="text-center text-3xl sm:text-4xl font-bold">
                {currentWord.korean}
              </div>
            </div>
          </div>
        </div>

        {/* --- Form and Controls --- */}
        <form onSubmit={handleSubmit} className="max-w-md mx-auto">
          {!isCorrectGuess && (
            <input
              ref={inputRef} // Attach the ref to the input element
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={handleFocus}
              className={`shadow appearance-none border rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline text-lg ${
                hasGuessedWrongOnce
                  ? inputValue.trim().toLowerCase() === currentWord.korean.trim().toLowerCase()
                    ? 'border-green-500'
                    : 'border-red-500'
                  : 'border-gray-600'
              }`}
              placeholder="Enter the Korean word"
            />
          )}

          {isCorrectGuess && wasFlipped && (
            <div className="mt-4 p-4 bg-yellow-800 bg-opacity-80 border border-yellow-600 rounded-lg text-center">
              <p className="text-xl font-bold text-yellow-200">Correct - but you flipped the card</p>
            </div>
          )}

          {isCorrectGuess && !wasFlipped && (
            <div className="mt-4 p-4 bg-green-900 border border-green-700 rounded-lg text-center">
              <p className="text-xl font-bold text-green-300">Correct!</p>
            </div>
          )}

          {hasGuessedWrongOnce && (
            <p className="text-red-500 text-center mt-2">
              Incorrect. The correct answer is: <span className="font-bold">{currentWord.korean}</span>. Please type it correctly to continue.
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex flex-row justify-center items-stretch gap-4 mt-6">
            {!isCorrectGuess ? (
              <>
                <button
                  type="button"
                  onClick={handleFlip}
                  disabled={isSubmitting}
                  className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-1/2 disabled:opacity-50"
                >
                  {isFlipped ? 'Hide Answer' : 'Flip Card'}
                </button>
                <button
                  ref={submitButtonRef}
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-1/2 disabled:opacity-50"
                >
                  Check Answer
                </button>
              </>
            ) : (
              <button
                ref={submitButtonRef}
                type="submit"
                className="bg-purple-600 hover:bg-purple-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-auto"
              >
                Continue
              </button>
            )}
          </div>
        </form>
      </div>

      {/* --- Toggle for Advanced Section --- */}
      <div className="max-w-4xl mx-auto text-center pt-4">
        <button 
          onClick={() => setShowAdvanced(!showAdvanced)} 
          className="text-gray-400 hover:text-white focus:outline-none"
        >
          {showAdvanced ? '[ hide advanced ]' : '[ show advanced ]'}
        </button>
      </div>

      {/* --- Collapsible Advanced Section --- */}
      {showAdvanced && (
        <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg mt-4">
          <h3 className="text-2xl font-bold text-center mb-4">Session Details</h3>
          
          {/* --- Responsive Stats Bar --- */}
          <div className="bg-gray-700 p-4 rounded-lg mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-green-400">{correctCount}</p>
                <p className="text-sm text-gray-400">Correct</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-red-400">{attemptCount - correctCount}</p>
                <p className="text-sm text-gray-400">Incorrect</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-blue-400">{attemptCount}</p>
                <p className="text-sm text-gray-400">Total</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-purple-400">{successRate}%</p>
                <p className="text-sm text-gray-400">Success Rate</p>
              </div>
            </div>
          </div>

          {/* --- Responsive Word List/Table --- */}
          <div className="mt-10">
            <h3 className="text-2xl font-bold text-center mb-4">Word Probabilities</h3>

            {/* --- Card View for Mobile (hidden on md screens and up) --- */}
            <div className="md:hidden space-y-3">
              {tableWords.map((word) => (
                <div
                  key={word.id}
                  className={`bg-gray-700 p-4 rounded-lg ${word.id === currentWord.id ? 'ring-2 ring-green-500' : 'ring-1 ring-gray-600'}`}
                >
                  <div className="flex justify-between items-center font-bold text-lg mb-2">
                    <span>{word.english}</span>
                    <span>{word.korean}</span>
                  </div>
                  <div className="border-t border-gray-600 pt-2 text-sm text-gray-300 grid grid-cols-2 gap-x-4 gap-y-1">
                    <span>Attempts: <span className="font-semibold text-white">{word.attempts || 0}</span></span>
                    <span>Successes: <span className="font-semibold text-white">{word.successes || 0}</span></span>
                    <span>Rate: <span className="font-semibold text-white">{((word.recentSuccessRate || 0) * 100).toFixed(0)}%</span></span>
                    <span>Score: <span className="font-semibold text-white">{word.score.toFixed(2)}</span></span>
                    <span className="col-span-2">Probability: <span className="font-semibold text-white">{(word.probability * 100).toFixed(2)}%</span></span>
                  </div>
                </div>
              ))}
            </div>

            {/* --- Table View for Desktop (hidden by default, shown on md screens and up) --- */}
            <div className="overflow-x-auto hidden md:block">
              <table className="min-w-full bg-gray-700 rounded-lg">
                <thead>
                  <tr className="text-left text-gray-300">
                    <th className="p-3">English</th>
                    <th className="p-3">Korean</th>
                    <th className="p-3">Attempts</th>
                    <th className="p-3">Successes</th>
                    <th className="p-3">Success Rate</th>
                    <th className="p-3">Score</th>
                    <th className="p-3">Probability</th>
                  </tr>
                </thead>
                <tbody>
                  {tableWords.map((word) => (
                    <tr key={word.id} className={`border-t border-gray-600 ${word.id === currentWord.id ? 'bg-gray-600' : ''}`}>
                      <td className="p-3">{word.english}</td>
                      <td className="p-3">{word.korean}</td>
                      <td className="p-3">{word.attempts || 0}</td>
                      <td className="p-3">{word.successes || 0}</td>
                      <td className="p-3">{((word.recentSuccessRate || 0) * 100).toFixed(0)}%</td>
                      <td className="p-3">{word.score.toFixed(2)}</td>
                      <td className="p-3">{(word.probability * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Quiz;
