import React, { useState, useEffect, useRef } from 'react';
import { FaVolumeUp, FaSpinner } from 'react-icons/fa';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect } from '../utils/quizUtil';

function WordIntroduction({
  word,
  pendingCount = 1,
  onComplete,
  onSkip,
  onPlayKoreanAudio,
  onPlayEnglishAudio,
  onAppendEnglishAlternate,
  koreanAudioStatus = 'idle',
  englishAudioStatus = 'idle',
}) {
  const [step, setStep] = useState(1);
  const [koreanInput, setKoreanInput] = useState('');
  const [englishInput, setEnglishInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingEnglishCorrection, setPendingEnglishCorrection] = useState('');
  const [isAppendingEnglish, setIsAppendingEnglish] = useState(false);
  const [appendFeedback, setAppendFeedback] = useState('');
  const [englishOverride, setEnglishOverride] = useState(null);
  const koreanInputRef = useRef(null);
  const englishInputRef = useRef(null);

  const effectiveWord = englishOverride ? { ...word, english: englishOverride } : word;
  const englishPrimary = (effectiveWord?.english || '').split(',')[0].trim();

  useEffect(() => {
    setStep(1);
    setKoreanInput('');
    setEnglishInput('');
    setErrorMessage('');
    setPendingEnglishCorrection('');
    setAppendFeedback('');
    setEnglishOverride(null);
  }, [word?.korean, word?.english]);

  useEffect(() => {
    if (step === 1) {
      koreanInputRef.current?.focus();
    } else {
      englishInputRef.current?.focus();
    }
  }, [step, word?.korean]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!effectiveWord) return;
    const guess = (step === 1 ? koreanInput : englishInput).trim();
    if (!guess) {
      setErrorMessage('Please type the word before confirming.');
      return;
    }

    if (step === 1) {
      if (isKoreanAnswerCorrect(guess, effectiveWord)) {
        setStep(2);
        setErrorMessage('');
        setKoreanInput(guess);
        setPendingEnglishCorrection('');
        setAppendFeedback('');
      } else {
        setErrorMessage('Copy the Korean spelling exactly as shown.');
      }
      return;
    }

    if (isEnglishAnswerCorrect(guess, effectiveWord)) {
      setErrorMessage('');
      setPendingEnglishCorrection('');
      onComplete?.();
    } else {
      setErrorMessage('That English meaning is new. Add it or try again.');
      setPendingEnglishCorrection(guess);
      setAppendFeedback('');
    }
  };

  const handleAppendEnglish = async () => {
    if (!onAppendEnglishAlternate || !pendingEnglishCorrection) return;
    setIsAppendingEnglish(true);
    setAppendFeedback('');
    try {
      const result = await onAppendEnglishAlternate(pendingEnglishCorrection);
      if (result?.success) {
        const fallbackEnglish = [effectiveWord?.english, pendingEnglishCorrection].filter(Boolean).join(', ');
        const updatedEnglish = result.updatedEnglish || fallbackEnglish;
        setEnglishOverride(updatedEnglish);
        setAppendFeedback('Added this spelling to the word.');
        setPendingEnglishCorrection('');
        setErrorMessage('');
        onComplete?.();
      } else {
        setAppendFeedback(result?.message || 'Failed to add spelling.');
      }
    } catch (error) {
      setAppendFeedback(error.message || 'Failed to add spelling.');
    } finally {
      setIsAppendingEnglish(false);
    }
  };

  const remainingLabel = pendingCount > 1
    ? `${pendingCount} introductions remaining (including this word)`
    : 'Last introduction for now';

  const activeInputValue = step === 1 ? koreanInput : englishInput;
  const activeInputRef = step === 1 ? koreanInputRef : englishInputRef;
  const activePlaceholder = step === 1 ? 'Type the Korean word here' : 'Type the English meaning here';
  const ctaLabel = step === 1 ? 'Confirm Korean' : 'Confirm English';
  const stepLabel = step === 1 ? 'Korean' : 'English';

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center px-3 py-4">
      <div className="w-full max-w-2xl space-y-4">
        <header className="flex items-center justify-between">
          <p className="text-[10px] uppercase text-gray-500 tracking-[0.3em]">New Word Introduction</p>
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="text-xs uppercase tracking-wide text-gray-400 bg-gray-800 px-3 py-1 rounded-full hover:bg-gray-700"
            >
              Skip
            </button>
          )}
        </header>

        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
          <div className="text-center space-y-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">English</p>
              <p className="text-2xl font-semibold text-white break-words">{englishPrimary || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Korean</p>
              <p className="text-3xl sm:text-4xl font-extrabold tracking-tight break-words">{word?.korean || '—'}</p>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {onPlayKoreanAudio && (
                <button
                  type="button"
                  onClick={onPlayKoreanAudio}
                  className="px-3 py-1.5 rounded-full bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-400 flex items-center gap-2 text-sm"
                  disabled={koreanAudioStatus === 'loading'}
                >
                  {koreanAudioStatus === 'loading' ? (
                    <FaSpinner className="animate-spin h-4 w-4" />
                  ) : (
                    <FaVolumeUp className="h-4 w-4" />
                  )}
                  <span className="text-sm">Play Korean</span>
                </button>
              )}
              {onPlayEnglishAudio && englishPrimary && (
                <button
                  type="button"
                  onClick={onPlayEnglishAudio}
                  className="px-3 py-1.5 rounded-full bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-400 flex items-center gap-2 text-sm"
                  disabled={englishAudioStatus === 'loading'}
                >
                  {englishAudioStatus === 'loading' ? (
                    <FaSpinner className="animate-spin h-4 w-4" />
                  ) : (
                    <FaVolumeUp className="h-4 w-4" />
                  )}
                  <span className="text-sm">Play English</span>
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-xl p-5 shadow-lg">
          <div className="space-y-3">
            <div className="text-center text-xs uppercase tracking-wide text-indigo-300">
              Step {step} of 2 · {stepLabel}
            </div>
            <form onSubmit={handleSubmit} className="space-y-2">
              <input
                ref={activeInputRef}
                type="text"
                value={activeInputValue}
                onChange={(event) => {
                  const value = event.target.value;
                  if (step === 1) {
                    setKoreanInput(value);
                  } else {
                    setEnglishInput(value);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 text-base"
                placeholder={activePlaceholder}
                autoComplete="off"
              />
              {errorMessage && (
                <p className="text-sm text-red-400 text-center">{errorMessage}</p>
              )}
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-300 font-semibold transition-colors text-sm"
              >
                {ctaLabel}
              </button>
            </form>
            {pendingEnglishCorrection && onAppendEnglishAlternate && (
              <div className="text-center space-y-2 text-xs text-gray-300">
                <p>Add “{pendingEnglishCorrection}” as an alternate meaning?</p>
                <button
                  type="button"
                  onClick={handleAppendEnglish}
                  disabled={isAppendingEnglish}
                  className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-300 font-semibold transition-colors text-xs"
                >
                  {isAppendingEnglish ? 'Saving…' : 'Add this spelling and continue'}
                </button>
                {appendFeedback && (
                  <p className="text-[11px] text-gray-400">{appendFeedback}</p>
                )}
              </div>
            )}
          </div>
        </section>

        <footer className="text-center text-xs text-gray-500">{remainingLabel}</footer>
      </div>
    </div>
  );
}

export default WordIntroduction;
