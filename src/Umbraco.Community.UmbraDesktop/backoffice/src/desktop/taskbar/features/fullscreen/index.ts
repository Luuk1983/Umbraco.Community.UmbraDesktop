import { html, nothing } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_ICON_EXIT_FULLSCREEN, UMBRADESKTOP_ICON_FULLSCREEN } from '../../../icons/icons.js';
import { currentPlatform, leaveFullscreenHintKey } from './leave-hint.js';
import type { UmbraDesktopTaskbarFeature } from '../types';

/**
 * A button that takes the desktop full screen, and brings it back.
 *
 * There was no way into the browser's full screen from the desktop itself: only F11, which a user
 * has to know about and which some keyboards bury behind a function key. This puts it one click
 * away, first on the row, as the desktop's own control rather than an app, which is why it draws no
 * window and has no catalogue entry.
 *
 * The whole page goes full screen, not the desktop element alone: the desktop already hides the
 * backoffice header, so the page is the desktop, and taking the page keeps every overlay the
 * backoffice draws on top of it (modals, notifications, pickers) inside the full screen view.
 *
 * The button follows the browser rather than its own click. Leaving with Esc, or with the browser's
 * own control, happens without this button, and the taskbar learns of it from the browser's
 * `fullscreenchange` event, so the icon and the pressed state are always the page's real state.
 *
 * It greys out while the browser itself is full screen, after F11 or the browser's menu, because
 * then it has nothing honest to do: no page can leave that full screen, and asking for the page's
 * own on top only trades the browser's notice for a different one and back. So it says instead
 * which key leaves it on this platform (`leave-hint.ts`), as the tooltip and the accessible name at
 * once. `aria-disabled` rather than `disabled`, so the button keeps its place in the tab order and
 * a keyboard user can still reach the one line that says what to do; the click is ignored instead.
 *
 * On the launcher side although it opens nothing, because a control you reach for belongs beside the
 * other things you reach for, and the tray is for icons that report rather than act. First on that
 * side because it is the one button every install has, and it is always one button wide: the chat
 * after it comes and goes with the AI package, and the pins after that grow and shrink with every
 * pin, so the head of the row is the one place neither can move it.
 *
 * The four-arrow glyphs are the desktop's own, registered in `desktop/icons`, because Umbraco ships
 * corner brackets and a two-arrow pair for full screen but not four arrows out to the corners.
 */
export const UMBRADESKTOP_FULLSCREEN_FEATURE: UmbraDesktopTaskbarFeature = {
  id: 'fullscreen',
  region: 'launcher',
  weight: 5,
  labelKey: 'umbraDesktop_taskbarFullscreen',
  descriptionKey: 'umbraDesktop_taskbarFullscreenAbout',
  defaultEnabled: true,
  // A browser can refuse full screen outright, and so can a page embedding the backoffice in a
  // frame that does not allow it; then there is nothing for the button to do.
  availability: (context) =>
    context.canFullscreen ? { available: true } : { available: false, reasonKey: 'umbraDesktop_taskbarFullscreenUnavailable' },
  render: (context) => {
    const state = context.fullscreen;
    const label = context.localize(
      state === 'browser'
        ? `#${leaveFullscreenHintKey(currentPlatform())}`
        : state === 'page'
          ? '#umbraDesktop_taskbarFullscreenExit'
          : '#umbraDesktop_taskbarFullscreenEnter',
    );
    // The `task` class is the one the app buttons use, so this is themed by all five themes with no
    // CSS of its own; see `app-button.ts`. The greyed-out look is the base stylesheet's, on
    // `aria-disabled`, for the same reason.
    return [
      html`<button
        class="task"
        title=${label}
        aria-label=${label}
        aria-pressed=${state === 'off' ? 'false' : 'true'}
        aria-disabled=${state === 'browser' ? 'true' : nothing}
        @click=${() => {
          if (state !== 'browser') context.toggleFullscreen();
        }}>
        <umb-icon
          class="task-icon"
          name=${state === 'off' ? UMBRADESKTOP_ICON_FULLSCREEN : UMBRADESKTOP_ICON_EXIT_FULLSCREEN}></umb-icon>
      </button>`,
    ];
  },
};
