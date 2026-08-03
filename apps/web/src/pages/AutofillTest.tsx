import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Icon } from '@lockbox/design';
import {
  commitNativeAutofillSession,
  runIOSAutofillAcceptanceCase,
  type IOSAutofillAcceptanceResult,
  type IOSAutofillAcceptanceSubmission,
} from '../lib/native-autofill.js';

export type AutofillTestExpectation = 'fill-and-save' | 'save-only' | 'code-only' | 'ignore';

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
    summary: 'A verification challenge that accepts a current TOTP but must never be stored as a password.',
    expectation: 'code-only',
    expected: [
      'Offer the matching current verification code',
      'Do not offer to save the submitted code as a password',
    ],
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

/** Select exactly the credential fields iOS should save for each test case. */
export function buildIOSAutofillAcceptanceSubmission(
  scenarioId: string,
  form?: HTMLFormElement
): IOSAutofillAcceptanceSubmission {
  if (scenarioId === 'one-time-code' || scenarioId === 'sso-only') {
    return { scenarioId };
  }
  if (!form) throw new Error('The credential form was not submitted');
  const data = new FormData(form);
  const value = (name: string): string => {
    const candidate = data.get(name);
    return typeof candidate === 'string' ? candidate : '';
  };
  const fields: Record<string, [string | null, string]> = {
    standard: ['username', 'password'],
    email: ['email', 'password'],
    signup: ['username', 'new-password'],
    'password-change': ['username', 'new-password'],
    'password-only': [null, 'password'],
    'multi-step': ['username', 'password'],
    dynamic: ['late-username', 'late-password'],
    phone: ['mobile', 'password'],
    pin: ['username', 'pin'],
    fallback: ['accountEmailInput', 'passwd'],
  };
  const selected = fields[scenarioId];
  if (!selected) throw new Error(`Unknown iOS AutoFill test case: ${scenarioId}`);
  const username = selected[0] === null
    ? 'demo.account@example.test'
    : value(selected[0]);
  const password = value(selected[1]);
  if (!username || !password) throw new Error('The test login is incomplete');
  if (scenarioId === 'signup' && password !== value('confirm-password')) {
    throw new Error('The test account passwords do not match');
  }
  if (scenarioId === 'password-change' && password !== value('confirm-password')) {
    throw new Error('The test replacement passwords do not match');
  }
  return { scenarioId, username, password };
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
  const [multiStepUsername, setMultiStepUsername] = useState('');
  const [dynamicVisible, setDynamicVisible] = useState(false);

  useEffect(() => {
    setMultiStep(1);
    setMultiStepUsername('');
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
            minLength={12}
            maxLength={64}
            required
          />
          <LabField
            label="Confirm password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={64}
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
              const data = new FormData(event.currentTarget);
              setMultiStepUsername(String(data.get('username') ?? ''));
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
          <input
            type="hidden"
            name="username"
            autoComplete="username"
            value={multiStepUsername}
          />
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
        : expectation === 'code-only'
          ? 'Expect verification code only'
          : 'Expect no password action';
  const icon =
    expectation === 'ignore'
      ? 'circle-check'
      : expectation === 'save-only'
        ? 'plus'
        : expectation === 'code-only'
          ? 'shield-lock'
          : 'password';
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
  const [iosAcceptance, setIOSAcceptance] = useState<IOSAutofillAcceptanceResult | null>(null);
  const [iosAcceptanceError, setIOSAcceptanceError] = useState('');
  const requestedId = searchParams.get('case');
  const active = useMemo(
    () =>
      AUTOFILL_TEST_SCENARIOS.find((scenario) => scenario.id === requestedId) ?? DEFAULT_SCENARIO,
    [requestedId]
  );
  const completed = searchParams.get('completed') === active.id;
  const automationMode = searchParams.get('automation');
  const automationDelay = automationMode === 'autofill' ? 1_000 : 180;

  useEffect(() => {
    setSubmitting(false);
    setIOSAcceptance(null);
    setIOSAcceptanceError('');
  }, [active.id]);

  function selectScenario(id: string) {
    setSearchParams({ case: id }, { replace: true });
  }

  function completeScenario(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting) return;
    setSubmitting(true);

    if (automationMode === 'ios-native') {
      let submission: IOSAutofillAcceptanceSubmission;
      try {
        submission = buildIOSAutofillAcceptanceSubmission(active.id, event?.currentTarget);
      } catch (reason) {
        setIOSAcceptanceError(reason instanceof Error ? reason.message : 'Invalid test submission');
        setSubmitting(false);
        return;
      }
      void runIOSAutofillAcceptanceCase(submission)
        .then((result) => {
          setIOSAcceptance(result);
          setSearchParams({
            case: active.id,
            completed: active.id,
            automation: 'ios-native',
          }, { replace: true });
        })
        .catch((reason) => {
          setIOSAcceptanceError(
            reason instanceof Error ? reason.message : 'iOS secure-save verification failed'
          );
        })
        .finally(() => setSubmitting(false));
      return;
    }

    // Keep values in the document until navigation so the platform can inspect
    // the completed form. Credentials are never serialized into the URL or sent.
    void commitNativeAutofillSession()
      .catch(() => undefined)
      .finally(() => {
        window.setTimeout(() => {
          window.location.assign(buildAutofillCompletionUrl(active.id));
        }, automationDelay);
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

          {iosAcceptance && (
            <div className="autofill-test__completed" role="status">
              <Icon name="shield-check" size={20} />
              <div>
                <strong>
                  {iosAcceptance.outcome === 'ignored'
                    ? 'iOS no-save behavior verified'
                    : iosAcceptance.outcome === 'updated'
                      ? 'iOS secure login update verified'
                      : 'iOS secure login save verified'}
                </strong>
                <span>
                  {iosAcceptance.outcome === 'ignored'
                    ? 'Authwell did not create a password record for this case.'
                    : 'Authwell encrypted the login and added it to the device AutoFill index.'}
                </span>
              </div>
            </div>
          )}

          {iosAcceptanceError && (
            <div className="autofill-test__completed autofill-test__completed--error" role="alert">
              <Icon name="alert-triangle" size={20} />
              <div>
                <strong>iOS AutoFill acceptance failed</strong>
                <span>{iosAcceptanceError}</span>
              </div>
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
