/**
 * Ollama LLM provider adapter.
 * Connects to a local Ollama instance for fully offline LLM inference.
 */
const DEFAULT_OLLAMA_URL = 'http://localhost:11434';
export class OllamaProvider {
    id = 'ollama';
    supportsToolUse = true;
    model;
    baseUrl;
    constructor(config) {
        this.model = config.model ?? 'llama3.2';
        this.baseUrl = config.baseUrl ?? DEFAULT_OLLAMA_URL;
    }
    async chat(messages, options) {
        const body = {
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
        const data = (await res.json());
        return {
            content: data.message.content,
            toolCalls: data.message.tool_calls?.map((tc, i) => ({
                id: `ollama-${i}`,
                name: tc.function.name,
                arguments: JSON.stringify(tc.function.arguments),
            })),
            usage: data.prompt_eval_count != null
                ? {
                    promptTokens: data.prompt_eval_count,
                    completionTokens: data.eval_count ?? 0,
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
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        const parsed = JSON.parse(trimmed);
                        yield {
                            content: parsed.message.content || undefined,
                            done: parsed.done,
                        };
                        if (parsed.done)
                            return;
                    }
                    catch {
                        // Skip malformed lines
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
        yield { done: true };
    }
    async embed(text) {
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
        const data = (await res.json());
        return data.embeddings[0] ?? [];
    }
}
//# sourceMappingURL=ollama.js.map