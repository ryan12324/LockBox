/**
 * Copilot scheduler — periodic evaluation of vault security posture.
 *
 * Manages evaluation intervals, notification rate-limiting, and callbacks
 * for posture changes and critical actions.
 */

import type { LoginItem, SecurityPosture, SecurityAction, BreachCheckResult } from '@lockbox/types';
import { SecurityCopilot } from './engine.js';
import type { CopilotOptions } from './engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SchedulerOptions {
  /** Evaluation interval in milliseconds. Defaults to 24 hours. */
  evaluationIntervalMs?: number;
  /** Maximum notifications per day. Defaults to 1. */
  maxNotificationsPerDay?: number;
  /** Callback when security posture changes after evaluation. */
  onPostureChange?: (posture: SecurityPosture) => void;
  /** Callback for critical-priority actions discovered during evaluation. */
  onCriticalAction?: (action: SecurityAction) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_NOTIFICATIONS = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class CopilotScheduler {
  private readonly copilot: SecurityCopilot;
  private readonly intervalMs: number;
  private readonly maxNotificationsPerDay: number;
  private readonly onPostureChange?: (posture: SecurityPosture) => void;
  private readonly onCriticalAction?: (action: SecurityAction) => void;

  private intervalId?: ReturnType<typeof setInterval>;
  private lastEvaluation?: string; // ISO 8601
  private lastPosture: SecurityPosture | null = null;
  private notificationCount = 0;
  private notificationResetDate?: string; // YYYY-MM-DD

  constructor(options: SchedulerOptions = {}) {
    this.copilot = new SecurityCopilot();
    this.intervalMs = options.evaluationIntervalMs ?? DEFAULT_INTERVAL_MS;
    this.maxNotificationsPerDay = options.maxNotificationsPerDay ?? DEFAULT_MAX_NOTIFICATIONS;
    this.onPostureChange = options.onPostureChange;
    this.onCriticalAction = options.onCriticalAction;
  }

  /**
   * Start periodic evaluation.
   *
   * @param getVault — async function returning the current decrypted vault
   * @param getBreachResults — optional async function returning breach data
   */
  start(
    getVault: () => Promise<LoginItem[]>,
    getBreachResults?: () => Promise<Map<string, BreachCheckResult>>
  ): void {
    // Prevent double-start
    if (this.intervalId !== undefined) return;

    const run = async (): Promise<void> => {
      const vault = await getVault();
      const breachResults = getBreachResults ? await getBreachResults() : undefined;
      await this.evaluateNow(vault, breachResults);
    };

    // Schedule periodic runs
    this.intervalId = setInterval(() => {
      void run();
    }, this.intervalMs);
  }

  /** Stop periodic evaluation and clear the interval. */
  stop(): void {
    if (this.intervalId !== undefined) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Force an immediate evaluation outside the normal schedule.
   *
   * Returns the resulting security posture and fires callbacks as appropriate.
   */
  async evaluateNow(
    vault: LoginItem[],
    breachResults?: Map<string, BreachCheckResult>
  ): Promise<SecurityPosture> {
    const previousScore = this.lastPosture?.score;
    const options: CopilotOptions = {
      breachResults,
      previousScore,
    };

    const posture = await this.copilot.evaluate(vault, options);

    this.lastEvaluation = new Date().toISOString();
    this.lastPosture = posture;

    // Reset daily notification counter if the day has changed
    this.maybeResetDailyCounter();

    // Fire posture change callback
    if (this.onPostureChange && this.canNotify()) {
      this.onPostureChange(posture);
      this.notificationCount++;
    }

    // Fire critical action callbacks (independent of notification limit)
    if (this.onCriticalAction) {
      for (const action of posture.actions) {
        if (action.priority === 'critical') {
          this.onCriticalAction(action);
        }
      }
    }

    return posture;
  }

  /**
   * Check whether an evaluation is due based on the configured interval.
   *
   * Returns true if no evaluation has occurred yet, or if the interval
   * has elapsed since the last evaluation.
   */
  isDue(): boolean {
    if (!this.lastEvaluation) return true;
    const elapsed = Date.now() - new Date(this.lastEvaluation).getTime();
    return elapsed >= this.intervalMs;
  }

  /** Get the most recent security posture, or null if no evaluation has run. */
  getLastPosture(): SecurityPosture | null {
    return this.lastPosture;
  }

  /** Get the timestamp of the last evaluation, or undefined if none. */
  getLastEvaluation(): string | undefined {
    return this.lastEvaluation;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Check whether the scheduler can fire a notification (within daily cap). */
  private canNotify(): boolean {
    return this.notificationCount < this.maxNotificationsPerDay;
  }

  /** Reset the daily notification counter if the date has changed. */
  private maybeResetDailyCounter(): void {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    if (this.notificationResetDate !== today) {
      this.notificationResetDate = today;
      this.notificationCount = 0;
    }
  }
}
