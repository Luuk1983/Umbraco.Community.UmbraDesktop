import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_UNSAVED_MARKER_SIZE } from '../constants.js';
import { taskActivation } from '../window-model';
import { exitDialogContent } from '../exit-message.js';
import { formatClock } from '../clock-format.js';
import { suppressBootForSession } from '../boot/boot-storage.js';
import { exitDesktopPath } from '../boot/boot-decision.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import type { UmbraDesktopAppCatalogueContext } from '../app-catalogue.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import type { UmbraDesktopLocaleSettings } from '../settings/types';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store.js';
import { taskbarRowFeatures } from '../taskbar/features/index.js';
import type { UmbraDesktopTaskbarFeatureContext } from '../taskbar/features/types';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import './launcher.element.js';
import { UMBRADESKTOP_SETTINGS_MODAL } from '../settings/modal-tokens.js';
import { noticeIconName, windowNotices, worstSeverity } from '../notices/notices.js';
import type { UmbraDesktopNoticeSeverity } from '../notices/types.js';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbConfirmModal, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { UMB_SEARCH_MODAL } from '@umbraco-cms/backoffice/search';
import { UMB_CURRENT_USER_MODAL } from '@umbraco-cms/backoffice/current-user';

/**
 * The bottom panel: Umbraco-logo start button (opens the app launcher), running-window
 * buttons, clock, exit. The launcher panel itself (search/favourites/recent/grouped
 * tiles/footer) is `<umbradesktop-launcher>`, mounted here — this element owns the start
 * button, the panel's open/close + dismissal wiring, and every modal the panel asks for.
 *
 * Modal ownership lives here rather than in the launcher deliberately: the launcher is
 * unmounted on the first pointer down outside it, and Umbraco resolves a modal's contexts
 * through the element that opened it. A modal owned by the launcher would silently lose its
 * context origin the moment you clicked inside it. The taskbar lives as long as the desktop,
 * so it is a safe origin.
 */
@customElement('umbradesktop-taskbar')
export class UmbraDesktopTaskbarElement extends UmbLitElement {
  @state()
  private _windows: UmbraDesktopWindow[] = [];

  @state()
  private _launcherOpen = false;

  @state()
  private _clock = '';

  /**
   * How this user wants the clock formatted.
   *
   * Seeded from the payload's own default rather than a second copy of it, so the two cannot drift:
   * the first tick happens before the settings context has resolved, and a taskbar disagreeing with
   * the stored default about what "unset" means would show one format and then swap.
   */
  @state()
  private _locale: UmbraDesktopLocaleSettings = { ...UMBRADESKTOP_DEFAULT_SETTINGS.locale };

  /** Every app this user may launch, for the feature row. Already gated by the catalogue. */
  @state()
  private _apps: ReadonlyArray<UmbraDesktopApp> = [];

  /** The user's pinned aliases, in pin order — the launcher's list, observed rather than copied. */
  @state()
  private _pinned: ReadonlyArray<string> = [];

  /** Which fixed features this user has switched on or off; anything absent takes its own default. */
  @state()
  private _features: Readonly<Record<string, boolean>> = {};

  #manager?: UmbraDesktopWindowManagerContext;

  /**
   * The app catalogue, kept for its 'isRefRegistered' probe rather than for its apps, which arrive
   * through the observation above. A feature that has to explain its own absence needs to tell a
   * missing package from a missing permission, and that is the only question 'apps' cannot answer.
   */
  #catalogue?: UmbraDesktopAppCatalogueContext;

  #timer?: number;

  /** The backoffice culture the clock was last formatted with, so a change to it can be spotted. */
  #culture?: string;

