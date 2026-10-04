import type { Rect, UmbraDesktopWindow } from '../types';
import {
  UMBRADESKTOP_SECTION_ALIAS,
  UMBRADESKTOP_Z_SNAP_GHOST,
  UMBRADESKTOP_Z_TASKBAR,
} from '../constants';
import { findChromeRoot } from '../chrome-injector';
import { clearBootAttempt } from '../boot/boot-storage';
import { lowerBootSplash } from '../boot/splash';
import { waitForWallpaper } from '../boot/wallpaper-ready';
import { bootTrace } from '../boot/trace';
import { applySectionTabHide } from '../../headerapps/section-tab-hide.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UmbraDesktopAppCatalogueContext } from '../app-catalogue.context.js';
import { UmbraDesktopServerEventController } from '../conflict/server-event.controller.js';
import { UmbraDesktopSettingsContext } from '../settings/settings.context.js';
import { UmbraDesktopWindowLayoutController } from '../windows/layout.controller.js';
import { UmbraDesktopHelpContext } from '../help/help.context.js';
import { takeHelpDeepLink } from '../help/help-deep-link.js';
import type { UmbraDesktopWallpaperView } from '../settings/wallpaper-view.js';
import { UmbraDesktopThemeContext } from '../theme/theme.context.js';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { UmbraDesktopLabelContext } from '../desktop-label/desktop-label.context.js';
import { UmbraDesktopNotificationCentreContext } from '../notifications/notification-centre.context.js';
import { watchNotifications } from '../notifications/notification-watcher.js';
import { UMBRADESKTOP_DESKTOP_SOURCE_ID } from '../notifications/types.js';
import type { DesktopLabelResponseModel } from '../../api/types.gen';
import './window.element.js';
import './taskbar.element.js';
import './desktop-toasts.element.js';
import '../desktop-label/desktop-label.element.js';
import '../migrations/migration-screen.element.js';
import '../welcome/welcome-screen.element.js';
import type { UmbraDesktopWelcomeChoices } from '../welcome/choices';
import type { UmbraDesktopMigrationScreenState } from '../migrations/types.js';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

const OUTER_CHROME_STYLE_ID = 'umbradesktop-outer-chrome';

/** Root element of the Desktop section. Owns the window manager and layout. */
@customElement('umbradesktop-desktop')
export class UmbraDesktopDesktopElement extends UmbLitElement {
  /** Owns the open windows and the operations on them, for the whole desktop subtree. */
  #manager = new UmbraDesktopWindowManagerContext(this);

  /** Owns this user's persisted desktop settings — wallpaper, pinned apps, chosen theme. */
  #settings = new UmbraDesktopSettingsContext(this);

  /** Opens Help at a page. Set in the constructor, since it needs the catalogue created there. */
  #help!: UmbraDesktopHelpContext;

  /**
   * Owns the chrome theme in force.
   *
   * Declared after `#settings` deliberately: the theme context consumes the settings context to
   * read the stored theme id, and class field initialisers run in declaration order, so `#settings`
   * has to already exist when this one is constructed.
   */
  #theme = new UmbraDesktopThemeContext(this);

  /**
   * Owns the label drawn in a corner of the desktop: the site's name, and the switches behind it.
   *
   * Provided here, beside the settings, so the Site screen in the settings modal reaches it the way
   * the Appearance screen reaches the settings. It reads the label as soon as it exists.
   */
  #label = new UmbraDesktopLabelContext(this);

  /**
   * Where every notification on the desktop ends up, once: the toasts and the scrollback behind the
   * clock. Windows feed it from their frames; this element feeds it from its own document.
   */
  #notifications = new UmbraDesktopNotificationCentreContext(this, this.#manager);

  /** Stops watching this desktop's own document and takes it off the centre's sources. */
  #stopOwnNotifications?: () => void;

  @state()
  private _windows: UmbraDesktopWindow[] = [];

  /** The desktop label as last read, or null while there is none to draw. */
  @state()
  private _label: DesktopLabelResponseModel | null = null;

  @state()
  private _wallpaper?: UmbraDesktopWallpaperView;

  /**
   * Where the window currently being dragged would land if it were released now, or undefined when
   * no snap is on offer. Drawn as a ghost over the surface.
   */
  @state()
  private _snapPreview?: Rect;

  /** The active theme's palette, rendered as `style`-attribute declarations for the `.desktop` root. */
  @state()
  private _paletteCss = '';

