import {
  detectForms,
  detectIdentityForms,
  detectOtpFields,
  detectStandaloneUsernameFields,
  getOpenShadowRoots,
  isEligibleField,
  type DetectedForm,
  type DetectedIdentityForm,
} from './form-detector.js';
import { createLockIconOverlay, type LockIconOverlayHandle } from './autofill.js';

export interface AutofillOverlayCallbacks {
  onLogin: (form: DetectedForm) => void | Promise<void>;
  onUsername: (field: HTMLInputElement) => void | Promise<void>;
  onIdentity: (form: DetectedIdentityForm) => void | Promise<void>;
  onOtp: (field: HTMLInputElement) => void | Promise<void>;
}

export interface AutofillOverlayControllerOptions {
  enabled?: boolean;
}

function isAuthwellUiNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.matches('[data-authwell-ui]') || element?.closest('[data-authwell-ui]'));
}

function onlyAuthwellUiMutations(records: MutationRecord[]): boolean {
  return records.every((record) => {
    if (record.type === 'attributes') return isAuthwellUiNode(record.target);
    const changedNodes = [...record.addedNodes, ...record.removedNodes];
    return changedNodes.length > 0 && changedNodes.every(isAuthwellUiNode);
  });
}

/**
 * Owns every inline autofill control on a page.
 *
 * A single observer reconciles additions, removals, and semantic attribute
 * changes. Activation resolves the form again at click time, so SPA node reuse
 * cannot retain a stale username/password pairing.
 */
export class AutofillOverlayController {
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window;
  private readonly callbacks: AutofillOverlayCallbacks;
  private readonly overlays = new Map<HTMLInputElement, LockIconOverlayHandle>();
  private readonly mutationObserver: MutationObserver;
  private readonly resizeObserver: ResizeObserver | null;
  private enabled: boolean;
  private started = false;
  private reconcileFrame: number | null = null;
  private positionFrame: number | null = null;

