/**
 * Live media lists (#137) register one thing with Umbraco: the entry point that starts the media
 * change controller in each window's frame. The desktop page starts its own from the desktop element.
 */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'backofficeEntryPoint',
    alias: 'UmbraDesktop.LiveMedia',
    name: 'UmbraDesktop Live Media',
    js: () => import('./media-change.entrypoint.js'),
  },
];
