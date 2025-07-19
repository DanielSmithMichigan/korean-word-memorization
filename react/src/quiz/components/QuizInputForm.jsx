import React, { useState, useRef, useEffect } from 'react';

function QuizInputForm({
  koreanWord,
  isCorrectGuess,
  hasGuessedWrongOnce,
  isSubmitting,
  onSubmit,
  onFlip,
  onFocus,
}) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);
  const submitButtonRef = useRef(null);

  useEffect(() => {
    if (!isCorrectGuess) {
      inputRef.current?.focus();
    }
  }, [isCorrectGuess]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Enter') {
        if (document.activeElement?.tagName.toLowerCase() === 'input') {
          return;
        }
        if (submitButtonRef.current) {
          event.preventDefault();
          submitButtonRef.current.click();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(inputValue);
    if (isCorrectGuess || hasGuessedWrongOnce) {
        setInputValue('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-md mx-auto">
      {!isCorrectGuess && (
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onFocus={onFocus}
          className={`shadow appearance-none border rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline text-lg ${
            hasGuessedWrongOnce
              ? inputValue.trim().toLowerCase() === koreanWord.trim().toLowerCase()
                ? 'border-green-500'
                : 'border-red-500'
              : 'border-gray-600'
          }`}
          placeholder="Enter the Korean word"
        />
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
            className="bg-purple-600 hover:bg-purple-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-auto"
          >
            Continue
          </button>
        )}
      </div>
    </form>
  );
}

export default QuizInputForm;
