import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaStar, FaPencilAlt } from 'react-icons/fa';
import FavoriteToggleButton from './components/FavoriteToggleButton';
import EditWordModal from './quiz/components/EditWordModal';

import { GET_WORD_PAIRS_API_ENDPOINT } from './api/endpoints';
import { postWordPairs } from './quiz/actions/quizApi';

function QuizSetup({ userId }) {
  const [wordPackages, setWordPackages] = useState([]);
  const [favoritesPackage, setFavoritesPackage] = useState(null);
  const [loadingState, setLoadingState] = useState('loading');
  const [selectedWords, setSelectedWords] = useState(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [wordToEdit, setWordToEdit] = useState(null);
  const [editingPackageId, setEditingPackageId] = useState(null);
  const [editingPackageName, setEditingPackageName] = useState('');
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
          url.searchParams.append('lastEvaluatedKey', lastEvaluatedKey);
        }
        const response = await fetch(url);
        const data = await response.json();

        for (const item of data.Items) {
          if (item.wordPairs && item.wordPairs.length > 0) {
            const pkg = {
              words: item.wordPairs, // Still named 'words' here for local consistency
              wordPairs: item.wordPairs,
              timestamp: item.timestamp,
              id: item.id,
              customIdentifier: item.customIdentifier,
              name: item.name,
              attempts: item.attempts,
              recentSuccessRate: item.recentSuccessRate,
              successes: item.successes
            };
            if (item.id === 'favorites') {
              setFavoritesPackage(pkg);
            } else {
              packages.push(pkg);
            }
          }
        }
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      packages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setWordPackages(packages);
      setLoadingState(packages.length === 0 && !favoritesPackage ? 'no-words' : 'loaded');
    } catch (error) {
      console.error('Error fetching word packages:', error);
      setLoadingState('error');
    }
  };

  const handleOpenEditModal = (word) => {
    setWordToEdit(word);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setWordToEdit(null);
  };

  const handleWordUpdated = (updatedPackages, newWord) => {
    if (!Array.isArray(updatedPackages)) return;

    // Update regular packages
    setWordPackages((prevPackages) => {
      return prevPackages.map((pkg) => {
        const updated = updatedPackages.find((p) => p.id === pkg.id);
        if (updated) {
          const updatedWordPairs = updated.wordPairs || [];
          return {
            ...pkg,
            wordPairs: updatedWordPairs,
            words: updatedWordPairs,
          };
        }
        return pkg;
      });
    });

    // Update favorites package if applicable
    const favoritesUpdated = updatedPackages.find((p) => p.id === 'favorites');
    if (favoritesUpdated) {
      setFavoritesPackage((prev) => {
        const updatedWordPairs = favoritesUpdated.wordPairs || [];
        return {
          ...(prev || {}),
          ...favoritesUpdated,
          wordPairs: updatedWordPairs,
          words: updatedWordPairs,
        };
      });
    }

    // Update any selected words that referenced the old key
    if (wordToEdit) {
      setSelectedWords((prevSelected) => {
        const next = new Map(prevSelected);
        updatedPackages.forEach((pkg) => {
          const oldKey = `${pkg.id}-${wordToEdit.korean}`;
          const newKey = `${pkg.id}-${newWord.korean}`;
          if (next.has(oldKey)) {
            const value = next.get(oldKey);
            next.delete(oldKey);
            next.set(newKey, {
              ...value,
              korean: newWord.korean,
              english: newWord.english,
            });
          }
        });
        return next;
      });
    }
  };

  useEffect(() => {
    if (userId) {
      fetchAllWordPackages();
    }
  }, [userId]);

  const handleToggleFavorite = async (word) => {
    const currentFavorites = favoritesPackage || { id: 'favorites', customIdentifier: 'favorites', wordPairs: [] };
    const wordList = currentFavorites.wordPairs || [];

    const isCurrentlyFavorite = wordList.some(
      (favWord) => favWord.korean === word.korean
    );

    const updatedWordPairs = isCurrentlyFavorite
      ? wordList.filter((favWord) => favWord.korean !== word.korean)
      : [...wordList, { korean: word.korean, english: word.english }];

    const updatedPackage = {
      ...currentFavorites,
      wordPairs: updatedWordPairs,
      words: updatedWordPairs, // Keep both for local consistency
    };

    try {
      const response = await postWordPairs(userId, {
        id: updatedPackage.id,
        customIdentifier: updatedPackage.customIdentifier,
        wordPairs: updatedPackage.wordPairs,
      });

      if (response?.id) {
        setFavoritesPackage({ ...updatedPackage, id: response.id });
      } else {
        setFavoritesPackage(updatedPackage);
      }
    } catch (error) {
      console.error('Error updating favorites:', error);
    }
  };

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

  const displayPackageTitle = (pkg, isFavoritePkg) => {
    if (isFavoritePkg) return 'Favorites';
    if (pkg?.name && pkg.name.trim().length > 0) return pkg.name.trim();
    return (
      formatIdentifier(pkg.customIdentifier) ||
      (pkg.timestamp ? `Uploaded on ${new Date(pkg.timestamp).toLocaleDateString()}` : 'Unknown date')
    );
  };

  const beginEditingPackage = (pkg) => {
    setEditingPackageId(pkg.id);
    setEditingPackageName(pkg.name || '');
  };

  const cancelEditingPackage = () => {
    setEditingPackageId(null);
    setEditingPackageName('');
  };

  const saveEditingPackage = async (pkg) => {
    const newName = (editingPackageName || '').trim();
    try {
      await postWordPairs(userId, { id: pkg.id, name: newName });
      setWordPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, name: newName } : p)));
      if (favoritesPackage?.id === pkg.id) {
        setFavoritesPackage((prev) => ({ ...(prev || {}), name: newName }));
      }
      cancelEditingPackage();
    } catch (e) {
      console.error('Failed to update package name', e);
      alert('Failed to update package name.');
    }
  };

  const getPackageSelectionState = (pkg) => {
    if (!pkg) return 'none';
    const wordList = pkg.words || pkg.wordPairs || [];
    const selectedCount = wordList.filter(word => selectedWords.has(`${pkg.id}-${word.korean}`)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === wordList.length) return 'all';
    return 'some';
  };

  const matchesSearch = (word, term) => {
    if (!term) return true;
    const t = term.toLowerCase();
    const k = (word.korean || '').toLowerCase();
    const e = (word.english || '').toLowerCase();
    return k.includes(t) || e.includes(t);
  };

  const handlePackageCheckboxChange = (pkg, visibleWordListOverride = null) => {
    if (!pkg) return;
    const newSelectedWords = new Map(selectedWords);
    const fullList = pkg.words || pkg.wordPairs || [];
    const wordList = visibleWordListOverride ?? fullList;

    // Selection state calculated relative to the list we're operating on
    const selectedCount = wordList.filter(word => newSelectedWords.has(`${pkg.id}-${word.korean}`)).length;
    const selectionState = selectedCount === 0 ? 'none' : (selectedCount === wordList.length ? 'all' : 'some');

    if (selectionState === 'all' || selectionState === 'some') { // Deselect all in this package
      wordList.forEach(word => {
        newSelectedWords.delete(`${pkg.id}-${word.korean}`);
      });
    } else { // Select all in this package
      wordList.forEach((word, wordIndex) => {
        const wordKey = `${pkg.id}-${word.korean}`;
        if (!newSelectedWords.has(wordKey)) {
          newSelectedWords.set(wordKey, {
            ...word,
            packageId: pkg.id,
            // Use index from the full list to keep stats aligned
            recentSuccessRate: (pkg.recentSuccessRate || [])[fullList.indexOf(word)] ?? 0,
            successes: (pkg.successes || [])[fullList.indexOf(word)] ?? 0,
            attempts: (pkg.attempts || [])[fullList.indexOf(word)] ?? 0,
          });
        }
      });
    }
    setSelectedWords(newSelectedWords);
  };

  const handleWordCheckboxChange = (pkg, word, wordIndex) => {
    if (!pkg) return;
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

  const handleAddToPackage = async (pkg) => {
    if (!pkg) return;
    if (selectedWords.size === 0) return;
    try {
      const existing = pkg.wordPairs || pkg.words || [];
      const seen = new Set(existing.map(w => (w.korean || '').toLowerCase()));
      const additions = [];
      for (const value of selectedWords.values()) {
        const key = (value.korean || '').toLowerCase();
        if (key && !seen.has(key)) {
          additions.push({ korean: value.korean, english: value.english });
          seen.add(key);
        }
      }
      if (additions.length === 0) {
        alert('No new words to add to this package.');
        return;
      }

      const updatedWordPairs = existing.concat(additions);
      const payload = {
        id: pkg.id,
        customIdentifier: pkg.customIdentifier,
        wordPairs: updatedWordPairs,
        ...(pkg.name ? { name: pkg.name } : {}),
      };
      await postWordPairs(userId, payload);
      setWordPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, wordPairs: updatedWordPairs, words: updatedWordPairs } : p));
      if (favoritesPackage?.id === pkg.id) {
        setFavoritesPackage(prev => ({ ...(prev || {}), wordPairs: updatedWordPairs, words: updatedWordPairs }));
      }
      alert(`Added ${additions.length} word${additions.length === 1 ? '' : 's'} to this package.`);
    } catch (err) {
      console.error('Failed to add to package', err);
      alert('Failed to add words to the package.');
    }
  };
  
  const handleCreatePackage = async () => {
    if (selectedWords.size === 0) {
      alert('Please select at least one word to create a package.');
      return;
    }
    setIsCreating(true);
    try {
      // Deduplicate by Korean word to avoid accidental duplicates across packages
      const uniqueMap = new Map();
      for (const val of Array.from(selectedWords.values())) {
        if (!uniqueMap.has(val.korean)) {
          uniqueMap.set(val.korean, { korean: val.korean, english: val.english });
        }
      }
      const wordPairs = Array.from(uniqueMap.values());

      await postWordPairs(userId, { wordPairs });
      await fetchAllWordPackages();
      setSelectedWords(new Map());
      alert('Package created successfully.');
    } catch (error) {
      console.error('Error creating package:', error);
      alert('Failed to create package. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };
  
const renderPackage = (pkg, isFavoritePkg = false, containerKey = null) => {
    const allWords = pkg.words || pkg.wordPairs || [];
    const visibleWordList = (searchTerm && searchTerm.trim())
      ? allWords.filter(w => matchesSearch(w, searchTerm))
      : allWords;

    // Calculate selection state relative to the visible list
    const visibleSelectedCount = visibleWordList.filter(word => selectedWords.has(`${pkg.id}-${word.korean}`)).length;
    const selectionState = visibleSelectedCount === 0 ? 'none' : (visibleSelectedCount === visibleWordList.length ? 'all' : 'some');

    return (
      <div key={containerKey ?? pkg?.id} className={`p-3 sm:p-6 rounded-xl shadow-lg ${isFavoritePkg ? 'bg-yellow-900/20 border border-yellow-600/50' : 'bg-gray-800'}`}>
        <div className="flex items-center mb-3 sm:mb-4">
          <input
            ref={node => {
              if (node) {
                node.indeterminate = selectionState === 'some';
              }
            }}
            type="checkbox"
            id={`pkg-${pkg?.id}`}
            className="form-checkbox h-5 w-5 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 mr-4 flex-shrink-0"
            checked={selectionState === 'all'}
            onChange={() => handlePackageCheckboxChange(pkg, visibleWordList)}
            disabled={!pkg}
          />
          <div className="flex-1 flex items-center gap-3">
            <label htmlFor={`pkg-${pkg?.id}`} className="text-lg sm:text-xl font-bold text-white cursor-pointer flex items-center">
              {isFavoritePkg && <FaStar className="text-yellow-400 mr-3" />}
              {editingPackageId === pkg.id ? (
                <input
                  autoFocus
                  type="text"
                  value={editingPackageName}
                  onChange={(e) => setEditingPackageName(e.target.value)}
                  placeholder="Package name"
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      saveEditingPackage(pkg);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelEditingPackage();
                    }
                  }}
                />
              ) : (
                <span>{displayPackageTitle(pkg, isFavoritePkg)}</span>
              )}
            </label>
            {!isFavoritePkg && (
              editingPackageId === pkg.id ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); saveEditingPackage(pkg); }}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded"
                  >
                    Save
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelEditingPackage(); }}
                    className="px-3 py-1 bg-gray-600 hover:bg-gray-500 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); beginEditingPackage(pkg); }}
                    className="p-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200"
                    title="Edit package name"
                  >
                    <FaPencilAlt className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAddToPackage(pkg); }}
                    disabled={selectedWords.size === 0}
                    className={`px-3 py-1 rounded ${selectedWords.size === 0 ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                    title={selectedWords.size === 0 ? 'Select words to enable' : 'Add selected words to this package'}
                  >
                    Add to this package
                  </button>
                </div>
              )
            )}
          </div>
        </div>
          
          <ul className="space-y-2">
            {visibleWordList.map((word, wordIndex) => {
              const wordKey = `${pkg.id}-${word.korean}`;
              const isSelected = selectedWords.has(wordKey);
              const isFavorite = favoritesPackage?.wordPairs?.some(favWord => favWord.korean === word.korean) ?? false;

              return (
                <li
                  key={wordKey}
                  className={`relative rounded-lg transition-colors pt-8 pr-10 pb-6 pl-9 ${
                    isSelected
                      ? 'bg-gray-700 ring-1 ring-indigo-300/40'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    id={`word-${wordKey}`}
                    className="absolute top-2 left-2 form-checkbox h-6 w-6 text-blue-600 bg-gray-600 border-gray-500 rounded focus:ring-blue-500 cursor-pointer"
                    checked={isSelected}
                    onChange={() => handleWordCheckboxChange(pkg, word, (pkg.words || pkg.wordPairs || []).indexOf(word))}
                  />
                  <FavoriteToggleButton
                    isFavorite={isFavorite}
                    onToggle={(e) => {
                      e.stopPropagation();
                      return handleToggleFavorite(word);
                    }}
                    className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-gray-600/70"
                    iconClassName="h-4 w-4"
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenEditModal(word); }}
                    className="absolute bottom-2 right-2 p-1.5 rounded-md bg-gray-600 hover:bg-gray-500 focus:outline-none"
                    title="Edit word"
                  >
                    <FaPencilAlt className="h-4 w-4 text-gray-200" />
                  </button>
                  <div 
                    className="cursor-pointer"
                    onClick={() => handleWordCheckboxChange(pkg, word, (pkg.words || pkg.wordPairs || []).indexOf(word))}
                  >
                    <div className="text-xl sm:text-2xl text-gray-200 break-words leading-snug tracking-tight">{word.korean}</div>
                    <div className="text-base sm:text-lg text-gray-400 break-words leading-snug tracking-tight">{word.english}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
    );
  };

  if (loadingState === 'loading') return <p className="text-center text-gray-400 p-8">Loading packages...</p>;
  if (loadingState === 'error') return <p className="text-center text-red-500 p-8">Error loading words.</p>;
  
  return (
    <div className="max-w-2xl mx-auto px-2 py-4 sm:p-6 pb-28">
      <h2 className="text-2xl sm:text-3xl font-bold text-center mb-2">Quiz Setup</h2>
      <h3 className="text-lg sm:text-xl text-center text-gray-400 mb-8">Select Words or Packages</h3>

      {/* Floating Search Bar (sticky at top) */}
      <div className="sticky top-0 z-40 -mx-2 sm:mx-0">
        <div className="bg-gray-900 bg-opacity-80 backdrop-blur-sm px-2 py-3 border-b border-gray-700 shadow-lg">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Korean or English..."
            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loadingState === 'no-words' && (
        <p className="text-center text-gray-400 bg-gray-800 p-8 rounded-xl">
          No word packages found. Use the "Upload" page to add some words.
        </p>
      )}

      {loadingState === 'loaded' && (
        <div className="space-y-6">
          {favoritesPackage && (favoritesPackage.words?.length > 0 || favoritesPackage.wordPairs?.length > 0) && (
            // Only render favorites if there are visible matches or no search is active
            (!searchTerm.trim() || (favoritesPackage.wordPairs || favoritesPackage.words || []).some(w => matchesSearch(w, searchTerm))) &&
            renderPackage(favoritesPackage, true, 'favorites')
          )}
          {wordPackages.map((pkg, idx) => {
            if (!pkg.id) return null;
            if (searchTerm.trim()) {
              const list = pkg.words || pkg.wordPairs || [];
              const anyMatch = list.some(w => matchesSearch(w, searchTerm));
              if (!anyMatch) return null; // hide packages with no visible matches
            }
            return renderPackage(pkg, false, `${pkg.id}-${idx}`);
          })}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-gray-900 bg-opacity-80 backdrop-blur-sm px-2 py-3 border-t border-gray-700 shadow-lg">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2">
          <button
            onClick={handleBeginQuiz}
            disabled={isSubmitting || selectedWords.size === 0}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Starting...' : `Begin Quiz with ${selectedWords.size} Word${selectedWords.size === 1 ? '' : 's'}`}
          </button>
          <button
            onClick={handleCreatePackage}
            disabled={isCreating || selectedWords.size === 0}
            className="sm:w-auto sm:min-w-[12rem] bg-gray-700 hover:bg-gray-600 text-gray-100 font-semibold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline disabled:opacity-50 disabled:cursor-not-allowed border border-gray-600"
          >
            {isCreating ? 'Creating...' : 'Create Package'}
          </button>
        </div>
      </div>
      <EditWordModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        word={wordToEdit}
        userId={userId}
        onWordUpdated={handleWordUpdated}
      />
    </div>
  );
}

export default QuizSetup;
