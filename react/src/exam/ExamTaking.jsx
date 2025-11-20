import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getExamQuestions, submitExam } from './actions/examApi';
import { fetchAudio } from '../quiz/actions/quizApi';

function AudioQuestion({ text }) {
    const [audioUrl, setAudioUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const audioRef = useRef(null);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                try {
                    audioRef.current.pause();
                } catch (e) {
                    // ignore
                }
            }
        };
    }, []);

    const handlePlay = async () => {
        try {
            setLoading(true);
            let url = audioUrl;
            
            // If we don't have the URL yet, fetch it
            if (!url) {
                // useGoogleCloud=false (Gemini), overwrite=false, language='ko'
                url = await fetchAudio(text, false, false, 'ko');
                setAudioUrl(url);
            }
            
            // If there's an existing audio instance, pause it and reset
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            } else {
                // Create new audio instance
                audioRef.current = new Audio(url);
            }

            await audioRef.current.play();
        } catch (e) {
            console.error("Failed to play audio", e);
            alert("Failed to play audio: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mb-6">
             <div className="flex items-center gap-4 mb-4">
                <button 
                    type="button"
                    onClick={handlePlay}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center gap-2 font-medium transition-colors"
                >
                    {loading ? (
                        <>
                            <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                            Loading...
                        </>
                    ) : (
                        '▶ Play Audio'
                    )}
                </button>
                
                <button
                    type="button"
                    onClick={() => setRevealed(!revealed)}
                    className="text-gray-400 hover:text-white text-sm underline transition-colors"
                >
                    {revealed ? 'Hide Text' : 'Show Text'}
                </button>
             </div>

             {revealed && (
                 <div className="mt-2">
                    <p className="text-xl font-medium p-4 bg-gray-700 rounded border-l-4 border-blue-500">
                        {text}
                    </p>
                 </div>
             )}
        </div>
    );
}

function ExamTaking({ userId }) {
    const { examId } = useParams();
    const navigate = useNavigate();
    const [questions, setQuestions] = useState([]);
    const [answers, setAnswers] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const qs = await getExamQuestions(examId);
                setQuestions(qs);
            } catch (e) {
                console.error(e);
                alert('Failed to load exam');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [examId]);

    const handleAnswerChange = (qId, val) => {
        setAnswers(prev => ({ ...prev, [qId]: val }));
    };

    const handleSubmit = async () => {
        if (!window.confirm('Are you sure you want to submit?')) return;

        setSubmitting(true);
        try {
            const formattedAnswers = Object.entries(answers).map(([questionId, userAnswer]) => ({
                questionId,
                userAnswer
            }));

            // Ensure all questions have an answer (even if empty)
            questions.forEach(q => {
                if (!answers[q.questionId]) {
                    formattedAnswers.push({ questionId: q.questionId, userAnswer: '(No Answer)' });
                }
            });

            const result = await submitExam(userId, examId, formattedAnswers);
            // Navigate to results page with state
            navigate(`/exam/${examId}/results`, { state: { result, questions } });
        } catch (e) {
            console.error(e);
            alert('Failed to submit exam');
            setSubmitting(false);
        }
    };

    if (loading) return <div className="text-center text-white mt-10">Loading Exam...</div>;

    return (
        <div className="max-w-3xl mx-auto p-6 bg-gray-900 text-white min-h-screen">
            <h1 className="text-2xl font-bold mb-8 border-b border-gray-700 pb-4">Exam Session</h1>

            <div className="space-y-8">
                {questions.map((q, idx) => (
                    <div key={q.questionId} className="bg-gray-800 p-6 rounded-lg shadow-md">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-mono text-blue-400 uppercase">{q.type}</span>
                            <span className="text-gray-500 text-sm">Question {idx + 1}</span>
                        </div>

                        {q.type?.toUpperCase() === 'AUDIO-TRANSLATION' ? (
                            <AudioQuestion text={q.questionText} />
                        ) : (
                            <p className="text-xl mb-6 font-medium">{q.questionText}</p>
                        )}

                        {q.hint && (
                            <details className="mb-4 text-sm text-gray-400 cursor-pointer">
                                <summary>Show Hint</summary>
                                <p className="mt-2 pl-4 border-l-2 border-gray-600">{q.hint}</p>
                            </details>
                        )}

                        <textarea
                            value={answers[q.questionId] || ''}
                            onChange={(e) => handleAnswerChange(q.questionId, e.target.value)}
                            placeholder="Type your answer here..."
                            className="w-full p-4 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px]"
                        />
                    </div>
                ))}
            </div>

            <div className="mt-10 flex justify-end">
                <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-lg shadow-lg transition-all disabled:opacity-50"
                >
                    {submitting ? 'Grading...' : 'Submit Exam'}
                </button>
            </div>
        </div>
    );
}

export default ExamTaking;
