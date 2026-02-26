/**
 * Safety gate for agent tool calls — confirmation gates, rate limiting,
 * and audit logging.
 *
 * Enforces guardrails to prevent the LLM from performing destructive
 * operations without user consent or exceeding usage limits.
 */

import type { AgentToolCall, AgentToolResult } from '@lockbox/types';
import { AGENT_TOOLS } from './tools.js';
import type { AgentContext } from './executor.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration for the safety gate. */
export interface SafetyConfig {
  /** Maximum tool calls allowed per conversation turn. Defaults to 10. */
  maxToolCallsPerTurn: number;
  /** Tool names that require user confirmation before execution. */
  requireConfirmation: string[];
}

/** Result of a safety check on a tool call. */
export interface SafetyCheckResult {
  /** Whether the call should proceed, needs confirmation, or is blocked. */
  action: 'proceed' | 'confirm' | 'block';
  /** Human-readable reason when action is 'confirm' or 'block'. */
  reason?: string;
}

/** Result of argument validation on a tool call. */
export interface ValidationResult {
  /** Whether the tool call is valid. */
  valid: boolean;
  /** Error message when invalid. */
  error?: string;
}

/** A single entry in the audit log. */
export interface AuditEntry {
  /** ISO 8601 timestamp of the action. */
  timestamp: string;
  /** Name of the tool that was executed. */
  toolName: string;
  /** Sanitized arguments (passwords replaced with '***'). */
  arguments: Record<string, unknown>;
  /** Whether the execution succeeded. */
  success: boolean;
  /** Error message if execution failed. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default safety configuration. */
const DEFAULT_CONFIG: SafetyConfig = {
  maxToolCallsPerTurn: 10,
  requireConfirmation: ['create_item', 'update_item', 'delete_item', 'organize_item'],
};

/** Maximum delete calls per turn before bulk deletion is blocked. */
const MAX_DELETES_PER_TURN = 3;

// ---------------------------------------------------------------------------
// SafetyGate
// ---------------------------------------------------------------------------

/**
 * Safety gate for agent tool calls.
 *
 * Enforces rate limits, confirmation requirements, and destructive pattern
 * detection. Maintains an audit log of all tool executions.
 */
export class SafetyGate {
  private config: SafetyConfig;
  private auditLog: AuditEntry[] = [];
  private deleteCountThisTurn = 0;

  constructor(config?: Partial<SafetyConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check whether a tool call should proceed, needs confirmation, or is blocked.
   *
   * Evaluation order:
   * 1. Rate limit — block if turn call count exceeds max
   * 2. Bulk deletion — block if >3 deletes in the same turn
   * 3. Confirmation — require for destructive tools
   * 4. Otherwise — proceed
   */
  check(call: AgentToolCall, turnCallCount: number): SafetyCheckResult {
    // Rate limit
    if (turnCallCount >= this.config.maxToolCallsPerTurn) {
      return {
        action: 'block',
        reason: `Rate limit exceeded: maximum ${String(this.config.maxToolCallsPerTurn)} calls per turn`,
      };
    }

    // Bulk deletion protection
    if (call.name === 'delete_item') {
      if (this.deleteCountThisTurn >= MAX_DELETES_PER_TURN) {
        return { action: 'block', reason: 'Bulk deletion blocked' };
      }
      this.deleteCountThisTurn++;
    }

    // Confirmation required for destructive tools
    if (this.config.requireConfirmation.includes(call.name)) {
      return { action: 'confirm', reason: `${call.name} requires user confirmation` };
    }

    return { action: 'proceed' };
  }

  /**
   * Validate a tool call's name and arguments.
   *
   * Checks that:
   * - The tool name is recognized (exists in AGENT_TOOLS)
   * - All required arguments are present
   */
  validateCall(call: AgentToolCall, _context: AgentContext): ValidationResult {
    // Check tool exists
    const tool = AGENT_TOOLS.find((t) => t.name === call.name);
    if (!tool) {
      return { valid: false, error: `Unknown tool: ${call.name}` };
    }

    // Validate required arguments from JSON Schema
    const schema = tool.parameters as { required?: string[] };
    if (schema.required) {
      for (const field of schema.required) {
        if (call.arguments[field] === undefined || call.arguments[field] === null) {
          return { valid: false, error: `Missing required argument: ${field}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Log a tool execution for the audit trail.
   *
   * Sensitive arguments (e.g. passwords) are replaced with '***' in the log.
   */
  logAction(call: AgentToolCall, result: AgentToolResult): void {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      toolName: call.name,
      arguments: sanitizeArguments(call.arguments),
      success: result.error === undefined,
      error: result.error,
    });
  }

  /** Get a copy of the full audit log. */
  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  /** Reset per-turn state (delete counter). Call at the start of each turn. */
  resetTurn(): void {
    this.deleteCountThisTurn = 0;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Strip sensitive values from arguments before logging. */
function sanitizeArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === 'password') {
      sanitized[key] = '***';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
