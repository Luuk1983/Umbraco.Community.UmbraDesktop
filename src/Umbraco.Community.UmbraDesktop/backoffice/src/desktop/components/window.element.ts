import type { Rect, UmbraDesktopWindow } from '../types';
import type { UmbraDesktopResizeEdges } from '../window-model';
import { clampResizeOrigin, clampWindowPosition, resizeRect, restoreDragPosition } from '../window-model';
import { injectChromeStyles } from '../chrome-injector';
import { resolveThemeSync, syncThemeStylesheet } from '../iframe-theme.js';
import type { UmbraDesktopThemeManifest } from '../iframe-theme.js';
import {
  UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS,
  UMBRADESKTOP_CONTROL_WIDTH,
  UMBRADESKTOP_DEFAULT_METRICS,
  UMBRADESKTOP_TITLEBAR_BORDER,
  UMBRADESKTOP_TITLEBAR_HEIGHT,
  UMBRADESKTOP_WINDOW_BORDER,
  UMBRADESKTOP_WINDOW_KEEP_VISIBLE,
  UMBRADESKTOP_WINDOW_MIN_SIZE,
} from '../constants';
import { minWindowSizeForContent } from '../window-chrome.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../theme/theme.context-token.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
// Side-effect import: registering `<umbradesktop-app-host>` is what makes the element branch of
// `#renderBody` resolve to something. Nothing else in the bundle imports that module, so without
// this line Vite tree-shakes it out and an element window paints an empty body — invisibly to both
// gates, since `tsc` still type-checks the file and the host's own test imports it directly.
import './app-host.element.js';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_THEME_CONTEXT, UMB_THEME_LIGHT_ALIAS } from '@umbraco-cms/backoffice/themes';

/** The eight resize handles: direction (for the cursor class) + which edges each pulls. */
const RESIZE_HANDLES: ReadonlyArray<{ dir: string; edges: UmbraDesktopResizeEdges }> = [
  { dir: 'n', edges: { top: true } },
  { dir: 's', edges: { bottom: true } },
  { dir: 'e', edges: { right: true } },
  { dir: 'w', edges: { left: true } },
  { dir: 'ne', edges: { top: true, right: true } },
  { dir: 'nw', edges: { top: true, left: true } },
  { dir: 'se', edges: { bottom: true, right: true } },
  { dir: 'sw', edges: { bottom: true, left: true } },
];

/**
 * How far the pointer must travel across a maximized titlebar before the drag un-maximizes the
 * window. Without it a bare click — or the first half of the double-click that toggles maximize —
 * would shrink the window out from under the user.
 */
const RESTORE_DRAG_THRESHOLD = 5;

/**
 * A single draggable desktop window. Its body is whichever kind the app's `content` names: a
 * backoffice iframe, or one self-contained app element (see `#renderBody`). Presentational state
 * comes from the `window` property; all mutations go through the manager.
 *
 * The chrome injection, the theme mirroring and the reload belong to the iframe kind alone, because
 * all of it exists to manage a second booting backoffice. Mostly the element kind misses them by
 * construction rather than by a flag, since those paths start from `iframe.body`, which an element
 * window has not got; `render` and `willUpdate` are the two that branch on `content.kind`
 * explicitly, and they say so where they do.
 *
 * `.focus-catcher` is the one piece of iframe machinery an element body does reach on purpose, and
 * its own comment in `render` explains why it is kept there.
 */
@customElement('umbradesktop-window')
export class UmbraDesktopWindowElement extends UmbLitElement {
  @property({ attribute: false })
  window?: UmbraDesktopWindow;

  @state()
  private _dragging = false;

  @state()
  private _loading = true;

  /**
   * The desktop chrome theme id in force, stamped onto an element app so it may branch.
   *
   * An element app lives in this document, so it inherits every desktop token by ordinary CSS
   * inheritance and needs nothing from here to look right. This is for the app that wants to do
   * more than take colours: a game whose board is square under Windows 98 and rounded under macOS
   * has to know which it is, and an attribute it can select on is a cheaper contract than a context
   * it has to consume.
   *
   * Stamped on the app host, which forwards it to the app's own element. Both, not either: an app
   * with a shadow root selects on itself with `:host([data-umbradesktop-theme='win98'])` (design
   * D9, which rejects the ancestor form `:host-context` because Firefox has never shipped it),
   * while an app that renders into light DOM has no `:host` at all and reads the attribute from its
   * parent instead.
   *
   * `@state` rather than a `#`-private field with a `requestUpdate()` beside every assignment. Two
   * reasons, in order: decorators cannot be applied to a `#`-private name, so "make it reactive"
   * and "keep it `#`" are not both available; and of the two remaining shapes this is the one where
   * forgetting is impossible — a theme change that scheduled no render would leave the attribute on
   * last session's theme, silently, since nothing else in this element reads the field. `@state`
   * also dirty-checks, so the identical re-emissions an observable produces cost nothing, where a
   * bare `requestUpdate()` would re-render for each.
   *
   * Empty until the theme context resolves, and the empty string renders *no* attribute rather than
   * an empty one — see `#renderBody`.
   */
  @state()
  private _chromeThemeId = '';

