import { manifests as localizationManifests } from './localization/manifest.js';
import { IMAGE_EDITOR_CONTENT_SIZE, IMAGE_EDITOR_MIN_CONTENT_SIZE } from './image-editor/constants.js';
import { UMBRADESKTOP_MEDIA_MANAGER_APP } from './manager/manager-window.context.js';
import { UMBRADESKTOP_MEDIA_TRANSFERS_APP } from './transfers/transfers-app.js';
import { UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION } from './manager/in-manager.condition.js';
import { UMBRADESKTOP_MEDIA_RENAME_MODAL_ALIAS } from './selection/rename-dialog.element.js';
import { UMBRADESKTOP_CLIPBOARD_HOLDS_CONDITION } from './manager/clipboard-holds.condition.js';
import {
  UMBRADESKTOP_MEDIA_BIN_TREE,
  UMBRADESKTOP_MEDIA_BIN_TREE_REPOSITORY,
  UMBRADESKTOP_MEDIA_FOLDER_TREE,
  UMBRADESKTOP_MEDIA_FOLDER_TREE_REPOSITORY,
} from './tree/constants.js';

/**
 * The prefix every alias in this package carries. An alias is what pins a favourite, so it is
 * namespaced with the package id and final once shipped: renaming one later loses every pin made on it.
 */
export const UMBRADESKTOP_MEDIA_ALIAS = 'Umbraco.Community.UmbraDesktop.Media';

/**
 * The Media group, defined by the package whose apps fill it, as Accessories defines its own: the
 * Media Manager, the Image Editor, and the media tools to come.
 *
 * 52 on the launcher's own scale, lower first: after the host's System (50) and before Accessories
 * (55), because working on media is closer to an editor's work than a tool is. Owner's choice,
 * 2026-10-17 (weight) and 2026-10-18 (the Media Manager joins it).
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.Catalogue`,
  name: 'UmbraDesktop Media catalogue',
  meta: {
    groups: [{ alias: 'media', label: '#umbraDesktopMedia_groupMedia', weight: 52 }],
  },
};

/**
 * The only rule the package's apps show under: someone who may use the Media section. Everything
 * inside a Media Manager is the Media section's own, and the Image Editor saves to media items, which
 * the management API refuses without it. Owner's choice for the Image Editor, 2026-10-19, so the two
 * apps of one group show or hide together.
 */
const mediaSection = [{ alias: 'Umb.Condition.SectionUserPermission', match: 'Umb.Section.Media' }] as never;

/**
 * The Media Manager: core's media library in desktop windows, as many as you like. First in the
 * group (owner, 2026-10-19), so its root `weight` is above the Image Editor's: higher sorts first, as
 * everywhere in Umbraco, and an unset weight would have put it last.
 */
const mediaManager: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: UMBRADESKTOP_MEDIA_MANAGER_APP,
  name: 'UmbraDesktop Media Manager',
  element: () => import('./manager/manager.element.js'),
  weight: 1100,
  meta: {
    label: '#umbraDesktopMedia_mediaManager',
    icon: 'icon-folders',
    group: 'media',
    defaultSize: { w: 1100, h: 700 },
    minSize: { w: 640, h: 420 },
    allowMultiple: true,
  },
  conditions: mediaSection,
};

/**
 * The Image Editor (#136): `element` and never `js`, since the desktop reads only `element`; sizes
 * that are the app's content box, derived in its `constants.ts`; several windows, so two images can be
 * edited side by side. 1000 leaves room below it for the media tools to come.
 */
