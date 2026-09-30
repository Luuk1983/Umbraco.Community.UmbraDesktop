import { UMBRADESKTOP_HAS_CONNECTIONS_CONDITION } from '../connections/has-connections.condition';
import { UMB_SECTION_USER_PERMISSION_CONDITION_ALIAS } from '@umbraco-cms/backoffice/section';

/**
 * What the remote content viewer registers: the app, and the entrypoint that makes a remote viewer
 * frame read-only from the inside.
 */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'umbraDesktopApp',
    alias: 'UmbraDesktop.App.RemoteContent',
    name: 'UmbraDesktop Remote Content',
    element: () => import('./remote-viewer.element.js'),
    meta: {
      label: '#umbraDesktop_appRemoteContent',
      // Checked against the shipped icon set: an alias that does not exist renders as blank space.
      icon: 'icon-globe',
      group: 'experimental',
      // A backoffice inside a window: the section sidebar plus a workspace needs the room.
      defaultSize: { w: 1100, h: 720 },
      minSize: { w: 760, h: 420 },
      // One window. Each one is a whole backoffice, and the switcher is how to look at another site.
      allowMultiple: false,
    },
    conditions: [
      // Offered only when there is somewhere to look, the same gate as Connection status.
      { alias: UMBRADESKTOP_HAS_CONNECTIONS_CONDITION },
      // And only to someone with the Content section here, because the proxy behind it demands
      // exactly that (ConnectionProxyController). Without this the app would open for anyone and
      // then have every read refused.
      { alias: UMB_SECTION_USER_PERMISSION_CONDITION_ALIAS, match: 'Umb.Section.Content' },
    ],
  },
  {
    // Inert everywhere except inside a remote viewer frame, where it makes the interface read-only.
    type: 'backofficeEntryPoint',
    alias: 'UmbraDesktop.RemoteContent.FrameEntrypoint',
    name: 'UmbraDesktop Remote Content Frame Entrypoint',
    js: () => import('./frame-read-only.entrypoint.js'),
  },
];
