import type { UmbEntryPointOnInit, UmbEntryPointOnUnload } from '@umbraco-cms/backoffice/extension-api';
import { ScreensaverWatcher } from './watcher.js';
import { UmbraDesktopAccessoriesSettingsController } from '../settings/settings.source.js';

/** The one watcher, kept so {@link onUnload} can stop it. */
let watcher: ScreensaverWatcher | undefined;

/**
 * Start watching for an idle desktop, once, when the backoffice loads this package.
 *
 * An entry point rather than something the desktop element starts, because the screensaver is this
 * package's and the desktop has no hook for it, and rather than something the Screen Saver window
 * starts, because the screensaver has to come on with that window closed. It costs one timer a
 * second, which does nothing until the setting is on and the desktop is showing.
 *
 * The settings controller hangs off the backoffice's own host, so it is there for as long as the
 * backoffice is, and it follows changes made in the Screen Saver window.
 * @param host The backoffice's root element.
 */
export const onInit: UmbEntryPointOnInit = (host) => {
  if (watcher) return;
  watcher = new ScreensaverWatcher({ settings: new UmbraDesktopAccessoriesSettingsController(host) });
  watcher.start();
};

/** Stop watching, when the backoffice unloads this package. */
export const onUnload: UmbEntryPointOnUnload = () => {
  watcher?.stop();
  watcher = undefined;
};
