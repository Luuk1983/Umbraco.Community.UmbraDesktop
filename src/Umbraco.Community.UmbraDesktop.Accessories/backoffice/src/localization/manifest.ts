import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * This package's own localisation dictionaries, one manifest per culture.
 *
 * Registered separately from the host's for the reason the Entertainment package gives: Umbraco
 * merges dictionaries by area and key at runtime, so a package ships the area it owns and nothing
 * has to be coordinated between releases. The `accessories` launcher group's heading is the host's
 * and ships there; what lives here is each app's name, which its manifest points at through
 * `meta.label`, and everything the apps themselves say.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'UmbraDesktop.Accessories.Localization.En',
    name: 'UmbraDesktop Accessories English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'UmbraDesktop.Accessories.Localization.Nl',
    name: 'UmbraDesktop Accessories Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
