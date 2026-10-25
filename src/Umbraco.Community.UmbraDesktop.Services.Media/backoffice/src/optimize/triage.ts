import { formatOfExtension } from './picture.js';

/**
 * What the media library says about an item, before it is opened: enough to decide whether it can be
 * optimized at all (design §5.1). Read in a few batched requests for the whole selection, because the
 * item model alone has no extension and no folder flag.
 */
export interface ItemFacts {
  /** The item's key. */
  unique: string;
  /** Its name. */
  name: string;
  /** The folder it is in, or null at the root. */
  parent: string | null;
  /** Whether it is in the recycle bin. */
  isTrashed: boolean;
  /** Its media type's key, which says whether it is a folder. */
  mediaType: string;
  /** Its file's extension, from its address; undefined without a file. */
  extension?: string;
  /** Whether it has a file at all. */
  hasUrl: boolean;
}

/**
 * Why an item is skipped. `missing` is an item the media library did not return, deleted since it
 * was selected or hidden from this person; `animated` is only known once the file is read.
 */
export type SkipReason = 'folder' | 'no-file' | 'trashed' | 'not-an-image' | 'vector' | 'animated' | 'missing';

/**
 * Whether an item is skipped, by the rows of design §6.1 that can be decided before opening it.
 * The selection is handed over as it is, folders and all (§4), so the count on the settings page and
 * the report agree: both come from here.
 * @param facts What the media library said about it, or undefined when it said nothing.
 * @param folderTypes The media types Umbraco calls folders.
 * @returns Why it is skipped, or null when it goes on to be opened.
 */
export function triage(facts: ItemFacts | undefined, folderTypes: ReadonlySet<string>): SkipReason | null {
  if (!facts) return 'missing';
  if (folderTypes.has(facts.mediaType)) return 'folder';
  if (facts.isTrashed) return 'trashed';
  if (!facts.hasUrl) return 'no-file';
  const format = formatOfExtension(facts.extension ?? '');
  if (format === null) return 'not-an-image';
  if (format === 'svg') return 'vector';
  return null;
}

/** The two ways a window's title is written, in the person's language. */
export interface TitleWords {
  /**
   * The title for images from one place.
   * @param name The folder's name, or the caller's title.
   * @param count How many images.
   */
  titled(name: string, count: number): string;
  /**
   * The title for images from more than one folder.
   * @param count How many images.
   */
  mixed(count: number): string;
}

/**
 * A run's window title, which names what is in it so two runs can be told apart on the taskbar (D3):
 * "Optimize images: Products (9)", or "Optimize images (9 images)" when the images come from more
 * than one folder. A caller's own title takes the folder's place.
 * @param words How the two forms are written.
 * @param items The images the run optimizes, each with its folder.
 * @param folderName The name of the folder they share, or of the root; undefined when not known.
 * @param title A caller's plain-text title.
 * @returns The title.
 */
export function windowTitle(words: TitleWords, items: ReadonlyArray<{ parent: string | null }>, folderName: string | undefined, title?: string): string {
  const count = items.length;
  if (title) return words.titled(title, count);
  const folders = new Set(items.map((item) => item.parent));
  return folders.size === 1 && folderName ? words.titled(folderName, count) : words.mixed(count);
}
