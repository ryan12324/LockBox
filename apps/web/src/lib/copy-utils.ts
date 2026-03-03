export async function copyWithFeedback(text: string, element?: HTMLElement | null): Promise<void> {
  await navigator.clipboard.writeText(text);
  if (element) {
    element.classList.add('squish');
    setTimeout(() => element.classList.remove('squish'), 400);
  }
  window.dispatchEvent(new CustomEvent('lockbox:copy'));
}
