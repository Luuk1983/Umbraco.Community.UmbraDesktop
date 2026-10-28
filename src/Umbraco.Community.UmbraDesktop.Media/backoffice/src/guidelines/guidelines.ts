/**
 * The site's media guidelines (#179), as the browser holds them: what files dropped or pasted into a
 * Media Manager are checked against before they are uploaded. One set for the whole site, kept on the
 * server by this package's `Guidelines/MediaGuidelinesController.cs`, whose shape {@link ServerGuidelines}
 * copies.
 */

/** What a kind of image should be uploaded as: its own format, or one the browser writes. */
export type GuidelineFormat = 'keep' | 'jpeg' | 'png' | 'webp';

/**
 * The kinds of image the Formats table has a row for. A PNG is two kinds, told apart by whether any
 * pixel is transparent, because a PNG photo is better as WebP and a logo is better left alone.
 */
export type ImageKind = 'jpeg' | 'png-photo' | 'png-transparent' | 'webp' | 'gif';

/** The kinds, in the order the Formats table lists them. */
export const IMAGE_KINDS: readonly ImageKind[] = ['jpeg', 'png-photo', 'png-transparent', 'webp', 'gif'];

/** The formats a row can name, in the order the table offers them. */
export const GUIDELINE_FORMATS: readonly GuidelineFormat[] = ['keep', 'jpeg', 'png', 'webp'];

/** The site's guidelines. */
export interface MediaGuidelines {
  /** Maximum size: a picture whose longest side is longer than this is flagged, and resized to it. */
  maxSize: { on: boolean; longestSide: number };
  /**
   * Formats: what each kind should be. A row not set to Keep flags the file, and also sets the format
   * a file resized for Maximum size is saved in. Quality is for JPEG and WebP.
   */
  formats: { on: boolean; quality: number; rows: Record<ImageKind, GuidelineFormat> };
  /** Location: a photo that records where it was taken is flagged, and has that removed. */
  location: { on: boolean };
}

/** The longest side a guideline may name; the server's `MediaGuidelines.LargestLongestSide`. */
export const LARGEST_LONGEST_SIDE = 20000;

/**
 * What a site that never opened the settings gets, the server's `MediaGuidelines.Default`: every
 * guideline on, 2560 pixels, PNG photos to WebP at 80, the rest kept. Optimize images' own defaults,
 * so a file fixed on its way in looks like one fixed afterwards.
 */
export const DEFAULT_GUIDELINES: MediaGuidelines = Object.freeze({
  maxSize: Object.freeze({ on: true, longestSide: 2560 }),
  formats: Object.freeze({
    on: true,
    quality: 80,
    rows: Object.freeze({ jpeg: 'keep', 'png-photo': 'webp', 'png-transparent': 'keep', webp: 'keep', gif: 'keep' }),
  }),
  location: Object.freeze({ on: true }),
}) as MediaGuidelines;

/** A format as the server names it. */
type ServerFormat = 'Keep' | 'Jpeg' | 'Png' | 'Webp';

/** The guidelines as the server sends and takes them: camel-cased properties, formats by name. */
export interface ServerGuidelines {
  /** Maximum size. */
  maxSize: { on: boolean; longestSide: number };
  /** Formats, a row per kind. */
  formats: { on: boolean; quality: number; jpeg: ServerFormat; pngPhoto: ServerFormat; pngTransparent: ServerFormat; webp: ServerFormat; gif: ServerFormat };
  /** Location. */
  location: { on: boolean };
}

/** Each kind's property on the server. */
const SERVER_ROWS: Record<ImageKind, keyof Omit<ServerGuidelines['formats'], 'on' | 'quality'>> = {
  jpeg: 'jpeg',
  'png-photo': 'pngPhoto',
  'png-transparent': 'pngTransparent',
  webp: 'webp',
  gif: 'gif',
};

/** Each format's name on the server. */
const SERVER_FORMATS: Record<GuidelineFormat, ServerFormat> = { keep: 'Keep', jpeg: 'Jpeg', png: 'Png', webp: 'Webp' };

/**
 * A switch, read defensively.
 * @param value What came.
 * @param fallback The default.
 * @returns The switch.
 */
function switchOf(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * A whole number inside a range, read defensively.
 * @param value What came.
 * @param least The smallest it may be.
 * @param most The largest it may be.
 * @param fallback The default.
 * @returns The number.
 */
function numberOf(value: unknown, least: number, most: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= least && value <= most ? value : fallback;
}

/**
 * The guidelines from what the server sent. Read field by field, as the server's store reads its
 * document, so one field this version cannot read costs that field and never the rest.
 * @param raw The response body.
 * @returns The guidelines.
 */
export function fromServer(raw: unknown): MediaGuidelines {
  const body = (raw ?? {}) as Partial<Record<keyof ServerGuidelines, Record<string, unknown> | null>>;
  const maxSize = body.maxSize ?? {};
  const formats = body.formats ?? {};
  const location = body.location ?? {};
  const defaults = DEFAULT_GUIDELINES;
  const rows = {} as Record<ImageKind, GuidelineFormat>;
  for (const kind of IMAGE_KINDS) {
    const name = formats[SERVER_ROWS[kind]];
    const format = GUIDELINE_FORMATS.find((each) => SERVER_FORMATS[each] === name);
    rows[kind] = format ?? defaults.formats.rows[kind];
  }
  return {
    maxSize: { on: switchOf(maxSize.on, defaults.maxSize.on), longestSide: numberOf(maxSize.longestSide, 1, LARGEST_LONGEST_SIDE, defaults.maxSize.longestSide) },
    formats: { on: switchOf(formats.on, defaults.formats.on), quality: numberOf(formats.quality, 1, 100, defaults.formats.quality), rows },
    location: { on: switchOf(location.on, defaults.location.on) },
  };
}

/**
 * The guidelines as the server takes them.
 * @param guidelines The guidelines.
 * @returns The request body.
 */
export function toServer(guidelines: MediaGuidelines): ServerGuidelines {
  const rows = Object.fromEntries(IMAGE_KINDS.map((kind) => [SERVER_ROWS[kind], SERVER_FORMATS[guidelines.formats.rows[kind]]])) as Pick<
    ServerGuidelines['formats'],
    'jpeg' | 'pngPhoto' | 'pngTransparent' | 'webp' | 'gif'
  >;
  return {
    maxSize: { ...guidelines.maxSize },
    formats: { on: guidelines.formats.on, quality: guidelines.formats.quality, ...rows },
    location: { ...guidelines.location },
  };
}

/**
 * Whether anything is checked at all, so a site with every guideline off uploads as it always did.
 * @param guidelines The guidelines.
 * @returns True when a guideline is on.
 */
export function anyOn(guidelines: MediaGuidelines): boolean {
  return guidelines.maxSize.on || guidelines.formats.on || guidelines.location.on;
}
