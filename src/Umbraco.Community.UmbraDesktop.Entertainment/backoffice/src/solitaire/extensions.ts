/**
 * The two manifest types through which any package adds card backs and face sets (design D11).
 * This package's own contract, declared and read here; the host knows nothing about them.
 *
 * A face set is lazy-loaded so 52 SVG renders stay out of the main chunk, while backs are
 * light enough to register upfront.
 */
import type { ManifestBase } from '@umbraco-cms/backoffice/extension-api';
import type { Suit } from './rules.js';

/** One card to draw. */
export interface SolitaireCardValue {
  readonly suit: Suit;
  readonly rank: number;
}

/**
 * A face set: draws any card as a self-contained SVG document with viewBox `0 0 100 140`. Each
 * SVG is embedded in a shadow root with 51 others, so ids inside the SVG must be unique per
 * card to avoid clashing in shared CSS.
 */
export interface SolitaireFaceSet {
  /**
   * Render one card as SVG.
   * @param card The card.
   * @returns SVG markup.
   */
  render(card: SolitaireCardValue): string;
}

/**
 * A back's image: one URL, or one per theme id with a fallback for ids it does not know.
 * Theme ids are lowercase identifiers like `win98` or `macos`.
 */
export type SolitaireBackImage =
  | string
  | { readonly byTheme: Readonly<Record<string, string>>; readonly fallback: string };

/** A card back. */
export interface ManifestSolitaireBack extends ManifestBase {
  type: 'umbraDesktopSolitaireBack';
  meta: {
    /** Shown under the swatch in settings. A `#`-prefixed localisation token or a literal. */
    label: string;
    image: SolitaireBackImage;
  };
}

/** A face set. */
export interface ManifestSolitaireFaces extends ManifestBase {
  type: 'umbraDesktopSolitaireFaces';
  /** Loads the module whose default export is the face set. Lazy, so 52 SVGs stay out of the main chunk. */
  loader: () => Promise<{ default: SolitaireFaceSet }>;
  meta: { label: string };
}

/**
 * Adds both types to Umbraco's manifest union, as `umbraco-app.d.ts` does for the host's.
 * This is a global augmentation: nothing is exported, it just enriches the existing type.
 */
declare global {
  interface UmbExtensionManifestMap {
    umbraDesktopSolitaireBack: ManifestSolitaireBack;
    umbraDesktopSolitaireFaces: ManifestSolitaireFaces;
  }
}

/**
 * The URL of a back under a theme. If the back is a simple URL, returns it unchanged. If it's
 * theme-specific, looks up the active theme and returns the fallback for unknown themes.
 * @param image The back's image.
 * @param theme The active theme id, as stamped on the app element.
 * @returns The URL to draw.
 */
export function backImageFor(image: SolitaireBackImage, theme: string | undefined): string {
  if (typeof image === 'string') return image;
  return (theme !== undefined && image.byTheme[theme]) || image.fallback;
}
