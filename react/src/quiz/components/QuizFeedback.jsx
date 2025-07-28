import React from 'react';

function QuizFeedback({ isCorrectGuess, wasFlipped, hasGuessedWrongOnce, word, quizMode }) {
  if (isCorrectGuess) {
    if (wasFlipped) {
      return (
        <div className="mt-4 p-4 bg-yellow-800 bg-opacity-80 border border-yellow-600 rounded-lg text-center">
          <p className="text-xl font-bold text-yellow-200">Correct - but you flipped the card</p>
        </div>
      );
    }
    return (
      <div className="mt-4 p-4 bg-green-900 border border-green-700 rounded-lg text-center">
        <p className="text-xl font-bold text-green-300">Correct!</p>
      </div>
    );
  }

  if (hasGuessedWrongOnce) {
    const correctAnswer = (quizMode === 'korean-to-english' || quizMode === 'audio-to-english') ? word.english : word.korean;
    return (
      <p className="text-red-500 text-center mt-2">
        Incorrect. The correct answer is: <span className="font-bold">{correctAnswer}</span>. Please type it correctly to continue.
      </p>
    );
  }

  return null;
}

export default QuizFeedback;
