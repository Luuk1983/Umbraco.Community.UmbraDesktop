/**
 * GENERATED FILE — do not edit.
 *
 * Written by `scripts/build-wallpapers.mjs` from the images in `wallpapers-src/`.
 * To change this list, add or remove a source image and run `npm run build`.
 */

/** One wallpaper shipped inside the package. */
export interface UmbraDesktopBuiltInWallpaper {
  /** Stable id, derived from the source filename. Persisted in the user's settings. */
  id: string;
  /** Display name shown in the picker. */
  name: string;
  /** Absolute URL of the full-size image. */
  url: string;
  /** Absolute URL of the picker thumbnail. */
  thumbUrl: string;
  /** Mean colour of the image, painted underneath it while it decodes. */
  averageColour: string;
}

/** Every wallpaper shipped inside the package, ordered by id. */
export const UMBRADESKTOP_BUILTIN_WALLPAPERS: ReadonlyArray<UmbraDesktopBuiltInWallpaper> = [
  {
    id: 'aurora-flow',
    name: 'Aurora Flow',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/aurora-flow.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/aurora-flow.thumb.avif',
    averageColour: '#302077',
  },
  {
    id: 'blueprint-core',
    name: 'Blueprint Core',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/blueprint-core.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/blueprint-core.thumb.avif',
    averageColour: '#14184e',
  },
  {
    id: 'dusk-horizon',
    name: 'Dusk Horizon',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/dusk-horizon.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/dusk-horizon.thumb.avif',
    averageColour: '#5453a1',
  },
  {
    id: 'ember-glow',
    name: 'Ember Glow',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/ember-glow.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/ember-glow.thumb.avif',
    averageColour: '#241f20',
  },
  {
    id: 'golden-valley',
    name: 'Golden Valley',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/golden-valley.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/golden-valley.thumb.avif',
    averageColour: '#755d50',
  },
  {
    id: 'midnight-wave',
    name: 'Midnight Wave',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/midnight-wave.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/midnight-wave.thumb.avif',
    averageColour: '#232272',
  },
  {
    id: 'retro-swoosh',
    name: 'Retro Swoosh',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/retro-swoosh.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/retro-swoosh.thumb.avif',
    averageColour: '#b7c0b2',
  },
  {
    id: 'ribbon-candy',
    name: 'Ribbon Candy',
    url: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/ribbon-candy.avif',
    thumbUrl: '/App_Plugins/Umbraco.Community.UmbraDesktop/wallpapers/ribbon-candy.thumb.avif',
    averageColour: '#dcc3ce',
  },
];

/** The wallpaper used on a fresh install, and whenever a stored preference cannot be resolved. */
export const UMBRADESKTOP_DEFAULT_WALLPAPER_ID = 'aurora-flow';
