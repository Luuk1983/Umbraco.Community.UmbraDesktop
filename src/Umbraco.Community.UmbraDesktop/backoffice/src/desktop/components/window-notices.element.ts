import { UMBRADESKTOP_NOTICE_STACK_MAX_SHARE } from '../constants.js';
import { noticeIconName, windowNotices } from '../notices/notices.js';
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
   * One notice.
   * @param notice The notice to draw.
   * @returns Its template.
   */
  #renderNotice(notice: UmbraDesktopNotice) {
    // `error` gets the assertive role and `warning` the polite one, because the two differ in what
    // they cost to ignore for one more second: a deleted document cannot be saved to at all, so
    // `alert` is right for it, while a conflict is serious but has no clock on it — the editor loses
    // nothing by finishing the sentence they are reading before hearing about it. `role="status"` is
    // this file's only warning severity, but the mapping is from severity, not from a fixed set of
    // ids, so a future warning-severity notice inherits the same non-interrupting treatment.
    const role = notice.severity === 'error' ? 'alert' : 'status';
    const icon = noticeIconName(notice.severity);
    // No `alt`/`aria-label` on the icon, and that is deliberate rather than an oversight: the
    // title beside it already says in words what the glyph says in shape, so naming the icon too
    // would have a screen reader read the severity twice. `aria-hidden` states that explicitly.
    return html`<div class="notice" data-severity=${notice.severity} data-notice=${notice.id} role=${role}>
      ${icon ? html`<umb-icon class="notice-icon" name=${icon} aria-hidden="true"></umb-icon>` : nothing}
      <div class="notice-text">
        <strong class="notice-title">${this.localize.term(notice.title)}</strong>
        <span class="notice-body">${this.localize.term(notice.body)}</span>
      </div>
      ${notice.actions.length
        ? html`<span class="notice-actions">
            ${notice.actions.map(
              (action) =>
                // Real `uui-button`s, as the settings modal and the wallpaper picker use, rather
                // than the bordered spans this started as: those had to reinvent focus, hover and
                // disabled states from nothing, and got them subtly different from every other
                // button in the backoffice. `look="secondary"` is the same look the settings
                // modal's own non-primary buttons take.
                html`<uui-button
                  look="secondary"
                  label=${this.#label(action)}
                  @click=${() => void this.#run(action)}></uui-button>`,
            )}
          </span>`
        : nothing}
    </div>`;
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
           (docs/theming.md §4): putting the percentage on '.notice-stack' instead compiles and passes a
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
      /* The severity colour, named once and read by the ground, the leading edge and the icon
         below. A local custom property rather than three near-identical selectors each repeating
         the same token chain: the severity rule then swaps one value and everything that carries
         severity follows it, which is also what stops a fourth carrier being added later and
         quietly missing its 'error' twin.

         The ground is that colour mixed into the window's own surface, not a wash of
         '--uui-color-warning'. UUI's warning token is the *saturated* fill meant for solid
         controls, and a strip the width of a window filled with it read as neither Umbraco nor a
         warning. A white band with an edge accent, which is what this was, read as no warning at
         all: reported as "doesn't grab the attention it needs". So: a tint, small enough that the
         text on it is still ordinary body text and large enough that the band is obviously not the
         window's own surface. Mixed rather than written as a hex value so it follows both the
         severity colour a theme sets and the light/dark surface underneath it — one declaration
         covers four combinations, and none of them can drift from the accent beside it.

         Severity is still carried by the icon and the edge as well as the ground, so a monochrome
         display or a reader who does not read yellow as danger still gets it: the design's rule
         that colour is never the only carrier.

         'border-inline-start' rather than 'border-left' so the bar follows the writing direction,
         which for the notice stack of a right-to-left backoffice is the right edge. */
      .notice {
        --notice-accent: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        gap: var(--uui-size-space-2) var(--uui-size-space-4);
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        background: var(
          --umbradesktop-notice-background,
          color-mix(
            in srgb,
            var(--notice-accent) 16%,
            var(--umbradesktop-window-background, var(--uui-color-surface))
          )
        );
        color: var(--umbradesktop-notice-text, var(--uui-color-text));
        border-inline-start: var(--umbradesktop-notice-border-width, 4px) solid var(--notice-accent);
        border-bottom: 1px solid var(--uui-color-divider-standalone, var(--uui-color-border));
        font-size: var(--uui-type-small-size);
      }
      /* Severity swaps the accent, and the ground follows it because the ground is mixed from it:
         one banner and two banners of different severities still have to sit in the same stack
         without reading as two different kinds of chrome, which a shared surface and a shared
         layout give them. Single quotes and not backticks around a name in these comments, here
         and in every comment inside a 'css' tagged template: a backtick closes the template
         literal, and the failure is a parse error several lines further down that says nothing
         about quoting. */
      .notice[data-severity='error'] {
        --notice-accent: var(--umbradesktop-notice-error-color, var(--uui-color-danger));
      }
      /* Stroked in 'currentColor' by Umbraco itself, so the severity colour reaches it as an
         ordinary 'color' and no icon token has to exist. Its own line height, so a two-line body
         does not stretch it. */
      .notice-icon {
        flex: none;
        font-size: 18px;
        line-height: 1;
        color: var(--notice-accent);
      }
      /* Grows, and is the only thing that does: 'flex: 1 1 12rem' is what lets the actions drop
         onto their own line on a narrow window instead of squeezing the sentence to one word per
         line. */
      .notice-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1 1 12rem;
        min-width: 0;
      }
      /* Medium, not the 700 a 'strong' defaults to: the heading is the sentence's subject, not a
         second alarm after the icon. */
      .notice-title {
        font-weight: 500;
      }
      /* Dimmed from whatever the notice's own text colour resolved to, rather than set to
         '--uui-color-text-alt'. The token is the backoffice's secondary ink for the backoffice's
         own surfaces, and it knows nothing about a themed notice ground: on Umbraco 4's cream
         panel and under the dark backoffice theme it came out close enough to the ground to
         disappear, which is what "the second text line goes missing" was. Deriving from
         'currentColor' cannot go wrong that way — a theme sets '--umbradesktop-notice-text' or
         does not, and this follows either. */
      .notice-body {
        color: inherit;
        opacity: 0.85;
      }
      .notice-actions {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--uui-size-space-2);
        /* Aligns with the title rather than with the middle of a wrapped body. */
        margin-top: 1px;
      }
      /* The actions have to read as controls sitting *on* the band. UUI's 'secondary' look is
         '--uui-color-surface-alt' with a transparent border, which against a notice ground is a
         step of roughly 1.05:1 — a label floating in the strip rather than a button, reported on
         three themes in a row. Its own surface plus a hairline is what every other secondary
         button in the backoffice has against the panel behind it.
         Restated through UUI's own custom properties rather than by switching to 'look=outline':
         the properties are what a theme already overrides (Win98's grey face, macOS's radius) and
         a theme's sheet is appended after this one, so its values keep winning. */
      .notice-actions uui-button {
        --uui-button-background-color: var(--uui-color-surface);
        --uui-button-background-color-hover: var(--uui-color-surface-alt);
        --uui-button-border-color: var(--uui-color-border);
        --uui-button-border-color-hover: var(--uui-color-interactive);
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
