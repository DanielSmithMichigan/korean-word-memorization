import React, { useState, useEffect } from 'react';
import TypingPractice from './TypingPractice';

const GET_WORD_PAIRS_API_ENDPOINT = 'https://jc3dje5ogg.execute-api.us-east-1.amazonaws.com/prod/';

function TypingTest({ userId }) {
  const [testState, setTestState] = useState('choosing'); // 'choosing', 'loading', 'ready'
  const [testType, setTestType] = useState(null);
  const [wordSource, setWordSource] = useState(null);

  const fetchAllWords = async () => {
    setTestState('loading');
    let allWords = [];
    let lastEvaluatedKey = null;
    try {
      do {
        const url = new URL(GET_WORD_PAIRS_API_ENDPOINT);
        url.searchParams.append('userId', userId);
        if (lastEvaluatedKey) {
          url.searchParams.append('lastEvaluatedKey', JSON.stringify(lastEvaluatedKey));
        }
        const response = await fetch(url);
        const data = await response.json();

        for (const item of data.Items) {
          if (item.wordPairs && item.wordPairs.length > 0) {
            item.wordPairs.forEach(word => allWords.push(word.korean));
          }
        }
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      if (allWords.length === 0) {
        alert("No words found for this user. Please upload some words first.");
        setTestState('choosing');
        return;
      }
      
      setWordSource(allWords);
      setTestState('ready');

    } catch (error) {
      console.error('Error fetching word packages:', error);
      alert("There was an error fetching your words. Please try again.");
      setTestState('choosing');
    }
  };

  const handleChoice = (type) => {
    setTestType(type);
    if (type === 'letters') {
      setWordSource('letters');
      setTestState('ready');
    } else if (type === 'words') {
      fetchAllWords();
    }
  };

  const handleBack = () => {
    setTestState('choosing');
    setTestType(null);
    setWordSource(null);
  };

  if (testState === 'ready') {
    return (
      <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
        <h2 className="text-3xl font-bold text-white mb-8 text-center">Typing Test: {testType === 'letters' ? 'Letters' : 'Words'}</h2>
        <TypingPractice
          key={JSON.stringify(wordSource)}
          wordSource={wordSource}
          onBack={handleBack}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg text-center">
      <h2 className="text-3xl font-bold text-white mb-8">Typing Test</h2>
      {testState === 'loading' ? (
        <p className="text-xl text-gray-300">Loading all your words...</p>
      ) : (
        <>
          <p className="text-xl text-gray-300 mb-8">What would you like to practice?</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => handleChoice('letters')}
              className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-3 px-6 rounded-lg focus:outline-none focus:shadow-outline text-lg"
            >
              Practice Letters (Hangul)
            </button>
            <button
              onClick={() => handleChoice('words')}
              className="bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-6 rounded-lg focus:outline-none focus:shadow-outline text-lg"
            >
              Practice Words
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default TypingTest;
