import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * This package's own localisation dictionaries, one manifest per culture.
 *
 * Its own area rather than a share of an app's, so the words are there whichever add-on brought the
 * service: Umbraco merges dictionaries by area and key at runtime, and a package ships the area it
 * owns.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'UmbraDesktop.ServicesMedia.Localization.En',
    name: 'UmbraDesktop Media service English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'UmbraDesktop.ServicesMedia.Localization.Nl',
    name: 'UmbraDesktop Media service Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
