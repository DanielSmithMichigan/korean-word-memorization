const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Load file from current directory
const inputPath = path.join(process.cwd(), 'input.txt');
const content = fs.readFileSync(inputPath, 'utf-8');

// Split into lines and trim
const lines = content.split('\n').map(line => line.trim()).filter(Boolean);

// Helper to check if a line is mostly Korean
const isKorean = (line) => {
  // Remove whitespace and punctuation
  const cleaned = line.replace(/[^\uAC00-\uD7A3]/g, '');
  // Check if over half the characters are Hangul
  const hangulCount = (cleaned.match(/[\uAC00-\uD7A3]/g) || []).length;
  return hangulCount > 0 && hangulCount / line.length > 0.5;
};

const wordPairs = [];

for (let i = 0; i < lines.length - 1; i++) {
  const line = lines[i];
  const nextLine = lines[i + 1];

  if (isKorean(line) && nextLine && /[a-zA-Z]/.test(nextLine)) {
    wordPairs.push({
      korean: line,
      english: nextLine,
    });
    i++; // Skip the next line since we've used it
  }
}
