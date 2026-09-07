import type { ManifestLocalization } from '@umbraco-cms/backoffice/localization';

/**
 * This package's own localisation dictionaries, one manifest per culture.
 *
 * Registered separately from the host's rather than added to them, which is the point: Umbraco
 * merges dictionaries by area and key at runtime, so a package ships the area it owns and nothing
 * has to be coordinated between releases. `docs/desktop-apps.md` §2 asks for exactly this, because
 * `meta.label` is passed through Umbraco's localisation and a token nobody ships resolves to itself.
 *
 * Both are loaded through `js: () => import(...)`, which is Umbraco's own field for a localisation
 * manifest and is unrelated to the `element`/`js` distinction that applies to a `umbraDesktopApp`.
 */
export const manifests: Array<ManifestLocalization> = [
  {
    type: 'localization',
    alias: 'UmbraDesktop.Entertainment.Localization.En',
    name: 'UmbraDesktop Entertainment English',
    meta: { culture: 'en' },
    js: () => import('./en.js'),
  },
  {
    type: 'localization',
    alias: 'UmbraDesktop.Entertainment.Localization.Nl',
    name: 'UmbraDesktop Entertainment Dutch',
    meta: { culture: 'nl' },
    js: () => import('./nl.js'),
  },
];
