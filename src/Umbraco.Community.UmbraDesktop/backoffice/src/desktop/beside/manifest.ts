/**
 * The views beside the editor register one thing with Umbraco: the entry point that publishes each
 * page's own classes, so the desktop can reach a frame's (`realm.ts`). Everything else is wired up
 * from the window element, as the rest of the desktop is.
 */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'backofficeEntryPoint',
    alias: 'UmbraDesktop.WorkspaceViewsBeside.Realm',
    name: 'UmbraDesktop Workspace Views Beside Realm',
    js: () => import('./realm.entrypoint.js'),
  },
];
