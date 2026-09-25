import { UMBRADESKTOP_AI_CHAT_FEATURE } from './ai-chat/index.js';
import { UMBRADESKTOP_PINNED_APPS_FEATURE } from './pinned-apps/index.js';
import { UMBRADESKTOP_FULLSCREEN_FEATURE } from './fullscreen/index.js';
import { isFeatureEnabled } from './enabled.js';
import type {
  UmbraDesktopTaskbarFeature,
  UmbraDesktopTaskbarFeatureContext,
  UmbraDesktopTaskbarRegion,
  UmbraDesktopTaskbarRegionInfo,
} from './types';

/**
 * Every fixed taskbar feature the shell knows about.
 *
 * Curated rather than an extension point, the same way `theme/themes/index.ts` and
 * `settings/categories/index.ts` are: a feature is a folder plus one entry here, and a package
 * cannot add itself. The order within a region is the shell's — as it is in Windows — so the user
 * cannot reorder the row and nothing shifts position when a feature is switched off.
 *
 * Declared in weight order for readability, but read through {@link taskbarFeaturesIn}, which sorts:
 * an array whose order happens to match its weights is one careless insertion away from being two
 * orders that disagree.
 */
export const UMBRADESKTOP_TASKBAR_FEATURES: ReadonlyArray<UmbraDesktopTaskbarFeature> = [
  UMBRADESKTOP_AI_CHAT_FEATURE,
  UMBRADESKTOP_PINNED_APPS_FEATURE,
  UMBRADESKTOP_FULLSCREEN_FEATURE,
];

/**
 * The regions, in the order Desktop settings shows them, each with the heading it shows.
 *
 * Windows groups the same two — taskbar items above system tray icons — and this is that order,
 * launching half first. Settings draws a heading per region and skips one with nothing in it, so
 * the tray is declared here with its own name while contributing an invisible empty group, and the
 * first tray feature becomes visible without a change to the screen.
 */
export const UMBRADESKTOP_TASKBAR_REGIONS: ReadonlyArray<UmbraDesktopTaskbarRegionInfo> = [
  {
    id: 'launcher',
    labelKey: 'umbraDesktop_taskbarRegionLauncher',
    descriptionKey: 'umbraDesktop_taskbarRegionLauncherAbout',
  },
  {
    id: 'tray',
    labelKey: 'umbraDesktop_taskbarRegionTray',
    descriptionKey: 'umbraDesktop_taskbarRegionTrayAbout',
  },
];

/**
 * The features belonging to one end of the taskbar, in the order the shell draws them.
 *
 * Every feature, whether or not it is switched on and whether or not it is available: this is what
 * Desktop settings lists, because settings is where a user finds out what the product can do. The
 * taskbar narrows it further with {@link taskbarRowFeatures}.
 * @param region The end of the taskbar to list.
 * @returns The features, ascending by weight.
 */
export function taskbarFeaturesIn(region: UmbraDesktopTaskbarRegion): ReadonlyArray<UmbraDesktopTaskbarFeature> {
  return UMBRADESKTOP_TASKBAR_FEATURES.filter((feature) => feature.region === region).sort(
    (a, b) => a.weight - b.weight,
  );
}

/**
 * The features that should actually draw in one region's row: switched on, and usable here.
 *
 * The other half of "one rule per surface, and they are allowed to disagree". The row shows only
 * what the user can actually use, matching the launcher; Desktop settings lists everything. A
 * feature that passes this can still contribute nothing — pinned apps with nothing pinned — which
 * is why the caller has to cope with an empty row rather than assuming a non-empty one.
 * @param region The end of the taskbar to draw.
 * @param stored The user's stored on/off choices.
 * @param context The taskbar's view of the world.
 * @returns The features to render, in order.
 */
export function taskbarRowFeatures(
  region: UmbraDesktopTaskbarRegion,
  stored: Readonly<Record<string, boolean>> | undefined,
  context: UmbraDesktopTaskbarFeatureContext,
): ReadonlyArray<UmbraDesktopTaskbarFeature> {
  return taskbarFeaturesIn(region).filter(
    (feature) => isFeatureEnabled(stored, feature) && feature.availability(context).available,
  );
}
