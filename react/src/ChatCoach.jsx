import React, { useState } from 'react';
import { GET_WORD_PAIRS_API_ENDPOINT } from './api/endpoints';

function ChatCoach({ userId }) {
  const [loading, setLoading] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [stats, setStats] = useState({ koreanCount: 0 });

  const fetchAllPackages = async () => {
    setLoading(true);
    const koreanSet = new Set();
    // English list no longer needed; explanations can use any English.

    try {
      let lastEvaluatedKey = null;
      do {
        const url = new URL(GET_WORD_PAIRS_API_ENDPOINT);
        url.searchParams.append('userId', userId);
        if (lastEvaluatedKey) {
          url.searchParams.append('lastEvaluatedKey', JSON.stringify(lastEvaluatedKey));
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch word packages');
        }
        const data = await response.json();

        for (const item of (data.Items || [])) {
          if (Array.isArray(item.wordPairs)) {
            for (const wp of item.wordPairs) {
              if (wp?.korean) {
                const normalized = String(wp.korean || '')
                  .normalize('NFC')
                  .trim();
                if (normalized) koreanSet.add(normalized);
              }
              // English words intentionally ignored for constraints
            }
          }
        }
        lastEvaluatedKey = data.LastEvaluatedKey;
      } while (lastEvaluatedKey);

      const koreanWords = Array.from(koreanSet).filter(Boolean).sort((a, b) => a.localeCompare(b, 'ko'));
      setStats({ koreanCount: koreanWords.length });

      const prompt = buildPrompt(koreanWords);
      setPromptText(prompt);
    } catch (err) {
      console.error(err);
      alert('Error fetching your vocabulary. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const buildPrompt = (koreanWords) => {
    const koreanList = koreanWords.join(', ');

    return (
`You are my Korean conversation coach. Have a natural, friendly conversation with me in Korean only, using short, humanlike messages.

Your constraints and behavior:
- Use only the allowed Korean vocabulary below. If something I say uses a word outside the allowed set, rephrase using only allowed words and suggest in-list alternatives.
- Keep the conversation in Korean by default. If I explicitly ask "what did you say?" or request an explanation, respond in clear English (any English vocabulary allowed) and include a simple breakdown.
- Act as a coach: correct my Korean spelling and spacing gently. After I make a mistake, provide the corrected version and a brief explanation in Korean; use English only if I ask.
- Prefer everyday, simple phrasing and avoid introducing new vocabulary outside the allowed list.
- Ask follow-up questions that can be answered using only the allowed words.
- It's OK for me to use english words in the sentence occassionally if I don't know the korean word.
- Use a red X to indicate when I've made a mistake
- Use a green checkmark at the beginning to indicate if my sentence was good


Allowed Korean vocabulary (${koreanWords.length} words):
${koreanList}

Start the conversation in Korean with a simple greeting using only allowed words. Don't be open ended such as "how are you", pick a topic.`
    );
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      alert('Prompt copied to clipboard!');
    } catch (e) {
      console.error('Copy failed', e);
      alert('Copy failed. You can select and copy manually.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg">
      <h2 className="text-3xl font-bold text-white mb-6 text-center">Chat Coach Setup</h2>
      <p className="text-gray-300 mb-6 text-center">Build a ready-to-use prompt that makes ChatGPT coach you in Korean using only your vocabulary.</p>

      <div className="flex justify-center mb-6">
        <button
          onClick={fetchAllPackages}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-800 disabled:bg-blue-900 text-white font-bold py-3 px-6 rounded-lg"
        >
          {loading ? 'Building your prompt...' : 'Generate Prompt from My Words'}
        </button>
      </div>

      {promptText && (
        <>
          <div className="text-sm text-gray-300 mb-3 text-center">Korean words: {stats.koreanCount}</div>
          <textarea
            readOnly
            className="w-full h-96 p-4 bg-gray-900 text-gray-100 rounded-lg border border-gray-700 mb-4"
            value={promptText}
          />
          <div className="flex justify-end">
            <button onClick={handleCopy} className="bg-green-600 hover:bg-green-800 text-white font-bold py-2 px-5 rounded-lg">Copy Prompt</button>
          </div>
        </>
      )}
    </div>
  );
}

export default ChatCoach;
