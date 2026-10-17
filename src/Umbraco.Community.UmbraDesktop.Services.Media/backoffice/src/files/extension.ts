/**
 * A file's extension, from its name or URL, lower-cased and without the dot. A query string is
 * ignored, since a media URL may carry one for resizing.
 *
 * Accessories keeps its own copy for naming the files Notepad and Paint save: nothing is imported
 * between packages, and four lines are cheaper to repeat than to publish.
 * @param path A file name or URL.
 * @returns The extension, or an empty string when there is none.
 */
export function extensionOf(path: string): string {
  const name = path.split(/[?#]/)[0].split('/').pop() ?? '';
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}
