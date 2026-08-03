import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Icon } from '@lockbox/design';
import { commitNativeAutofillSession } from '../lib/native-autofill.js';

export type AutofillTestExpectation = 'fill-and-save' | 'save-only' | 'ignore';

export interface AutofillTestScenario {
  id: string;
  number: string;
  title: string;
  summary: string;
  expectation: AutofillTestExpectation;
  expected: string[];
  contract: string[];
}

export const AUTOFILL_TEST_SCENARIOS: readonly AutofillTestScenario[] = [
  {
    id: 'standard',
    number: '01',
    title: 'Username + password',
    summary: 'The most common sign-in form, with explicit browser semantics.',
    expectation: 'fill-and-save',
    expected: ['Offer a matching saved login', 'Offer to save or update after completion'],
    contract: ['username', 'current-password'],
  },
  {
    id: 'email',
    number: '02',
    title: 'Email + password',
    summary: 'An email-address identifier paired with a current password.',
    expectation: 'fill-and-save',
    expected: ['Recognize the email as the username', 'Save the submitted email and password'],
    contract: ['email', 'current-password'],
  },
  {
    id: 'signup',
    number: '03',
    title: 'Create account',
    summary: 'A registration form with a new password and confirmation field.',
    expectation: 'save-only',
    expected: [
      'Do not put an existing password into either new-password field',
      'Save the first new password',
    ],
    contract: ['username', 'new-password', 'new-password confirmation'],
  },
  {
    id: 'password-change',
    number: '04',
    title: 'Change password',
    summary: 'Current, new, and confirmation password fields on one screen.',
    expectation: 'fill-and-save',
    expected: [
      'Fill only the current-password field',
      'Update the login with the first new password',
    ],
    contract: ['username', 'current-password', 'new-password', 'new-password confirmation'],
  },
  {
    id: 'password-only',
    number: '05',
    title: 'Password-only unlock',
    summary: 'A returning-user screen where the account identifier is already known.',
    expectation: 'fill-and-save',
    expected: [
      'Offer the matching current password',
      'Never mistake the account label for an editable username',
    ],
    contract: ['readonly account label', 'current-password'],
  },
  {
    id: 'multi-step',
    number: '06',
    title: 'Two-step sign-in',
    summary: 'The username is collected before the password appears.',
    expectation: 'fill-and-save',
    expected: ['Carry the username into the second step', 'Save one complete login after step two'],
    contract: ['step 1: username', 'step 2: current-password'],
  },
  {
    id: 'dynamic',
    number: '07',
    title: 'Dynamic form',
    summary: 'A single-page app inserts the credential fields after an interaction.',
    expectation: 'fill-and-save',
    expected: ['Detect fields added after page load', 'Offer to fill and save normally'],
    contract: ['late username', 'late current-password'],
  },
  {
    id: 'phone',
    number: '08',
    title: 'Phone number login',
    summary: 'A telephone number acts as the account username.',
    expectation: 'fill-and-save',
    expected: ['Treat the phone number as the username', 'Preserve the international number'],
    contract: ['tel + username', 'current-password'],
  },
  {
    id: 'pin',
    number: '09',
    title: 'Numeric PIN',
    summary: 'A numeric secret is still a current credential, not a one-time code.',
    expectation: 'fill-and-save',
    expected: ['Offer the PIN as a password', 'Keep the numeric keyboard hint'],
    contract: ['username', 'numeric current-password'],
  },
  {
    id: 'fallback',
    number: '10',
    title: 'Missing annotations',
    summary: 'A legacy form relies on sensible labels, names, and IDs.',
    expectation: 'fill-and-save',
    expected: ['Use conservative field-name fallbacks', 'Avoid unrelated text fields'],
    contract: ['accountEmailInput', 'passwd'],
  },
  {
    id: 'one-time-code',
    number: '11',
    title: 'One-time code',
    summary: 'A verification challenge that must not be stored as a password.',
    expectation: 'ignore',
    expected: ['Do not offer password fill for the code', 'Do not offer to save the code'],
    contract: ['username', 'one-time-code'],
  },
  {
    id: 'sso-only',
    number: '12',
    title: 'SSO buttons only',
    summary: 'A federated sign-in choice with no editable credential fields.',
    expectation: 'ignore',
    expected: ['Do not show a password dataset', 'Do not show a password save prompt'],
    contract: ['no credential fields'],
  },
];

const DEFAULT_SCENARIO = AUTOFILL_TEST_SCENARIOS[0];

export function buildAutofillCompletionUrl(
  scenarioId: string,
  origin: string = window.location.origin
): string {
  const url = new URL('/test', origin);
  url.searchParams.set('case', scenarioId);
  url.searchParams.set('completed', scenarioId);
  return url.toString();
}

