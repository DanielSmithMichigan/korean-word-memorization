import React from 'react';

function AdvancedQuizDetails({
  useGoogleCloud,
  onTtsApiChange,
  correctCount,
  attemptCount,
  tableWords,
  currentWord,
}) {
  const successRate = attemptCount > 0 ? ((correctCount / attemptCount) * 100).toFixed(0) : 0;

  return (
    <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg mt-4">
      <h3 className="text-2xl font-bold text-center mb-6">Advanced Settings</h3>
      <div className="flex items-center justify-center mb-8">
        <input
          type="checkbox"
          id="useGoogleCloud"
          checked={useGoogleCloud}
          onChange={(e) => onTtsApiChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-gray-700"
        />
        <label htmlFor="useGoogleCloud" className="ml-3 block text-sm font-medium text-gray-300">
          Use Google Cloud TTS (un-checked: Gemini)
        </label>
      </div>

      <h3 className="text-2xl font-bold text-center mb-4">Session Details</h3>
      
      <div className="bg-gray-700 p-4 rounded-lg mb-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-3xl sm:text-4xl font-bold text-green-400">{correctCount}</p>
            <p className="text-sm text-gray-400">Correct</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-bold text-red-400">{attemptCount - correctCount}</p>
            <p className="text-sm text-gray-400">Incorrect</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-bold text-blue-400">{attemptCount}</p>
            <p className="text-sm text-gray-400">Total</p>
          </div>
          <div>
            <p className="text-3xl sm:text-4xl font-bold text-purple-400">{successRate}%</p>
            <p className="text-sm text-gray-400">Success Rate</p>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <h3 className="text-2xl font-bold text-center mb-4">Word Probabilities</h3>
        <div className="overflow-x-auto hidden md:block">
          <table className="min-w-full bg-gray-700 rounded-lg">
            <thead>
              <tr className="text-left text-gray-300">
                <th className="p-3">English</th>
                <th className="p-3">Korean</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Successes</th>
                <th className="p-3">Success Rate</th>
                <th className="p-3">Score</th>
                <th className="p-3">Probability</th>
              </tr>
            </thead>
            <tbody>
              {tableWords.map((word) => (
                <tr key={word.id} className={`border-t border-gray-600 ${word.id === currentWord.id ? 'bg-gray-600' : ''}`}>
                  <td className="p-3">{word.english}</td>
                  <td className="p-3">{word.korean}</td>
                  <td className="p-3">{word.attempts || 0}</td>
                  <td className="p-3">{word.successes || 0}</td>
                  <td className="p-3">{((word.recentSuccessRate || 0) * 100).toFixed(0)}%</td>
                  <td className="p-3">{word.score.toFixed(2)}</td>
                  <td className="p-3">{(word.probability * 100).toFixed(2)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-3">
          {tableWords.map((word) => (
            <div
              key={word.id}
              className={`bg-gray-700 p-4 rounded-lg ${word.id === currentWord.id ? 'ring-2 ring-green-500' : 'ring-1 ring-gray-600'}`}
            >
              <div className="flex justify-between items-center font-bold text-lg mb-2">
                <span>{word.english}</span>
                <span>{word.korean}</span>
              </div>
              <div className="border-t border-gray-600 pt-2 text-sm text-gray-300 grid grid-cols-2 gap-x-4 gap-y-1">
                <span>Attempts: <span className="font-semibold text-white">{word.attempts || 0}</span></span>
                <span>Successes: <span className="font-semibold text-white">{word.successes || 0}</span></span>
                <span>Rate: <span className="font-semibold text-white">{((word.recentSuccessRate || 0) * 100).toFixed(0)}%</span></span>
                <span>Score: <span className="font-semibold text-white">{word.score.toFixed(2)}</span></span>
                <span className="col-span-2">Probability: <span className="font-semibold text-white">{(word.probability * 100).toFixed(2)}%</span></span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdvancedQuizDetails;
