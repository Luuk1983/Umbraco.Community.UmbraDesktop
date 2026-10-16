import { publishRealm } from './realm';
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';
import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';

/**
 * Runs in every backoffice this package loads into, the desktop page and each window's frame alike,
 * and publishes that page's own classes for the views beside the editor to reach. See `realm.ts`.
 * @param _host The entry point's host.
 * @param _registry The page's extension registry.
 */
export const onInit: UmbEntryPointOnInit = (_host, _registry) => {
  publishRealm(window, { UmbModalToken });
};

/**
 * Nothing to undo: what was published is a class reference, and leaving it costs nothing. Declared
 * because Umbraco's entry point type asks for both halves.
 * @param _host The entry point's host.
 * @param _registry The page's extension registry.
 */
export const onUnload: UmbEntryPointOnUnload = (_host, _registry) => {};
