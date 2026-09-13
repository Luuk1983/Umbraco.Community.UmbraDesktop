import { resolvePinned } from '../../../settings/pinned.js';
import { taskbarAppButton } from '../app-button.js';
import type { UmbraDesktopTaskbarFeature } from '../types';

/**
 * The user's pinned apps, as icon-only buttons in the order the launcher shows them.
 *
 * **Pinning itself does not change.** One gesture in the launcher, one meaning; switching this on
 * renders that same list in a second place. That is why there is no pin-to-where question to
 * answer and no pin affordance anywhere on the taskbar — Windows' pin menu is annoying precisely
 * because Start-pinned and taskbar-pinned are two lists meaning the same thing, so the user is
 * asked to make a distinction that carries no information.
 *
 * `resolvePinned` is the launcher's own function, not a copy of it. The order and what a pin
 * resolves to have to match across the two surfaces, and the only way two lists cannot disagree is
 * by being one list.
 *
 * Always available, and commonly contributing nothing: a user who has unpinned everything has this
 * feature switched on with an empty row, which is the normal state rather than a case to design
 * for. It needs no permission logic either — the catalogue filters apps against the user's
 * permitted sections before the pin list is ever resolved against them, so a pin for something they
 * may not reach simply finds no app.
 */
export const UMBRADESKTOP_PINNED_APPS_FEATURE: UmbraDesktopTaskbarFeature = {
  id: 'pinned-apps',
  region: 'launcher',
  weight: 20,
  labelKey: 'umbraDesktop_taskbarPinnedApps',
  descriptionKey: 'umbraDesktop_taskbarPinnedAppsAbout',
  defaultEnabled: true,
  availability: () => ({ available: true }),
  render: (context) => resolvePinned(context.apps, context.pinned).map((app) => taskbarAppButton(app, context)),
};
