export interface PasswordOptions {
    length: number;
    uppercase: boolean;
    lowercase: boolean;
    digits: boolean;
    symbols: boolean;
    excludeAmbiguous?: boolean;
}
export declare function generatePassword(opts?: Partial<PasswordOptions>): string;
//# sourceMappingURL=random.d.ts.map