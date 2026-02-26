/**
 * OpenRouter LLM provider adapter.
 * Routes requests through OpenRouter's unified API, supporting 100+ models.
 */
import type { AIProviderConfig } from '@lockbox/types';
import type { LLMProvider, Message, ChatOptions, ChatResponse, ChatChunk } from './types.js';
export declare class OpenRouterProvider implements LLMProvider {
    readonly id: "openrouter";
    readonly supportsToolUse = true;
    private readonly apiKey;
    private readonly model;
    private readonly baseUrl;
    constructor(config: AIProviderConfig);
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
}
//# sourceMappingURL=openrouter.d.ts.map