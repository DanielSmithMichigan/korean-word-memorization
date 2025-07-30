import React from 'react';
import DiffHighlight from './DiffHighlight';

function QuizFeedback({
  isCorrectGuess,
  wasFlipped,
  hasGuessedWrongOnce,
  word,
  quizMode,
  diffTrace,
}) {
  let content = null;

  if (isCorrectGuess) {
    content = (
      <div className="text-center p-4 rounded-lg bg-green-900 text-green-200">
        <p className="font-bold">Correct!</p>
        {wasFlipped && <p className="text-sm">But you used "Flip Card", so it won't count as a success.</p>}
      </div>
    );
  } else if (hasGuessedWrongOnce) {
    const correctAnswer = quizMode === 'english-to-korean' ? word.korean : word.english;
    content = (
      <div className="text-center p-4 rounded-lg bg-red-900 text-red-200">
        <p className="font-bold">Incorrect.</p>
        {diffTrace ? (
          <>
            <p className="text-sm mt-1">Here are the differences to help you correct it:</p>
            <DiffHighlight trace={diffTrace} />
          </>
        ) : (
          <p className="text-sm mt-1">The correct answer was: <span className="font-bold">{correctAnswer}</span></p>
        )}
      </div>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-col justify-center">
      {content}
    </div>
  );
}

export default QuizFeedback;
