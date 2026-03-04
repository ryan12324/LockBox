import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useHealthStore } from '../store/health.js';
import { useAura } from '../providers/AuraProvider.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { Card, Badge, Button, Aura } from '@lockbox/design';
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

  const [tfaData, setTfaData] = useState<Map<string, TFAData> | null>(null);
  const [tfaIssues, setTfaIssues] = useState<{ item: LoginItem; info: TFAData }[]>([]);
  const [tfaScore, setTfaScore] = useState<number>(100);
  const [tfaCapableCount, setTfaCapableCount] = useState(0);

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
    loadAndAnalyzeVault();
  }, [loadAndAnalyzeVault]);

  if (loading || analyzing) {
    return (
      <div
        style={{ background: 'var(--color-bg)', padding: 16 }}
        className="flex-1 flex flex-col items-center justify-center"
      >
        <div style={{ position: 'relative', width: 120, height: 120, marginBottom: 24 }}>
          <Aura state="thinking" position="center" />
          <div
            className="w-16 h-16 border-4 border-[var(--color-primary)] border-t-transparent rounded-[var(--radius-full)] animate-spin"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>
        <h2
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: 8,
          }}
        >
          Analyzing Vault
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Checking passwords for vulnerabilities...
        </p>
      </div>
    );
  }

  const handleItemClick = (itemId: string) => {
    navigate('/vault');
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--color-bg)', padding: 16 }}>
      <div
        className="max-w-5xl mx-auto w-full"
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <div className="flex items-center justify-between">
          <h1
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 700,
              color: 'var(--color-text)',
              letterSpacing: '-0.025em',
            }}
          >
            Security Health
          </h1>
          <Button variant="primary" size="sm" onClick={loadAndAnalyzeVault}>
            Re-Analyze
          </Button>
        </div>

        {!summary || summary.totalItems === 0 ? (
          <Card variant="frost" padding="lg" style={{ boxShadow: 'var(--shadow-xl)' }}>
            <div className="text-center" style={{ padding: '24px 0' }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  fontSize: 'var(--font-size-2xl)',
                  color: 'var(--color-text-tertiary)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                🛡️
              </div>
              <h2
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 12,
                }}
              >
                Your Vault is Empty
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: 420, margin: '0 auto' }}>
                Add some passwords to your vault to see your security score and get actionable
                advice on how to improve it.
              </p>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card
              variant="frost"
              padding="lg"
              style={{
                boxShadow: 'var(--shadow-xl)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Aura
                state={finalScore >= 80 ? 'idle' : finalScore >= 50 ? 'active' : 'thinking'}
                position="center"
                style={{ opacity: 0.15, width: 400, height: 400 }}
              />
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <HealthScore
                  score={finalScore}
                  size={posture && posture.actions.length > 0 ? 140 : 180}
                  label="Vault Score"
                />
                {posture && (
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
                )}
                {posture && posture.actions.length > 0 && (
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 480,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <h3
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: 4,
                      }}
                    >
                      Top Actions
                    </h3>
                    {posture.actions.slice(0, 3).map((action, idx) => (
                      <Card
                        key={idx}
                        variant="surface"
                        padding="sm"
                        style={{
                          background:
                            action.priority === 'critical' || action.priority === 'high'
                              ? 'var(--color-error-subtle)'
                              : action.priority === 'medium'
                                ? 'var(--color-warning-subtle)'
                                : 'var(--color-aura-dim)',
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 500,
                            fontSize: 'var(--font-size-sm)',
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
                        <span
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            opacity: 0.7,
                            display: 'block',
                            marginTop: 4,
                          }}
                        >
                          {action.affectedItems.length} items affected
                        </span>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {[
                {
                  key: 'weak',
                  label: 'Weak',
                  count: summary.weak,
                  iconBg: 'var(--color-error-subtle)',
                  iconColor: 'var(--color-error)',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  ),
                },
                {
                  key: 'reused',
                  label: 'Reused',
                  count: summary.reused,
                  iconBg: 'var(--color-warning-subtle)',
                  iconColor: 'var(--color-warning)',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  ),
                },
                {
                  key: 'old',
                  label: 'Old',
                  count: summary.old,
                  iconBg: 'var(--color-warning-subtle)',
                  iconColor: 'var(--color-warning)',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  ),
                },
                {
                  key: 'breached',
                  label: 'Breached',
                  count: summary.breached,
                  iconBg: 'var(--color-error-subtle)',
                  iconColor: 'var(--color-error)',
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  ),
                },
              ].map((cat) => (
                <Card
                  key={cat.key}
                  variant="surface"
                  padding="md"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 160,
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: 'var(--shadow-lg)',
                  }}
                >
                  <div>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 'var(--radius-full)',
                        background: cat.iconBg,
                        color: cat.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 16,
                        boxShadow: 'var(--shadow-sm)',
                      }}
                    >
                      {cat.icon}
                    </div>
                    <h3
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        marginBottom: 4,
                      }}
                    >
                      {cat.label}
                    </h3>
                  </div>
                  <div className="flex items-baseline" style={{ gap: 8 }}>
                    <span
                      style={{
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: 700,
                        color: 'var(--color-text)',
                      }}
                    >
                      {cat.count}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      passwords
                    </span>
                  </div>
                </Card>
              ))}
            </div>

            {dueItems.length > 0 && (
              <Card variant="surface" padding="lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <h2
                  style={{
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 600,
                    color: 'var(--color-text)',
                    marginBottom: 16,
                  }}
                >
                  Due for Rotation
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        onClick={() => handleItemClick(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background:
                            schedule.urgency === 'overdue'
                              ? 'var(--color-error-subtle)'
                              : 'var(--color-warning-subtle)',
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div className="flex items-center" style={{ gap: 12 }}>
                            <span
                              style={{
                                fontWeight: 500,
                                color: 'var(--color-text)',
                              }}
                            >
                              {item.name}
                            </span>
                            <Badge variant="default">{category}</Badge>
                          </div>
                          <span
                            style={{
                              fontSize: 'var(--font-size-sm)',
                              marginTop: 4,
                              color:
                                schedule.urgency === 'overdue'
                                  ? 'var(--color-error)'
                                  : 'var(--color-warning)',
                            }}
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
              </Card>
            )}

            {tfaIssues.length > 0 && (
              <Card variant="surface" padding="lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
                <div className="flex items-center" style={{ gap: 12, marginBottom: 16 }}>
                  <h2
                    style={{
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: 600,
                      color: 'var(--color-text)',
                    }}
                  >
                    Enable 2FA
                  </h2>
                  <Badge variant="primary">{tfaIssues.length} Sites</Badge>
                  <div style={{ marginLeft: 'auto' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-full)',
                        background:
                          tfaScore >= 80
                            ? 'var(--color-success-subtle)'
                            : tfaScore >= 50
                              ? 'var(--color-warning-subtle)'
                              : 'var(--color-error-subtle)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 'var(--font-size-lg)',
                          fontWeight: 700,
                          color:
                            tfaScore >= 80
                              ? 'var(--color-success)'
                              : tfaScore >= 50
                                ? 'var(--color-warning)'
                                : 'var(--color-error)',
                        }}
                      >
                        {tfaScore}%
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        2FA Coverage
                      </span>
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: 12,
                  }}
                >
                  {tfaIssues.map(({ item, info }) => (
                    <Card
                      key={item.id}
                      variant="surface"
                      padding="md"
                      onClick={() => handleItemClick(item.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        height: '100%',
                      }}
                    >
                      <div>
                        <div
                          className="flex items-center justify-between"
                          style={{ marginBottom: 8 }}
                        >
                          <h3
                            style={{
                              fontWeight: 600,
                              color: 'var(--color-text)',
                              fontSize: 'var(--font-size-base)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              paddingRight: 16,
                            }}
                          >
                            {item.name}
                          </h3>
                          <div className="flex" style={{ gap: 4 }}>
                            {info.tfa.map((method) => (
                              <Badge key={method} variant="default">
                                {method}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <p
                          style={{
                            fontSize: 'var(--font-size-sm)',
                            color: 'var(--color-text-tertiary)',
                            marginBottom: 16,
                          }}
                        >
                          {info.domain}
                        </p>
                      </div>

                      <div className="flex items-center" style={{ gap: 12, marginTop: 'auto' }}>
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
              </Card>
            )}

            <Card variant="surface" padding="lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
              <h2
                style={{
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 16,
                }}
              >
                Action Items
              </h2>
              <IssueList reports={reports} items={items} onItemClick={handleItemClick} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
