import React, { useState, useEffect, useMemo, useRef } from 'react';

import { GET_WORD_PAIRS_API_ENDPOINT } from './api/endpoints';

// A basic set of Hangul characters for practice
const HANGUL_LETTERS = [
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
  'ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ', 'ㅣ',
  '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'
];

// Helper to get a new random line
const generateLine = (sourceData, wordsPerLine) => {
  const words = [];
  if (sourceData.length === 0 || wordsPerLine === 0) {
    return { key: Date.now() + Math.random(), words: [] };
  }
  for (let i = 0; i < wordsPerLine; i++) {
    const randomIndex = Math.floor(Math.random() * sourceData.length);
    words.push({ text: sourceData[randomIndex], status: 'pending' });
  }
  return { key: Date.now() + Math.random(), words };
};


function TypingPractice({ wordSource, onBack }) {
  const [sourceData, setSourceData] = useState([]);
  const [lines, setLines] = useState([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [userInput, setUserInput] = useState('');
  const inputRef = useRef(null);
  const lineContainerRef = useRef(null);
  const [wordsPerLine, setWordsPerLine] = useState(0);

  // Stats tracking
  const [startTime, setStartTime] = useState(null);
  const [completedChars, setCompletedChars] = useState(0);
  const [completedWords, setCompletedWords] = useState(0);
  const [showStats, setShowStats] = useState(false);

  // 1. Set up the source data based on the prop
  useEffect(() => {
    let initialSource = [];
    if (wordSource === 'letters') {
      initialSource = HANGUL_LETTERS.map(l => l.normalize());
    } else if (Array.isArray(wordSource)) {
      initialSource = wordSource.map(w => w.trim().normalize());
    }
    
    if (initialSource.length > 0) {
      setSourceData(initialSource);
    }
  }, [wordSource]);

  // 2. Calculate words per line when the container is available or resized
  useEffect(() => {
    const calculateWordsPerLine = () => {
      if (lineContainerRef.current) {
        const containerWidth = lineContainerRef.current.offsetWidth;
        const avgWordWidth = 80; // Adjust this value based on your font and styling
        const newWordsPerLine = Math.floor(containerWidth / avgWordWidth);
        setWordsPerLine(newWordsPerLine > 0 ? newWordsPerLine : 1);
      }
    };

    calculateWordsPerLine(); // Initial calculation
    window.addEventListener('resize', calculateWordsPerLine);
    return () => window.removeEventListener('resize', calculateWordsPerLine);
  }, [lineContainerRef.current]);

  // 3. Initialize or update lines when wordsPerLine or sourceData changes
  useEffect(() => {
    if (sourceData.length > 0 && wordsPerLine > 0) {
      const initialLines = [
        { key: 'initial-empty', words: [] },
        generateLine(sourceData, wordsPerLine),
        generateLine(sourceData, wordsPerLine),
      ];
      setLines(initialLines);
      setWordIndex(0);
      setUserInput('');
      inputRef.current?.focus();
      setStartTime(Date.now());
      setCompletedChars(0);
      setCompletedWords(0);
    }
  }, [sourceData, wordsPerLine]);
  
  // Focus input when component mounts or resets
  useEffect(() => {
    inputRef.current?.focus();
  }, []);


  const handleInputChange = (e) => {
    // Normalize the input value as the user types
    const value = e.target.value.normalize();

    if (value.endsWith(' ')) {
      const submittedWord = value.trim();
      if (submittedWord === '') {
        setUserInput('');
        return;
      };

      const lineToUpdate = lines[1];
      const targetWord = lineToUpdate.words[wordIndex];

      const newLines = JSON.parse(JSON.stringify(lines)); // Deep copy
      
      const isCorrect = submittedWord === targetWord.text;
      newLines[1].words[wordIndex].status = isCorrect ? 'correct' : 'incorrect';

      if (isCorrect) {
        // Check if the line is complete
        if (wordIndex === newLines[1].words.length - 1) {
          // Line is complete. Update stats.
          const completedLine = newLines[1];
          const charsInLine = completedLine.words.reduce((acc, word) => acc + word.text.length, 0);
          setCompletedChars(prev => prev + charsInLine);
          setCompletedWords(prev => prev + completedLine.words.length);

          // Rotate the lines upwards.
          const newLine = generateLine(sourceData, wordsPerLine);
          setLines([completedLine, newLines[2], newLine]);
          setWordIndex(0); // Reset for the new current line
        } else {
          // Advance to the next word in the current line
          setLines(newLines);
          setWordIndex(wordIndex + 1);
        }
      } else {
        // If incorrect, show the status but don't advance
        setLines(newLines);
      }
      setUserInput('');

    } else {
      setUserInput(value);
    }
  };
  
  if (sourceData.length === 0 || lines.length === 0) {
    return (
        <div ref={lineContainerRef} className="text-center text-gray-400">
            Loading test...
        </div>
    );
  }

  const getWordClass = (lineIdx, wordIdx, status) => {
    const isCurrentWord = lineIdx === 1 && wordIdx === wordIndex;
    let className = 'transition-colors duration-200 px-1 rounded ';
    
    if (status === 'correct') {
      className += 'text-green-400';
    } else if (status === 'incorrect') {
      className += 'text-red-500';
    } else {
      className += 'text-gray-400';
    }

    if (isCurrentWord) {
      className += ' bg-gray-600';
    }
    
    return className;
  };

  const elapsedTime = startTime ? (Date.now() - startTime) / 1000 : 0; // in seconds
  const wps = elapsedTime > 0 ? (completedWords / elapsedTime).toFixed(2) : 0;
  const cps = elapsedTime > 0 ? (completedChars / elapsedTime).toFixed(2) : 0;

  return (
    <>
      <div>
        <div ref={lineContainerRef} className="bg-gray-900 p-4 rounded-lg mb-6 font-mono text-2xl tracking-wider leading-loose">
          {lines.map((line, lineIdx) => (
            <div 
              key={line.key} 
              className={`line h-12 flex items-center transition-opacity duration-500 ${lineIdx !== 1 ? 'opacity-50' : 'opacity-100'}`}
            >
              {line.words.map((word, wordIdx) => (
                <span key={wordIdx} className={getWordClass(lineIdx, wordIdx, word.status)}>
                  {word.text}
                </span>
              ))}
              {line.words.length === 0 && (
                <span className="text-gray-600 italic text-lg sm:text-2xl">
                  <span className="sm:hidden">Completed...</span>
                  <span className="hidden sm:inline">Completed lines will appear here...</span>
                </span>
              )}
            </div>
          ))}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={userInput}
          onChange={handleInputChange}
          className="shadow appearance-none border rounded w-full py-3 px-4 bg-gray-700 text-white leading-tight focus:outline-none focus:shadow-outline text-lg"
          placeholder="Type here and press space after each item..."
          autoCapitalize="none"
          autoCorrect="off"
        />
        <button
          onClick={onBack}
          className="mt-8 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg focus:outline-none focus:shadow-outline"
        >
          Back to Choice
        </button>
      </div>

      <div className="max-w-4xl mx-auto text-center pt-4">
        <button 
          onClick={() => setShowStats(!showStats)} 
          className="text-gray-400 hover:text-white focus:outline-none"
        >
          {showStats ? '[ hide stats ]' : '[ show stats ]'}
        </button>
      </div>

      {showStats && (
        <div className="max-w-4xl mx-auto bg-gray-800 p-4 sm:p-6 md:p-10 rounded-xl shadow-lg mt-4">
          <h3 className="text-2xl font-bold text-center mb-4">Session Details</h3>
          <div className="bg-gray-700 p-4 rounded-lg">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-green-400">{completedWords}</p>
                <p className="text-sm text-gray-400">Completed Words</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-blue-400">{completedChars}</p>
                <p className="text-sm text-gray-400">Completed Chars</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-purple-400">{wps}</p>
                <p className="text-sm text-gray-400">Words/sec</p>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold text-yellow-400">{cps}</p>
                <p className="text-sm text-gray-400">Chars/sec</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TypingPractice;