  constructor(
    ownerDocument: Document,
    callbacks: AutofillOverlayCallbacks,
    options: AutofillOverlayControllerOptions = {}
  ) {
    this.ownerDocument = ownerDocument;
    this.ownerWindow = ownerDocument.defaultView ?? window;
    this.callbacks = callbacks;
    this.enabled = options.enabled ?? true;
    this.mutationObserver = new MutationObserver((records) => {
      if (!onlyAuthwellUiMutations(records)) this.scheduleReconcile();
    });
    this.resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => this.schedulePosition());
  }

  start(): void {
    if (this.started || !this.ownerDocument.body) return;
    this.started = true;
    this.refreshObservedRoots();
    this.ownerWindow.addEventListener('resize', this.schedulePosition, { passive: true });
    this.ownerWindow.addEventListener('scroll', this.schedulePosition, {
      capture: true,
      passive: true,
    });
    this.ownerDocument.addEventListener('focusin', this.scheduleReconcile, true);
    if (this.enabled) this.reconcileNow();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled) this.scheduleReconcile();
    else {
      if (this.reconcileFrame !== null) this.cancelFrame(this.reconcileFrame);
      if (this.positionFrame !== null) this.cancelFrame(this.positionFrame);
      this.reconcileFrame = null;
      this.positionFrame = null;
      this.clearOverlays();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  get overlayCount(): number {
    return this.overlays.size;
  }

  getOverlayHost(field: HTMLInputElement): HTMLElement | null {
    return this.overlays.get(field)?.host ?? null;
  }

  reconcileNow(): void {
    this.reconcileFrame = null;
    if (!this.enabled || !this.ownerDocument.body) {
      this.clearOverlays();
      return;
    }

    this.refreshObservedRoots();

    const desiredFields = new Set<HTMLInputElement>();

    for (const form of detectForms(this.ownerDocument)) {
      if (form.passwordPurpose === 'new') continue;
      desiredFields.add(form.passwordField);
      if (form.usernameField) desiredFields.add(form.usernameField);
    }

    for (const field of detectStandaloneUsernameFields(this.ownerDocument)) {
      desiredFields.add(field);
    }

    for (const form of detectIdentityForms(this.ownerDocument)) {
      const firstField = Object.values(form.fields)[0];
      if (firstField) desiredFields.add(firstField);
    }

    for (const field of detectOtpFields(this.ownerDocument)) desiredFields.add(field);

    for (const [field, overlay] of this.overlays) {
      if (!desiredFields.has(field) || !field.isConnected || !isEligibleField(field)) {
        this.resizeObserver?.unobserve(field);
        overlay.destroy();
        this.overlays.delete(field);
      }
    }

    for (const field of desiredFields) {
      if (!field.isConnected || !isEligibleField(field)) continue;
      const current = this.overlays.get(field);
      if (current) {
        current.reposition();
        continue;
      }

      const overlay = createLockIconOverlay(field, () => {
        void this.activate(field).catch(() => {});
      });
      this.overlays.set(field, overlay);
      this.resizeObserver?.observe(field);
    }
  }

  destroy(): void {
    this.started = false;
    this.mutationObserver.disconnect();
    this.resizeObserver?.disconnect();
    this.ownerWindow.removeEventListener('resize', this.schedulePosition);
    this.ownerWindow.removeEventListener('scroll', this.schedulePosition, true);
    this.ownerDocument.removeEventListener('focusin', this.scheduleReconcile, true);
    if (this.reconcileFrame !== null) this.cancelFrame(this.reconcileFrame);
    if (this.positionFrame !== null) this.cancelFrame(this.positionFrame);
    this.reconcileFrame = null;
    this.positionFrame = null;
    this.clearOverlays();
  }

  private readonly scheduleReconcile = (): void => {
    if (!this.enabled || this.reconcileFrame !== null) return;
    this.reconcileFrame = this.requestFrame(() => this.reconcileNow());
  };

  private readonly schedulePosition = (): void => {
    if (this.positionFrame !== null || this.overlays.size === 0) return;
    this.positionFrame = this.requestFrame(() => {
      this.positionFrame = null;
      for (const overlay of this.overlays.values()) overlay.reposition();
    });
  };

  private async activate(field: HTMLInputElement): Promise<void> {
    if (!field.isConnected || !isEligibleField(field)) {
      this.scheduleReconcile();
      return;
    }

    const loginForm = detectForms(this.ownerDocument).find(
      (form) =>
        form.passwordPurpose !== 'new' &&
        (form.passwordField === field || form.usernameField === field)
    );
    if (loginForm) {
      await this.callbacks.onLogin(loginForm);
      return;
    }

    if (detectOtpFields(this.ownerDocument).includes(field)) {
      await this.callbacks.onOtp(field);
      return;
    }

    if (detectStandaloneUsernameFields(this.ownerDocument).includes(field)) {
      await this.callbacks.onUsername(field);
      return;
    }

    const identityForm = detectIdentityForms(this.ownerDocument).find((form) =>
      Object.values(form.fields).includes(field)
    );
    if (identityForm) await this.callbacks.onIdentity(identityForm);
  }

  private clearOverlays(): void {
    for (const overlay of this.overlays.values()) overlay.destroy();
    this.overlays.clear();
  }

  private refreshObservedRoots(): void {
    if (!this.started || !this.ownerDocument.body) return;
    const options: MutationObserverInit = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        'aria-hidden',
        'aria-label',
        'autocomplete',
        'class',
        'disabled',
        'hidden',
        'id',
        'inert',
        'name',
        'readonly',
        'style',
        'type',
      ],
    };

    this.mutationObserver.disconnect();
    this.mutationObserver.observe(this.ownerDocument.body, options);
    for (const shadowRoot of getOpenShadowRoots(this.ownerDocument)) {
      this.mutationObserver.observe(shadowRoot, options);
    }
  }

  private requestFrame(callback: FrameRequestCallback): number {
    if (typeof this.ownerWindow.requestAnimationFrame === 'function') {
      return this.ownerWindow.requestAnimationFrame(callback);
    }
    return this.ownerWindow.setTimeout(() => callback(this.ownerWindow.performance.now()), 16);
  }

  private cancelFrame(frame: number): void {
    if (typeof this.ownerWindow.cancelAnimationFrame === 'function') {
      this.ownerWindow.cancelAnimationFrame(frame);
    } else {
      this.ownerWindow.clearTimeout(frame);
    }
  }
}
