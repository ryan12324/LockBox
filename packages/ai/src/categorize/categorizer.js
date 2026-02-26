/** Domain-to-category mapping */
const DOMAIN_CATEGORIES = {
    // banking/finance
    'chase.com': ['banking', 'finance'],
    'bankofamerica.com': ['banking', 'finance'],
    'wellsfargo.com': ['banking', 'finance'],
    'citibank.com': ['banking', 'finance'],
    'capitalone.com': ['banking', 'finance'],
    'schwab.com': ['banking', 'finance'],
    'fidelity.com': ['banking', 'finance'],
    'vanguard.com': ['banking', 'finance'],
    'paypal.com': ['banking', 'finance'],
    'venmo.com': ['banking', 'finance'],
    'cashapp.com': ['banking', 'finance'],
    'wise.com': ['banking', 'finance'],
    // social
    'facebook.com': ['social'],
    'instagram.com': ['social'],
    'twitter.com': ['social'],
    'x.com': ['social'],
    'linkedin.com': ['social', 'work'],
    'tiktok.com': ['social'],
    'snapchat.com': ['social'],
    'reddit.com': ['social'],
    'pinterest.com': ['social'],
    'mastodon.social': ['social'],
    'threads.net': ['social'],
    // shopping
    'amazon.com': ['shopping'],
    'ebay.com': ['shopping'],
    'walmart.com': ['shopping'],
    'target.com': ['shopping'],
    'bestbuy.com': ['shopping'],
    'etsy.com': ['shopping'],
    'shopify.com': ['shopping'],
    'aliexpress.com': ['shopping'],
    'costco.com': ['shopping'],
    'wayfair.com': ['shopping'],
    // email
    'gmail.com': ['email'],
    'mail.google.com': ['email'],
    'outlook.com': ['email'],
    'yahoo.com': ['email'],
    'protonmail.com': ['email'],
    'proton.me': ['email'],
    'icloud.com': ['email'],
    'fastmail.com': ['email'],
    'zoho.com': ['email'],
    // dev
    'github.com': ['dev'],
    'gitlab.com': ['dev'],
    'bitbucket.org': ['dev'],
    'stackoverflow.com': ['dev'],
    'npmjs.com': ['dev'],
    'docker.com': ['dev'],
    'vercel.com': ['dev'],
    'netlify.com': ['dev'],
    'aws.amazon.com': ['dev', 'work'],
    'digitalocean.com': ['dev'],
    'cloudflare.com': ['dev'],
    'heroku.com': ['dev'],
    // entertainment
    'netflix.com': ['entertainment'],
    'hulu.com': ['entertainment'],
    'disneyplus.com': ['entertainment'],
    'spotify.com': ['entertainment'],
    'youtube.com': ['entertainment'],
    'twitch.tv': ['entertainment'],
    'max.com': ['entertainment'],
    'peacocktv.com': ['entertainment'],
    'crunchyroll.com': ['entertainment'],
    // gaming
    'steampowered.com': ['gaming'],
    'epicgames.com': ['gaming'],
    'playstation.com': ['gaming'],
    'xbox.com': ['gaming'],
    'nintendo.com': ['gaming'],
    'roblox.com': ['gaming'],
    'riotgames.com': ['gaming'],
    'blizzard.com': ['gaming'],
    'ea.com': ['gaming'],
    // travel
    'airbnb.com': ['travel'],
    'booking.com': ['travel'],
    'expedia.com': ['travel'],
    'delta.com': ['travel'],
    'united.com': ['travel'],
    'southwest.com': ['travel'],
    'marriott.com': ['travel'],
    'hilton.com': ['travel'],
    'kayak.com': ['travel'],
    // health
    'myfitnesspal.com': ['health'],
    'fitbit.com': ['health'],
    'strava.com': ['health'],
    // education
    'coursera.org': ['education'],
    'udemy.com': ['education'],
    'khanacademy.org': ['education'],
    'duolingo.com': ['education'],
    'edx.org': ['education'],
    // government
    'irs.gov': ['government'],
    'ssa.gov': ['government'],
    'usps.com': ['government'],
    // crypto
    'coinbase.com': ['crypto'],
    'binance.com': ['crypto'],
    'kraken.com': ['crypto'],
};
/** Extract domain from a URL string. Returns empty string on failure. */
function extractDomain(url) {
    try {
        return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace(/^www\./, '');
    }
    catch {
        return '';
    }
}
/** Suggest tags for a vault item based on name and URIs. */
export function suggestTags(item) {
    const tags = new Set();
    if (item.type === 'login') {
        const login = item;
        for (const uri of login.uris) {
            const domain = extractDomain(uri);
            // Check exact match first
            const cats = DOMAIN_CATEGORIES[domain];
            if (cats) {
                cats.forEach((c) => tags.add(c));
                continue;
            }
            // Check if domain ends with a known domain
            for (const [known, knownCats] of Object.entries(DOMAIN_CATEGORIES)) {
                if (domain.endsWith(known)) {
                    knownCats.forEach((c) => tags.add(c));
                    break;
                }
            }
        }
    }
    // Check name keywords
    const nameLower = item.name.toLowerCase();
    const KEYWORD_MAP = {
        bank: ['banking', 'finance'],
        finance: ['banking', 'finance'],
        payment: ['banking', 'finance'],
        social: ['social'],
        email: ['email'],
        mail: ['email'],
        shop: ['shopping'],
        store: ['shopping'],
        buy: ['shopping'],
        code: ['dev'],
        developer: ['dev'],
        git: ['dev'],
        game: ['gaming'],
        play: ['gaming'],
        stream: ['entertainment'],
        music: ['entertainment'],
        video: ['entertainment'],
        travel: ['travel'],
        flight: ['travel'],
        hotel: ['travel'],
        school: ['education'],
        learn: ['education'],
        university: ['education'],
        health: ['health'],
        fitness: ['health'],
        medical: ['health'],
        gov: ['government'],
        crypto: ['crypto'],
        bitcoin: ['crypto'],
        wallet: ['crypto'],
        work: ['work'],
        office: ['work'],
        corporate: ['work'],
    };
    for (const [kw, kwCats] of Object.entries(KEYWORD_MAP)) {
        if (nameLower.includes(kw))
            kwCats.forEach((c) => tags.add(c));
    }
    return Array.from(tags).slice(0, 3);
}
/** Suggest the best matching existing folder for an item. */
export function suggestFolder(item, folders) {
    const tags = suggestTags(item);
    if (tags.length === 0 || folders.length === 0)
        return null;
    let bestMatch = null;
    let bestScore = 0;
    for (const folder of folders) {
        const folderLower = folder.name.toLowerCase();
        let score = 0;
        for (const tag of tags) {
            if (folderLower.includes(tag))
                score++;
        }
        if (score > bestScore) {
            bestScore = score;
            bestMatch = folder.id;
        }
    }
    return bestMatch;
}
/** Detect duplicate or similar vault items. */
export function detectDuplicates(items) {
    const groups = [];
    const loginItems = items.filter((i) => i.type === 'login');
    // Same URI domain
    const byDomain = new Map();
    for (const item of loginItems) {
        for (const uri of item.uris) {
            const domain = extractDomain(uri);
            if (!domain)
                continue;
            const existing = byDomain.get(domain) ?? [];
            existing.push(item);
            byDomain.set(domain, existing);
        }
    }
    for (const [, domainItems] of byDomain) {
        if (domainItems.length >= 2) {
            const unique = [...new Map(domainItems.map((i) => [i.id, i])).values()];
            if (unique.length >= 2)
                groups.push({ items: unique, reason: 'same-uri' });
        }
    }
    // Same username (across different domains)
    const byUsername = new Map();
    for (const item of loginItems) {
        if (!item.username)
            continue;
        const key = item.username.toLowerCase();
        const existing = byUsername.get(key) ?? [];
        existing.push(item);
        byUsername.set(key, existing);
    }
    for (const [, usernameItems] of byUsername) {
        if (usernameItems.length >= 2) {
            // Only flag if they're on different domains
            const domains = new Set(usernameItems.flatMap((i) => i.uris.map(extractDomain)));
            if (domains.size >= 2)
                groups.push({ items: usernameItems, reason: 'same-credentials' });
        }
    }
    return groups;
}
//# sourceMappingURL=categorizer.js.map