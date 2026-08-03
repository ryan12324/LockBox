import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Icon } from '@lockbox/design';
import type { LoginItem, VaultItem } from '@lockbox/types';
import { api } from '../lib/api.js';
import { encryptVaultItem } from '../lib/crypto.js';
import {
  deriveNativeCredentialSaveAuthorization,
  exportPendingNativeTotpSetup,
  getPendingNativeTotpSetups,
  markNativeTotpSetupHandled,
} from '../lib/native-autofill.js';
import {
  parseNativeTotpSetupUri,
  totpSetupFingerprint,
  type NativeTotpProposal,
} from '../lib/native-totp-setup.js';
import { useToast } from '../providers/ToastProvider.js';

interface Props {
  accountId: string;
  token: string;
  userKey: Uint8Array;
  items: VaultItem[];
  onComplete(): void;
}

interface Review {
  id: string;
  authorization: string;
  proposals: NativeTotpProposal[];
}

export default function NativeTotpSetupPrompt({
  accountId,
  token,
  userKey,
  items,
  onComplete,
}: Props) {
  const { toast } = useToast();
  const [review, setReview] = useState<Review | null>(null);
  const reviewLoaded = useRef(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (reviewLoaded.current) return;
    try {
      setError('');
      const [pending, authorization] = await Promise.all([
        getPendingNativeTotpSetups(),
        deriveNativeCredentialSaveAuthorization(userKey, accountId),
      ]);
      if (!pending[0]) return;
      const exported = await exportPendingNativeTotpSetup(pending[0].id, authorization);
      const nextReview = {
        id: exported.id,
        authorization,
        proposals: [],
      };
      reviewLoaded.current = true;
      setReview(nextReview);
      setReview({ ...nextReview, proposals: parseNativeTotpSetupUri(exported.uri) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification-code setup could not be opened');
    }
  }, [accountId, userKey]);

  useEffect(() => {
    const retryAfterIndexRefresh = () => void load();
    void load();
    window.addEventListener('authwell:native-autofill-updated', retryAfterIndexRefresh);
    return () => window.removeEventListener(
      'authwell:native-autofill-updated',
      retryAfterIndexRefresh
    );
  }, [load]);

  if (!review && !error) return null;

  async function dismiss() {
    if (!review) return setError('');
    setWorking(true);
    try {
      await markNativeTotpSetupHandled(review.id, review.authorization);
      reviewLoaded.current = false;
      setReview(null);
      setError('');
      void load();
    } catch {
      setError('Authwell could not dismiss this setup request.');
    } finally {
      setWorking(false);
    }
  }

  async function accept() {
    if (!review) return;
    setWorking(true);
    setError('');
    try {
      const workingItems = [...items];
      let changed = 0;
      for (const proposal of review.proposals) {
        const fingerprint = totpSetupFingerprint(proposal.totp);
        if (workingItems.some((item) => {
          if (item.type !== 'login') return false;
          const candidate = (item as LoginItem).totp;
          return candidate !== undefined
            && fingerprint !== null
            && totpSetupFingerprint(candidate) === fingerprint;
        })) continue;
        const matchIndex = workingItems.findIndex((item) => {
          if (item.type !== 'login') return false;
          const login = item as LoginItem;
          return login.username.toLowerCase() === proposal.username.toLowerCase();
        });
        const existing = matchIndex >= 0 ? workingItems[matchIndex] as LoginItem : null;
        const now = new Date().toISOString();
        const item: LoginItem = existing
          ? { ...existing, totp: proposal.totp, updatedAt: now, revisionDate: now }
          : {
              id: crypto.randomUUID(),
              type: 'login',
              name: proposal.name,
              username: proposal.username,
              password: '',
              uris: proposal.suggestedUri ? [proposal.suggestedUri] : [],
              totp: proposal.totp,
              tags: [],
              favorite: false,
              createdAt: now,
              updatedAt: now,
              revisionDate: now,
            };
        const encryptedData = await encryptVaultItem(item, userKey, item.id, item.revisionDate);
        if (existing) {
          await api.vault.updateItem(item.id, {
            encryptedData,
            folderId: item.folderId,
            tags: item.tags,
            favorite: item.favorite,
            revisionDate: item.revisionDate,
            expectedRevisionDate: existing.revisionDate,
          }, token);
          workingItems[matchIndex] = item;
        } else {
          await api.vault.createItem({
            id: item.id,
            type: item.type,
            encryptedData,
            tags: item.tags,
            favorite: item.favorite,
            revisionDate: item.revisionDate,
          }, token);
          workingItems.push(item);
        }
        changed += 1;
      }
      await markNativeTotpSetupHandled(review.id, review.authorization);
      toast(
        changed === 0
          ? 'Those verification codes are already in your encrypted vault.'
          : `${changed} verification ${changed === 1 ? 'code was' : 'codes were'} added to your encrypted vault.`,
        'success'
      );
      reviewLoaded.current = false;
      setReview(null);
      onComplete();
      void load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Verification codes could not be saved');
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="native-totp-review" aria-labelledby="native-totp-review-title">
      <span className="native-autofill-setup__mark" aria-hidden="true">
        <Icon name="shield-lock" size={21} />
      </span>
      <div className="native-autofill-setup__body">
        <strong id="native-totp-review-title">Add verification {review?.proposals.length === 1 ? 'code' : 'codes'}?</strong>
        {review && (
          <ul className="native-totp-review__accounts">
            {review.proposals.map((proposal, index) => (
              <li key={`${proposal.name}\u0000${proposal.username}\u0000${index}`}>
                <span>{proposal.name}</span>
                <small>{proposal.username}</small>
              </li>
            ))}
          </ul>
        )}
        <p>Authwell will encrypt the accepted keys in your vault and offer current codes through iOS AutoFill.</p>
        {error && <p className="native-autofill-setup__error" role="alert">{error}</p>}
      </div>
      <div className="native-autofill-setup__actions">
        {review && review.proposals.length > 0 && (
          <Button size="sm" onClick={() => void accept()} loading={working}>Add securely</Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void dismiss()} disabled={working}>Cancel</Button>
      </div>
    </section>
  );
}
