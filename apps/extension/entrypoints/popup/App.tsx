import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Icon, type IconName } from '@lockbox/design';
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

type MoreSection = 'menu' | 'shared' | 'generator' | 'totp';

const tabs: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'site', label: 'Site', icon: 'world' },
  { id: 'vault', label: 'Vault', icon: 'shield-lock' },
  { id: 'more', label: 'More', icon: 'menu-2' },
];

const Shell = ({ children }: { children: ReactNode }) => <div className="extension-shell">{children}</div>;

function MoreHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="extension-subheader">
      <button type="button" className="lb-icon-button" onClick={onBack} aria-label="Back to More">
        <Icon name="arrow-left" size={19} />
      </button>
      <strong>{title}</strong>
    </div>
  );
}

function MoreMenu({
  breachedCount,
  onSection,
  onView,
}: {
  breachedCount: number;
  onSection: (section: MoreSection) => void;
  onView: (state: ViewState) => void;
}) {
  const item = (
    label: string,
    description: string,
    icon: IconName,
    action: () => void,
    end?: ReactNode
  ) => (
    <button type="button" className="extension-more__item" onClick={action}>
      <span className="extension-more__icon"><Icon name={icon} size={19} /></span>
      <span><strong>{label}</strong><small>{description}</small></span>
      {end ?? <Icon name="chevron-right" size={18} />}
    </button>
  );

  return (
    <div className="extension-more">
      <div className="extension-section-heading">
        <span>Tools and account</span>
        <small>Everything beyond this site and your vault</small>
      </div>
      {item('Shared items', 'Items shared through teams', 'users', () => onSection('shared'))}
      {item('Generator', 'Create a password or passphrase', 'wand', () => onSection('generator'))}
      {item('Authenticator codes', 'View and copy time-based codes', 'key', () => onSection('totp'))}
      {item(
        'Security',
        breachedCount > 0 ? `${breachedCount} ${breachedCount === 1 ? 'item needs' : 'items need'} attention` : 'Review password health',
        'shield-check',
        () => onView({ view: 'health' }),
        breachedCount > 0 ? <Badge variant="error">{breachedCount}</Badge> : undefined
      )}
      {item('Settings', 'Server, sync, and preferences', 'settings', () => onView({ view: 'settings' }))}
      {item('Trash', 'Review recently deleted items', 'trash', () => onView({ view: 'trash' }))}
    </div>
  );
}

