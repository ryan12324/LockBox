/**
 * Ollama LLM provider adapter.
 * Connects to a local Ollama instance for fully offline LLM inference.
 */

import type { AIProviderConfig } from '@lockbox/types';
import type { LLMProvider, Message, ChatOptions, ChatResponse, ChatChunk } from './types.js';

const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama' as const;
  readonly supportsToolUse = true;

  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: AIProviderConfig) {
    this.model = config.model ?? 'llama3.2';
    this.baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_URL;
  }

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens != null ? { num_predict: options.maxTokens } : {}),
      },
      ...(options?.tools?.length
        ? {
            tools: options.tools.map((t) => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }
        : {}),
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      message: {
        content: string;
        tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
      };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message.content,
      toolCalls: data.message.tool_calls?.map((tc, i) => ({
        id: `ollama-${i}`,
        name: tc.function.name,
        arguments: JSON.stringify(tc.function.arguments),
      })),
      usage:
        data.prompt_eval_count != null
          ? {
              promptTokens: data.prompt_eval_count,
              completionTokens: data.eval_count ?? 0,
            }
          : undefined,
    };
  }

  async *chatStream(messages: Message[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        ...(options?.temperature != null ? { temperature: options.temperature } : {}),
        ...(options?.maxTokens != null ? { num_predict: options.maxTokens } : {}),
      },
    };

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options?.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new Error(`Ollama API error ${res.status}: ${text}`);
    }

    if (!res.body) {
      throw new Error('No response body for streaming');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          try {
            const parsed = JSON.parse(trimmed) as {
              message: { content: string };
              done: boolean;
            };
            yield {
              content: parsed.message.content || undefined,
              done: parsed.done,
            };
            if (parsed.done) return;
          } catch {
            // Skip malformed lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { done: true };
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      throw new Error(`Ollama embed error ${res.status}: ${errText}`);
    }

    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings[0] ?? [];
  }
}
