/** Preserve safe WebCrypto/DOMException diagnostics without exposing the key. */
export function getTotpErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Authenticator code generation failed';
}
