import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';
import { UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION } from './in-manager.condition.js';

/** Core's Move to in a media collection's selection bar. */
export const CORE_MEDIA_MOVE_TO = 'Umb.EntityBulkAction.Media.MoveTo';

/**
 * Takes core's Move to out of the selection bar inside a Media Manager window, and only there
 * (17.5.0-rc.1 run, owner 2026-11-04). A Manager window moves items by dragging them and by cut and
 * paste, and with an item open beside the window the bar had more buttons than room. The Media
 * section keeps Move to: it has no other way to move.
 *
 * Core keeps an appended condition by alias and applies it whenever the manifest registers, so this
 * holds whether core's media manifests are in the registry yet or not.
 * @param _host The backoffice's entry point host, not needed.
 * @param registry The extension registry.
 */
export const onInit: UmbEntryPointOnInit = (_host, registry) => {
  registry.appendCondition(CORE_MEDIA_MOVE_TO, { alias: UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION, outside: true } as never);
};

/**
 * Nothing to undo: the appended condition lives as long as the page's registry does. Declared because
 * Umbraco's entry point type asks for both halves.
 * @param _host The backoffice's entry point host.
 * @param _registry The extension registry.
 */
export const onUnload: UmbEntryPointOnUnload = (_host, _registry) => {};
