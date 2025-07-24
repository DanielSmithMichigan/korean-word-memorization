import React, { useState, useMemo } from 'react';
import { useQuizEngine } from './hooks/useQuizEngine';
import Flashcard from './components/Flashcard';
import StreakDisplay from './components/StreakDisplay';
import QuizInputForm from './components/QuizInputForm';
import QuizFeedback from './components/QuizFeedback';
import AdvancedQuizDetails from './components/AdvancedQuizDetails';

function Quiz({ userId, vocabulary, onQuizFocus }) {
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
  } = useQuizEngine({ userId, vocabulary });

  const [isFlipped, setIsFlipped] = useState(false);
  const [wasFlipped, setWasFlipped] = useState(false);
  const [hasGuessedWrongOnce, setHasGuessedWrongOnce] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const handleSubmit = async (inputValue) => {
    if (isCorrectGuess) {
      resetForNextWord();
      return;
    }
    if (hasGuessedWrongOnce) {
      if (inputValue.trim().toLowerCase() === currentWord.korean.trim().toLowerCase()) {
        resetForNextWord();
      }
      return;
    }

    setIsSubmitting(true);
    const isCorrect = await handleGuess({ guess: inputValue, wasFlipped });
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
    if (currentWord) {
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
        />
        <StreakDisplay history={streakHistory} />
        <QuizFeedback
          isCorrectGuess={isCorrectGuess}
          wasFlipped={wasFlipped}
          hasGuessedWrongOnce={hasGuessedWrongOnce}
          koreanWord={currentWord.korean}
        />
        <QuizInputForm
          koreanWord={currentWord.korean}
          isCorrectGuess={isCorrectGuess}
          hasGuessedWrongOnce={hasGuessedWrongOnce}
          isSubmitting={isSubmitting}
          onSubmit={handleSubmit}
          onFlip={handleFlip}
          onFocus={onQuizFocus}
        />
      </div>

      <div className="max-w-4xl mx-auto text-center pt-4">
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
