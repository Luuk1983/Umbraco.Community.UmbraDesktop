import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * This package's own localisation dictionaries, one manifest per culture, in its own
 * `umbraDesktopMedia` area: Umbraco merges dictionaries by area and key at runtime, and a package
 * ships the area it owns.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'Umbraco.Community.UmbraDesktop.Media.Localization.En',
    name: 'UmbraDesktop Media Add-on English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'Umbraco.Community.UmbraDesktop.Media.Localization.Nl',
    name: 'UmbraDesktop Media Add-on Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
