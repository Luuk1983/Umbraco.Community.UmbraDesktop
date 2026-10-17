import { manifests as localizationManifests } from './localization/manifest.js';

/** Every alias here is namespaced with the package id and final once shipped. */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Services.Media';

/**
 * The media service's context, on the desktop only, as the Arcade's is: the apps that open and save
 * media are elements on the desktop, and a `globalContext` would also start in every window's iframe.
 */
const context: UmbExtensionManifest = {
  type: 'umbraDesktopContext',
  alias: `${ALIAS}.Context`,
  name: 'UmbraDesktop Media service context',
  api: () => import('./context/media.context.js'),
};

/**
 * This package's docs, for the desktop's Help app. The build copies `docs/` into this package's own
 * App_Plugins folder (see `vite.config.ts`); this tells the Help app where to find it.
 */
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: `${ALIAS}.Docs`,
  name: 'UmbraDesktop Media service docs',
  meta: { path: `/App_Plugins/${ALIAS}/docs` },
};

/** The bundle Umbraco loads for this package. */
export const manifests: Array<UmbExtensionManifest> = [context, docs, ...localizationManifests];
