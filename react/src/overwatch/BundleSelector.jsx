import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Helper function for UTF-8 safe Base64 encoding
const bytesToBase64 = (bytes) => {
  const binString = String.fromCodePoint(...bytes);
  return btoa(binString);
};

function BundleSelector() {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBundles = async () => {
      const apiEndpoint = 'https://y532iwg71e.execute-api.us-east-1.amazonaws.com/prod/bundles';
      try {
        const response = await fetch(apiEndpoint);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        setBundles(data);
      } catch (error) {
        setError(error.message);
        console.error("Failed to fetch bundles:", error);
        setBundles(['ashe_revenge_bundle1', 'ashe_hello_bundle1']);
      } finally {
        setLoading(false);
      }
    };
    fetchBundles();
  }, []);

  const handleBundleSelect = async (bundleId) => {
    const apiEndpoint = `https://y532iwg71e.execute-api.us-east-1.amazonaws.com/prod/quizzes/${bundleId}`;
    try {
      const response = await fetch(apiEndpoint);
      if (!response.ok) throw new Error('Network response was not ok');
      const quizzes = await response.json();
      if (quizzes.length > 0) {
        const randomQuiz = quizzes[Math.floor(Math.random() * quizzes.length)];
        const encodedBytes = new TextEncoder().encode(randomQuiz.id);
        const encodedId = bytesToBase64(encodedBytes);
        navigate(`/overwatch/quiz/${bundleId}?quiz=${encodeURIComponent(encodedId)}`);
      } else {
        alert("This bundle has no quizzes.");
      }
    } catch (error) {
      console.error("Failed to fetch quizzes for bundle:", error);
      alert("Failed to load quizzes for the selected bundle.");
    }
  };

  if (loading) return <div>Loading bundles...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Select a Quiz Bundle</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bundles.map(bundleId => (
          <button 
            key={bundleId} 
            onClick={() => handleBundleSelect(bundleId)}
            className="w-full p-4 bg-blue-500 hover:bg-blue-700 text-white font-bold rounded"
          >
            {bundleId}
          </button>
        ))}
      </div>
    </div>
  );
}

export default BundleSelector;
