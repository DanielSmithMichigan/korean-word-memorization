import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Uploader from './Uploader';
import Quiz from './quiz/Quiz';
import QuizSetup from './QuizSetup';
import SentenceQuizPackages from './sentence/SentenceQuizPackages';
import SentenceQuiz from './sentence/SentenceQuiz';
import Navbar from './Navbar';
import GenerateSentenceQuiz from './sentence/GenerateSentenceQuiz';
import WordPairExtractor from './WordPairExtractor';
import TypingTest from './TypingTest';
import Overwatch from './overwatch/Overwatch';
import BundleSelector from './overwatch/BundleSelector';
import ChatCoach from './ChatCoach';
import BulkKoreanReveal from './quiz/BulkKoreanReveal';
import ExamSetup from './exam/ExamSetup';
import ExamTaking from './exam/ExamTaking';
import ExamResults from './exam/ExamResults';
import ExamList from './exam/ExamList';

function App() {
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const userIdFromQuery = queryParams.get('userId');
    if (userIdFromQuery) {
      setUserId(userIdFromQuery);
    } else {
      // Redirect or set a default user
      queryParams.set('userId', 'test-user');
      window.location.href = `${window.location.pathname}?${queryParams.toString()}`;
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
          <Route path="/quiz" element={<Quiz userId={userId} onQuizFocus={() => { }} />} />
          <Route path="/korean-reveal" element={<BulkKoreanReveal userId={userId} />} />
          <Route path="/typing-test" element={<TypingTest userId={userId} />} />
          <Route path="/extractor" element={<WordPairExtractor userId={userId} />} />
          <Route path="/chat-coach" element={<ChatCoach userId={userId} />} />
          <Route path="/overwatch" element={<BundleSelector />} />
          <Route path="/overwatch/quiz/*" element={<Overwatch />} />
          <Route path="/sentence-quizzes" element={<SentenceQuizPackages userId={userId} />} />
          <Route path="/sentence-quiz/:id" element={<SentenceQuiz userId={userId} />} />
          <Route path="/sentence-quiz/generate" element={<GenerateSentenceQuiz userId={userId} />} />
          <Route path="/exam/setup" element={<ExamSetup userId={userId} />} />
          <Route path="/exams" element={<ExamList userId={userId} />} />
          <Route path="/exam/:examId" element={<ExamTaking userId={userId} />} />
          <Route path="/exam/:examId/results" element={<ExamResults />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
