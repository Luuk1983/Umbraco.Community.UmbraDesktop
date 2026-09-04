import type { UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_SECTION_ALIAS } from '../constants';
import { findChromeRoot } from '../chrome-injector';
import { applySectionTabHide } from '../../headerapps/section-tab-hide.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UmbraDesktopAppCatalogueContext } from '../app-catalogue.context.js';
import { UmbraDesktopSettingsContext } from '../settings/settings.context.js';
import type { UmbraDesktopWallpaperView } from '../settings/wallpaper-view.js';
import './window.element.js';
import './taskbar.element.js';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

const OUTER_CHROME_STYLE_ID = 'umbradesktop-outer-chrome';

/** Root element of the Desktop section. Owns the window manager and layout. */
@customElement('umbradesktop-desktop')
export class UmbraDesktopDesktopElement extends UmbLitElement {
  #manager = new UmbraDesktopWindowManagerContext(this);

  #settings = new UmbraDesktopSettingsContext(this);

  @state()
  private _windows: UmbraDesktopWindow[] = [];

  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  constructor() {
    super();
    // Instantiating (without keeping a reference) is enough to provide the
    // catalogue context to the desktop subtree; nothing here consumes it directly.
    new UmbraDesktopAppCatalogueContext(this);
    this.observe(this.#manager.windows, (list) => (this._windows = list));
    this.observe(this.#settings.wallpaper, (wallpaper) => (this._wallpaper = wallpaper));
  }

  /**
   * Watches the desktop surface so a shrinking viewport (a narrowed browser, devtools opening, a
   * monitor undocked) pulls any stranded window back into reach instead of losing it off the edge.
   */
  #surfaceObserver = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect;
    if (box) this.#manager.clampToBounds({ w: box.width, h: box.height });
  });

  override connectedCallback() {
    super.connectedCallback();
    // Hide the outer backoffice header for a fullscreen desktop. Leaving the
    // section (via the taskbar's Exit) unmounts this element and restores it.
    this.#setOuterChrome(true);
    this.updateComplete.then(() => {
      const surface = this.renderRoot.querySelector('.surface');
      if (surface) this.#surfaceObserver.observe(surface);
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#surfaceObserver.disconnect();
    this.#setOuterChrome(false);
  }

  /**
   * Show or hide the outer backoffice header. The shell lives in shadow DOM, so
   * the style is injected into the shadow root that owns the header — a
   * document-level stylesheet cannot reach it.
   * @param hide Whether to hide the outer chrome (fullscreen when true).
   */
  #setOuterChrome(hide: boolean) {
    const root = findChromeRoot(this.ownerDocument);
    if (!root) return;
    const existing = root.getElementById(OUTER_CHROME_STYLE_ID);
    if (hide) {
      if (!existing) {
        const style = this.ownerDocument.createElement('style');
        style.id = OUTER_CHROME_STYLE_ID;
        style.textContent = `
          umb-backoffice-header { display: none !important; }
          umb-backoffice-main { height: 100% !important; }
        `;
        root.appendChild(style);
      }
    } else {
      existing?.remove();
      // The header was invisible for as long as the desktop was open, so a boot-time
      // `hideSectionTab` that timed out before the shell mounted would only become apparent
      // now. Re-assert it (idempotent) as the header comes back into view.
      applySectionTabHide(UMBRADESKTOP_SECTION_ALIAS, this.ownerDocument);
    }
  }

  /**
   * Inline background for the desktop surface. Returns an empty string when no image is set, so
   * the gradient declared in `styles` shows through untouched.
   *
   * `cover` because the shipped images are 16:9 and the desktop rarely is: `contain` would
   * letterbox and `100% 100%` would distort. The average colour sits underneath so there is no
   * flash before the image decodes.
   * @returns A CSS declaration string for the `style` attribute.
   */
  #wallpaperStyle(): string {
    const background = this._wallpaper?.background;
    if (!background?.url) return '';
    const colour = background.averageColour ? `background-color:${background.averageColour};` : '';
    return `${colour}background-image:url("${background.url}");background-size:cover;background-position:center;background-repeat:no-repeat;`;
  }

