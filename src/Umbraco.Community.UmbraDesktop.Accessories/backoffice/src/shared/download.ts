/**
 * Hand a file to the person as a browser download.
 *
 * Shared by Notepad's Save and Paint's Save, which both produce a file on the person's machine and
 * nothing on the server. The anchor is never attached to the document: Chrome, Firefox and Safari all
 * honour a click on a detached `<a download>`, and not attaching it means there is nothing to clean
 * up if the click throws.
 *
 * The object URL is revoked on the next task rather than straight away, because revoking it in the
 * same task as the click can cancel the download in Firefox before it has read the blob.
 * @param blob The file's contents.
 * @param name The name to save it under.
 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url));
}
