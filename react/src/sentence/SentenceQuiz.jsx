import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { fetchAudio, getSentenceQuizById } from '../quiz/actions/quizApi';
import { removePunctuationAndNormalize } from '../quiz/utils/quizUtil';
import { getLevenshteinTrace } from '../quiz/utils/levenshtein';

function SentenceQuiz({ userId }) {
  const { id } = useParams();
  const location = useLocation();
  const [pkg, setPkg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [hasGuessedWrongOnce, setHasGuessedWrongOnce] = useState(false);
  const [diffTrace, setDiffTrace] = useState(null);
  const [showVocab, setShowVocab] = useState(false);
  const [revealedVocab, setRevealedVocab] = useState(new Set());
  const [useGoogleCloud, setUseGoogleCloud] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSentenceQuizById(userId, id);
        if (mounted) setPkg(data);
      } catch (e) {
        console.error(e);
        if (mounted) setError('Failed to load sentence quiz');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    if (userId && id) run();
    return () => { mounted = false; };
  }, [userId, id]);

  const sentence = useMemo(() => {
    if (!pkg || !pkg.quizzes || pkg.quizzes.length === 0) return null;
    const idx = Math.max(0, Math.min(currentIndex, pkg.quizzes.length - 1));
    return pkg.quizzes[idx];
  }, [pkg, currentIndex]);

  useEffect(() => {
    // Reset state on sentence change
    setIsFlipped(false);
    setAnswer('');
    setIsSubmitting(false);
    setIsCorrect(false);
    setHasGuessedWrongOnce(false);
    setDiffTrace(null);
  }, [currentIndex]);

  const total = pkg?.quizzes?.length || 0;
  const pct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;

  const playKoreanAudio = async (overwrite = false) => {
    if (!sentence?.korean) return;
    try {
      setIsAudioLoading(true);
      const url = await fetchAudio(sentence.korean, useGoogleCloud, overwrite, 'ko');
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.play();
    } catch (e) {
      console.error('Failed to fetch/play audio', e);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    if (!sentence) return;
    if (isCorrect) {
      return;
    }
    setIsSubmitting(true);
    const cleanedGuess = removePunctuationAndNormalize(answer || '');
    const cleanedCorrect = removePunctuationAndNormalize(sentence.korean || '');
    const correctNow = cleanedGuess.toLowerCase() === cleanedCorrect.toLowerCase();
    if (correctNow) {
      setIsCorrect(true);
      setDiffTrace(null);
      setHasGuessedWrongOnce(false);
      setIsSubmitting(false);
      playKoreanAudio(false);
    } else {
      setHasGuessedWrongOnce(true);
      setIsSubmitting(false);
      setDiffTrace(getLevenshteinTrace(cleanedGuess.toLowerCase(), cleanedCorrect.toLowerCase()));
    }
  };

  const goPrev = () => {
    if (!pkg || !pkg.quizzes) return;
    setCurrentIndex((idx) => Math.max(0, idx - 1));
  };
  const goNext = () => {
    if (!pkg || !pkg.quizzes) return;
    setCurrentIndex((idx) => Math.min(pkg.quizzes.length - 1, idx + 1));
  };

  const toggleReveal = (korean) => {
    const next = new Set(revealedVocab);
    if (next.has(korean)) next.delete(korean); else next.add(korean);
    setRevealedVocab(next);
  };

  if (loading) return <div className="text-center text-gray-400 p-8">Loading sentence quiz...</div>;
  if (error) return <div className="text-center text-red-400 p-8">{error}</div>;
  if (!pkg || !sentence) return <div className="text-center text-gray-400 p-8">No sentence quiz found.</div>;

  return (
    <div className="max-w-3xl mx-auto px-2 py-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Sentence Quiz</h2>
      <p className="text-center text-gray-400 mb-6">{currentIndex + 1} / {total} · {pct}%</p>

      <div className="bg-gray-800 p-5 rounded-xl shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="text-gray-300 text-sm">English → Korean</div>
          <div className="flex gap-2">
            <button
              className={`px-3 py-1.5 rounded-md ${isAudioLoading ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              onClick={() => playKoreanAudio(false)}
              disabled={isAudioLoading}
            >
              ▶ Speaker
            </button>
            <button
              className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => playKoreanAudio(true)}
            >
              Regenerate
            </button>
            <button
              className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              Flip Card
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-gray-900 p-4">
          {!isFlipped ? (
            <div>
              <div className="text-gray-300">English</div>
              <div className="text-xl sm:text-2xl text-white leading-snug">{sentence.english}</div>
            </div>
          ) : (
            <div>
              <div className="text-gray-300">Korean</div>
              <div className="text-xl sm:text-2xl text-white leading-snug">{sentence.korean}</div>
            </div>
          )}
        </div>

        <form onSubmit={onSubmit} className="mt-4">
          <label className="block text-gray-300 mb-2">Type the Korean sentence</label>
          <textarea
            className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="한국어 문장을 입력하세요..."
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              type="submit"
              className={`px-4 py-2 rounded-lg ${isCorrect ? 'bg-green-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
              disabled={isSubmitting}
            >
              {isCorrect ? 'Correct!' : (isSubmitting ? 'Checking...' : 'Check')}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white"
              onClick={() => setIsFlipped(!isFlipped)}
            >
              Flip Card
            </button>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex === 0}
                className={`px-3 py-2 rounded ${currentIndex === 0 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              >Prev</button>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIndex >= total - 1}
                className={`px-3 py-2 rounded ${currentIndex >= total - 1 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              >Next</button>
            </div>
          </div>
        </form>

        {diffTrace && !isCorrect && (
          <div className="mt-3 p-3 rounded bg-gray-900 text-gray-200 text-sm">
            <div className="mb-1 text-gray-400">Difference to target:</div>
            <pre className="whitespace-pre-wrap break-words">{JSON.stringify(diffTrace, null, 2)}</pre>
          </div>
        )}

        <div className="mt-6">
          <button
            className="text-gray-300 hover:text-white"
            onClick={() => setShowVocab((v) => !v)}
          >
            {showVocab ? '[-] Hide Vocabulary' : '[+] Show Vocabulary'}
          </button>
          {showVocab && (
            <div className="mt-3 bg-gray-900 rounded-lg p-3">
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(pkg.vocabulary || []).map((w, idx) => {
                  const isShown = revealedVocab.has(w.korean);
                  return (
                    <li key={`${w.korean}-${idx}`} className="p-2 rounded bg-gray-800 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-gray-200">{w.english}</div>
                        <div className="text-gray-400 text-sm">{isShown ? w.korean : '— — —'}</div>
                      </div>
                      <button
                        className="px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                        onClick={() => toggleReveal(w.korean)}
                      >{isShown ? 'Hide' : 'Reveal'}</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-6 bg-gray-900 rounded-lg p-3">
          <button
            className="text-gray-400 hover:text-white"
            onClick={() => setUseGoogleCloud((b) => !b)}
          >
            {useGoogleCloud ? '[ Advanced: Using Google Cloud TTS ]' : '[ Advanced: Using Gemini TTS ]'}
          </button>
          <div className="mt-2 text-gray-400 text-sm">TTS Provider: {useGoogleCloud ? 'Google Cloud' : 'Gemini'}</div>
        </div>
      </div>
    </div>
  );
}

export default SentenceQuiz;


