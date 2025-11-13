import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isEnglishAnswerCorrect } from './utils/quizUtil';
import { postWordPairs } from './actions/quizApi';

const buildInitialResponses = (words) => {
  const initial = {};
  words.forEach((word, index) => {
    const key = word._key || `${word.packageId || 'pkg'}-${word.korean}-${index}`;
    initial[key] = { guess: '', status: 'pending', isCorrect: null };
  });
  return initial;
};

function BulkKoreanReveal({ userId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const wordsFromState = location.state?.words ?? [];

  const words = useMemo(() => {
    return wordsFromState.map((word, index) => ({
      ...word,
      _key: word._key || word.clientKey || word.id || `${word.packageId || 'pkg'}-${word.korean}-${index}`,
    }));
  }, [wordsFromState]);

  const [responses, setResponses] = useState(() => buildInitialResponses(words));
  const [selectedWrongKeys, setSelectedWrongKeys] = useState(new Set());
  const [packageName, setPackageName] = useState('');
  const [isSavingPackage, setIsSavingPackage] = useState(false);
  const [creationMessage, setCreationMessage] = useState('');
  const [creationError, setCreationError] = useState('');

  useEffect(() => {
    if (!words.length) {
      navigate({
        pathname: '/quiz-setup',
        search: location.search || '',
      }, { replace: true });
    } else {
      setResponses(buildInitialResponses(words));
      setCreationMessage('');
      setCreationError('');
    }
  }, [words, navigate, location.search]);

  const pendingCount = useMemo(() => {
    return words.reduce((count, word) => {
      const status = responses[word._key]?.status || 'pending';
      return status === 'pending' ? count + 1 : count;
    }, 0);
  }, [responses, words]);

  const wrongWords = useMemo(() => {
    return words.filter((word) => {
      const response = responses[word._key];
      if (!response || response.status === 'pending') return false;
      return !response.isCorrect;
    });
  }, [words, responses]);

  useEffect(() => {
    setSelectedWrongKeys(new Set(wrongWords.map((word) => word._key)));
  }, [wrongWords]);

  const handleGuessChange = (wordKey, value) => {
    setResponses((prev) => ({
      ...prev,
      [wordKey]: {
        ...(prev[wordKey] || { status: 'pending', isCorrect: null }),
        guess: value,
      },
    }));
  };

  const finalizeSubmission = (word, outcome) => {
    setResponses((prev) => ({
      ...prev,
      [word._key]: {
        ...(prev[word._key] || {}),
        guess: prev[word._key]?.guess || '',
        status: outcome.status,
        isCorrect: outcome.isCorrect,
      },
    }));
  };

  const handleSubmitWord = (word) => {
    const response = responses[word._key];
    if (!response || response.status !== 'pending') return;
    const guess = response.guess || '';
    const isCorrect = isEnglishAnswerCorrect(guess, word);
    finalizeSubmission(word, { status: 'submitted', isCorrect });
  };

  const handleSkipWord = (word) => {
    const response = responses[word._key];
    if (!response || response.status !== 'pending') return;
    finalizeSubmission(word, { status: 'skipped', isCorrect: false });
  };

  const toggleWrongSelection = (wordKey) => {
    setSelectedWrongKeys((prev) => {
      const next = new Set(prev);
      if (next.has(wordKey)) {
        next.delete(wordKey);
      } else {
        next.add(wordKey);
      }
      return next;
    });
  };

  const createPackageFromWrong = async () => {
    setCreationMessage('');
    setCreationError('');
    if (selectedWrongKeys.size === 0) {
      setCreationError('Select at least one word to include.');
      return;
    }
    const selectedWords = words.filter((word) => selectedWrongKeys.has(word._key));
    const wordPairs = selectedWords.map((word) => ({
      korean: word.korean,
      english: word.english,
    }));

    setIsSavingPackage(true);
    try {
      await postWordPairs(userId, {
        wordPairs,
        customIdentifier: `bulk-review-${new Date().toISOString()}`,
        ...(packageName.trim() ? { name: packageName.trim() } : {}),
      });
      setCreationMessage(`Created package with ${wordPairs.length} word${wordPairs.length === 1 ? '' : 's'}.`);
      setPackageName('');
    } catch (error) {
      console.error('Failed to create package', error);
      setCreationError('Failed to create package. Please try again.');
    } finally {
      setIsSavingPackage(false);
    }
  };

  if (!words.length) {
    return (
      <div className="max-w-4xl mx-auto text-center text-gray-300">
        Preparing quiz...
      </div>
    );
  }

  const allResolved = pendingCount === 0 && words.length > 0;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => navigate({ pathname: '/quiz-setup', search: location.search || '' })}
          className="text-sm text-blue-300 hover:text-blue-200 underline"
        >
          ← Back to Quiz Setup
        </button>
        <h1 className="mt-4 text-3xl font-semibold">Bulk Korean Reveal</h1>
        <p className="text-gray-300 mt-2">
          Translate each Korean word to English. Submit or skip to lock in your choice. Results will be shown once every word has been addressed.
        </p>
      </div>

      <div className="bg-gray-800 rounded-xl p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between text-gray-300 text-sm">
          <span>{words.length} word{words.length === 1 ? '' : 's'} loaded</span>
          <span>{pendingCount} remaining</span>
        </div>
        <div className="space-y-4">
          {words.map((word, index) => {
            const response = responses[word._key] || { status: 'pending', guess: '' };
            const locked = response.status !== 'pending';
            return (
              <div key={word._key} className="bg-gray-900/70 rounded-lg p-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-400">Word {index + 1}</p>
                    <p className="text-xl font-semibold text-white">{word.korean}</p>
                  </div>
                  <div className="flex-1 md:max-w-md">
                    <input
                      type="text"
                      value={response.guess || ''}
                      onChange={(e) => handleGuessChange(word._key, e.target.value)}
                      disabled={locked}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                      placeholder="Type English meaning"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSubmitWord(word)}
                      disabled={locked || !response.guess.trim()}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Submit
                    </button>
                    <button
                      onClick={() => handleSkipWord(word)}
                      disabled={locked}
                      className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Skip
                    </button>
                  </div>
                </div>
                {locked && (
                  <p className="mt-2 text-xs uppercase tracking-wider text-gray-400">
                    {response.status === 'submitted' ? 'Answer recorded' : 'Skipped'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {allResolved && (
        <div className="bg-gray-800 rounded-xl p-4 sm:p-6 space-y-4">
          <h2 className="text-2xl font-semibold">Review</h2>
          {wrongWords.length === 0 ? (
            <div className="text-green-300">Nice work! You answered everything correctly.</div>
          ) : (
            <>
              <p className="text-gray-300">
                {wrongWords.length} word{wrongWords.length === 1 ? '' : 's'} need more practice. Select the ones you want to include in a new package.
              </p>
              <div className="space-y-3">
                {wrongWords.map((word) => (
                  <label
                    key={word._key}
                    className="flex items-start gap-3 bg-gray-900/70 rounded-lg p-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-1 form-checkbox h-5 w-5 text-blue-500 rounded border-gray-600"
                      checked={selectedWrongKeys.has(word._key)}
                      onChange={() => toggleWrongSelection(word._key)}
                    />
                    <div className="flex-1">
                      <p className="text-lg text-white font-semibold">{word.korean}</p>
                      <p className="text-gray-300 text-sm">{word.english}</p>
                      <p className="text-gray-400 text-xs mt-1">
                        Your answer: {responses[word._key]?.guess || '(none)'}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Optional package name</label>
                  <input
                    type="text"
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Needs review - June 12"
                  />
                </div>
                {creationError && <p className="text-red-400 text-sm">{creationError}</p>}
                {creationMessage && <p className="text-green-400 text-sm">{creationMessage}</p>}
                <button
                  onClick={createPackageFromWrong}
                  disabled={isSavingPackage || selectedWrongKeys.size === 0}
                  className="w-full sm:w-auto px-5 py-3 bg-purple-600 hover:bg-purple-500 rounded text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingPackage ? 'Creating package...' : `Create Package (${selectedWrongKeys.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default BulkKoreanReveal;
