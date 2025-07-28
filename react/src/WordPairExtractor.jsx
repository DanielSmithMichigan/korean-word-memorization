import React, { useState, useEffect } from 'react';

const GET_WORD_PAIRS_API_ENDPOINT = 'https://u9bwocgqhf.execute-api.us-east-1.amazonaws.com/prod/';
const WORD_UPLOADER_API_ENDPOINT = 'https://7jsbesilfh.execute-api.us-east-1.amazonaws.com/prod/';

const WordPairExtractor = ({ userId }) => {
  const [text, setText] = useState('');
  const [existingPairs, setExistingPairs] = useState(new Set());
  const [newlyParsedPairs, setNewlyParsedPairs] = useState([]);
  const [alreadyEnteredPairs, setAlreadyEnteredPairs] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const fetchAllWordPackages = async () => {
      if (!userId) return;

      let allPairs = [];
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
              allPairs.push(...item.wordPairs);
            }
          }
          lastEvaluatedKey = data.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        setExistingPairs(new Set(allPairs.map(p => p.korean)));
      } catch (error) {
        console.error('Error fetching word packages:', error);
      }
    };

    fetchAllWordPackages();
  }, [userId]);

  const isKoreanLine = (line) => {
    const hangulMatches = (line.match(/[\uAC00-\uD7A3]/g) || []).length;
    const totalMatches = line.replace(/\s/g, '').length;
    return totalMatches > 0 && hangulMatches / totalMatches >= 0.5;
  };

  const isEnglishLine = (line) => {
    const alphaMatches = (line.match(/[a-zA-Z]/g) || []).length;
    const totalMatches = line.replace(/\s/g, '').length;
    return totalMatches > 0 && alphaMatches / totalMatches >= 0.5;
  };

  const isExampleLine = (line) => {
    const match = line.match(/^<example>(.*)<\/example>$/);
    return match ? match[1].trim() : null;
  };

  const handleParse = () => {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const parsedPairs = [];

    let i = 0;
    while (i < lines.length - 1) {
      const line1 = lines[i];
      const line2 = lines[i + 1];
      const line3 = lines[i + 2];

      if (isKoreanLine(line1) && isEnglishLine(line2)) {
        const exampleContent = line3 ? isExampleLine(line3) : null;

        if (exampleContent !== null) {
          parsedPairs.push({
            korean: line1,
            english: line2,
            example: exampleContent,
          });
          i += 3;
        } else {
          parsedPairs.push({
            korean: line1,
            english: line2,
          });
          i += 2;
        }
      } else {
        i++;
      }
    }

    const newPairs = [];
    const enteredPairs = [];
    for (const pair of parsedPairs) {
      if (existingPairs.has(pair.korean)) {
        enteredPairs.push(pair);
      } else {
        newPairs.push(pair);
      }
    }
    setNewlyParsedPairs(newPairs);
    setAlreadyEnteredPairs(enteredPairs);
  };

  const handleSave = async (pairsToSave) => {
    if (pairsToSave.length === 0) {
      alert("No words to save.");
      return;
    }
    setIsSaving(true);
    setProgress(0);

    const CHUNK_SIZE = 3;
    const chunks = [];
    for (let i = 0; i < pairsToSave.length; i += CHUNK_SIZE) {
      chunks.push(pairsToSave.slice(i, i + CHUNK_SIZE));
    }
    
    const totalChunks = chunks.length;
    const isoDate = new Date().toISOString();
    chunks.reverse();

    let chunksCompleted = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkNum = totalChunks - 1 - i;
      const customIdentifier = `${isoDate}-${chunkNum}`;
      
      try {
        const url = new URL(WORD_UPLOADER_API_ENDPOINT);
        url.searchParams.append('userId', userId);

        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            wordPairs: chunk,
            customIdentifier: customIdentifier 
          }),
        });
        chunksCompleted++;
        setProgress(Math.round((chunksCompleted / chunks.length) * 100));
      } catch (error) {
        console.error('Error submitting word pairs:', error);
        alert('An error occurred while saving. Please try again.');
        setIsSaving(false);
        setProgress(0);
        return;
      }
    }

    const newKoreanWords = new Set(pairsToSave.map(p => p.korean));
    setExistingPairs(prev => new Set([...prev, ...newKoreanWords]));

    setNewlyParsedPairs([]);
    setAlreadyEnteredPairs([]);
    setText('');

    setIsSaving(false);
    setProgress(0);
    alert('Word pairs saved successfully!');
  };

  // --- MODIFIED FUNCTION ---
  // This function now uses `dangerouslySetInnerHTML` to render the example string as HTML.
  const renderPairList = (pairs) => (
    <ul className="w-full">
      {pairs.map((pair, index) => (
        <li key={index} className="border-b border-gray-700 p-2">
          <strong>Ko:</strong> {pair.korean} <br />
          <strong>En:</strong> {pair.english}
          {pair.example && (
            <>
              <br />
              <strong>Ex:</strong> <span dangerouslySetInnerHTML={{ __html: pair.example }} />
            </>
            )
          }
        </li>
      ))}
    </ul>
  );
  // --- END OF MODIFICATION ---

  return (
    <div className="container mx-auto p-4">
      <h2 className="text-2xl font-bold mb-4 text-center">Word Pair Extractor</h2>
      <textarea
        className="w-full h-64 p-2 border rounded bg-gray-800 text-white"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
`Paste your text here.\nFormat:\nKorean Line\nEnglish Line\n<example>Optional Example with <span>HTML</span></example>\n...`
        }
        disabled={isSaving}
      ></textarea>
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4 w-full"
        onClick={handleParse}
        disabled={isSaving}
      >
        Parse Text
      </button>

      {isSaving && (
        <div className="w-full bg-gray-700 rounded-full h-2.5 my-4">
          <div className="bg-blue-600 h-2.5 rounded-full" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      <div className="mt-6">
        <div className="text-center mb-4">
            <button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
              onClick={() => handleSave([...newlyParsedPairs, ...alreadyEnteredPairs])}
              disabled={isSaving || (newlyParsedPairs.length === 0 && alreadyEnteredPairs.length === 0)}
            >
                {isSaving ? `Saving... ${progress}%` : 'Add ALL'}
            </button>
        </div>
        <div className="flex flex-col md:flex-row md:space-x-4">
            <div className="flex-1 bg-gray-800 rounded-lg p-4 mb-4 md:mb-0 flex flex-col items-center">
                <h3 className="text-xl font-bold mb-2">New Word Pairs ({newlyParsedPairs.length})</h3>
                <button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded mb-2 disabled:opacity-50"
                  onClick={() => handleSave(newlyParsedPairs)}
                  disabled={isSaving || newlyParsedPairs.length === 0}
                >
                    {isSaving ? `Saving... ${progress}%` : 'Add New'}
                </button>
                {renderPairList(newlyParsedPairs)}
            </div>

            <div className="flex-1 bg-gray-800 rounded-lg p-4 flex flex-col items-center">
                <h3 className="text-xl font-bold mb-2">Already Entered ({alreadyEnteredPairs.length})</h3>
                <button 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded mb-2 disabled:opacity-50"
                  onClick={() => handleSave(alreadyEnteredPairs)}
                  disabled={isSaving || alreadyEnteredPairs.length === 0}
                >
                    {isSaving ? `Saving... ${progress}%` : 'Add Pre-existing'}
                </button>
                {renderPairList(alreadyEnteredPairs)}
            </div>
        </div>
      </div>
    </div>
  );
};

export default WordPairExtractor;