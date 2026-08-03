// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AutofillTest, {
  AUTOFILL_TEST_SCENARIOS,
  buildAutofillCompletionUrl,
  buildIOSAutofillAcceptanceSubmission,
} from '../pages/AutofillTest.js';

afterEach(() => {
  cleanup();
  delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  vi.restoreAllMocks();
});

function renderLab(path = '/test') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/test" element={<AutofillTest />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('autofill test lab', () => {
  it('covers the complete credential-form matrix with stable case IDs', () => {
    expect(AUTOFILL_TEST_SCENARIOS.map((scenario) => scenario.id)).toEqual([
      'standard',
      'email',
      'signup',
      'password-change',
      'password-only',
      'multi-step',
      'dynamic',
      'phone',
      'pin',
      'fallback',
      'one-time-code',
      'sso-only',
    ]);
    expect(new Set(AUTOFILL_TEST_SCENARIOS.map((scenario) => scenario.id)).size).toBe(12);
  });

  it('marks a standard login with explicit current credential semantics', () => {
    renderLab();

    expect(screen.getByLabelText('Username').getAttribute('autocomplete')).toBe('username');
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');
  });

  it('distinguishes account creation and one-time-code fields', () => {
    renderLab('/test?case=signup');

    expect(screen.getByLabelText('Create password').getAttribute('autocomplete')).toBe(
      'new-password'
    );
    expect(screen.getByLabelText('Confirm password').getAttribute('autocomplete')).toBe(
      'new-password'
    );

    fireEvent.click(screen.getByRole('button', { name: /One-time code/ }));
    expect(
      screen.getByRole('textbox', { name: 'One-time code' }).getAttribute('autocomplete')
    ).toBe('one-time-code');
    expect(screen.getByText('Expect verification code only')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Password' })).toBeNull();
  });

  it('reveals multi-step and dynamic fields only when their UI advances', () => {
    renderLab('/test?case=multi-step');

    expect(screen.getByLabelText('Email or username')).toBeTruthy();
    expect(screen.queryByLabelText('Password')).toBeNull();
    fireEvent.change(screen.getByLabelText('Email or username'), {
      target: { value: 'dummy.account@example.test' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByLabelText('Password').getAttribute('autocomplete')).toBe('current-password');

    fireEvent.click(screen.getByRole('button', { name: /Dynamic form/ }));
    expect(screen.queryByLabelText('Account')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Insert login form' }));
    expect(screen.getByLabelText('Account').getAttribute('autocomplete')).toBe('username');
  });

  it('builds a completion navigation without serializing any field values', () => {
    const url = buildAutofillCompletionUrl('standard', 'https://vault.example.test');

    expect(url).toBe('https://vault.example.test/test?case=standard&completed=standard');
    expect(url).not.toContain('username');
    expect(url).not.toContain('password');
  });

  it.each([
    ['standard', { username: 'alice', password: 'current' }, 'alice', 'current'],
    ['email', { email: 'alice@example.test', password: 'current' }, 'alice@example.test', 'current'],
    ['signup', {
      username: 'new@example.test',
      'new-password': 'created',
      'confirm-password': 'created',
    }, 'new@example.test', 'created'],
    ['password-change', {
      username: 'alice',
      'new-password': 'replacement',
      'confirm-password': 'replacement',
    }, 'alice', 'replacement'],
    ['password-only', { password: 'current' }, 'demo.account@example.test', 'current'],
    ['multi-step', { username: 'alice', password: 'current' }, 'alice', 'current'],
    ['dynamic', { 'late-username': 'alice', 'late-password': 'current' }, 'alice', 'current'],
    ['phone', { mobile: '+447700900000', password: 'current' }, '+447700900000', 'current'],
    ['pin', { username: 'account-7', pin: '7391' }, 'account-7', '7391'],
    ['fallback', { accountEmailInput: 'alice', passwd: 'current' }, 'alice', 'current'],
  ] as const)('selects the intended iOS login fields for %s', (
    scenarioId,
    values,
    username,
    password
  ) => {
    expect(buildIOSAutofillAcceptanceSubmission(
      scenarioId,
      makeForm(values)
    )).toEqual({ scenarioId, username, password });
  });

  it.each(['one-time-code', 'sso-only'])('never sends a password for %s', (scenarioId) => {
    expect(buildIOSAutofillAcceptanceSubmission(scenarioId)).toEqual({ scenarioId });
  });

  it('fails closed when replacement passwords differ', () => {
    expect(() => buildIOSAutofillAcceptanceSubmission('password-change', makeForm({
      username: 'alice',
      'new-password': 'first',
      'confirm-password': 'second',
    }))).toThrow('do not match');
  });

  it('shows a verified result only after the native encrypted-save bridge succeeds', async () => {
    const nativePromise = vi.fn().mockResolvedValue({
      outcome: 'saved',
      indexed: true,
      encrypted: true,
    });
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      isPluginAvailable: () => true,
      getPlatform: () => 'ios',
      nativePromise,
    };
    renderLab('/test?case=standard&automation=ios-native');
    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'current' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete test sign-in' }));

    expect(await screen.findByText('iOS secure login save verified')).toBeInTheDocument();
    expect(nativePromise).toHaveBeenCalledWith('Autofill', 'runAutofillAcceptanceCase', {
      scenarioId: 'standard',
      username: 'alice',
      password: 'current',
    });
  });
});

function makeForm(values: Readonly<Record<string, string>>): HTMLFormElement {
  const form = document.createElement('form');
  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    form.append(input);
  }
  return form;
}
