import { manifests as localizationManifests } from './localization/manifest.js';
import { OPTIMIZE_CONTENT_SIZE, OPTIMIZE_MIN_CONTENT_SIZE, UMBRADESKTOP_OPTIMIZE_APP } from './optimize/constants.js';

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
 * The Optimize images window (#139): one per run, so several runs can go side by side and each has
 * its own title and progress (D3); never in the launcher, since a run always starts from a set of
 * images (D4). Its location is the run's id. For someone who may use the Media section, as the Media
 * add-on's apps are, because a run saves media items. Sizes are the app's content box, derived in
 * `optimize/constants.ts`.
 */
const optimizeImages: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: UMBRADESKTOP_OPTIMIZE_APP,
  name: 'UmbraDesktop Optimize images',
  element: (() => import('./optimize/optimize-window.element.js')) as () => Promise<{ element: CustomElementConstructor }>,
  meta: {
    label: '#umbraDesktopServicesMedia_optimizeImages',
    icon: 'icon-picture',
    defaultSize: OPTIMIZE_CONTENT_SIZE,
    minSize: OPTIMIZE_MIN_CONTENT_SIZE,
    allowMultiple: true,
    hideFromLauncher: true,
  },
  conditions: [{ alias: 'Umb.Condition.SectionUserPermission', match: 'Umb.Section.Media' }] as never,
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
export const manifests: Array<UmbExtensionManifest> = [context, optimizeImages, docs, ...localizationManifests];
