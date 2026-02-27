/**
 * Password rotation agent — orchestrates adapter lookup and plan creation.
 *
 * The agent does NOT execute browser automation. It builds declarative plans
 * that the client-side runtime (extension / mobile) can execute.
 */

import type { SiteAdapter, RotationResult, RotationPlan } from './adapters/base.js';
import { generatePassword } from '@lockbox/generator';
import { googleAdapter } from './adapters/google.js';
import { githubAdapter } from './adapters/github.js';
import { amazonAdapter } from './adapters/amazon.js';
import { genericAdapter } from './adapters/generic.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for a password rotation request. */
export interface RotationRequest {
  /** Lockbox vault item ID. */
  itemId: string;
  /** URL of the site whose password should be rotated. */
  url: string;
  /** Username / email for the account. */
  currentUsername: string;
  /** Current plaintext password (kept in memory only). */
  currentPassword: string;
  /** Desired new password. If omitted, one is generated. */
  newPassword?: string;
}

/** Public API of the rotation agent. */
export interface RotationAgent {
  /** Find the best adapter for a given URL. */
  findAdapter(url: string): SiteAdapter;
  /** Build a rotation plan for the given request. */
  createRotationPlan(request: RotationRequest): RotationPlan;
  /**
   * Produce a fallback result containing human-readable instructions.
   * Used when automated execution is not available or fails.
   */
  generateFallbackResult(request: RotationRequest, plan: RotationPlan): RotationResult;
}

// ---------------------------------------------------------------------------
// Default adapters (ordered: specific first, generic last)
// ---------------------------------------------------------------------------

const DEFAULT_ADAPTERS: SiteAdapter[] = [
  googleAdapter,
  githubAdapter,
  amazonAdapter,
  genericAdapter,
];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new rotation agent.
 *
 * @param adapters Optional list of adapters. When omitted the built-in set
 *   (Google, GitHub, Amazon, Generic) is used. The generic adapter should
 *   always be last as it is the catch-all.
 */
export function createRotationAgent(adapters?: SiteAdapter[]): RotationAgent {
  const registry = adapters ?? DEFAULT_ADAPTERS;

  function findAdapter(url: string): SiteAdapter {
    for (const adapter of registry) {
      if (adapter.canHandle(url)) {
        return adapter;
      }
    }

    // Should never happen when generic is in the list, but guard anyway.
    return genericAdapter;
  }

  function createRotationPlan(request: RotationRequest): RotationPlan {
    const adapter = findAdapter(request.url);
    const newPassword = request.newPassword ?? generatePassword();
    return adapter.createPlan(request.url, request.currentPassword, newPassword);
  }

  function generateFallbackResult(request: RotationRequest, plan: RotationPlan): RotationResult {
    const adapter = findAdapter(request.url);
    const domain = new URL(request.url).hostname.replace(/^www\./, '');
    const instructions = plan.fallbackInstructions ?? adapter.getFallbackInstructions(domain);

    return {
      success: false,
      fallbackUsed: true,
      instructions,
      duration: 0,
    };
  }

  return { findAdapter, createRotationPlan, generateFallbackResult };
}
