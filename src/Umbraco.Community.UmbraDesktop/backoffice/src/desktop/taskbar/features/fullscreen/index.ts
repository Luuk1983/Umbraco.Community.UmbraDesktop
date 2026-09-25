import { html } from '@umbraco-cms/backoffice/external/lit';
import type { UmbraDesktopTaskbarFeature } from '../types';

/**
 * A button that takes the desktop full screen, and brings it back.
 *
 * There was no way into the browser's full screen from the desktop itself: only F11, which a user
 * has to know about and which some keyboards bury behind a function key. This puts it one click
 * away, after the pinned apps, as the desktop's own control rather than an app, which is why it
 * draws no window and has no catalogue entry.
 *
 * The whole page goes full screen, not the desktop element alone: the desktop already hides the
 * backoffice header, so the page is the desktop, and taking the page keeps every overlay the
 * backoffice draws on top of it (modals, notifications, pickers) inside the full screen view.
 *
 * The button follows the browser rather than its own click. Leaving with Esc, or with the browser's
 * own control, happens without this button, and the taskbar learns of it from the browser's
 * `fullscreenchange` event, so the icon and the pressed state are always the page's real state.
 *
 * On the launcher side although it opens nothing, because that is where the user asked for it: a
 * control you reach for belongs beside the other things you reach for, and the tray is for icons
 * that report rather than act.
 */
export const UMBRADESKTOP_FULLSCREEN_FEATURE: UmbraDesktopTaskbarFeature = {
  id: 'fullscreen',
  region: 'launcher',
  weight: 30,
  labelKey: 'umbraDesktop_taskbarFullscreen',
  descriptionKey: 'umbraDesktop_taskbarFullscreenAbout',
  defaultEnabled: true,
  // A browser can refuse full screen outright, and so can a page embedding the backoffice in a
  // frame that does not allow it; then there is nothing for the button to do.
  availability: (context) =>
    context.canFullscreen ? { available: true } : { available: false, reasonKey: 'umbraDesktop_taskbarFullscreenUnavailable' },
  render: (context) => {
    const label = context.localize(
      context.fullscreen ? '#umbraDesktop_taskbarFullscreenExit' : '#umbraDesktop_taskbarFullscreenEnter',
    );
    // The `task` class is the one the app buttons use, so this is themed by all five themes with no
    // CSS of its own; see `app-button.ts`.
    return [
      html`<button
        class="task"
        title=${label}
        aria-label=${label}
        aria-pressed=${context.fullscreen ? 'true' : 'false'}
        @click=${() => context.toggleFullscreen()}
      >
        <umb-icon class="task-icon" name=${context.fullscreen ? 'icon-exit-fullscreen' : 'icon-fullscreen'}></umb-icon>
      </button>`,
    ];
  },
};
