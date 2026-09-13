import type { UmbraDesktopApp } from '../../../types';
import type { UmbraDesktopFeatureAvailability } from '../types';

/**
 * The one place the chat's alias is written down.
 *
 * A detail inside this feature rather than part of the feature contract, which is why nothing
 * outside this folder may name it: the registry knows about features, not about apps.
 *
 * The catalogue entry it names carries `allowMultiple: false` — the first and currently only entry
 * that does, per the one-chat-window decision in #44. That is the manager's business, not this
 * button's; see `app-button.ts`.
 */
export const UMBRADESKTOP_AI_CHAT_APP_ALIAS = 'copilot-workspace';

/**
 * Whether this user can use the chat, and which of the two reasons applies when they cannot.
 *
 * The apps reaching this point are already filtered against the user's permitted sections by the
 * catalogue, so an app's *absence* has two quite different causes and the person reading the
 * disabled control needs to know which. If the referenced manifest is not registered at all, the AI
 * package is not installed here and the fix belongs to whoever manages the site's packages. If it
 * is registered but the app never arrived, the section is one this user may not reach and the fix
 * belongs to whoever manages its users. One apologetic line covering both would send half of the
 * people reading it to the wrong colleague.
 * @param apps The apps this user may launch.
 * @param isRefRegistered Whether a curated `ref` is registered on this install.
 * @param ref The chat's catalogue `ref`, or undefined when the entry has gone.
 * @returns The verdict, with a reason key when it is negative.
 */
export function aiChatAvailability(
  apps: ReadonlyArray<UmbraDesktopApp>,
  isRefRegistered: (ref: string) => boolean,
  ref: string | undefined,
): UmbraDesktopFeatureAvailability {
  if (apps.some((app) => app.alias === UMBRADESKTOP_AI_CHAT_APP_ALIAS)) return { available: true };
  // No entry to reference is not a state a shipped build can reach — `availability.test.ts` asserts
  // the entry is still there — but "cannot be installed" is the honest answer for a lookup that
  // found nothing, and it keeps the registry probe from being handed an empty alias.
  if (ref && isRefRegistered(ref)) return { available: false, reasonKey: 'umbraDesktop_taskbarAiChatNoPermission' };
  return { available: false, reasonKey: 'umbraDesktop_taskbarAiChatNotInstalled' };
}