  /**
   * Whether this user's settings have been read.
   *
   * False means "we do not know yet", not "the defaults". The settings context seeds itself with
   * the defaults so nothing downstream is ever undefined, and painting that seed is what made a
   * fresh load show a desktop in the wrong theme wearing the wrong wallpaper before swapping to
   * the user's own — visible whether you were booted here or typed the URL.
   */
  @state()
  private _settingsLoaded = false;

  /**
   * Whether this user's windows are being reopened, which holds the desktop like loading settings
   * does. See {@link reportWindowsRestoring}.
   */
  @state()
  private _windowsRestoring = false;

  /**
   * Whether a one-time migration is showing a screen over the desktop, and which one.
   *
   * Idle for everybody except somebody whose settings are still in this browser rather than on their
   * account, which is once per person, ever.
   */
  @state()
  private _migration: UmbraDesktopMigrationScreenState = { phase: 'idle' };

  /**
   * Whether the welcome wizard is up, for somebody new to the desktop. Never at the same time as a
   * migration: that needs settings in this browser, and a newcomer has none.
   */
  @state()
  private _welcome = false;

  /**
   * The surface currently under the resize observer, so it is attached exactly once per surface.
   *
   * Needed because the surface does not exist for the whole life of this element any more: it
   * appears when the hold lifts.
   */
  #observedSurface?: Element;

