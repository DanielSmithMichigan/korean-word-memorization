import React from 'react';

function DiffHighlight({ trace }) {
  if (!trace) return null;

  const renderSegment = (char, type, isGuess) => {
    let className = 'px-1 rounded';
    switch (type) {
      case 'substitute':
        className += ' bg-yellow-700 text-yellow-200';
        break;
      case 'delete': // Extra character in guess
        if (isGuess) className += ' bg-red-700 text-red-200 line-through';
        else return null; // Don't render a placeholder in correct answer
        break;
      case 'insert': // Missing character in guess
        if (isGuess) return null; // Don't render a placeholder in guess
        else className += ' bg-green-700 text-green-200';
        break;
      default: // 'equal'
        className += ' text-gray-400';
        break;
    }
    return <span className={className}>{char}</span>;
  };

  const renderTrace = (isGuess) => {
    return trace.map((item, index) => (
      <React.Fragment key={index}>
        {renderSegment(isGuess ? item.char1 : item.char2, item.type, isGuess)}
      </React.Fragment>
    ));
  };

  return (
    <div className="mt-3 p-3 bg-gray-900 rounded-lg text-left">
      <div className="flex items-center">
        <span className="font-bold text-sm text-gray-400 w-24 flex-shrink-0">Your Guess:</span>
        <div className="font-mono tracking-wider text-lg">{renderTrace(true)}</div>
      </div>
      <div className="flex items-center mt-1">
        <span className="font-bold text-sm text-gray-400 w-24 flex-shrink-0">Correct:</span>
        <div className="font-mono tracking-wider text-lg">{renderTrace(false)}</div>
      </div>
    </div>
  );
}

export default DiffHighlight;
