🗣️ Korean Voice Line Language Learning App — Project Plan
🧾 Summary
This is a language learning app that helps users learn Korean by interactively working with voice lines from Overwatch characters. Each line is presented in a two-phase quiz format where users:

Reconstruct the Korean sentence by listening to the voice line (no text shown).

Reconstruct the English translation after seeing the Korean sentence.

Audio files are stored in S3, and quiz content and user progress are tracked separately via DynamoDB.

📁 Content Organization (S3 Bucket)
✅ Structure:
perl
Copy
Edit
s3://your-bucket-name/
├── Ashe/
│   ├── English/
│   │   └── Revenge/
│   │       ├── I told you I'd pay you back.mp3
│   │       └── You're not worth my time.mp3
│   └── Korean/
│       └── Revenge/
│           ├── 내가 갚아 준다고 했지.mp3
│           └── 너는 내 시간도 아깝다.mp3
File names contain the sentence translations.

Folder structure: Character / Language / Category / Voice line.mp3

🧠 Quiz Flow
Each voice line is a self-contained 2-phase quiz:

🎧 Phase 1: Korean Sentence (Audio → Word-by-Word)
User listens to Korean audio.

They select one word at a time, each from 4 Korean options.

Korean text is not shown.

Audio replay is allowed at any time.

At the end, the user is graded and shown the correct full Korean sentence.

🌍 Phase 2: English Sentence (Korean Text + Audio → Word-by-Word)
The Korean sentence (text) is shown.

User listens to Korean audio again.

They select one English word at a time, each from 4 English options.

At the end, the user is graded again and shown the full English translation.

The English voice line is also played (if available).

📚 Quiz JSON Format
Each quiz file includes all audio paths, word selections, and correct answers.

json
Copy
Edit
{
  "id": "ashe_revenge_01",
  "character": "Ashe",
  "category": "Revenge",
  "bundle_id": "ashe_revenge_bundle1",

  "korean_audio_key": "Ashe/Korean/Revenge/내가 갚아 준다고 했지.mp3",
  "english_audio_key": "Ashe/English/Revenge/I told you I'd pay you back.mp3",

  "korean_sentence": ["내가", "갚아", "준다고", "했지"],
  "english_sentence": ["I", "told", "you", "I'd", "pay", "you", "back"],

  "korean_choices": [
    { "correct": "내가", "options": ["내가", "했지", "갚아", "준다고"] },
    { "correct": "갚아", "options": ["갚아", "했지", "내가", "준다고"] },
    ...
  ],

  "english_choices": [
    { "correct": "I", "options": ["You", "I", "They", "We"] },
    { "correct": "told", "options": ["went", "told", "bought", "saw"] },
    ...
  ]
}
🧑‍💻 User State (DynamoDB)
Stored in a separate table from the quiz content.

🔑 Keys:
Partition key: user_id

Sort key: bundle_id#{bundle_id} or voiceline_id#{voiceline_id}

🧾 Example Record:
json
Copy
Edit
{
  "user_id": "user-123",
  "bundle_id": "ashe_revenge_bundle1",
  "completed_voicelines": ["ashe_revenge_01", "ashe_revenge_02"],

  "voiceline_progress": {
    "ashe_revenge_01": {
      "korean_correct": true,
      "english_correct": false,
      "attempts": 2,
      "last_played": "2025-07-20T15:32:00Z"
    }
  },

  "xp": 240,
  "playback_speed_multiplier": 0.8  // Starts slow (e.g. 0.5), increases with XP
}
🆙 XP & Playback Speed Scaling
All clips begin slowed down (e.g. 0.5x speed).

As users gain XP by completing lines, playback speed gradually increases (up to 1.0x).

This improves listening ability progressively.

✨ Example Curve (Optional):
js
Copy
Edit
// Playback speed increases linearly from 0.5 to 1.0 over 1000 XP
playbackSpeed = 0.5 + Math.min(xp / 1000, 1) * 0.5;
📦 Bundles
Quizzes are grouped in bundles of 7 voice lines

Bundles are not constrained to a single theme or character

XP is rewarded per quiz completion

✅ To Do / Future Ideas
 Generator script to create quiz JSON from filenames & AI translation

 Function to generate distractors using word pools or frequency lists

 Backend API for delivering quizzes and saving user state

 UI flow for quiz delivery, XP tracking, and playback

 Leaderboards or achievements

Let me know if you want this as a download