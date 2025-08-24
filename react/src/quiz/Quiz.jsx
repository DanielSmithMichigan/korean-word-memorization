import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  const [browseMode, setBrowseMode] = useState(false);
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
  const [wrongLanguageInfo, setWrongLanguageInfo] = useState(null);
  const [clearInputsTick, setClearInputsTick] = useState(0);
  const prevWindowSizeRef = useRef(null);
  const autoAppliedBrowseRef = useRef(false);
  const [browseShowEnglishOnFront, setBrowseShowEnglishOnFront] = useState(true);
  const prevBrowseWordRef = useRef(null);
  const [autoPlayKoreanOnAdvanceBrowse, setAutoPlayKoreanOnAdvanceBrowse] = useState(true);
  const [autoPlayEnglishOnAdvanceBrowse, setAutoPlayEnglishOnAdvanceBrowse] = useState(true);

  // New settings
  const [activeWindowSize, setActiveWindowSize] = useState(5);
  const [consecutiveSuccessesRequired, setConsecutiveSuccessesRequired] = useState(5);
  const [graduatedWordRecurrenceRate, setGraduatedWordRecurrenceRate] = useState(0.2);

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
    forceGraduateWord,
    isQuizComplete,
  } = useQuizEngine({
    userId,
    vocabulary,
    hardMode: hardMode && !browseMode,
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

  // Browse Mode: randomize front side on advance and optionally autoplay per-language
  useEffect(() => {
    if (!browseMode || !currentWord) return;
    const englishPrimary = (currentWord.english || '').split(',')[0].trim();
    const wordChanged = !prevBrowseWordRef.current || prevBrowseWordRef.current !== currentWord.korean;
    let nextEnglishOnFront = browseShowEnglishOnFront;
    if (wordChanged) {
      nextEnglishOnFront = Math.random() < 0.5;
      setBrowseShowEnglishOnFront(nextEnglishOnFront);
      setIsFlipped(false);
      setWasFlipped(false);
      prevBrowseWordRef.current = currentWord.korean;
    }
    // Autoplay only on advance; respect per-language toggles
    if (wordChanged) {
      if (nextEnglishOnFront) {
        if (autoPlayEnglishOnAdvanceBrowse && englishPrimary) {
          handlePlayAudioByLanguage(englishPrimary, 'en');
        }
      } else {
        if (autoPlayKoreanOnAdvanceBrowse) {
          handlePlayAudio(currentWord.korean);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWord, browseMode]);

  // Increase active window size to 5 in Browse Mode (remember previous and restore when leaving)
  useEffect(() => {
    if (browseMode) {
      prevWindowSizeRef.current = activeWindowSize;
      if ((activeWindowSize || 0) < 5) {
        setActiveWindowSize(5);
      }
    } else if (prevWindowSizeRef.current != null) {
      if (activeWindowSize !== prevWindowSizeRef.current) {
        setActiveWindowSize(prevWindowSizeRef.current);
      }
      prevWindowSizeRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseMode]);

  // Auto-select Browse Mode for Anna
  useEffect(() => {
    if (!autoAppliedBrowseRef.current && typeof userId === 'string' && userId.toLowerCase() === 'anna') {
      setBrowseMode(true);
      setHardMode(false);
      setAutoPlayOnCorrect(false);
      setAutoPlayKoreanOnAdvanceBrowse(true);
      setAutoPlayEnglishOnAdvanceBrowse(false);
      autoAppliedBrowseRef.current = true;
    }
  }, [userId]);

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
    setWrongLanguageInfo(null);
  };

  const goToNextWordBrowseMode = () => {
    if (!currentWord) return;
    // If only one active word remains, do nothing
    const activeCount = (displayWords || []).filter(w => w.status === 'Active').length;
    if (activeCount <= 1) return;
    selectWord({ avoidKorean: currentWord.korean });
    setIsFlipped(false);
    setWasFlipped(false);
    setHasGuessedWrongOnce(false);
    setIsCorrectGuess(false);
    setDiffTrace(null);
    setGuessResult(null);
  };

  // Determine which mode the card is visually using
  const effectiveQuizMode = browseMode
    ? (browseShowEnglishOnFront ? 'english-to-korean' : 'korean-to-english')
    : quizMode;

  const handleSubmit = async (guesses) => {
    if (isCorrectGuess) {
      if (isAudioPlaying) {
        return;
      }
      resetForNextWord();
      return;
    }

    if (hasGuessedWrongOnce) {
      // Detect wrong-language on subsequent attempts as well; clear input and do not penalize
      let wrongLang = false;
      if (hardMode && quizMode === 'audio-to-english') {
        // Swapped-both should be treated as correct in this mode; don't trigger wrong-language
      } else if (quizMode === 'english-to-korean') {
        if (isEnglishAnswerCorrect((guesses.korean || ''), currentWord)) {
          wrongLang = true;
          setWrongLanguageInfo('english-entered-in-korean');
        }
      } else if (quizMode === 'korean-to-english' || quizMode === 'audio-to-english') {
        if (isKoreanAnswerCorrect((guesses.english || ''), currentWord)) {
          wrongLang = true;
          setWrongLanguageInfo('korean-entered-in-english');
        }
      }

      if (wrongLang) {
        setClearInputsTick(t => t + 1);
        return;
      }

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
    if (result && result.empty) {
      // Ignore empties; just clear any wrong-language banner and keep focus
      setWrongLanguageInfo(null);
      return;
    }
    if (result && result.wrongLanguage) {
      setWrongLanguageInfo(result.wrongLanguageType || 'wrong-language');
      setClearInputsTick(t => t + 1);
      return;
    }
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
      if (!browseMode && playBothAudios) {
        return handlePlayAudioBoth(currentWord.korean, englishPrimary, overwrite);
      }
      // In Browse mode, autoplay the language that matches the visible side
      if (browseMode) {
        const englishOnFront = effectiveQuizMode === 'english-to-korean';
        const showingEnglish = (!isFlipped && englishOnFront) || (isFlipped && !englishOnFront);
        if (showingEnglish && englishPrimary) {
          return handlePlayAudioByLanguage(englishPrimary, 'en', overwrite);
        }
        return handlePlayAudio(currentWord.korean, overwrite);
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
                quizMode={effectiveQuizMode}
                userId={userId}
                wordPackage={currentWordPackage}
                wordIndex={currentWord.originalIndex}
                isFavorite={isFavorite}
                onToggleFavorite={() => toggleFavorite(currentWord)}
                onWordUpdated={handleWordUpdated}
                wordSuccessCounters={wordSuccessCounters}
                consecutiveSuccessesRequired={consecutiveSuccessesRequired}
                showPerWordProgress={!browseMode}
                isBrowseMode={browseMode}
              />
              {browseMode ? (
                <div className="max-w-md mx-auto">
                  <div className="flex flex-col sm:flex-row justify-center items-stretch gap-3 sm:gap-4 mt-6">
                    <button
                      type="button"
                      onClick={handleFlip}
                      className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-1/3"
                    >
                      Flip Card
                    </button>
                    <button
                      type="button"
                      onClick={goToNextWordBrowseMode}
                      disabled={(displayWords || []).filter(w => w.status === 'Active').length <= 1}
                      className={`text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-1/3 ${
                        (displayWords || []).filter(w => w.status === 'Active').length <= 1
                          ? 'bg-purple-600 opacity-50 cursor-not-allowed'
                          : 'bg-purple-600 hover:bg-purple-800'
                      }`}
                    >
                      Next Word
                    </button>
                    <button
                      type="button"
                      onClick={forceGraduateCurrentWord}
                      className="bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-1/3"
                    >
                      Graduate
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <QuizFeedback
                    isCorrectGuess={isCorrectGuess}
                    wasFlipped={wasFlipped}
                    hasGuessedWrongOnce={hasGuessedWrongOnce}
                    word={currentWord}
                    quizMode={quizMode}
                    diffTrace={diffTrace}
                    guessResult={guessResult}
                  />
                  {wrongLanguageInfo && (
                    <div className="text-center p-4 rounded-lg bg-yellow-900 text-yellow-200 mb-4">
                      <p className="font-bold">
                        {wrongLanguageInfo === 'english-entered-in-korean' && 'You entered the English answer in the Korean field.'}
                        {wrongLanguageInfo === 'korean-entered-in-english' && 'You entered the Korean answer in the English field.'}
                        {wrongLanguageInfo === 'swapped-both' && 'Looks like the answers were swapped between fields.'}
                        {wrongLanguageInfo === 'wrong-language' && 'You entered the answer in the other language.'}
                      </p>
                      <p className="text-sm mt-1">Inputs cleared. Try again.</p>
                    </div>
                  )}
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
                    clearInputsTick={clearInputsTick}
                  />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Active Window Power Meter removed; single current-word bar now on Flashcard */}

      <div className="max-w-4xl mx-auto mt-4 space-y-3 sm:space-y-4">
        <div className="bg-gray-800 p-4 sm:p-5 rounded-xl shadow-lg">
          <label htmlFor="browse-mode" className="w-full flex items-center">
            <input
              type="checkbox"
              id="browse-mode"
              className="form-checkbox h-6 w-6 text-blue-400 bg-gray-700 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400"
              checked={browseMode}
              onChange={() => { setBrowseMode(prev => !prev); if (!browseMode) setHardMode(false); }}
            />
            <span className="ml-3 text-lg sm:text-xl text-white">Browse Mode</span>
          </label>
        </div>
        <div className="bg-gray-800 p-4 sm:p-5 rounded-xl shadow-lg">
          <label htmlFor="hard-mode" className="w-full flex items-center">
            <input
              type="checkbox"
              id="hard-mode"
              className="form-checkbox h-6 w-6 text-blue-400 bg-gray-700 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400"
              checked={hardMode}
              onChange={() => { setHardMode(prev => !prev); if (!hardMode) setBrowseMode(false); }}
              disabled={browseMode}
            />
            <span className="ml-3 text-lg sm:text-xl text-white">Hard Mode</span>
          </label>
        </div>
        {!browseMode ? (
          <>
            <div className="bg-gray-800 p-4 sm:p-5 rounded-xl shadow-lg">
              <label htmlFor="auto-play-correct" className="w-full flex items-center">
                <input
                  type="checkbox"
                  id="auto-play-correct"
                  className="form-checkbox h-6 w-6 text-blue-400 bg-gray-700 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400"
                  checked={autoPlayOnCorrect}
                  onChange={() => setAutoPlayOnCorrect(prev => !prev)}
                />
                <span className="ml-3 text-lg sm:text-xl text-white">Auto-play audio on advance</span>
              </label>
            </div>
            <div className="bg-gray-800 p-4 sm:p-5 rounded-xl shadow-lg">
              <label htmlFor="play-both-audios" className="w-full flex items-center">
                <input
                  type="checkbox"
                  id="play-both-audios"
                  className="form-checkbox h-6 w-6 text-blue-400 bg-gray-700 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400"
                  checked={playBothAudios}
                  onChange={() => setPlayBothAudios(prev => !prev)}
                />
                <span className="ml-3 text-lg sm:text-xl text-white">Play both audios (Korean + English)</span>
              </label>
            </div>
          </>
        ) : (
          <>
            <div className="bg-gray-800 p-4 sm:p-5 rounded-xl shadow-lg">
              <label htmlFor="auto-play-korean" className="w-full flex items-center">
                <input
                  type="checkbox"
                  id="auto-play-korean"
                  className="form-checkbox h-6 w-6 text-blue-400 bg-gray-700 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400"
                  checked={autoPlayKoreanOnAdvanceBrowse}
                  onChange={() => setAutoPlayKoreanOnAdvanceBrowse(prev => !prev)}
                />
                <span className="ml-3 text-lg sm:text-xl text-white">Play Korean audio on advance</span>
              </label>
            </div>
            <div className="bg-gray-800 p-4 sm:p-5 rounded-xl shadow-lg">
              <label htmlFor="auto-play-english" className="w-full flex items-center">
                <input
                  type="checkbox"
                  id="auto-play-english"
                  className="form-checkbox h-6 w-6 text-blue-400 bg-gray-700 border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-400"
                  checked={autoPlayEnglishOnAdvanceBrowse}
                  onChange={() => setAutoPlayEnglishOnAdvanceBrowse(prev => !prev)}
                />
                <span className="ml-3 text-lg sm:text-xl text-white">Play English audio on advance</span>
              </label>
            </div>
          </>
        )}
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-gray-400 hover:text-white focus:outline-none"
          >
            {showAdvanced ? '[ hide advanced ]' : '[ show advanced ]'}
          </button>
        </div>
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
          onForceGraduateWord={forceGraduateWord}
          streakHistory={streakHistory}
        />
      )}
    </>
  );
}

export default Quiz;
