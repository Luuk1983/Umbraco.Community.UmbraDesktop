import { IMAGE_EDITOR_CONTENT_SIZE, IMAGE_EDITOR_MIN_CONTENT_SIZE } from './image-editor/constants.js';
import { AREA } from './shared/area.js';
import { manifests as localizationManifests } from './localization/manifest.js';

/**
 * The prefix every alias in this package carries. An alias is what pins a favourite, so it is
 * namespaced with the package id and final: renaming one later loses every pin made on it.
 */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Media';

/**
 * The Media group, defined by the package whose apps fill it, as Accessories defines its own.
 *
 * 52 on the launcher's own scale, lower first: after the host's System (50) and before Accessories
 * (55), because fixing an image is closer to an editor's work than a tool is, and further from a
 * game. Owner's choice, 2026-10-17.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: `${ALIAS}.Catalogue`,
  name: 'UmbraDesktop Media catalogue',
  meta: {
    groups: [{ alias: 'media', label: `#${AREA}_groupMedia`, weight: 52 }],
  },
};

/**
 * The Image Editor. Accessories' reasoning for each field: `element` and never `js`; an explicit
 * `weight` (1000, leaving room below it for the media apps to come); sizes that are the app's content
 * box, derived in its `constants.ts`; and no `conditions`. Several windows, so two images can be
 * edited side by side.
 */
const imageEditor: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: `${ALIAS}.ImageEditor`,
  name: 'ImageEditor',
  element: (() => import('./image-editor/image-editor.element.js')) as () => Promise<{ element: CustomElementConstructor }>,
  weight: 1000,
  meta: {
    label: `#${AREA}_imageEditor`,
    icon: 'icon-picture',
    group: 'media',
    defaultSize: IMAGE_EDITOR_CONTENT_SIZE,
    minSize: IMAGE_EDITOR_MIN_CONTENT_SIZE,
    allowMultiple: true,
  },
};

/** This package's docs, for the desktop's Help app; the build copies `docs/` where this points. */
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: `${ALIAS}.Docs`,
  name: 'UmbraDesktop Media docs',
  meta: { path: `/App_Plugins/${ALIAS}/docs` },
};

/**
 * The bundle Umbraco loads for this package. The `umbraDesktop*` arms of `UmbExtensionManifest` come
 * from `umbradesktop-app.d.ts` in this folder, a copy of the other add-ons'.
 */
export const manifests: Array<UmbExtensionManifest> = [catalogue, imageEditor, docs, ...localizationManifests];
