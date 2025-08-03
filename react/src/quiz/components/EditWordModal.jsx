import React, { useState, useEffect } from 'react';
import { fetchAllWordPairs } from '../actions/quizApi';

import { WORD_UPLOADER_API_ENDPOINT } from '../../api/endpoints';

function EditWordModal({ isOpen, onClose, word, userId, onWordUpdated }) {
  const [korean, setKorean] = useState('');
  const [english, setEnglish] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalWord, setOriginalWord] = useState(null);

  useEffect(() => {
    if (word) {
      setKorean(word.korean);
      setEnglish(word.english);
      setOriginalWord(word);
    }
  }, [word]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const allPackages = await fetchAllWordPairs(userId);
      const packagesToUpdate = allPackages.filter(p =>
        p.wordPairs.some(wp => wp.korean === originalWord.korean && wp.english === originalWord.english)
      );

      if (packagesToUpdate.length === 0) {
        alert('Could not find any packages containing this word. Cannot save changes.');
        setIsSubmitting(false);
        return;
      }

      const updatePromises = packagesToUpdate.map(pkg => {
        const wordIndex = pkg.wordPairs.findIndex(p => p.korean === originalWord.korean && p.english === originalWord.english);
        
        const updatedWordPairs = [...pkg.wordPairs];
        updatedWordPairs[wordIndex] = { ...updatedWordPairs[wordIndex], korean, english };

        const payload = {
          ...pkg,
          wordPairs: updatedWordPairs,
        };
        
        const url = new URL(WORD_UPLOADER_API_ENDPOINT);
        url.searchParams.append('userId', userId);

        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      });

      const responses = await Promise.all(updatePromises);

      const failedUpdates = responses.filter(res => !res.ok);

      if (failedUpdates.length > 0) {
        throw new Error(`${failedUpdates.length} out of ${responses.length} packages failed to update.`);
      }
      
      const updatedPackages = await Promise.all(responses.map(res => res.json()));
      
      const newWord = { ...originalWord, korean, english };
      onWordUpdated(updatedPackages, newWord);
      
      alert(`Successfully updated the word in ${packagesToUpdate.length} package(s)!`);
      onClose();
    } catch (error) {
      console.error('Error updating word package(s):', error);
      alert(`Failed to update word packages. Please try again. Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-2xl font-bold text-white mb-4">Edit Word</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="korean" className="block text-gray-300 mb-2">Korean</label>
            <input
              id="korean"
              type="text"
              value={korean}
              onChange={(e) => setKorean(e.target.value)}
              className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="mb-6">
            <label htmlFor="english" className="block text-gray-300 mb-2">English</label>
            <input
              id="english"
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="py-2 px-4 bg-gray-600 hover:bg-gray-500 text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:bg-blue-800"
            >
              {isSubmitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditWordModal;


