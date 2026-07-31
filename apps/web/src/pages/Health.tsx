import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useHealthStore } from '../store/health.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import { Card, Badge, Button, Icon, type IconName } from '@lockbox/design';
import IssueList from '../components/IssueList.js';
import type { VaultItem } from '@lockbox/types';
import { analyzeVaultHealth, analyzeItem, SecurityCopilot, LifecycleTracker } from '@lockbox/ai';
import { checkBatch } from '@lockbox/crypto';
import type { SecurityPosture, RotationSchedule, LoginItem } from '@lockbox/types';

interface TFAData {
  domain: string;
  tfa: string[];
  documentation?: string;
}

export default function Health() {
  const navigate = useNavigate();
  const { session, userKey } = useAuthStore();
  const { summary, reports, loading, setSummary, setReports, setLoading } = useHealthStore();
  const [items, setItems] = useState<VaultItem[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [breachChecking, setBreachChecking] = useState(false);
  const [breachMessage, setBreachMessage] = useState<string | null>(null);
  const breachedItemIds = useRef(new Set<string>());
  const baseHealthScore = useRef(100);
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [dueItems, setDueItems] = useState<
    { schedule: RotationSchedule; item: VaultItem; category: string }[]
  >([]);

  const [tfaData, setTfaData] = useState<Map<string, TFAData> | null>(null);
  const [tfaIssues, setTfaIssues] = useState<{ item: LoginItem; info: TFAData }[]>([]);

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
        if (!login.totp) {
          issues.push({ item: login, info });
        }
      }
    }

    setTfaIssues(issues);
  }, [tfaData, items]);

  const loadAndAnalyzeVault = useCallback(async () => {
    if (!session || !userKey) return;

    setLoading(true);
    setAnalyzing(true);
    try {
      const res = await api.vault.list(session.token);
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
          const knownBreaches = breachedItemIds.current;
          baseHealthScore.current = summaryResult.overallScore;
          setSummary({
            ...summaryResult,
            breached: knownBreaches.size,
            overallScore:
              knownBreaches.size > 0
                ? Math.min(summaryResult.overallScore, 49)
                : summaryResult.overallScore,
          });
          setReports(
            reportsResult.map((report) =>
              knownBreaches.has(report.itemId)
                ? { ...report, issues: [...report.issues, { type: 'breached' as const }] }
                : report
            )
          );

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

  const checkBreaches = async () => {
    const logins = items.filter((item): item is LoginItem => item.type === 'login');
    if (logins.length === 0) return;

    setBreachChecking(true);
    setBreachMessage(null);
    try {
      const results = await checkBatch(
        logins.map((item) => ({ id: item.id, password: item.password }))
      );
      const nextBreaches = new Set(breachedItemIds.current);
      let failedCount = 0;
      for (const [itemId, result] of results) {
        if (result.error) {
          failedCount++;
          continue;
        }
        if (result.found) nextBreaches.add(itemId);
        else nextBreaches.delete(itemId);
      }
      breachedItemIds.current = nextBreaches;
      if (summary) {
        setSummary({
          ...summary,
          breached: nextBreaches.size,
          overallScore:
            nextBreaches.size > 0
              ? Math.min(baseHealthScore.current, 49)
              : baseHealthScore.current,
        });
      }
      setReports(
        reports.map((report) => {
          const withoutBreach = report.issues.filter((issue) => issue.type !== 'breached');
          return {
            ...report,
            issues: nextBreaches.has(report.itemId)
              ? [...withoutBreach, { type: 'breached' as const }]
              : withoutBreach,
          };
        })
      );
      setBreachMessage(
        failedCount > 0
          ? `${failedCount} password${failedCount === 1 ? '' : 's'} could not be checked; no safe verdict was inferred for those entries.`
          : `Checked ${logins.length} password${logins.length === 1 ? '' : 's'} using HIBP k-anonymity.`
      );
    } catch (error) {
      setBreachMessage(error instanceof Error ? error.message : 'Breach check failed');
    } finally {
      setBreachChecking(false);
    }
  };

  if (loading || analyzing) {
    return (
      <div
        style={{ background: 'var(--color-bg)', padding: 16 }}
        className="flex-1 flex flex-col items-center justify-center"
      >
        <Icon name="loader-2" size={32} className="vault-state__spinner" />
        <h2
          style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: 600,
            color: 'var(--color-text)',
            marginBottom: 8,
          }}
        >
          Reviewing your vault
        </h2>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Checking password quality and preparing local recommendations…
        </p>
      </div>
    );
  }

  const handleItemClick = (_itemId: string) => {
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
            Security review
          </h1>
          <div className="flex items-center" style={{ gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={checkBreaches}
              disabled={breachChecking || items.every((item) => item.type !== 'login')}
              title="Uses HIBP k-anonymity: only a five-character SHA-1 prefix leaves this device"
            >
              <Icon name="shield-check" size={18} />
              {breachChecking ? 'Checking…' : 'Check breaches'}
            </Button>
            <Button variant="primary" size="sm" onClick={loadAndAnalyzeVault}>
              <Icon name="refresh" size={18} />
              Review again
            </Button>
          </div>
        </div>

        <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
          Breach checks are manual. Only the first five characters of each password's SHA-1 hash
          are sent to Have I Been Pwned.
        </p>
        {breachMessage && (
          <p
            role="status"
            style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-xs)' }}
          >
            {breachMessage}
          </p>
        )}

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
                <Icon name="shield-lock" size={30} />
              </div>
              <h2
                style={{
                  fontSize: 'var(--font-size-xl)',
                  fontWeight: 600,
                  color: 'var(--color-text)',
                  marginBottom: 12,
                }}
              >
                Nothing to review yet
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', maxWidth: 420, margin: '0 auto' }}>
                Add a login to receive local, item-specific recommendations. Lockbox does not
                send vault contents for this review.
              </p>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card variant="surface" padding="lg">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: posture?.actions.length ? 20 : 0 }}>
                <span style={{ width: 44, height: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', color: 'var(--color-primary)', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                  <Icon name="shield-check" size={22} />
                </span>
                <div>
                  <h2 style={{ margin: 0, color: 'var(--color-text)', fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                    {summary.breached > 0
                      ? 'Breach results need attention'
                      : summary.weak + summary.reused + summary.old > 0
                        ? 'Review the priorities below'
                        : 'No current password issues found'}
                  </h2>
                  <p style={{ margin: '5px 0 0', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                    Local analysis reviewed {summary.totalItems} {summary.totalItems === 1 ? 'login' : 'logins'}. Counts may overlap when one item has several issues.
                  </p>
                </div>
              </div>
              {posture && posture.actions.length > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  <h3 style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Recommended next steps</h3>
                  {posture.actions.slice(0, 3).map((action, index) => (
                    <div key={index} style={{ padding: 12, display: 'grid', gridTemplateColumns: '20px minmax(0, 1fr) auto', alignItems: 'center', gap: 9, background: action.priority === 'critical' || action.priority === 'high' ? 'var(--color-error-subtle)' : 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
                      <Icon name={action.priority === 'critical' || action.priority === 'high' ? 'alert-circle' : 'info-circle'} size={18} />
                      <span style={{ color: 'var(--color-text)', fontSize: 'var(--font-size-sm)' }}>{action.message}</span>
                      <Badge variant={action.priority === 'critical' || action.priority === 'high' ? 'error' : 'default'}>{action.affectedItems.length} {action.affectedItems.length === 1 ? 'item' : 'items'}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 16,
              }}
            >
              {([
                {
                  key: 'weak',
                  label: 'Weak',
                  count: summary.weak,
                  iconBg: 'var(--color-error-subtle)',
                  iconColor: 'var(--color-error)',
                  icon: 'alert-triangle',
                },
                {
                  key: 'reused',
                  label: 'Reused',
                  count: summary.reused,
                  iconBg: 'var(--color-warning-subtle)',
                  iconColor: 'var(--color-warning)',
                  icon: 'arrows-sort',
                },
                {
                  key: 'old',
                  label: 'Old',
                  count: summary.old,
                  iconBg: 'var(--color-warning-subtle)',
                  iconColor: 'var(--color-warning)',
                  icon: 'clock',
                },
                {
                  key: 'breached',
                  label: 'Breached',
                  count: summary.breached,
                  iconBg: 'var(--color-error-subtle)',
                  iconColor: 'var(--color-error)',
                  icon: 'lock',
                },
              ] satisfies Array<{
                key: string;
                label: string;
                count: number;
                iconBg: string;
                iconColor: string;
                icon: IconName;
              }>).map((cat) => (
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
                      <Icon name={cat.icon} size={20} />
                    </div>
                    <h3
                      style={{
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 500,
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
                        fontWeight: 650,
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
                  Due for rotation
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
                          Rotate now
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
                    Enable two-factor authentication
                  </h2>
                  <Badge variant="primary">
                    {tfaIssues.length} {tfaIssues.length === 1 ? 'site' : 'sites'}
                  </Badge>
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
                          Add TOTP key
                        </Button>
                        {info.documentation && (
                          <a
                            className="lb-button lb-button--secondary lb-button--sm"
                            href={info.documentation}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Documentation
                            <Icon name="external-link" size={16} />
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
                Action items
              </h2>
              <IssueList reports={reports} items={items} onItemClick={handleItemClick} />
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
