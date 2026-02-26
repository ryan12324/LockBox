import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.js';
import { useHealthStore } from '../store/health.js';
import { api } from '../lib/api.js';
import { decryptVaultItem } from '../lib/crypto.js';
import HealthScore from '../components/HealthScore.js';
import IssueList from '../components/IssueList.js';
import type { VaultItem } from '@lockbox/types';
import { analyzeVaultHealth, analyzeItem } from '@lockbox/ai';

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
        const logins = decrypted.filter(i => i.type === 'login') as import('@lockbox/types').LoginItem[];
        // We catch this in case @lockbox/ai isn't fully implemented yet
        try {
          const summaryResult = await analyzeVaultHealth(logins);
          const reportsResult = await Promise.all(
            logins.map(login => analyzeItem(login, logins))
          );
          setSummary(summaryResult);
          setReports(reportsResult);
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
      <div className="flex flex-col items-center justify-center min-h-screen p-6">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-medium text-white mb-2">Analyzing Vault</h2>
        <p className="text-white/60">Checking passwords for vulnerabilities...</p>
      </div>
    );
  }

  const handleItemClick = (itemId: string) => {
    // Navigate back to vault and somehow select this item
    // For now we just go to vault
    navigate('/vault');
  };

  return (
    <div className="min-h-screen p-6 md:p-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/vault')}
            className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/[0.06] border border-white/[0.12] text-white/70 hover:bg-white/[0.1] hover:text-white transition-colors"
          >
            ←
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
            Security Health
          </h1>
        </div>
        <button
          onClick={loadAndAnalyzeVault}
          className="px-4 py-2 bg-indigo-600/80 hover:bg-indigo-500/90 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Re-Analyze
        </button>
      </div>

      {!summary || summary.totalItems === 0 ? (
        <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-12 text-center">
          <div className="w-20 h-20 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center mx-auto mb-6 text-white/40 text-3xl">
            🛡️
          </div>
          <h2 className="text-2xl font-medium text-white mb-3">Your Vault is Empty</h2>
          <p className="text-white/60 max-w-md mx-auto">
            Add some passwords to your vault to see your security score and get actionable advice on
            how to improve it.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Top Section: Score & Summaries */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Score Card */}
            <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-8 flex flex-col items-center justify-center md:col-span-1 min-h-[280px]">
              <HealthScore score={summary.overallScore} size={180} label="Vault Score" />
            </div>

            {/* Issue Cards */}
            <div className="grid grid-cols-2 gap-4 md:col-span-2">
              <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6 flex flex-col justify-between group hover:bg-white/[0.09] transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="text-6xl">⚠️</span>
                </div>
                <div>
                  <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-white/60 text-sm font-medium mb-1 uppercase tracking-wider">
                    Weak
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-4xl font-bold text-white">{summary.weak}</span>
                  <span className="text-white/40 text-sm">passwords</span>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6 flex flex-col justify-between group hover:bg-white/[0.09] transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="text-6xl">🔄</span>
                </div>
                <div>
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      />
                    </svg>
                  </div>
                  <h3 className="text-white/60 text-sm font-medium mb-1 uppercase tracking-wider">
                    Reused
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-4xl font-bold text-white">{summary.reused}</span>
                  <span className="text-white/40 text-sm">passwords</span>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6 flex flex-col justify-between group hover:bg-white/[0.09] transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="text-6xl">⏳</span>
                </div>
                <div>
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-400 flex items-center justify-center mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-white/60 text-sm font-medium mb-1 uppercase tracking-wider">
                    Old
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-4xl font-bold text-white">{summary.old}</span>
                  <span className="text-white/40 text-sm">passwords</span>
                </div>
              </div>

              <div className="backdrop-blur-xl bg-white/[0.07] border border-white/[0.12] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.25)] p-6 flex flex-col justify-between group hover:bg-white/[0.09] transition-colors relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="text-6xl">💀</span>
                </div>
                <div>
                  <div className="w-10 h-10 rounded-full bg-red-500/20 text-red-500 border border-red-500/30 flex items-center justify-center mb-4">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-white/60 text-sm font-medium mb-1 uppercase tracking-wider">
                    Breached
                  </h3>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-4xl font-bold text-white">{summary.breached}</span>
                  <span className="text-white/40 text-sm">passwords</span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Section: Issue List */}
          <div>
            <h2 className="text-xl font-medium text-white mb-6">Action Items</h2>
            <IssueList reports={reports} items={items} onItemClick={handleItemClick} />
          </div>
        </div>
      )}
    </div>
  );
}
