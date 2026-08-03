import type { LoginItem } from '@lockbox/types';

export interface AutofillE2eControlResult {
  handled: boolean;
  response?: unknown;
  enableInlineAutofill?: boolean;
}

/** Production implementation. The E2E build aliases this module explicitly. */
export function handleAutofillE2eControl(_message: unknown): AutofillE2eControlResult {
  return { handled: false };
}

export function getAutofillE2eItem(): LoginItem | null {
  return null;
}

export function resetAutofillE2e(): void {}

export function updateAutofillE2ePassword(_itemId: string, _password: string): boolean {
  return false;
}
