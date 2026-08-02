"use client";

/* Local brand imagery is intentionally rendered as native assets so the same
 * files and crop behavior ship unchanged through the Cloudflare Pages build. */

import { useEffect, useState } from "react";

const VAULT_URL = "https://vault.authwell.app";
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.authwell.app";
const GITHUB_URL = "https://github.com/ryan12324/LockBox";
const RELEASES_URL = `${GITHUB_URL}/releases/latest`;

type RegistrationState = "checking" | "open" | "closed" | "unavailable";
type PlatformIconName = "web" | "extension" | "android" | "cli";

function PlatformIcon({ name }: { name: PlatformIconName }) {
  return (
    <span className="platform-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {name === "web" && (
          <path d="M4 8h16M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm4-2v4" />
        )}
        {name === "extension" && (
          <path d="M4 7h3a1 1 0 0 0 1-1V5a2 2 0 0 1 4 0v1a1 1 0 0 0 1 1h3a1 1 0 0 1 1 1v3a1 1 0 0 0 1 1h1a2 2 0 0 1 0 4h-1a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-1a2 2 0 0 0-4 0v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a2 2 0 0 0 0-4H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1" />
        )}
        {name === "android" && (
          <path d="M4 10v6m16-6v6M7 9h10v8a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1za5 5 0 0 1 10 0M8 3l1 2m7-2l-1 2M9 18v3m6-3v3" />
        )}
        {name === "cli" && (
          <>
            <path d="m8 9 3 3-3 3m5 0h3" />
            <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </>
        )}
      </svg>
    </span>
  );
}

const platforms = [
  {
    code: "WEB",
    icon: "web",
    name: "Web vault",
    detail: "Manage every vault item from the browser.",
    href: `${VAULT_URL}/login`,
  },
  {
    code: "EXT",
    icon: "extension",
    name: "Browser extensions",
    detail: "Fill, save, and use passkeys in Chrome and Firefox.",
    href: RELEASES_URL,
  },
  {
    code: "AND",
    icon: "android",
    name: "Android",
    detail: "Autofill and Credential Provider support across apps.",
    href: RELEASES_URL,
  },
  {
    code: "CLI",
    icon: "cli",
    name: "Command line",
    detail: "Unlock, search, create, export, and sync from a terminal.",
    href: `${GITHUB_URL}/tree/main/apps/cli`,
  },
] satisfies ReadonlyArray<{
  code: string;
  icon: PlatformIconName;
  name: string;
  detail: string;
  href: string;
}>;

const securityFacts = [
  {
    number: "01",
    title: "Encryption happens on your device",
    copy: "Your master password and decrypted vault contents are never sent to the Authwell server.",
  },
  {
    number: "02",
    title: "The server stores ciphertext",
    copy: "Cloudflare Workers, D1, and R2 handle encrypted vault data, attachments, and sync metadata.",
  },
  {
    number: "03",
    title: "Self-hosting stays first class",
    copy: "Run the same API on infrastructure you control and connect the web, extension, Android, or CLI clients.",
  },
];

function RegistrationAction({ state }: { state: RegistrationState }) {
  if (state === "checking") {
    return (
      <span className="button button-primary button-pending" aria-live="polite">
        Checking registration
      </span>
    );
  }

  const registrationOpen = state === "open";
  return (
    <a
      className="button button-primary"
      href={`${VAULT_URL}/${registrationOpen ? "register" : "login"}`}
    >
      {registrationOpen ? "Create account" : "Open vault"}
    </a>
  );
}

function RegistrationStatus({ state }: { state: RegistrationState }) {
  if (state === "unavailable") return null;

  const labels: Record<RegistrationState, string> = {
    checking: "Checking registration availability",
    open: "Registration is open",
    closed: "Registration is currently closed",
    unavailable: "",
  };

  return (
    <p className="registration-status" data-state={state} aria-live="polite">
      <span aria-hidden="true" />
      {labels[state]}
    </p>
  );
}

