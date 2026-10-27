import { isOpaquePng, readFacts } from './image-facts.js';
import type { UploadFacts } from './image-facts.js';
import type { GuidelineFormat, ImageKind, MediaGuidelines } from './guidelines.js';

/**
 * Which media guidelines a dropped file breaks (#179, design §3), decided in the browser from the
 * file's facts before anything is uploaded. Files that break none upload at once, without a question.
 */

/**
 * A guideline a file breaks, in the order the settings and the warning list them. `upload-limit` is
 * not one of the site's guidelines but Umbraco's own limit on an upload's size
 * (`Umbraco:CMS:Runtime:MaxRequestLength`), which core refuses a larger file over. Listing it up
 * front means a file over it can be optimized under it rather than only refused.
 */
export type GuidelineBreak = 'size' | 'format' | 'location' | 'upload-limit';

/** One dropped file, checked. */
export interface CheckedFile {
  /** The file. */
  file: File;
  /** What it is. */
  facts: UploadFacts;
  /** Its row in the Formats table, or null for a file that is not an image the check knows. */
  kind: ImageKind | null;
  /** What it breaks; empty for a file that follows the guidelines. */
  breaks: GuidelineBreak[];
}

/** What checking reads a file with; the real readers unless a test answers. */
export interface CheckDeps {
  /** Read a file's header. */
  readFacts(file: File): Promise<UploadFacts>;
  /** Decode a PNG to see whether any pixel is transparent. */
  isOpaquePng(file: File): Promise<boolean>;
}

/** Each kind's own format, which a row naming it leaves alone. */
const OWN_FORMAT: Record<ImageKind, GuidelineFormat | 'gif'> = {
  jpeg: 'jpeg',
  'png-photo': 'png',
  'png-transparent': 'png',
  webp: 'webp',
  gif: 'gif',
};

/**
 * A file's row in the Formats table. A PNG is a photo unless one of its pixels is transparent: its
 * header settles that when it has no alpha channel, and a decode settles the rest (owner's call to
 * make, proposed in the brief and kept: a screenshot counts as a photo, and the warning lets it be
 * unticked).
 * @param facts What the file is.
 * @param opaque For a PNG with an alpha channel, whether every pixel is opaque; undefined when not read.
 * @returns The kind, or null for anything the check does not know.
 */
export function kindOf(facts: UploadFacts, opaque: boolean | undefined): ImageKind | null {
  switch (facts.format) {
    case 'jpeg':
      return 'jpeg';
    case 'png':
      return !facts.alphaChannel || opaque === true ? 'png-photo' : 'png-transparent';
    case 'webp':
      return 'webp';
    case 'gif':
      return 'gif';
    default:
      return null;
  }
}

/**
 * Whether a kind's row asks for another format than its own.
 * @param kind The kind.
 * @param guidelines The guidelines.
 * @returns True when the row converts.
 */
export function converts(kind: ImageKind, guidelines: MediaGuidelines): boolean {
  const target = guidelines.formats.rows[kind];
  return guidelines.formats.on && target !== 'keep' && target !== OWN_FORMAT[kind];
}

/**
 * What a file breaks. An animated image is always left alone, and so is a file that is not an image
 * this can fix, whatever its header says.
 * @param facts What the file is.
 * @param kind Its row in the Formats table.
 * @param guidelines The guidelines.
 * @param size The file's size in bytes, for the upload limit.
 * @param uploadLimit The largest upload Umbraco takes, in bytes, or 0 when it sets none.
 * @returns The guidelines it breaks, in their order.
 */
export function breaksOf(facts: UploadFacts, kind: ImageKind | null, guidelines: MediaGuidelines, size = 0, uploadLimit = 0): GuidelineBreak[] {
  if (!kind || facts.animated) return [];
  const breaks: GuidelineBreak[] = [];
  const longest = Math.max(facts.width ?? 0, facts.height ?? 0);
  if (guidelines.maxSize.on && longest > guidelines.maxSize.longestSide) breaks.push('size');
  if (converts(kind, guidelines)) breaks.push('format');
  if (guidelines.location.on && facts.location) breaks.push('location');
  if (uploadLimit > 0 && size > uploadLimit) breaks.push('upload-limit');
  return breaks;
}

/**
 * Check dropped files, one at a time so a drop of a hundred never holds a hundred headers at once.
 *
 * A PNG with an alpha channel is decoded only when its transparency decides something: when the two
 * PNG rows ask for different things, or when it is listed anyway and the warning names its kind. A
 * file whose header cannot be read passes, so a check that fails never holds up an upload.
 * @param files The files.
 * @param guidelines The guidelines.
 * @param deps How files are read; the real readers unless a test answers.
 * @param uploadLimit The largest upload Umbraco takes, in bytes, or 0 when it sets none.
 * @returns Each file, checked, in the order given.
 */
export async function checkFiles(
  files: readonly File[],
  guidelines: MediaGuidelines,
  deps: CheckDeps = { readFacts, isOpaquePng },
  uploadLimit = 0,
): Promise<CheckedFile[]> {
  const rowsDiffer = guidelines.formats.on && guidelines.formats.rows['png-photo'] !== guidelines.formats.rows['png-transparent'];
  const checked: CheckedFile[] = [];
  for (const file of files) {
    let facts: UploadFacts;
    try {
      facts = await deps.readFacts(file);
    } catch {
      checked.push({ file, facts: { format: 'other', location: false, animated: false, alphaChannel: false }, kind: null, breaks: [] });
      continue;
    }
    let kind = kindOf(facts, undefined);
    let breaks = breaksOf(facts, kind, guidelines, file.size, uploadLimit);
    if (facts.format === 'png' && facts.alphaChannel && !facts.animated && (rowsDiffer || breaks.length)) {
      kind = kindOf(facts, await deps.isOpaquePng(file).catch(() => false));
      breaks = breaksOf(facts, kind, guidelines, file.size, uploadLimit);
    }
    checked.push({ file, facts, kind, breaks });
  }
  return checked;
}
