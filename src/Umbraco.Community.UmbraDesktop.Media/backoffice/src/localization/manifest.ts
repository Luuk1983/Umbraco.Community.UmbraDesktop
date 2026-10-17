import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * This package's own localisation dictionaries, one manifest per culture.
 *
 * Its own area, for the reason the other add-ons give: Umbraco merges dictionaries by area and key at
 * runtime, so a package ships the area it owns. What lives here is the Media group's heading, which
 * this package's catalogue defines, each app's name, and everything the apps say. The File page's
 * words are Services.Media's, in that package's area.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'UmbraDesktop.Media.Localization.En',
    name: 'UmbraDesktop Media English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'UmbraDesktop.Media.Localization.Nl',
    name: 'UmbraDesktop Media Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
