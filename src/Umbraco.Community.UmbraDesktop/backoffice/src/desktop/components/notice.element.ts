import { UMBRADESKTOP_NOTICE_ACTION_EVENT } from '../constants.js';
import { noticeIconName } from '../notices/notices.js';
import type { UmbraDesktopNoticeSeverity } from '../notices/types.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** One button on a notice: what it says, and the id the press is reported with. */
export interface UmbraDesktopNoticeElementAction {
  /** Reported in the press event's `detail.action`. */
  id: string;
  /** The button's text, already in the person's language. */
  label: string;
}

/**
 * The desktop's notice banner, as a component of its own (design §16.12 of the Media Health design):
 * the window's notice stack draws one per notice between the titlebar and the body, and an app
 * draws one inside its own content, so a warning looks the same wherever the desktop shows one and
 * every theme styles both at once. An app uses it by its tag name alone, importing nothing from this
 * package, as with the progress event; `docs/developer/notices.md` is the contract.
 *
 * It takes words already in the person's language: the stack passes its localized terms, an app its
 * own. Actions are data rather than slotted buttons on purpose: the themes style a notice's buttons
 * as `.notice .notice-actions uui-button`, which a slotted button in the page's light DOM would
 * never match, so each theme would need a second rule for every button an app ever adds.
 *
 * **Every class inside is prefixed `notice-`, and that is load-bearing.** It adopts the active
 * theme's whole `window` sheet, which is where the five themes wrote their notice rules, so every
 * selector a theme wrote for the window frame is live in this shadow root too. macOS pins
 * `.title { position: absolute; inset: 0 }` to centre a window title, which tore a notice heading
 * named `.title` out of its column; see `window-notices.element` for the history.
 *
 * Fires {@link UMBRADESKTOP_NOTICE_ACTION_EVENT} with `{ action }` when a button is pressed.
 */
@customElement('umbradesktop-notice')
export class UmbraDesktopNoticeElement extends UmbLitElement {
  /** How loud it is: the icon, the colour and whether assistive technology is interrupted. */
  @property({ reflect: true })
  public severity: Exclude<UmbraDesktopNoticeSeverity, 'info'> = 'warning';

  /** The heading, already in the person's language. */
  @property()
  public heading = '';

  /** The sentence under the heading, already in the person's language; none when empty. */
  @property()
  public body = '';

  /** Its buttons, in the order they are drawn. */
  @property({ attribute: false })
  public actions: ReadonlyArray<UmbraDesktopNoticeElementAction> = [];

  /** Which notice this is, for a stack or a test to key on; carried as `data-notice`. */
  @property()
  public name = '';

  /**
   * Adopts the active theme's `window` stylesheet, which is where the themes' `.notice` rules are:
   * a stylesheet does not cross a shadow boundary, so without this every themed notice rule would
   * be parsed and never applied, as it once was for the stack.
   */
  constructor() {
    super();
    new UmbraDesktopThemeStyles(this, 'window');
  }

  /**
   * Report a pressed button to whoever drew this notice.
   * @param action The button's id.
   */
  #press(action: string): void {
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_NOTICE_ACTION_EVENT, { detail: { action }, bubbles: true, composed: true }));
  }

  override render() {
    // `error` gets the assertive role and `warning` the polite one: a deleted document cannot be
    // saved to at all, so `alert` is right for it, while a warning has no clock on it and the reader
    // loses nothing by finishing the sentence they are reading first.
    const role = this.severity === 'error' ? 'alert' : 'status';
    const icon = noticeIconName(this.severity);
    // No label on the icon: the heading beside it already says in words what the glyph says in
    // shape, so naming it too would have a screen reader read the severity twice.
    return html`<div class="notice" data-severity=${this.severity} data-notice=${this.name || nothing} role=${role}>
      ${icon ? html`<umb-icon class="notice-icon" name=${icon} aria-hidden="true"></umb-icon>` : nothing}
      <div class="notice-text">
        <strong class="notice-title">${this.heading}</strong>
        ${this.body ? html`<span class="notice-body">${this.body}</span>` : nothing}
      </div>
      ${this.actions.length
        ? html`<span class="notice-actions">
            ${this.actions.map(
              // Real 'uui-button's, so a notice's buttons look, focus and behave like every other
              // button in the backoffice; 'secondary', as the settings modal's own non-primary ones.
              (action) => html`<uui-button look="secondary" label=${action.label} @click=${() => this.#press(action.id)}></uui-button>`,
            )}
          </span>`
        : nothing}
    </div>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
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

export default UmbraDesktopNoticeElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-notice': UmbraDesktopNoticeElement;
  }
}
