import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function ExamResults() {
    const location = useLocation();
    const navigate = useNavigate();
    const { result, questions } = location.state || {};

    if (!result || !questions) {
        return <div className="text-center text-white mt-10">No results found. <button onClick={() => navigate('/')} className="text-blue-400 underline">Go Home</button></div>;
    }

    const { overallGrade, percentage, overallFeedback, results: questionResults } = result;
    const questionMap = new Map(questions.map(q => [q.questionId, q]));

    const getGradeColor = (grade) => {
        if (grade === 'A') return 'text-green-400';
        if (grade === 'B') return 'text-blue-400';
        if (grade === 'C') return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white min-h-screen">
            <div className="text-center mb-10">
                <h1 className="text-4xl font-bold mb-2">Exam Results</h1>
                <div className={`text-6xl font-extrabold ${getGradeColor(overallGrade)} mb-2`}>{overallGrade}</div>
                <div className="text-2xl text-gray-300">{percentage}%</div>
                <p className="mt-4 text-gray-400 max-w-2xl mx-auto italic">"{overallFeedback}"</p>
            </div>

            <div className="space-y-6">
                {questionResults.map((res, idx) => {
                    // Fallback to index-based matching if ID lookup fails (handles AI hallucinating IDs like "Q1")
                    const q = questionMap.get(res.questionId) || questions[idx];
                    if (!q) {
                        return (
                            <div key={res.questionId || idx} className="p-6 rounded-lg bg-red-900/20 border border-red-500">
                                <p className="text-red-400">Error: Question data not found for ID {res.questionId}</p>
                                <p className="text-gray-400 text-sm">{res.feedback}</p>
                            </div>
                        );
                    }
                    return (
                        <div key={res.questionId} className={`p-6 rounded-lg border-l-4 ${res.isSkipped ? 'border-yellow-500 bg-gray-800' :
                            res.isCorrect ? 'border-green-500 bg-gray-800' :
                                'border-red-500 bg-gray-800'
                            }`}>
                            <div className="flex justify-between items-start mb-3">
                                <span className="text-sm text-gray-500">Question {idx + 1}</span>
                                <span className={`font-bold ${res.isSkipped ? 'text-yellow-400' :
                                    res.isCorrect ? 'text-green-400' :
                                        'text-red-400'
                                    }`}>
                                    {res.isSkipped ? 'SKIPPED' : (res.isCorrect ? 'CORRECT' : 'INCORRECT')}
                                </span>
                            </div>

                            <div className="mb-4">
                                <p className="text-lg font-medium mb-2">{q.questionText}</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                    <div className="bg-gray-700 p-3 rounded">
                                        <span className="block text-gray-400 text-xs uppercase mb-1">Your Answer</span>
                                        {/* We don't have the user answer in the result object by default unless we pass it back, 
                        but let's assume the backend might echo it or we can't show it easily without passing it through. 
                        For now, relying on feedback context. */}
                                        <span className="text-white">See feedback</span>
                                    </div>
                                    <div className="bg-gray-700 p-3 rounded">
                                        <span className="block text-gray-400 text-xs uppercase mb-1">Correct Answer</span>
                                        <span className="text-green-300">{q.answer}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-gray-900/50 p-4 rounded border border-gray-700">
                                <span className="block text-blue-400 text-xs uppercase mb-1 font-bold">AI Feedback</span>
                                <p className="text-gray-300 text-sm leading-relaxed">{res.feedback}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-10 text-center">
                <button
                    onClick={() => navigate('/exam/setup')}
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg font-bold shadow-lg transition-all"
                >
                    Take Another Exam
                </button>
            </div>
        </div>
    );
}

export default ExamResults;
