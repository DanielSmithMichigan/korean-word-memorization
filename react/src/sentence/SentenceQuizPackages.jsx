import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { listSentenceQuizPackages } from '../quiz/actions/quizApi';

function SentenceQuizPackages({ userId }) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const query = location.search || '';

  useEffect(() => {
    let mounted = true;
    const fetchPkgs = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listSentenceQuizPackages(userId);
        if (mounted) setPackages(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Failed to load sentence quiz packages');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (userId) fetchPkgs();
    return () => { mounted = false; };
  }, [userId]);

  return (
    <div className="max-w-2xl mx-auto px-2 py-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6">Sentence Quiz Packages</h2>
      {loading && <p className="text-center text-gray-400">Loading...</p>}
      {error && <p className="text-center text-red-400">{error}</p>}
      {!loading && !error && packages.length === 0 && (
        <div className="text-center text-gray-300 bg-gray-800 p-6 rounded-xl">
          <p>No sentence quiz packages yet.</p>
          <div className="mt-4">
            <Link to={`/quiz-setup${query}`} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded">Create one</Link>
          </div>
        </div>
      )}

      <ul className="space-y-4">
        {packages.map((pkg) => (
          <li key={pkg.id} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between">
            <div>
              <div className="font-semibold">{pkg.customIdentifier || pkg.createdAt}</div>
              <div className="text-sm text-gray-400">
                {pkg.quizzes?.length || 0} sentences · {pkg.vocabulary?.length || 0} vocab
                {pkg.mode && (
                  <>
                    {' '}· Mode: {pkg.mode === 'translateEnglishToKorean' ? 'English → Korean' : (pkg.mode === 'summarizeKoreanAudioToEnglish' ? 'Summarize Audio → English' : 'Summarize Written → English')}
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded" onClick={() => navigate(`/sentence-quiz/${pkg.id}${query}`)}>Do quiz</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SentenceQuizPackages;


