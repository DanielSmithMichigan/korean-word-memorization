import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const GET_WORD_PAIRS_API_ENDPOINT = 'https://u9bwocgqhf.execute-api.us-east-1.amazonaws.com/prod/';

function QuizSetup({ userId }) {
  const [wordPackages, setWordPackages] = useState([]);
  const [loadingState, setLoadingState] = useState('loading');
  const [selectedWords, setSelectedWords] = useState(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const fetchAllWordPackages = async () => {
    setLoadingState('loading');
    let packages = [];
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
            packages.push({
              words: item.wordPairs,
              timestamp: item.timestamp,
              id: item.id,
              customIdentifier: item.customIdentifier,
              attempts: item.attempts,
              recentSuccessRate: item.recentSuccessRate,
              successes: item.successes
            });
          }
        }
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      packages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setWordPackages(packages);
      setLoadingState(packages.length === 0 ? 'no-words' : 'loaded');
    } catch (error) {
      console.error('Error fetching word packages:', error);
      setLoadingState('error');
    }
  };

  useEffect(() => {
    if (userId) {
      fetchAllWordPackages();
    }
  }, [userId]);

  const formatIdentifier = (identifier) => {
    if (!identifier) return null;
    const parts = identifier.split('-');
    const chunkNum = parseInt(parts[parts.length - 1], 10) + 1;
    const date = new Date(parts.slice(0, -1).join('-'));
    
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    
    return `Package ${chunkNum} - ${date.toLocaleString('en-US', options)}`;
  };

  const getPackageSelectionState = (pkg) => {
    const selectedCount = pkg.words.filter(word => selectedWords.has(`${pkg.id}-${word.korean}`)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === pkg.words.length) return 'all';
    return 'some';
  };

  const handlePackageCheckboxChange = (pkg) => {
    const newSelectedWords = new Map(selectedWords);
    const selectionState = getPackageSelectionState(pkg);

    if (selectionState === 'all' || selectionState === 'some') { // Deselect all in this package
      pkg.words.forEach(word => {
        newSelectedWords.delete(`${pkg.id}-${word.korean}`);
      });
    } else { // Select all in this package
      pkg.words.forEach((word, wordIndex) => {
        const wordKey = `${pkg.id}-${word.korean}`;
        if (!newSelectedWords.has(wordKey)) {
          newSelectedWords.set(wordKey, {
            ...word,
            packageId: pkg.id,
            recentSuccessRate: pkg.recentSuccessRate?.[wordIndex] ?? 0,
            successes: pkg.successes?.[wordIndex] ?? 0,
            attempts: pkg.attempts?.[wordIndex] ?? 0,
          });
        }
      });
    }
    setSelectedWords(newSelectedWords);
  };

  const handleWordCheckboxChange = (pkg, word, wordIndex) => {
    const newSelectedWords = new Map(selectedWords);
    const wordKey = `${pkg.id}-${word.korean}`;

    if (newSelectedWords.has(wordKey)) {
      newSelectedWords.delete(wordKey);
    } else {
      newSelectedWords.set(wordKey, {
        ...word,
        packageId: pkg.id,
        recentSuccessRate: pkg.recentSuccessRate?.[wordIndex] ?? 0,
        successes: pkg.successes?.[wordIndex] ?? 0,
        attempts: pkg.attempts?.[wordIndex] ?? 0,
      });
    }
    setSelectedWords(newSelectedWords);
  };

  const handleBeginQuiz = () => {
    setIsSubmitting(true);
    const quizWords = Array.from(selectedWords.values());

    if (quizWords.length === 0) {
      alert('Please select at least one word to begin the quiz.');
      setIsSubmitting(false);
      return;
    }

    navigate({
      pathname: '/quiz',
      search: location.search,
    }, {
      state: { words: quizWords }
    });
  };
  
  const PackageCheckbox = ({ pkg }) => {
    const ref = useRef();
    const selectionState = getPackageSelectionState(pkg);
  
    useEffect(() => {
      if (ref.current) {
        ref.current.checked = selectionState === 'all';
        ref.current.indeterminate = selectionState === 'some';
      }
    }, [selectionState]);
  
    return (
      <input
        ref={ref}
        type="checkbox"
        id={`pkg-${pkg.id}`}
        className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-4 flex-shrink-0"
        onChange={() => handlePackageCheckboxChange(pkg)}
      />
    );
  };

  if (loadingState === 'loading') return <p className="text-center text-gray-400 p-8">Loading packages...</p>;
  if (loadingState === 'error') return <p className="text-center text-red-500 p-8">Error loading words.</p>;
  
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 pb-28">
      <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Quiz Setup</h2>
      <h3 className="text-lg sm:text-xl text-center text-gray-400 mb-8">Select Words or Packages</h3>

      {loadingState === 'no-words' && (
        <p className="text-center text-gray-400 bg-gray-800 p-8 rounded-xl">
          No word packages found. Use the "Upload" page to add some words.
        </p>
      )}

      {loadingState === 'loaded' && wordPackages.length > 0 && (
        <div className="space-y-6">
          {wordPackages.map((pkg) => (
            <div key={pkg.id} className="p-4 sm:p-6 bg-gray-800 rounded-xl shadow-lg">
              <div className="flex items-center mb-4">
                <PackageCheckbox pkg={pkg} />
                <label htmlFor={`pkg-${pkg.id}`} className="text-lg sm:text-xl font-bold text-white cursor-pointer" onClick={() => handlePackageCheckboxChange(pkg)}>
                  {formatIdentifier(pkg.customIdentifier) || `Uploaded on ${new Date(pkg.timestamp).toLocaleDateString()}`}
                </label>
              </div>
              
              <ul className="space-y-2 pl-2">
                {pkg.words.map((word, wordIndex) => {
                  const wordKey = `${pkg.id}-${word.korean}`;
                  const isSelected = selectedWords.has(wordKey);
                  return (
                    <li
                      key={wordKey}
                      className="flex items-center gap-4 p-3 bg-gray-700 rounded-lg cursor-pointer"
                      onClick={() => handleWordCheckboxChange(pkg, word, wordIndex)}
                    >
                      <input
                        type="checkbox"
                        id={`word-${wordKey}`}
                        className="form-checkbox h-5 w-5 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500"
                        checked={isSelected}
                        onChange={(e) => {
                          e.stopPropagation(); // prevent li's onClick
                          handleWordCheckboxChange(pkg, word, wordIndex);
                        }}
                      />
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center w-full">
                        <span className="text-lg text-gray-200">{word.korean}</span>
                        <span className="text-md sm:text-lg text-gray-400">{word.english}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm p-4 border-t border-gray-700 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleBeginQuiz}
            disabled={isSubmitting || selectedWords.size === 0}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Starting...' : `Begin Quiz with ${selectedWords.size} Word${selectedWords.size === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuizSetup;
