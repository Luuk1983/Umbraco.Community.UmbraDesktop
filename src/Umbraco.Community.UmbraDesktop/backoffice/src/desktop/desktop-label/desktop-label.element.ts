import type { DesktopLabelResponseModel } from '../../api/types.gen';
import { UMBRADESKTOP_DESKTOP_LABEL_INSET, UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { desktopLabelText } from './desktop-label-text';
import { css, customElement, html, nothing, property, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** The inset from the desktop's edges, as CSS. */
const INSET = unsafeCSS(`${UMBRADESKTOP_DESKTOP_LABEL_INSET}px`);

/**
 * The taskbar reserve's fallback, as CSS.
 *
 * Only reached outside a desktop: inside one, `.desktop` always sets the reserve, from the theme's
 * palette or from this same constant. Derived rather than typed, so the two cannot drift apart.
 */
const RESERVE_FALLBACK = unsafeCSS(`${UMBRADESKTOP_TASKBAR_HEIGHT}px`);

/**
 * The dark halo around the letters, one entry per shadow layer, innermost first: a tight edge that
 * carries the label on a pale wallpaper, and a soft glow under it.
 *
 * Data rather than a CSS string because two rules read it: the `text-shadow` itself, and the room
 * each line leaves around its text for the shadow to draw in (see {@link HALO_ROOM}).
 */
const HALO = [
  { y: 0, blur: 3, alpha: 0.8 },
  { y: 1, blur: 2, alpha: 0.6 },
  { y: 2, blur: 18, alpha: 0.35 },
] as const;

/** {@link HALO} as a `text-shadow` value. */
const HALO_CSS = unsafeCSS(HALO.map((layer) => `0 ${layer.y}px ${layer.blur}px rgba(0, 0, 0, ${layer.alpha})`).join(', '));

/**
 * How far the halo reaches past the letters, as CSS: the widest blur plus its offset.
 *
 * Each line clips its overflow, which is what ends a long name in an ellipsis, and a clip cuts at
 * the padding edge. With no padding the soft outer layer stopped dead at the edge of each line, a
 * hard shadow edge on a plain ground. Each line therefore pads by this much and takes it back with
 * a negative margin, so the shadow has room and the letters stay where they were.
 */
const HALO_ROOM = unsafeCSS(`${Math.max(...HALO.map((layer) => layer.blur + Math.abs(layer.y)))}px`);

/**
 * The site's name, drawn large in a corner of the desktop, so it is the first thing you see when
 * you land and hard to mistake for another environment.
 *
 * It sits on the wallpaper layer, behind every window: the desktop places it after the wallpaper
 * and before the window surface, and with no z-index of its own it stacks in that order. Over the
 * windows it would sit on somebody's content.
 *
 * A watermark, but a strong one. A classic 30% watermark disappeared over the white of a light
 * photo when this was mocked, so the ink is 70% white with a dark halo, and the test beside this
 * file refuses an ink below half strength or any fade of the label as a whole.
 *
 * Every theme draws it in its own lettering, through `--umbradesktop-desktop-label-font` and
 * `-weight`, and in the same white with a dark halo, for the reason given on the colour below.
 *
 * It is plain text to assistive technology rather than hidden from it: which site you are on
 * matters as much to a screen reader user as to anybody.
 */
@customElement('umbradesktop-desktop-label')
export class UmbraDesktopLabelElement extends UmbLitElement {
  /** What to draw, as the server reports it, or null before it has loaded. */
  @property({ attribute: false })
  label: DesktopLabelResponseModel | null = null;

  /**
   * The host the browser is on.
   *
   * The browser's rather than the server's, because behind a proxy an instance does not reliably
   * know its own public address. A property so a test can name one.
   */
  @property({ attribute: false })
  domain: string = globalThis.location.host;

  override render() {
    if (!this.label?.show) return nothing;

    const text = desktopLabelText(this.label.name, this.domain, this.label.showDomain);
    return html`
      <div class="label" data-corner=${this.label.corner}>
        <span class="name">${text.name}</span>
        ${text.domain ? html`<span class="domain">${text.domain}</span>` : nothing}
      </div>
    `;
  }

  static override styles = [
    css`
      /* The whole desktop, so the label's percentages and container units are the desktop's own.
         It takes no clicks anywhere, which is what lets it cover the desktop at all. */
      :host {
        position: absolute;
        inset: 0;
        pointer-events: none;
        container-type: inline-size;
      }
      /* A flex column, so the lines' negative margins add up rather than collapse into one another
         the way a block's vertical margins would. */
      .label {
        position: absolute;
        display: flex;
        flex-direction: column;
        /* One line, never past about half the desktop, so a long name cannot reach the middle of
           the screen or run far under the window that opens beside it. */
        max-width: 48%;
        white-space: nowrap;
        line-height: 1.05;
        pointer-events: none;
        /* Sized to the desktop rather than fixed: 40px on a 1280px desktop, 60px on 1920px. A fixed
           size is either lost on a large monitor or crowding a laptop. */
        font-size: clamp(28px, 3.1cqw, 72px);
        letter-spacing: -0.01em;
        /* A theme sets the lettering, never the colour. The ground behind the label is whatever
           wallpaper the user picked, not the theme's own, and the default one is dark under every
           theme, so an ink chosen for a theme's pale desktop vanishes for most of its users. White
           with a tight dark halo reads on any ground instead: the ink on a dark wallpaper, the halo
           on a pale one.

           Faded in the ink rather than with opacity. Opacity fades the halo along with the letters,
           and at 60% overall the halo was too weak to carry the label on Umbraco 4's own grey. A
           translucent ink keeps the watermark look on a dark wallpaper and a full-strength edge on a
           pale one. */
        font-family: var(--umbradesktop-desktop-label-font, inherit);
        font-weight: var(--umbradesktop-desktop-label-weight, 900);
        color: rgba(255, 255, 255, 0.7);
        text-shadow: ${HALO_CSS};
      }
      .name,
      .domain {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        padding: ${HALO_ROOM};
        margin: calc(-1 * ${HALO_ROOM});
      }
      .domain {
        font-size: 0.4em;
        font-weight: 700;
        letter-spacing: 0;
        margin-top: calc(0.1em - ${HALO_ROOM});
      }
      /* Top corners measure from the edge. Bottom corners measure from the top of the taskbar
         reserve, the same token the window surface and the logo sit on, which keeps the label
         clear of a floating dock with no special case. */
      .label[data-corner='TopRight'] {
        top: ${INSET};
        right: ${INSET};
        text-align: right;
      }
      .label[data-corner='TopLeft'] {
        top: ${INSET};
        left: ${INSET};
      }
      .label[data-corner='BottomLeft'] {
        bottom: calc(var(--umbradesktop-taskbar-reserve, ${RESERVE_FALLBACK}) + ${INSET});
        left: ${INSET};
      }
      .label[data-corner='BottomRight'] {
        bottom: calc(var(--umbradesktop-taskbar-reserve, ${RESERVE_FALLBACK}) + ${INSET});
        right: ${INSET};
        text-align: right;
      }
    `,
  ];
}

export default UmbraDesktopLabelElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-desktop-label': UmbraDesktopLabelElement;
  }
}
