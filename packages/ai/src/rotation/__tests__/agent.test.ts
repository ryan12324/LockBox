import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { SiteAdapter, RotationPlan } from '../adapters/base.js';

// ---------------------------------------------------------------------------
// Mock @lockbox/generator
// ---------------------------------------------------------------------------

vi.mock('@lockbox/generator', () => ({
  generatePassword: vi.fn(() => 'mock-generated-P@ss1'),
}));

import { generatePassword } from '@lockbox/generator';
import { createRotationAgent } from '../agent.js';
import { googleAdapter } from '../adapters/google.js';
import { githubAdapter } from '../adapters/github.js';
import { amazonAdapter } from '../adapters/amazon.js';
import { genericAdapter } from '../adapters/generic.js';

const mockGeneratePassword = vi.mocked(generatePassword);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function request(
  overrides: Partial<
    Parameters<ReturnType<typeof createRotationAgent>['createRotationPlan']>[0]
  > = {}
) {
  return {
    itemId: 'item-1',
    url: 'https://github.com/settings',
    currentUsername: 'user@test.com',
    currentPassword: 'oldPass!23',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createRotationAgent', () => {
  beforeEach(() => {
    mockGeneratePassword.mockClear();
  });

  // --- findAdapter ---------------------------------------------------------

  describe('findAdapter', () => {
    const agent = createRotationAgent();

    it('finds Google adapter for google.com', () => {
      expect(agent.findAdapter('https://accounts.google.com/signin').name).toBe('Google');
    });

    it('finds Google adapter for gmail.com', () => {
      expect(agent.findAdapter('https://gmail.com').name).toBe('Google');
    });

    it('finds Google adapter for youtube.com', () => {
      expect(agent.findAdapter('https://youtube.com').name).toBe('Google');
    });

    it('finds GitHub adapter for github.com', () => {
      expect(agent.findAdapter('https://github.com/user').name).toBe('GitHub');
    });

    it('finds Amazon adapter for amazon.com', () => {
      expect(agent.findAdapter('https://www.amazon.com').name).toBe('Amazon');
    });

    it('finds Amazon adapter for amazon.co.uk', () => {
      expect(agent.findAdapter('https://amazon.co.uk').name).toBe('Amazon');
    });

    it('finds Amazon adapter for amazon.de', () => {
      expect(agent.findAdapter('https://amazon.de').name).toBe('Amazon');
    });

    it('falls back to Generic for unknown domain', () => {
      expect(agent.findAdapter('https://example.com').name).toBe('Generic');
    });

    it('falls back to Generic for random domain', () => {
      expect(agent.findAdapter('https://my-cool-app.io').name).toBe('Generic');
    });

    it('returns Generic even for unusual URLs', () => {
      expect(agent.findAdapter('https://localhost:3000').name).toBe('Generic');
    });
  });

  // --- createRotationPlan --------------------------------------------------

  describe('createRotationPlan', () => {
    const agent = createRotationAgent();

    it('creates a plan for GitHub', () => {
      const plan = agent.createRotationPlan(request());
      expect(plan.siteName).toBe('GitHub');
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    it('creates a plan for Google', () => {
      const plan = agent.createRotationPlan(request({ url: 'https://gmail.com' }));
      expect(plan.siteName).toBe('Google');
    });

    it('creates a plan for Amazon', () => {
      const plan = agent.createRotationPlan(request({ url: 'https://amazon.com' }));
      expect(plan.siteName).toBe('Amazon');
    });

    it('creates a plan for unknown domain (generic)', () => {
      const plan = agent.createRotationPlan(request({ url: 'https://example.com' }));
      expect(plan.requiresConfirmation).toBe(true);
    });

    it('uses provided newPassword', () => {
      const plan = agent.createRotationPlan(request({ newPassword: 'MyCustomPass!99' }));
      const typeSteps = plan.steps.filter(
        (s) => s.action === 'type' && s.value === 'MyCustomPass!99'
      );
      expect(typeSteps.length).toBeGreaterThan(0);
    });

    it('generates password when newPassword not provided', () => {
      agent.createRotationPlan(request({ newPassword: undefined }));
      expect(mockGeneratePassword).toHaveBeenCalled();
    });

    it('plan has estimatedDuration', () => {
      const plan = agent.createRotationPlan(request());
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });

    it('plan has requiresConfirmation', () => {
      const plan = agent.createRotationPlan(request());
      expect(typeof plan.requiresConfirmation).toBe('boolean');
    });

    it('plan steps all have descriptions', () => {
      const plan = agent.createRotationPlan(request());
      for (const step of plan.steps) {
        expect(step.description).toBeTruthy();
      }
    });
  });

  // --- generateFallbackResult -----------------------------------------------

  describe('generateFallbackResult', () => {
    const agent = createRotationAgent();

    it('returns fallbackUsed true', () => {
      const plan = agent.createRotationPlan(request());
      const result = agent.generateFallbackResult(request(), plan);
      expect(result.fallbackUsed).toBe(true);
    });

    it('returns success false', () => {
      const plan = agent.createRotationPlan(request());
      const result = agent.generateFallbackResult(request(), plan);
      expect(result.success).toBe(false);
    });

    it('returns instructions array', () => {
      const plan = agent.createRotationPlan(request());
      const result = agent.generateFallbackResult(request(), plan);
      expect(result.instructions).toBeDefined();
      expect(result.instructions!.length).toBeGreaterThan(0);
    });

    it('returns duration 0', () => {
      const plan = agent.createRotationPlan(request());
      const result = agent.generateFallbackResult(request(), plan);
      expect(result.duration).toBe(0);
    });

    it('uses plan fallback instructions when available', () => {
      const plan: RotationPlan = {
        siteName: 'Test',
        steps: [],
        estimatedDuration: 10,
        requiresConfirmation: true,
        fallbackInstructions: ['Step A', 'Step B'],
      };
      const result = agent.generateFallbackResult(request(), plan);
      expect(result.instructions).toEqual(['Step A', 'Step B']);
    });

    it('falls back to adapter instructions when plan has none', () => {
      const plan: RotationPlan = {
        siteName: 'GitHub',
        steps: [],
        estimatedDuration: 10,
        requiresConfirmation: true,
      };
      const result = agent.generateFallbackResult(request(), plan);
      expect(result.instructions).toBeDefined();
      expect(result.instructions!.length).toBeGreaterThan(0);
    });
  });

  // --- Custom adapters -----------------------------------------------------

  describe('custom adapters', () => {
    it('uses custom adapter when provided', () => {
      const custom: SiteAdapter = {
        name: 'Custom',
        domains: ['custom.dev'],
        canHandle: (url: string) => url.includes('custom.dev'),
        createPlan: (_url, _cur, _new) => ({
          siteName: 'Custom',
          steps: [{ action: 'navigate', url: 'https://custom.dev', description: 'Go' }],
          estimatedDuration: 5,
          requiresConfirmation: false,
        }),
        getChangePasswordUrl: () => 'https://custom.dev/pw',
        getFallbackInstructions: () => ['Do it manually'],
      };

      const agent = createRotationAgent([custom, genericAdapter]);
      expect(agent.findAdapter('https://custom.dev').name).toBe('Custom');
    });

    it('falls back to generic when custom adapter does not match', () => {
      const custom: SiteAdapter = {
        name: 'Custom',
        domains: ['custom.dev'],
        canHandle: (url: string) => url.includes('custom.dev'),
        createPlan: (_url, _cur, _new) => ({
          siteName: 'Custom',
          steps: [],
          estimatedDuration: 5,
          requiresConfirmation: false,
        }),
        getChangePasswordUrl: () => '',
        getFallbackInstructions: () => [],
      };

      const agent = createRotationAgent([custom, genericAdapter]);
      expect(agent.findAdapter('https://other.com').name).toBe('Generic');
    });

    it('respects adapter order (first match wins)', () => {
      const adapterA: SiteAdapter = {
        name: 'A',
        domains: [],
        canHandle: () => true,
        createPlan: (_u, _c, _n) => ({
          siteName: 'A',
          steps: [],
          estimatedDuration: 1,
          requiresConfirmation: false,
        }),
        getChangePasswordUrl: () => '',
        getFallbackInstructions: () => [],
      };
      const adapterB: SiteAdapter = {
        name: 'B',
        domains: [],
        canHandle: () => true,
        createPlan: (_u, _c, _n) => ({
          siteName: 'B',
          steps: [],
          estimatedDuration: 1,
          requiresConfirmation: false,
        }),
        getChangePasswordUrl: () => '',
        getFallbackInstructions: () => [],
      };

      const agent = createRotationAgent([adapterA, adapterB]);
      expect(agent.findAdapter('https://any.com').name).toBe('A');
    });
  });

  // --- Edge cases ----------------------------------------------------------

  describe('edge cases', () => {
    const agent = createRotationAgent();

    it('handles URL with port number', () => {
      const adapter = agent.findAdapter('https://github.com:443/repo');
      expect(adapter.name).toBe('GitHub');
    });

    it('handles URL with path and query', () => {
      const adapter = agent.findAdapter('https://accounts.google.com/signin?hl=en');
      expect(adapter.name).toBe('Google');
    });

    it('handles URL with fragment', () => {
      const adapter = agent.findAdapter('https://amazon.com/gp#section');
      expect(adapter.name).toBe('Amazon');
    });

    it('returns generic for empty registry fallback', () => {
      // Even with an empty adapter list, the code falls back to genericAdapter
      const agent2 = createRotationAgent([]);
      const adapter = agent2.findAdapter('https://example.com');
      expect(adapter.name).toBe('Generic');
    });
  });
});
