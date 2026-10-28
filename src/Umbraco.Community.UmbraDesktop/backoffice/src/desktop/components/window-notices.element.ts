import { UMBRADESKTOP_NOTICE_STACK_MAX_SHARE } from '../constants.js';
import { windowNotices } from '../notices/notices.js';
// Side-effect import: registers '<umbradesktop-notice>', which draws each banner below.
import './notice.element.js';
import type { UmbraDesktopNotice, UmbraDesktopNoticeAction } from '../notices/types.js';
import type { UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The strip of notices between a window's titlebar and its body.
 *
 * In the desktop's own document rather than injected into the frame, which is what lets a theme
 * style it, keeps the shell out of the backoffice's DOM, and lets it survive the window navigating
 * internally.
 *
 * Its own element rather than more markup in `window.element`, which is already the largest file in
 * the package. It owns the `--umbradesktop-notice-*` token group, which is why `tokens.test.ts`
 * scans it alongside the other four chrome components.
 *
 * **Every class inside is prefixed `notice-`, and that is load-bearing.** This element adopts the
 * active theme's whole `window` sheet (see the constructor), so every selector a theme wrote for
 * the window frame is live in *this* shadow root too, matching against this markup. The short
 * names this started with — `.title`, `.body`, `.text`, `.icon` — are all names the frame already
 * uses, so a theme styling its own titlebar was silently restyling a notice: macOS pins
 * `.title { position: absolute; inset: 0 }` to centre a window title the way macOS does, which
 * tore the notice's heading out of its column and dropped it in the middle of the band, and
 * Win98/Win11/Umbraco 4 each shrank it to their 11px caption type. Nothing failed loudly; it just
 * looked wrong on four of the five themes. Adding a class here means checking the frame's names
 * first, or picking one that starts `notice-`.
 */
@customElement('umbradesktop-window-notices')
export class UmbraDesktopWindowNoticesElement extends UmbLitElement {
  /** The window being described. */
  @property({ attribute: false })
  public window?: UmbraDesktopWindow;

  /** The manager the actions go through. */
  #manager?: UmbraDesktopWindowManagerContext;

  /**
   * Consumes the window manager, which is where every action below lands, and adopts the active
   * theme's `window` stylesheet.
   *
   * The adoption is its own line rather than something inherited from `window.element`'s: custom
   * properties cross a shadow boundary by ordinary CSS inheritance, but a stylesheet does not, and
   * this element has its own shadow root nested inside the window's. Without this call every
   * `.notice` rule the five themes write in their `window.css.ts` is valid, never-applied CSS —
   * `window.element`'s own `new UmbraDesktopThemeStyles(this, 'window')` styles only its own root,
   * one boundary up. `'window'` and not a surface of its own, because that is the sheet the notice
   * rules were written into (see `theme/notice.test.ts` and each theme's `window.css.ts`), and a
   * dedicated surface would be one more thing for a theme author to remember to fill in.
   */
  constructor() {
    super();
    new UmbraDesktopThemeStyles(this, 'window');
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
  }

  /**
   * The label for an action.
   * @param action The action.
   * @returns Its localized label.
   */
  #label(action: UmbraDesktopNoticeAction): string {
    if (action === 'acknowledge') return this.localize.term('umbraDesktop_noticeKeepMine');
    return this.localize.term('umbraDesktop_noticeDiscardMine');
  }

  /**
   * Run an action against the window this strip belongs to.
   *
   * `discard-and-load` goes to the workspace's own `reload()` through the manager's subjects rather
   * than reloading the iframe: an iframe reload would cost the editor their scroll position, the
   * open tab and any split view, all of which survive a workspace reload. It asks nothing first,
   * because the button already says what it does.
   * @param action The action to run.
   */
  async #run(action: UmbraDesktopNoticeAction): Promise<void> {
    const id = this.window?.id;
    if (!id || !this.#manager) return;
    if (action === 'acknowledge') {
      await this.#manager.acknowledge(id);
      return;
    }
    this.#manager.setRefreshing(id, true);
    try {
      for (const subject of this.#manager.subjectsOf(id)) await subject.reload();
      // Both flags, because loading their version resolves both facts at once: the conflict is gone
      // and, if the node was in the bin, the reload has just brought back its current state.
      this.#manager.setServerState(id, { changedElsewhere: false, trashed: false });
    } finally {
      this.#manager.setRefreshing(id, false);
    }
  }

  /**
   * One notice, as the desktop's notice component, which owns how a banner looks so a banner here
   * and one an app draws in its own content cannot drift apart. The words are localized here; the
   * component takes them as they are.
   * @param notice The notice to draw.
   * @returns Its template.
   */
  #renderNotice(notice: UmbraDesktopNotice) {
    return html`<umbradesktop-notice
      name=${notice.id}
      severity=${notice.severity === 'error' ? 'error' : 'warning'}
      heading=${this.localize.term(notice.title)}
      body=${this.localize.term(notice.body)}
      .actions=${notice.actions.map((action) => ({ id: action, label: this.#label(action) }))}
      @umbradesktop-notice-action=${(event: CustomEvent<{ action: UmbraDesktopNoticeAction }>) => {
        event.stopPropagation();
        void this.#run(event.detail.action);
      }}></umbradesktop-notice>`;
  }

  /**
   * The banners this window's state calls for, worst first, or nothing at all.
   *
   * Filters on each notice's own `banner` field rather than re-deciding which severities get a
   * strip: `notices.ts` is the single source every surface reads, and it is where the rule lives
   * that `info` never gets one — a banner on every window with unsaved changes would be intolerable
   * and would change what today's desktop does.
   * @returns The stack, or nothing.
   */
  override render() {
    const w = this.window;
    if (!w) return nothing;
    const banners = windowNotices(w).filter((notice) => notice.banner);
    if (!banners.length) return nothing;
    // `aria-live="polite"` because a banner here arrives asynchronously, seconds or minutes after
    // the editor last touched the window — a server event, not a keystroke — so nothing else tells
    // assistive technology it appeared at all. Polite rather than assertive at the container level:
    // each notice's own role (see `#renderNotice`) is what decides whether that particular
    // announcement interrupts.
    return html`<div class="notice-stack" aria-live="polite">
      ${banners.map((notice) => this.#renderNotice(notice))}
    </div>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
        flex: none;
        /* Capped rather than allowed to grow: notices take their height out of the body, so three
           of them on a window near the chrome's own floor would leave nothing to read. The share
           is a constant this file interpolates, so the number is stated once.

           A percentage of the *window frame*, not the viewport — 'vh' measured against the whole
           browser tab, which a normal window rarely fills, so the cap worked out to roughly 486px
           on a 300px-tall window and never engaged. The cap belongs on this host rather than on
           '.notice-stack' below because a percentage 'height'/'max-height' needs its immediate containing
           block to have a definite height, and this element's own light-DOM parent — '.frame' in
           'window.element', a flex column sized by an inline style or a maximized window's 100% —
           is exactly that; '.notice-stack' itself has no such parent, only this shadow host, whose own
           height is otherwise nothing but its content. Measured in the browser rather than assumed
           (docs/developer/theming.md §4): putting the percentage on '.notice-stack' instead compiles and passes a
           naive glance, but it resolves against '.notice-stack''s *own* unclamped content height — a
           number with nothing to do with the window — so it clips every stack to the same
           45%-of-itself regardless of whether the window is 300px or 3000px tall. Here, a flex
           item's own percentage size resolves against its flex container's real height even when
           the item's 'height' property is 'auto', which is what makes the cap answer to the window
           at last. */
        max-height: ${UMBRADESKTOP_NOTICE_STACK_MAX_SHARE * 100}%;
      }
      .notice-stack {
        display: flex;
        flex-direction: column;
        /* Fills whatever this host was just capped to, so the two together read as one box: the
           host supplies the one percentage that means anything, and this is what actually scrolls. */
        max-height: 100%;
        overflow-y: auto;
      }
    `,
  ];
}

export default UmbraDesktopWindowNoticesElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window-notices': UmbraDesktopWindowNoticesElement;
  }
}
