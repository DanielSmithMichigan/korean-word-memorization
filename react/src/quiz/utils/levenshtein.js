// react/src/quiz/utils/levenshtein.js

/**
 * Calculates the Levenshtein distance between two strings and returns a trace of operations.
 * @param {string} str1 The first string (e.g., user's guess)
 * @param {string} str2 The second string (e.g., correct answer)
 * @returns {Array<Object>} A trace of edit operations.
 */
export function getLevenshteinTrace(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const dp = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) {
    dp[i][0] = i;
  }
  for (let j = 0; j <= len2; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // Deletion from str1
        dp[i][j - 1] + 1,      // Insertion into str1
        dp[i - 1][j - 1] + cost // Substitution or Equal
      );
    }
  }

  // Backtrack to find the trace
  let i = len1;
  let j = len2;
  const trace = [];
  while (i > 0 || j > 0) {
    const cost = (i > 0 && j > 0 && str1[i - 1] === str2[j - 1]) ? 0 : 1;

    if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + cost) {
      trace.unshift({
        type: cost === 0 ? 'equal' : 'substitute',
        char1: str1[i - 1],
        char2: str2[j - 1],
      });
      i--;
      j--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) {
      trace.unshift({
        type: 'insert', // Character inserted into str1 to match str2 (i.e., missing from guess)
        char1: null,
        char2: str2[j - 1],
      });
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      trace.unshift({
        type: 'delete', // Character deleted from str1 to match str2 (i.e., extra in guess)
        char1: str1[i - 1],
        char2: null,
      });
      i--;
    } else {
      break; // Should only happen when i and j are both 0
    }
  }
  return trace;
}
