import { describe, expect, it } from 'vitest';
import {
  getAndroidAppPackageName,
  getLoginUriHref,
  getLoginUriValidationError,
  isAndroidAppUri,
  normalizeAndroidAppUri,
  normalizeLoginUriForStorage,
} from '../login-uri.js';

const OCTOPUS_PACKAGE = 'android.octopusenergy.octopus.energy';
const OCTOPUS_APP_URI = `androidapp://${OCTOPUS_PACKAGE}`;

describe('login URI helpers', () => {
  it('canonicalizes Android package names and HTTPS-shaped package links', () => {
    expect(normalizeAndroidAppUri(OCTOPUS_PACKAGE)).toBe(OCTOPUS_APP_URI);
    expect(normalizeAndroidAppUri(`https://${OCTOPUS_PACKAGE}/`)).toBe(OCTOPUS_APP_URI);
    expect(normalizeAndroidAppUri(`${OCTOPUS_APP_URI}/`)).toBe(OCTOPUS_APP_URI);
  });

  it('recognizes explicit app URIs without turning them into browser links', () => {
    expect(isAndroidAppUri(OCTOPUS_APP_URI)).toBe(true);
    expect(getAndroidAppPackageName(OCTOPUS_APP_URI)).toBe(OCTOPUS_PACKAGE);
    expect(getLoginUriHref(OCTOPUS_APP_URI)).toBeNull();
  });

  it('keeps secure websites navigable and rejects unsafe browser schemes', () => {
    expect(getLoginUriHref(`https://${OCTOPUS_PACKAGE}/`)).toBe(
      `https://${OCTOPUS_PACKAGE}/`,
    );
    expect(getLoginUriHref('javascript:alert(1)')).toBeNull();
    expect(getLoginUriHref('http://example.com')).toBeNull();
    expect(getLoginUriHref('http://localhost:3000/login')).toBe(
      'http://localhost:3000/login',
    );
  });

  it('reports malformed reserved app URIs and canonicalizes valid ones on save', () => {
    expect(getLoginUriValidationError('androidapp://octopusenergy')).toContain(
      'androidapp://',
    );
    expect(getLoginUriValidationError(OCTOPUS_APP_URI)).toBeNull();
    expect(normalizeLoginUriForStorage(`  ${OCTOPUS_APP_URI}/  `)).toBe(OCTOPUS_APP_URI);
    expect(normalizeLoginUriForStorage(`https://${OCTOPUS_PACKAGE}/`)).toBe(
      `https://${OCTOPUS_PACKAGE}/`,
    );
  });
});
