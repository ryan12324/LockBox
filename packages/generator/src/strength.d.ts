export interface StrengthResult {
    score: 0 | 1 | 2 | 3 | 4;
    entropy: number;
    feedback: string[];
}
export declare function evaluateStrength(password: string): StrengthResult;
//# sourceMappingURL=strength.d.ts.map