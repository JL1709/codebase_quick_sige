export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // A denied clipboard permission can still be handled by the user-gesture fallback below.
    }
  }

  if (!document.body || typeof document.execCommand !== "function") return false;

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const copyTarget = document.createElement("textarea");
  copyTarget.value = text;
  copyTarget.setAttribute("readonly", "");
  copyTarget.style.position = "fixed";
  copyTarget.style.inset = "0 auto auto 0";
  copyTarget.style.opacity = "0";
  copyTarget.style.pointerEvents = "none";
  document.body.append(copyTarget);
  copyTarget.focus({ preventScroll: true });
  copyTarget.select();
  copyTarget.setSelectionRange(0, copyTarget.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    copyTarget.remove();
    previousFocus?.focus({ preventScroll: true });
  }

  return copied;
}
