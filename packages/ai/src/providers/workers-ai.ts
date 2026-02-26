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

export class WorkersAIProvider implements LLMProvider {
  readonly id = 'workers-ai' as const;
  readonly supportsToolUse = false;

  private readonly ai: AiBinding;
  private readonly model: string;

  constructor(ai: AiBinding, model?: string) {
    this.ai = ai;
    this.model = model ?? '@cf/meta/llama-3.1-8b-instruct';
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const result = (await this.ai.run(this.model, {
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    })) as { response: string };

    return {
      content: result.response ?? '',
    };
  }

  async *chatStream(_messages: Message[], _options?: ChatOptions): AsyncIterable<ChatChunk> {
    // Workers AI streaming is not yet supported in this adapter.
    // Fall back to non-streaming for now.
    const result = await this.chat(_messages, _options);
    yield { content: result.content, done: true };
  }
}
