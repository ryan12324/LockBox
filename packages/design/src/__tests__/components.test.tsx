import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Card } from '../components/Card.js';
import { Input } from '../components/Input.js';
import { Modal } from '../components/Modal.js';
import { Toast } from '../components/Toast.js';
import {
  SiteFavicon,
  SITE_ICON_CACHE_MAX_ENTRIES,
  SITE_ICON_FAILURE_TTL_MS,
  SITE_ICON_SUCCESS_TTL_MS,
  clearSiteIconCache,
  getCachedSiteIconUrls,
  getEntryFaviconSources,
  getSiteFaviconUrl,
  getSiteIconUrls,
  recordSiteIconFailure,
  recordSiteIconSuccess,
} from '../components/SiteFavicon.js';

beforeEach(() => clearSiteIconCache());

describe('design primitives', () => {
  it('builds a direct favicon URL without forwarding sensitive URL parts', () => {
    expect(
      getSiteFaviconUrl(['https://user:secret@example.com/account?token=private#section'])
    ).toBe('https://example.com/apple-touch-icon.png');
  });

  it('skips unsafe sources and accepts a later HTTPS site', () => {
    expect(getSiteFaviconUrl(['javascript:alert(1)', 'http://example.com', '*.github.com/login']))
      .toBe('https://github.com/apple-touch-icon.png');
  });

  it('allows loopback HTTP favicons for local self-hosted sites', () => {
    expect(getSiteFaviconUrl(['http://localhost:8080/login']))
      .toBe('http://localhost:8080/apple-touch-icon.png');
  });

  it('does not make network icon requests for Android application URIs', () => {
    expect(getSiteIconUrls(['androidapp://android.octopusenergy.octopus.energy']))
      .toEqual([]);
  });

  it('tries the higher-resolution Apple touch icon before the standard favicon', () => {
    expect(getSiteIconUrls(['https://example.com/login'])).toEqual([
      'https://example.com/apple-touch-icon.png',
      'https://example.com/favicon.ico',
    ]);
  });

  it('continues through each unique saved site when earlier artwork is unavailable', () => {
    expect(getSiteIconUrls([
      'https://first.example/login',
      'https://first.example/account',
      'https://second.example/sign-in',
    ])).toEqual([
      'https://first.example/apple-touch-icon.png',
      'https://first.example/favicon.ico',
      'https://second.example/apple-touch-icon.png',
      'https://second.example/favicon.ico',
    ]);
  });

  it('prefers a known-good icon until its success entry expires', () => {
    const sources = ['https://example.com/login'];
    const appleIcon = 'https://example.com/apple-touch-icon.png';
    const favicon = 'https://example.com/favicon.ico';
    recordSiteIconSuccess(favicon, 1_000);

    expect(getCachedSiteIconUrls(sources, 1_001)).toEqual([favicon, appleIcon]);
    expect(getCachedSiteIconUrls(sources, 1_000 + SITE_ICON_SUCCESS_TTL_MS))
      .toEqual([appleIcon, favicon]);
  });

  it('suppresses a failed icon until its shorter failure entry expires', () => {
    const sources = ['https://example.com/login'];
    const appleIcon = 'https://example.com/apple-touch-icon.png';
    const favicon = 'https://example.com/favicon.ico';
    recordSiteIconFailure(appleIcon, 2_000);

    expect(getCachedSiteIconUrls(sources, 2_001)).toEqual([favicon]);
    expect(getCachedSiteIconUrls(sources, 2_000 + SITE_ICON_FAILURE_TTL_MS))
      .toEqual([appleIcon, favicon]);
  });

  it('bounds resolution metadata and evicts the oldest result', () => {
    for (let index = 0; index <= SITE_ICON_CACHE_MAX_ENTRIES; index++) {
      recordSiteIconFailure(`https://site-${index}.example/apple-touch-icon.png`, 1_000 + index);
    }

    expect(getCachedSiteIconUrls(['https://site-0.example'], 2_000)).toEqual([
      'https://site-0.example/apple-touch-icon.png',
      'https://site-0.example/favicon.ico',
    ]);
    expect(getCachedSiteIconUrls(
      [`https://site-${SITE_ICON_CACHE_MAX_ENTRIES}.example`],
      2_000
    )).toEqual([`https://site-${SITE_ICON_CACHE_MAX_ENTRIES}.example/favicon.ico`]);
  });

  it('derives favicon sources only for site-associated entry types', () => {
    expect(getEntryFaviconSources({ type: 'login', uris: ['https://example.com'] }))
      .toEqual(['https://example.com']);
    expect(getEntryFaviconSources({ type: 'passkey', rpId: 'login.example.com' }))
      .toEqual(['login.example.com']);
    expect(getEntryFaviconSources({ type: 'note', uris: ['https://ignored.example'] }))
      .toEqual([]);
  });

  it('tries the standard favicon after the Apple icon and keeps the local fallback if both fail', () => {
    const { container } = render(
      <SiteFavicon sources={['https://example.com/login']} fallbackIcon="key" size={20} />
    );
    const image = screen.getByRole('presentation', { hidden: true });
    expect(image).toHaveAttribute('src', 'https://example.com/apple-touch-icon.png');
    fireEvent.error(image);
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://example.com/favicon.ico'
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(container.querySelector('.lb-icon')).toBeInTheDocument();
  });

  it('replaces the fallback with an opaque theme surface when a favicon loads', () => {
    const { container } = render(
      <SiteFavicon sources={['https://example.com/login']} fallbackIcon="key" size={20} />
    );
    const image = screen.getByRole('presentation', { hidden: true });

    fireEvent.load(image);

    expect(container.querySelector('.lb-icon')).not.toBeInTheDocument();
    expect(image).toHaveStyle({ background: 'var(--color-surface-raised)', opacity: '1' });
  });

  it('associates input labels and errors with the control', () => {
    render(<Input label="Master password" type="password" error="Password is required" />);

    const input = screen.getByLabelText('Master password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Password is required');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('makes interactive cards keyboard operable', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Open item</Card>);

    const card = screen.getByRole('button', { name: 'Open item' });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('closes dialogs with Escape and restores focus', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          <Modal open={open} onClose={() => setOpen(false)} title="Edit item">
            <button type="button">Save</button>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Edit item' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('announces urgent toast messages assertively', () => {
    render(<Toast variant="error" message="Could not save item" duration={0} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save item');
  });
});
