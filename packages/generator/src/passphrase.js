import { WORDLIST } from './wordlist';
const DEFAULT_OPTIONS = {
    wordCount: 5,
    separator: '-',
    capitalize: true,
    includeNumber: false,
};
function getRandomIndex(max) {
    const randomBytes = new Uint8Array(1);
    crypto.getRandomValues(randomBytes);
    return randomBytes[0] % max;
}
export function generatePassphrase(opts) {
    const options = { ...DEFAULT_OPTIONS, ...opts };
    // Validate options
    if (options.wordCount < 3 || options.wordCount > 10) {
        throw new Error('Word count must be between 3 and 10');
    }
    if (!options.separator || options.separator.length === 0) {
        throw new Error('Separator must not be empty');
    }
    // Select random words
    const words = [];
    for (let i = 0; i < options.wordCount; i++) {
        const index = getRandomIndex(WORDLIST.length);
        let word = WORDLIST[index];
        // Capitalize if requested
        if (options.capitalize) {
            word = word.charAt(0).toUpperCase() + word.slice(1);
        }
        // Add number to a random word if requested
        if (options.includeNumber && i === Math.floor(options.wordCount / 2)) {
            const digit = getRandomIndex(10);
            word += digit;
        }
        words.push(word);
    }
    return words.join(options.separator);
}
//# sourceMappingURL=passphrase.js.map