  constructor() {
    super();
    // Adopts the active theme's taskbar-surface stylesheet into this element's shadow root.
    new UmbraDesktopThemeStyles(this, 'taskbar');
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
      if (ctx) this.observe(ctx.windows, (list) => (this._windows = list));
    });
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (ctx) => {
      this.#catalogue = ctx ?? undefined;
      if (ctx) this.observe(ctx.apps, (apps) => (this._apps = apps));
    });
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (ctx) => {
      if (!ctx) return;
      // Both observed rather than sampled, which is what makes a pin made in the launcher appear on
      // the row while the launcher is still open, and a feature switched off in the settings panel
      // close its space while the panel is still up.
      this.observe(ctx.pinned, (pinned) => (this._pinned = pinned));
      this.observe(ctx.taskbarFeatures, (features) => (this._features = features ?? {}));
      // Re-ticked rather than left to the interval. The clock ticks every 15 seconds, so without
      // this the old format sits on screen for up to fifteen of them and the setting reads broken.
      this.observe(ctx.locale, (locale) => {
        this._locale = locale ?? { ...UMBRADESKTOP_DEFAULT_SETTINGS.locale };
        this.#tick();
      });
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#tick();
    this.#timer = window.setInterval(() => this.#tick(), 15000);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.#timer) window.clearInterval(this.#timer);
    this.#setLauncherOpen(false);
  }

  /**
   * The clock, formatted the way this user asked for it.
   *
   * Called from four places rather than one: on connect, on the interval, when the locale preference
   * changes, and when the backoffice culture changes under us. The last two are why this is not
   * simply the interval's callback — a format that only caught up on the next tick reads as a
   * setting that did not take.
   */
  #tick() {
    this._clock = formatClock(new Date(), this._locale, { backoffice: this.localize.lang() });
  }

  /**
   * Re-tick when the backoffice culture changes under us.
   *
   * `UmbLocalizationController` re-renders its host on a language change rather than publishing it,
   * so there is no observable to watch here: the render *is* the signal. Guarded on the culture
   * having actually changed, or every unrelated render would reformat the clock.
   * @param changed The changed properties, passed straight to Lit.
   */
  override updated(changed: PropertyValues) {
    super.updated(changed);
    const culture = this.localize.lang();
    if (culture === this.#culture) return;
    this.#culture = culture;
    this.#tick();
  }

  #toggleLauncher() {
    this.#setLauncherOpen(!this._launcherOpen);
  }

  /**
   * Handle a click on a running-window taskbar button: minimize it if it is already the active
   * window, otherwise bring it to the front (restoring it if minimized). See `taskActivation`.
   * @param w The window whose taskbar button was clicked.
   */
  #onTaskClick(w: UmbraDesktopWindow) {
    if (!this.#manager) return;
    if (taskActivation(w) === 'minimize') this.#manager.setState(w.id, 'minimized');
    else this.#manager.focus(w.id);
  }

  /**
   * Open or close the launcher, wiring up the dismiss listeners to match. While open we listen
   * for a pointer down outside the launcher/start button, a window blur (a click landing inside
   * an iframe window steals focus without bubbling a pointer event to us), and the Escape key —
   * any of which closes the launcher. Listeners are removed as soon as it closes.
   * @param open Whether the launcher should be open.
   */
  #setLauncherOpen(open: boolean) {
    if (open === this._launcherOpen) return;
    this._launcherOpen = open;
    if (open) {
      // Capture phase so we see the pointer down before anything inside can stop it.
      document.addEventListener('pointerdown', this.#onOutsidePointerDown, true);
      document.addEventListener('keydown', this.#onLauncherKeydown);
      window.addEventListener('blur', this.#onWindowBlur);
    } else {
      document.removeEventListener('pointerdown', this.#onOutsidePointerDown, true);
      document.removeEventListener('keydown', this.#onLauncherKeydown);
      window.removeEventListener('blur', this.#onWindowBlur);
    }
  }

  /** Close the launcher when a pointer goes down outside both the launcher panel and start button. */
  #onOutsidePointerDown = (e: PointerEvent) => {
    const path = e.composedPath();
    const launcher = this.shadowRoot?.querySelector('.launcher');
    const start = this.shadowRoot?.querySelector('.start');
    if ((launcher && path.includes(launcher)) || (start && path.includes(start))) return;
    this.#setLauncherOpen(false);
  };

  /** Close the launcher on Escape. */
  #onLauncherKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.#setLauncherOpen(false);
  };

  /** Close the launcher when focus leaves the window (e.g. a click landing inside an iframe). */
  #onWindowBlur = () => {
    this.#setLauncherOpen(false);
  };

  /**
   * Close the launcher, then open a modal owned by this element.
   *
   * The launcher is dismissed first for both reasons: picking something from a start menu should
   * dismiss it, and it removes the outside-pointer listener that would otherwise unmount the
   * launcher mid-interaction.
   * @param modal The modal token to open.
   */
  async #openFromLauncher(modal: Parameters<typeof umbOpenModal>[1]) {
    this.#setLauncherOpen(false);
    await umbOpenModal(this, modal).catch(() => undefined);
  }

  /** Open the native backoffice search modal. */
  #onSearch = () => this.#openFromLauncher(UMB_SEARCH_MODAL);

  /** Open the native current-user modal (profile, MFA, etc.). */
  #onProfile = () => this.#openFromLauncher(UMB_CURRENT_USER_MODAL);

  /** Open the desktop settings panel, at its list of categories. */
  #onSettings = () => this.#openFromLauncher(UMBRADESKTOP_SETTINGS_MODAL);

  /**
   * Confirm, then leave the Desktop section for the classic backoffice.
   *
   * Exit unmounts the whole desktop with every open window in it, so it is the one route that can
   * discard several windows' work at once. It asks **once**, naming how many of them are unsaved,
   * rather than stacking a discard dialog on top of this one — see `exit-message.ts`. Cancelling
   * returns to the desktop with every window still open and still marked, because nothing here
   * touches the windows.
   *
   * Leaving also suppresses booting into the desktop until this tab is closed. For a user who has
   * that setting on, without it the next load would put them straight back and Exit would read as
   * broken. Tab-scoped rather than persisted, because exiting means "not now", not "turn the
   * setting off" — that is what the settings panel is for.
   */
  #onExit = async () => {
    try {
      await umbConfirmModal(this, {
        headline: this.localize.term('umbraDesktop_exitHeadline'),
        content: exitDialogContent(
          this.#manager?.unsavedWindows().length ?? 0,
          this.#manager?.conflictedWindows().length ?? 0,
          (key, ...args) => this.localize.term(key, ...args),
        ),
        confirmLabel: this.localize.term('umbraDesktop_exitConfirm'),
        cancelLabel: this.localize.term('umbraDesktop_exitStay'),
        color: 'danger',
      });
    } catch {
      return; // cancelled
    }
    suppressBootForSession();
    window.history.pushState(null, '', exitDesktopPath(window.location.pathname));
  };

  #renderLauncher() {
    if (!this._launcherOpen) return '';
    return html`
      <umbradesktop-launcher
        class="launcher"
        @launched=${() => this.#setLauncherOpen(false)}
        @search=${this.#onSearch}
        @profile=${this.#onProfile}
        @settings=${this.#onSettings}
        @exit=${this.#onExit}></umbradesktop-launcher>
    `;
  }

  /**
   * The marker on a task button for the worst thing its window has to say, or nothing at all.
   *
   * One slot and one marker, exactly as the titlebar has: a window with a conflict is dirty by
   * definition, so both notices exist and only the worst one draws. What changes with severity is
   * the *shape* — `info` is a dot, `warning` and `error` are the Umbraco glyph `notices.ts` maps
   * them to. That mapping is asked for here rather than written inline so the three surfaces cannot
   * disagree about what a warning looks like.
   *
   * A dot for `info` rather than an `info` glyph, which was the alternative. Every window somebody
   * is editing is dirty, so a glyph on all of them would spend the scarcity that makes a glyph here
   * mean "look at this" — and a dot is what every other application uses for unsaved work anyway
   * (macOS in the close button, VS Code on the tab). The two shapes share the `.notice-badge` class
   * so a theme's positioning applies to both without being written twice; only the dot carries
   * `.notice-badge-dot`.
   *
   * Neither is given an accessible name: the button's own `title` and `aria-label` already carry
   * the notice's heading in words, and naming the marker too would read the state twice.
   * @param severity The worst severity the window is carrying, if any.
   * @returns The marker's template, or nothing.
   */
  #renderBadge(severity: UmbraDesktopNoticeSeverity | undefined) {
    if (!severity) return nothing;
    const icon = noticeIconName(severity);
    if (!icon) {
      return html`<span class="notice-badge notice-badge-dot" data-severity=${severity} aria-hidden="true"></span>`;
    }
    return html`<umb-icon
      class="notice-badge"
      data-severity=${severity}
      name=${icon}
      aria-hidden="true"></umb-icon>`;
  }

  /**
   * What the features are handed in order to answer for themselves and to draw.
   *
   * Assembled here rather than reached for by each feature, so a feature stays a folder of
   * functions rather than an element with a lifecycle of its own. 'open' is passed straight through
   * to the window manager and nothing wraps it: the second-click rule lives there, and a button on
   * this row must hold no opinion about it.
   * @returns The context for this render.
   */
  get #featureContext(): UmbraDesktopTaskbarFeatureContext {
    return {
      apps: this._apps,
      pinned: this._pinned,
      isRefRegistered: (ref) => this.#catalogue?.isRefRegistered(ref) ?? false,
      open: (app) => this.#manager?.open(app),
      localize: (value) => this.localize.string(value),
    };
  }

  /**
   * The row of fixed features, immediately right of the launcher button and before the open-window
   * buttons.
   *
   * **This is not the system tray.** Windows separates the two and so does this: the launcher side
   * launches things, while the notification area by the clock reports on things. Keeping them apart
   * is what lets the row stay silent about windows — no running indicator, no modifier click, no
   * context menu — because it never stands in for one.
   *
   * Rendered as nothing at all when it is empty, rather than as an empty box: the row has a gap and
   * a margin, so a present-but-empty element would leave a hole beside the launcher button on a
   * desktop where every feature is off.
   * @returns The row's template, or nothing.
   */
  #renderFeatures() {
    const context = this.#featureContext;
    const elements = taskbarRowFeatures('launcher', this._features, context).flatMap((feature) =>
      feature.render(context),
    );
    if (elements.length === 0) return nothing;
    return html`<div class="features">${elements}</div>`;
  }

  /**
   * Whether the two halves of the launching side both have something in them.
   *
   * Asked by re-rendering the features rather than caching the last answer, because both inputs are
   * observed and a stale cache would leave the divider behind after the last window closed.
   * @returns True when the fixed row and the window list are both non-empty.
   */
  get #needsDivider(): boolean {
    if (this._windows.length === 0) return false;
    const context = this.#featureContext;
    return taskbarRowFeatures('launcher', this._features, context).some(
      (feature) => feature.render(context).length > 0,
    );
  }

  /**
   * The line between the fixed row and the open-window buttons.
   *
   * The row and the window list draw the **same icon** for the same app — the duplicate the design
   * accepts, because a window button carries a title and a row button never does. With nothing
   * between them, a pinned Content button and an open Content window are two identical glyphs side
   * by side with nothing saying they mean different things. That is precisely the seam Windows 11
   * declines to draw and then has to explain with running indicators; drawing it is what lets this
   * row stay silent about windows.
   *
   * Only when there is something on **both** sides. A divider with one list beside it is a line
   * hanging off the end of something, which is why it goes as soon as the last window closes or the
   * last feature is switched off.
   *
   * 'aria-hidden', and nothing else: the two lists are already told apart by anyone not looking at
   * them, because every button in either one is named. A divider that announced itself would be one
   * more thing to tab past for nothing.
   * @returns The divider's template, or nothing.
   */
  #renderDivider() {
    return this.#needsDivider ? html`<div class="divider" aria-hidden="true"></div>` : nothing;
  }

  override render() {
    return html`
      ${this.#renderLauncher()}
      <div class="bar">
        <div class="cluster">
          <button
            class="start ${this._launcherOpen ? 'active' : ''}"
            title="Open apps"
            aria-label="Open apps"
            @click=${this.#toggleLauncher}>
            <umb-icon name="icon-umbraco"></umb-icon>
          </button>
          ${this.#renderFeatures()} ${this.#renderDivider()}
          <div class="running">
            ${repeat(
              this._windows,
              (w) => w.id,
              (w) => {
                const notices = windowNotices(w);
                // Every severity reaches the taskbar, and the *shape* says which — see `#renderBadge`.
                // Design D4 kept `info` off it originally; the reasoning that put a conflict here in
                // the first place applies to unsaved work too, because a window you minimized an
                // hour ago is exactly the one whose state you cannot see.
                const worst = worstSeverity(notices);
                const name = this.localize.string(w.app.name);
                // The words, not just the shape: this is the accessible name and the tooltip, so the
                // state is readable to a screen reader and on a monochrome display. `notices[0]` is
                // the worst notice, which is the one the badge is drawing.
                const label = worst ? `${name} — ${this.localize.term(notices[0].title)}` : name;
                return html`
                  <button
                    class="task window ${w.active ? 'active' : ''}"
                    title=${label}
                    aria-label=${label}
                    @click=${() => this.#onTaskClick(w)}>
                    <umb-icon class="task-icon" name=${w.app.icon}></umb-icon>
                    <span class="task-label">${name}</span>
                    ${this.#renderBadge(worst)}
                  </button>
                `;
              },
            )}
          </div>
        </div>
        <div class="clock">${this._clock}</div>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        position: relative;
        display: block;
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-2);
        padding: 0 var(--uui-size-space-2);
        height: var(--umbradesktop-taskbar-height, 50px);
        margin: var(--umbradesktop-taskbar-margin, 0);
        border-radius: var(--umbradesktop-taskbar-radius, 0);
        /* A distinctly darker plane than the wallpaper, frosted over it. This used to be
           --uui-color-header-background, which is the same navy family as most of the shipped
           wallpapers, so the bar dissolved into them. Going deeper and translucent separates it
           from any background, light or dark, while the navy cast keeps it on-brand. The blur
           needs something behind it to work, which is why the wallpaper is painted edge to edge
           and continues underneath the bar. */
        background: var(--umbradesktop-taskbar-background, rgba(16, 20, 46, 0.72));
        backdrop-filter: var(--umbradesktop-taskbar-backdrop, blur(18px) saturate(140%));
        -webkit-backdrop-filter: var(--umbradesktop-taskbar-backdrop, blur(18px) saturate(140%));
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        border-top: var(--umbradesktop-taskbar-border-top, 1px solid rgba(255, 255, 255, 0.14));
        box-shadow: var(--umbradesktop-taskbar-shadow, 0 -4px 18px rgba(0, 0, 0, 0.4));
      }
      /* Without backdrop-filter the translucency only muddies the bar, so go fully opaque. */
      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .bar {
          background: var(--umbradesktop-taskbar-background-opaque, #0f1330);
        }
      }
      /* Start + running windows travel together, so a theme can centre them as one group
         (Windows 11, macOS) while the clock stays pinned to its own edge. The gap is
         inherited from what '.bar' used to apply between them directly: wrapping the two in
         a cluster takes them out of the bar's flex flow, so it has to be restated here or
         the start button ends up sitting against the first task button. */
      .cluster {
        display: flex;
        align-items: stretch;
        height: 100%;
        flex: 1;
        min-width: 0;
        gap: var(--uui-size-space-2);
      }
      /* The start button carries the Umbraco mark, full bar height so its hover fills the
         whole bar, centered and high-contrast on the dark background. */
      .start {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        flex-shrink: 0;
        padding: 0 var(--uui-size-space-4);
        border: none;
        background: transparent;
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        cursor: pointer;
      }
      .start umb-icon {
        display: block;
        font-size: 26px;
      }
      .start:hover {
        background: var(--umbradesktop-start-hover-background, rgba(255, 255, 255, 0.12));
      }
      .start.active {
        background: var(--umbradesktop-start-active-background, rgba(255, 255, 255, 0.16));
      }
      /* The fixed features: everything the user reaches for constantly, one click away, in the
         order the shell fixes rather than one the user arranges. It sits on the launching half of
         the bar deliberately — beside the launcher button, not among the window buttons — which is
         what removes the whole tail of complexity Windows carries here.

         'flex: 0 1 auto' against '.running''s 'flex: 1' is the whole of "open window buttons
         compress first". A flex item's shrink is weighted by its basis, and '.running' has a basis
         of zero, so a bar that has run out of room takes every pixel from the window buttons before
         this row loses one — and they are already clipped by their own 'overflow: hidden'. Only
         once they are down to nothing does this row start to truncate, from its end, which is what
         'min-width: 0' plus the clip below allow. There is deliberately no cap on the number of
         pinned apps: a cap would fail earlier than the space does, and on a wider screen than
         anyone actually has trouble with.

         Its buttons carry '.task', the running-window button's own class, so all five themes style
         them without a line of new CSS. They draw no '.task-label', which the two themes that hide
         labels already assume and the three that show them read as an icon-only button. */
      .features {
        display: flex;
        /* Centred, where '.running' is stretched in this sheet. The two look identical here, because
           the base's '.task' is full bar height either way — but a theme whose tiles are a fixed
           size shorter than the bar pins them to the top under 'stretch' and centres them under
           'center', and every such theme has already said 'align-items: center' on '.running' for
           exactly that reason. The macOS dock is 48px tall with 42px tiles, so the fixed row sat
           6px above the window tiles beside it. Centring here rather than asking each theme to
           restate it keeps the row's promise of costing a theme nothing. */
        align-items: center;
        height: 100%;
        flex: 0 1 auto;
        min-width: 0;
        overflow: hidden;
        gap: var(--uui-size-space-1);
        margin-left: var(--uui-size-space-1);
      }
      /* The line between the fixed row and the open windows, rendered whenever there is something
         on both sides of it and **drawn by no theme by default**.

         Off by default because in this sheet, and in the two other themes that keep their labels, a
         window button carries its window's title and a row button never carries anything. That is
         already the difference between the two lists, and a separator between a row of icons and a
         row of titled buttons is a line drawn around a distinction the eye has made. It is the two
         icon-only themes that need it: on the macOS dock a pinned Content button and an open
         Content window are the same glyph twice with nothing between them.

         So this rule is geometry and a colour, waiting for a theme to say 'display: block'. The
         macOS dock does. Windows 11 answers the same question its own way, by marking every window
         button rather than by separating the lists — see its sheet.

         Drawn in the bar's own ink at low opacity rather than from a colour token, so a theme that
         opts in lands correctly on a dark bar and on a light one without supplying a value: '.bar'
         sets 'color' to the taskbar text colour and 'currentColor' inherits it here. */
      .divider {
        /* A token rather than a bare 'none', so a theme can turn the divider on from its palette
           alone. Every other value here is a token for the same reason: a theme that wants the
           macOS answer should not need a stylesheet to get it, only four values. */
        display: var(--umbradesktop-taskbar-divider-display, none);
        flex: none;
        box-sizing: border-box;
        align-self: center;
        width: 1px;
        height: var(--umbradesktop-taskbar-divider-height, 60%);
        margin: 0 var(--uui-size-space-2);
        background: var(--umbradesktop-taskbar-divider, currentColor);
        opacity: var(--umbradesktop-taskbar-divider-opacity, 0.25);
      }
      /* The base pulls a task icon 2px left to balance the transparent padding inside an Umbraco
         glyph against the wider gap before the label. There is no label here, so that pull is a
         2px lean in a button whose only job is to centre one icon. Three classes deep so it
         outranks the '.task .task-icon' rule it is correcting without depending on which of the two
         a browser saw last. The four themes that restyle that rule all set this to 0 already, for
         their own reasons, so none of them needs to know about this. */
      .features .task .task-icon {
        margin-left: 0;
      }
      /* Running windows: compact horizontal taskbar buttons that keep the native tab
         language — icon + label, with the active window carrying the coral "current"
         underline (an inset box-shadow, so it never shifts layout). Buttons fill the full
         bar height so the underline sits on the bottom edge and hover covers top-to-bottom.
         Minimized windows look like any other inactive window, as on Windows/KDE. */
      .running {
        display: flex;
        align-items: stretch;
        height: 100%;
        gap: var(--uui-size-space-1);
        flex: 1;
        min-width: 0;
        overflow: hidden;
        margin-left: var(--uui-size-space-1);
      }
      /* '.window' marks a button that stands for an open window, which '.task' alone no longer does:
         the fixed row's buttons are '.task' too, and they launch rather than switch. Nothing in this
         sheet uses it — with labels on, the title is what tells the two apart — but a theme that
         hides labels needs some way to say "this one is a window", and this is it. The Windows 11
         theme draws its running marker through this selector, which is its whole answer to the
         separator the macOS dock uses instead.

         A class on the button rather than '.running .task': scoping geometry to '.running' is the
         one thing that silently strands the feature row on the base's sizing, and
         'theme/taskbar-features.test.ts' fails a theme that does it. A modifier stays true wherever
         the button is rendered. */
      .task {
        position: relative;
        display: inline-flex;
        align-items: center;
        height: 100%;
        gap: var(--uui-size-space-2);
        max-width: 200px;
        min-width: 0;
        padding: 0 var(--uui-size-space-3);
        border: none;
        background: transparent;
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        cursor: pointer;
        font-family: inherit;
        font-size: calc(var(--uui-type-small-size) + 1px);
        box-shadow: inset 0 -3px 0 transparent;
        transition:
          box-shadow 120ms,
          color 120ms,
          background-color 120ms;
      }
      /* '.task-icon' rather than a bare '.task umb-icon', which is what this was until the notice
         badge became an icon too. There are now two 'umb-icon's in a task button and they answer to
         opposite geometry — the app icon is 18px and pulled left, the badge is at label size — so a
         selector that cannot tell them apart sizes the badge to the app icon in the base and in all
         four themes that restate this rule. Every theme's copy was renamed with this one. */
      .task .task-icon {
        flex-shrink: 0;
        font-size: 18px;
        /* Umbraco icon glyphs carry transparent padding inside their box, making the space
           before the icon read wider than the space after the label; pull it back to balance. */
        margin-left: -2px;
      }
      .task-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        /* Lato sits high in its line box; nudge the label down ~1px so it optically
           centers against the icon and the start button. */
        transform: translateY(1px);
      }
      .task:hover {
        color: var(--umbradesktop-taskbar-text-emphasis, var(--uui-color-header-contrast-emphasis));
        background: var(--umbradesktop-task-hover-background, rgba(255, 255, 255, 0.08));
      }
      .task.active {
        color: var(--umbradesktop-taskbar-text-emphasis, var(--uui-color-header-contrast-emphasis));
        box-shadow: inset 0 -3px 0 var(--umbradesktop-task-active-marker, var(--uui-color-current, #f5c1bc));
      }
      /* Drawn INSIDE the button's own box, deliberately. '.running' keeps 'overflow: hidden' in the
         base stylesheet and in every one of the five themes, so anything drawn outside the button is
         clipped — the same constraint '.task.active' already answers to with 'position: relative'
         above.

         Inline, after the label and at the label's own text size, rather than a badge on the
         button's corner: at label height beside the name it reads as part of the button, where a
         corner badge reads as decoration on it. 'font-size' is the whole of the sizing, because
         'umb-icon' scales with type; '1em' is the label's size rather than a second copy of the
         number '.task' above sets.

         Two themes cannot use this. macOS and Windows 11 both set '.task-label { display: none }'
         and draw icon-only tiles, where there is no label for an icon to follow, so each restyles
         this same element into an overlay on the tile's corner — its own notification idiom.
         'theme/notice.test.ts' requires exactly that of any theme that hides the label, so a sixth
         theme hiding it cannot forget. */
      .notice-badge {
        flex-shrink: 0;
        line-height: 1;
        font-size: var(--umbradesktop-notice-badge-size, 1em);
        color: var(--umbradesktop-notice-warning-color, var(--uui-color-warning-standalone));
      }
      .notice-badge[data-severity='error'] {
        color: var(--umbradesktop-notice-error-color, var(--uui-color-danger-standalone));
      }
      /* 'info' in the same slot, drawn as the dot the titlebar draws rather than as a third glyph:
         every window being edited is dirty, and a glyph on all of them would spend the scarcity
         that makes a glyph here mean something.

         The dot is a pseudo-element centred in the badge's box rather than the box itself, and that
         is what lets the two themes with icon-only tiles carry it without a line of extra CSS. They
         restyle '.notice-badge' into a 16px disc pinned to the tile's corner, filled with the
         severity colour; this rule paints nothing on that box and puts a small dot in the middle of
         it, so the dot lands exactly where the glyph's disc was, and in the themes that keep their
         labels the box shrink-wraps the dot and sits inline after the name. 'background: none' is
         the load-bearing half: without it those two themes' severity fill would paint a full disc
         behind a dot that is trying to be quiet.

         Both selectors are two classes deep on purpose. A theme's badge rule is '.notice-badge', so
         at equal specificity it would win and size the dot to the glyph's 16px box; at 0,2,0 the
         shape survives a theme that has never heard of it, and a theme that wants the dot its own
         way still has a selector to say so with.

         Size and colour are the titlebar marker's own, not a second pair: 'notice-info-color'
         already chains to the caption's dirty colour, and the size token is shared so a theme that
         resizes one dot cannot end up with two dots of different sizes on one window. Only the tail
         of the colour chain differs — the taskbar's text rather than the caption's, because this
         dot sits on the taskbar.

         That tail is a last resort and a theme with icon-only tiles must not settle for it. A task
         button draws its app icon in 'taskbar-text' too, so on those themes the dot inherits the
         exact colour of the thing it is sitting on top of and cannot be seen — reported as "the dot
         does not come across" on the macOS dock. What separates it there is hue: macOS and Windows
         11 both set 'notice-info-color' to their accent (see their palettes). A ring of the bar's
         own ground was tried first and read as a bullseye at this size, which is why it is not
         here. 'theme/notice.test.ts' fails a theme that paints this token in any of the three
         things the dot has to be seen against. */
      .notice-badge.notice-badge-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
      }
      .notice-badge.notice-badge-dot::before {
        content: '';
        width: var(--umbradesktop-titlebar-dirty-size, ${UMBRADESKTOP_UNSAVED_MARKER_SIZE}px);
        height: var(--umbradesktop-titlebar-dirty-size, ${UMBRADESKTOP_UNSAVED_MARKER_SIZE}px);
        border-radius: 50%;
        background: var(
          --umbradesktop-notice-info-color,
          var(--umbradesktop-titlebar-dirty-color, var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast)))
        );
      }
      .clock {
        flex-shrink: 0;
        padding-right: var(--uui-size-space-2);
        font-size: var(--uui-type-small-size);
        color: var(--umbradesktop-taskbar-text, var(--uui-color-header-contrast));
        opacity: 0.85;
        font-variant-numeric: tabular-nums;
      }
      /* Positioning only — the panel's own surface (background/border/shadow/size) is
         owned by <umbradesktop-launcher> itself. */
      /* --umbradesktop-taskbar-reserve isn't set anywhere in this file — it's defined on
         the desktop element's root (how much of the bottom edge the bar/dock occupies)
         and inherits in through the shadow boundary. 50px is just the fallback until then. */
      .launcher {
        position: absolute;
        left: var(--umbradesktop-launcher-left, var(--uui-size-space-3));
        bottom: var(--umbradesktop-launcher-bottom, var(--umbradesktop-taskbar-reserve, 50px));
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-taskbar': UmbraDesktopTaskbarElement;
  }
}
