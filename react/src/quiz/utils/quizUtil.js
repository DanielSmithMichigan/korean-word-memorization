const ALLOWED_CHARACTERS_REGEX = /[^a-zA-Z\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7AF\s]/g;

export const removePunctuationAndNormalize = (str) => {
  if (typeof str !== 'string') return '';
  // Normalize text, strip everything except English letters, Hangul blocks, and spaces,
  // then collapse duplicate whitespace so comparisons stay consistent.
  return str.normalize('NFC')
    .replace(ALLOWED_CHARACTERS_REGEX, '')
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