  /**
   * The active theme's geometry, which is what turns the app's **content** minimum into the
   * window minimum this element writes into its own inline style.
   *
   * Read from the theme context rather than from the window manager, even though the manager holds
   * the same object for its own sizing. The manager arrives through `consumeContext` into a
   * `#`-private field with no `requestUpdate` beside it, so a render that read it before the
   * context resolved would keep whatever minimum it computed then; this lands in reactive state on
   * the same observable the theme id does, so a theme change re-renders the frame with the new
   * floor. Two readers of one source, not two sources.
   *
   * Starts on the base chrome's metrics, which is also what the Umbraco theme publishes, so the
   * gap before a theme resolves is a real geometry rather than zeroes.
   */
  @state()
  private _metrics = UMBRADESKTOP_DEFAULT_METRICS;

  #manager?: UmbraDesktopWindowManagerContext;
  #startPointer = { x: 0, y: 0 };
  #startRect = { x: 0, y: 0 };
  #startSurface = { left: 0, top: 0, w: 0, h: 0 };
  #pendingRestore = false;
  #resizing = false;
  #resizeEdges: UmbraDesktopResizeEdges = {};
  #resizeStartPointer = { x: 0, y: 0 };
  #resizeStartRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  /** The backoffice light/dark theme in force, as `UMB_THEME_CONTEXT` reports it. */
  #themeAlias: string = UMB_THEME_LIGHT_ALIAS;

  /** Every registered `theme` extension, so a theme's stylesheet can be looked up by alias. */
  #themes: ReadonlyArray<UmbraDesktopThemeManifest> = [];

  /**
   * The alias this frame was last brought in line with. Undefined until the first sync, which is
   * what keeps a frame that booted on a JS-loaded theme from reloading itself on sight — and,
   * since the reload path re-enters through the load handler, from doing so forever.
   */
  #syncedAlias?: string;

