import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AgentEvent, AgentToolCall, VaultItem, Folder } from '@lockbox/types';
import type {
  LLMProvider,
  ChatResponse,
  Message,
  ToolCallRequest,
  ChatOptions,
} from '../../providers/types.js';

// ---------------------------------------------------------------------------
// Mocks — stub out executor dependencies so tool dispatch works in isolation
// ---------------------------------------------------------------------------

const m = vi.hoisted(() => ({
  searchFn: vi.fn(),
  indexFn: vi.fn(),
  initializeFn: vi.fn(),
  generatePassword: vi.fn(),
  checkPassword: vi.fn(),
  analyzeVaultHealth: vi.fn(),
}));

vi.mock('../../search/semantic.js', () => ({
  SemanticSearch: vi.fn().mockImplementation(function () {
    return { search: m.searchFn, index: m.indexFn };
  }),
}));

vi.mock('../../search/embeddings.js', () => ({
  KeywordEmbeddingProvider: vi.fn().mockImplementation(function () {
    return { initialize: m.initializeFn };
  }),
}));

vi.mock('@lockbox/generator', () => ({
  generatePassword: m.generatePassword,
}));

vi.mock('@lockbox/crypto', () => ({
  checkPassword: m.checkPassword,
}));

vi.mock('../../health/analyzer.js', () => ({
  analyzeVaultHealth: m.analyzeVaultHealth,
}));

import { VaultAgent } from '../vault-agent.js';
import type { VaultAgentOptions } from '../vault-agent.js';
import type { AgentContext } from '../executor.js';
import { SYSTEM_PROMPT } from '../../prompts/system.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all events from an async generator into an array. */
async function collectEvents(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) {
    events.push(event);
  }
  return events;
}

/**
 * Create a mock LLM provider that returns scripted responses in order.
 * Each call to `chat()` pops the next response from the array.
 */
function createMockProvider(
  responses: Array<{ content?: string; toolCalls?: ToolCallRequest[] }>
): LLMProvider {
  let callIndex = 0;
  return {
    id: 'openrouter' as const,
    supportsToolUse: true,
    async chat(_messages: Message[], _options?: ChatOptions): Promise<ChatResponse> {
      const response = responses[callIndex++];
      return {
        content: response?.content ?? '',
        toolCalls: response?.toolCalls,
      };
    },
    async *chatStream() {
      yield { done: true as const };
    },
  };
}

