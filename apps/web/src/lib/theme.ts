export type ThemePreference = 'system' | 'light' | 'dark';

const SETTINGS_STORAGE_KEY = 'lockbox-settings';
const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

export function getStoredThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return 'system';

    const theme = (JSON.parse(stored) as { theme?: unknown }).theme;
    return theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_MODE_QUERY).matches;
}

export function applyThemePreference(theme: ThemePreference): void {
  const dark = theme === 'dark' || (theme === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function applyStoredTheme(): void {
  applyThemePreference(getStoredThemePreference());
}

export function startThemeSync(): () => void {
  applyStoredTheme();

  const mediaQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia(DARK_MODE_QUERY) : null;
  const handleSystemThemeChange = () => {
    if (getStoredThemePreference() === 'system') applyStoredTheme();
  };
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === SETTINGS_STORAGE_KEY || event.key === null) applyStoredTheme();
  };

  mediaQuery?.addEventListener('change', handleSystemThemeChange);
  window.addEventListener('storage', handleStorageChange);

  return () => {
    mediaQuery?.removeEventListener('change', handleSystemThemeChange);
    window.removeEventListener('storage', handleStorageChange);
  };
}
