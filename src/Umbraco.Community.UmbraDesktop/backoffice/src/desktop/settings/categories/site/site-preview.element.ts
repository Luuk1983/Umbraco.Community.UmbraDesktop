import type { DesktopLabelResponseModel } from '../../../../api/types.gen';
import type { UmbraDesktopWallpaperView } from '../../wallpaper-view';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token';
import { UMBRADESKTOP_DESKTOP_LABEL_CONTEXT } from '../../../desktop-label/desktop-label.context-token';
import '../../../desktop-label/desktop-label.element.js';
import type { UmbraDesktopResolvedTheme } from '../../../theme/resolve-variant';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../../theme/theme.context-token';
import { UMBRADESKTOP_PREVIEW_SCENE } from '../../../theme/preview/constants';
import '../../../theme/preview/theme-preview.element.js';
import { css, customElement, html, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * What the Site screen's settings add up to: this desktop with the label on it, and the tile the
 * installed app gets.
 *
 * Its own box on the Site screen rather than a picture under one setting, because it previews all
 * three groups at once: the name is on both halves, the label settings place it on the desktop, and
 * the icon is on the tile.
 *
 * **The desktop is the user's own**, in the theme and wallpaper in force. The label is white with a
 * dark halo precisely so that it reads on whatever wallpaper someone picked, and the only honest
 * way to show whether it does is over that wallpaper. The miniature is the theme picker's, and the
 * label on it is the real label component slotted into it, so it is drawn at desktop scale by the
 * same code that draws it on the desktop.
 *
 * Always drawn. With the label off the miniature stays, without a name on it, so switching the
 * label does not make the screen jump.
 */
@customElement('umbradesktop-settings-site-preview')
export class UmbraDesktopSettingsSitePreviewElement extends UmbLitElement {
  /**
   * The effective App name, from the Site screen.
   *
   * Handed in rather than read from the label context, because the Site screen holds the name as
   * it was just saved, and the label context holds it as it was when the label was last read.
   */
  @property({ attribute: false })
  name: string | null = null;

  /** The icon the manifest serves, as the server reports it, or null before it has loaded. */
  @property({ attribute: false })
  iconUrl: string | null = null;

  /** The label's switches, or null before they have loaded. */
  @state()
  private _label: DesktopLabelResponseModel | null = null;

  /** The wallpaper in force. */
  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  /** The theme in force, including the variant, as the desktop paints it. */
  @state()
  private _theme?: UmbraDesktopResolvedTheme;

  /**
   * Watches the box the miniature sits in, to keep the miniature's scale in step with its width.
   *
   * The box and not the miniature, and a box whose height comes from CSS: its size never depends on
   * the scale. Observing anything the scale resizes turned each measurement into another resize in
   * the same frame, which the browser reports as a ResizeObserver loop error.
   */
  #resize = new ResizeObserver(([entry]) => this.#fit(entry?.contentRect.width ?? 0));

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.observe(context?.wallpaper, (wallpaper) => (this._wallpaper = wallpaper), 'umbraDesktopWallpaper');
    });
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      this.observe(context?.resolved, (resolved) => (this._theme = resolved), 'umbraDesktopTheme');
    });
    this.consumeContext(UMBRADESKTOP_DESKTOP_LABEL_CONTEXT, (context) => {
      this.observe(context?.label, (label) => (this._label = label ?? null), 'umbraDesktopLabel');
    });
  }

  /**
   * Fit the miniature once its box exists, then keep it fitted.
   *
   * Measured straight away as well as observed. An observer reports on the next rendered frame,
   * and a tab in the background renders none, so a preview relying on it alone would sit at the
   * wrong size until the tab was looked at.
   */
  protected override firstUpdated(): void {
    const screen = this.shadowRoot?.querySelector('.screen');
    if (!screen) return;
    this.#fit(screen.getBoundingClientRect().width);
    this.#resize.observe(screen);
  }

  /**
   * Shrink the miniature so it fills a box of the given width.
   *
   * Measured rather than fixed, because the settings sidebar is not one width, and a miniature
   * sized for one would leave a gap or overflow in another. Written straight onto the miniature's
   * style rather than through a render: nothing else on the screen depends on it, and a render per
   * measurement would re-render the whole preview to change one number.
   * @param width The box's width, in px. Nothing happens for zero, which is a box not laid out yet.
   */
  #fit(width: number): void {
    if (width <= 0) return;
    this.shadowRoot
      ?.querySelector<HTMLElement>('umbradesktop-theme-preview')
      ?.style.setProperty('--umbradesktop-preview-scale', String(width / UMBRADESKTOP_PREVIEW_SCENE.w));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize.disconnect();
  }

  /**
   * The label to draw: the stored switches, under the Site screen's name.
   * @returns The label, or null before the switches have loaded.
   */
  #drawnLabel(): DesktopLabelResponseModel | null {
    if (!this._label) return null;
    return { ...this._label, name: this.name ?? this._label.name };
  }

  override render() {
    const shown = !!this._label?.show;
    return html`
      <figure class="desktop">
        <div class="screen">
          <umbradesktop-theme-preview
            .theme=${this._theme?.theme}
            .variant=${this._theme?.variant ?? 'light'}
            .wallpaper=${this._wallpaper?.background}>
            <umbradesktop-desktop-label .label=${this.#drawnLabel()}></umbradesktop-desktop-label>
          </umbradesktop-theme-preview>
        </div>
        <figcaption>
          ${this.localize.term(shown ? 'umbraDesktop_sitePreviewDesktop' : 'umbraDesktop_sitePreviewDesktopHidden')}
        </figcaption>
      </figure>
      <figure class="app">
        <div class="tile">
          ${this.iconUrl ? html`<img src=${this.iconUrl} alt="" />` : html`<span class="icon"></span>`}
          <span class="name">${this.name ?? ''}</span>
        </div>
        <figcaption>${this.localize.term('umbraDesktop_sitePreviewApp')}</figcaption>
      </figure>
    `;
  }

  static override styles = [
    css`
      /* The desktop takes what the tile leaves. The tile is a fixed width: it previews a 48px icon,
         and growing it would only add empty space around one. */
      :host {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 112px;
        gap: var(--uui-size-space-4);
      }
      /* Both halves stretch to the taller one, and the tile fills its half, so the tile stands as
         tall as the miniature beside it at any width and the two captions sit on one line. */
      figure {
        margin: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      figcaption {
        margin-top: var(--uui-size-space-2);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* Sized by the column and the desktop's proportions alone, so measuring it can never feed
         back into it. The miniature is placed over it rather than laid out in it for the same
         reason: its own size follows the scale, and in flow it would size this box too. */
      .screen {
        position: relative;
        aspect-ratio: ${UMBRADESKTOP_PREVIEW_SCENE.w} / ${UMBRADESKTOP_PREVIEW_SCENE.h};
        overflow: hidden;
        border-radius: var(--uui-border-radius, 3px);
      }
      .screen umbradesktop-theme-preview {
        position: absolute;
        top: 0;
        left: 0;
      }
      .tile {
        flex: 1;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3);
        border: 1px solid var(--uui-color-divider, var(--uui-color-border));
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-background);
      }
      /* Deliberately small and rounded: a rehearsal of a taskbar tile, not a gallery. Shown at 48px
         because a preview that flatters at 512 tells you nothing about the size the icon is used at. */
      .tile img,
      .tile .icon {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        display: block;
      }
      .name {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopSettingsSitePreviewElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-site-preview': UmbraDesktopSettingsSitePreviewElement;
  }
}
