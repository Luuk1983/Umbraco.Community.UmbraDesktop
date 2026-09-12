import {
  UMBRADESKTOP_PREVIEW_CONTROL_COUNT,
  UMBRADESKTOP_PREVIEW_SCALE,
  UMBRADESKTOP_PREVIEW_SCENE,
  UMBRADESKTOP_PREVIEW_WINDOW,
} from './constants.js';
import { paletteCss } from '../palette-css.js';
import type { UmbraDesktopVariant } from '../resolve-variant.js';
import type { UmbraDesktopPalette, UmbraDesktopTheme } from '../types.js';
import {
  UMBRADESKTOP_TASKBAR_HEIGHT,
  UMBRADESKTOP_TITLEBAR_BORDER,
  UMBRADESKTOP_TITLEBAR_HEIGHT,
  UMBRADESKTOP_WINDOW_BORDER,
} from '../../constants.js';
import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * A miniature of the desktop one theme paints: a window with its titlebar and controls, the
 * taskbar under it, on that theme's own desktop ground.
 *
 * It exists because the picker used to show three colour bars per theme, and colour is the property
 * these five themes differ in *least*. What sorts them is shape — where the window controls are,
 * how round the frame is, whether the taskbar is a full-width bar or a floating pill — and all of
 * that is already published as tokens and metrics. So the miniature is drawn from the theme itself
 * rather than stored as a screenshot: a theme that changes its dock radius changes its own preview
 * in the same edit, and light and dark follow the backoffice the way the real chrome does.
 *
 * **Drawn at desktop scale and shrunk.** See `constants.ts`: the scene is 960 by 600 desktop pixels
 * with a `transform: scale()` on it, so a 40px titlebar is written as 40px here too. Layout px are
 * therefore the theme's own numbers, which is why the tests read `getComputedStyle` and not
 * `getBoundingClientRect` — the latter reports them already scaled.
 *
 * **The class names are the chrome's.** `.frame`, `.titlebar`, `.title`, `.controls`, `.body`,
 * `.taskbar`: a theme's preview stylesheet can then use the selectors its author already knows from
 * writing the theme's window and taskbar sheets.
 *
 * **No launcher.** The launcher is a surface you open, not one the desktop rests in, and drawn open
 * in every preview it would cover the window that carries most of the signature. A theme that wants
 * to say something about its launcher has the chrome itself to say it in.
 *
 * **The fallbacks are the chrome's own, restated.** Every `var(--umbradesktop-…, …)` below carries
 * the same fallback the component that owns the token carries, because the Umbraco identity theme
 * ships an **empty palette** on purpose — its look lives entirely in those fallbacks — and a
 * miniature painted from palettes alone would render it as nothing at all. That is a second copy of
 * a number, so `theme-preview.test.ts` holds every one of them against the chrome's own CSS on each
 * run. Change a fallback in `window.element` or `taskbar.element` and that test tells you this file
 * needs the same edit.
 */
@customElement('umbradesktop-theme-preview')
export class UmbraDesktopThemePreviewElement extends UmbLitElement {
  /** The theme to paint. Nothing renders until one is set. */
  @property({ type: Object })
  public theme?: UmbraDesktopTheme;

  /**
   * Which of the theme's palettes to paint, so a row of previews agrees with the backoffice around
   * it rather than each preview picking for itself.
   */
  @property({ type: String })
  public variant: UmbraDesktopVariant = 'light';

  /**
   * The theme whose preview stylesheet is adopted right now, so a re-render for any other reason
   * does not re-import it.
   *
   * A plain field rather than `@state`: adopting a stylesheet paints without Lit's help, and
   * writing reactive state from `updated` schedules a second update for a render that would produce
   * identical markup — which Lit warns about, correctly.
   */
  #adopted?: UmbraDesktopTheme;

