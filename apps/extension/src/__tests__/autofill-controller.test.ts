// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutofillOverlayController } from '../../lib/autofill-controller.js';

function createController(enabled = true): AutofillOverlayController {
  return new AutofillOverlayController(
    document,
    {
      onLogin: vi.fn(),
      onUsername: vi.fn(),
      onIdentity: vi.fn(),
      onOtp: vi.fn(),
      onGeneratePassword: vi.fn(),
    },
    { enabled }
  );
}

async function settleMutations(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 30));
}

describe('AutofillOverlayController', () => {
  let controller: AutofillOverlayController | null = null;

  beforeEach(() => {
    document.body.replaceChildren();
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
    document.body.replaceChildren();
  });

  it('adds and removes controls as an SPA mounts and unmounts a login form', async () => {
    controller = createController();
    controller.start();
    expect(controller.overlayCount).toBe(0);

    const panel = document.createElement('section');
    panel.innerHTML = `
      <form>
        <input autocomplete="username" />
        <input type="password" autocomplete="current-password" />
      </form>
    `;
    document.body.appendChild(panel);
    await settleMutations();
    expect(controller.overlayCount).toBe(2);

    panel.remove();
    await settleMutations();
    expect(controller.overlayCount).toBe(0);
    expect(document.querySelectorAll('[data-authwell-ui="field-control"]')).toHaveLength(0);
  });

  it('reacts to semantic type changes without requiring a child insertion', async () => {
    document.body.innerHTML = `
      <form>
        <input autocomplete="username" />
        <input name="secret" />
      </form>
    `;
    const secret = document.querySelector<HTMLInputElement>('[name="secret"]')!;
    controller = createController();
    controller.start();
    expect(controller.overlayCount).toBe(1);

    secret.type = 'password';
    await settleMutations();
    expect(controller.overlayCount).toBe(2);

    secret.disabled = true;
    await settleMutations();
    expect(controller.overlayCount).toBe(1);

    secret.disabled = false;
    await settleMutations();
    expect(controller.overlayCount).toBe(2);

    secret.form!.setAttribute('inert', '');
    await settleMutations();
    expect(controller.overlayCount).toBe(0);
  });

  it('keeps the same control when a show-password add-on reveals the password', async () => {
    document.body.innerHTML = `
      <form>
        <input autocomplete="username" />
        <span>
          <input type="password" name="password" />
          <button type="button" aria-label="Show password">Show</button>
        </span>
      </form>
    `;
    const password = document.querySelector<HTMLInputElement>('[name="password"]')!;
    controller = createController();
    controller.start();
    const originalHost = controller.getOverlayHost(password);
    expect(originalHost).not.toBeNull();

    password.type = 'text';
    document.querySelector('button')!.setAttribute('aria-label', 'Hide password');
    await settleMutations();

    expect(controller.getOverlayHost(password)).toBe(originalHost);
    expect(controller.overlayCount).toBe(2);
  });

  it('observes dynamic forms inside an open shadow root', async () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.appendChild(host);
    controller = createController();
    controller.start();

    shadow.innerHTML = `
      <form>
        <input autocomplete="username" />
        <input type="password" autocomplete="current-password" />
      </form>
    `;
    await settleMutations();
    expect(controller.overlayCount).toBe(2);

    shadow.querySelector('form')!.remove();
    await settleMutations();
    expect(controller.overlayCount).toBe(0);
  });

  it('places one generation control on the primary new-password field', () => {
    document.body.innerHTML = `
      <form>
        <input autocomplete="username" />
        <input name="new-password" type="password" autocomplete="new-password" />
        <input name="confirm-password" type="password" autocomplete="new-password" />
      </form>
    `;
    controller = createController();
    controller.start();
    const primary = document.querySelector<HTMLInputElement>('[name="new-password"]')!;
    const confirmation = document.querySelector<HTMLInputElement>('[name="confirm-password"]')!;
    expect(controller.overlayCount).toBe(1);
    expect(controller.getOverlayHost(primary)).not.toBeNull();
    expect(controller.getOverlayHost(confirmation)).toBeNull();
  });

  it('offers a login on a username-only step but not a verification-code step', () => {
    document.body.innerHTML = `
      <form id="username-step">
        <input name="username" autocomplete="username" />
      </form>
      <form id="verification-step">
        <input name="verification-user" autocomplete="username" />
        <input name="code" autocomplete="one-time-code" />
      </form>
    `;
    controller = createController();
    controller.start();

    const username = document.querySelector<HTMLInputElement>('#username-step input')!;
    const verificationUser = document.querySelector<HTMLInputElement>(
      '#verification-step [name="verification-user"]'
    )!;
    const code = document.querySelector<HTMLInputElement>('[name="code"]')!;
    expect(controller.getOverlayHost(username)).not.toBeNull();
    expect(controller.getOverlayHost(verificationUser)).toBeNull();
    expect(controller.getOverlayHost(code)).not.toBeNull();
  });

  it('can be disabled and re-enabled without leaving orphaned controls', async () => {
    document.body.innerHTML = `
      <form>
        <input autocomplete="username" />
        <input type="password" autocomplete="current-password" />
      </form>
    `;
    controller = createController(false);
    controller.start();
    expect(controller.overlayCount).toBe(0);

    controller.setEnabled(true);
    await settleMutations();
    expect(controller.overlayCount).toBe(2);

    controller.setEnabled(false);
    expect(controller.overlayCount).toBe(0);
    expect(document.querySelectorAll('[data-authwell-ui="field-control"]')).toHaveLength(0);
  });
});
