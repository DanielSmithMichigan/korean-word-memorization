import React, { useState } from 'react';
import { FaSpinner, FaStar } from 'react-icons/fa';

function FavoriteToggleButton({
  isFavorite,
  onToggle,
  className = '',
  iconClassName = 'h-5 w-5',
  titleAdd = 'Add to favorites',
  titleRemove = 'Remove from favorites',
  disabled = false,
}) {
  const [isBusy, setIsBusy] = useState(false);

  const handleClick = async (event) => {
    if (disabled || isBusy) return;
    try {
      setIsBusy(true);
      await onToggle?.(event);
    } finally {
      setIsBusy(false);
    }
  };

  const title = isFavorite ? titleRemove : titleAdd;

  return (
    <button
      onClick={handleClick}
      className={`p-2 rounded-full focus:outline-none ${className} ${disabled || isBusy ? 'opacity-60 cursor-not-allowed' : ''}`}
      title={title}
      aria-label={title}
      aria-busy={isBusy}
      disabled={disabled || isBusy}
   >
      {isBusy ? (
        <FaSpinner className={`animate-spin ${iconClassName} text-gray-300`} />
      ) : (
        <FaStar className={`${iconClassName} ${isFavorite ? 'text-yellow-400' : 'text-gray-400'}`} />
      )}
    </button>
  );
}

export default FavoriteToggleButton;


