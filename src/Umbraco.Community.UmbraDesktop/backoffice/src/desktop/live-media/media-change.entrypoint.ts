import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';
import { findHostDesktopContext } from '../host-desktop.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbraDesktopMediaChangeController } from './media-change.controller.js';

/**
 * Start the media change controller in a page, when that page is a window on a desktop (#137).
 * A page that is not framed (the plain backoffice, or the desktop page, which starts its own from
 * the desktop element) and a frame with no desktop above it are left as core makes them.
 * @param host Where the page's global contexts are found.
 * @param view The page's window.
 * @returns The controller, or undefined when it was not started.
 */
export function startInDesktopFrame(host: UmbControllerHost, view: Window = window): UmbraDesktopMediaChangeController | undefined {
  if (!findHostDesktopContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, view)) return undefined;
  return new UmbraDesktopMediaChangeController(host);
}

/**
 * Runs in every backoffice this package loads into, and starts the controller in the ones that are
 * windows on a desktop. See {@link UmbraDesktopMediaChangeController}.
 * @param host The entry point's host: the page's app element.
 * @param _registry The page's extension registry.
 */
export const onInit: UmbEntryPointOnInit = (host, _registry) => {
  startInDesktopFrame(host);
};

/**
 * Nothing to undo: the controller lives on the page's host and goes with it. Declared because
 * Umbraco's entry point type asks for both halves.
 * @param _host The entry point's host.
 * @param _registry The page's extension registry.
 */
export const onUnload: UmbEntryPointOnUnload = (_host, _registry) => {};
