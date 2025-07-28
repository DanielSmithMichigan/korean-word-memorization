import React, { useState, useMemo, useEffect } from 'react';
import { useQuizEngine } from './hooks/useQuizEngine';
import Flashcard from './components/Flashcard';
import StreakDisplay from './components/StreakDisplay';
import QuizInputForm from './components/QuizInputForm';
import QuizFeedback from './components/QuizFeedback';
import AdvancedQuizDetails from './components/AdvancedQuizDetails';

function Quiz({ userId, vocabulary, onQuizFocus }) {
  const [hardMode, setHardMode] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [wasFlipped, setWasFlipped] = useState(false);
  const [hasGuessedWrongOnce, setHasGuessedWrongOnce] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    loadingState,
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
  } = useQuizEngine({ userId, vocabulary, hardMode });

  useEffect(() => {
    if (currentWord) {
      resetForNextWord();
    }
  }, [hardMode]);

  useEffect(() => {
    if (currentWord && quizMode === 'audio-to-english') {
      playAudio();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord, quizMode]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === ';') {
        playAudio();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord]);

  const tableWords = useMemo(() => {
    return [...wordsWithProbability].sort((a, b) =>
      a.english.localeCompare(b.english)
    );
  }, [wordsWithProbability]);

  const resetForNextWord = () => {
    selectWord();
    setIsFlipped(false);
    setWasFlipped(false);
    setHasGuessedWrongOnce(false);
    setIsCorrectGuess(false);
  };

  const handleSubmit = async (guesses) => {
    if (isCorrectGuess) {
      resetForNextWord();
      return;
    }
    if (hasGuessedWrongOnce) {
      const { korean, english } = guesses;
      const englishAnswers = currentWord.english.split(',').map(w => w.trim().toLowerCase());
      if (korean.trim().toLowerCase() === currentWord.korean.trim().toLowerCase() || englishAnswers.includes(english.trim().toLowerCase())) {
        resetForNextWord();
      }
      return;
    }

    setIsSubmitting(true);
    const isCorrect = await handleGuess({
      koreanGuess: guesses.korean,
      englishGuess: guesses.english,
      wasFlipped
    });
    setIsSubmitting(false);

    if (isCorrect) {
      setIsCorrectGuess(true);
    } else {
      setHasGuessedWrongOnce(true);
    }
  };

  const handleFlip = () => {
    if (!isFlipped) {
      setWasFlipped(true);
    }
    setIsFlipped(!isFlipped);
  };

  const playAudio = (overwrite = false) => {
    console.log('@@')
    if (currentWord) {
      console.log("PLAYING");
      return handlePlayAudio(currentWord.korean, overwrite);
    }
    return Promise.resolve();
  };

  if (loadingState === 'loading') {
    return <div className="text-center text-gray-400">Loading quiz...</div>;
  }
  if (loadingState === 'no-words') {
    return <div className="text-center text-gray-400">No words found. Please add some.</div>;
  }
  if (loadingState === 'error') {
    return <div className="text-center text-red-500">Error loading quiz. Please try again.</div>;
  }
  if (!currentWord) {
    return <div className="text-center text-gray-400">Loading words...</div>;
  }

  return (
    <>
      <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
        <Flashcard
          word={currentWord}
          isFlipped={isFlipped}
          audioStatus={audioStore[currentWord.korean]?.status}
          onPlayAudio={() => playAudio(false)}
          onRefreshAudio={() => playAudio(true)}
          quizMode={quizMode}
        />
        <StreakDisplay history={streakHistory} />
        <QuizFeedback
          isCorrectGuess={isCorrectGuess}
          wasFlipped={wasFlipped}
          hasGuessedWrongOnce={hasGuessedWrongOnce}
          word={currentWord}
          quizMode={quizMode}
        />
        <QuizInputForm
          word={currentWord}
          isCorrectGuess={isCorrectGuess}
          hasGuessedWrongOnce={hasGuessedWrongOnce}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onFlip={handleFlip}
          onFocus={onQuizFocus}
          quizMode={quizMode}
          hardMode={hardMode}
        />
      </div>

      <div className="max-w-4xl mx-auto text-center pt-4 flex justify-center items-center gap-4">
        <div className="flex items-center">
            <input
                type="checkbox"
                id="hard-mode"
                className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-2"
                checked={hardMode}
                onChange={() => setHardMode(prev => !prev)}
            />
            <label htmlFor="hard-mode" className="text-white">
                Hard Mode
            </label>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-gray-400 hover:text-white focus:outline-none"
        >
          {showAdvanced ? '[ hide advanced ]' : '[ show advanced ]'}
        </button>
      </div>

      {showAdvanced && (
        <AdvancedQuizDetails
          useGoogleCloud={useGoogleCloud}
          onTtsApiChange={setUseGoogleCloud}
          correctCount={correctCount}
          attemptCount={attemptCount}
          tableWords={tableWords}
          currentWord={currentWord}
        />
      )}
    </>
  );
}

export default Quiz;