export default function App() {
  const vault = useVault();
  const [activeTab, setActiveTab] = useState<Tab>('site');
  const [moreSection, setMoreSection] = useState<MoreSection>('menu');
  const [viewState, setViewState] = useState<ViewState>({ view: 'tabs' });
  const goTabs = useCallback(() => setViewState({ view: 'tabs' }), []);

  function handleSaveOrDelete() {
    goTabs();
    vault.handleSaveOrDelete();
  }

  async function handleLock() {
    await vault.handleLock();
    setViewState({ view: 'tabs' });
  }

  function selectTab(tab: Tab) {
    setActiveTab(tab);
    if (tab !== 'more') setMoreSection('menu');
  }

  if (vault.loading) {
    return (
      <div className="extension-loading" role="status">
        <Icon name="loader-2" size={24} />
        <span>Opening Lockbox…</span>
      </div>
    );
  }
  if (!vault.apiConfigured) return <SetupView onComplete={() => vault.setApiConfigured(true)} />;
  if (!vault.unlocked) {
    return (
      <LockedView
        onUnlock={() => vault.setUnlocked(true)}
        onServerReset={() => vault.setApiConfigured(false)}
      />
    );
  }

  if (viewState.view === 'detail') return <Shell><ItemDetailView item={viewState.item} folders={vault.folders} onEdit={() => setViewState({ view: 'edit', item: viewState.item })} onDelete={handleSaveOrDelete} onBack={goTabs} onHistory={() => setViewState({ view: 'history', item: viewState.item })} /></Shell>;
  if (viewState.view === 'add') return <Shell><AddEditView editItem={null} folders={vault.folders} onSave={handleSaveOrDelete} onCancel={goTabs} /></Shell>;
  if (viewState.view === 'edit') return <Shell><AddEditView editItem={viewState.item} folders={vault.folders} onSave={handleSaveOrDelete} onCancel={() => setViewState({ view: 'detail', item: viewState.item })} /></Shell>;
  if (viewState.view === 'health') return <Shell><HealthSummaryView onBack={goTabs} filterBreached={'filterBreached' in viewState ? viewState.filterBreached : undefined} allItems={vault.allItems} /></Shell>;
  if (viewState.view === 'trash') return <Shell><TrashView onBack={goTabs} /></Shell>;
  if (viewState.view === 'settings') return <Shell><SettingsView onBack={goTabs} /></Shell>;
  if (viewState.view === 'history') return <Shell><VersionHistoryView item={viewState.item} onBack={() => setViewState({ view: 'detail', item: viewState.item })} /></Shell>;

  return (
    <Shell>
      <header className="extension-header">
        <div className="extension-brand">
          <img src="/brand/lockbox-logo-horizontal.png" alt="Lockbox" />
        </div>
        <div className="extension-header__actions">
          <span className="extension-open-status"><Icon name="circle-check" size={15} /> Open</span>
          <button type="button" className="lb-icon-button" onClick={() => void handleLock()} aria-label="Lock vault" title="Lock vault">
            <Icon name="lock" size={19} />
          </button>
        </div>
      </header>

      {vault.phishingWarning?.result && (
        <div role="alert" className="extension-warning">
          <Icon name="alert-triangle" size={19} />
          <div><strong>This page may be unsafe</strong><span>{vault.phishingWarning.result.reasons?.[0] ?? 'The page has suspicious characteristics.'}</span></div>
          <button type="button" className="lb-icon-button" aria-label="Dismiss warning" onClick={() => vault.setPhishingWarning(null)}><Icon name="x" size={18} /></button>
        </div>
      )}

      <div
        role="tabpanel"
        id={`lockbox-tabpanel-${activeTab}`}
        aria-labelledby={`lockbox-tab-${activeTab}`}
        className="extension-content"
      >
        {activeTab === 'site' && <SiteTab items={vault.siteItems} siteHost={vault.siteHost} onOpenVault={() => selectTab('vault')} />}
        {activeTab === 'vault' && <VaultTab items={vault.allItems} folders={vault.folders} onSelectItem={(item) => setViewState({ view: 'detail', item })} onAddItem={() => setViewState({ view: 'add' })} rotationMap={vault.rotationMap} attachmentCounts={vault.attachmentCounts} />}
        {activeTab === 'more' && moreSection === 'menu' && <MoreMenu breachedCount={vault.breachedCount} onSection={setMoreSection} onView={setViewState} />}
        {activeTab === 'more' && moreSection === 'shared' && <><MoreHeader title="Shared items" onBack={() => setMoreSection('menu')} /><SharedTab sharedItems={vault.sharedItems} sharedFolders={vault.sharedFolders} hasKeyPair={vault.hasKeyPair} onSelectItem={(item) => setViewState({ view: 'detail', item })} /></>}
        {activeTab === 'more' && moreSection === 'generator' && <><MoreHeader title="Generator" onBack={() => setMoreSection('menu')} /><GeneratorTab /></>}
        {activeTab === 'more' && moreSection === 'totp' && <><MoreHeader title="Authenticator codes" onBack={() => setMoreSection('menu')} /><TotpTab items={vault.allItems} onAddItem={() => setViewState({ view: 'add' })} /></>}
      </div>

      <nav role="tablist" aria-label="Lockbox views" className="extension-tabs">
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`lockbox-tab-${tab.id}`}
            aria-controls={`lockbox-tabpanel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            key={tab.id}
            onClick={() => selectTab(tab.id)}
          >
            <Icon name={tab.icon} size={20} />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>
    </Shell>
  );
}
