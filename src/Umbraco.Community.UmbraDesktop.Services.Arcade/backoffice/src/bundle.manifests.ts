import { manifests as localizationManifests } from './localization/manifest.js';
import { HUB_CONTENT_SIZE, HUB_MIN_CONTENT_SIZE } from './hub/constants.js';
import { UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION } from './conditions/has-games.condition.alias.js';
import { UMBRADESKTOP_ARCADE_PRIVACY_MODAL_ALIAS } from './context/privacy-modal.token.js';
import { AREA } from './shared/area.js';

/** Every alias here is namespaced with the package id and final once shipped. */
const ALIAS = 'Umbraco.Community.UmbraDesktop.Services.Arcade';

/**
 * The Games launcher group. It used to be Entertainment's; it moved here because every game brings
 * the Arcade, and an outside game installed without Entertainment would otherwise land under More.
 * Same alias and weight as before (60, on the launcher's own lower-first scale, between the host's
 * System at 50 and Experimental at 70), so nothing anyone sees moves. Pins hang off app aliases, not
 * the group's owner.
 */
const catalogue: UmbExtensionManifest = {
  type: 'umbraDesktopCatalogue',
  alias: `${ALIAS}.Catalogue`,
  name: 'UmbraDesktop Arcade catalogue',
  meta: { groups: [{ alias: 'games', label: `#${AREA}_groupGames`, weight: 60 }] },
};

/**
 * The Arcade's context, on the desktop only (design D3). Deliberately not a `globalContext`, which
 * would also run in the plain backoffice and in every window's iframe.
 */
const context: UmbExtensionManifest = {
  type: 'umbraDesktopContext',
  alias: `${ALIAS}.Context`,
  name: 'UmbraDesktop Arcade context',
  api: () => import('./context/arcade.context.js'),
};

/** Permits the hub once a game is registered, so it is never in the launcher with nothing in it. */
const hasGames: UmbExtensionManifest = {
  type: 'condition',
  alias: UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION,
  name: 'UmbraDesktop Arcade has games',
  api: () => import('./conditions/has-games.condition.js'),
};

/** The one-time privacy question, opened through Umbraco's modal manager. */
const privacyModal: UmbExtensionManifest = {
  type: 'modal',
  alias: UMBRADESKTOP_ARCADE_PRIVACY_MODAL_ALIAS,
  name: 'UmbraDesktop Arcade privacy question',
  element: () => import('./context/privacy-modal.element.js'),
};

/**
 * The hub. Weight 100: after the games themselves, which sit at 800 to 1000 (Umbraco's scale,
 * higher first). One window only: one hub is all anyone needs.
 */
const hub: UmbExtensionManifest = {
  type: 'umbraDesktopApp',
  alias: `${ALIAS}.Hub`,
  name: 'Arcade',
  element: () => import('./hub/hub.element.js'),
  weight: 100,
  conditions: [{ alias: UMBRADESKTOP_ARCADE_HAS_GAMES_CONDITION }],
  meta: {
    label: `#${AREA}_hub`,
    icon: 'icon-trophy',
    group: 'games',
    defaultSize: HUB_CONTENT_SIZE,
    minSize: HUB_MIN_CONTENT_SIZE,
    allowMultiple: false,
  },
};

/**
 * This package's docs, for the desktop's Help app. The build copies `docs/` into this package's own
 * App_Plugins folder (see `vite.config.ts`); this tells the Help app where to find it.
 */
const docs: UmbExtensionManifest = {
  type: 'umbraDesktopDocs',
  alias: `${ALIAS}.Docs`,
  name: 'UmbraDesktop Arcade docs',
  meta: { path: `/App_Plugins/${ALIAS}/docs` },
};

/** The bundle Umbraco loads for this package. */
export const manifests: Array<UmbExtensionManifest> = [catalogue, context, hasGames, privacyModal, hub, docs, ...localizationManifests];
