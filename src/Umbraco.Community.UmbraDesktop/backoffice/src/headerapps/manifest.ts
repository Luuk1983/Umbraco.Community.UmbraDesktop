import { UMBRADESKTOP_SECTION_ALIAS } from '../desktop/constants';
import { UMB_SECTION_USER_PERMISSION_CONDITION_ALIAS } from '@umbraco-cms/backoffice/section';

/**
 * Header-app manifests: the top-right desktop launcher. Gated on the section-user-permission
 * condition so it renders only for users who may access the Desktop section — the same grant
 * that makes the section reachable, keeping launcher visibility and route access in sync.
 */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'headerApp',
    alias: 'Umbraco.Community.UmbraDesktop.HeaderApp',
    name: 'UmbraDesktop Launcher Header App',
    // Header apps sort by weight descending (Search 900, Help 500, Current User 0). The user
    // app must stay last (rightmost), so keep this above 0; 100 places us between Help and the
    // user → Search · Help · Desktop · User.
    weight: 100,
    element: () => import('./header-app.element.js'),
    conditions: [
      {
        alias: UMB_SECTION_USER_PERMISSION_CONDITION_ALIAS,
        match: UMBRADESKTOP_SECTION_ALIAS,
      },
    ],
  },
];
