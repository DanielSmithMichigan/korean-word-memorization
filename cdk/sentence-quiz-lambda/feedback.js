function createFeedbackHandler({ initializeClients, getGenAI, headers }) {
  if (typeof initializeClients !== 'function' || typeof getGenAI !== 'function') {
    throw new Error('createFeedbackHandler requires initializeClients and getGenAI functions');
  }

  async function handleFeedback(event) {
    const body = JSON.parse(event.body || '{}');
    const { userId, userSentence, correctSentence, englishSentence } = body || {};
    const { mode, koreanText, userSummaryEnglish, referenceEnglish } = body || {};
    if (!userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing userId' }) };
    }
    
    const isSummaryMode = mode === 'summarizeWrittenKoreanToEnglish' || (!!koreanText && !!userSummaryEnglish);

    await initializeClients();
    const genAI = getGenAI();
    if (!genAI) {
      throw new Error('Gemini client not initialized');
    }

    if (isSummaryMode) {
      if (!koreanText || !userSummaryEnglish) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing koreanText or userSummaryEnglish' }) };
      }

      const summaryDirective = `You are an English writing and comprehension grader. Evaluate the user's English summary against the meaning of the given Korean text. Use the reference English meaning if provided to calibrate correctness, but prioritize semantic coverage and factual accuracy over exact wording.
Rules:
- Score from 0 to 100. Consider coverage (meaning preserved), accuracy (no hallucinations), clarity, and grammar (minor grammar issues shouldn't heavily penalize if meaning is correct).
- Provide a verdict among: excellent (90-100), good (75-89), partial (50-74), poor (0-49).
- Provide 2-5 concise feedback bullets highlighting strengths and concrete improvements.
- If referenceEnglish is provided, use it as the gold standard meaning; otherwise infer from the Korean text.

Korean text:
${koreanText}

Reference English (optional):
${referenceEnglish || 'N/A'}

User English summary:
${userSummaryEnglish}`;

      const summaryPrompt = [
        {
          role: 'user',
          parts: [
            { text: summaryDirective }
          ]
        }
      ];

      const summaryResponse = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-preview-09-2025',
        contents: summaryPrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              score: { type: 'number' },
              verdict: { type: 'string', enum: ['excellent', 'good', 'partial', 'poor'] },
              feedback: { type: 'array', items: { type: 'string' } },
            },
            required: ['score', 'verdict'],
          },
        },
      });

      try {
        const parsed = JSON.parse(summaryResponse.text || '{}');
        return { statusCode: 200, headers, body: JSON.stringify(parsed) };
      } catch (e) {
        return { statusCode: 502, headers, body: JSON.stringify({ message: 'Invalid JSON from Gemini' }) };
      }
    }

    if (!userSentence || !englishSentence) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing userSentence or englishSentence' }) };
    }

    const evaluationDirective = `You are a Korean language teacher. Compare the student's sentence to the target sentence and describe its quality.
Rules:
- Treat natural, grammatical alternatives as acceptable even if wording differs.
- If the student sentence matches exactly after normalization (spacing and punctuation), mark exact.
- If acceptable but not exact, mark acceptable_alternative.
- If incorrect, list concrete issues (grammar, spacing, particles, word choice, word order) and propose a corrected Korean sentence.

Respond with plain text (no JSON) using the following template:
Verdict: <exact|acceptable_alternative|incorrect>
Exact: <true|false>
AcceptableAlternative: <true|false>
Feedback:
- <specific point 1>
- <specific point 2>
CorrectedSentence: <corrected Korean sentence or N/A if not needed>

English sentence: ${englishSentence}
Student's Korean sentence: ${userSentence}`;

    const evaluationPrompt = [
      {
        role: 'user',
        parts: [
          {
            text: evaluationDirective
          }
        ]
      }
    ];

    const evaluationResponse = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-lite-preview-09-2025',
      contents: evaluationPrompt,
    });

    const evaluationText = evaluationResponse?.text?.trim();
    if (!evaluationText) {
      return { statusCode: 502, headers, body: JSON.stringify({ message: 'No feedback from Gemini' }) };
    }

    const formattingContents = [
      {
        role: 'user',
        parts: [
          {
            text: `You are a formatter that converts Korean sentence evaluation feedback into JSON.
Use the provided evaluation to populate the JSON schema exactly. Ensure boolean fields align with the verdict. Follow only the instructions in this message; the evaluation directive is shared for context.

English sentence: ${englishSentence}
Correct Korean sentence: ${correctSentence || 'Not provided'}
Student's Korean sentence: ${userSentence}
Original evaluation directive (context only):
${evaluationDirective}
Evaluation feedback:
${evaluationText}

Return ONLY JSON according to the schema.`
          }
        ]
      }
    ];

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025',
      contents: formattingContents,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            isExact: { type: 'boolean' },
            isAcceptableAlternative: { type: 'boolean' },
            verdict: { type: 'string', enum: ['exact', 'acceptable_alternative', 'incorrect'] },
            feedback: { type: 'array', items: { type: 'string' } },
            correctedSentence: { type: 'string' },
          },
          required: ['isExact', 'isAcceptableAlternative', 'verdict'],
        },
      },
    });

    const text = response.text;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return { statusCode: 502, headers, body: JSON.stringify({ message: 'Invalid JSON from Gemini' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify(parsed) };
  }

  return async function feedbackHandler(event) {
    try {
      if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
      }

      if (event.httpMethod === 'POST') {
        return await handleFeedback(event);
      }

      return { statusCode: 405, headers, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    } catch (err) {
      console.error(err);
      return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
  };
}

module.exports = { createFeedbackHandler };
