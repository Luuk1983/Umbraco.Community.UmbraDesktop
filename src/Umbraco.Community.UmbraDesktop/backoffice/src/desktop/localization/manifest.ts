import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * The `umbraDesktop` localization dictionaries (en/nl) for the launcher's new strings —
 * app friendly names, group labels, and launcher chrome. Registered alongside the core
 * per-culture localization manifests; Umbraco merges dictionaries by area/key at runtime.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'UmbraDesktop.Localization.En',
    name: 'UmbraDesktop English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'UmbraDesktop.Localization.Nl',
    name: 'UmbraDesktop Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
