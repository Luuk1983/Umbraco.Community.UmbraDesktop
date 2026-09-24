/**
 * Copy text to the clipboard: the asynchronous Clipboard API, and failing that the old
 * `execCommand`, which some embedded browsers still only allow.
 * @param text What to copy.
 * @returns Whether it was copied.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.style.cssText = 'position: fixed; opacity: 0';
    document.body.append(scratch);
    scratch.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      scratch.remove();
    }
  }
}
