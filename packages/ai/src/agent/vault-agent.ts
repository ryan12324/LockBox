/**
 * VaultAgent — agentic chat loop connecting an LLM provider to the tool executor.
 *
 * Uses non-streaming `provider.chat()` for each iteration to ensure full
 * responses are visible before tool execution and safety gating.
 *
 * Flow per user message:
 *   1. Add user message to history
 *   2. Loop up to maxIterations:
 *      a. Call LLM with history + tool definitions
 *      b. Yield text content if present
 *      c. For each tool call: safety check → confirm → execute → yield events
 *      d. Add tool results to history as 'tool' role messages
 *      e. If no tool calls → final answer, break
 *   3. Yield { type: 'done' }
 */

import type { AgentEvent, AgentToolCall, AgentToolResult } from '@lockbox/types';
import type { LLMProvider, Message, ToolCallRequest } from '../providers/types.js';
import { ToolExecutor } from './executor.js';
import type { AgentContext } from './executor.js';
import { SafetyGate } from './safety.js';
import { getToolDefinitions } from './tools.js';
import { SYSTEM_PROMPT } from '../prompts/system.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VaultAgentOptions {
  /** LLM provider to use for chat completions. */
  provider: LLMProvider;
  /** Vault context with items, folders, and mutation callbacks. */
  context: AgentContext;
  /** Maximum agentic loop iterations before forced stop. Defaults to 10. */
  maxIterations?: number;
  /** UI callback for user approval on confirmation-gated tool calls. */
  onConfirmation?: (call: AgentToolCall) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Default constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ITERATIONS = 10;

// ---------------------------------------------------------------------------
// VaultAgent
// ---------------------------------------------------------------------------

export class VaultAgent {
  private provider: LLMProvider;
  private executor: ToolExecutor;
  private safety: SafetyGate;
  private history: Message[];
  private maxIterations: number;
  private onConfirmation?: (call: AgentToolCall) => Promise<boolean>;

  constructor(options: VaultAgentOptions) {
    this.provider = options.provider;
    this.executor = new ToolExecutor(options.context);
    this.safety = new SafetyGate();
    this.maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    this.onConfirmation = options.onConfirmation;

    // Seed history with the system prompt
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }];
  }

  /**
   * Send a user message and stream back {@link AgentEvent}s.
   *
   * The generator yields events as they occur:
   * - `text` — LLM text content
   * - `tool_call` — a tool is about to be (or has been) executed
   * - `tool_result` — result of a tool execution
   * - `confirmation_needed` — a tool requires user approval
   * - `error` — safety block, max-iterations, or execution error
   * - `done` — end of turn
   */
  async *chat(message: string): AsyncGenerator<AgentEvent> {
    // 1. Add user message to history
    this.history.push({ role: 'user', content: message });

    const toolDefs = getToolDefinitions();
    let turnCallCount = 0;

    // 2. Agentic loop
    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      // Call provider (non-streaming)
      const response = await this.provider.chat(this.history, { tools: toolDefs });

      // Yield text content if present
      if (response.content) {
        yield { type: 'text', content: response.content };
      }

      // If no tool calls → final answer, add assistant message and break
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // Add assistant response to history
        this.history.push({ role: 'assistant', content: response.content });
        break;
      }

      // Add assistant message with tool calls to history
      this.history.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      // Process each tool call
      for (const toolCallRequest of response.toolCalls) {
        // Parse arguments from JSON string
        let parsedArgs: Record<string, unknown>;
        try {
          parsedArgs = JSON.parse(toolCallRequest.arguments) as Record<string, unknown>;
        } catch {
          const errorResult: AgentToolResult = {
            name: toolCallRequest.name,
            result: null,
            error: `Failed to parse tool arguments: ${toolCallRequest.arguments}`,
          };
          yield { type: 'error', error: errorResult.error ?? 'Parse error' };
          this.history.push({
            role: 'tool',
            content: JSON.stringify(errorResult.error),
            toolCallId: toolCallRequest.id,
          });
          turnCallCount++;
          continue;
        }

        const agentCall: AgentToolCall = {
          name: toolCallRequest.name,
          arguments: parsedArgs,
        };

        // Safety gate check
        const safetyResult = this.safety.check(agentCall, turnCallCount);

        if (safetyResult.action === 'block') {
          yield { type: 'error', error: safetyResult.reason ?? 'Blocked by safety gate' };
          this.history.push({
            role: 'tool',
            content: JSON.stringify(safetyResult.reason ?? 'Blocked by safety gate'),
            toolCallId: toolCallRequest.id,
          });
          turnCallCount++;
          continue;
        }

        if (safetyResult.action === 'confirm') {
          yield { type: 'confirmation_needed', call: agentCall };

          // Await user confirmation
          let approved = false;
          if (this.onConfirmation) {
            approved = await this.onConfirmation(agentCall);
          }

          if (!approved) {
            const denialMessage = 'User denied the operation';
            this.history.push({
              role: 'tool',
              content: JSON.stringify(denialMessage),
              toolCallId: toolCallRequest.id,
            });
            turnCallCount++;
            continue;
          }
        }

        // Execute tool
        yield { type: 'tool_call', call: agentCall };

        const toolResult = await this.executor.execute(agentCall);

        yield { type: 'tool_result', result: toolResult };

        // Log to audit trail
        this.safety.logAction(agentCall, toolResult);

        // Add tool result to history
        this.history.push({
          role: 'tool',
          content: JSON.stringify(toolResult.result ?? toolResult.error),
          toolCallId: toolCallRequest.id,
        });

        turnCallCount++;
      }

      // Check if we're at the last iteration (max iterations reached)
      if (iteration === this.maxIterations - 1) {
        yield {
          type: 'error',
          error: `Max iterations (${String(this.maxIterations)}) reached`,
        };
      }

      // Continue loop — LLM will process tool results
    }

    // 3. Done
    yield { type: 'done' };

    // 4. Reset safety gate turn counter
    this.safety.resetTurn();
  }

  /** Get a copy of the conversation history. */
  getHistory(): Message[] {
    return [...this.history];
  }

  /** Clear conversation history, keeping only the system prompt. */
  clearHistory(): void {
    this.history = [{ role: 'system', content: SYSTEM_PROMPT }];
  }
}
