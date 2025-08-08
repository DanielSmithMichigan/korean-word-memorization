export const GET_WORD_PAIRS_API_ENDPOINT = 'https://u9bwocgqhf.execute-api.us-east-1.amazonaws.com/prod/';
export const PROCESS_GUESS_API_ENDPOINT = 'https://2zkp0aorlc.execute-api.us-east-1.amazonaws.com/prod/';
export const TEXT_TO_SPEECH_API_ENDPOINT = 'https://r9jdesle9g.execute-api.us-east-1.amazonaws.com/prod/';
export const WORD_UPLOADER_API_ENDPOINT = 'https://7jsbesilfh.execute-api.us-east-1.amazonaws.com/prod/';
export const TOGGLE_FAVORITE_API_ENDPOINT = 'https://obgw2v604h.execute-api.us-east-1.amazonaws.com/prod/';

const BUNDLE_API_BASE_URL = 'https://8otxvz4xu3.execute-api.us-east-1.amazonaws.com/prod';

export const getBundles = async () => {
    const response = await fetch(`${BUNDLE_API_BASE_URL}/bundles`);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
};

export const getQuizzesForBundle = async (bundleId) => {
    const response = await fetch(`${BUNDLE_API_BASE_URL}/quizzes/${bundleId}`);
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    return response.json();
};
