import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuizEngine } from './hooks/useQuizEngine';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect, removePunctuationAndNormalize } from './utils/quizUtil';
import { getLevenshteinTrace } from './utils/levenshtein';
import Flashcard from './components/Flashcard';
import QuizInputForm from './components/QuizInputForm';
import QuizFeedback from './components/QuizFeedback';
import AdvancedQuizDetails from './components/AdvancedQuizDetails';
import BulkQuizView from './components/BulkQuizView';

function Quiz({ userId, vocabulary, onQuizFocus }) {
  const navigate = useNavigate();
  const [hardMode, setHardMode] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [wasFlipped, setWasFlipped] = useState(false);
  const [hasGuessedWrongOnce, setHasGuessedWrongOnce] = useState(false);
  const [isCorrectGuess, setIsCorrectGuess] = useState(false);
  const [guessResult, setGuessResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [diffTrace, setDiffTrace] = useState(null);
  const [autoPlayOnCorrect, setAutoPlayOnCorrect] = useState(true);
  const [playBothAudios, setPlayBothAudios] = useState(false);

  // New settings
  const [activeWindowSize, setActiveWindowSize] = useState(3);
  const [consecutiveSuccessesRequired, setConsecutiveSuccessesRequired] = useState(5);
  const [graduatedWordRecurrenceRate, setGraduatedWordRecurrenceRate] = useState(0.15);

  const {
    loadingState,
    currentWord,
    bulkQuizWords,
    wordsWithProbability,
    correctCount,
    attemptCount,
    streakHistory,
    audioStore,
    isAudioPlaying,
    useGoogleCloud,
    setUseGoogleCloud,
    selectWord,
    handleGuess,
    handleBulkGuess,
    handlePlayAudio,
    handlePlayAudioByLanguage,
    handlePlayAudioBoth,
    quizMode,
    favoritesPackage,
    toggleFavorite,
    updateWordPackages,
    displayWords,
    wordSuccessCounters,
    removeCurrentWordFromSession,
    forceGraduateCurrentWord,
    isQuizComplete,
  } = useQuizEngine({
    userId,
    vocabulary,
    hardMode,
    activeWindowSize,
    consecutiveSuccessesRequired,
    graduatedWordRecurrenceRate,
    playBothAudios,
  });

  

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

  const graduationProgress = useMemo(() => {
    const total = (displayWords || []).length;
    const graduated = (displayWords || []).filter(w => w.status === 'Graduated').length;
    const percent = total > 0 ? Math.round((graduated / total) * 100) : 0;
    return { graduated, total, percent };
  }, [displayWords]);

  const resetForNextWord = () => {
    selectWord();
    setIsFlipped(false);
    setWasFlipped(false);
    setHasGuessedWrongOnce(false);
    setIsCorrectGuess(false);
    setDiffTrace(null);
    setGuessResult(null);
  };

  const handleSubmit = async (guesses) => {
    if (isCorrectGuess) {
      if (isAudioPlaying) {
        return;
      }
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
        if (autoPlayOnCorrect) {
          playAudio();
        }
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
    const result = await handleGuess({
      koreanGuess: guesses.korean,
      englishGuess: guesses.english,
      wasFlipped
    });
    setIsSubmitting(false);
    setGuessResult(result);

    if (result.isCorrect) {
      setIsCorrectGuess(true);
      setDiffTrace(null);
      if (autoPlayOnCorrect) {
        playAudio();
      }
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
      const englishPrimary = (currentWord.english || '').split(',')[0].trim();
      if (playBothAudios) {
        return handlePlayAudioBoth(currentWord.korean, englishPrimary, overwrite);
      }
      return handlePlayAudio(currentWord.korean, overwrite);
    }
    return Promise.resolve();
  };

  const isFavorite = useMemo(() => {
    if (!currentWord || !favoritesPackage || !favoritesPackage.wordPairs) return false;
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
  if (!currentWord && bulkQuizWords.length === 0 && !isQuizComplete) return <div className="text-center text-gray-400">Loading words...</div>;

  const isBulkMode = quizMode.startsWith('bulk-');

  return (
    <>
      {isQuizComplete ? (
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-purple-600 via-pink-600 to-red-500 p-[1px] rounded-2xl shadow-xl">
          <div className="bg-gray-900 rounded-2xl p-10 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-3xl font-extrabold text-white mb-2">All done! Great job!</h2>
            <p className="text-gray-300 mb-6">You graduated every word in this session. Take a breather or review again.</p>
            <div className="flex justify-center">
              <button
                className="px-5 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-semibold"
                onClick={() => navigate('/quiz-setup')}
              >
                Browse Packages
              </button>
            </div>
          </div>
        </div>
      ) : isBulkMode ? (
        <BulkQuizView
          words={bulkQuizWords}
          quizMode={quizMode}
          onSubmit={handleBulkGuess}
          onNextRound={resetForNextWord}
        />
      ) : (
        <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
          {/* Overall graduation progress (for the whole session) */}
          {graduationProgress.total > 0 && (
            <div className="max-w-md mx-auto mb-4">
              <div className="flex items-center justify-between mb-1 text-xs text-gray-300">
                <span className="truncate">Graduation Progress</span>
                <span className="tabular-nums">{graduationProgress.graduated}/{graduationProgress.total}</span>
              </div>
              <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 ease-out ring-1 ring-indigo-300"
                  style={{
                    width: `${graduationProgress.percent}%`,
                    background: 'linear-gradient(90deg, #22C55E 0%, #10B981 100%)',
                  }}
                />
              </div>
            </div>
          )}

          {currentWord && (
            <>
              <Flashcard
                word={currentWord}
                isFlipped={isFlipped}
                audioStatus={audioStore[`ko:${currentWord.korean}`]?.status}
                onPlayAudio={() => playAudio(false, true)}
                onRefreshAudio={() => playAudio(true, true)}
                quizMode={quizMode}
                userId={userId}
                wordPackage={currentWordPackage}
                wordIndex={currentWord.originalIndex}
                isFavorite={isFavorite}
                onToggleFavorite={() => toggleFavorite(currentWord)}
                onWordUpdated={handleWordUpdated}
                wordSuccessCounters={wordSuccessCounters}
                consecutiveSuccessesRequired={consecutiveSuccessesRequired}
              />
              <QuizFeedback
                isCorrectGuess={isCorrectGuess}
                wasFlipped={wasFlipped}
                hasGuessedWrongOnce={hasGuessedWrongOnce}
                word={currentWord}
                quizMode={quizMode}
                diffTrace={diffTrace}
                guessResult={guessResult}
              />
              <QuizInputForm
                word={currentWord}
                isCorrectGuess={isCorrectGuess}
                hasGuessedWrongOnce={hasGuessedWrongOnce}
                isSubmitting={isSubmitting}
                isAudioPlaying={isAudioPlaying}
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

      {/* Active Window Power Meter removed; single current-word bar now on Flashcard */}

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
        <div className="flex items-center">
            <input
                type="checkbox"
                id="auto-play-correct"
                className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-2"
                checked={autoPlayOnCorrect}
                onChange={() => setAutoPlayOnCorrect(prev => !prev)}
            />
            <label htmlFor="auto-play-correct" className="text-white">
                Auto-play audio after correct
            </label>
        </div>
        <div className="flex items-center">
            <input
                type="checkbox"
                id="play-both-audios"
                className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-2"
                checked={playBothAudios}
                onChange={() => setPlayBothAudios(prev => !prev)}
            />
            <label htmlFor="play-both-audios" className="text-white">
                Play both audios (Korean + English)
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
          tableWords={displayWords}
          wordSuccessCounters={wordSuccessCounters}
          currentWord={currentWord}
          activeWindowSize={activeWindowSize}
          setActiveWindowSize={setActiveWindowSize}
          consecutiveSuccessesRequired={consecutiveSuccessesRequired}
          setConsecutiveSuccessesRequired={setConsecutiveSuccessesRequired}
          graduatedWordRecurrenceRate={graduatedWordRecurrenceRate}
          setGraduatedWordRecurrenceRate={setGraduatedWordRecurrenceRate}
          onRemoveCurrentWordFromSession={removeCurrentWordFromSession}
          onForceGraduateCurrentWord={forceGraduateCurrentWord}
          streakHistory={streakHistory}
        />
      )}
    </>
  );
}

export default Quiz;
