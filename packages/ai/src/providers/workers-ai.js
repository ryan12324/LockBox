/**
 * Cloudflare Workers AI provider adapter.
 * Used for non-sensitive operations (URL reputation, classification).
 * Runs on Cloudflare's edge — no API key required (uses binding).
 *
 * This adapter is used server-side in the API worker only.
 * Client-side code should use other providers via BYOK.
 */
export class WorkersAIProvider {
    id = 'workers-ai';
    supportsToolUse = false;
    ai;
    model;
    constructor(ai, model) {
        this.ai = ai;
        this.model = model ?? '@cf/meta/llama-3.1-8b-instruct';
    }
    async chat(messages, options) {
        const result = (await this.ai.run(this.model, {
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
        }));
        return {
            content: result.response ?? '',
        };
    }
    async *chatStream(_messages, _options) {
        // Workers AI streaming is not yet supported in this adapter.
        // Fall back to non-streaming for now.
        const result = await this.chat(_messages, _options);
        yield { content: result.content, done: true };
    }
}
//# sourceMappingURL=workers-ai.js.map