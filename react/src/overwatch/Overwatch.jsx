import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaSync, FaVolumeUp } from 'react-icons/fa';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

// Helper functions for UTF-8 safe Base64 encoding/decoding
const bytesToBase64 = (bytes) => {
  const binString = String.fromCodePoint(...bytes);
  return btoa(binString);
}

const base64ToBytes = (base64) => {
  const binString = atob(base64);
  return Uint8Array.from(binString, (m) => m.codePointAt(0));
}

// Fisher-Yates shuffle function
const shuffleArray = (array) => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

function Overwatch() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const bundleId = params['*'];
  const [bundleQuizzes, setBundleQuizzes] = useState([]);
  const [quizData, setQuizData] = useState(null);
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [selectedWords, setSelectedWords] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const audioRef = useRef(null);

  const setQuiz = (quiz) => {
    setQuizData(quiz);
    setCurrentWordIndex(0);
    setSelectedWords([]);
    setFeedback(null);
  };

  const selectRandomQuizAndRedirect = (quizzes, currentQuizId = null) => {
    let quizToStart;
    if (quizzes.length === 1) {
      quizToStart = quizzes[0];
    } else {
      const availableQuizzes = quizzes.filter(q => q.id !== currentQuizId);
      quizToStart = availableQuizzes[Math.floor(Math.random() * availableQuizzes.length)];
    }
    
    const quizId = quizToStart.id;
    const encodedBytes = new TextEncoder().encode(quizId);
    const encodedId = bytesToBase64(encodedBytes);
    navigate(`?quiz=${encodeURIComponent(encodedId)}`);
  };

  useEffect(() => {
    const fetchQuizData = async () => {
      if (!bundleId) return;

      const apiEndpoint = `https://y532iwg71e.execute-api.us-east-1.amazonaws.com/prod/quizzes/${bundleId}`;

      try {
        const response = await fetch(apiEndpoint);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        if (data && data.length > 0) {
          setBundleQuizzes(data);
        } else {
          console.error("No quiz data found for this bundle.");
          setBundleQuizzes([]);
        }
      } catch (error) {
        console.error("Failed to fetch quiz data from API, loading mock data.", error);
        const { quiz } = await import('./quiz');
        setBundleQuizzes([quiz]);
      }
    };

    fetchQuizData();
  }, [bundleId]);

  useEffect(() => {
    if (bundleQuizzes.length === 0) {
      return;
    }

    const queryParams = new URLSearchParams(location.search);
    const quizQuery = queryParams.get('quiz');

    if (quizQuery) {
      try {
        const decodedBytes = base64ToBytes(decodeURIComponent(quizQuery));
        const decodedId = new TextDecoder().decode(decodedBytes);
        const quizToStart = bundleQuizzes.find(q => q.id === decodedId);
        
        if (quizToStart) {
          setQuiz(quizToStart);
        } else {
          console.error("Quiz from URL not found in bundle.");
          // Maybe navigate to an error page or the bundle selector
        }
      } catch (e) {
        console.error("Failed to decode quiz from URL.", e);
      }
    } else {
      console.log("No quiz query found in URL.");
      // On page load, we expect a quiz query. If none, maybe redirect.
    }
  }, [bundleQuizzes, location.search]);

  useEffect(() => {
    if (quizData && quizData.korean_audio_url && audioRef.current) {
      audioRef.current.play().catch(error => {
        console.warn("Audio autoplay was blocked by the browser:", error);
      });
    }
  }, [quizData]);

  const shuffledOptions = useMemo(() => {
    if (!quizData || !quizData.korean_choices || currentWordIndex >= quizData.korean_choices.length) {
      return [];
    }
    return shuffleArray(quizData.korean_choices[currentWordIndex].options);
  }, [quizData, currentWordIndex]);

  const handlePlayAudio = () => {
    if (audioRef.current) {
      audioRef.current.play();
    }
  };

  const handleNextQuiz = () => {
    selectRandomQuizAndRedirect(bundleQuizzes, quizData.id);
  };


