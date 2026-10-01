/**
 * The built-in card backs and face set, registered through the same manifest types a third party
 * uses, so that path is exercised by this package itself (design D11).
 */
import type { ManifestSolitaireBack, ManifestSolitaireFaces, SolitaireBackImage } from './extensions.js';

/** Alias of the back that follows the theme. Final once shipped: stored settings name it. */
export const THEME_BACK_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Back.Theme';

/** Alias of the default face set. Final once shipped. */
export const CLASSIC_FACES_ALIAS = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Faces.Classic';

/** Where `scripts/build-card-backs.mjs` writes, as served from the package's static assets. */
export const BACK_BASE_URL = '/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment/solitaire/backs/';

/** Each shipped theme's back file: cut from that theme's wallpaper, or drawn for it (design D8). */
const THEME_FILES = {
  umbraco: 'aurora-flow.avif',
  umbraco4: 'retro-swoosh.avif',
  macos: 'first-light.avif',
  win11: 'cobalt-beacon.avif',
  win98: 'win98.svg',
} as const;

/** Match theme's image: the active theme's back, the Umbraco one for a theme it does not know. */
export const THEME_BACK_IMAGE: SolitaireBackImage = {
  byTheme: Object.fromEntries(
    Object.entries(THEME_FILES).map(([id, file]) => [id, BACK_BASE_URL + file]),
  ),
  fallback: BACK_BASE_URL + THEME_FILES.umbraco,
};

/**
 * Alias namespace of the original backs. Final once shipped: stored settings name them. A future
 * back is one more entry in {@link ORIGINAL_BACKS} and one more file.
 */
const ORIGINAL_ALIAS_PREFIX = 'Umbraco.Community.UmbraDesktop.Entertainment.Solitaire.Back.';

/**
 * The original backs: not cut from a wallpaper and not tied to a theme, so they look the same
 * everywhere. Listed after Match theme in this order.
 */
const ORIGINAL_BACKS = [
  { id: 'Rabbit', file: 'rabbit.avif', label: '#umbraDesktopEntertainment_solitaireBackRabbit' },
  { id: 'Codegarden', file: 'codegarden.avif', label: '#umbraDesktopEntertainment_solitaireBackCodegarden' },
  { id: 'CodeCabin', file: 'codecabin.avif', label: '#umbraDesktopEntertainment_solitaireBackCodeCabin' },
  { id: 'DutchUmbracoAlliance', file: 'dutch-umbraco-alliance.avif', label: '#umbraDesktopEntertainment_solitaireBackDutchUmbracoAlliance' },
] as const;

/**
 * Match theme first, then the original backs. The five per-theme backs are not manifests of their
 * own: they exist only as Match theme's images, so the picker offers one choice that follows the
 * theme instead of five that look like a theme choice. Umbraco weights: higher sorts first.
 */
export const backManifests: ManifestSolitaireBack[] = [
  {
    type: 'umbraDesktopSolitaireBack',
    alias: THEME_BACK_ALIAS,
    name: 'Solitaire back: match theme',
    weight: 1000,
    meta: { label: '#umbraDesktopEntertainment_solitaireBackTheme', image: THEME_BACK_IMAGE },
  },
  ...ORIGINAL_BACKS.map((back, i) => ({
    type: 'umbraDesktopSolitaireBack' as const,
    alias: ORIGINAL_ALIAS_PREFIX + back.id,
    name: `Solitaire back: ${back.id}`,
    weight: 900 - i * 100,
    meta: { label: back.label, image: BACK_BASE_URL + back.file },
  })),
];

/** The default face set. */
export const facesManifests: ManifestSolitaireFaces[] = [
  {
    type: 'umbraDesktopSolitaireFaces',
    alias: CLASSIC_FACES_ALIAS,
    name: 'Solitaire faces: Classic',
    weight: 1000,
    loader: () => import('./faces/classic/classic.js'),
    meta: { label: '#umbraDesktopEntertainment_solitaireFacesClassic' },
  },
];