  constructor() {
    super();
    // Instantiating is enough to provide the catalogue context to the desktop subtree. The one
    // reference kept is for the window layout below, which reopens windows by their apps.
    const catalogue = new UmbraDesktopAppCatalogueContext(this);
    // Reopens this user's windows once their settings have loaded, and keeps the layout saved. The
    // desktop holds its first paint while it does; see `reportWindowsRestoring`.
    const layout = new UmbraDesktopWindowLayoutController(this, {
      manager: this.#manager,
      settings: this.#settings,
      apps: catalogue.apps,
    });
    this.observe(layout.restoring, (restoring) => this.reportWindowsRestoring(restoring === true));
    // Opens Help at a page, for the desktop's own code and for the event and deep link below.
    this.#help = new UmbraDesktopHelpContext(this, { manager: this.#manager, apps: catalogue.apps });
    // Adopts the active theme's desktop-surface stylesheet into this element's shadow root.
    new UmbraDesktopThemeStyles(this, 'desktop');
    // Consumed once here, not per window: see the class doc on why.
    new UmbraDesktopServerEventController(this, this.#manager);
    this.observe(this.#manager.windows, (list) => (this._windows = list));
    this.observe(this.#manager.snapPreview, (rect) => (this._snapPreview = rect));
    this.observe(this.#settings.wallpaper, (wallpaper) => (this._wallpaper = wallpaper));
    this.observe(this.#theme.paletteStyle, (style) => (this._paletteCss = style ?? ''));
    this.observe(this.#theme.metrics, (metrics) => this.#manager.setMetrics(metrics));
    this.observe(this.#settings.loaded, (loaded) => this.reportSettingsLoaded(loaded === true));
    this.observe(this.#label.label, (label) => (this._label = label));
    this.observe(this.#settings.migration, (migration) => (this._migration = migration ?? { phase: 'idle' }));
    this.observe(this.#settings.welcome, (welcome) => (this._welcome = welcome === true));
  }

  /**
   * Record that this user's settings have resolved, and hand the screen over from the boot splash.
   *
   * Public because it is the one moment the desktop tells the outside world it exists: the splash
   * lifts here and the boot marker is cleared here, and those two together are what stop a desktop
   * that mounts and then breaks from booting again on the next load. Public also lets a test drive
   * the hold without a current-user context, which is the only way to reach the painted state in a
   * test at all.
   *
   * The hand-off waits for the paint that this report causes *and* for the wallpaper image behind
   * it, so the splash lifts onto the finished desktop rather than onto a flat colour the wallpaper
   * then fades into — which reads as the boot finishing twice.
   * @param loaded Whether the stored settings and their wallpaper have resolved.
   */
  public reportSettingsLoaded(loaded: boolean): void {
    if (this._settingsLoaded === loaded) return;
    this._settingsLoaded = loaded;
    if (!loaded) return;
    this.#handOverWhenReady();
  }

  /**
   * Record whether this user's windows are being reopened, and hold the desktop while they are.
   *
   * The hold is the same one settings get, for the same kind of reason: nobody should start using a
   * desktop that is about to change under them, and windows appearing one after another under the
   * pointer is exactly that. Only the placing is waited for, never the windows' frames, which each
   * have their own loader. Public for the same reason as {@link reportSettingsLoaded}: it lets a
   * test drive the hold without a signed-in user.
   * @param restoring Whether a restore is running (`windows/layout.controller.ts`).
   */
  public reportWindowsRestoring(restoring: boolean): void {
    if (this._windowsRestoring === restoring) return;
    this._windowsRestoring = restoring;
    if (!restoring) this.#handOverWhenReady();
  }

  /** Whether the hand-off from the splash has started, so it runs once however often it is asked. */
  #handingOver = false;

  /** Start the hand-off once settings have loaded and no windows are still being reopened. */
  #handOverWhenReady(): void {
    if (this.#handingOver || !this._settingsLoaded || this._windowsRestoring) return;
    this.#handingOver = true;
    void this.#handOverFromSplash();
  }

  /**
   * Hand the screen over from the boot splash, once there is a finished desktop to hand it to.
   *
   * Clearing the boot marker is part of the hand-off rather than a step before it: the marker means
   * "a boot was attempted and never finished", so it may only be cleared at the point where the
   * desktop is genuinely on screen.
   *
   * A restore can be reported while the wallpaper is still being waited for, since both start from
   * the settings report. So the hold is checked again at the end, and a hand-off that finds windows
   * still being reopened stands down for {@link reportWindowsRestoring} to start again.
   *
   * So does a hand-off whose desktop has left the page while it waited, for good: the splash and
   * the marker are the page's, not this element's, so a removed desktop that carried on would lower
   * the next boot's splash and mark as finished a boot that never painted. Nothing puts a removed
   * desktop back, because the backoffice builds a new section element on every visit
   * (`createExtensionElement` in its section routes), which is also what Exit then coming back
   * does. A test is where it showed: the boot test after one that left a hand-off running failed
   * one run in three, because the old desktop lowered the new test's splash.
   */
  async #handOverFromSplash(): Promise<void> {
    bootTrace('desktop mounted, settings resolved; waiting for the wallpaper');
    await this.updateComplete;
    await waitForWallpaper(this._wallpaper?.background.url ?? null);
    if (!this.isConnected) {
      bootTrace('desktop removed before the hand-off finished; the splash is not ours to lower');
      return;
    }
    if (this._windowsRestoring) {
      this.#handingOver = false;
      bootTrace('windows are still being reopened; the splash stays up');
      return;
    }
    clearBootAttempt();
    lowerBootSplash();
    bootTrace('splash lowered; the desktop has the screen');
    // A `?help=` deep link opens now, above the windows that were just reopened, so it is the window
    // in front (Help design §6.2). Taken once per page load: Exit builds a new desktop, and that one
    // must not open it again.
    const target = takeHelpDeepLink();
    if (target) this.#help.openWhenReady(target);
  }

  /**
   * The surface under the resize observer, for the boot test that checks it gets attached when the
   * hold lifts rather than at connect time.
   * @returns The observed surface, or undefined before one exists.
   */
  public get observedSurfaceForTest(): Element | undefined {
    return this.#observedSurface;
  }

  /**
   * The window manager this desktop owns, for the tests that need to drive it.
   *
   * The manager is provided as a context, so a consumer inside the desktop reaches it the ordinary
   * way and nothing in the package needs this. A test standing outside the subtree does not, and
   * the ghost is the one piece of chrome whose whole state comes from the manager rather than from
   * anything a test can click.
   * @returns The manager.
   */
  public get managerForTest(): UmbraDesktopWindowManagerContext {
    return this.#manager;
  }

  /**
   * The notification centre this desktop owns, for the test that checks a notification the desktop
   * raises itself is recorded as the desktop's rather than as some window's.
   * @returns The centre.
   */
  public get notificationsForTest(): UmbraDesktopNotificationCentreContext {
    return this.#notifications;
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
    this.#watchOwnNotifications();
  }

  /**
   * Take the notifications of the backoffice this desktop is running in over, so a notification the
   * desktop raises itself is drawn once, as the desktop's, like one raised in any window.
   *
   * From connect to disconnect only. Leaving the desktop lifts the hiding rule with the watcher, so
   * the classic backoffice draws its own toasts again the moment it is back.
   */
  #watchOwnNotifications() {
    this.#stopOwnNotifications?.();
    const centre = this.#notifications;
    const origin = { sourceId: UMBRADESKTOP_DESKTOP_SOURCE_ID, source: '#umbraDesktop_notificationsSourceDesktop' };
    const watch = watchNotifications(this.ownerDocument, {
      onRaised: (notification) => centre.raise(notification, origin),
      onClosed: (key) => centre.closed(UMBRADESKTOP_DESKTOP_SOURCE_ID, key),
    });
    const unregister = centre.registerSource(UMBRADESKTOP_DESKTOP_SOURCE_ID, watch);
    this.#stopOwnNotifications = () => {
      unregister();
      watch.stop();
    };
  }

  /**
   * Attach the resize observer to the surface once there is one.
   *
   * Here rather than in `connectedCallback`, because the surface is no longer rendered for the
   * whole life of this element: while settings are loading the desktop holds, so an observer
   * attached at connect time would watch nothing for the entire boot and the first resize after it
   * would leave a window stranded off-screen.
   * @param changed The changed properties, passed through to Lit.
   */
  override updated(changed: Map<string | number | symbol, unknown>) {
    super.updated(changed);
    const surface = this.renderRoot.querySelector('.surface');
    if (!surface || surface === this.#observedSurface) return;
    if (this.#observedSurface) this.#surfaceObserver.unobserve(this.#observedSurface);
    this.#surfaceObserver.observe(surface);
    this.#observedSurface = surface;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#surfaceObserver.disconnect();
    // Forgotten along with the observation, so a re-connected desktop observes its new surface
    // rather than comparing against one that is no longer watched.
    this.#observedSurface = undefined;
    this.#setOuterChrome(false);
    this.#stopOwnNotifications?.();
    this.#stopOwnNotifications = undefined;
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

  /**
   * The ghost showing where a dragged window would land, or nothing when no snap is on offer.
   *
   * Inline geometry rather than classes, because the rectangle is not one of three shapes: the
   * halves move with the desktop's size, and a window whose own minimum beats half the desktop
   * takes a wider one than its neighbour.
   * @returns The ghost, or nothing.
   */
  #renderSnapGhost() {
    const rect = this._snapPreview;
    if (!rect) return '';
    return html`<div
      class="snap-ghost"
      aria-hidden="true"
      style="left:${rect.x}px; top:${rect.y}px; width:${rect.w}px; height:${rect.h}px;"></div>`;
  }

  override render() {
    if (!this._settingsLoaded || this._windowsRestoring) {
      // A neutral hold: no palette, no wallpaper, no chrome. During a boot the splash is over this,
      // and the point is that when the splash lifts the only thing underneath is this user's own
      // desktop — never a default one that then changes, and never one with windows still arriving.
      return html`<div class="booting" aria-busy="true"></div>`;
    }

    const hasImage = !!this._wallpaper?.background.url;
    // Palette first, wallpaper second: both are declaration strings ending in ';', so the
    // concatenation is valid CSS, and the wallpaper's own background-color/background-image
    // (set only when an image is chosen) must be able to win over the theme's declarations.
    return html`
      <div class="desktop ${hasImage ? 'has-image' : ''}" style=${this._paletteCss + this.#wallpaperStyle()}>
        <div class="wallpaper-brand" aria-hidden="true">
          <umb-icon name="icon-umbraco"></umb-icon>
        </div>
        <!-- On the wallpaper, like the logo: after it, and before the surface so every window
             paints over it. It has no z-index, so this order is the whole of its stacking. -->
        <umbradesktop-desktop-label .label=${this._label}></umbradesktop-desktop-label>
        <div class="surface" ?inert=${this.#systemScreenShowing}>
          ${repeat(
            this._windows,
            (w) => w.id,
            (w) => html`<umbradesktop-window .window=${w}></umbradesktop-window>`,
          )}
          ${this.#renderSnapGhost()}
        </div>
        <umbradesktop-toasts ?inert=${this.#systemScreenShowing}></umbradesktop-toasts>
        <umbradesktop-taskbar ?inert=${this.#systemScreenShowing}></umbradesktop-taskbar>
        ${this.#renderMigration()} ${this.#renderWelcome()}
      </div>
    `;
  }

  /**
   * The one-time migration screen, when one is showing.
   *
   * Inside the desktop rather than over the whole viewport, and rendered in the same pass the
   * desktop itself is: the settings context sets the phase *before* it reports the settings loaded,
   * so the screen and the desktop arrive together. A beat later would be a flash of a desktop that
   * is about to change under the person looking at it.
   *
   * This is also why the screen lives here and not on the boot splash. The desktop is reached two
   * ways, booted into and clicked into from the section menu, and only one of those has a splash.
   * Putting it here is what makes the way somebody arrived stop mattering.
   * @returns The screen, or nothing when no migration is showing.
   */
  /**
   * Whether the migration screen is up, one of the two screens that make the desktop behind them
   * inert (see `#systemScreenShowing`).
   *
   * The screen covers the desktop visually via `UMBRADESKTOP_Z_SYSTEM_SCREEN`, but covering is not
   * blocking: without `inert` the windows and the taskbar stay in the tab order and reachable by
   * assistive technology, and the taskbar's cog opens the settings dialog — during a migration that
   * is rewriting those very settings. An element cannot make its own siblings inert, so it is
   * applied here.
   * @returns True while a migration screen is showing.
   */
  get #migrationShowing(): boolean {
    return this._migration.phase !== 'idle';
  }

  /**
   * Whether a full-screen system screen is up, the migration screen or the welcome wizard, and
   * therefore whether the desktop behind it is inert. The reasons are the migration screen's: covering
   * is not blocking, and the taskbar's cog would open settings the wizard is about to write.
   * @returns True while either screen is showing.
   */
  get #systemScreenShowing(): boolean {
    return this.#migrationShowing || this._welcome;
  }

  /**
   * The welcome wizard, when it is up.
   *
   * Here for the reasons the migration screen is: in the same pass as the desktop, because the
   * settings context decides it before reporting the settings loaded, and inside the desktop, so it
   * appears however somebody arrived, booted in under the splash or clicked in from the header.
   * @returns The wizard, or nothing.
   */
  #renderWelcome() {
    if (!this._welcome) return nothing;

    return html`<umbradesktop-welcome-screen
      @umbradesktop-welcome-finish=${(event: CustomEvent<UmbraDesktopWelcomeChoices>) =>
        this.#settings.finishWelcome(event.detail)}
      @umbradesktop-welcome-dismiss=${() => this.#settings.dismissWelcome()}></umbradesktop-welcome-screen>`;
  }

  #renderMigration() {
    if (!this.#migrationShowing) return nothing;

    return html`<umbradesktop-migration-screen
      .phase=${this._migration.phase}
      .descriptionKey=${this._migration.descriptionKey}
      @umbradesktop-migration-dismiss=${() => this.#settings.dismissMigration()}></umbradesktop-migration-screen>`;
  }

  static override styles = [
    css`
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
      /* The hold, while settings load. Deliberately the theme token's own fallback colour rather
         than the palette: the palette is one of the things being waited for, so reading it here
         would paint the default theme's chrome — the very flash this is here to prevent. */
      .booting {
        height: 100%;
        width: 100%;
        background-color: var(--umbradesktop-desktop-background-color, #0e1329);
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
           too, and it inherits down through every shadow boundary from this one place.

           It chains through --umbradesktop-taskbar-height rather than naming a literal so
           that a theme which only resizes a full-width bar sets one value and the reserve
           follows; a theme whose bar floats free of the edge sets both, because then the
           reserve is the bar's height plus the gap beneath it. Don't flatten this to a
           number — the chain is the affordance. */
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
      /* The ghost, over every window and under the taskbar. Both numbers come from ../constants,
         where the whole stacking order is written as one derived list — a snap preview that covered
         the taskbar would hide the very thing the window is being snapped alongside, and that
         relationship is the thing worth recording rather than two literals that happen to differ.

         Sized and placed inline; everything here is only how it is painted, which is why all three
         are tokens: a theme that draws its windows as Windows 98 bevels has no business showing a
         translucent rounded rectangle. */
      .snap-ghost {
        position: absolute;
        z-index: ${UMBRADESKTOP_Z_SNAP_GHOST};
        box-sizing: border-box;
        pointer-events: none;
        background: var(--umbradesktop-snap-ghost-background, rgba(255, 255, 255, 0.2));
        border: var(--umbradesktop-snap-ghost-border, 2px solid rgba(255, 255, 255, 0.6));
        border-radius: var(--umbradesktop-snap-ghost-radius, 6px);
      }
      umbradesktop-taskbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: ${UMBRADESKTOP_Z_TASKBAR};
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
