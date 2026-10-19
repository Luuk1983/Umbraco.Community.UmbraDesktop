/**
 * The name of a picture pasted from the OS clipboard (design §5, plan task 6.1). The clipboard carries
 * no file name, and Chrome calls every pasted picture `image.png`, so ten screenshots would make ten
 * items of the same name. A pasted picture is named after when it was pasted instead: the one thing
 * someone knows about a screenshot they just took. Written so it sorts by time and holds nothing a
 * file system objects to, so no colon and no locale format.
 *
 * The date is written with dots, not dashes: core names an upload from its file name, and from 17.7 it
 * turns dashes and underscores into spaces and capitalises each word on the way (measured 2026-10-18),
 * so `Pasted image 2026-10-17 14.23.17.png` would become "Pasted Image 2026 10 17 14.23.17". With dots
 * it becomes "Pasted Image 2026.10.17 14.23.17", the date still whole.
 */

/** The names the browser gives a picture that had none. */
const NAMELESS = /^(image\.[a-z0-9]+)?$/i;

/** File extensions for picture types a paste can carry, for a picture that comes without a name. */
const EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
};

/**
 * Two digits.
 * @param value The number.
 * @returns It, padded.
 */
const two = (value: number) => String(value).padStart(2, '0');

/**
 * The name for a picture pasted at a moment.
 * @param at When it was pasted, in local time.
 * @param prefix What it is called, in the person's language: "Pasted image".
 * @returns The name, such as `Pasted image 2026.10.17 14.03.07`.
 */
export function pastedImageName(at: Date, prefix: string): string {
  const date = `${at.getFullYear()}.${two(at.getMonth() + 1)}.${two(at.getDate())}`;
  const time = `${two(at.getHours())}.${two(at.getMinutes())}.${two(at.getSeconds())}`;
  return `${prefix} ${date} ${time}`;
}

/**
 * A pasted file, named for the upload: a picture the browser gave no real name gets one from the
 * moment; a file pasted from the OS keeps its own.
 * @param file The file.
 * @param at When it was pasted.
 * @param prefix What a pasted picture is called, in the person's language.
 * @returns The file, renamed or as it was.
 */
export function nameForPaste(file: File, at: Date, prefix: string): File {
  if (!NAMELESS.test(file.name) || !file.type.startsWith('image/')) return file;
  const extension = file.name.split('.')[1]?.toLowerCase() || EXTENSIONS[file.type] || 'png';
  return new File([file], `${pastedImageName(at, prefix)}.${extension}`, { type: file.type, lastModified: at.getTime() });
}