export default function Home() {
  const [registration, setRegistration] = useState<RegistrationState>("checking");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 6_000);

    fetch(`${API_URL}/api/auth/registration-status`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Registration status request failed");
        const body = (await response.json()) as { enabled?: unknown };
        if (typeof body.enabled !== "boolean") throw new Error("Registration status is invalid");
        setRegistration(body.enabled ? "open" : "closed");
      })
      .catch(() => setRegistration("unavailable"))
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <main>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-pattern" aria-hidden="true" />
        <img className="hero-mark" src="/brand/authwell-mark.svg" alt="" />

        <header className="site-header shell">
          <a className="brand" href="#top" aria-label="Authwell home">
            <img src="/brand/authwell-logo-horizontal-dark.png?v=authwell-2" alt="Authwell" />
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            <a href="#product">Product</a>
            <a href="#security">Security</a>
            <a href="#platforms">Platforms</a>
            <a href="#self-hosting">Self-hosting</a>
            <a href={GITHUB_URL}>GitHub</a>
          </nav>

          <a className="button button-small button-primary header-action" href={`${VAULT_URL}/login`}>
            Open vault
          </a>

          <details className="mobile-nav">
            <summary aria-label="Open navigation">Menu</summary>
            <nav aria-label="Mobile navigation">
              <a href="#product">Product</a>
              <a href="#security">Security</a>
              <a href="#platforms">Platforms</a>
              <a href="#self-hosting">Self-hosting</a>
              <a href={GITHUB_URL}>GitHub</a>
              <a href={`${VAULT_URL}/login`}>Open vault</a>
            </nav>
          </details>
        </header>

        <div className="hero-content shell" id="top">
          <div className="hero-copy">
            <p className="eyebrow">End-to-end encrypted</p>
            <h1 id="hero-title">
              <span className="hero-line">
                Your passwords<span className="dot dot-indigo">.</span>
              </span>
              <span className="hero-line">
                Your infrastructure<span className="dot dot-aqua">.</span>
              </span>
              <span className="hero-line">
                Your control<span className="dot dot-coral">.</span>
              </span>
            </h1>
            <p className="hero-lead">
              A private vault for every device, with a hosted option when you want it and
              self-hosting when you do not.
            </p>
            <div className="hero-actions">
              <RegistrationAction state={registration} />
              <a className="button button-secondary-on-dark" href="#self-hosting">
                Deploy your own
              </a>
            </div>
            <RegistrationStatus state={registration} />
          </div>
        </div>
      </section>

      <section className="access-section" id="product" aria-labelledby="access-title">
        <div className="shell access-layout">
          <div className="section-intro">
            <p className="eyebrow eyebrow-indigo">Built for control</p>
            <h2 id="access-title">One vault. Every way in.</h2>
            <p>Use the hosted vault in seconds, or run the same code on your own Cloudflare account.</p>
          </div>

          <div className="access-map" aria-label="Authwell platform connections">
            <div className="access-core">
              <img src="/brand/authwell-app-icon.png?v=authwell-2" alt="" />
              <span>Authwell vault</span>
            </div>
            {platforms.map((platform, index) => (
              <a
                className={`access-point access-point-${index + 1}`}
                href={platform.href}
                key={platform.code}
              >
                <PlatformIcon name={platform.icon} />
                <strong>{platform.name}</strong>
              </a>
            ))}
          </div>

          <figure className="vault-preview">
            <figcaption>
              <span className="window-dots" aria-hidden="true"><i /><i /><i /></span>
              Authwell vault preview
            </figcaption>
            <div className="vault-ui">
              <aside>
                <strong>Vault</strong>
                <span className="active">All items</span>
                <span>Favorites</span>
                <span>Logins</span>
                <span>Secure notes</span>
                <span>Payment cards</span>
              </aside>
              <div className="vault-list">
                <div className="vault-list-heading">
                  <strong>All items</strong>
                  <span>Search vault</span>
                </div>
                {[
                  ["G", "Development", "developer@example.com"],
                  ["C", "Cloud services", "admin@example.com"],
                  ["P", "Personal email", "private@example.com"],
                  ["B", "Banking", "••••••••••••"],
                ].map(([letter, name, detail]) => (
                  <div className="vault-row" key={name}>
                    <span>{letter}</span>
                    <p><strong>{name}</strong><small>{detail}</small></p>
                    <i aria-hidden="true">•••</i>
                  </div>
                ))}
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section className="security-section" id="security" aria-labelledby="security-title">
        <div className="shell security-layout">
          <div className="section-intro security-intro">
            <p className="eyebrow">Know where your data lives</p>
            <h2 id="security-title">Security explained without theatre.</h2>
            <p>
              Authwell is designed so the server cannot read your vault. The implementation is open
              for inspection, but it has not yet received an independent security audit.
            </p>
            <a className="text-link" href={`${GITHUB_URL}/blob/main/SECURITY.md`}>
              Read the security model <span aria-hidden="true">→</span>
            </a>
          </div>

          <ol className="security-list">
            {securityFacts.map((fact) => (
              <li key={fact.number}>
                <span>{fact.number}</span>
                <div><h3>{fact.title}</h3><p>{fact.copy}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="platforms-section" id="platforms" aria-labelledby="platforms-title">
        <div className="shell">
          <div className="section-intro platforms-heading">
            <p className="eyebrow eyebrow-indigo">Available everywhere it matters</p>
            <h2 id="platforms-title">Manage here. Fill there.</h2>
          </div>
          <div className="platform-list">
            {platforms.map((platform) => (
              <a href={platform.href} key={platform.code}>
                <PlatformIcon name={platform.icon} />
                <div><strong>{platform.name}</strong><p>{platform.detail}</p></div>
                <span className="platform-arrow" aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      <section className="self-host-section" id="self-hosting" aria-labelledby="self-host-title">
        <div className="shell self-host-layout">
          <div className="self-host-code" aria-label="Cloudflare deployment outline">
            <span>$ git clone github.com/ryan12324/LockBox</span>
            <span>$ bun run deploy:api</span>
            <span>$ VITE_API_URL=https://api.example.com bun run deploy:web</span>
            <strong>✓ Your vault. Your Cloudflare account.</strong>
          </div>
          <div className="section-intro">
            <p className="eyebrow">Self-hosting stays first class</p>
            <h2 id="self-host-title">Use our server, or bring your own.</h2>
            <p>
              The hosted vault is the fastest way in. The full Workers, D1, R2, web, extension,
              Android, and CLI stack remains available under an open-source license.
            </p>
            <div className="inline-actions">
              <a className="button button-light" href={`${GITHUB_URL}#quick-start`}>Deploy Authwell</a>
              <a className="text-link text-link-light" href={GITHUB_URL}>Browse the source <span aria-hidden="true">→</span></a>
            </div>
          </div>
        </div>
      </section>

      <section className="final-cta" aria-labelledby="final-title">
        <img src="/brand/authwell-mark.svg" alt="" />
        <div className="shell final-cta-inner">
          <p className="eyebrow eyebrow-indigo">Ready when you are</p>
          <h2 id="final-title">Open the vault. Keep the choice.</h2>
          <div className="hero-actions final-actions">
            <RegistrationAction state={registration} />
            <a className="button button-outline" href={`${VAULT_URL}/login`}>Sign in</a>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <a className="brand footer-brand" href="#top" aria-label="Authwell home">
            <img src="/brand/authwell-logo-horizontal.png?v=authwell-2" alt="Authwell" />
          </a>
          <p>Private access, on infrastructure you choose.</p>
          <nav aria-label="Footer navigation">
            <a href={`${GITHUB_URL}/blob/main/PRIVACY.md`}>Privacy</a>
            <a href={`${GITHUB_URL}/blob/main/SECURITY.md`}>Security</a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`}>License</a>
            <a href={GITHUB_URL}>GitHub</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
