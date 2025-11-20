import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createExam, generateQuestion } from './actions/examApi';

function ExamSetup({ userId }) {
    const navigate = useNavigate();
    const location = useLocation();
    const selectedWords = location.state?.selectedWords || [];
    const [theme, setTheme] = useState('');
    const [settings, setSettings] = useState({
        'fill-in-the-blank': { enabled: true, count: 5 },
        'translate-en-to-ko': { enabled: false, count: 5 },
        'translate-ko-to-en': { enabled: false, count: 5 },
        'audio-translation': { enabled: false, count: 5 },
    });
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState('');

    const handleSettingChange = (type, field, value) => {
        setSettings(prev => ({
            ...prev,
            [type]: { ...prev[type], [field]: value }
        }));
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        setProgress(0);
        setStatusMsg('Creating exam manifold...');

        try {
            // 1. Create Exam Manifold
            const allowedWords = selectedWords.map(w => w.korean).join(', ');
            const { examId } = await createExam(userId, { settings, theme, allowedWords });

            // 2. Calculate total questions
            let tasks = [];
            Object.entries(settings).forEach(([type, config]) => {
                if (config.enabled) {
                    for (let i = 0; i < config.count; i++) {
                        tasks.push({ type });
                    }
                }
            });

            if (tasks.length === 0) {
                alert('Please enable at least one question type.');
                setIsGenerating(false);
                return;
            }

            // 3. Generate Questions Iteratively
            let completed = 0;
            for (const task of tasks) {
                setStatusMsg(`Generating question ${completed + 1} of ${tasks.length} (${task.type})...`);
                await generateQuestion(examId, task.type, theme, allowedWords);
                completed++;
                setProgress(completed / tasks.length);
            }

            setStatusMsg('Done! Redirecting...');
            setTimeout(() => {
                navigate(`/exam/${examId}`);
            }, 1000);

        } catch (err) {
            console.error(err);
            setStatusMsg(`Error: ${err.message}`);
            setIsGenerating(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto p-6 bg-gray-900 text-white rounded-xl shadow-lg">
            <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                New AI Exam
            </h1>

            {selectedWords.length > 0 && (
                <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-lg">
                    <p className="text-blue-200">
                        <span className="font-bold">{selectedWords.length}</span> words selected for this exam.
                    </p>
                    <p className="text-sm text-blue-300/70 mt-1 truncate">
                        {selectedWords.map(w => w.korean).join(', ')}
                    </p>
                </div>
            )}

            <div className="space-y-6">
                {/* Theme Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">Exam Theme / Topic</label>
                    <input
                        type="text"
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        placeholder="e.g., Ordering food, Travel, Business meeting..."
                        className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                {/* Question Types */}
                <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-300">Question Types</h3>
                    {Object.entries(settings).map(([type, config]) => (
                        <div key={type} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg">
                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={config.enabled}
                                    onChange={(e) => handleSettingChange(type, 'enabled', e.target.checked)}
                                    className="w-5 h-5 text-blue-500 rounded focus:ring-blue-500 bg-gray-700 border-gray-600"
                                />
                                <span className="capitalize text-gray-200">{type.replace(/-/g, ' ')}</span>
                            </div>
                            {config.enabled && (
                                <div className="flex items-center space-x-2">
                                    <span className="text-sm text-gray-400">Count:</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="20"
                                        value={config.count}
                                        onChange={(e) => handleSettingChange(type, 'count', parseInt(e.target.value))}
                                        className="w-16 p-1 bg-gray-700 border border-gray-600 rounded text-center"
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Generate Button */}
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className={`w-full py-4 rounded-lg font-bold text-lg transition-all ${isGenerating
                        ? 'bg-gray-700 cursor-not-allowed text-gray-500'
                        : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-lg hover:shadow-blue-500/25'
                        }`}
                >
                    {isGenerating ? 'Generating...' : 'Create Exam'}
                </button>

                {/* Progress Bar */}
                {isGenerating && (
                    <div className="mt-4">
                        <div className="flex justify-between text-sm text-gray-400 mb-1">
                            <span>{statusMsg}</span>
                            <span>{Math.round(progress * 100)}%</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-2.5">
                            <div
                                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                                style={{ width: `${progress * 100}%` }}
                            ></div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default ExamSetup;
