/**
 * The rules for which media files Notepad and Paint can open, and what a saved file is called.
 *
 * Pure functions, so the rules can be read and tested in one place rather than inferred from two
 * elements.
 */

/**
 * The extensions Notepad treats as text, beyond anything the server says is `text/*`. SVG is here
 * rather than in Paint: it is a drawing written as text, and Notepad can edit it where Paint could
 * only flatten it to pixels.
 */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'ts',
  'svg',
  'yml',
  'yaml',
  'ini',
  'log',
  'webmanifest',
]);

/** The image types a browser canvas can write, so Paint can save a picture in its own format. */
const WRITABLE_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * A file's extension, from its name or URL, lower-cased and without the dot. A query string is
 * ignored, since a media URL may carry one for resizing.
 * @param path A file name or URL.
 * @returns The extension, or an empty string when there is none.
 */
export function extensionOf(path: string): string {
  const name = path.split(/[?#]/)[0].split('/').pop() ?? '';
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

/**
 * The name of the file behind a media item.
 *
 * The media item is named exactly what the person typed; the file needs an extension, because the
 * media library chooses a media type by extension and a browser needs one to know what it holds.
 * A name that already has one keeps it, so a document called `robots.txt` is not saved as
 * `robots.txt.txt`.
 * @param name What the person called the document. Empty means untitled.
 * @param untitled The localised word for a document with no name.
 * @param extension The extension to add when the name has none, without the dot.
 * @returns The file name.
 */
export function fileNameFor(name: string, untitled: string, extension: string): string {
  const base = name.trim() || untitled;
  return extensionOf(base) ? base : `${base}.${extension}`;
}

/**
 * Whether Notepad can open a file.
 * @param extension The file's extension.
 * @param mimeType The type the server sent it as.
 * @returns True for text.
 */
export function isTextFile(extension: string, mimeType: string): boolean {
  return TEXT_EXTENSIONS.has(extension) || mimeType.startsWith('text/');
}

/**
 * The type Paint saves an image as, or undefined when Paint cannot edit it.
 *
 * A picture is saved in the format it arrived in wherever a canvas can write that format, so a
 * photograph stays a JPEG and keeps its size. Other raster formats (GIF, BMP) are saved as PNG,
 * which loses nothing. SVG is refused: it is a drawing in text, Paint would flatten it to pixels,
 * and saving that over the original would destroy it.
 * @param mimeType The image's type.
 * @returns The type to save as, or undefined.
 */
export function editableImageType(mimeType: string): string | undefined {
  if (!mimeType.startsWith('image/') || mimeType === 'image/svg+xml') return undefined;
  return WRITABLE_IMAGE_TYPES.has(mimeType) ? mimeType : 'image/png';
}
