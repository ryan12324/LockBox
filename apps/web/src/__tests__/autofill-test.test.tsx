// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import AutofillTest, {
  AUTOFILL_TEST_SCENARIOS,
  buildAutofillCompletionUrl,
} from '../pages/AutofillTest.js';

afterEach(cleanup);

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
});
