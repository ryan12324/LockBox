/**
 * OpenRouter LLM provider adapter.
 * Routes requests through OpenRouter's unified API, supporting 100+ models.
 */
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
export class OpenRouterProvider {
    id = 'openrouter';
    supportsToolUse = true;
    apiKey;
    model;
    baseUrl;
    constructor(config) {
        if (!config.apiKey) {
            throw new Error('OpenRouter requires an API key');
        }
        this.apiKey = config.apiKey;
        this.model = config.model ?? 'openai/gpt-4o-mini';
        this.baseUrl = config.baseUrl ?? OPENROUTER_API_URL;
    }
    async chat(messages, options) {
        const body = {
            model: this.model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
                ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            })),
            ...(options?.temperature != null ? { temperature: options.temperature } : {}),
            ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
            ...(options?.tools?.length
                ? {
                    tools: options.tools.map((t) => ({
                        type: 'function',
                        function: { name: t.name, description: t.description, parameters: t.parameters },
                    })),
                }
                : {}),
        };
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://lockbox.app',
                'X-Title': 'Lockbox Password Manager',
            },
            body: JSON.stringify(body),
            signal: options?.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => 'Unknown error');
            throw new Error(`OpenRouter API error ${res.status}: ${text}`);
        }
        const data = (await res.json());
        const choice = data.choices[0];
        return {
            content: choice?.message?.content ?? '',
            toolCalls: choice?.message?.tool_calls?.map((tc) => ({
                id: tc.id,
                name: tc.function.name,
                arguments: tc.function.arguments,
            })),
            usage: data.usage
                ? {
                    promptTokens: data.usage.prompt_tokens,
                    completionTokens: data.usage.completion_tokens,
                }
                : undefined,
        };
    }
    async *chatStream(messages, options) {
        const body = {
            model: this.model,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
                ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
            })),
            stream: true,
            ...(options?.temperature != null ? { temperature: options.temperature } : {}),
            ...(options?.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
            ...(options?.tools?.length
                ? {
                    tools: options.tools.map((t) => ({
                        type: 'function',
                        function: { name: t.name, description: t.description, parameters: t.parameters },
                    })),
                }
                : {}),
        };
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
                'HTTP-Referer': 'https://lockbox.app',
                'X-Title': 'Lockbox Password Manager',
            },
            body: JSON.stringify(body),
            signal: options?.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => 'Unknown error');
            throw new Error(`OpenRouter API error ${res.status}: ${text}`);
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
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: '))
                        continue;
                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        yield { done: true };
                        return;
                    }
                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed.choices[0]?.delta;
                        yield {
                            content: delta?.content ?? undefined,
                            toolCalls: delta?.tool_calls?.map((tc) => ({
                                id: tc.id,
                                name: tc.function.name,
                                arguments: tc.function.arguments,
                            })),
                            done: false,
                        };
                    }
                    catch {
                        // Skip malformed SSE chunks
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        yield { done: true };
    }
}
//# sourceMappingURL=openrouter.js.map