/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readStylesheet(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src', name), 'utf8');
}

const appShellStyles = readStylesheet('app-shell.css');
const authStyles = readStylesheet('auth.css');
const itemPanelStyles = readStylesheet('item-panel.css');
const vaultStyles = readStylesheet('vault.css');

const SHORT_COMPACT_QUERY = '@media (max-width: 599px) and (max-height: 760px)';

describe('Galaxy Z Fold 8 cover layout contract', () => {
  it('uses the compact short-window treatment across primary vault surfaces', () => {
    expect(appShellStyles).toContain(SHORT_COMPACT_QUERY);
    expect(vaultStyles).toContain(SHORT_COMPACT_QUERY);
    expect(authStyles).toContain(SHORT_COMPACT_QUERY);
    expect(itemPanelStyles).toContain(SHORT_COMPACT_QUERY);
  });

  it('preserves touch targets while reclaiming vertical space for vault items', () => {
    expect(appShellStyles).toContain('calc(52px + var(--safe-area-top))');
    expect(appShellStyles).toContain('calc(56px + var(--safe-area-bottom))');
    expect(appShellStyles).toMatch(/\.app-bottom-nav \.app-nav__item \{[\s\S]*?min-height: 52px/);
    expect(vaultStyles).toMatch(/\.vault-row__main \{ min-height: 72px/);
  });

  it('keeps filters in two columns at the 360px baseline', () => {
    expect(vaultStyles).toContain(
      '.vault-filters { padding: 0 12px 12px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }'
    );
    expect(vaultStyles).toContain('@media (max-width: 339px)');
    const narrowPhoneRules = vaultStyles.slice(
      vaultStyles.indexOf('@media (max-width: 380px)'),
      vaultStyles.indexOf('@media (max-width: 339px)')
    );
    expect(narrowPhoneRules).not.toContain(
      '.vault-filters { grid-template-columns: minmax(0, 1fr); }'
    );
  });

  it('reserves a dedicated grid row for a pending verification-code review', () => {
    expect(vaultStyles).toContain('grid-template-rows: auto auto auto minmax(0, 1fr);');
    expect(vaultStyles).toContain('.vault-page > .native-totp-review { grid-row: 3; }');
    expect(vaultStyles).toContain('.vault-page > .vault-workspace { grid-row: 4; }');
  });
});
