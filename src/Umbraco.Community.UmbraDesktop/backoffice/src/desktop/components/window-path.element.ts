import { UMBRADESKTOP_PATH_HEIGHT } from '../constants.js';
import type { UmbraDesktopPathCrumb } from '../path/types.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The path strip between a window's titlebar and its body: where this window is, and every step
 * back out of it.
 *
 * It exists because the desktop strips the backoffice header, and the header is where you click a
 * section's name to return to its root — so a window that has navigated into a tree had no way back
 * short of being closed and opened again (issue #43). Umbraco does render a breadcrumb of its own,
 * but as a workspace footer app beside Save and publish, which is where you look when you are
 * finishing an edit rather than when you want to leave. This one is in the place people look.
 *
 * **Core's is left alone**, so a section window carries two paths. Hiding it was tried and reverted:
 * the workspace is rebuilt on every navigation, so any rule this package injects lands after that
 * workspace has painted and the breadcrumb blinks on every click. `chrome-injector.ts` keeps the
 * long version of why. A duplicate is untidy; a flash is a defect.
 *
 * In the desktop's own document rather than injected into the frame, exactly as
 * `window-notices.element` is: that is what lets a theme style it, keeps the shell out of the
 * backoffice's DOM, and lets it survive the window navigating internally.
 *
 * **It renders buttons, not anchors, and that is deliberate.** A crumb is not a link out of this
 * document; it is an instruction to route a frame this element cannot reach, and it must be
 * refusable — a window holding unsaved changes asks before it leaves. An anchor would also offer a
 * context menu full of promises the shell cannot keep ("open in new tab" on a route inside an
 * iframe) and would navigate on a middle click with no guard at all.
 *
 * **Every class inside is prefixed `path-`, and that is load-bearing.** This element adopts the
 * active theme's whole `window` sheet, so every selector a theme wrote for the window frame is live
 * in this shadow root too, matching against this markup. `window-notices.element` documents what
 * that cost when it used the frame's own names: macOS pins `.title { position: absolute; inset: 0 }`
 * to centre a window title, which tore a notice's heading out of its column on four of the five
 * themes with nothing failing loudly. `window-path.test.ts` asserts the prefix so the next class
 * cannot forget.
 */
@customElement('umbradesktop-window-path')
export class UmbraDesktopWindowPathElement extends UmbLitElement {
  /** The crumbs to draw, left to right; the last is the item the window is showing. */
  @property({ attribute: false })
  public crumbs: ReadonlyArray<UmbraDesktopPathCrumb> = [];

  /**
   * Adopts the active theme's `window` stylesheet.
   *
   * Its own call rather than something inherited from `window.element`'s: custom properties cross a
   * shadow boundary by ordinary CSS inheritance, but a stylesheet does not, and this element has
   * its own shadow root nested inside the window's. `'window'` rather than a surface of its own,
   * for the reason `window-notices.element` gives — that is the sheet these rules belong in, and a
   * dedicated surface would be one more thing a theme author has to remember to fill in.
   */
  constructor() {
    super();
    new UmbraDesktopThemeStyles(this, 'window');
  }

  /**
   * Ask the window to route its frame to a crumb.
   *
   * An event rather than a call, because this element has no business knowing about iframes, the
   * window manager or the unsaved-changes guard. `window.element` owns all three and decides
   * whether the navigation happens at all.
   * @param href The crumb's href, as core wrote it: usually base-relative.
   */
  #navigate(href: string) {
    this.dispatchEvent(
      new CustomEvent('umbradesktop-path-navigate', {
        detail: { href },
        bubbles: true,
        composed: true,
      }),
    );
  }

  override render() {
    if (this.crumbs.length === 0) return nothing;
    return html`
      <nav class="path-bar" aria-label=${this.localize.term('umbraDesktop_pathLabel')}>
        ${this.crumbs.map((crumb, index) => {
          // Localized here rather than in `crumbs.ts`, and it is the first crumb that needs it: its
          // label is the app's name, which for a curated app is a token like
          // `#umbraDesktop_appContentEditor` — the same value the titlebar puts through
          // `localize.string`. An entity's name is a literal and passes through untouched, so one
          // call covers both. Doing it here also makes the strip follow the backoffice's UI
          // language, because the localize controller re-renders this element when that changes.
          const label = this.localize.string(crumb.label);
          const separator =
            index < this.crumbs.length - 1
              ? html`<span class="path-separator" aria-hidden="true">/</span>`
              : nothing;
          // The window's own root draws a house rather than its name: the titlebar is a few pixels
          // above and already says it, so spelling it out made every window open on the same words
          // twice. The name stays as the tooltip and the accessible name, so nothing is lost to
          // someone hovering it or reading the strip with a screen reader.
          const content = crumb.home
            ? html`<umb-icon class="path-home" name="icon-home"></umb-icon>`
            : label;
          const body = crumb.href
            ? html`<button
                class="path-crumb ${crumb.home ? 'path-crumb-home' : ''}"
                type="button"
                title=${label}
                aria-label=${label}
                @click=${() => this.#navigate(crumb.href as string)}>
                ${content}
              </button>`
            : html`<span class="path-current" aria-current="page" title=${label}>${content}</span>`;
          return html`${body}${separator}`;
        })}
      </nav>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        flex: none;
      }
      /* The height is interpolated from a constant rather than typed, because the same number is
         reported by every theme as 'metrics.pathbarHeight' and spent by the window sizing. A strip
         that measured one height and was paid for at another would leave every section window's app
         that many pixels short. See docs/theming.md §4. */
      .path-bar {
        display: flex;
        align-items: center;
        gap: 2px;
        /* A deep path scrolls rather than growing or truncating: a window that got taller because a
           document was filed one level deeper would be worse than a strip you can drag sideways,
           and an ellipsis in the middle would hide exactly the ancestors this exists to offer.

           'overflow-y: hidden' is not redundant beside it. CSS computes a 'visible' axis to 'auto'
           as soon as the other axis is not visible, so 'overflow-x: auto' alone gives the strip a
           *vertical* scrollbar the moment its content is a pixel taller than its height — which is
           every theme that sets a shorter strip than the default. Windows 98 at 22px and Umbraco 4
           at 24px both shipped a chunky period-correct scrollbar into a 22px bar because of it. */
        overflow-x: auto;
        overflow-y: hidden;
        white-space: nowrap;
        scrollbar-width: thin;
        box-sizing: border-box;
        height: var(--umbradesktop-path-height, ${UMBRADESKTOP_PATH_HEIGHT}px);
        padding: 0 var(--umbradesktop-path-padding, 8px);
        background: var(--umbradesktop-path-background, var(--uui-color-surface-alt));
        border-bottom: var(--umbradesktop-path-border-bottom, 1px solid var(--uui-color-divider));
        color: var(--umbradesktop-path-text, var(--uui-color-text));
        font-size: var(--umbradesktop-path-font-size, 12px);
      }
      .path-crumb {
        flex: none;
        border: 0;
        padding: 2px 4px;
        border-radius: 3px;
        background: none;
        font: inherit;
        cursor: pointer;
        color: var(--umbradesktop-path-link, var(--uui-color-interactive));
      }
      .path-crumb:hover {
        background: var(--umbradesktop-path-link-hover-background, var(--uui-color-surface-emphasis));
      }
      .path-crumb-home {
        display: inline-flex;
        align-items: center;
      }
      /* Sized in the strip's own type size rather than in px, so a theme that shrinks the strip
         shrinks the house with it and the two never disagree about how tall the bar has to be. */
      .path-home {
        font-size: 1.15em;
        line-height: 1;
      }
      .path-current {
        flex: none;
        padding: 2px 4px;
        color: var(--umbradesktop-path-text, var(--uui-color-text));
      }
      /* The fallback is mixed out of the strip's own text colour rather than named, because it has
         to work in both of the backoffice's colour schemes: the Umbraco theme sets no palette at
         all, so every value it renders is a fallback from this file. The first choice here was
         uui-color-border, which is a dark grey and therefore invisible on a dark bar. Diluting
         currentColor instead follows the text in either scheme, so the separator sits the same
         distance from the words beside it whichever way the backoffice is set. A theme that names a
         colour overrides the whole expression, as macOS and Windows 98 do.
         (No backticks in this comment: it lives inside a css template literal and they end it.) */
      .path-separator {
        flex: none;
        color: var(--umbradesktop-path-separator, color-mix(in srgb, currentColor 55%, transparent));
      }
    `,
  ];
}

export default UmbraDesktopWindowPathElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window-path': UmbraDesktopWindowPathElement;
  }
}
