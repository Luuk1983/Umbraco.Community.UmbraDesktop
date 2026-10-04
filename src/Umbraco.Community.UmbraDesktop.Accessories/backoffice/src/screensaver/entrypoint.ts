import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';
import { ScreensaverWatcher } from './watcher.js';
import { UmbraDesktopAccessoriesSettingsController } from '../settings/settings.source.js';

/** The one watcher, kept so {@link onUnload} can stop it. */
let watcher: ScreensaverWatcher | undefined;

/**
 * Start watching for an idle desktop, once, when the backoffice loads this package.
 *
 * An entry point rather than something the desktop element starts, because the screensaver is this
 * package's and the desktop has no hook for it, and rather than something the settings box
 * starts, because the screensaver has to come on with Desktop settings closed. It costs one timer a
 * second, which does nothing until the setting is on and the desktop is showing.
 *
 * The settings controller hangs off the backoffice's own host, so it is there for as long as the
 * backoffice is, and it follows a change wherever it is made. It reads the settings from the
 * desktop's package settings context, which is global, so it is reachable here outside the
 * desktop; the desktop reads the user's account once someone is signed in. Until that read
 * answers the screensaver counts as off, the default.
 * @param host The backoffice's root element.
 */
export const onInit: UmbEntryPointOnInit = (host) => {
  if (watcher) return;
  watcher = new ScreensaverWatcher({ settings: new UmbraDesktopAccessoriesSettingsController(host) });
  watcher.start();
};

/**
 * Stop watching when the backoffice unloads this package. The settings store is the desktop's, so
 * it is not this package's to close.
 */
export const onUnload: UmbEntryPointOnUnload = () => {
  watcher?.stop();
  watcher = undefined;
};
