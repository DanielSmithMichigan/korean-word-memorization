import React, { useState } from 'react';
import { FaVolumeUp, FaSpinner, FaSync } from 'react-icons/fa';

function Flashcard({
  word,
  isFlipped,
  audioStatus,
  onPlayAudio,
  onRefreshAudio,
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefreshAudio();
    setIsRefreshing(false);
  };

  return (
    <div className="flashcard-container max-w-md mx-auto mb-6 relative">
      <div className={`flashcard-inner ${isFlipped ? 'is-flipped' : ''}`}>
        {/* Card Front */}
        <div className="flashcard-front">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="flex items-center justify-center mb-4">
              <span className="text-3xl sm:text-4xl font-semibold text-white mr-4">{word.english}</span>
              <button
                onClick={onPlayAudio}
                className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
                disabled={audioStatus === 'loading'}
              >
                {audioStatus === 'loading' ? (
                  <FaSpinner className="animate-spin h-5 w-5 text-white" />
                ) : (
                  <FaVolumeUp className="h-5 w-5 text-white" />
                )}
              </button>
            </div>
            <div className="text-center text-lg text-gray-300">
              <span dangerouslySetInnerHTML={{ __html: word.example }} />
            </div>
          </div>
        </div>
        {/* Card Back */}
        <div className="flashcard-back">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="text-center text-3xl sm:text-4xl font-bold mb-4">
              {word.korean}
            </div>
            <div className="text-center text-lg text-gray-300">
              <span dangerouslySetInnerHTML={{ __html: word.example }} />
            </div>
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
    </div>
  );
}

export default Flashcard;
