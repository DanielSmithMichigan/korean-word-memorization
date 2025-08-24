# Quiz Modes: Regular vs Hard

This document explains how the quiz behaves in Regular mode and Hard mode, and how answers are evaluated and scheduled.

## Where to toggle modes
- The Hard Mode toggle is rendered in `Quiz.jsx` and controls behavior across the quiz.
- UI: a checkbox labeled "Hard Mode" beneath the card.

## Quick reference

| Mode | Quiz types used | Inputs shown | Must be correct | Bulk rounds |
|---|---|---|---|---|
| Regular | `english-to-korean` only | Korean | Korean | No |
| Hard | Weighted random of `english-to-korean`, `korean-to-english`, `audio-to-english`, `bulk-korean-to-english`, `bulk-english-to-korean` with overrides/bias (see below) | Depends on type (see below) | Depends on type (see below) | Yes (bulk-*) |

Base weights in Hard mode: english-to-korean (2), korean-to-english (2), audio-to-english (2), bulk-korean-to-english (1), bulk-english-to-korean (1).
Overrides/bias:
- First exposure rule: the first time a word is shown in a session, it is always `english-to-korean`.
- For single-question rounds (non-bulk), the probability of choosing `english-to-korean` increases as the selected word's recent success rate decreases (dynamic bias).
- Bulk rounds are only allowed after each Active word has been seen at least once this session.

---

## Regular mode
- Quiz type is always `english-to-korean`.
- Inputs displayed: only the Korean input field.
- Correctness: your Korean input must exactly match the Korean answer after normalization (case-insensitive, punctuation removed, extra whitespace collapsed).
- Audio is available via the button (and `;` hotkey), but audio-based questions are not used.
- After submitting:
  - If you were correct and did not flip the card first, it counts as a success for scheduling and the streak.
  - If you flipped the card first, a correct answer does not count as a success, and the streak records a miss for that item.
  - If incorrect, you get a second attempt; on the second attempt, the app can show a diff highlight to help you correct it.

## Hard mode
- Each new selection picks a quiz type by weight:
  - `english-to-korean`
  - `korean-to-english`
  - `audio-to-english`
  - `bulk-korean-to-english`
  - `bulk-english-to-korean`

### Hard mode quiz-type selection details
- On each selection in Hard mode:
  - Bulk rounds can be selected using base weights (bulk K→E/E→K have weight 1 each), but not until all Active words have been seen once this session. If a bulk round is selected, five words are chosen.
  - For non-bulk rounds, the quiz type is chosen among `english-to-korean`, `korean-to-english`, and `audio-to-english`.
  - First exposure: if the selected word has not been seen yet this session, the quiz type is forced to `english-to-korean`.
  - Dynamic bias: for words already seen this session, `english-to-korean` becomes more likely when the word’s recent success rate is low.

### Per-type behavior
- `english-to-korean`
  - Inputs shown: Korean.
  - Must be correct: Korean only.
- `korean-to-english`
  - Inputs shown: English.
  - Must be correct: English only (matches any comma-separated accepted English answer).
- `audio-to-english`
  - Inputs shown: English and Korean.
  - Must be correct: both English and Korean must be correct in the same submission.
  - Audio auto-plays when a new word is selected; `;` also plays audio.
  - Feedback distinguishes which parts were wrong (English, Korean, or both).
- `bulk-korean-to-english` and `bulk-english-to-korean`
  - Five words are selected at once (top by current probability). You answer all, then submit.
  - Each item is graded independently; diffs are shown for incorrect items.
  - Multiple words can graduate in one bulk round.

### Second attempt and feedback
- If your first attempt is wrong:
  - Non-bulk: you can try again. On the second attempt, a diff highlight is shown comparing your guess vs the correct field.
  - In hard `audio-to-english`, the diff targets the specific field that is wrong (Korean vs English). If both are wrong, the correctness panel shows both correct answers instead of a diff.

---

## Answer normalization and acceptance
- Korean answers: normalized by NFD/NFC, punctuation removed, whitespace collapsed, and compared case-insensitively.
- English answers: the stored English string may contain comma-separated alternatives; any exact normalized match is accepted.

---

## Scheduling and graduation
The quiz uses a spaced, windowed scheduling strategy with three pools:
- Active: the current working set.
- Pending: not yet introduced into the active set.
- Graduated: temporarily learned; can recur for review.

Parameters (adjustable in the Advanced panel):
- Active window size: default 5.
- Successes to graduate (consecutive): default 5.
- Graduated recurrence rate: default 20% per selection.

Rules:
- On each correct submission without flipping the card first, the word’s consecutive success counter increments.
- A wrong submission resets the consecutive success counter for that word to 0.
- When a word reaches the required consecutive successes, it graduates:
  - It is removed from Active and added to Graduated.
  - The next Pending word (if any) is promoted into Active.
- Occasionally (by the recurrence rate), a Graduated word is resurfaced for review; such resurfaced items are marked as graduated and do not change their counters.
- Flipping the card before answering prevents the attempt from counting as a success and also records a miss in the streak history, even if the typed answer is correct.

### Word selection within Active
- Each selection samples by probability from Active using a softmax over a score that combines:
  - Higher weight for words with more session attempts.
  - Higher weight for words with lower recent success rate.
- A short history prevents the same word from being selected repeatedly more than four times in a row.

---

## Streaks and stats
- The app tracks total attempts, correct count, and a 10-item streak history.
- Streak history entries are:
  - true when correct and not flipped;
  - false when flipped (even if correct) or when incorrect.
- The Advanced panel shows per-word attempts, recent success rate (last 10 attempts), consecutive successes toward graduation, and current selection probability for Active words.

---

## Audio
- Audio is fetched and cached per Korean word and can be generated by Google Cloud TTS or Gemini (toggle in Advanced panel).
- Semicolon key `;` plays audio for the current word.

---

## File map (for reference)
- `Quiz.jsx`: page composition, Hard Mode toggle, input flow and per-attempt UX, diff handling.
- `hooks/useQuizEngine.js`: core engine for selection, grading, counters, graduation, bulk handling, audio prefetch.
- `components/QuizInputForm.jsx`: renders inputs based on quiz type and Hard Mode, submit/flip logic.
- `components/QuizFeedback.jsx`: correctness panel, per-field feedback for `audio-to-english`, diffs.
- `components/BulkQuizView.jsx`: UI and grading for bulk rounds.
- `utils/quizUtil.js`: normalization and equality checks for English/Korean.

---

## Defaults
- Active window size: 5
- Consecutive successes to graduate: 5
- Graduated recurrence rate: 0.2 (20%)
- Hard mode weights: E→K (2), K→E (2), Audio→E (2), Bulk K→E (1), Bulk E→K (1)

If you change any of these in code, update this README to match.
