import React, { useState, useRef, useEffect } from 'react';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect } from '../utils/quizUtil';

function QuizInputForm({
  word,
  isCorrectGuess,
  hasGuessedWrongOnce,
  isSubmitting,
  isAudioPlaying,
  onSubmit,
  onFlip,
  onFocus,
  quizMode,
  hardMode,
  clearInputsTick,
}) {
  const [koreanGuess, setKoreanGuess] = useState('');
  const [englishGuess, setEnglishGuess] = useState('');

  const koreanInputRef = useRef(null);
  const englishInputRef = useRef(null);
  const submitButtonRef = useRef(null);

  useEffect(() => {
    if (isCorrectGuess) {
      setKoreanGuess('');
      setEnglishGuess('');
    }
  }, [isCorrectGuess]);

  // Clear inputs on external signal (e.g., wrong-language detected)
  useEffect(() => {
    if (clearInputsTick != null) {
      setKoreanGuess('');
      setEnglishGuess('');
    }
  }, [clearInputsTick]);

  useEffect(() => {
    if (!isCorrectGuess) {
      if (hardMode && quizMode === 'audio-to-english') {
        koreanInputRef.current?.focus();
      } else if (quizMode === 'english-to-korean') {
        koreanInputRef.current?.focus();
      } else {
        englishInputRef.current?.focus();
      }
    }
  }, [isCorrectGuess, quizMode, hardMode]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea';

      if (event.key === 'Enter') {
        if (isInputFocused) {
          return;
        }
        if (submitButtonRef.current) {
          event.preventDefault();
          submitButtonRef.current.click();
        }
        return;
      }

      if ((event.key === '.' || event.code === 'Period') && submitButtonRef.current) {
        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
          return;
        }
        event.preventDefault();
        submitButtonRef.current.click();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ korean: koreanGuess, english: englishGuess });
  };

  const showKoreanInput = quizMode === 'english-to-korean' || (hardMode && quizMode === 'audio-to-english');
  const showEnglishInput = quizMode === 'korean-to-english' || quizMode === 'audio-to-english';

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto">
      {!isCorrectGuess && (
        <div className="space-y-4">
          {showKoreanInput && (
            <input
              ref={koreanInputRef}
              type="text"
              value={koreanGuess}
              onChange={(e) => setKoreanGuess(e.target.value)}
              onFocus={onFocus}
              className={`shadow appearance-none border rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline text-lg ${
                hasGuessedWrongOnce
                  ? isKoreanAnswerCorrect(koreanGuess, word)
                    ? 'border-green-500'
                    : 'border-red-500'
                  : 'border-gray-600'
              }`}
              placeholder="Type the Korean translation..."
            />
          )}
          {showEnglishInput && (
            <input
              ref={englishInputRef}
              type="text"
              value={englishGuess}
              onChange={(e) => setEnglishGuess(e.target.value)}
              onFocus={onFocus}
              className={`shadow appearance-none border rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline text-lg ${
                hasGuessedWrongOnce
                  ? isEnglishAnswerCorrect(englishGuess, word)
                    ? 'border-green-500'
                    : 'border-red-500'
                  : 'border-gray-600'
              }`}
              placeholder="Type the English translation..."
            />
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-row justify-center items-stretch gap-4 mt-6">
        {!isCorrectGuess ? (
          <>
            <button
              type="button"
              onClick={onFlip}
              disabled={isSubmitting}
              className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-1/2 disabled:opacity-50"
            >
              Flip Card
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
            disabled={isAudioPlaying}
            className={`bg-purple-600 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-auto ${
              isAudioPlaying ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-800'
            }`}
          >
            {isAudioPlaying ? 'Playing…' : 'Continue'}
          </button>
        )}
      </div>
    </form>
  );
}

export default QuizInputForm;