  override render() {
    const hasImage = !!this._wallpaper?.background.url;
    return html`
      <div class="desktop ${hasImage ? 'has-image' : ''}" style=${this.#wallpaperStyle()}>
        <div class="wallpaper-brand" aria-hidden="true">
          <umb-icon name="icon-umbraco"></umb-icon>
        </div>
        <div class="surface">
          ${repeat(
            this._windows,
            (w) => w.id,
            (w) => html`<umbradesktop-window .window=${w}></umbradesktop-window>`,
          )}
        </div>
        <umbradesktop-taskbar></umbradesktop-taskbar>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
      .desktop {
        position: relative;
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        /* How much of the bottom edge the taskbar or dock occupies. Themes override this;
           a floating dock reserves more than its own height so windows clear it. Declared
           here rather than in the taskbar because the surface and the watermark need it
           too, and it inherits down through every shadow boundary from this one place. */
        --umbradesktop-taskbar-reserve: var(--umbradesktop-taskbar-height, 50px);
        /* Wallpaper derived from the header token but pulled darker, so the desktop reads
           distinctly darker than the taskbar (and the light windows pop). This solid colour
           is the fallback for browsers without color-mix, upgraded by the @supports block
           below; the gradient adds a soft top-left highlight for depth. */
        background-color: var(--umbradesktop-desktop-background-color, #0e1329);
        background-image: var(
          --umbradesktop-desktop-background-image,
          radial-gradient(
            130% 130% at 25% 8%,
            var(--uui-color-header-background, #1b264f),
            color-mix(in srgb, var(--uui-color-header-background, #1b264f) 50%, black) 70%
          )
        );
      }
      /* Kept as a separate rule, rather than a second background-color declaration inside
         .desktop, so the color-mix upgrade still applies over the token's solid-colour
         default. That used to work by stacking two background-color declarations and
         relying on unsupported browsers to discard the invalid second one - but once the
         value moved behind var(--token, color-mix(...)), that whole declaration parses as
         valid everywhere, so the fallback would never fire. This @supports check does the
         same job explicitly. */
      @supports (background-color: color-mix(in srgb, red 50%, black)) {
        .desktop {
          background-color: var(
            --umbradesktop-desktop-background-color,
            color-mix(in srgb, var(--uui-color-header-background, #1b264f) 58%, black)
          );
        }
      }
      /* A modest scrim over an image wallpaper, so white windows and the taskbar keep their
         separation from a light or busy background. Deliberately light: enough to rescue
         Ribbon Candy and Retro Swoosh, not enough to flatten Golden Valley or push Ember Glow
         to black. Painted before .surface in DOM order, so it stays under the windows. */
      .desktop.has-image::before {
        content: '';
        position: absolute;
        inset: 0;
        background: var(--umbradesktop-desktop-scrim, rgba(0, 0, 0, 0.12));
        pointer-events: none;
      }
      /* The watermark reads as dirt on top of a photograph, so it belongs to the gradient only. */
      .desktop.has-image .wallpaper-brand {
        display: none;
      }
      /* A faint Umbraco mark watermarking the desktop. It lives behind the (transparent)
         window surface, so open windows always sit on top of it. */
      .wallpaper-brand {
        position: absolute;
        right: -4%;
        bottom: var(--umbradesktop-taskbar-reserve, 50px);
        pointer-events: none;
        color: var(--uui-color-header-contrast, #ffffff);
        opacity: var(--umbradesktop-desktop-watermark-opacity, 0.06);
      }
      .wallpaper-brand umb-icon {
        display: block;
        font-size: 55vh;
      }
      .surface {
        position: absolute;
        inset: 0;
        bottom: var(--umbradesktop-taskbar-reserve, 50px);
        overflow: hidden;
      }
      umbradesktop-taskbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000000;
      }
    `,
  ];
}

export default UmbraDesktopDesktopElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-desktop': UmbraDesktopDesktopElement;
  }
}
