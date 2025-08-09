import React, { useState, useEffect } from 'react';
import { FaVolumeUp, FaSpinner, FaSync, FaPencilAlt } from 'react-icons/fa';
import FavoriteToggleButton from '../../components/FavoriteToggleButton';
import EditWordModal from './EditWordModal';

function Flashcard({
  word,
  isFlipped,
  audioStatus,
  onPlayAudio,
  onRefreshAudio,
  quizMode,
  userId,
  wordPackage,
  wordIndex,
  isFavorite,
  onToggleFavorite,
  onWordUpdated,
  wordSuccessCounters,
  consecutiveSuccessesRequired,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Reset the showExample state when the word changes
  useEffect(() => {
    setShowExample(false);
  }, [word]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshAudio();
    setIsRefreshing(false);
  };

  const handleOpenEditModal = () => {
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
  };

  return (
    <>
      {/* Current word progress bar (placed outside the card to avoid overlap) */}
      <div className="max-w-md mx-auto mb-3">
        {(() => {
          const current = Math.min(
            (wordSuccessCounters && wordSuccessCounters[word.korean]) || 0,
            Math.max(1, consecutiveSuccessesRequired || 1)
          );
          const total = Math.max(1, consecutiveSuccessesRequired || 1);
          const percent = Math.round((current / total) * 100);
          return (
            <div>
              <div className="flex items-center justify-between mb-1 text-xs text-gray-300">
                <span className="truncate">Progress</span>
                <span className="tabular-nums">{current}/{total}</span>
              </div>
              <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-500 ease-out ring-1 ring-indigo-300"
                  style={{
                    width: `${percent}%`,
                    background: 'linear-gradient(90deg, #6366F1 0%, #22C55E 100%)',
                  }}
                />
              </div>
            </div>
          );
        })()}
      </div>

      <div className="flashcard-container max-w-md mx-auto mb-6 relative">
        <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
          {/* Card Front */}
          <div className="flashcard-front">
            <div className="p-4 text-center">
              {/* Main word and audio button */}
              <div className="flex items-center justify-center mb-4">
                {quizMode === 'english-to-korean' && (
                  <span className="text-3xl sm:text-4xl font-semibold text-white mr-4 break-words">
                    {word.english}
                  </span>
                )}
                {quizMode === 'korean-to-english' && (
                  <span className="text-3xl sm:text-4xl font-semibold text-white mr-4 break-words">
                    {word.korean}
                  </span>
                )}
                <button
                  onClick={onPlayAudio}
                  className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white flex items-center space-x-2"
                  disabled={audioStatus === 'loading'}
                >
                  {audioStatus === 'loading' ? (
                    <FaSpinner className="animate-spin h-5 w-5 text-white" />
                  ) : (
                    <FaVolumeUp className="h-5 w-5 text-white" />
                  )}
                  <span className="text-white text-s pr-1">[;]</span>
                </button>
              </div>
              
              {/* Example content */}
              {word.example && showExample && (
                <div className="text-lg text-gray-300 mb-4 break-words leading-relaxed">
                  <div dangerouslySetInnerHTML={{ __html: word.example }} />
                </div>
              )}
              
              {/* Example toggle */}
              {word.example && (
                <div>
                  <button
                    onClick={() => setShowExample(!showExample)}
                    className="text-blue-400 hover:underline text-sm"
                  >
                    {showExample ? 'Hide Example' : 'Show Example'}
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Card Back */}
          <div className="flashcard-back">
            <div className="p-6 text-center">
              {/* Korean word */}
              <div className="text-3xl sm:text-4xl font-bold mb-2 break-words text-white">
                {word.korean}
              </div>
              <div className="text-2xl sm:text-3xl text-gray-300 mb-4 break-words">
                {word.english}
              </div>
              
              {/* Example content */}
              {word.example && showExample && (
                <div className="text-lg text-gray-300 mb-4 break-words leading-relaxed">
                  <div dangerouslySetInnerHTML={{ __html: word.example }} />
                </div>
              )}
              
              {/* Example toggle */}
              {word.example && (
                <div>
                  <button
                    onClick={() => setShowExample(!showExample)}
                    className="text-blue-400 hover:underline text-sm"
                  >
                    {showExample ? 'Hide Example' : 'Show Example'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Refresh Audio Button */}
        <button
          onClick={handleRefresh}
          className="absolute bottom-2 right-2 p-2 rounded-full bg-gray-700 bg-opacity-50 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
          disabled={isRefreshing}
          title="Refresh audio from server"
        >
          {isRefreshing ? (
            <FaSpinner className="animate-spin h-4 w-4 text-white" />
          ) : (
            <FaSync className="h-4 w-4 text-gray-400" />
          )}
        </button>

        {/* Edit Word Button */}
        <button
          onClick={handleOpenEditModal}
          className="absolute top-2 right-2 p-2 rounded-full bg-gray-700 bg-opacity-50 hover:bg-opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
          title="Edit word"
        >
          <FaPencilAlt className="h-4 w-4 text-gray-400" />
        </button>

        {/* Favorite Word Button */}
        <div className="absolute top-2 left-2">
          <FavoriteToggleButton
            isFavorite={isFavorite}
            onToggle={onToggleFavorite}
            className="bg-gray-700 bg-opacity-50 hover:bg-opacity-75 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
            iconClassName="h-4 w-4"
          />
        </div>
      </div>

      <EditWordModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        word={word}
        userId={userId}
        onWordUpdated={onWordUpdated}
      />
    </>
  );
}

export default Flashcard;