/** Minimal AgentContext with spies. */
function createMockContext(vault: VaultItem[] = [], folders: Folder[] = []): AgentContext {
  return {
    vault,
    folders,
    onCreateItem: vi.fn().mockImplementation(async (item: Partial<VaultItem>) => ({
      id: 'new-1',
      type: item.type ?? 'login',
      name: item.name ?? 'New Item',
      tags: [],
      favorite: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      revisionDate: '2025-01-01T00:00:00.000Z',
      ...item,
    })),
    onUpdateItem: vi.fn().mockImplementation(async (id: string, changes: Partial<VaultItem>) => ({
      id,
      type: 'login',
      name: 'Updated',
      tags: [],
      favorite: false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      revisionDate: '2025-01-01T00:00:00.000Z',
      ...changes,
    })),
    onDeleteItem: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VaultAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.searchFn.mockResolvedValue([]);
    m.indexFn.mockResolvedValue(undefined);
    m.initializeFn.mockResolvedValue(undefined);
    m.generatePassword.mockReturnValue('G3n3r@t3d!Pwd');
    m.checkPassword.mockResolvedValue({
      found: false,
      count: 0,
      checkedAt: new Date().toISOString(),
    });
    m.analyzeVaultHealth.mockReturnValue({
      totalItems: 0,
      weak: 0,
      reused: 0,
      old: 0,
      breached: 0,
      strong: 0,
      overallScore: 100,
    });
  });

  // -------------------------------------------------------------------------
  // 1. Simple text response
  // -------------------------------------------------------------------------
  describe('simple text response', () => {
    it('yields text + done for a plain message', async () => {
      const provider = createMockProvider([{ content: 'Hello! How can I help?' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('hello'));

      expect(events).toEqual([
        { type: 'text', content: 'Hello! How can I help?' },
        { type: 'done' },
      ]);
    });

    it('does not yield text event when content is empty', async () => {
      const provider = createMockProvider([{ content: '' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('hello'));

      // Empty content is falsy — no text event
      expect(events).toEqual([{ type: 'done' }]);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Tool call flow
  // -------------------------------------------------------------------------
  describe('tool call flow', () => {
    it('executes a search_vault tool call and yields events', async () => {
      const searchResults = [
        {
          item: {
            id: 'item-1',
            type: 'login',
            name: 'GitHub',
            username: 'user@test.com',
            uris: ['https://github.com'],
          },
          score: 0.95,
          matchType: 'keyword',
        },
      ];
      m.searchFn.mockResolvedValue(searchResults);

      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-1', name: 'search_vault', arguments: '{"query":"github"}' }],
        },
        { content: 'I found GitHub in your vault.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('search for github'));

      const types = events.map((e) => e.type);
      expect(types).toContain('tool_call');
      expect(types).toContain('tool_result');
      expect(types).toContain('text');
      expect(types[types.length - 1]).toBe('done');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Confirmation flow — approved
  // -------------------------------------------------------------------------
  describe('confirmation flow', () => {
    it('yields confirmation_needed and executes when approved', async () => {
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-del', name: 'delete_item', arguments: '{"id":"item-1"}' }],
        },
        { content: 'Done! I deleted that item.' },
      ]);

      const onConfirmation = vi.fn().mockResolvedValue(true);
      const context = createMockContext();
      const agent = new VaultAgent({ provider, context, onConfirmation });

      const events = await collectEvents(agent.chat('delete my old email'));

      const types = events.map((e) => e.type);
      expect(types).toContain('confirmation_needed');
      expect(types).toContain('tool_call');
      expect(types).toContain('tool_result');
      expect(onConfirmation).toHaveBeenCalledOnce();
      expect(context.onDeleteItem).toHaveBeenCalledWith('item-1');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Confirmation denied
  // -------------------------------------------------------------------------
  describe('confirmation denied', () => {
    it('skips execution when user denies confirmation', async () => {
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-del', name: 'delete_item', arguments: '{"id":"item-1"}' }],
        },
        { content: "OK, I won't delete that." },
      ]);

      const onConfirmation = vi.fn().mockResolvedValue(false);
      const context = createMockContext();
      const agent = new VaultAgent({ provider, context, onConfirmation });

      const events = await collectEvents(agent.chat('delete my old email'));

      const types = events.map((e) => e.type);
      expect(types).toContain('confirmation_needed');
      expect(types).not.toContain('tool_call');
      expect(types).not.toContain('tool_result');
      expect(context.onDeleteItem).not.toHaveBeenCalled();

      // LLM should get denial in history
      const history = agent.getHistory();
      const toolMessages = history.filter((msg) => msg.role === 'tool');
      expect(toolMessages.length).toBeGreaterThan(0);
      expect(toolMessages[0].content).toContain('User denied');
    });

    it('defaults to denied when no onConfirmation callback is provided', async () => {
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-del', name: 'delete_item', arguments: '{"id":"item-1"}' }],
        },
        { content: "Understood, I won't proceed." },
      ]);

      const context = createMockContext();
      const agent = new VaultAgent({ provider, context });

      const events = await collectEvents(agent.chat('delete my old email'));

      const types = events.map((e) => e.type);
      expect(types).toContain('confirmation_needed');
      expect(types).not.toContain('tool_call');
      expect(context.onDeleteItem).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Safety block (rate limit)
  // -------------------------------------------------------------------------
  describe('safety block', () => {
    it('blocks when rate limit is exceeded', async () => {
      // Create 11 tool calls to exceed the default limit of 10
      const toolCalls: ToolCallRequest[] = Array.from({ length: 11 }, (_, i) => ({
        id: `tc-${String(i)}`,
        name: 'search_vault',
        arguments: `{"query":"test ${String(i)}"}`,
      }));

      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider([{ content: '', toolCalls }, { content: 'Done.' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('search everything'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      const errorEvent = errorEvents[0];
      if (errorEvent.type === 'error') {
        expect(errorEvent.error).toContain('Rate limit');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 6. Multiple tool calls in one response
  // -------------------------------------------------------------------------
  describe('multiple tool calls', () => {
    it('executes multiple tool calls from a single LLM response', async () => {
      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [
            { id: 'tc-1', name: 'search_vault', arguments: '{"query":"email"}' },
            { id: 'tc-2', name: 'list_folders', arguments: '{}' },
          ],
        },
        { content: 'Here are your results.' },
      ]);
      const agent = new VaultAgent({
        provider,
        context: createMockContext([], [{ id: 'f1', name: 'Personal' } as Folder]),
      });

      const events = await collectEvents(agent.chat('search email and list folders'));

      const toolCallEvents = events.filter((e) => e.type === 'tool_call');
      const toolResultEvents = events.filter((e) => e.type === 'tool_result');
      expect(toolCallEvents).toHaveLength(2);
      expect(toolResultEvents).toHaveLength(2);

      // Both tool results should be added to history
      const history = agent.getHistory();
      const toolMessages = history.filter((msg) => msg.role === 'tool');
      expect(toolMessages).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // 7. Max iterations
  // -------------------------------------------------------------------------
  describe('max iterations', () => {
    it('stops after maxIterations and yields an error', async () => {
      // Provider always returns a tool call, forcing the loop to hit max
      const infiniteToolCalls = Array.from({ length: 5 }, () => ({
        content: '',
        toolCalls: [{ id: 'tc-loop', name: 'search_vault', arguments: '{"query":"test"}' }],
      }));

      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider(infiniteToolCalls);
      const agent = new VaultAgent({
        provider,
        context: createMockContext(),
        maxIterations: 3,
      });

      const events = await collectEvents(agent.chat('keep going'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);

      const maxIterError = errorEvents.find(
        (e) => e.type === 'error' && e.error.includes('Max iterations')
      );
      expect(maxIterError).toBeDefined();

      // Should still yield done
      expect(events[events.length - 1].type).toBe('done');
    });
  });

  // -------------------------------------------------------------------------
  // 8. History management
  // -------------------------------------------------------------------------
  describe('history management', () => {
    it('accumulates messages in history after chat', async () => {
      const provider = createMockProvider([{ content: 'Hi there!' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('hello'));

      const history = agent.getHistory();
      expect(history.length).toBe(3); // system + user + assistant
      expect(history[0].role).toBe('system');
      expect(history[1].role).toBe('user');
      expect(history[1].content).toBe('hello');
      expect(history[2].role).toBe('assistant');
      expect(history[2].content).toBe('Hi there!');
    });

    it('clearHistory resets to just the system prompt', async () => {
      const provider = createMockProvider([{ content: 'Hi there!' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('hello'));
      expect(agent.getHistory().length).toBe(3);

      agent.clearHistory();
      const history = agent.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
      expect(history[0].content).toBe(SYSTEM_PROMPT);
    });

    it('includes tool messages in history after tool execution', async () => {
      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-1', name: 'search_vault', arguments: '{"query":"test"}' }],
        },
        { content: 'No results found.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('search test'));

      const history = agent.getHistory();
      const toolMessages = history.filter((msg) => msg.role === 'tool');
      expect(toolMessages.length).toBeGreaterThan(0);
      expect(toolMessages[0].toolCallId).toBe('tc-1');
    });
  });

  // -------------------------------------------------------------------------
  // 9. System prompt
  // -------------------------------------------------------------------------
  describe('system prompt', () => {
    it('first message is always the system prompt', () => {
      const provider = createMockProvider([]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const history = agent.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].role).toBe('system');
      expect(history[0].content).toBe(SYSTEM_PROMPT);
    });

    it('system prompt persists across multiple chats', async () => {
      const provider = createMockProvider([{ content: 'Response 1' }, { content: 'Response 2' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('first'));
      await collectEvents(agent.chat('second'));

      const history = agent.getHistory();
      expect(history[0].role).toBe('system');
      expect(history[0].content).toBe(SYSTEM_PROMPT);
    });
  });

  // -------------------------------------------------------------------------
  // 10. JSON parse errors in tool arguments
  // -------------------------------------------------------------------------
  describe('malformed tool arguments', () => {
    it('yields error when tool arguments are invalid JSON', async () => {
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-bad', name: 'search_vault', arguments: '{invalid json}' }],
        },
        { content: 'Sorry, something went wrong.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('search'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);
      if (errorEvents[0].type === 'error') {
        expect(errorEvents[0].error).toContain('Failed to parse');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 11. generate_password tool
  // -------------------------------------------------------------------------
  describe('generate_password tool', () => {
    it('executes generate_password and yields result', async () => {
      m.generatePassword.mockReturnValue('Str0ng!P@ssw0rd');

      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-gen', name: 'generate_password', arguments: '{"length":20}' }],
        },
        { content: 'Here is your new password.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('generate a password'));

      const resultEvents = events.filter((e) => e.type === 'tool_result');
      expect(resultEvents).toHaveLength(1);
      if (resultEvents[0].type === 'tool_result') {
        expect(resultEvents[0].result.name).toBe('generate_password');
        expect(resultEvents[0].result.result).toEqual({ password: 'Str0ng!P@ssw0rd' });
      }
    });
  });

  // -------------------------------------------------------------------------
  // 12. Assistant message with tool calls includes toolCalls in history
  // -------------------------------------------------------------------------
  describe('assistant history with toolCalls', () => {
    it('stores toolCalls on assistant message in history', async () => {
      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider([
        {
          content: 'Let me search for that.',
          toolCalls: [{ id: 'tc-1', name: 'search_vault', arguments: '{"query":"test"}' }],
        },
        { content: 'No results.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('find test'));

      const history = agent.getHistory();
      const assistantWithTools = history.find(
        (msg) => msg.role === 'assistant' && msg.toolCalls !== undefined
      );
      expect(assistantWithTools).toBeDefined();
      expect(assistantWithTools?.toolCalls).toHaveLength(1);
      expect(assistantWithTools?.toolCalls?.[0].name).toBe('search_vault');
    });
  });

  // -------------------------------------------------------------------------
  // 13. getHistory returns a copy, not a reference
  // -------------------------------------------------------------------------
  describe('history immutability', () => {
    it('getHistory returns a copy that does not affect internal state', async () => {
      const provider = createMockProvider([{ content: 'Hello' }]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('hi'));

      const history1 = agent.getHistory();
      const originalLength = history1.length;
      history1.push({ role: 'user', content: 'injected' });

      const history2 = agent.getHistory();
      expect(history2).toHaveLength(originalLength);
    });
  });

  // -------------------------------------------------------------------------
  // 14. Multi-turn conversation
  // -------------------------------------------------------------------------
  describe('multi-turn conversation', () => {
    it('maintains history across multiple user messages', async () => {
      const provider = createMockProvider([
        { content: 'I can help with that.' },
        { content: 'Sure, what about it?' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      await collectEvents(agent.chat('help me'));
      await collectEvents(agent.chat('tell me more'));

      const history = agent.getHistory();
      // system + user1 + assistant1 + user2 + assistant2
      expect(history).toHaveLength(5);
      expect(history[3].role).toBe('user');
      expect(history[3].content).toBe('tell me more');
      expect(history[4].role).toBe('assistant');
      expect(history[4].content).toBe('Sure, what about it?');
    });
  });

  // -------------------------------------------------------------------------
  // 15. Default maxIterations is 10
  // -------------------------------------------------------------------------
  describe('default options', () => {
    it('uses maxIterations of 10 by default', async () => {
      // Create enough responses for 11 iterations (should stop at 10)
      const responses = Array.from({ length: 11 }, () => ({
        content: '',
        toolCalls: [{ id: 'tc-loop', name: 'search_vault', arguments: '{"query":"test"}' }],
      }));

      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider(responses);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('keep going'));

      const maxIterError = events.find(
        (e) => e.type === 'error' && e.error.includes('Max iterations (10)')
      );
      expect(maxIterError).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 16. Bulk deletion blocking
  // -------------------------------------------------------------------------
  describe('bulk deletion blocking', () => {
    it('blocks after 3 deletes in the same turn', async () => {
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [
            { id: 'tc-d1', name: 'delete_item', arguments: '{"id":"a"}' },
            { id: 'tc-d2', name: 'delete_item', arguments: '{"id":"b"}' },
            { id: 'tc-d3', name: 'delete_item', arguments: '{"id":"c"}' },
            { id: 'tc-d4', name: 'delete_item', arguments: '{"id":"d"}' },
          ],
        },
        { content: 'Some were blocked.' },
      ]);

      const onConfirmation = vi.fn().mockResolvedValue(true);
      const context = createMockContext();
      const agent = new VaultAgent({ provider, context, onConfirmation });

      const events = await collectEvents(agent.chat('delete a b c d'));

      const errorEvents = events.filter((e) => e.type === 'error');
      expect(errorEvents.length).toBeGreaterThan(0);

      // 4th delete should be blocked
      const blockError = errorEvents.find(
        (e) => e.type === 'error' && e.error.includes('Bulk deletion blocked')
      );
      expect(blockError).toBeDefined();

      // Only 3 actual deletions
      expect(context.onDeleteItem).toHaveBeenCalledTimes(3);
    });
  });

  // -------------------------------------------------------------------------
  // 17. Tool pass-through with text content
  // -------------------------------------------------------------------------
  describe('text content alongside tool calls', () => {
    it('yields text before processing tool calls in same response', async () => {
      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider([
        {
          content: 'Let me search for that.',
          toolCalls: [{ id: 'tc-1', name: 'search_vault', arguments: '{"query":"test"}' }],
        },
        { content: 'Found nothing.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('search'));

      // First event should be the text from the tool-call response
      expect(events[0]).toEqual({ type: 'text', content: 'Let me search for that.' });
    });
  });

  // -------------------------------------------------------------------------
  // 18. Safety gate reset between turns
  // -------------------------------------------------------------------------
  describe('safety gate reset', () => {
    it('resets turn counters after chat completes', async () => {
      m.searchFn.mockResolvedValue([]);

      // First turn uses some calls
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [{ id: 'tc-1', name: 'search_vault', arguments: '{"query":"a"}' }],
        },
        { content: 'Done.' },
        // Second turn
        {
          content: '',
          toolCalls: [{ id: 'tc-2', name: 'search_vault', arguments: '{"query":"b"}' }],
        },
        { content: 'Done again.' },
      ]);

      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events1 = await collectEvents(agent.chat('first'));
      const events2 = await collectEvents(agent.chat('second'));

      // Both should succeed without rate limit errors
      const errors1 = events1.filter((e) => e.type === 'error');
      const errors2 = events2.filter((e) => e.type === 'error');
      expect(errors1).toHaveLength(0);
      expect(errors2).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // 19. create_item requires confirmation
  // -------------------------------------------------------------------------
  describe('create_item confirmation', () => {
    it('requires confirmation for create_item', async () => {
      const provider = createMockProvider([
        {
          content: '',
          toolCalls: [
            {
              id: 'tc-create',
              name: 'create_item',
              arguments: '{"type":"login","name":"Test","data":{"username":"user"}}',
            },
          ],
        },
        { content: 'Created!' },
      ]);

      const onConfirmation = vi.fn().mockResolvedValue(true);
      const context = createMockContext();
      const agent = new VaultAgent({ provider, context, onConfirmation });

      const events = await collectEvents(agent.chat('create a login for test'));

      const types = events.map((e) => e.type);
      expect(types).toContain('confirmation_needed');
      expect(onConfirmation).toHaveBeenCalledOnce();
      expect(context.onCreateItem).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // 20. Events are yielded in the correct order
  // -------------------------------------------------------------------------
  describe('event ordering', () => {
    it('yields events in correct order: text → tool_call → tool_result → text → done', async () => {
      m.searchFn.mockResolvedValue([]);

      const provider = createMockProvider([
        {
          content: 'Searching...',
          toolCalls: [{ id: 'tc-1', name: 'search_vault', arguments: '{"query":"test"}' }],
        },
        { content: 'Here are the results.' },
      ]);
      const agent = new VaultAgent({ provider, context: createMockContext() });

      const events = await collectEvents(agent.chat('search test'));
      const types = events.map((e) => e.type);

      // text from first response, tool_call, tool_result, text from second, done
      expect(types).toEqual(['text', 'tool_call', 'tool_result', 'text', 'done']);
    });
  });
});
