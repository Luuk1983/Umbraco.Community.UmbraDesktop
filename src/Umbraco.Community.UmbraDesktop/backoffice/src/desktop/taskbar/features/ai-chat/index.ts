import { catalogue } from '../../../catalogue/index.js';
import { taskbarAppButton } from '../app-button.js';
import type { UmbraDesktopTaskbarFeature } from '../types';
import { UMBRADESKTOP_AI_CHAT_APP_ALIAS, aiChatAvailability } from './availability.js';

/**
 * The chat's `ref`, read from its own catalogue entry rather than written here a second time.
 *
 * The entry already knows which manifest the chat is; duplicating the alias would create two places
 * that have to agree about a third party's section, and the one that drifts would be this one,
 * because nothing about a broken registry probe is visible on an install that has the package.
 */
const CHAT_REF = catalogue.entries.find((entry) => entry.alias === UMBRADESKTOP_AI_CHAT_APP_ALIAS)?.ref;

/**
 * Umbraco AI's Copilot Workspace, as a single button at the head of the row's apps.
 *
 * First among the apps because it is the app somebody who installed the AI package opens all day.
 * Not first on the row, because a position there is only worth learning if it never moves, and this
 * one comes and goes with the AI package: full screen, which every install has, holds the slot
 * nearest the launcher button, so nothing ahead of the chat shifts from one site to the next.
 *
 * Switched on by default: somebody who installed the AI package wanting the chat is the safe
 * assumption. Where the package is absent, or the user may not reach it, the feature stays listed
 * in Desktop settings with its control disabled and the reason given, and contributes nothing at
 * all to the row — which is the whole of "one rule per surface, and they are allowed to disagree".
 */
export const UMBRADESKTOP_AI_CHAT_FEATURE: UmbraDesktopTaskbarFeature = {
  id: 'ai-chat',
  region: 'launcher',
  weight: 10,
  labelKey: 'umbraDesktop_taskbarAiChat',
  descriptionKey: 'umbraDesktop_taskbarAiChatAbout',
  defaultEnabled: true,
  availability: (context) => aiChatAvailability(context.apps, context.isRefRegistered, CHAT_REF),
  render: (context) => {
    const chat = context.apps.find((app) => app.alias === UMBRADESKTOP_AI_CHAT_APP_ALIAS);
    return chat ? [taskbarAppButton(chat, context)] : [];
  },
};
