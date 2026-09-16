import { UMBRADESKTOP_HAS_CONNECTIONS_CONDITION } from './has-connections.condition';

/**
 * What connections to other Umbraco instances register with Umbraco.
 *
 * Two entries and one relationship between them: the Status app, and the condition that keeps it out
 * of the launcher until there is at least one instance for it to report on. The app is a
 * `umbraDesktopApp` like the games are, because a remote app points at no backoffice surface and so
 * cannot be a curated catalogue entry - nothing to deep link to, no chrome to strip, and an iframe of
 * another origin is the one thing that does not work.
 */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'condition',
    alias: UMBRADESKTOP_HAS_CONNECTIONS_CONDITION,
    name: 'UmbraDesktop Has Connections Condition',
    api: () => import('./has-connections.condition.js'),
  },
  {
    type: 'umbraDesktopApp',
    alias: 'UmbraDesktop.App.ConnectionStatus',
    name: 'UmbraDesktop Connection Status',
    element: () => import('./connection-status.element.js'),
    meta: {
      label: '#umbraDesktop_appConnectionStatus',
      // `icon-connection`, Lucide's `unplug`. Checked against the shipped icon set rather than by its
      // name: `icon-server` reads perfectly and does not exist, which is the trap the taskbar
      // category's icon note describes - a missing alias renders as blank space with no error.
      icon: 'icon-connection',
      group: 'experimental',
      // Wide rather than tall: five columns of which three are version-shaped, and a row per client.
      // An agency with three clients should not have to resize before reading it.
      defaultSize: { w: 860, h: 420 },
      minSize: { w: 560, h: 260 },
      // One window. There is one answer to "what are my instances doing", and two windows of it
      // would only ever differ by how stale each one is.
      allowMultiple: false,
    },
    conditions: [{ alias: UMBRADESKTOP_HAS_CONNECTIONS_CONDITION }],
  },
];