const imageEditor: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.ImageEditor`,
  name: 'UmbraDesktop Image Editor',
  element: (() => import('./image-editor/image-editor.element.js')) as () => Promise<{ element: CustomElementConstructor }>,
  weight: 1000,
  meta: {
    label: '#umbraDesktopMedia_imageEditor',
    icon: 'icon-picture',
    group: 'media',
    defaultSize: IMAGE_EDITOR_CONTENT_SIZE,
    minSize: IMAGE_EDITOR_MIN_CONTENT_SIZE,
    allowMultiple: true,
  },
  conditions: mediaSection,
};

/**
 * The Transfers window (design §7): one for the desktop, opened by the add-on's desktop context when a
 * transfer is still running after two seconds, never from the launcher.
 */
const transfers: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: UMBRADESKTOP_MEDIA_TRANSFERS_APP,
  name: 'UmbraDesktop Media Transfers',
  element: () => import('./transfers/transfers.element.js'),
  meta: {
    label: '#umbraDesktopMedia_transfers',
    icon: 'icon-cloud-upload',
    group: 'media',
    defaultSize: { w: 560, h: 520 },
    minSize: { w: 420, h: 300 },
    allowMultiple: false,
    hideFromLauncher: true,
  },
  conditions: mediaSection,
};

/**
 * The tree beside a manager window (design §17): core's default tree on data of our own, folders only,
 * since core's tree has no working filter and the media tree's API no folders-only option. Core draws
 * it, so its items, menus and reloads are the Media section's.
 */
const folderTree: Array<UmbExtensionManifest> = [
  {
    type: 'repository',
    alias: UMBRADESKTOP_MEDIA_FOLDER_TREE_REPOSITORY,
    name: 'UmbraDesktop Media folder tree repository',
    api: () => import('./tree/folder-tree.repository.js'),
  },
  {
    type: 'tree',
    kind: 'default',
    alias: UMBRADESKTOP_MEDIA_FOLDER_TREE,
    name: 'UmbraDesktop Media folder tree',
    meta: { repositoryAlias: UMBRADESKTOP_MEDIA_FOLDER_TREE_REPOSITORY },
  },
];

/** The recycle bin at the tree's foot, as one row that never expands (design §17). */
const binTree: Array<UmbExtensionManifest> = [
  {
    type: 'repository',
    alias: UMBRADESKTOP_MEDIA_BIN_TREE_REPOSITORY,
    name: 'UmbraDesktop Media recycle bin tree repository',
    api: () => import('./tree/bin-tree.repository.js'),
  },
  {
    type: 'tree',
    kind: 'default',
    alias: UMBRADESKTOP_MEDIA_BIN_TREE,
    name: 'UmbraDesktop Media recycle bin tree',
    meta: { repositoryAlias: UMBRADESKTOP_MEDIA_BIN_TREE_REPOSITORY },
  },
];

/** True only inside a manager window: what keeps our actions out of the Media section (design §1). */
const inManager: UmbExtensionManifest = {
  type: 'condition',
  alias: UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION,
  name: 'UmbraDesktop in a Media Manager window',
  api: () => import('./manager/in-manager.condition.js'),
};

/** "Open in new window" on a folder, its card and its tree item, and on the Media root (design §2). */
const openInNewWindow: UmbExtensionManifest = {
  type: 'entityAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.OpenInNewWindow`,
  name: 'UmbraDesktop Open in new window',
  weight: 2000,
  api: () => import('./manager/actions/open-in-new-window.action.js'),
  forEntityTypes: ['media', 'media-root'],
  meta: { label: '#umbraDesktopMedia_openInNewWindow', icon: 'icon-window-popout' },
  conditions: [{ alias: UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION, folder: true } as never],
};

/**
 * The add-on's desktop context: the clipboard every manager window shares, and the operations they
 * start, which run here so they outlive the window that started them (design §7). On the desktop only,
 * as the Arcade's is, never in the plain backoffice or a window's iframe.
 */
const context: UmbExtensionManifest = {
  type: 'umbraDesktopContext',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.Context`,
  name: 'UmbraDesktop Media context',
  api: () => import('./context/media-manager.context.js'),
};

/** True while something is cut or copied: what shows Paste (design §5). */
const clipboardHolds: UmbExtensionManifest = {
  type: 'condition',
  alias: UMBRADESKTOP_CLIPBOARD_HOLDS_CONDITION,
  name: 'UmbraDesktop Media clipboard holds something',
  api: () => import('./manager/clipboard-holds.condition.js'),
};

/** Only inside a manager window, and not on what is in the recycle bin. */
const onItemsInManager = [
  { alias: UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION },
  { alias: 'Umb.Condition.EntityIsNotTrashed' },
] as never;

/** Cut and Copy at the top of an item's menu (design §5). */
const cut: UmbExtensionManifest = {
  type: 'entityAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.Cut`,
  name: 'UmbraDesktop Cut',
  weight: 1990,
  api: () => import('./manager/actions/cut.action.js'),
  forEntityTypes: ['media'],
  meta: { label: '#umbraDesktopMedia_cut', icon: 'icon-cut' },
  conditions: onItemsInManager,
};

