import React, { useState, useEffect, useMemo } from 'react';
import { isKoreanAnswerCorrect, isEnglishAnswerCorrect, removePunctuationAndNormalize } from '../utils/quizUtil';
import { getLevenshteinTrace } from '../utils/levenshtein';
import DiffHighlight from './DiffHighlight';

function BulkQuizView({ words, quizMode, onSubmit, onNextRound }) {
  const [guesses, setGuesses] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  const isKoreanToEnglish = quizMode === 'bulk-korean-to-english';
  const questions = useMemo(() => words.map(w => (isKoreanToEnglish ? w.korean : w.english)), [words, isKoreanToEnglish]);
  const answers = useMemo(() => words.map(w => (isKoreanToEnglish ? w.english : w.korean)), [words, isKoreanToEnglish]);

  useEffect(() => {
    const initialGuesses = {};
    words.forEach(word => {
      initialGuesses[word.id] = '';
    });
    setGuesses(initialGuesses);
    setResults(null);
  }, [words]);

  const handleInputChange = (wordId, value) => {
    setGuesses(prev => ({ ...prev, [wordId]: value }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    const submissionResults = words.map(word => {
      const guess = guesses[word.id] || '';
      const isCorrect = isKoreanToEnglish
        ? isEnglishAnswerCorrect(guess, word)
        : isKoreanAnswerCorrect(guess, word);
      
      let diffTrace = null;
      if (!isCorrect) {
        const correctAnswer = isKoreanToEnglish ? word.english.split(',')[0].trim() : word.korean;
        const cleanedGuess = removePunctuationAndNormalize(guess);
        const cleanedCorrect = removePunctuationAndNormalize(correctAnswer);
        diffTrace = getLevenshteinTrace(cleanedGuess.toLowerCase(), cleanedCorrect.toLowerCase());
      }

      return {
        wordId: word.id,
        guess,
        isCorrect,
        diffTrace,
        word,
      };
    });

    await onSubmit(submissionResults);
    setResults(submissionResults);
    setIsSubmitting(false);
  };

  const handleNextRound = () => {
    setResults(null);
    onNextRound();
  };

  if (!words.length) {
    return <div className="text-center text-gray-400">Loading words for bulk quiz...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-center mb-4">
        {isKoreanToEnglish ? 'Translate all to English' : 'Translate all to Korean'}
      </h2>
      <div className="space-y-4">
        {words.map(word => (
          <div key={word.id} className={`p-4 rounded-lg ${results ? (results.find(r => r.wordId === word.id)?.isCorrect ? 'bg-green-900/50' : 'bg-red-900/50') : 'bg-gray-700'}`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <p className="text-lg font-semibold text-white text-center md:text-left">
                {isKoreanToEnglish ? word.korean : word.english}
              </p>
              <input
                type="text"
                value={guesses[word.id] || ''}
                onChange={e => handleInputChange(word.id, e.target.value)}
                disabled={!!results}
                className="shadow appearance-none border rounded w-full py-2 px-3 bg-gray-600 text-white leading-tight focus:outline-none focus:shadow-outline"
                placeholder={isKoreanToEnglish ? 'Type English translation...' : 'Type Korean translation...'}
              />
            </div>
            {results && !results.find(r => r.wordId === word.id)?.isCorrect && (
              <div className="mt-2">
                <p className="text-sm text-red-300">
                  Correct answer: <span className="font-bold">{isKoreanToEnglish ? word.english : word.korean}</span>
                </p>
                <DiffHighlight trace={results.find(r => r.wordId === word.id)?.diffTrace} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-6 text-center">
        {!results ? (
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg focus:outline-none focus:shadow-outline disabled:opacity-50"
          >
            {isSubmitting ? 'Checking...' : 'Check All Answers'}
          </button>
        ) : (
          <button
            onClick={handleNextRound}
            className="bg-purple-600 hover:bg-purple-800 text-white font-bold py-3 px-6 rounded-lg focus:outline-none focus:shadow-outline"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

export default BulkQuizView;