const handleRegenerate = async () => {
    if (!quizData) return;

    setIsRegenerating(true);
    setFeedback(null);

    const apiEndpoint = 'https://i3mbntqoq8.execute-api.us-east-1.amazonaws.com/prod/quizzes/regenerate';

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bundleId: quizData.bundle_id,
          koreanPhrase: quizData.id,
          korean_audio_key: quizData.korean_audio_key,
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const newQuizData = await response.json();
      
      setQuizData(newQuizData);
      // Also update the quiz in the bundleQuizzes list
      const updatedQuizzes = bundleQuizzes.map(q => q.id === newQuizData.id ? newQuizData : q);
      setBundleQuizzes(updatedQuizzes);

      // Reset quiz state for the new content
      setCurrentWordIndex(0);
      setSelectedWords([]);
      setFeedback({ regenerated: true });

    } catch (error) {
      console.error("Failed to regenerate quiz content.", error);
      setFeedback({ error: 'Failed to regenerate content.' });
    } finally {
      setIsRegenerating(false);
    }
  };

  if (!quizData) {
    return <div>Loading quiz for bundle: {bundleId}...</div>;
  }

  const handleOptionClick = (option) => {
    const correctWord = quizData.korean_choices[currentWordIndex].correct;
    const stripTrailingPunctuation = (str) => str.replace(/[.,!?;:]$/, '');

    const normalizedOption = stripTrailingPunctuation(option);
    const normalizedCorrectWord = stripTrailingPunctuation(correctWord);
    
    if (normalizedOption === normalizedCorrectWord) {
      setSelectedWords([...selectedWords, option]);
      setCurrentWordIndex(currentWordIndex + 1);
      setFeedback({ correct: true, word: option });
    } else {
      setFeedback({ correct: false, word: option });
    }
  };

  const isQuizComplete = quizData.korean_choices && currentWordIndex >= quizData.korean_choices.length;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Overwatch Quiz - {bundleId}</h1>
      <div className="mb-4">
        <h2 className="text-xl">Reconstruct the Korean sentence:</h2>
        <div className="p-4 my-2 bg-gray-800 rounded flex items-center">
          <span className="flex-grow">{selectedWords.join(' ')}</span>
          {quizData.korean_audio_url && (
            <button onClick={handlePlayAudio} className="ml-4 p-2 rounded-full bg-gray-600 hover:bg-gray-500">
              <FaVolumeUp className="w-6 h-6 text-white" />
            </button>
          )}
          <button onClick={handleRegenerate} disabled={isRegenerating} className="ml-4 p-2 rounded-full bg-gray-600 hover:bg-gray-500 disabled:bg-gray-400 disabled:cursor-not-allowed">
            <FaSync className={`w-6 h-6 text-white ${isRegenerating ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {isQuizComplete ? (
        <div className="mt-4 text-center">
          <h3 className="text-lg font-bold text-green-500">Correct!</h3>
          <p className="mt-2">The full sentence is: {quizData.korean_sentence.join(' ')}</p>
          <div className="mt-4 p-4 bg-gray-800 rounded">
            <p className="text-lg">{quizData.english_sentence.join(' ')}</p>
            <p className="text-sm text-gray-400 mt-2">(Translation provided by Gemini and may contain inaccuracies)</p>
          </div>

          {quizData.conciseTranslationExplanation && (
            <div className="mt-6 p-4 bg-gray-800 rounded">
              <h4 className="text-lg font-bold mb-2">Explanation:</h4>
              <p>{quizData.conciseTranslationExplanation}</p>
            </div>
          )}

          <button 
            onClick={handleNextQuiz}
            className="mt-8 px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
          >
            Next Quiz
          </button>
        </div>
      ) : (
        <div>
          <div className="flex flex-col md:grid md:grid-cols-2 gap-4">
            {shuffledOptions.map((option, index) => (
              <button
                key={index}
                onClick={() => handleOptionClick(option)}
                className="w-full md:w-auto p-4 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded text-2xl"
              >
                {option}
              </button>
            ))}
          </div>
          {feedback && (
            <div className={`mt-4 p-2 rounded ${feedback.correct ? 'bg-green-500' : feedback.error ? 'bg-red-500' : 'bg-blue-500'}`}>
              {feedback.correct !== undefined && (feedback.correct ? `Correct! The word was "${feedback.word}".` : `Incorrect. You chose "${feedback.word}".`)}
              {feedback.regenerated && 'Content regenerated successfully!'}
              {feedback.error && feedback.error}
            </div>
          )}
        </div>
      )}
      {quizData.korean_audio_url && (
        <audio ref={audioRef} src={quizData.korean_audio_url} preload="auto" />
      )}
    </div>
  );
}

export default Overwatch;
