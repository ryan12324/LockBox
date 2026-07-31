import React, { useState, useCallback } from 'react';
import type { ViewState, Tab } from './views/shared.js';
import { useVault } from './views/useVault.js';
import { SetupView } from './views/SetupView.js';
import { LockedView } from './views/LoginView.js';
import { ItemDetailView } from './views/DetailView.js';
import { AddEditView } from './views/AddEditView.js';
import { HealthSummaryView } from './views/HealthView.js';
import { TrashView } from './views/TrashView.js';
import { SettingsView } from './views/SettingsView.js';
import { VersionHistoryView } from './views/HistoryView.js';
import { SiteTab, VaultTab, SharedTab, GeneratorTab, TotpTab } from './views/TabsView.js';

const toolbarButtons: Array<{ view: ViewState['view']; icon: string; title: string }> = [
  { view: 'trash', icon: '🗑️', title: 'Trash' },
  { view: 'settings', icon: '⚙️', title: 'Settings' },
];
const tabDefs: { id: Tab; label: string }[] = [
  { id: 'site', label: '🌐 Site' }, { id: 'vault', label: '🔒 Vault' },
  { id: 'shared', label: '🤝 Shared' }, { id: 'generator', label: '⚡ Gen' }, { id: 'totp', label: '🔑 TOTP' },
];
const Shell = ({ children }: { children: React.ReactNode }) => <div className="flex flex-col h-[480px]">{children}</div>;
const btnCls = 'bg-[var(--color-surface)] hover:bg-[var(--color-surface-raised)] border-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-secondary)] text-xs cursor-pointer transition-colors';

