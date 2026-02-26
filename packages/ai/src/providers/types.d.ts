/**
 * LLM provider abstraction layer.
 * Each provider adapter implements this interface so the rest of the system
 * is agnostic to which LLM backend is in use.
 */
import type { AIProvider } from '@lockbox/types';
/** A single message in a chat conversation */
export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolCalls?: ToolCallRequest[];
}
/** A tool call request from the LLM */
export interface ToolCallRequest {
    id: string;
    name: string;
    arguments: string;
}
/** Options passed to chat / chatStream */
export interface ChatOptions {
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
    signal?: AbortSignal;
}
/** JSON Schema tool definition for LLM function calling */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
}
/** Non-streaming chat response */
export interface ChatResponse {
    content: string;
    toolCalls?: ToolCallRequest[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
    };
}
/** A single chunk in a streaming response */
export interface ChatChunk {
    content?: string;
    toolCalls?: ToolCallRequest[];
    done: boolean;
}
/**
 * Unified LLM provider interface.
 * Implementations exist for OpenRouter, Vercel AI Gateway, OpenAI,
 * Anthropic, Google, Ollama, and Cloudflare Workers AI.
 */
export interface LLMProvider {
    readonly id: AIProvider;
    readonly supportsToolUse: boolean;
    /** Send messages and receive a complete response */
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    /** Send messages and stream back chunks */
    chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk>;
    /** Generate an embedding vector (not all providers support this) */
    embed?(text: string): Promise<number[]>;
}
//# sourceMappingURL=types.d.ts.map