import { useState, useEffect, useCallback } from 'react';
import type { VaultItem, LoginItem, Folder, VaultHealthSummary } from '@lockbox/types';
import { SecurityCopilot, LifecycleTracker } from '@lockbox/ai';
import { getApiBaseUrl } from '../../../lib/storage.js';
import { sendMessage } from './shared.js';

type SFE = { folderId: string; teamId: string; folderName: string; permissionLevel: string };

function matchSharedByHostname(sharedArr: VaultItem[], hostname: string): VaultItem[] {
  return sharedArr.filter((item) => {
    if (item.type !== 'login') return false;
    return ((item as LoginItem).uris || []).some((u) => {
      try {
        return new URL(u.startsWith('http') ? u : `https://${u}`).hostname === hostname;
      } catch {
        return u.includes(hostname);
      }
    });
  });
}

export function useVault() {
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [allItems, setAllItems] = useState<VaultItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [siteItems, setSiteItems] = useState<VaultItem[]>([]);
  const [sharedItems, setSharedItems] = useState<VaultItem[]>([]);
  const [sharedFolders, setSharedFolders] = useState<SFE[]>([]);
  const [hasKeyPair, setHasKeyPair] = useState(false);
  const [loading, setLoading] = useState(true);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [breachedCount, setBreachedCount] = useState<number>(0);
  const [phishingWarning, setPhishingWarning] = useState<{
    url: string;
    result: { safe: boolean; score: number; reasons: string[] };
  } | null>(null);
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, number>>(new Map());
  const [securityScore, setSecurityScore] = useState<number | null>(null);
  const [rotationMap, setRotationMap] = useState<Map<string, 'overdue' | 'due-soon'>>(new Map());

  useEffect(() => {
    getApiBaseUrl()
      .then((url) => {
        if (!url) {
          setApiConfigured(false);
          setLoading(false);
          return;
        }
        setApiConfigured(true);
        return sendMessage<{ unlocked: boolean }>({ type: 'is-unlocked' })
          .then(({ unlocked: u }) => setUnlocked(u))
          .finally(() => setLoading(false));
      })
      .catch(() => setLoading(false));
  }, []);

  function refreshSiteMatches() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url;
      if (!url) return;
      sendMessage<{ items: VaultItem[] }>({ type: 'get-matches', url })
        .then(async ({ items }) => {
          try {
            const { items: sr } = await sendMessage<{ items: Record<string, VaultItem> }>({
              type: 'get-shared-items',
            });
            let h = '';
            try {
              h = new URL(url).hostname;
            } catch {}
            setSiteItems([...items, ...matchSharedByHostname(Object.values(sr || {}), h)]);
          } catch {
            setSiteItems(items);
          }
        })
        .catch(console.error);
    });
  }

  const loadVault = useCallback(() => {
    if (!unlocked) return;
    Promise.all([
      sendMessage<{ items: Record<string, VaultItem> }>({ type: 'get-shared-items' }),
      sendMessage<{ sharedFolders: SFE[] }>({ type: 'get-shared-folders' }),
      sendMessage<{ hasKeyPair: boolean }>({ type: 'has-keypair' }),
    ])
      .then(([ir, fr, kr]) => {
        setSharedItems(Object.values(ir.items || {}));
        setSharedFolders(fr.sharedFolders || []);
        setHasKeyPair(kr.hasKeyPair);
      })
      .catch((e) => console.error('Failed to load shared items:', e));

    sendMessage<{ items: VaultItem[]; folders: Folder[] }>({ type: 'get-vault' })
      .then(async ({ items, folders: f }) => {
        setAllItems(items);
        setFolders(f ?? []);
        Promise.all(
          items.map((it) =>
            sendMessage<{ success: boolean; attachments?: Array<{ id: string }> }>({
              type: 'get-attachments',
              itemId: it.id,
            })
              .then(
                (r) => [it.id, r.success ? (r.attachments?.length ?? 0) : 0] as [string, number]
              )
              .catch(() => [it.id, 0] as [string, number])
          )
        ).then((c) => {
          const m = new Map<string, number>();
          for (const [id, n] of c) {
            if (n > 0) m.set(id, n);
          }
          setAttachmentCounts(m);
        });
        sendMessage<{ success: boolean; summary?: VaultHealthSummary }>({
          type: 'run-health-analysis',
        }).then((r) => {
          if (r.success && r.summary) setHealthScore(r.summary.overallScore);
        });
        sendMessage<{ success: boolean; breachedCount?: number }>({
          type: 'get-breach-status',
        }).then((r) => {
          if (r.success && r.breachedCount !== undefined) setBreachedCount(r.breachedCount);
        });
        try {
          const logins = items.filter((i) => i.type === 'login') as LoginItem[];
          const due = new LifecycleTracker().getDueItems(logins);
          const rm = new Map<string, 'overdue' | 'due-soon'>();
          for (const s of due) {
            if (s.urgency === 'overdue' || s.urgency === 'due-soon') rm.set(s.itemId, s.urgency);
          }
          setRotationMap(rm);
          const p = await new SecurityCopilot().evaluate(logins, {});
          if (p?.score !== undefined) setSecurityScore(p.score);
        } catch (e) {
          console.error('Failed to run AI features:', e);
        }
      })
      .catch(console.error);
  }, [unlocked]);

  useEffect(() => {
    if (unlocked) {
      loadVault();
      refreshSiteMatches();
    }
  }, [unlocked, loadVault]);

  useEffect(() => {
    if (!unlocked) return;
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (!tabs[0]?.id) return;
      const s = await sendMessage<{
        url: string;
        result: { safe: boolean; score: number; reasons: string[] };
      } | null>({ type: 'get-phishing-status', tabId: tabs[0].id });
      if (s) setPhishingWarning(s);
    });
  }, [unlocked]);

  async function handleLock() {
    await sendMessage({ type: 'lock' });
    setUnlocked(false);
    setAllItems([]);
    setFolders([]);
    setSiteItems([]);
  }

  function handleSaveOrDelete() {
    loadVault();
    refreshSiteMatches();
  }

  return {
    apiConfigured,
    setApiConfigured,
    unlocked,
    setUnlocked,
    loading,
    allItems,
    folders,
    siteItems,
    sharedItems,
    sharedFolders,
    hasKeyPair,
    healthScore,
    breachedCount,
    phishingWarning,
    setPhishingWarning,
    attachmentCounts,
    securityScore,
    rotationMap,
    loadVault,
    handleLock,
    handleSaveOrDelete,
  };
}
