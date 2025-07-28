import { useState } from 'react';

const WORD_UPLOADER_API_ENDPOINT = 'https://7jsbesilfh.execute-api.us-east-1.amazonaws.com/prod/';

function Uploader({ userId }) {
  const [newWordPairs, setNewWordPairs] = useState([{ korean: '', english: '' }]);
  const [isSubmitting, setIsSubmitting] = useState(false);


  // No changes needed to the logic handlers
  const handleAddPair = () => {
    setNewWordPairs([...newWordPairs, { korean: '', english: '' }]);
  };

  const handleRemovePair = (index) => {
    // Prevent removing the last pair to avoid an empty state
    if (newWordPairs.length > 1) {
      const newPairs = [...newWordPairs];
      newPairs.splice(index, 1);
      setNewWordPairs(newPairs);
    }
  };

  const handleInputChange = (index, event) => {
    const newPairs = [...newWordPairs];
    newPairs[index][event.target.name] = event.target.value;
    setNewWordPairs(newPairs);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const url = new URL(WORD_UPLOADER_API_ENDPOINT);
      url.searchParams.append('userId', userId);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wordPairs: newWordPairs }),
      });
      
      if (!response.ok) {
        throw new Error('Server responded with an error');
      }

      alert('Word pairs submitted successfully!');
      setNewWordPairs([{ korean: '', english: '' }]);
    } catch (error) {
      console.error('Error submitting word pairs:', error);
      alert('Error submitting word pairs. Please try again.');
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div>
      {/* Use responsive padding (p-4 for mobile, p-8 for larger screens) */}
      <div className="max-w-2xl mx-auto bg-gray-800 p-4 sm:p-8 rounded-xl shadow-lg mb-12">
        {/* Responsive font size */}
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">Upload New Words</h2>
        <form onSubmit={handleSubmit}>
          {newWordPairs.map((pair, index) => (
            // Flex container stacks vertically on mobile, horizontally on sm+ screens
            // `gap-3` provides spacing for both layouts
            <div key={index} className="flex flex-col sm:flex-row items-center gap-3 mb-4">
              <input
                type="text"
                name="korean"
                placeholder="Korean"
                value={pair.korean}
                onChange={(e) => handleInputChange(index, e)}
                // `w-full` works in both vertical and horizontal flex layouts
                className="shadow appearance-none border border-gray-700 rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline"
                required
              />
              <input
                type="text"
                name="english"
                placeholder="English"
                value={pair.english}
                onChange={(e) => handleInputChange(index, e)}
                className="shadow appearance-none border border-gray-700 rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline"
                required
              />
              <button
                type="button"
                onClick={() => handleRemovePair(index)}
                // Full-width on mobile, auto-width on larger screens. `flex-shrink-0` prevents squishing.
                // Disabled state to prevent removing the very last row.
                className="bg-red-600 hover:bg-red-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-auto flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={newWordPairs.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}

          {/* This container stacks buttons vertically on mobile and horizontally on larger screens */}
          {/* `flex-col-reverse` puts the primary action ("Submit") visually first on mobile */}
          {/* `sm:justify-end` aligns buttons to the right on larger screens */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-4 mt-8">
            <button
              type="button"
              onClick={handleAddPair}
              // Full-width on mobile, auto-width on larger screens
              className="bg-blue-600 hover:bg-blue-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-auto"
            >
              Add Pair
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-800 text-white font-bold py-3 px-5 rounded-lg focus:outline-none focus:shadow-outline w-full sm:w-auto disabled:bg-green-900"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Uploader;