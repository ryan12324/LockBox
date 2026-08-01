import type { ReactNode } from 'react';
import { Icon, type IconName } from '@lockbox/design';

interface AuthShellProps {
  eyebrow: string;
  title: string;
  description: string;
  icon?: IconName;
  children: ReactNode;
  footer?: ReactNode;
}

export default function AuthShell({
  eyebrow,
  title,
  description,
  icon = 'shield-lock',
  children,
  footer,
}: AuthShellProps) {
  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="About Authwell">
        <div className="auth-brand">
          <img
            className="auth-brand__logo"
            src="/brand/authwell-logo-horizontal-dark.png?v=authwell-1"
            alt="Authwell"
          />
        </div>
        <div className="auth-story__content">
          <span className="auth-story__icon" aria-hidden="true">
            <Icon name={icon} size={28} />
          </span>
          <p className="auth-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
        </div>
        <ul className="auth-assurances">
          <li>
            <Icon name="circle-check" size={18} /> Vault contents are encrypted before sync
          </li>
          <li>
            <Icon name="circle-check" size={18} /> Decryption keys stay on your device
          </li>
          <li>
            <Icon name="circle-check" size={18} /> Your server stores encrypted vault data
          </li>
        </ul>
      </section>

      <section className="auth-panel" aria-labelledby="auth-panel-title">
        <div className="auth-panel__mobile-brand">
          <img
            className="auth-brand__logo"
            src="/brand/authwell-logo-horizontal-dark.png?v=authwell-1"
            alt="Authwell"
          />
        </div>
        <div className="auth-panel__heading">
          <p>{eyebrow}</p>
          <h2 id="auth-panel-title">{title}</h2>
          <span>{description}</span>
        </div>
        {children}
        {footer && <div className="auth-panel__footer">{footer}</div>}
      </section>
    </main>
  );
}
