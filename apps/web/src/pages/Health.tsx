import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useHealthStore } from '../store/health.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import HealthScore from '../components/HealthScore.js';
import IssueList from '../components/IssueList.js';
import type { VaultItem } from '@lockbox/types';
import { analyzeVaultHealth, analyzeItem, SecurityCopilot, LifecycleTracker } from '@lockbox/ai';
import type { SecurityPosture, RotationSchedule, LoginItem } from '@lockbox/types';
import type { ItemCategory } from '@lockbox/ai';

interface TFAData {
  domain: string;
  tfa: string[];
  documentation?: string;
}

interface EncryptedItem {
  id: string;
  type: string;
  encryptedData: string;
  folderId: string | null;
  tags: string | null;
  favorite: number;
  revisionDate: string;
  createdAt: string;
  deletedAt: string | null;
}

export default function Health() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { summary, reports, loading, setSummary, setReports, setLoading } = useHealthStore();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [dueItems, setDueItems] = useState<
    { schedule: RotationSchedule; item: VaultItem; category: string }[]
  >([]);

  // 2FA state
  const [tfaData, setTfaData] = useState<Map<string, TFAData> | null>(null);
  const [tfaIssues, setTfaIssues] = useState<{ item: LoginItem; info: TFAData }[]>([]);
  const [tfaScore, setTfaScore] = useState<number>(100);
  const [tfaCapableCount, setTfaCapableCount] = useState(0);

  // Load 2FA Directory
  useEffect(() => {
    async function loadTFA() {
      try {
        const cached = localStorage.getItem('lockbox_tfa_cache');
        const cachedTime = localStorage.getItem('lockbox_tfa_cache_time');
        const now = Date.now();

        if (cached && cachedTime && now - Number(cachedTime) < 24 * 60 * 60 * 1000) {
          const data = JSON.parse(cached);
          const map = new Map<string, TFAData>();
          data.forEach((val: [string, TFAData]) => map.set(val[1].domain, val[1]));
          setTfaData(map);
          return;
        }

        const res = await fetch('https://2fa.directory/api/v3/tfa.json');
        const data = await res.json();

        localStorage.setItem('lockbox_tfa_cache', JSON.stringify(data));
        localStorage.setItem('lockbox_tfa_cache_time', now.toString());

        const map = new Map<string, TFAData>();
        data.forEach((val: [string, TFAData]) => map.set(val[1].domain, val[1]));
        setTfaData(map);
      } catch (err) {
        console.error('Failed to load 2FA directory data:', err);
      }
    }
    loadTFA();
  }, []);

  // Compute 2FA issues
  useEffect(() => {
    if (!tfaData || !items.length) return;

    const logins = items.filter((i) => i.type === 'login') as LoginItem[];
    const issues: { item: LoginItem; info: TFAData }[] = [];
    let capable = 0;
    let configured = 0;

    for (const login of logins) {
      if (!login.uris || login.uris.length === 0) continue;

      let info: TFAData | undefined = undefined;
      for (const uri of login.uris) {
        try {
          const urlStr = uri.startsWith('http') ? uri : `https://${uri}`;
          let hostname = new URL(urlStr).hostname.replace(/^www\./, '');

          if (tfaData.has(hostname)) {
            info = tfaData.get(hostname);
          } else {
            const parts = hostname.split('.');
            if (parts.length > 2) {
              const rootDomain = parts.slice(-2).join('.');
              if (tfaData.has(rootDomain)) {
                info = tfaData.get(rootDomain);
              }
            }
          }
          if (info) break;
        } catch (err) {
          // ignore invalid URLs
        }
      }

      if (info) {
        capable++;
        if (login.totp) {
          configured++;
        } else {
          issues.push({ item: login, info });
        }
      }
    }

    setTfaCapableCount(capable);
    setTfaScore(capable > 0 ? Math.round((configured / capable) * 100) : 100);
    setTfaIssues(issues);
  }, [tfaData, items]);

  const finalScore = summary
    ? Math.round(
        ((summary.overallScore || 100) +
          (tfaCapableCount > 0 ? tfaScore : summary.overallScore || 100)) /
          2
      )
    : 100;

  const loadAndAnalyzeVault = useCallback(async () => {
    if (!session || !userKey) return;

    setLoading(true);
    setAnalyzing(true);
    try {
      const res = (await api.vault.list(session.token)) as { items: EncryptedItem[] };
      const decrypted: VaultItem[] = [];

      await Promise.all(
        res.items
          .filter((i) => !i.deletedAt)
          .map(async (i) => {
            try {
              const d = await decryptVaultItem(i.encryptedData, userKey, i.id, i.revisionDate);
              decrypted.push(d);
            } catch (err) {
              console.error('Failed to decrypt item for health check:', i.id);
            }
          })
      );

      setItems(decrypted);

      if (decrypted.length > 0) {
        const logins = decrypted.filter(
          (i) => i.type === 'login'
        ) as import('@lockbox/types').LoginItem[];
        // We catch this in case @lockbox/ai isn't fully implemented yet
        try {
          const summaryResult = await analyzeVaultHealth(logins);
          const reportsResult = await Promise.all(
            logins.map((login) => analyzeItem(login, logins))
          );
          setSummary(summaryResult);
          setReports(reportsResult);

          const copilot = new SecurityCopilot();
          const postureResult = await copilot.evaluate(logins);
          setPosture(postureResult);

          const tracker = new LifecycleTracker({ now: new Date() });
          const due = tracker.getDueItems(logins);
          const itemsWithDueInfo = due
            .filter((d) => d.urgency !== 'ok')
            .map((schedule) => {
              const item = logins.find((l) => l.id === schedule.itemId)!;
              const category = tracker.categorizeItem(item);
              return { schedule, item, category };
            });
          setDueItems(itemsWithDueInfo);
        } catch (err) {
          console.warn('Health analysis failed or not fully implemented:', err);
          // Fallback empty state if analysis fails
          setSummary({
            totalItems: decrypted.length,
            weak: 0,
            reused: 0,
            old: 0,
            breached: 0,
            strong: decrypted.length,
            overallScore: 100,
          });
          setReports([]);
        }
      } else {
        setSummary({
          totalItems: 0,
          weak: 0,
          reused: 0,
          old: 0,
          breached: 0,
          strong: 0,
          overallScore: 100,
        });
        setReports([]);
      }
    } catch (err) {
      console.error('Failed to load vault for health check:', err);
    } finally {
      setLoading(false);
      setAnalyzing(false);
    }
  }, [session, userKey, setLoading, setSummary, setReports]);

  useEffect(() => {
    // Only analyze if we don't have recent reports or if forced
    loadAndAnalyzeVault();
  }, [loadAndAnalyzeVault]);

  if (loading || analyzing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin mb-4" />
        <h2 className="text-xl font-medium text-[var(--color-text)] mb-2">Analyzing Vault</h2>
        <p className="text-[var(--color-text-secondary)]">
          Checking passwords for vulnerabilities...
        </p>
      </div>
    );
  }

  const handleItemClick = (itemId: string) => {
    // Navigate back to vault and somehow select this item
    // For now we just go to vault
    navigate('/vault');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8">
      <div className="max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)] drop-shadow-sm">
            Security Health
          </h1>
          <button
            onClick={loadAndAnalyzeVault}
            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors"
          >
            Re-Analyze
          </button>
        </div>

        {!summary || summary.totalItems === 0 ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-12 text-center">
            <div className="w-20 h-20 rounded-[var(--radius-full)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-6 text-[var(--color-text-tertiary)] text-3xl">
              🛡️
            </div>
            <h2 className="text-2xl font-medium text-[var(--color-text)] mb-3">
              Your Vault is Empty
            </h2>
            <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
              Add some passwords to your vault to see your security score and get actionable advice
              on how to improve it.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Top Section: Score & Summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Score Card */}
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-8 flex flex-col items-center justify-center md:col-span-1 min-h-[280px]">
                <HealthScore
                  score={finalScore}
                  size={posture && posture.actions.length > 0 ? 140 : 180}
                  label="Vault Score"
                />
                {posture && (
                  <div
                    className={`mt-4 px-3 py-1 rounded-[var(--radius-full)] text-sm font-medium ${
                      posture.trend === 'improving'
                        ? 'bg-[var(--color-success-subtle)] text-[var(--color-success)]'
                        : posture.trend === 'declining'
                          ? 'bg-[var(--color-error-subtle)] text-[var(--color-error)]'
                          : 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'
                    }`}
                  >
                    {posture.trend === 'improving'
                      ? '↗ Improving'
                      : posture.trend === 'declining'
                        ? '↘ Declining'
                        : '→ Stable'}
                  </div>
                )}
                {posture && posture.actions.length > 0 && (
                  <div className="mt-6 w-full space-y-2">
                    <h3 className="text-[var(--color-text-secondary)] text-xs font-semibold uppercase tracking-wider mb-2">
                      Top Actions
                    </h3>
                    {posture.actions.slice(0, 3).map((action, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-[var(--radius-lg)] border text-sm flex flex-col gap-1 ${
                          action.priority === 'critical'
                            ? 'bg-[var(--color-error-subtle)] border-[var(--color-error)] text-[var(--color-error)]'
                            : action.priority === 'high'
                              ? 'bg-[var(--color-warning-subtle)] border-[var(--color-warning)] text-[var(--color-warning)]'
                              : action.priority === 'medium'
                                ? 'bg-[var(--color-warning-subtle)] border-[var(--color-warning)] text-[var(--color-warning)]'
                                : 'bg-[var(--color-aura-dim)] border-[var(--color-primary)] text-[var(--color-primary)]'
                        }`}
                      >
                        <span className="font-medium">{action.message}</span>
                        <span className="text-xs opacity-70">
                          {action.affectedItems.length} items affected
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Issue Cards */}
              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-6 flex flex-col justify-between group hover:bg-[var(--color-surface-raised)] transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-6xl">⚠️</span>
                  </div>
                  <div>
                    <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--color-error-subtle)] text-[var(--color-error)] flex items-center justify-center mb-4">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-[var(--color-text-secondary)] text-sm font-medium mb-1 uppercase tracking-wider">
                      Weak
                    </h3>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-4xl font-bold text-[var(--color-text)]">
                      {summary.weak}
                    </span>
                    <span className="text-[var(--color-text-tertiary)] text-sm">passwords</span>
                  </div>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-6 flex flex-col justify-between group hover:bg-[var(--color-surface-raised)] transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-6xl">🔄</span>
                  </div>
                  <div>
                    <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)] flex items-center justify-center mb-4">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                    </div>
                    <h3 className="text-[var(--color-text-secondary)] text-sm font-medium mb-1 uppercase tracking-wider">
                      Reused
                    </h3>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-4xl font-bold text-[var(--color-text)]">
                      {summary.reused}
                    </span>
                    <span className="text-[var(--color-text-tertiary)] text-sm">passwords</span>
                  </div>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-6 flex flex-col justify-between group hover:bg-[var(--color-surface-raised)] transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-6xl">⏳</span>
                  </div>
                  <div>
                    <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)] flex items-center justify-center mb-4">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-[var(--color-text-secondary)] text-sm font-medium mb-1 uppercase tracking-wider">
                      Old
                    </h3>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-4xl font-bold text-[var(--color-text)]">
                      {summary.old}
                    </span>
                    <span className="text-[var(--color-text-tertiary)] text-sm">passwords</span>
                  </div>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] p-6 flex flex-col justify-between group hover:bg-[var(--color-surface-raised)] transition-colors relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span className="text-6xl">💀</span>
                  </div>
                  <div>
                    <div className="w-10 h-10 rounded-[var(--radius-full)] bg-[var(--color-error-subtle)] text-[var(--color-error)] border border-[var(--color-error)] flex items-center justify-center mb-4">
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-[var(--color-text-secondary)] text-sm font-medium mb-1 uppercase tracking-wider">
                      Breached
                    </h3>
                  </div>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-4xl font-bold text-[var(--color-text)]">
                      {summary.breached}
                    </span>
                    <span className="text-[var(--color-text-tertiary)] text-sm">passwords</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Rotation Section */}
            {dueItems.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-medium text-[var(--color-text)] mb-6">
                  Due for Rotation
                </h2>
                <div className="space-y-3">
                  {dueItems.map(({ schedule, item, category }) => {
                    const diffTime =
                      new Date(schedule.nextRotation).getTime() - new Date().getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    const timeText =
                      diffDays < 0
                        ? `${Math.abs(diffDays)} days overdue`
                        : `${diffDays} days remaining`;

                    return (
                      <div
                        key={schedule.itemId}
                        className={`flex items-center justify-between p-4 border rounded-[var(--radius-lg)] ${
                          schedule.urgency === 'overdue'
                            ? 'bg-[var(--color-error-subtle)] border-[var(--color-error)]'
                            : 'bg-[var(--color-warning-subtle)] border-[var(--color-warning)]'
                        }`}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-[var(--color-text)]">
                              {item.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-[var(--radius-full)] text-xs font-medium bg-[var(--color-surface-raised)] text-[var(--color-text-secondary)] capitalize">
                              {category}
                            </span>
                          </div>
                          <span
                            className={`text-sm mt-1 ${schedule.urgency === 'overdue' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`}
                          >
                            {timeText}
                          </span>
                        </div>
                        <button
                          onClick={() => handleItemClick(item.id)}
                          className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] text-sm font-medium rounded-[var(--radius-md)] transition-colors"
                        >
                          Rotate Now
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2FA Section */}
            {tfaIssues.length > 0 && (
              <div className="mb-8">
                <div className="flex items-center gap-3 mb-6">
                  <h2 className="text-xl font-medium text-[var(--color-text)]">Enable 2FA</h2>
                  <span className="px-2.5 py-0.5 rounded-[var(--radius-full)] bg-[var(--color-aura-dim)] text-[var(--color-primary)] text-xs font-bold">
                    {tfaIssues.length} Sites
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tfaIssues.map(({ item, info }) => (
                    <div
                      key={item.id}
                      className="bg-[var(--color-bg-subtle)] border border-[var(--color-border)] rounded-[var(--radius-xl)] p-5 hover:bg-[var(--color-surface)] transition-colors flex flex-col justify-between h-full"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-[var(--color-text)] text-lg truncate pr-4">
                            {item.name}
                          </h3>
                          <div className="flex gap-1">
                            {info.tfa.map((method) => (
                              <span
                                key={method}
                                className="px-2 py-1 bg-[var(--color-surface-raised)] rounded text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider"
                              >
                                {method}
                              </span>
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
                          {info.domain}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 mt-auto">
                        <button
                          onClick={() => handleItemClick(item.id)}
                          className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-fg)] rounded-[var(--radius-md)] text-sm font-medium transition-colors"
                        >
                          Add TOTP Key
                        </button>
                        {info.documentation && (
                          <a
                            href={info.documentation}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] text-[var(--color-text)] rounded-[var(--radius-md)] text-sm font-medium transition-colors"
                          >
                            Docs ↗
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Section: Issue List */}
            <div>
              <h2 className="text-xl font-medium text-[var(--color-text)] mb-6">Action Items</h2>
              <IssueList reports={reports} items={items} onItemClick={handleItemClick} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
