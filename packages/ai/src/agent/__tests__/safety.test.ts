import { describe, it, expect, beforeEach } from 'vitest';
import { SafetyGate } from '../safety.js';
import type { SafetyConfig } from '../safety.js';
import type { AgentToolCall, AgentToolResult } from '@lockbox/types';
import type { AgentContext } from '../executor.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCall(name: string, args: Record<string, unknown> = {}): AgentToolCall {
  return { name, arguments: args };
}

function makeResult(name: string, success: boolean): AgentToolResult {
  return success
    ? { name, result: { ok: true } }
    : { name, result: null, error: 'Something went wrong' };
}

function makeContext(): AgentContext {
  return {
    vault: [],
    folders: [],
    onCreateItem: () => Promise.resolve({} as never),
    onUpdateItem: () => Promise.resolve({} as never),
    onDeleteItem: () => Promise.resolve(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SafetyGate', () => {
  let gate: SafetyGate;

  beforeEach(() => {
    gate = new SafetyGate();
  });

  // -----------------------------------------------------------------------
  // check()
  // -----------------------------------------------------------------------

  describe('check()', () => {
    describe('safe tools (no confirmation)', () => {
      const safeTools = [
        'search_vault',
        'get_item',
        'list_folders',
        'get_health_report',
        'generate_password',
        'check_breach',
      ];

      it.each(safeTools)('%s proceeds without confirmation', (toolName) => {
        const result = gate.check(makeCall(toolName), 0);
        expect(result.action).toBe('proceed');
        expect(result.reason).toBeUndefined();
      });
    });

    describe('destructive tools (confirmation required)', () => {
      const destructiveTools = ['create_item', 'update_item', 'delete_item', 'organize_item'];

      it.each(destructiveTools)('%s requires confirmation', (toolName) => {
        const result = gate.check(makeCall(toolName), 0);
        expect(result.action).toBe('confirm');
        expect(result.reason).toContain(toolName);
      });
    });

    describe('rate limiting', () => {
      it('blocks when turnCallCount equals maxToolCallsPerTurn', () => {
        const result = gate.check(makeCall('search_vault'), 10);
        expect(result.action).toBe('block');
        expect(result.reason).toContain('Rate limit');
      });

      it('blocks when turnCallCount exceeds maxToolCallsPerTurn', () => {
        const result = gate.check(makeCall('search_vault'), 15);
        expect(result.action).toBe('block');
      });

      it('allows calls below rate limit', () => {
        const result = gate.check(makeCall('search_vault'), 9);
        expect(result.action).toBe('proceed');
      });

      it('respects custom maxToolCallsPerTurn', () => {
        const customGate = new SafetyGate({ maxToolCallsPerTurn: 3 });
        const blocked = customGate.check(makeCall('search_vault'), 3);
        expect(blocked.action).toBe('block');

        const allowed = customGate.check(makeCall('search_vault'), 2);
        expect(allowed.action).toBe('proceed');
      });
    });

    describe('bulk deletion protection', () => {
      it('allows first 3 delete calls', () => {
        expect(gate.check(makeCall('delete_item'), 0).action).toBe('confirm');
        expect(gate.check(makeCall('delete_item'), 1).action).toBe('confirm');
        expect(gate.check(makeCall('delete_item'), 2).action).toBe('confirm');
      });

      it('blocks 4th delete call in the same turn', () => {
        gate.check(makeCall('delete_item'), 0);
        gate.check(makeCall('delete_item'), 1);
        gate.check(makeCall('delete_item'), 2);
        const result = gate.check(makeCall('delete_item'), 3);
        expect(result.action).toBe('block');
        expect(result.reason).toBe('Bulk deletion blocked');
      });

      it('resets delete counter on resetTurn', () => {
        gate.check(makeCall('delete_item'), 0);
        gate.check(makeCall('delete_item'), 1);
        gate.check(makeCall('delete_item'), 2);

        gate.resetTurn();

        const result = gate.check(makeCall('delete_item'), 0);
        expect(result.action).toBe('confirm');
      });

      it('rate limit takes priority over bulk deletion', () => {
        gate.check(makeCall('delete_item'), 0);
        gate.check(makeCall('delete_item'), 1);
        gate.check(makeCall('delete_item'), 2);
        const result = gate.check(makeCall('delete_item'), 10);
        expect(result.action).toBe('block');
        expect(result.reason).toContain('Rate limit');
      });
    });

    describe('custom requireConfirmation', () => {
      it('uses custom confirmation list', () => {
        const customGate = new SafetyGate({
          requireConfirmation: ['search_vault'],
        });
        const result = customGate.check(makeCall('search_vault'), 0);
        expect(result.action).toBe('confirm');
      });

      it('does not require confirmation for excluded tools', () => {
        const customGate = new SafetyGate({
          requireConfirmation: [],
        });
        const result = customGate.check(makeCall('create_item'), 0);
        expect(result.action).toBe('proceed');
      });
    });
  });

  // -----------------------------------------------------------------------
  // validateCall()
  // -----------------------------------------------------------------------

  describe('validateCall()', () => {
    const ctx = makeContext();

    it('validates known tool with correct arguments', () => {
      const result = gate.validateCall(makeCall('search_vault', { query: 'test' }), ctx);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects unknown tool name', () => {
      const result = gate.validateCall(makeCall('hack_the_planet'), ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('rejects missing required arguments', () => {
      const result = gate.validateCall(makeCall('search_vault', {}), ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required argument: query');
    });

    it('rejects null required arguments', () => {
      const result = gate.validateCall(makeCall('get_item', { id: null }), ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required argument: id');
    });

    it('accepts tools with no required arguments', () => {
      const result = gate.validateCall(makeCall('generate_password', {}), ctx);
      expect(result.valid).toBe(true);
    });

    it('validates create_item requires type, name, and data', () => {
      const result = gate.validateCall(makeCall('create_item', { type: 'login' }), ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Missing required argument');
    });
  });

  // -----------------------------------------------------------------------
  // logAction() & getAuditLog()
  // -----------------------------------------------------------------------

  describe('audit logging', () => {
    it('records successful actions', () => {
      const call = makeCall('search_vault', { query: 'github' });
      const result = makeResult('search_vault', true);

      gate.logAction(call, result);

      const log = gate.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].toolName).toBe('search_vault');
      expect(log[0].success).toBe(true);
      expect(log[0].error).toBeUndefined();
      expect(log[0].arguments).toEqual({ query: 'github' });
      expect(log[0].timestamp).toBeTruthy();
    });

    it('records failed actions with error', () => {
      const call = makeCall('delete_item', { id: 'x' });
      const result = makeResult('delete_item', false);

      gate.logAction(call, result);

      const log = gate.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].success).toBe(false);
      expect(log[0].error).toBe('Something went wrong');
    });

    it('sanitizes password arguments in audit log', () => {
      const call = makeCall('check_breach', { password: 'my-secret-pass' });
      const result = makeResult('check_breach', true);

      gate.logAction(call, result);

      const log = gate.getAuditLog();
      expect(log[0].arguments.password).toBe('***');
    });

    it('records multiple actions in order', () => {
      gate.logAction(makeCall('search_vault'), makeResult('search_vault', true));
      gate.logAction(makeCall('get_item', { id: '1' }), makeResult('get_item', true));
      gate.logAction(makeCall('delete_item', { id: '1' }), makeResult('delete_item', false));

      const log = gate.getAuditLog();
      expect(log).toHaveLength(3);
      expect(log[0].toolName).toBe('search_vault');
      expect(log[1].toolName).toBe('get_item');
      expect(log[2].toolName).toBe('delete_item');
    });

    it('returns a copy (not reference) of the audit log', () => {
      gate.logAction(makeCall('search_vault'), makeResult('search_vault', true));

      const log1 = gate.getAuditLog();
      const log2 = gate.getAuditLog();
      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });

    it('starts with empty audit log', () => {
      expect(gate.getAuditLog()).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // resetTurn()
  // -----------------------------------------------------------------------

  describe('resetTurn()', () => {
    it('resets delete counter allowing new deletes', () => {
      gate.check(makeCall('delete_item'), 0);
      gate.check(makeCall('delete_item'), 1);
      gate.check(makeCall('delete_item'), 2);

      const blockedBefore = gate.check(makeCall('delete_item'), 3);
      expect(blockedBefore.action).toBe('block');

      gate.resetTurn();

      const allowedAfter = gate.check(makeCall('delete_item'), 0);
      expect(allowedAfter.action).toBe('confirm');
    });

    it('can be called multiple times safely', () => {
      gate.resetTurn();
      gate.resetTurn();
      const result = gate.check(makeCall('delete_item'), 0);
      expect(result.action).toBe('confirm');
    });
  });

  // -----------------------------------------------------------------------
  // Constructor with partial config
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('uses defaults when no config provided', () => {
      const defaultGate = new SafetyGate();
      const result = defaultGate.check(makeCall('search_vault'), 9);
      expect(result.action).toBe('proceed');
      const blocked = defaultGate.check(makeCall('search_vault'), 10);
      expect(blocked.action).toBe('block');
    });

    it('merges partial config with defaults', () => {
      const customGate = new SafetyGate({ maxToolCallsPerTurn: 5 });
      const blocked = customGate.check(makeCall('search_vault'), 5);
      expect(blocked.action).toBe('block');

      const confirmResult = customGate.check(makeCall('delete_item'), 0);
      expect(confirmResult.action).toBe('confirm');
    });

    it('allows full config override', () => {
      const config: SafetyConfig = {
        maxToolCallsPerTurn: 2,
        requireConfirmation: ['search_vault'],
      };
      const customGate = new SafetyGate(config);

      expect(customGate.check(makeCall('search_vault'), 0).action).toBe('confirm');
      expect(customGate.check(makeCall('create_item'), 0).action).toBe('proceed');
      expect(customGate.check(makeCall('search_vault'), 2).action).toBe('block');
    });
  });
});