const copy: UmbExtensionManifest = {
  type: 'entityAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.Copy`,
  name: 'UmbraDesktop Copy',
  weight: 1980,
  api: () => import('./manager/actions/copy.action.js'),
  forEntityTypes: ['media'],
  meta: { label: '#umbraDesktopMedia_copy', icon: 'icon-clipboard-copy' },
  conditions: onItemsInManager,
};

/** Paste on a folder's menu, its card and tree item, and the Media root's, while something is held. */
const paste: UmbExtensionManifest = {
  type: 'entityAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.Paste`,
  name: 'UmbraDesktop Paste',
  weight: 1970,
  api: () => import('./manager/actions/paste.action.js'),
  forEntityTypes: ['media', 'media-root'],
  meta: { label: '#umbraDesktopMedia_paste', icon: 'icon-clipboard-paste' },
  conditions: [
    { alias: UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION, folder: true },
    { alias: UMBRADESKTOP_CLIPBOARD_HOLDS_CONDITION },
    { alias: 'Umb.Condition.EntityIsNotTrashed' },
  ] as never,
};

/** In core's selection bar of a manager window's media collection, beside core's own actions. */
const inManagerSelectionBar = [
  { alias: 'Umb.Condition.CollectionAlias', match: 'Umb.Collection.Media' },
  { alias: UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION },
] as never;

const bulkCut: UmbExtensionManifest = {
  type: 'entityBulkAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.BulkCut`,
  name: 'UmbraDesktop Cut selection',
  weight: 40,
  api: () => import('./manager/actions/bulk-cut.action.js'),
  forEntityTypes: ['media'],
  meta: { label: '#umbraDesktopMedia_cut', icon: 'icon-cut' },
  conditions: inManagerSelectionBar,
};

const bulkCopy: UmbExtensionManifest = {
  type: 'entityBulkAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.BulkCopy`,
  name: 'UmbraDesktop Copy selection',
  weight: 35,
  api: () => import('./manager/actions/bulk-copy.action.js'),
  forEntityTypes: ['media'],
  meta: { label: '#umbraDesktopMedia_copy', icon: 'icon-clipboard-copy' },
  conditions: inManagerSelectionBar,
};

/** Copy to, next to core's Move to, so copying never needs a key (design §5). */
const copyTo: UmbExtensionManifest = {
  type: 'entityBulkAction',
  kind: 'default',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.CopyTo`,
  name: 'UmbraDesktop Copy to',
  weight: 21,
  api: () => import('./manager/actions/copy-to.action.js'),
  forEntityTypes: ['media'],
  meta: { label: '#umbraDesktopMedia_copyTo', icon: 'icon-documents' },
  conditions: inManagerSelectionBar,
};

/** The Rename dialog F2 opens in a manager window (plan phase 3). */
const renameDialog: UmbExtensionManifest = {
  type: 'modal',
  alias: UMBRADESKTOP_MEDIA_RENAME_MODAL_ALIAS,
  name: 'UmbraDesktop Media Rename dialog',
  element: () => import('./selection/rename-dialog.element.js'),
};

/**
 * This package's docs, for the desktop's Help app. The build copies `docs/` into this package's own
 * App_Plugins folder (see `vite.config.ts`); this tells the Help app where to find it.
 */
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: `${UMBRADESKTOP_MEDIA_ALIAS}.Docs`,
  name: 'UmbraDesktop Media Add-on docs',
  meta: { path: `/App_Plugins/${UMBRADESKTOP_MEDIA_ALIAS}/docs` },
};

/** The bundle Umbraco loads for this package. */
export const manifests: Array<UmbExtensionManifest> = [
  catalogue,
  mediaManager,
  imageEditor,
  ...folderTree,
  ...binTree,
  transfers,
  inManager,
  clipboardHolds,
  context,
  openInNewWindow,
  cut,
  copy,
  paste,
  bulkCut,
  bulkCopy,
  copyTo,
  renameDialog,
  docs,
  ...localizationManifests,
];
