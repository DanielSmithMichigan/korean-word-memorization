import React from 'react';
import PropTypes from 'prop-types';
import Quiz from '../quiz/Quiz';

const VocabularyQuiz = ({ vocabulary, onComplete }) => {
  if (!vocabulary || vocabulary.length === 0) {
    return <div>Loading vocabulary...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold">Vocabulary Quiz</h1>
        <p className="text-lg text-gray-400">Translate the English word into Korean.</p>
      </div>
      <Quiz vocabulary={vocabulary} />
      <div className="flex justify-center space-x-4 mt-6">
        <button
          onClick={onComplete}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300"
        >
          Quiz Phrase
        </button>
      </div>
    </div>
  );
};

VocabularyQuiz.propTypes = {
  vocabulary: PropTypes.arrayOf(PropTypes.shape({
    korean: PropTypes.string.isRequired,
    english: PropTypes.string.isRequired,
  })).isRequired,
  onComplete: PropTypes.func.isRequired,
};

export default VocabularyQuiz;