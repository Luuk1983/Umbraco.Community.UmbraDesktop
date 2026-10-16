import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * This package's own localisation dictionaries, one manifest per culture.
 *
 * Registered separately from the host's for the reason the other add-ons give: Umbraco merges
 * dictionaries by area and key at runtime, so a package ships the area it owns and nothing has to
 * be coordinated between releases. What lives here is the Games group's heading and everything the
 * Arcade hub says.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'UmbraDesktop.Arcade.Localization.En',
    name: 'UmbraDesktop Arcade English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'UmbraDesktop.Arcade.Localization.Nl',
    name: 'UmbraDesktop Arcade Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
