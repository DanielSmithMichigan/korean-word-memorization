import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { fetchAudio, getSentenceQuizById, askSentenceFeedback, gradeSummaryFeedback, fetchAllWordPairs } from '../quiz/actions/quizApi';
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
  const [feedback, setFeedback] = useState(null);
  const [isAskingFeedback, setIsAskingFeedback] = useState(false);
  const [isGradingSummary, setIsGradingSummary] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [packageVocabulary, setPackageVocabulary] = useState([]);
  const [useGoogleCloud, setUseGoogleCloud] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const audioRef = useRef(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [showKoreanText, setShowKoreanText] = useState(false);
  const audioHandlersRef = useRef(null);
  const loopStartRef = useRef(null);
  const loopEndRef = useRef(null);
  const loopEnabledRef = useRef(false);
  const durationRef = useRef(0);

  const formatTime = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  useEffect(() => { loopStartRef.current = loopStart; }, [loopStart]);
  useEffect(() => { loopEndRef.current = loopEnd; }, [loopEnd]);
  useEffect(() => { loopEnabledRef.current = loopEnabled; }, [loopEnabled]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  const effectiveLoopStart = useMemo(() => {
    const d = duration || 0;
    const a = (typeof loopStart === 'number') ? loopStart : 0;
    return Math.max(0, Math.min(a, d));
  }, [loopStart, duration]);
  const effectiveLoopEnd = useMemo(() => {
    const d = duration || 0;
    const b = (typeof loopEnd === 'number') ? loopEnd : d;
    return Math.max(0, Math.min(b, d));
  }, [loopEnd, duration]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getSentenceQuizById(userId, id);
        if (mounted) {
          const shuffle = (input) => {
            const arr = Array.isArray(input) ? [...input] : [];
            for (let i = arr.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              const tmp = arr[i];
              arr[i] = arr[j];
              arr[j] = tmp;
            }
            return arr;
          };
          const shuffled = { ...data, quizzes: shuffle(data?.quizzes) };
          setPkg(shuffled);
        }
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

  useEffect(() => {
    let cancelled = false;
    const loadPackageVocabulary = async () => {
      try {
        const used = Array.isArray(pkg?.packagesUsed) ? pkg.packagesUsed.filter(Boolean) : [];
        if (!userId || used.length === 0) {
          if (!cancelled) setPackageVocabulary([]);
          return;
        }
        const results = await Promise.all(used.map(async (pkgId) => {
          try {
            const items = await fetchAllWordPairs(userId, { id: pkgId });
            return Array.isArray(items) ? items : [];
          } catch (_) {
            return [];
          }
        }));
        const items = results.flat();
        const words = [];
        for (const it of items) {
          const pairs = Array.isArray(it?.wordPairs) ? it.wordPairs : [];
          for (const p of pairs) {
            if (p && p.korean && p.english) words.push({ korean: p.korean, english: p.english });
          }
        }
        // Dedupe by korean (case-insensitive)
        const seen = new Set();
        const deduped = [];
        for (const w of words) {
          const key = String(w.korean || '').trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          deduped.push(w);
        }
        if (!cancelled) setPackageVocabulary(deduped);
      } catch (_) {
        if (!cancelled) setPackageVocabulary([]);
      }
    };
    loadPackageVocabulary();
    return () => { cancelled = true; };
  }, [pkg?.packagesUsed, userId]);

  const sentence = useMemo(() => {
    if (!pkg || !pkg.quizzes || pkg.quizzes.length === 0) return null;
    const idx = Math.max(0, Math.min(currentIndex, pkg.quizzes.length - 1));
    return pkg.quizzes[idx];
  }, [pkg, currentIndex]);

  const mode = pkg?.mode || 'translateEnglishToKorean';
  const isMode1 = mode === 'translateEnglishToKorean';
  const isMode2 = mode === 'summarizeWrittenKoreanToEnglish';
  const isMode3 = mode === 'summarizeKoreanAudioToEnglish';

  const englishSentence = sentence?.english || '';

  const computeSorted = (vocab, sentenceEnglish) => {
    const list = Array.isArray(vocab) ? vocab : [];
    if (!list.length || !sentenceEnglish) return list;
    const normalizedSentence = removePunctuationAndNormalize(sentenceEnglish).toLowerCase();
    const sentenceTokens = normalizedSentence.split(' ').filter(Boolean);
    const distanceOf = (englishWord) => {
      const normalizedWord = removePunctuationAndNormalize(String(englishWord || '').toLowerCase());
      if (!normalizedWord) return Number.MAX_SAFE_INTEGER;
      let min = Infinity;
      for (const token of sentenceTokens) {
        const trace = getLevenshteinTrace(normalizedWord, token);
        const dist = trace.reduce((acc, step) => acc + (step.type === 'equal' ? 0 : 1), 0);
        if (dist < min) min = dist;
      }
      return min;
    };
    const withScore = list.map((w) => ({ w, score: distanceOf(w.english) }));
    withScore.sort((a, b) => a.score - b.score);
    return withScore.map((x) => x.w);
  };

  const sortedQuizVocabulary = useMemo(() => computeSorted(pkg?.vocabulary || [], englishSentence), [pkg, englishSentence]);

  const filteredPackageVocabulary = useMemo(() => {
    const quizSet = new Set((pkg?.vocabulary || []).map((v) => String(v.korean || '').trim().toLowerCase()));
    return (packageVocabulary || []).filter((v) => !quizSet.has(String(v.korean || '').trim().toLowerCase()));
  }, [packageVocabulary, pkg]);

  const sortedPackageVocabulary = useMemo(() => computeSorted(filteredPackageVocabulary, englishSentence), [filteredPackageVocabulary, englishSentence]);

  useEffect(() => {
    // Reset state on sentence change
    setIsFlipped(false);
    setAnswer('');
    setIsSubmitting(false);
    setIsCorrect(false);
    setHasGuessedWrongOnce(false);
    setDiffTrace(null);
    setFeedback(null);
    setDuration(0);
    setCurrentTimeSec(0);
    setLoopStart(null);
    setLoopEnd(null);
    setLoopEnabled(false);
    setShowKoreanText(false);
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current = null;
    }
  }, [currentIndex]);

  const total = pkg?.quizzes?.length || 0;
  const pct = total > 0 ? Math.round(((currentIndex + 1) / total) * 100) : 0;

  const playKoreanAudio = async (overwrite = false, rate = playbackRate) => {
    if (!sentence?.korean) return;
    try {
      setIsAudioLoading(true);
      const url = await fetchAudio(sentence.korean, useGoogleCloud, overwrite, 'ko');
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioHandlersRef.current) {
          const { onLoaded, onTime, onEnded } = audioHandlersRef.current;
          try {
            audioRef.current.removeEventListener('loadedmetadata', onLoaded);
            audioRef.current.removeEventListener('timeupdate', onTime);
            audioRef.current.removeEventListener('ended', onEnded);
          } catch (_) {}
          audioHandlersRef.current = null;
        }
        audioRef.current = null;
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = Math.max(0.25, Math.min(4, rate || 1));
      const onLoaded = () => {
        const d = isFinite(audio.duration) ? audio.duration : 0;
        setDuration(d);
        durationRef.current = d;
        const a = (typeof loopStartRef.current === 'number') ? loopStartRef.current : 0;
        if (loopEnabledRef.current) {
          try { audio.currentTime = Math.max(0, Math.min(a, d)); } catch (_) {}
          setCurrentTimeSec(audio.currentTime || 0);
        } else {
          setCurrentTimeSec(0);
        }
      };
      const onTime = () => {
        if (!isScrubbing) {
          const t = audio.currentTime || 0;
          const d = durationRef.current || 0;
          const a = (typeof loopStartRef.current === 'number') ? loopStartRef.current : 0;
          const b = (typeof loopEndRef.current === 'number') ? loopEndRef.current : d;
          if (loopEnabledRef.current && b > a) {
            const epsilon = 0.02;
            if (t >= (b - epsilon)) {
              try { audio.currentTime = Math.max(0, Math.min(a, d)); } catch (_) {}
              if (!audio.paused) { audio.play().catch(() => {}); }
              setCurrentTimeSec(audio.currentTime || 0);
              return;
            }
          }
          setCurrentTimeSec(t);
        }
      };
      const onEnded = () => {
        const d = durationRef.current || 0;
        const a = (typeof loopStartRef.current === 'number') ? loopStartRef.current : 0;
        const b = (typeof loopEndRef.current === 'number') ? loopEndRef.current : d;
        if (loopEnabledRef.current && b > a) {
          try { audio.currentTime = Math.max(0, Math.min(a, d)); } catch (_) {}
          audio.play().catch(() => {});
        }
      };
      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('timeupdate', onTime);
      audio.addEventListener('ended', onEnded);
      audioHandlersRef.current = { onLoaded, onTime, onEnded };
      audio.play();
    } catch (e) {
      console.error('Failed to fetch/play audio', e);
    } finally {
      setIsAudioLoading(false);
    }
  };

  const replayAudio = (rate = playbackRate) => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
        if (loopEnabled && typeof loopStart === 'number') {
          audio.currentTime = Math.max(0, loopStart);
        } else {
          audio.currentTime = 0;
        }
        audio.playbackRate = Math.max(0.25, Math.min(4, rate || 1));
        audio.play();
      } catch (e) {
        console.error('Failed to replay audio', e);
      }
    } else {
      playKoreanAudio(false, rate);
    }
  };

  const stopAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.pause();
      audio.currentTime = 0;
      setCurrentTimeSec(0);
    } catch (e) {
      console.error('Failed to stop audio', e);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (_) {}
        if (audioHandlersRef.current) {
          const { onLoaded, onTime, onEnded } = audioHandlersRef.current;
          try {
            audioRef.current.removeEventListener('loadedmetadata', onLoaded);
            audioRef.current.removeEventListener('timeupdate', onTime);
            audioRef.current.removeEventListener('ended', onEnded);
          } catch (_) {}
          audioHandlersRef.current = null;
        }
      }
    };
  }, []);

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

  const onAskFeedback = async () => {
    if (!sentence) return;
    try {
      setIsAskingFeedback(true);
      setFeedback(null);
      const res = await askSentenceFeedback({
        userId,
        userSentence: answer,
        correctSentence: sentence.korean,
        englishSentence: sentence.english,
      });
      setFeedback(res);
    } catch (e) {
      console.error('Failed to get feedback', e);
      setFeedback({ error: 'Failed to get feedback. Please try again.' });
    } finally {
      setIsAskingFeedback(false);
    }
  };

  const onGradeSummary = async () => {
    if (!sentence) return;
    try {
      setIsGradingSummary(true);
      setFeedback(null);
      const res = await gradeSummaryFeedback({
        userId,
        koreanText: sentence.korean,
        userSummaryEnglish: answer,
        referenceEnglish: sentence.english,
      });
      setFeedback(res);
    } catch (e) {
      console.error('Failed to grade summary', e);
      setFeedback({ error: 'Failed to grade summary. Please try again.' });
    } finally {
      setIsGradingSummary(false);
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

  // Removed reveal/hide toggle; vocabulary now always shows English and Korean.

  if (loading) return <div className="text-center text-gray-400 p-8">Loading sentence quiz...</div>;
  if (error) return <div className="text-center text-red-400 p-8">{error}</div>;
  if (!pkg || !sentence) return <div className="text-center text-gray-400 p-8">No sentence quiz found.</div>;

  return (
    <div className="max-w-3xl mx-auto px-2 py-6">
      <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Sentence Quiz</h2>
      <p className="text-center text-gray-400 mb-1">{currentIndex + 1} / {total} · {pct}%</p>
      <p className="text-center text-gray-500 mb-6 text-sm">
        Mode: {isMode1 ? 'English → Korean' : (isMode2 ? 'Summarize Written Korean → English' : 'Summarize Korean Audio → English')}
      </p>

      <div className="bg-gray-800 p-5 rounded-xl shadow-lg">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-gray-300 text-sm">
            {isMode1 && 'English → Korean'}
            {isMode2 && 'Summary Mode'}
            {isMode3 && 'Audio Summary Mode'}
          </div>
          <div className="grid grid-cols-1 gap-2 w-full sm:w-auto sm:grid-cols-none sm:flex sm:flex-wrap sm:items-center">
            <button
              className={`px-3 py-1.5 rounded-md w-full sm:w-auto ${isAudioLoading ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              onClick={() => playKoreanAudio(false)}
              disabled={isAudioLoading}
            >
              {isAudioLoading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Loading...
                </span>
              ) : (
                '▶ Play'
              )}
            </button>
            <button
              className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
              onClick={() => playKoreanAudio(true)}
            >
              Regenerate
            </button>
            <button
              className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
              onClick={stopAudio}
            >
              ■ Stop
            </button>
            {isMode3 && (
              <>
                <button
                  className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
                  onClick={() => { setPlaybackRate(1); replayAudio(1); }}
                >
                  1×
                </button>
                <button
                  className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
                  onClick={() => { setPlaybackRate(0.5); replayAudio(0.5); }}
                >
                  1/2×
                </button>
                <button
                  className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
                  onClick={() => { setPlaybackRate(0.33); replayAudio(0.33); }}
                >
                  1/3×
                </button>
                <button
                  className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
                  onClick={() => replayAudio(playbackRate)}
                >
                  ↺ Replay
                </button>
              </>
            )}
            {!isMode3 && (
              <button
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white w-full sm:w-auto"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                Flip Card
              </button>
            )}
          </div>
        </div>

        {audioRef.current && (
          <div className="mb-3 rounded bg-gray-900 p-3">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
              <div>{formatTime(currentTimeSec)}</div>
              <div>{formatTime(duration)}</div>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, duration || 0)}
              step={0.01}
              value={Math.min(currentTimeSec, duration || 0)}
              onChange={(e) => setCurrentTimeSec(parseFloat(e.target.value) || 0)}
              onMouseDown={() => setIsScrubbing(true)}
              onMouseUp={() => {
                setIsScrubbing(false);
                if (audioRef.current) {
                  const val = Math.min(currentTimeSec, duration || 0);
                  audioRef.current.currentTime = isFinite(val) ? val : 0;
                }
              }}
              onTouchStart={() => setIsScrubbing(true)}
              onTouchEnd={() => {
                setIsScrubbing(false);
                if (audioRef.current) {
                  const val = Math.min(currentTimeSec, duration || 0);
                  audioRef.current.currentTime = isFinite(val) ? val : 0;
                }
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-6 gap-2">
              <button
                className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => {
                  const d = duration || 0;
                  const t = Math.max(0, Math.min(currentTimeSec || 0, d));
                  setLoopStart(t);
                  if (typeof loopEnd === 'number' && loopEnd <= t) {
                    setLoopEnd(null);
                  }
                }}
              >Set A</button>
              <button
                className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => {
                  const d = duration || 0;
                  const t = Math.max(0, Math.min(currentTimeSec || 0, d));
                  setLoopEnd(t);
                  if (typeof loopStart === 'number' && t <= loopStart) {
                    setLoopStart(null);
                  }
                }}
              >Set B</button>
              <button
                className={`px-3 py-1.5 rounded-md ${loopEnabled ? 'bg-green-700 hover:bg-green-600' : 'bg-gray-700 hover:bg-gray-600'} text-white`}
                onClick={() => {
                  const next = !loopEnabled;
                  setLoopEnabled(next);
                  if (next && audioRef.current) {
                    const a = effectiveLoopStart;
                    try { audioRef.current.currentTime = a; } catch (_) {}
                    audioRef.current.play().catch(() => {});
                  }
                }}
                disabled={!(typeof loopStart === 'number' && typeof loopEnd === 'number' && loopEnd > loopStart)}
              >{loopEnabled ? 'Loop: On' : 'Loop: Off'}</button>
              <button
                className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => {
                  setLoopStart(null);
                  setLoopEnd(null);
                  setLoopEnabled(false);
                }}
              >Clear A/B</button>
              <button
                className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => { if (audioRef.current && typeof loopStart === 'number') { audioRef.current.currentTime = Math.max(0, loopStart); if (audioRef.current.paused) audioRef.current.play().catch(()=>{}); } }}
                disabled={!(typeof loopStart === 'number')}
              >↦ A</button>
              <button
                className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                onClick={() => { if (audioRef.current && typeof loopEnd === 'number') { audioRef.current.currentTime = Math.max(0, loopEnd); if (audioRef.current.paused) audioRef.current.play().catch(()=>{}); } }}
                disabled={!(typeof loopEnd === 'number')}
              >↦ B</button>
            </div>
            <div className="mt-2 text-xs text-gray-400">A: {formatTime(effectiveLoopStart)} · B: {formatTime(effectiveLoopEnd)}</div>
          </div>
        )}
        <div className="rounded-lg bg-gray-900 p-4">
          {isMode1 ? (
            !isFlipped ? (
              <div>
                <div className="text-gray-300">English</div>
                <div className="text-lg sm:text-2xl text-white leading-snug">{sentence.english}</div>
              </div>
            ) : (
              <div>
                <div className="text-gray-300">Korean</div>
                <div className="text-lg sm:text-2xl text-white leading-snug">{sentence.korean}</div>
              </div>
            )
          ) : (
            <div>
              {isMode2 ? (
                <>
                  <div className="text-gray-300">Korean</div>
                  <div className="text-lg sm:text-2xl text-white leading-snug">{sentence.korean}</div>
                </>
              ) : (
                <div>
                  <div className="text-gray-400">Audio mode: press Play above to listen to the Korean paragraph.</div>
                  <div className="mt-2">
                    <button
                      className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-white"
                      onClick={() => setShowKoreanText((v) => !v)}
                    >{showKoreanText ? 'Hide Korean Sentence' : 'Reveal Korean Sentence'}</button>
                  </div>
                  {showKoreanText && (
                    <div className="mt-3">
                      <div className="text-gray-300">Korean</div>
                      <div className="text-lg sm:text-2xl text-white leading-snug whitespace-pre-wrap break-words">{sentence.korean}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {isMode1 ? (
          <form onSubmit={onSubmit} className="mt-4">
            <label className="block text-gray-300 mb-2">Type the Korean sentence</label>
            <textarea
              className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-lg min-h-[120px] sm:min-h-[96px]"
              rows={3}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="한국어 문장을 입력하세요..."
            />
            <div className="mt-3 space-y-2 sm:space-y-0">
              <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-lg w-full sm:w-auto ${isCorrect ? 'bg-green-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                  disabled={isSubmitting}
                >
                  {isCorrect ? 'Correct!' : (isSubmitting ? 'Checking...' : 'Check')}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white w-full sm:w-auto"
                  onClick={() => setIsFlipped(!isFlipped)}
                >
                  Flip Card
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-none sm:ml-auto sm:flex sm:justify-end">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentIndex === 0}
                  className={`px-3 py-2 rounded w-full sm:w-auto ${currentIndex === 0 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                >Prev</button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={currentIndex >= total - 1}
                  className={`px-3 py-2 rounded w-full sm:w-auto ${currentIndex >= total - 1 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
                >Next</button>
              </div>
            </div>
          </form>
        ) : (
          <div className="mt-4 rounded bg-gray-900 p-4 text-gray-300">
            <div className="mb-2">{(isMode2 || isMode3) ? 'Summary Response:' : 'Summary Response (stubbed):'}</div>
            <textarea
              className="w-full bg-gray-800 text-white rounded-lg p-3 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-base sm:text-lg min-h-[120px] sm:min-h-[96px]"
              placeholder={(isMode2 || isMode3) ? 'Write your English summary here...' : 'Write your English summary here... (grading coming soon)'}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-none sm:flex sm:justify-between sm:items-center">
              <div className="text-gray-400 text-sm">{isMode3 ? 'Korean audio above; grading uses the underlying Korean text.' : 'Korean text above; reference English is used internally for grading.'}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onGradeSummary}
                  disabled={!answer || isGradingSummary}
                  className={`px-3 py-2 rounded w-full sm:w-auto ${(!answer || isGradingSummary) ? 'bg-gray-700 text-gray-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                >{isGradingSummary ? 'Grading...' : 'Grade Summary'}</button>
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex === 0}
                className={`px-3 py-2 rounded w-full sm:w-auto ${currentIndex === 0 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              >Prev</button>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIndex >= total - 1}
                className={`px-3 py-2 rounded w-full sm:w-auto ${currentIndex >= total - 1 ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
              >Next</button>
              </div>
            </div>
            {feedback && (
              <div className="mt-3 rounded bg-gray-800 p-3 text-gray-200">
                {feedback.error ? (
                  <div className="text-red-400">{feedback.error}</div>
                ) : (
                  <div className="space-y-2">
                    {(typeof feedback.score === 'number') && (
                      <div className="text-gray-300">Score: <span className="text-white">{Math.round(feedback.score)}</span></div>
                    )}
                    {feedback.verdict && (
                      <div className="text-gray-300">Verdict: <span className="text-white capitalize">{feedback.verdict}</span></div>
                    )}
                    {Array.isArray(feedback.feedback) && feedback.feedback.length > 0 && (
                      <div>
                        <div className="text-gray-300 mb-1">Feedback:</div>
                        <ul className="list-disc list-inside text-gray-200">
                          {feedback.feedback.map((f, idx) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {isMode1 && !isCorrect && hasGuessedWrongOnce && (
          <div className="mt-3 p-3 rounded bg-gray-900 text-gray-200 text-sm">
            <div className="mb-1 text-gray-400">Correct sentence:</div>
            <div className="whitespace-pre-wrap break-words text-white">{sentence.korean}</div>
            <div className="mt-3">
              <button
                type="button"
                onClick={onAskFeedback}
                className={`px-3 py-2 rounded ${isAskingFeedback ? 'bg-gray-700 text-gray-400' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                disabled={isAskingFeedback}
              >{isAskingFeedback ? 'Asking AI...' : 'Ask AI for Feedback'}</button>
            </div>
            {feedback && (
              <div className="mt-3 rounded bg-gray-800 p-3">
                {feedback.error ? (
                  <div className="text-red-400">{feedback.error}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-gray-300">AI Verdict: <span className="text-white">{feedback.verdict || (feedback.isExact ? 'exact' : (feedback.isAcceptableAlternative ? 'acceptable_alternative' : 'incorrect'))}</span></div>
                    {Array.isArray(feedback.feedback) && feedback.feedback.length > 0 && (
                      <div>
                        <div className="text-gray-300 mb-1">Feedback:</div>
                        <ul className="list-disc list-inside text-gray-200">
                          {feedback.feedback.map((f, idx) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {feedback.correctedSentence && (
                      <div>
                        <div className="text-gray-300 mb-1">Suggested correction:</div>
                        <div className="text-white">{feedback.correctedSentence}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
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
              {sortedQuizVocabulary.length > 0 && (
                <>
                  <div className="text-gray-400 text-sm mb-2">Vocabulary from this sentence quiz</div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {sortedQuizVocabulary.map((w, idx) => {
                      return (
                        <li key={`quiz-${w.korean}-${idx}`} className="p-2 rounded bg-gray-800 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-gray-200">{w.english}</div>
                            <div className="text-gray-400 text-sm">{w.korean}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {sortedQuizVocabulary.length > 0 && sortedPackageVocabulary.length > 0 && (
                <div className="my-2 border-t border-gray-700" />
              )}
              {sortedPackageVocabulary.length > 0 && (
                <>
                  <div className="text-gray-400 text-sm mb-2">Vocabulary from packages</div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {sortedPackageVocabulary.map((w, idx) => {
                      return (
                        <li key={`pkg-${w.korean}-${idx}`} className="p-2 rounded bg-gray-800 flex items-center justify-between gap-2">
                          <div>
                            <div className="text-gray-200">{w.english}</div>
                            <div className="text-gray-400 text-sm">{w.korean}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {sortedQuizVocabulary.length === 0 && sortedPackageVocabulary.length === 0 && (
                <div className="text-gray-400 text-sm">No vocabulary available.</div>
              )}
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