  constructor() {
    super();
    // Adopts the active theme's window-surface stylesheet into this element's shadow root.
    new UmbraDesktopThemeStyles(this, 'window');
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
    this.consumeContext(UMB_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(context.theme, (alias) => {
        this.#themeAlias = alias || UMB_THEME_LIGHT_ALIAS;
        this.#applyFrameTheme();
      });
    });
    // The desktop's chrome theme, which is a different thing from Umbraco's light/dark above: that
    // one decides a *variant*, this one decides which of the five chromes is being painted. Only an
    // element app needs it, and only an app that branches structurally rather than on colour, so
    // this is the whole of the plumbing — see `_chromeThemeId`.
    //
    // `resolved` and not a `themeId` observable, because there is no such observable and this does
    // not warrant adding one: `resolved` carries the theme in force, and reading `theme.id` off it
    // is how the context's own `metrics` reaches `theme.metrics`.
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      if (!context) return;
      this.observe(
        context.resolved,
        (resolved) => {
          this._chromeThemeId = resolved?.theme.id ?? '';
          // The same subscription carries the geometry, because it is the same fact: `resolved`
          // holds the theme in force, and `theme.metrics` is how the theme context's own `metrics`
          // observable is fed. A window with no theme resolved falls back to the base chrome's.
          this._metrics = resolved?.theme.metrics ?? UMBRADESKTOP_DEFAULT_METRICS;
        },
        'observeChromeThemeId',
      );
    });
    this.observe(umbExtensionsRegistry.byType('theme'), (themes) => {
      this.#themes = themes;
      this.#applyFrameTheme();
    });
  }

  /**
   * The document inside this window's frame, when it is ours to touch. `contentDocument` is null
   * for a cross-origin frame, which is the one case there is nothing to be done about.
   * @returns The frame's document, or undefined.
   */
  #frameDocument(): Document | undefined {
    const iframe = this.renderRoot?.querySelector('iframe.body') as HTMLIFrameElement | null;
    return iframe?.contentDocument ?? undefined;
  }

  /**
   * Put the frame's backoffice on the same light/dark theme as the desktop around it.
   *
   * A frame only takes its theme from its own head, and Umbraco's theme context only reads the
   * stored alias once, when it boots — so a window that was already open when the theme changed
   * would otherwise stay on the old one until it was reloaded. Swapping the same stylesheet link
   * Umbraco itself swaps costs the user nothing; reloading would cost them anything unsaved in a
   * content editor, which is far too much for a display preference.
   *
   * Iframe-only, and the guard that makes it so is the `!doc` return: an element window has no
   * frame, so `#frameDocument` gives nothing and this leaves even `#syncedAlias` alone. That
   * matters more than it looks now that reload means "new game" for an element body, because the
   * branch below reloads a window on a theme it cannot mirror. Reaching it with an element body
   * would throw a player's board away every time somebody toggled dark mode. An element app needs
   * none of this in the first place: it is in this document, so it takes the theme by inheritance.
   */
  #applyFrameTheme(): void {
    const doc = this.#frameDocument();
    if (!doc) return;
    const sync = resolveThemeSync(this.#themes, this.#themeAlias);
    if (sync.mirrorable) {
      syncThemeStylesheet(doc, sync);
    } else if (this.#syncedAlias !== undefined && this.#syncedAlias !== this.#themeAlias) {
      // A theme whose CSS is a loader function has no link to copy. Reloading hands the job to
      // the frame's own theme context, which loads it exactly as it would on a fresh boot.
      this.#onReload();
    }
    this.#syncedAlias = this.#themeAlias;
  }

  #onIframeLoad(e: Event) {
    const iframe = e.target as HTMLIFrameElement;
    if (!this.window) return;
    // Keep the loader up until the header is actually stripped, so the booting
    // backoffice (with its own header) never flashes into view.
    injectChromeStyles(iframe, this.window.app.chromeProfile, () => (this._loading = false));
    // A frame boots on the stored alias, so it is normally already right — but a theme changed
    // while it was still loading would have been missed, and the reload path lands here too.
    this.#applyFrameTheme();
    // Safety net: reveal anyway if the shell never reports ready. The same deadline the element
    // path gives its own loader, for the reason the constant carries.
    window.setTimeout(() => (this._loading = false), UMBRADESKTOP_BODY_LOAD_TIMEOUT_MS);
  }

  /**
   * Take the window's overlay down for an element body, which never raises it again.
   *
   * `_loading` starts `true` so the booting backoffice never flashes into view, and `#onIframeLoad`
   * is what lowers it again. An element body has no load event of its own and the app host paints
   * its own spinner while the dynamic import is in flight, so leaving the flag set would cover that
   * spinner with a second one and spin the reload glyph forever. Clearing it here rather than in
   * `render` because `render` may not write reactive state: Lit warns about it and it costs a
   * second render pass. `willUpdate` is the hook that exists for exactly this, and a write from it
   * lands in the update already in flight.
   *
   * The kind check is the load-bearing half, not a tidiness one: without it the overlay comes down
   * on the first update of an *iframe* window too, which is the flash of the booting backoffice's
   * own header that `_loading = true` exists to prevent and that `#onIframeLoad` is built to time.
   * `window-body.test.ts` asserts both directions so dropping it fails rather than looks fine.
   * @param changed The properties this update is for.
   */
  override willUpdate(changed: Map<string, unknown>) {
    // Chained up even though neither `UmbLitElement` nor the element-api mixin defines it today:
    // a base class gaining a `willUpdate` in an Umbraco minor would otherwise break silently.
    super.willUpdate(changed);
    if (changed.has('window') && this.window?.app.content.kind === 'element') this._loading = false;
  }

  /**
   * Reload the hosted app, the way F5 would in a browser tab. Windows host a full backoffice
   * document, so a stale list or a change made elsewhere can only be picked up by re-fetching —
   * and pressing F5 on the desktop itself would reload the whole desktop instead.
   *
   * **An iframe operation only, and the control that calls it is drawn only on an iframe window.**
   * It used to recreate an element app too, under a titlebar button relabelled "Restart" (design
   * D14), and that button is gone: on an element window it did nothing that closing the window and
   * opening it again does not, since the element is destroyed either way, and it cost a fixed 46px
   * of a titlebar that turned out not to have 46px to spare. An iframe is the case where reload is
   * genuinely different from close-and-reopen, because it re-fetches a remote document in place and
   * keeps the window's route, size and position.
   */
  #onReload() {
    const w = this.window;
    // Narrowed rather than asserted, and it earns its keep twice: it is what lets the frame's own
    // `url` be read below, and it is the guard for the caller that is not the button — the theme
    // sync falls back to a reload for a theme whose CSS cannot be mirrored, and it must not act on
    // a window that has no frame to reload.
    if (!w || w.app.content.kind !== 'iframe') return;
    const iframe = this.renderRoot?.querySelector('iframe.body') as HTMLIFrameElement | null;
    if (!iframe) return;
    // Cover the frame again: the reloading backoffice re-renders its own header before the
    // chrome styles are re-injected, which would otherwise flash into view.
    this._loading = true;
    try {
      // Same-origin backoffice: reload in place, so the window keeps whatever route the user
      // navigated to inside it.
      iframe.contentWindow?.location.reload();
    } catch {
      // Cross-origin document — `location.reload()` is off limits there. Re-pointing the frame
      // always reloads, at the cost of returning to the app's entry route.
      iframe.src = w.app.content.url;
    }
  }

  /**
   * The smallest this window may be, in the frame's own sizing box.
   *
   * One place, because two callers must agree: the inline `min-width`/`min-height` this element
   * renders, and the clamp `#onResizeMove` applies while a handle is being dragged. A resize
   * clamped to one number while the CSS enforced another is a window that fights the pointer.
   * @param w The window being sized.
   * @returns The minimum window size under the active theme.
   */
  #minWindowSize(w: UmbraDesktopWindow) {
    return minWindowSizeForContent(w.app.minSize, UMBRADESKTOP_WINDOW_MIN_SIZE, this._metrics);
  }

  /**
   * Position and size of the desktop surface this window is laid out against — the frame's offset
   * parent. Measured once per drag so the clamp costs no layout work per pointer move.
   * @returns The surface rectangle in client coordinates, falling back to the viewport if the
   * frame is not laid out yet.
   */
  #surfaceRect(): { left: number; top: number; w: number; h: number } {
    const frame = this.renderRoot?.querySelector('.frame') as HTMLElement | null;
    const surface = frame?.offsetParent as HTMLElement | null;
    if (!surface) return { left: 0, top: 0, w: window.innerWidth, h: window.innerHeight };
    const box = surface.getBoundingClientRect();
    return { left: box.left, top: box.top, w: surface.clientWidth, h: surface.clientHeight };
  }

  #onTitlePointerDown = (e: PointerEvent) => {
    if (!this.window) return;
    this.#startPointer = { x: e.clientX, y: e.clientY };
    this.#startSurface = this.#surfaceRect();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (this.window.state === 'maximized') {
      // Arm the drag rather than starting it — a maximized window only un-maximizes once the
      // pointer proves the intent by moving.
      this.#pendingRestore = true;
      return;
    }
    this._dragging = true;
    this.#startRect = { x: this.window.rect.x, y: this.window.rect.y };
  };

  /**
   * Turn a drag on a maximized titlebar into a drag of the restored window, the way Windows and
   * macOS do: past the movement threshold the window un-maximizes to its previous size, arriving
   * under the pointer, and the drag carries on from there.
   * @param e The pointer move being handled.
   */
  #restoreUnderPointer(e: PointerEvent) {
    const w = this.window;
    if (!w) return;
    const travelled = Math.max(
      Math.abs(e.clientX - this.#startPointer.x),
      Math.abs(e.clientY - this.#startPointer.y),
    );
    if (travelled < RESTORE_DRAG_THRESHOLD) return;
    const pos = restoreDragPosition(e.clientX - this.#startSurface.left, this.#startSurface, w.rect);
    this.#pendingRestore = false;
    this._dragging = true;
    // Re-anchor the drag to where the window now is, so the next move is a delta from here.
    this.#startPointer = { x: e.clientX, y: e.clientY };
    this.#startRect = pos;
    this.#manager?.restoreTo(w.id, pos.x, pos.y);
  }

  #onTitlePointerMove = (e: PointerEvent) => {
    if (this.#pendingRestore) this.#restoreUnderPointer(e);
    if (!this._dragging || !this.window) return;
    const dx = e.clientX - this.#startPointer.x;
    const dy = e.clientY - this.#startPointer.y;
    // Clamped so a window can never be dragged out of reach: the titlebar stays on the desktop.
    const { x, y } = clampWindowPosition(
      { ...this.window.rect, x: this.#startRect.x + dx, y: this.#startRect.y + dy },
      this.#startSurface,
      // The active theme's margins; falls back to the Umbraco theme's until the manager context
      // resolves (the two are identical today, so there is no visible gap in practice).
      // The manager publishes the active theme's margins; the constant only covers the moment
      // before `consumeContext` has resolved. It stays correct because the Umbraco theme builds
      // its own metrics from this same constant — the two are one value, not two that agree.
      this.#manager?.keep ?? UMBRADESKTOP_WINDOW_KEEP_VISIBLE,
    );
    this.#manager?.move(this.window.id, x, y);
  };

  #onTitlePointerUp = (e: PointerEvent) => {
    this._dragging = false;
    this.#pendingRestore = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  #onResizeDown = (e: PointerEvent, edges: UmbraDesktopResizeEdges) => {
    if (!this.window || this.window.state !== 'normal') return;
    e.stopPropagation();
    this.#manager?.focus(this.window.id);
    this.#resizing = true;
    this.#resizeEdges = edges;
    this.#resizeStartPointer = { x: e.clientX, y: e.clientY };
    this.#resizeStartRect = { ...this.window.rect };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  #onResizeMove = (e: PointerEvent) => {
    if (!this.#resizing || !this.window) return;
    const dx = e.clientX - this.#resizeStartPointer.x;
    const dy = e.clientY - this.#resizeStartPointer.y;
    // Origin-clamped for the same reason as the drag: pulling the top edge up past the desktop
    // would take the titlebar — the only grab handle — with it.
    const rect = clampResizeOrigin(
      resizeRect(this.#resizeStartRect, this.#resizeEdges, dx, dy, this.#minWindowSize(this.window)),
    );
    this.#manager?.resize(this.window.id, rect);
  };

  #onResizeUp = (e: PointerEvent) => {
    this.#resizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  };

  #onFocus = () => {
    if (this.window) this.#manager?.focus(this.window.id);
  };

  /** Double-clicking the titlebar toggles maximize/restore, as on Windows/GNOME/KDE. */
  #onTitleDblClick = () => {
    if (!this.window) return;
    const maximized = this.window.state === 'maximized';
    this.#manager?.setState(this.window.id, maximized ? 'normal' : 'maximized');
  };

  /**
   * A crisp, font-independent window-control glyph drawn as inline SVG. Stroke and fill are set
   * in CSS via `currentColor`, so the mark follows the button's text colour (and turns white on
   * the close button's danger hover).
   * @param kind Which control the glyph represents.
   * @returns The SVG template for that control.
   */
  #controlGlyph(kind: 'reload' | 'minimize' | 'maximize' | 'restore' | 'close') {
    const glyphs = {
      // A near-full ring with a *solid* arrowhead, the way Chrome and Material draw refresh. The
      // stroked right-angle arrowhead that Lucide (and so Umbraco's own icon-refresh) uses is only
      // a couple of pixels of mark at this size and reads as a nick in the circle, not an arrow.
      reload: html`<svg class="glyph ring" viewBox="0 0 16 16">
        <path d="M8 2.6 A5.4 5.4 0 1 0 13.4 8"></path>
        <path class="solid" d="M7.6 0.5 L11.7 2.6 L7.6 4.7 Z"></path>
      </svg>`,
      minimize: html`<svg class="glyph" viewBox="0 0 12 12"><line x1="2.5" y1="6.5" x2="9.5" y2="6.5"></line></svg>`,
      maximize: html`<svg class="glyph" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7"></rect></svg>`,
      restore: html`<svg class="glyph" viewBox="0 0 12 12">
        <rect x="2.5" y="3.5" width="6" height="6"></rect>
        <path d="M4.5 3.5 V2 H9.5 V7 H8"></path>
      </svg>`,
      close: html`<svg class="glyph" viewBox="0 0 12 12">
        <line x1="3" y1="3" x2="9" y2="9"></line>
        <line x1="9" y1="3" x2="3" y2="9"></line>
      </svg>`,
    };
    return glyphs[kind];
  }

  /**
   * The window body: a backoffice iframe, or a self-contained app element.
   *
   * The element branch deliberately carries none of the iframe branch's machinery: no chrome
   * injection, no theme mirroring, no reload-in-place, because all three exist to manage a booting
   * second backoffice and there is not one here. The app host owns its own load state, including a
   * spinner for the dynamic import and a timeout for one that never resolves, so this window does
   * not put an overlay over it either.
   *
   * The element is committed plainly, with no `keyed` wrapper. There used to be one, keyed on an
   * `_appInstance` counter, and it was what made the titlebar's Restart button mean anything: a
   * changed key throws the old element away instead of reusing it with its board still on screen.
   * That button is gone (see `#onReload`), nothing else ever bumped the counter, and a key nothing
   * changes is a key. Lit reuses this element across every other re-render, which is exactly what
   * the theme binding below depends on.
   *
   * `.alias` is passed for the host's console diagnostics only, because a load failure is otherwise
   * unattributable: the error says what went wrong and the host has no idea which of the installed
   * apps it went wrong for. This is the only place that knows, and it is one property away. The host
   * treats it as non-reactive precisely so passing it here cannot restart a running app.
   *
   * `data-umbradesktop-theme` is an attribute on the host, so a theme change re-commits it on the
   * element already mounted rather than replacing that element. That is the difference between
   * recolouring a game and restarting one, and it is why the plain commit above matters: a `keyed`
   * wrapper whose key moved on a theme change would restart every app in every window the moment
   * somebody switched theme. The host takes it from there — it reads the attribute back as a reactive property and
   * writes it onto the app's own element, which is where an app's `:host(...)` selector can see it.
   *
   * `|| nothing` rather than the raw value, so an unresolved theme renders no attribute at all.
   * `data-umbradesktop-theme=""` would still match `[data-umbradesktop-theme]`, which hands an app
   * a positive existence check and an unusable value; absent is a state an app can actually
   * recognise. The attribute's name is `UMBRADESKTOP_THEME_ATTRIBUTE`, spelled out here only
   * because Lit's `html` interpolates attribute values and not their names — `window-body.test.ts`
   * reads it back through the constant so the two cannot drift apart unnoticed.
   * @param w The window to render the body of.
   * @returns The body template.
   */
  #renderBody(w: UmbraDesktopWindow) {
    if (w.app.content.kind === 'element') {
      return html`<umbradesktop-app-host
        class="body"
        data-umbradesktop-theme=${this._chromeThemeId || nothing}
        .alias=${w.app.alias}
        .load=${w.app.content.element}></umbradesktop-app-host>`;
    }
    return html`<iframe class="body" src=${w.app.content.url} @load=${this.#onIframeLoad}></iframe>`;
  }

  override render() {
    const w = this.window;
    if (!w) return null;
    // `minSize` is the app's content box, so the chrome is added here — and floored at what the
    // chrome itself needs, because this inline `min-width` beats the frame's own CSS minimum and
    // an app's number must not be able to push a window control off the end of the titlebar.
    const min = this.#minWindowSize(w);
    const maximized = w.state === 'maximized';
    // One button, two meanings, so the label has to say which. On the iframe path a reload
    // re-fetches and keeps whatever route the user navigated to inside the frame, so nothing of
    // theirs is lost; on the element path the instance is discarded, and for a game that is the
    // board. Naming both "Reload" promised a refresh to someone four minutes into Minesweeper.
    // "Restart" rather than "New game" because the shell cannot know the app is a game: all it
    // knows is that this kind starts over. The button stays unguarded either way, since F5 costs a
    // browser game its state too and people understand that.
    const style = maximized
      ? `left:0; top:0; width:100%; height:100%; z-index:${w.z};`
      : `left:${w.rect.x}px; top:${w.rect.y}px; width:${w.rect.w}px; height:${w.rect.h}px; z-index:${w.z}; min-width:${min.w}px; min-height:${min.h}px;`;
    return html`
      <div
        class="frame ${w.active ? 'active' : ''}"
        style=${style}
        ?hidden=${w.state === 'minimized'}
        @pointerdown=${this.#onFocus}>
        <div
          class="titlebar"
          @pointerdown=${this.#onTitlePointerDown}
          @pointermove=${this.#onTitlePointerMove}
          @pointerup=${this.#onTitlePointerUp}
          @dblclick=${this.#onTitleDblClick}>
          <span class="title">
            <umb-icon name=${w.app.icon}></umb-icon>
            <span class="title-text">${this.localize.string(w.app.name)}</span>
          </span>
          <span
            class="controls"
            @pointerdown=${(e: PointerEvent) => e.stopPropagation()}
            @dblclick=${(e: MouseEvent) => e.stopPropagation()}>
            <!-- Reload is drawn for an iframe body and not for an element one. For an iframe it
                 re-fetches a booting backoffice in place, which nothing else in the shell can do.
                 For an element app it threw the instance away and built another, which is what
                 closing the window and opening it again already does — so it was a destructive
                 button whose only distinction was keeping the window's rect, and it took 46px of
                 titlebar from apps whose windows are small enough to need every pixel: a
                 nine-by-nine game asks for a 274px window, and four controls plus its own name
                 wanted 311px of it. -->
            ${w.app.content.kind === 'iframe'
              ? html`<button
                  class="ctrl ctrl-reload ${this._loading ? 'busy' : ''}"
                  title="Reload"
                  aria-label="Reload"
                  @click=${() => this.#onReload()}>
                  ${this.#controlGlyph('reload')}
                </button>`
              : nothing}
            <button
              class="ctrl ctrl-minimize"
              title="Minimize"
              aria-label="Minimize"
              @click=${() => this.#manager?.setState(w.id, 'minimized')}>
              ${this.#controlGlyph('minimize')}
            </button>
            <button
              class="ctrl ctrl-maximize"
              title=${maximized ? 'Restore' : 'Maximize'}
              aria-label=${maximized ? 'Restore' : 'Maximize'}
              @click=${() => this.#manager?.setState(w.id, maximized ? 'normal' : 'maximized')}>
              ${this.#controlGlyph(maximized ? 'restore' : 'maximize')}
            </button>
            <!-- 'close' is kept alongside 'ctrl-close' because '.ctrl.close:hover' still keys off
                 it for the red hover state — dropping it would silently kill that hover. -->
            <button
              class="ctrl ctrl-close close"
              title="Close"
              aria-label="Close"
              @click=${() => this.#manager?.close(w.id)}>
              ${this.#controlGlyph('close')}
            </button>
          </span>
        </div>
        <div class="bodywrap">
          ${this.#renderBody(w)}
          <!-- Kept for both body kinds, deliberately. It exists because an inactive iframe
               swallows the pointer event that should have focused its window, so the catcher takes
               the click instead. An element body needs no such help: a click on it bubbles to the
               frame's own '@pointerdown'. Leaving the catcher up anyway costs an inactive element
               window its first click, and that is the intended trade: click-to-focus then act is
               what every OS window does, and a stray click landing on a card or a mine in a window
               the user was not looking at is the worse outcome. 'window-body.test.ts' pins it so
               the catcher cannot quietly become iframe-only. -->
          ${!w.active
            ? html`<div class="focus-catcher" @pointerdown=${this.#onFocus}></div>`
            : ''}
          ${this._loading ? html`<div class="loading"><uui-loader></uui-loader></div>` : ''}
        </div>
        ${w.state === 'normal'
          ? RESIZE_HANDLES.map(
              (rh) => html`<div
                class="rh rh-${rh.dir}"
                @pointerdown=${(e: PointerEvent) => this.#onResizeDown(e, rh.edges)}
                @pointermove=${this.#onResizeMove}
                @pointerup=${this.#onResizeUp}></div>`,
            )
          : ''}
      </div>
    `;
  }

  static override styles = [
    css`
      .frame {
        position: absolute;
        display: flex;
        flex-direction: column;
        background: var(--umbradesktop-window-background, var(--uui-color-surface));
        /* The px values here and on '.titlebar'/'.ctrl' below are interpolated rather than
           written, because the Umbraco theme's 'metrics' are the sum of exactly these boxes — see
           UMBRADESKTOP_WINDOW_KEEP_VISIBLE. A literal in one place and a sum in the other is how
           'trailing' came to describe three buttons for as long as there have been four. */
        border: var(--umbradesktop-window-border, ${UMBRADESKTOP_WINDOW_BORDER}px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-window-radius, var(--uui-border-radius, 3px));
        box-shadow: var(--umbradesktop-window-shadow, var(--uui-shadow-depth-3));
        overflow: hidden;
        /* Interpolated rather than written, like the geometry above: a normal window's inline
           style carries a minimum derived from the app and the active theme's chrome and beats
           these, so what these two actually govern is a *maximized* window, whose inline style has
           no minimum at all. They were literals with a comment asking whoever changed the constant
           to remember them. */
        min-width: ${UMBRADESKTOP_WINDOW_MIN_SIZE.w}px;
        min-height: ${UMBRADESKTOP_WINDOW_MIN_SIZE.h}px;
      }
      /* Focus is shown the way Windows/GNOME/KDE all show it: the active window is the
         crisp, elevated one (full-strength titlebar + deeper shadow) and inactive windows
         recede (muted titlebar, flatter shadow) — no header tint. */
      .frame.active {
        box-shadow: var(--umbradesktop-window-shadow-active, var(--uui-shadow-depth-5));
      }
      .titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-2);
        /* No vertical or right padding: the controls run full height and flush to the
           top-right edge, so the corner buttons are easy targets (Fitts's law). */
        padding: 0 0 0 var(--uui-size-space-3);
        min-height: var(--umbradesktop-titlebar-height, ${UMBRADESKTOP_TITLEBAR_HEIGHT}px);
        background: var(--umbradesktop-titlebar-background, var(--uui-color-surface));
        border-bottom: var(
          --umbradesktop-titlebar-border-bottom,
          ${UMBRADESKTOP_TITLEBAR_BORDER}px solid var(--uui-color-border)
        );
        cursor: move;
        user-select: none;
      }
      .frame:not(.active) .title,
      .frame:not(.active) .controls {
        opacity: var(--umbradesktop-titlebar-inactive-opacity, 0.5);
      }
      /* The caption gives way before a control does, and these three rules are the whole of it.

         A flex item's own 'min-width' is 'auto', meaning "at least my min-content", and a caption
         is one unbreakable word as far as min-content is concerned. So this item held the row open
         at its full natural width and the controls were pushed straight off the frame's right
         edge: at the minimum window a nine-by-nine game declares, 'Minesweeper' plus four 46px
         buttons wants 311px of a 274px titlebar, and 37px of the close button was outside the
         frame. The chrome publishes 'leading + trailing + grab' as the narrowest window it can be
         drawn in and the resize floor is derived from it, but that was arithmetic the layout never
         honoured, which is why the number was right and the button was still gone.

         A caption that truncates still reads. A close button that is not there does not. */
      .title {
        display: inline-flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        min-width: 0;
        font-weight: 700;
        font-size: calc(var(--uui-type-small-size) + 2px);
        /* Pinned (rather than left to inherit) so the title can be themed independently of the
           rest of the titlebar text; the fallback is just the color it already inherited. */
        color: var(--umbradesktop-titlebar-text, var(--uui-color-text));
      }
      .title umb-icon {
        font-size: 18px;
        /* The icon is the app's identity and is the same 18px at every width: the text beside it
           is what yields. */
        flex: 0 0 auto;
      }
      .title-text {
        /* Lato sits high in its line box; nudge the title down ~1px so it optically
           centers against the icon, matching the taskbar. */
        transform: translateY(1px);
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .controls {
        display: inline-flex;
        align-self: stretch;
        /* Never shrinks. 'trailingControlsWidth' is published to the drag clamp and to
           'chromeMinWindowSize' as a fact about this chrome, so the buttons keep their width at
           every window size and the caption above absorbs the difference. */
        flex: 0 0 auto;
        /* Sit above the resize handles so the top/corner handles never steal clicks
           from the minimize/maximize/close buttons. */
        position: relative;
        z-index: 5;
      }
      .ctrl {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--umbradesktop-control-width, ${UMBRADESKTOP_CONTROL_WIDTH}px);
        height: 100%;
        padding: 0;
        border: none;
        border-radius: 0;
        background: transparent;
        color: var(--umbradesktop-control-color, var(--uui-color-text));
        cursor: pointer;
      }
      .ctrl .glyph {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 1.2;
        fill: none;
        stroke-linecap: square;
      }
      /* The ring is drawn in a 16-unit box rather than 12, so it needs its own size and the
         round caps a curve wants — the straight glyphs keep their square caps. */
      .ctrl .glyph.ring {
        width: 16px;
        height: 16px;
        stroke-width: 1.6;
        stroke-linecap: round;
      }
      .ctrl .glyph .solid {
        fill: currentColor;
        stroke: none;
      }
      /* Spins clockwise, with the arrow, for as long as the frame is loading — so it doubles as
         the window's tab spinner on open, not just on an explicit reload. */
      .ctrl.busy .glyph.ring {
        /* Explicit, because an inline SVG's transform-origin is not reliably its own centre. */
        transform-origin: 50% 50%;
        animation: umbradesktop-reload-spin 0.8s linear infinite;
      }
      @keyframes umbradesktop-reload-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ctrl.busy .glyph.ring {
          animation: none;
        }
      }
      .ctrl:hover {
        background: var(--umbradesktop-control-hover-background, rgba(0, 0, 0, 0.07));
      }
      /* Windows/KDE close affordance: red fill + white mark on hover. */
      .ctrl.close:hover {
        background: var(--umbradesktop-control-close-hover-background, var(--uui-color-danger, #d42054));
        color: var(--umbradesktop-control-close-hover-color, #fff);
      }
      /* 'min-height: 0' and 'overflow: hidden' are what keep a window's own edge safe from what is
         inside it, and both are load-bearing rather than tidiness.

         A flex item's 'min-height' is 'auto', which means "at least my content", so a body taller
         than the window made '.bodywrap' grow past the frame's content box instead of being
         contained by it. Under a theme whose frame ring is padding inside its own rect — Win98's
         3px bevel — the overflow paints straight over that ring, and the reported symptom was a
         window with no bottom bevel until it was dragged a little larger. The sizing arithmetic in
         'window-chrome.ts' is what stops a *correctly declared* app overflowing at all; this is
         what stops any app that overflows anyway from taking a chrome affordance with it, which is
         the repo's own rule read from the app's side: an affordance that disappears is a bug.

         'min-width' likewise, for the horizontal axis and for '.body' as a flex item of this row. */
      .bodywrap {
        position: relative;
        flex: 1;
        display: flex;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
      }
      .body {
        flex: 1;
        border: none;
        width: 100%;
        min-width: 0;
        min-height: 0;
        /* Clips at the app's own box rather than at the wrapper's padding edge, which is where
           'overflow: hidden' above stops: a theme with a sunken well (Win98 again) pads '.bodywrap'
           by the well's depth, and an overflowing app would otherwise paint over that bevel while
           leaving the frame's outer one intact. An iframe body is unaffected — it scrolls its own
           document. */
        overflow: hidden;
        background: var(--umbradesktop-window-body-background, var(--uui-color-background));
      }
      .loading {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--umbradesktop-window-background, var(--uui-color-surface));
      }
      [hidden] {
        display: none !important;
      }
      .focus-catcher {
        position: absolute;
        inset: 0;
        z-index: 1;
      }
      .rh {
        position: absolute;
        z-index: 3;
        touch-action: none;
      }
      .rh-n {
        top: 0;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
      }
      .rh-s {
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
      }
      .rh-e {
        top: 0;
        bottom: 0;
        right: 0;
        width: 6px;
        cursor: ew-resize;
      }
      .rh-w {
        top: 0;
        bottom: 0;
        left: 0;
        width: 6px;
        cursor: ew-resize;
      }
      .rh-ne {
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nesw-resize;
      }
      .rh-nw {
        top: 0;
        left: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nwse-resize;
      }
      .rh-se {
        bottom: 0;
        right: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nwse-resize;
      }
      .rh-sw {
        bottom: 0;
        left: 0;
        width: 12px;
        height: 12px;
        z-index: 4;
        cursor: nesw-resize;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-window': UmbraDesktopWindowElement;
  }
}