  /**
   * The palette to paint with. A theme with no dark palette is painted in its light one, which is
   * what the resolver does for the real chrome — a theme that has not written a dark variant looks
   * the same under both rather than losing its own look.
   * @returns The palette for the current variant.
   */
  #palette(): UmbraDesktopPalette {
    const palettes = this.theme?.palettes;
    if (!palettes) return {};
    return (this.variant === 'dark' ? palettes.dark : undefined) ?? palettes.light;
  }

  /** The sheets this element adopted itself, so removing them cannot touch Lit's own. */
  #themeSheets = new Set<CSSStyleSheet>();

  /** The sheet import in flight, if any. See {@link getUpdateComplete}. */
  #adopting?: Promise<void>;

  /**
   * Start loading the theme's own preview stylesheet when the theme changes.
   * @param changed Which properties changed, from Lit.
   */
  protected override updated(changed: Map<string, unknown>): void {
    if (!changed.has('theme') || this.#adopted === this.theme) return;
    this.#adopted = this.theme;
    this.#adopting = this.#adopt(this.theme);
  }

  /**
   * Hold `updateComplete` open until the theme's preview sheet has been adopted.
   *
   * Not a convenience for the tests, though it is what makes them deterministic: `updateComplete`
   * means "this element has finished painting what it was asked to paint", and a preview whose
   * traffic lights arrive a microtask later has not.
   * @returns Whether the update completed without another being scheduled.
   */
  protected override async getUpdateComplete(): Promise<boolean> {
    const complete = await super.getUpdateComplete();
    await this.#adopting;
    return complete;
  }

  /**
   * Adopt one theme's own preview stylesheet, for the signature a token cannot carry: a Windows 98
   * bevel, a macOS traffic light. Optional, and most themes ship none.
   *
   * Adopted here rather than through `UmbraDesktopThemeStyles`, which follows the theme *in force*:
   * a picker paints five themes at once and none of them need be the active one. Appended after the
   * element's own styles, the same way that controller does it, so a theme rule wins at equal
   * specificity without `!important`.
   * @param theme The theme to adopt for, which may be undefined while the element has none.
   */
  async #adopt(theme?: UmbraDesktopTheme): Promise<void> {
    const root = this.renderRoot as ShadowRoot;
    // Drop whatever the previous theme adopted before anything async, so a picker that re-renders
    // between two themes cannot leave the first theme's rules painting the second.
    root.adoptedStyleSheets = root.adoptedStyleSheets.filter((sheet) => !this.#themeSheets.has(sheet));
    this.#themeSheets.clear();

    const sheet = (await theme?.preview?.())?.styleSheet;
    // `theme` can have moved on while that import was in flight, and a stale sheet would paint the
    // wrong theme's signature onto the current one.
    if (!sheet || this.theme !== theme) return;
    this.#themeSheets.add(sheet);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  }

  /**
   * One end of the titlebar's controls, or nothing when this theme puts none there.
   *
   * The block's width is the theme's published metric and the glyph count is not — see
   * `UMBRADESKTOP_PREVIEW_CONTROL_COUNT`. Rendering nothing at all for a zero width matters: an
   * empty flex item would still take the gap around it and shift the title off the edge the theme
   * puts it on.
   * @param side Which end of the titlebar.
   * @param width The width the theme's metrics publish for it, in desktop px.
   * @returns The controls block, or nothing.
   */
  #renderControls(side: 'leading' | 'trailing', width: number) {
    if (width <= 0) return nothing;
    return html`<span class="controls ${side}" style="width:${width}px">
      ${Array.from({ length: UMBRADESKTOP_PREVIEW_CONTROL_COUNT }, () => html`<i></i>`)}
    </span>`;
  }

  override render() {
    if (!this.theme) return nothing;
    const metrics = this.theme.metrics;
    return html`
      <div class="scene" style=${paletteCss(this.#palette())} aria-hidden="true">
        <div class="frame">
          <div class="titlebar">
            ${this.#renderControls('leading', metrics.leadingControlsWidth)}
            <span class="title"></span>
            ${this.#renderControls('trailing', metrics.trailingControlsWidth)}
          </div>
          <div class="body"></div>
        </div>
        <div class="taskbar">
          <span class="start"></span>
          <span class="task"></span>
          <span class="task"></span>
        </div>
      </div>
    `;
  }

  static override styles = [
    css`
      /* One knob, read three times: the host's two dimensions and the scene's transform. A caller
         that wants a bigger preview — the picker does — sets '--umbradesktop-preview-scale' and the
         box tracks the drawing, where scaling from outside would leave the layout at the old size. */
      :host {
        --_scale: var(--umbradesktop-preview-scale, ${UMBRADESKTOP_PREVIEW_SCALE});
        display: block;
        width: calc(${UMBRADESKTOP_PREVIEW_SCENE.w}px * var(--_scale));
        height: calc(${UMBRADESKTOP_PREVIEW_SCENE.h}px * var(--_scale));
        /* The scene is laid out at full size and only painted small, so anything that escapes it —
           a window shadow, a dock's bottom margin — would otherwise overlap the preview beside it. */
        overflow: hidden;
      }
      .scene {
        position: relative;
        width: ${UMBRADESKTOP_PREVIEW_SCENE.w}px;
        height: ${UMBRADESKTOP_PREVIEW_SCENE.h}px;
        transform: scale(var(--_scale));
        transform-origin: top left;
        /* Mirrors 'desktop.element': the solid colour is the fallback for browsers without
           color-mix, upgraded in the @supports block below, and the gradient is the soft
           top-left highlight the desktop paints when no wallpaper is set. */
        background-color: var(--umbradesktop-desktop-background-color, #0e1329);
        background-image: var(
          --umbradesktop-desktop-background-image,
          radial-gradient(
            130% 130% at 25% 8%,
            var(--uui-color-header-background, #1b264f),
            color-mix(in srgb, var(--uui-color-header-background, #1b264f) 50%, black) 70%
          )
        );
        background-size: cover;
        background-position: center;
      }
      @supports (background-color: color-mix(in srgb, red 50%, black)) {
        .scene {
          background-color: var(
            --umbradesktop-desktop-background-color,
            color-mix(in srgb, var(--uui-color-header-background, #1b264f) 58%, black)
          );
        }
      }
      /* One window, positioned rather than laid out: its rectangle is the scene's composition, not
         anything a theme has an opinion about. Everything a theme *does* have an opinion about —
         the ring, the rounding, the shadow — is a token, and each fallback here is the one
         'window.element' carries. */
      .frame {
        position: absolute;
        left: ${UMBRADESKTOP_PREVIEW_WINDOW.x}px;
        top: ${UMBRADESKTOP_PREVIEW_WINDOW.y}px;
        width: ${UMBRADESKTOP_PREVIEW_WINDOW.w}px;
        height: ${UMBRADESKTOP_PREVIEW_WINDOW.h}px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--umbradesktop-window-background, var(--uui-color-surface));
        border: var(--umbradesktop-window-border, ${UMBRADESKTOP_WINDOW_BORDER}px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-window-radius, var(--uui-border-radius, 3px));
        /* The resting shadow, not '-active': a preview shows a desktop at rest, and the active
           shadow at 15% would only read as a slightly darker smudge anyway. */
        box-shadow: var(--umbradesktop-window-shadow, var(--uui-shadow-depth-3));
      }
      /* 'height', where the real titlebar sets 'min-height': there is no caption text here to grow
         it, and an exact height is what lets a test hold the preview against the theme's own
         number. */
      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-left: 16px;
        height: var(--umbradesktop-titlebar-height, ${UMBRADESKTOP_TITLEBAR_HEIGHT}px);
        color: var(--umbradesktop-titlebar-text, var(--uui-color-text));
        background: var(--umbradesktop-titlebar-background, var(--uui-color-surface));
        border-bottom: var(
          --umbradesktop-titlebar-border-bottom,
          ${UMBRADESKTOP_TITLEBAR_BORDER}px solid var(--uui-color-border)
        );
      }
      /* A bar rather than lettering: at this scale real text is a grey smear, and a caption in one
         theme's font against another's is a difference nobody can see here anyway. */
      .title {
        flex: 1;
        max-width: 220px;
        height: 12px;
        border-radius: 6px;
        background: currentColor;
        opacity: 0.35;
      }
      .controls {
        display: flex;
        align-items: center;
        justify-content: space-evenly;
        align-self: stretch;
        color: var(--umbradesktop-control-color, var(--uui-color-text));
      }
      .controls i {
        display: block;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.55;
      }
      /* Anchored to the bottom edge and left full width, so a theme's own margin and radius decide
         whether it reads as a bar across the screen or a dock floating above it. */
      .taskbar {
        position: absolute;
        inset: auto 0 0 0;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 16px;
        box-sizing: border-box;
        height: var(--umbradesktop-taskbar-height, ${UMBRADESKTOP_TASKBAR_HEIGHT}px);
        margin: var(--umbradesktop-taskbar-margin, 0);
        border-radius: var(--umbradesktop-taskbar-radius, 0);
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        background: var(--umbradesktop-taskbar-background, rgba(16, 20, 46, 0.72));
        border-top: var(--umbradesktop-taskbar-border-top, 1px solid rgba(255, 255, 255, 0.14));
        box-shadow: var(--umbradesktop-taskbar-shadow, 0 -4px 18px rgba(0, 0, 0, 0.4));
        /* Deliberately no 'backdrop-filter', which the real taskbar has: a blur radius is a length
           like any other and would be shrunk with the scene, so a theme's 18px blur would paint as
           a 2.7px one. A wrong blur reads as a smudge, and a translucent background over the
           desktop already carries the part of that look this size can show. */
      }
      .start,
      .task {
        height: 28px;
        border-radius: 6px;
        background: currentColor;
        opacity: 0.4;
      }
      .start {
        width: 36px;
      }
      .task {
        width: 96px;
      }
      .body {
        flex: 1;
        background: var(--umbradesktop-window-body-background, var(--uui-color-background));
      }
    `,
  ];
}

export default UmbraDesktopThemePreviewElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-theme-preview': UmbraDesktopThemePreviewElement;
  }
}
