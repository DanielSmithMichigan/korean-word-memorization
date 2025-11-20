import { CREATE_EXAM_API_ENDPOINT, EXAM_API_ENDPOINT } from '../../api/endpoints';

export const createExam = async (userId, { settings, theme, allowedWords }) => {
    // Use the CREATE_EXAM_API_ENDPOINT (from CDK output)
    // If not yet in endpoints.js, you might need to hardcode or fetch from config
    const url = CREATE_EXAM_API_ENDPOINT;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'createExam', userId, settings, theme, allowedWords }),
    });
    if (!res.ok) throw new Error('Failed to create exam');
    return res.json();
};

export const generateQuestion = async (examId, type, theme, allowedWords) => {
    const url = CREATE_EXAM_API_ENDPOINT;

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'generateQuestion', examId, type, theme, allowedWords }),
    });
    if (!res.ok) throw new Error('Failed to generate question');
    return res.json();
};

export const getExamQuestions = async (examId) => {
    const url = `${EXAM_API_ENDPOINT}?examId=${examId}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch questions');
    return res.json();
};

export const submitExam = async (userId, examId, answers) => {
    const url = EXAM_API_ENDPOINT;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, examId, answers }),
    });
    if (!res.ok) throw new Error('Failed to submit exam');
    return res.json();
};
