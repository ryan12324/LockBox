/**
 * Ollama LLM provider adapter.
 * Connects to a local Ollama instance for fully offline LLM inference.
 */
import type { AIProviderConfig } from '@lockbox/types';
import type { LLMProvider, Message, ChatOptions, ChatResponse, ChatChunk } from './types.js';
export declare class OllamaProvider implements LLMProvider {
    readonly id: "ollama";
    readonly supportsToolUse = true;
    private readonly model;
    private readonly baseUrl;
    constructor(config: AIProviderConfig);
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
    embed(text: string): Promise<number[]>;
}
//# sourceMappingURL=ollama.d.ts.map