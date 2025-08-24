import React from 'react';
import StreakDisplay from './StreakDisplay';

function AdvancedQuizDetails({
  useGoogleCloud,
  onTtsApiChange,
  correctCount,
  attemptCount,
  tableWords,
  wordSuccessCounters,
  currentWord,
  activeWindowSize,
  setActiveWindowSize,
  consecutiveSuccessesRequired,
  setConsecutiveSuccessesRequired,
  graduatedWordRecurrenceRate,
  setGraduatedWordRecurrenceRate,
  onRemoveCurrentWordFromSession,
  onForceGraduateCurrentWord,
  onForceGraduateWord,
  streakHistory,
}) {
  const successRate = attemptCount > 0 ? ((correctCount / attemptCount) * 100).toFixed(0) : 0;

  const getStatusPill = (status) => {
    const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
    switch (status) {
      case 'Active':
        return <span className={`${baseClasses} bg-blue-500 text-white`}>Active</span>;
      case 'Graduated':
        return <span className={`${baseClasses} bg-green-500 text-white`}>Graduated</span>;
      case 'Pending':
        return <span className={`${baseClasses} bg-gray-500 text-gray-200`}>Pending</span>;
      default:
        return null;
    }
  };

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

      <h3 className="text-2xl font-bold text-center mb-4">Quiz Strategy</h3>
      <div className="bg-gray-700 p-4 rounded-lg mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <label htmlFor="activeWindowSize" className="block text-sm font-medium text-gray-300">
            Active Window Size: <span className="font-bold text-white">{activeWindowSize}</span>
          </label>
          <input
            type="range"
            id="activeWindowSize"
            min="1"
            max="10"
            value={activeWindowSize}
            onChange={(e) => setActiveWindowSize(Number(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="consecutiveSuccesses" className="block text-sm font-medium text-gray-300">
            Successes to Graduate: <span className="font-bold text-white">{consecutiveSuccessesRequired}</span>
          </label>
          <input
            type="range"
            id="consecutiveSuccesses"
            min="1"
            max="10"
            value={consecutiveSuccessesRequired}
            onChange={(e) => setConsecutiveSuccessesRequired(Number(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="graduatedRecurrence" className="block text-sm font-medium text-gray-300">
            Graduated Recurrence: <span className="font-bold text-white">{(graduatedWordRecurrenceRate * 100).toFixed(0)}%</span>
          </label>
          <input
            type="range"
            id="graduatedRecurrence"
            min="0"
            max="0.5"
            step="0.01"
            value={graduatedWordRecurrenceRate}
            onChange={(e) => setGraduatedWordRecurrenceRate(Number(e.target.value))}
            className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      <h3 className="text-2xl font-bold text-center mb-4">Session Details</h3>
      
      <div className="bg-gray-700 p-4 rounded-lg mb-8">
        {/* Streak history moved here */}
        <div className="mb-4">
          <p className="text-center text-sm text-gray-300 mb-2">Recent Streak</p>
          <StreakDisplay history={streakHistory || []} />
        </div>
        <div className="flex justify-center gap-3 mb-4">
          <button
            className="px-3 py-2 rounded-md bg-gray-600 hover:bg-gray-500 text-white text-sm disabled:opacity-50"
            onClick={onRemoveCurrentWordFromSession}
            disabled={!currentWord}
            title="Remove current word from active window for this session"
          >
            Remove current word from session
          </button>
          <button
            className="px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white text-sm disabled:opacity-50"
            onClick={onForceGraduateCurrentWord}
            disabled={!currentWord || currentWord.isGraduated}
            title="Mark current word as graduated now"
          >
            Mark current word as graduated
          </button>
        </div>
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

      {/* Active Window Progress */}
      <div className="mt-10">
        <h3 className="text-2xl font-bold text-center mb-4">Active Window Progress</h3>
        <div className="max-w-md mx-auto space-y-2">
          {tableWords
            .filter((w) => w.status === 'Active')
            .map((w) => {
              const key = w.korean;
              const current = Math.min(
                wordSuccessCounters[key] || 0,
                Math.max(1, consecutiveSuccessesRequired)
              );
              const total = Math.max(1, consecutiveSuccessesRequired);
              const percent = Math.round((current / total) * 100);
              const isCurrent = !!(currentWord && key === currentWord.korean);
              return (
                <div
                  key={key}
                  className={`px-2 py-1 rounded-lg bg-gray-900/60 border ${
                    isCurrent ? 'border-indigo-400' : 'border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1 text-xs">
                    <span className={`truncate ${isCurrent ? 'text-white' : 'text-gray-300'}`}>
                      {w.english || ''}
                      <span className="text-gray-500"> {w.korean ? `· ${w.korean}` : ''}</span>
                    </span>
                    <span className="text-gray-400 tabular-nums">{current}/{total}</span>
                  </div>
                  <div className="h-2 w-full bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ease-out ${
                        isCurrent ? 'ring-1 ring-indigo-300' : ''
                      }`}
                      style={{
                        width: `${percent}%`,
                        background: 'linear-gradient(90deg, #6366F1 0%, #22C55E 100%)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      <div className="mt-10">
        <h3 className="text-2xl font-bold text-center mb-4">Word Details</h3>
        <div className="overflow-x-auto hidden md:block">
          <table className="min-w-full bg-gray-700 rounded-lg">
            <thead>
              <tr className="text-left text-gray-300">
                <th className="p-3">English</th>
                <th className="p-3">Korean</th>
                <th className="p-3">Status</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Consecutive</th>
                <th className="p-3">Probability</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tableWords.map((word) => (
                <tr key={word.id} className={`border-t border-gray-600 ${currentWord && word.id === currentWord.id ? 'bg-gray-600' : ''}`}>
                  <td className="p-3">{word.english}</td>
                  <td className="p-3">{word.korean}</td>
                  <td className="p-3">{getStatusPill(word.status)}</td>
                  <td className="p-3">{word.attempts || 0}</td>
                  <td className="p-3">{wordSuccessCounters[word.korean] || 0}</td>
                  <td className="p-3">{word.status === 'Active' ? `${(word.probability * 100).toFixed(2)}%` : 'N/A'}</td>
                  <td className="p-3">
                    <button
                      className="px-2 py-1 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-50"
                      onClick={() => onForceGraduateWord && onForceGraduateWord(word)}
                      disabled={word.status === 'Graduated'}
                    >
                      Graduate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="md:hidden space-y-3">
          {tableWords.map((word) => (
            <div
              key={word.id}
              className={`bg-gray-700 p-4 rounded-lg ${currentWord && word.id === currentWord.id ? 'ring-2 ring-green-500' : 'ring-1 ring-gray-600'}`}
            >
              <div className="flex justify-between items-center font-bold text-lg mb-2">
                <span>{word.english}</span>
                <span>{word.korean}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                {getStatusPill(word.status)}
                <span className="text-sm text-gray-300">
                  Consecutive: <span className="font-semibold text-white">{wordSuccessCounters[word.korean] || 0}</span>
                </span>
              </div>
              <div className="border-t border-gray-600 pt-2 text-sm text-gray-300 grid grid-cols-2 gap-x-4 gap-y-2 items-center">
                <span>Attempts: <span className="font-semibold text-white">{word.attempts || 0}</span></span>
                <span className="col-span-2">
                  Probability: <span className="font-semibold text-white">{word.status === 'Active' ? `${(word.probability * 100).toFixed(2)}%` : 'N/A'}</span>
                </span>
                <div className="col-span-2 flex justify-end">
                  <button
                    className="px-3 py-1 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-50"
                    onClick={() => onForceGraduateWord && onForceGraduateWord(word)}
                    disabled={word.status === 'Graduated'}
                  >
                    Graduate
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdvancedQuizDetails;
