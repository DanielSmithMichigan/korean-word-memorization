import React, { useState, useMemo, useEffect } from 'react';
import { useQuizEngine } from './hooks/useQuizEngine';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect, removePunctuationAndNormalize } from './utils/quizUtil';
import { getLevenshteinTrace } from './utils/levenshtein';
import Flashcard from './components/Flashcard';
import StreakDisplay from './components/StreakDisplay';
import QuizInputForm from './components/QuizInputForm';
import QuizFeedback from './components/QuizFeedback';
import AdvancedQuizDetails from './components/AdvancedQuizDetails';
import BulkQuizView from './components/BulkQuizView';

function Quiz({ userId, vocabulary, onQuizFocus }) {
  const [hardMode, setHardMode] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [wasFlipped, setWasFlipped] = useState(false);
  const [hasGuessedWrongOnce, setHasGuessedWrongOnce] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [diffTrace, setDiffTrace] = useState(null);

  const {
    loadingState,
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
  } = useQuizEngine({ userId, vocabulary, hardMode });

  console.log({
    vocabulary
  })

  const handleWordUpdated = (updatedPackages, newWord) => {
    updateWordPackages(updatedPackages, newWord);
  };

  useEffect(() => {
    if (currentWord || bulkQuizWords.length > 0) {
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
        playAudio(false, true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord]);

  const tableWords = useMemo(() => {
    return [...wordsWithProbability].sort((a, b) => {
      if (a.english && b.english) {
        return a.english.localeCompare(b.english);
      }
      if (!a.english && !b.english) return 0;
      if (!a.english) return 1;
      if (!b.english) return -1;
      return 0;
    });
  }, [wordsWithProbability]);

  const resetForNextWord = () => {
    selectWord();
    setIsFlipped(false);
    setWasFlipped(false);
    setHasGuessedWrongOnce(false);
    setIsCorrectGuess(false);
    setDiffTrace(null);
  };

  const handleSubmit = async (guesses) => {
    if (isCorrectGuess) {
      resetForNextWord();
      return;
    }

    if (hasGuessedWrongOnce) {
      let isNowCorrect = false;
      if (hardMode && quizMode === 'audio-to-english') {
        isNowCorrect = isEnglishAnswerCorrect(guesses.english, currentWord) && isKoreanAnswerCorrect(guesses.korean, currentWord);
      } else if (quizMode === 'korean-to-english' || quizMode === 'audio-to-english') {
        isNowCorrect = isEnglishAnswerCorrect(guesses.english, currentWord);
      } else {
        isNowCorrect = isKoreanAnswerCorrect(guesses.korean, currentWord);
      }

      if (isNowCorrect) {
        setIsCorrectGuess(true);
        setDiffTrace(null);
      } else {
        let guess, correct;

        if (hardMode && quizMode === 'audio-to-english') {
          const isKoreanWrong = !isKoreanAnswerCorrect(guesses.korean, currentWord);
          if (isKoreanWrong) {
            guess = guesses.korean;
            correct = currentWord.korean;
          } else {
            guess = guesses.english;
            correct = currentWord.english.split(',')[0].trim();
          }
        } else {
          guess = quizMode === 'english-to-korean' ? guesses.korean : guesses.english;
          correct = quizMode === 'english-to-korean' ? currentWord.korean : currentWord.english.split(',')[0].trim();
        }
        
        const cleanedGuess = removePunctuationAndNormalize(guess);
        const cleanedCorrect = removePunctuationAndNormalize(correct);

        setDiffTrace(getLevenshteinTrace(cleanedGuess.toLowerCase(), cleanedCorrect.toLowerCase()));
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
      setDiffTrace(null);
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

  const playAudio = (overwrite = false, isUserAction = false) => {
    if (isUserAction && !wasFlipped) {
      setWasFlipped(true);
    }
    if (currentWord) {
      return handlePlayAudio(currentWord.korean, overwrite);
    }
    return Promise.resolve();
  };

  const isFavorite = useMemo(() => {
    if (!currentWord || !favoritesPackage) return false;
    return favoritesPackage.wordPairs.some(
      p => p.korean === currentWord.korean && p.english === currentWord.english
    );
  }, [currentWord, favoritesPackage]);

  const currentWordPackage = useMemo(() => {
    if (!currentWord || !vocabulary) return null;
    return vocabulary.find(pkg => pkg.id === currentWord.parentId);
  }, [currentWord, vocabulary]);

  if (loadingState === 'loading') return <div className="text-center text-gray-400">Loading quiz...</div>;
  if (loadingState === 'no-words') return <div className="text-center text-gray-400">No words found. Please add some.</div>;
  if (loadingState === 'error') return <div className="text-center text-red-500">Error loading quiz. Please try again.</div>;
  if (!currentWord && bulkQuizWords.length === 0) return <div className="text-center text-gray-400">Loading words...</div>;

  const isBulkMode = quizMode.startsWith('bulk-');

  return (
    <>
      {isBulkMode ? (
        <BulkQuizView
          words={bulkQuizWords}
          quizMode={quizMode}
          onSubmit={handleBulkGuess}
          onNextRound={resetForNextWord}
        />
      ) : (
        <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
          {currentWord && (
            <>
              <Flashcard
                word={currentWord}
                isFlipped={isFlipped}
                audioStatus={audioStore[currentWord.korean]?.status}
                onPlayAudio={() => playAudio(false, true)}
                onRefreshAudio={() => playAudio(true, true)}
                quizMode={quizMode}
                userId={userId}
                wordPackage={currentWordPackage}
                wordIndex={currentWord.originalIndex}
                isFavorite={isFavorite}
                onToggleFavorite={() => toggleFavorite(currentWord)}
                onWordUpdated={handleWordUpdated}
              />
              <StreakDisplay history={streakHistory} />
              <QuizFeedback
                isCorrectGuess={isCorrectGuess}
                wasFlipped={wasFlipped}
                hasGuessedWrongOnce={hasGuessedWrongOnce}
                word={currentWord}
                quizMode={quizMode}
                diffTrace={diffTrace}
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
            </>
          )}
        </div>
      )}

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
