/**
 * Cloudflare Workers AI provider adapter.
 * Used for non-sensitive operations (URL reputation, classification).
 * Runs on Cloudflare's edge — no API key required (uses binding).
 *
 * This adapter is used server-side in the API worker only.
 * Client-side code should use other providers via BYOK.
 */
import type { LLMProvider, Message, ChatOptions, ChatResponse, ChatChunk } from './types.js';
/**
 * Cloudflare Workers AI binding type.
 * The actual binding is provided by the Workers runtime.
 */
export interface AiBinding {
    run(model: string, inputs: Record<string, unknown>): Promise<unknown>;
}
export declare class WorkersAIProvider implements LLMProvider {
    readonly id: "workers-ai";
    readonly supportsToolUse = false;
    private readonly ai;
    private readonly model;
    constructor(ai: AiBinding, model?: string);
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(_messages: Message[], _options?: ChatOptions): AsyncIterable<ChatChunk>;
}
//# sourceMappingURL=workers-ai.d.ts.map