import { taskbarAppButton } from '../app-button.js';
import type { UmbraDesktopTaskbarFeature } from '../types';
import { UMBRADESKTOP_AI_CHAT_APP_ALIAS, aiChatAvailability } from './availability.js';

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
  // The chat's `ref` comes from its own catalogue entry, as the merged catalogue has it now, rather
  // than being written here a second time: two places that must agree about a third party's section
  // is one too many, and a package may since have replaced the entry with one that points elsewhere.
  availability: (context) =>
    aiChatAvailability(context.apps, context.isRefRegistered, context.entryRef(UMBRADESKTOP_AI_CHAT_APP_ALIAS)),
  render: (context) => {
    const chat = context.apps.find((app) => app.alias === UMBRADESKTOP_AI_CHAT_APP_ALIAS);
    return chat ? [taskbarAppButton(chat, context)] : [];
  },
};
