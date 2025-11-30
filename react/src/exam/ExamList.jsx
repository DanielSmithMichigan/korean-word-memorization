import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listExams } from './actions/examApi';

function ExamList({ userId }) {
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const loadExams = async () => {
            try {
                const data = await listExams(userId);
                // Sort by lastUpdated or timestamp desc
                const sorted = data.sort((a, b) => {
                    const tA = new Date(a.lastUpdated || a.timestamp).getTime();
                    const tB = new Date(b.lastUpdated || b.timestamp).getTime();
                    return tB - tA;
                });
                setExams(sorted);
            } catch (e) {
                console.error(e);
                alert('Failed to load exams');
            } finally {
                setLoading(false);
            }
        };
        loadExams();
    }, [userId]);

    if (loading) return <div className="text-center text-white mt-10">Loading Exams...</div>;

    const incompleteExams = exams.filter(e => e.status !== 'completed');
    const completedExams = exams.filter(e => e.status === 'completed');

    return (
        <div className="max-w-4xl mx-auto p-6 bg-gray-900 text-white min-h-screen">
            <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
                <h1 className="text-2xl font-bold">My Exams</h1>
                <Link to="/exam/setup" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium">
                    + New Exam
                </Link>
            </div>

            <div className="space-y-8">
                <section>
                    <h2 className="text-xl font-semibold mb-4 text-yellow-400">In Progress</h2>
                    {incompleteExams.length === 0 ? (
                        <p className="text-gray-400 italic">No exams in progress.</p>
                    ) : (
                        <div className="grid gap-4">
                            {incompleteExams.map(exam => (
                                <div key={exam.examId} className="bg-gray-800 p-4 rounded-lg shadow flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-lg">{exam.theme || 'Untitled Exam'}</h3>
                                        <p className="text-sm text-gray-400">Created: {new Date(exam.timestamp).toLocaleDateString()}</p>
                                        <p className="text-sm text-gray-400">Last Saved: {exam.lastUpdated ? new Date(exam.lastUpdated).toLocaleString() : 'Never'}</p>
                                    </div>
                                    <button
                                        onClick={() => navigate(`/exam/${exam.examId}`)}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-white font-medium"
                                    >
                                        Resume
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <section>
                    <h2 className="text-xl font-semibold mb-4 text-gray-400">Completed</h2>
                    {completedExams.length === 0 ? (
                        <p className="text-gray-500 italic">No completed exams.</p>
                    ) : (
                        <div className="grid gap-4">
                            {completedExams.map(exam => (
                                <div key={exam.examId} className="bg-gray-800/50 p-4 rounded-lg flex justify-between items-center border border-gray-700">
                                    <div>
                                        <h3 className="font-bold text-gray-300">{exam.theme || 'Untitled Exam'}</h3>
                                        <p className="text-sm text-gray-500">Completed: {new Date(exam.completedAt || exam.lastUpdated).toLocaleDateString()}</p>
                                    </div>
                                    <button
                                        onClick={() => navigate(`/exam/${exam.examId}/results`)} // Note: Results page might need to handle fetching results if not passed in state
                                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 font-medium text-sm"
                                    >
                                        View Results
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

export default ExamList;
