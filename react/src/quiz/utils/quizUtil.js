export const removePunctuationAndNormalize = (str) => {
  if (typeof str !== 'string') return '';
  // 1. Normalize Unicode characters to ensure consistent representation.
  // 2. Remove punctuation.
  // 3. Trim whitespace from ends.
  // 4. Collapse multiple internal whitespace chars to a single space.
  return str.normalize('NFC')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "")
    .trim()
    .replace(/\s+/g, ' ');
};

export const isKoreanAnswerCorrect = (koreanGuess, correctAnswer) => {
  if (!correctAnswer || !correctAnswer.korean) return false;
  const cleanedGuess = removePunctuationAndNormalize(koreanGuess.toLowerCase());
  const cleanedAnswer = removePunctuationAndNormalize(correctAnswer.korean.toLowerCase());
  const result = cleanedGuess === cleanedAnswer;
  return result;
};

export const isEnglishAnswerCorrect = (englishGuess, correctAnswer) => {
  if (!correctAnswer || !correctAnswer.english) return false;
  const cleanedGuess = removePunctuationAndNormalize(englishGuess.toLowerCase());
  const englishAnswers = correctAnswer.english.split(',').map(w => removePunctuationAndNormalize(w.toLowerCase()));
  const result = englishAnswers.includes(cleanedGuess);
  return result;
};
