const LOCKBOX_WORDMARK_PATH = 'brand/authwell-logo-horizontal.png';

export const INJECTED_BRAND_STYLES = `
  .lockbox-brand {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .lockbox-brand__logo {
    display: block;
    width: 92px;
    height: auto;
    flex: none;
  }
`;

export function getLockboxWordmarkUrl(): string {
  if (typeof chrome !== 'undefined' && typeof chrome.runtime?.getURL === 'function') {
    return chrome.runtime.getURL(LOCKBOX_WORDMARK_PATH);
  }

  return `/${LOCKBOX_WORDMARK_PATH}`;
}

export function lockboxBrandMarkup(): string {
  return `<div class="lockbox-brand"><img class="lockbox-brand__logo" src="${getLockboxWordmarkUrl()}" alt="Authwell"></div>`;
}

export function createLockboxBrand(): HTMLDivElement {
  const brand = document.createElement('div');
  brand.className = 'lockbox-brand';

  const logo = document.createElement('img');
  logo.className = 'lockbox-brand__logo';
  logo.src = getLockboxWordmarkUrl();
  logo.alt = 'Authwell';
  brand.appendChild(logo);

  return brand;
}
