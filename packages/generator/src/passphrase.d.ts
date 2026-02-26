export interface PassphraseOptions {
    wordCount: number;
    separator: string;
    capitalize?: boolean;
    includeNumber?: boolean;
}
export declare function generatePassphrase(opts?: Partial<PassphraseOptions>): string;
//# sourceMappingURL=passphrase.d.ts.map