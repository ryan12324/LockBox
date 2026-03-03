import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useHealthStore } from '../store/health.js';
import { useAura } from '../providers/AuraProvider.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { Card, Badge, Button } from '@lockbox/design';
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
  const aura = useAura();
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

  // Wire Aura state to health score
  useEffect(() => {
    if (!summary || loading || analyzing) return;
    if (finalScore >= 80) {
      aura.setState('idle');
    } else if (finalScore >= 50) {
      aura.setState('active');
    } else {
      aura.setState('thinking');
    }
  }, [finalScore, summary, loading, analyzing]);

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
          <Button variant="primary" size="sm" onClick={loadAndAnalyzeVault}>
            Re-Analyze
          </Button>
        </div>

        {!summary || summary.totalItems === 0 ? (
          <Card variant="raised" padding="lg">
            <div className="text-center">
              <div className="w-20 h-20 rounded-[var(--radius-full)] bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center mx-auto mb-6 text-[var(--color-text-tertiary)] text-3xl">
                🛡️
              </div>
              <h2 className="text-2xl font-medium text-[var(--color-text)] mb-3">
                Your Vault is Empty
              </h2>
              <p className="text-[var(--color-text-secondary)] max-w-md mx-auto">
                Add some passwords to your vault to see your security score and get actionable
                advice on how to improve it.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Top Section: Score & Summaries */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Score Card */}
              <Card
                variant="raised"
                padding="lg"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: 280,
                }}
              >
                <HealthScore
                  score={finalScore}
                  size={posture && posture.actions.length > 0 ? 140 : 180}
                  label="Vault Score"
                />
                {posture && (
                  <div className="mt-4">
                    <Badge
                      variant={
                        posture.trend === 'improving'
                          ? 'success'
                          : posture.trend === 'declining'
                            ? 'error'
                            : 'warning'
                      }
                    >
                      {posture.trend === 'improving'
                        ? '↗ Improving'
                        : posture.trend === 'declining'
                          ? '↘ Declining'
                          : '→ Stable'}
                    </Badge>
                  </div>
                )}
                {posture && posture.actions.length > 0 && (
                  <div className="mt-6 w-full space-y-2">
                    <h3 className="text-[var(--color-text-secondary)] text-xs font-semibold uppercase tracking-wider mb-2">
                      Top Actions
                    </h3>
                    {posture.actions.slice(0, 3).map((action, idx) => (
                      <Card
                        key={idx}
                        variant="surface"
                        padding="sm"
                        style={{
                          borderColor:
                            action.priority === 'critical' || action.priority === 'high'
                              ? 'var(--color-error)'
                              : action.priority === 'medium'
                                ? 'var(--color-warning)'
                                : 'var(--color-primary)',
                          background:
                            action.priority === 'critical' || action.priority === 'high'
                              ? 'var(--color-error-subtle)'
                              : action.priority === 'medium'
                                ? 'var(--color-warning-subtle)'
                                : 'var(--color-aura-dim)',
                        }}
                      >
                        <span
                          className="font-medium text-sm"
                          style={{
                            color:
                              action.priority === 'critical' || action.priority === 'high'
                                ? 'var(--color-error)'
                                : action.priority === 'medium'
                                  ? 'var(--color-warning)'
                                  : 'var(--color-primary)',
                          }}
                        >
                          {action.message}
                        </span>
                        <span className="text-xs opacity-70 block mt-1">
                          {action.affectedItems.length} items affected
                        </span>
                      </Card>
                    ))}
                  </div>
                )}
              </Card>

              {/* Issue Cards */}
              <div className="grid grid-cols-2 gap-4 md:col-span-2">
                <Card
                  variant="surface"
                  padding="md"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10">
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
                </Card>

                <Card
                  variant="surface"
                  padding="md"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10">
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
                </Card>

                <Card
                  variant="surface"
                  padding="md"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10">
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
                </Card>

                <Card
                  variant="surface"
                  padding="md"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <div className="absolute top-0 right-0 p-4 opacity-10">
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
                </Card>
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
                      <Card
                        key={schedule.itemId}
                        variant="surface"
                        padding="md"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          borderColor:
                            schedule.urgency === 'overdue'
                              ? 'var(--color-error)'
                              : 'var(--color-warning)',
                          background:
                            schedule.urgency === 'overdue'
                              ? 'var(--color-error-subtle)'
                              : 'var(--color-warning-subtle)',
                        }}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-[var(--color-text)]">
                              {item.name}
                            </span>
                            <Badge variant="default">{category}</Badge>
                          </div>
                          <span
                            className={`text-sm mt-1 ${schedule.urgency === 'overdue' ? 'text-[var(--color-error)]' : 'text-[var(--color-warning)]'}`}
                          >
                            {timeText}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleItemClick(item.id)}
                        >
                          Rotate Now
                        </Button>
                      </Card>
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
                  <Badge variant="primary">{tfaIssues.length} Sites</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tfaIssues.map(({ item, info }) => (
                    <Card
                      key={item.id}
                      variant="surface"
                      padding="md"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        height: '100%',
                      }}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-[var(--color-text)] text-lg truncate pr-4">
                            {item.name}
                          </h3>
                          <div className="flex gap-1">
                            {info.tfa.map((method) => (
                              <Badge key={method} variant="default">
                                {method}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <p className="text-sm text-[var(--color-text-tertiary)] mb-4">
                          {info.domain}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 mt-auto">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleItemClick(item.id)}
                        >
                          Add TOTP Key
                        </Button>
                        {info.documentation && (
                          <a href={info.documentation} target="_blank" rel="noreferrer">
                            <Button variant="secondary" size="sm" tabIndex={-1}>
                              Docs ↗
                            </Button>
                          </a>
                        )}
                      </div>
                    </Card>
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