function LabField({
  label,
  hint,
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const generatedId = React.useId();
  const id = inputProps.id ?? `autofill-test-${generatedId}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="autofill-test__field">
      <label htmlFor={id}>{label}</label>
      <input {...inputProps} id={id} aria-describedby={hintId} />
      {hint && <span id={hintId}>{hint}</span>}
    </div>
  );
}

function TestForm({
  scenarioId,
  children,
  onComplete,
  submitLabel = 'Complete test sign-in',
  submitting,
}: {
  scenarioId: string;
  children: React.ReactNode;
  onComplete: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  submitting: boolean;
}) {
  return (
    <form
      className="autofill-test__form"
      data-testid={`autofill-form-${scenarioId}`}
      autoComplete="on"
      onSubmit={onComplete}
    >
      {children}
      <Button type="submit" loading={submitting}>
        {submitting ? 'Finishing…' : submitLabel}
      </Button>
    </form>
  );
}

function ScenarioForm({
  scenarioId,
  complete,
  submitting,
}: {
  scenarioId: string;
  complete: (event?: React.FormEvent<HTMLFormElement>) => void;
  submitting: boolean;
}) {
  const [multiStep, setMultiStep] = useState<1 | 2>(1);
  const [dynamicVisible, setDynamicVisible] = useState(false);

  useEffect(() => {
    setMultiStep(1);
    setDynamicVisible(false);
  }, [scenarioId]);

  const common = { onComplete: complete, submitting, scenarioId };

  switch (scenarioId) {
    case 'standard':
      return (
        <TestForm {...common}>
          <LabField label="Username" name="username" autoComplete="username" required />
          <LabField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </TestForm>
      );
    case 'email':
      return (
        <TestForm {...common}>
          <LabField
            label="Email address"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
          <LabField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </TestForm>
      );
    case 'signup':
      return (
        <TestForm {...common} submitLabel="Create test account">
          <LabField
            label="Email address"
            name="username"
            type="email"
            autoComplete="username"
            required
          />
          <LabField
            label="Create password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
          />
          <LabField
            label="Confirm password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
          />
        </TestForm>
      );
    case 'password-change':
      return (
        <TestForm {...common} submitLabel="Update test password">
          <LabField label="Username" name="username" autoComplete="username" required />
          <LabField
            label="Current password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            required
          />
          <LabField
            label="New password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
          />
          <LabField
            label="Confirm new password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
          />
        </TestForm>
      );
    case 'password-only':
      return (
        <TestForm {...common}>
          <div className="autofill-test__known-account" aria-label="Selected test account">
            <Icon name="user" size={18} />
            <span>demo.account@example.test</span>
          </div>
          <LabField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </TestForm>
      );
    case 'multi-step':
      if (multiStep === 1) {
        return (
          <form
            className="autofill-test__form"
            data-testid="autofill-form-multi-step-username"
            autoComplete="on"
            onSubmit={(event) => {
              event.preventDefault();
              setMultiStep(2);
            }}
          >
            <div className="autofill-test__step">
              <span>Step 1 of 2</span>
              <strong>Identify account</strong>
            </div>
            <LabField
              label="Email or username"
              name="username"
              autoComplete="username"
              required
              autoFocus
            />
            <Button type="submit">Continue</Button>
          </form>
        );
      }
      return (
        <TestForm {...common}>
          <div className="autofill-test__step">
            <span>Step 2 of 2</span>
            <strong>Enter password</strong>
          </div>
          <LabField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </TestForm>
      );
    case 'dynamic':
      if (!dynamicVisible) {
        return (
          <div className="autofill-test__empty-form">
            <Icon name="layout-sidebar-left-expand" size={24} />
            <p>The credential form is not in the document yet.</p>
            <Button type="button" variant="secondary" onClick={() => setDynamicVisible(true)}>
              Insert login form
            </Button>
          </div>
        );
      }
      return (
        <TestForm {...common}>
          <LabField
            label="Account"
            id="late-username"
            name="late-username"
            autoComplete="username"
            required
            autoFocus
          />
          <LabField
            label="Password"
            id="late-password"
            name="late-password"
            type="password"
            autoComplete="current-password"
            required
          />
        </TestForm>
      );
    case 'phone':
      return (
        <TestForm {...common}>
          <LabField
            label="Mobile number"
            name="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="+44 7700 900000"
            required
          />
          <LabField
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </TestForm>
      );
    case 'pin':
      return (
        <TestForm {...common}>
          <LabField label="Account ID" name="username" autoComplete="username" required />
          <LabField
            label="PIN"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="current-password"
            required
            hint="Use a dummy numeric value."
          />
        </TestForm>
      );
    case 'fallback':
      return (
        <TestForm {...common}>
          <LabField
            label="Account email"
            id="accountEmailInput"
            name="accountEmailInput"
            type="text"
            required
          />
          <LabField label="Password" id="passwd" name="passwd" type="password" required />
          <LabField
            label="Search reference"
            id="searchQuery"
            name="searchQuery"
            type="text"
            hint="This unrelated field must not become the username."
          />
        </TestForm>
      );
    case 'one-time-code':
      return (
        <TestForm {...common} submitLabel="Verify test code">
          <LabField label="Account" name="username" autoComplete="username" required />
          <LabField
            label="One-time code"
            name="one-time-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            required
          />
        </TestForm>
      );
    case 'sso-only':
      return (
        <div className="autofill-test__sso">
          <Button type="button" variant="secondary" onClick={() => complete()}>
            Continue with test identity provider
          </Button>
          <p>No username or password input exists in this scenario.</p>
        </div>
      );
    default:
      return null;
  }
}

function ExpectationBadge({ expectation }: { expectation: AutofillTestExpectation }) {
  const label =
    expectation === 'fill-and-save'
      ? 'Expect fill + save'
      : expectation === 'save-only'
        ? 'Expect save only'
        : 'Expect no password action';
  const icon =
    expectation === 'ignore' ? 'circle-check' : expectation === 'save-only' ? 'plus' : 'password';
  return (
    <span className={`autofill-test__expectation autofill-test__expectation--${expectation}`}>
      <Icon name={icon} size={15} />
      {label}
    </span>
  );
}

export default function AutofillTest() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const requestedId = searchParams.get('case');
  const active = useMemo(
    () =>
      AUTOFILL_TEST_SCENARIOS.find((scenario) => scenario.id === requestedId) ?? DEFAULT_SCENARIO,
    [requestedId]
  );
  const completed = searchParams.get('completed') === active.id;

  useEffect(() => setSubmitting(false), [active.id]);

  function selectScenario(id: string) {
    setSearchParams({ case: id }, { replace: true });
  }

  function completeScenario(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    // Keep values in the document until navigation so the platform can inspect
    // the completed form. Credentials are never serialized into the URL or sent.
    void commitNativeAutofillSession()
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => {
          window.location.assign(buildAutofillCompletionUrl(active.id));
        }, 180);
      });
  }

  return (
    <main className="autofill-test">
      <header className="autofill-test__header">
        <div className="autofill-test__header-inner">
          <Link className="autofill-test__back" to="/">
            <Icon name="arrow-left" size={18} />
            Back to Authwell
          </Link>
          <div>
            <p className="autofill-test__eyebrow">Credential integration QA</p>
            <h1>Autofill test lab</h1>
            <p>
              Exercise browser, Android, and iOS credential behavior against realistic login
              patterns.
            </p>
          </div>
          <div className="autofill-test__privacy">
            <Icon name="shield-check" size={19} />
            <span>
              <strong>Dummy data only.</strong> Form values stay on this device and are never sent
              to Authwell.
            </span>
          </div>
        </div>
      </header>

      <div className="autofill-test__layout">
        <nav className="autofill-test__nav" aria-label="Autofill test scenarios">
          <div className="autofill-test__nav-heading">
            <span>Test matrix</span>
            <strong>{AUTOFILL_TEST_SCENARIOS.length} cases</strong>
          </div>
          <ol>
            {AUTOFILL_TEST_SCENARIOS.map((scenario) => (
              <li key={scenario.id}>
                <button
                  type="button"
                  aria-current={scenario.id === active.id ? 'page' : undefined}
                  onClick={() => selectScenario(scenario.id)}
                >
                  <span>{scenario.number}</span>
                  <strong>{scenario.title}</strong>
                  <Icon name="chevron-right" size={17} />
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section className="autofill-test__workbench" aria-labelledby="autofill-test-title">
          {completed && (
            <div className="autofill-test__completed" role="status">
              <Icon name="circle-check" size={20} />
              <div>
                <strong>Test submission completed</strong>
                <span>Check whether Authwell showed the expected fill or save behavior.</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => selectScenario(active.id)}
              >
                Run again
              </Button>
            </div>
          )}

          <div className="autofill-test__scenario-heading">
            <div>
              <span>Case {active.number}</span>
              <h2 id="autofill-test-title">{active.title}</h2>
              <p>{active.summary}</p>
            </div>
            <ExpectationBadge expectation={active.expectation} />
          </div>

          <div className="autofill-test__content">
            <div className="autofill-test__stage">
              <div className="autofill-test__browser-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <div>https://test.authwell.local/{active.id}</div>
              </div>
              <div className="autofill-test__form-shell">
                <div className="autofill-test__test-brand">
                  <Icon name="world" size={21} />
                  <span>Example service</span>
                </div>
                <h3>{active.title}</h3>
                <p>Enter disposable test values or choose an Authwell suggestion.</p>
                <ScenarioForm
                  scenarioId={active.id}
                  complete={completeScenario}
                  submitting={submitting}
                />
              </div>
            </div>

            <aside className="autofill-test__checks" aria-label="Expected behavior">
              <div>
                <h3>Expected behavior</h3>
                <ul>
                  {active.expected.map((item) => (
                    <li key={item}>
                      <Icon name="check" size={16} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Field contract</h3>
                <div className="autofill-test__contracts">
                  {active.contract.map((item) => (
                    <code key={item}>{item}</code>
                  ))}
                </div>
              </div>
              <p className="autofill-test__note">
                Completing a case navigates back to this page without putting field values in the
                URL.
              </p>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