export default function App() {
  const v = useVault();
  const [activeTab, setActiveTab] = useState<Tab>('site');
  const [viewState, setViewState] = useState<ViewState>({ view: 'tabs' });
  const goTabs = useCallback(() => setViewState({ view: 'tabs' }), []);

  function handleSaveOrDelete() { goTabs(); v.handleSaveOrDelete(); }
  async function handleLock() { await v.handleLock(); setViewState({ view: 'tabs' }); }

  if (v.loading) return <div className="flex items-center justify-center h-[200px] text-[var(--color-text-tertiary)] text-sm">Loading...</div>;
  if (!v.apiConfigured) return <SetupView onComplete={() => v.setApiConfigured(true)} />;
  if (!v.unlocked) return <LockedView onUnlock={() => v.setUnlocked(true)} />;

  if (viewState.view === 'detail') return <Shell><ItemDetailView item={viewState.item} folders={v.folders} onEdit={() => setViewState({ view: 'edit', item: viewState.item })} onDelete={handleSaveOrDelete} onBack={goTabs} onHistory={() => setViewState({ view: 'history', item: viewState.item })} /></Shell>;
  if (viewState.view === 'add') return <Shell><AddEditView editItem={null} folders={v.folders} onSave={handleSaveOrDelete} onCancel={goTabs} /></Shell>;
  if (viewState.view === 'edit') return <Shell><AddEditView editItem={viewState.item} folders={v.folders} onSave={handleSaveOrDelete} onCancel={() => setViewState({ view: 'detail', item: viewState.item })} /></Shell>;
  if (viewState.view === 'health') return <Shell><HealthSummaryView onBack={goTabs} filterBreached={'filterBreached' in viewState ? viewState.filterBreached : undefined} allItems={v.allItems} /></Shell>;
  if (viewState.view === 'trash') return <Shell><TrashView onBack={goTabs} /></Shell>;
  if (viewState.view === 'settings') return <Shell><SettingsView onBack={goTabs} /></Shell>;
  if (viewState.view === 'history') return <Shell><VersionHistoryView item={viewState.item} onBack={() => setViewState({ view: 'detail', item: viewState.item })} /></Shell>;

  const hc = v.healthScore === null ? 'border-[var(--color-border)] text-[var(--color-text-tertiary)]'
    : v.healthScore < 40 ? 'border-[var(--color-error)] text-[var(--color-error)]'
    : v.healthScore < 70 ? 'border-[var(--color-warning)] text-[var(--color-warning)]'
    : v.healthScore < 90 ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
    : 'border-[var(--color-success)] text-[var(--color-success)]';
  const sc = v.securityScore !== null && v.securityScore >= 80 ? 'bg-[var(--color-success-subtle)] text-[var(--color-success)]'
    : v.securityScore !== null && v.securityScore >= 50 ? 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'
    : 'bg-[var(--color-error-subtle)] text-[var(--color-error)]';

  return (
    <Shell>
      <div className="flex justify-between items-center px-3 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-aura-dim)]">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-[var(--color-text)]">🔐 Lockbox</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={`w-6 h-6 rounded-[var(--radius-full)] flex items-center justify-center border-2 text-[10px] font-bold bg-transparent cursor-pointer hover:opacity-80 transition-opacity ${hc}`}
              aria-label={`Open vault health. Score: ${v.healthScore ?? 'not analyzed'}`}
              onClick={() => setViewState({ view: 'health' })}
            >
              {v.healthScore ?? '-'}
            </button>
            {v.breachedCount > 0 && (
              <button
                type="button"
                className="bg-[var(--color-error)] text-white border-0 text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-full)] cursor-pointer hover:opacity-80 transition-opacity"
                aria-label={`Show ${v.breachedCount} breached ${v.breachedCount === 1 ? 'password' : 'passwords'}`}
                onClick={() => setViewState({ view: 'health', filterBreached: true })}
              >
                {v.breachedCount}
              </button>
            )}
          </div>
          {v.securityScore !== null && <span aria-label={`Site security score: ${v.securityScore}`} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-[var(--radius-full)] ${sc}`}>{v.securityScore}</span>}
        </div>
        <div className="flex items-center gap-1">
          {toolbarButtons.map((b) => <button type="button" key={b.view} onClick={() => setViewState({ view: b.view } as ViewState)} title={b.title} aria-label={b.title} className={btnCls}>{b.icon}</button>)}
          <button type="button" onClick={handleLock} title="Lock vault" className="bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-raised)] border-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text)] text-xs cursor-pointer transition-colors">Lock</button>
        </div>
      </div>
      {v.phishingWarning?.result && (
        <div role="alert" className="px-3 py-2 bg-[var(--color-error-subtle)] border-b border-[var(--color-error)] flex items-center gap-2">
          <span aria-hidden="true" className="text-sm">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[var(--color-error)]">Phishing Risk ({Math.round((v.phishingWarning.result.score ?? 0) * 100)}%)</div>
            <div className="text-[10px] text-[var(--color-error)] truncate">{v.phishingWarning.result.reasons?.[0] ?? 'Suspicious site'}</div>
          </div>
          <button type="button" aria-label="Dismiss phishing warning" onClick={() => v.setPhishingWarning(null)} className="text-[var(--color-error)] hover:text-[var(--color-error)] text-xs bg-transparent border-0 cursor-pointer p-1">✕</button>
        </div>
      )}
      <div role="tablist" aria-label="Vault views" className="flex border-b border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
        {tabDefs.map((t) => <button type="button" role="tab" id={`lockbox-tab-${t.id}`} aria-controls={`lockbox-tabpanel-${t.id}`} aria-selected={activeTab === t.id} key={t.id} onClick={() => setActiveTab(t.id)} className={`flex-1 py-2.5 text-xs border-0 bg-transparent cursor-pointer transition-colors ${activeTab === t.id ? 'border-b-2 border-[var(--color-primary)] text-[var(--color-primary)] font-semibold' : 'border-b-2 border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text)]'}`}>{t.label}</button>)}
      </div>
      <div role="tabpanel" id={`lockbox-tabpanel-${activeTab}`} aria-labelledby={`lockbox-tab-${activeTab}`} className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'site' && <SiteTab items={v.siteItems} />}
        {activeTab === 'shared' && <SharedTab sharedItems={v.sharedItems} sharedFolders={v.sharedFolders} hasKeyPair={v.hasKeyPair} onSelectItem={(item) => setViewState({ view: 'detail', item })} />}
        {activeTab === 'vault' && <VaultTab items={v.allItems} folders={v.folders} onSelectItem={(item) => setViewState({ view: 'detail', item })} onAddItem={() => setViewState({ view: 'add' })} rotationMap={v.rotationMap} attachmentCounts={v.attachmentCounts} />}
        {activeTab === 'generator' && <GeneratorTab />}
        {activeTab === 'totp' && <TotpTab items={v.allItems} />}
      </div>
    </Shell>
  );
}
