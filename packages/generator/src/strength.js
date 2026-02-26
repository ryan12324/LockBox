import { zxcvbn } from '@zxcvbn-ts/core';
export function evaluateStrength(password) {
    const result = zxcvbn(password);
    const feedback = [];
    // Add warning if present
    if (result.feedback.warning) {
        feedback.push(result.feedback.warning);
    }
    // Add suggestions
    if (result.feedback.suggestions && result.feedback.suggestions.length > 0) {
        feedback.push(...result.feedback.suggestions);
    }
    return {
        score: result.score || 0,
        entropy: result.guessesLog10 ? result.guessesLog10 * Math.log(10) : 0,
        feedback,
    };
}
//# sourceMappingURL=strength.js.map