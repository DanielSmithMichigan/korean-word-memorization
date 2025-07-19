import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Uploader from './Uploader';
import Quiz from './quiz/Quiz';
import QuizSetup from './QuizSetup';
import Navbar from './Navbar';
import WordPairExtractor from './WordPairExtractor';
import TypingTest from './TypingTest';

function App() {
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const userIdFromQuery = queryParams.get('userId');
    if (userIdFromQuery) {
      setUserId(userIdFromQuery);
    } else {
      // Redirect or set a default user
      window.location.href = `${window.location.pathname}?userId=test-user`;
    }
  }, []);

  if (!userId) {
    return <div className="text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Navbar />
      <div className="container mx-auto p-8">
        <Routes>
          <Route path="/" element={<Uploader userId={userId} />} />
          <Route path="/quiz-setup" element={<QuizSetup userId={userId} />} />
          <Route path="/quiz" element={<Quiz userId={userId} onQuizFocus={() => {}} />} />
          <Route path="/typing-test" element={<TypingTest userId={userId} />} />
          <Route path="/extractor" element={<WordPairExtractor userId={userId} />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
