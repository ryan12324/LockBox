import { zxcvbn, ZxcvbnResult } from '@zxcvbn-ts/core';

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  entropy: number;
  feedback: string[];
}

export function evaluateStrength(password: string): StrengthResult {
  const result: ZxcvbnResult = zxcvbn(password);

  const feedback: string[] = [];

  // Add warning if present
  if (result.feedback.warning) {
    feedback.push(result.feedback.warning);
  }

  // Add suggestions
  if (result.feedback.suggestions && result.feedback.suggestions.length > 0) {
    feedback.push(...result.feedback.suggestions);
  }

  return {
    score: (result.score as 0 | 1 | 2 | 3 | 4) || 0,
    entropy: result.guessesLog10 ? result.guessesLog10 * Math.log(10) : 0,
    feedback,
  };
}
