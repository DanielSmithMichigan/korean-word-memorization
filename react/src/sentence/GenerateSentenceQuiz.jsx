import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { generateSentenceQuizPackage } from '../quiz/actions/quizApi';

function GenerateSentenceQuiz({ userId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  // Expect navigation state to include: requiredWords, activeVocabulary, packagesUsed
  const navState = location.state || {};
  const { requiredWords = [], activeVocabulary = [], packagesUsed = [] } = navState;

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!userId || !requiredWords || requiredWords.length === 0) {
        navigate(-1);
        return;
      }
      try {
        const pkg = await generateSentenceQuizPackage({
          userId,
          requiredWords,
          activeVocabulary,
          packagesUsed,
          onProgress: (p) => mounted && setProgress(p),
        });
        if (mounted) {
          const q = location.search || '';
          navigate(`/sentence-quiz/${pkg.id}${q}`, { replace: true });
        }
      } catch (e) {
        console.error(e);
        if (mounted) setError('Failed to generate sentence quiz');
      }
    };
    run();
    return () => { mounted = false; };
  }, [userId]);

  const pct = Math.max(5, Math.floor(progress * 100));

  return (
    <div className="max-w-2xl mx-auto px-2 py-10">
      <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Generating Sentence Quiz</h2>
      {error && <p className="text-center text-red-400 mb-6">{error}</p>}
      <div className="w-full bg-gray-800 rounded-full h-3">
        <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-center mt-3 text-gray-300">{pct}%</p>
    </div>
  );
}

export default GenerateSentenceQuiz;


