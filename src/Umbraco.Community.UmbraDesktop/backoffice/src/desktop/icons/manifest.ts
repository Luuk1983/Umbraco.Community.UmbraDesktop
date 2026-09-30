import type { ManifestIcons } from '@umbraco-cms/backoffice/icon';

/**
 * The desktop's own icon set, handed to Umbraco's icon registry exactly as core hands over its own
 * (`Umb.Icons.Backoffice`), so `umb-icon` resolves these names like any other and every theme
 * styles them the way it styles the Umbraco icons beside them.
 */
export const manifests: Array<ManifestIcons> = [
  {
    type: 'icons',
    alias: 'UmbraDesktop.Icons',
    name: 'UmbraDesktop Icons',
    js: () => import('./icons.js'),
  },
];
