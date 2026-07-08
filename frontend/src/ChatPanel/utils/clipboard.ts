export async function copyToClipboard(
  text: string,
  onSuccess: () => void,
  onError: () => void,
): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      onSuccess();
      return;
    }
  } catch {
    // fall through to legacy copy
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    if (copied) {
      onSuccess();
    } else {
      onError();
    }
  } catch {
    onError();
  }
}
