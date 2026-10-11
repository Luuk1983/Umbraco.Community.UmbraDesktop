import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';
import type { UmbraDesktopLauncherLayout } from '../settings/types';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../app-catalogue.context-token.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants.js';
import {
  UMBRADESKTOP_DRAG_GHOST_OFFSET_PX,
  UMBRADESKTOP_DRAG_GHOST_TOUCH_LIFT_PX,
  UmbraDesktopTileDragController,
} from '../launcher/tile-drag.controller.js';
import type { UmbraDesktopDragSource } from '../launcher/tile-drag.controller.js';
import { dropClassFor, dropTargetAt, nearestGroupTarget } from '../launcher/drop-target.js';
import type { UmbraDesktopDragAccept, UmbraDesktopDropTarget } from '../launcher/drop-target.js';
import { applyAppDrop, applyGroupDrop } from '../launcher/apply-drop.js';
import { resolveLauncher } from '../launcher/resolve-launcher.js';
import { dragScroller } from '../launcher/drag-scroller.js';
import type { UmbraDesktopLauncherMode } from '../launcher/drag-scroller.js';
import type {
  UmbraDesktopLauncherArrangement,
  UmbraDesktopLauncherInputs,
  UmbraDesktopLauncherView,
} from '../launcher/resolve-launcher.js';
import type { UmbraDesktopGroupLabel } from '../launcher/group-labels.js';
import type { UmbraDesktopSettingsContext } from '../settings/settings.context';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UmbraDesktopThemeStyles } from '../theme/theme-styles.controller.js';
import { UmbraDesktopDrawerController, drawerStyles } from '../launcher/drawer.controller.js';
import { UmbraDesktopArrangeController, arrangeStyles } from '../launcher/arrange.controller.js';
import { UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH, UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH } from '../launcher/geometry.js';
import { css, customElement, html, repeat, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import type { UmbCurrentUserModel } from '@umbraco-cms/backoffice/current-user';
import { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';

/**
 * A question the launcher asks its host to put to the user, as the detail of a cancelable `confirm`
 * event. The host calls `preventDefault()` to say it will answer, then calls {@link answer} once.
 * Unanswered, because nothing handled the event, the answer is no.
 */
export interface UmbraDesktopLauncherConfirm {
  /** The dialog's heading. */
  headline: string;
  /** What will happen. */
  content: string;
  /** The label on the button that says yes. */
  confirmLabel: string;
  /**
   * The user's answer.
   * @param confirmed True for yes.
   */
  answer(confirmed: boolean): void;
}

/**
 * The height, in px, the panel is held at while All apps or arrange mode is open, as a custom
 * property on the host. Private to this element, hence no `--umbradesktop-` prefix: that namespace is
 * the theme contract, and a theme has no business setting this.
 */
const HELD_HEIGHT = '--launcher-held-height';

/**
 * The start-menu-style launcher panel: search, the Pinned place, the user's groups as cards of
 * icon tiles, and a footer (user, desktop settings, log out, exit). What it draws is
 * `resolveLauncher`'s view of the catalogue plus the user's changes to it (see the 2026-09-27
 * launcher layout design). Mounted by `<umbradesktop-taskbar>`, which owns the panel's open/close
 * state and outside-click/Escape dismissal.
 *
 * Tiles only launch. A drag moves, pins or removes an app (design D6): it takes movement past a
 * threshold to start, and removing takes a drop on a pane that only exists during a drag, so none of
 * it can happen by accident. That is what replaced the hover pin badge, which sat over the corner of
 * the tile you were aiming at.
 *
 * **This element never opens a modal itself.** It is unmounted as soon as a pointer goes down
 * outside it — including a pointer inside a modal it opened. Umbraco proxies a modal's context
 * requests through the element that opened it, so a modal owned by the launcher loses its
 * context origin on the first click inside it, and every later `getContext` hangs forever with
 * no error at all. Instead the footer reports intent (`search`, `profile`, `settings`, `exit`)
 * and the taskbar, which lives as long as the desktop, owns the modal. The one question the
 * launcher asks, arrange mode's Reset, goes the same way: a `confirm` event carrying
 * {@link UmbraDesktopLauncherConfirm}, which the taskbar answers from a modal it owns while holding
 * the launcher open under it.
 */
@customElement('umbradesktop-launcher')
export class UmbraDesktopLauncherElement extends UmbLitElement {
  /** The apps this user may open, from the catalogue. */
  @state()
  private _apps: UmbraDesktopApp[] = [];

  /** Every group in the merged catalogue, to name groups and place new ones. */
  @state()
  private _catalogueGroups: UmbraDesktopGroup[] = [];

  /** The pinned aliases, which are the Pinned place. */
  @state()
  private _pinned: ReadonlyArray<string> = [];

  /** The user's changes to the groups; `undefined` when they have never arranged. */
  @state()
  private _layout?: UmbraDesktopLauncherLayout;

  /** The signed-in user, for the footer's name and avatar, which open their profile. */
  @state()
  private _currentUser?: UmbCurrentUserModel;

  /**
   * Which body the panel shows. Back to the launcher every time it opens, because the taskbar
   * unmounts this element on close.
   */
  @state()
  private _mode: UmbraDesktopLauncherMode = 'launcher';

  /** Whether a drag is under way; shows Pinned as a target and the remove pane. */
  @state()
  private _dragging = false;

  /** The drop target under the pointer, for the landing highlight. */
  @state()
  private _over?: UmbraDesktopDropTarget;

  /** What the drag under way is moving, which decides how a group card shows it is the target. */
  @state()
  private _dragKind?: UmbraDesktopDragAccept;

  /** The window manager, which a launched app is handed to; the launcher opens no window itself. */
  #manager?: UmbraDesktopWindowManagerContext;

  /**
   * The settings context, which owns the pins and the layout and stores every change to them on the
   * user's account. The launcher only computes the new arrangement and hands it over.
   */
  #settings?: UmbraDesktopSettingsContext;

  /**
   * All apps. A controller rendering into this element's own shadow root, rather than a child
   * element of its own, so the active theme's launcher sheet — adopted only here — still reaches
   * what it draws (see §7 of the 2026-09-27 launcher layout design).
   */
  #drawer = new UmbraDesktopDrawerController(this, {
    launch: (app) => this.#open(app),
    back: () => void this.#setMode('launcher'),
  });

  /**
   * Arrange mode. A controller for the same reason as the drawer: the theme's launcher sheet only
   * reaches this shadow root, and the one drag controller hit-tests only this shadow root.
   */
  #arrange = new UmbraDesktopArrangeController(this, {
    commit: (result) => this.#commit(result),
    beginDrag: (e, source) => this.#drag.begin(e, source),
    done: () => void this.#setMode('launcher'),
    confirm: (question) => this.#confirm(question),
  });

  /**
   * The one drag controller. Normal mode and arrange mode share it, because both render into this
   * shadow root and a drop means the same thing in both.
   */
  #drag = new UmbraDesktopTileDragController(() => this.shadowRoot, {
    targetAt: (x, y, source) => (this.shadowRoot ? this.#targetAt(this.shadowRoot, x, y, source) : undefined),
    onStart: (source) => {
      this._dragging = true;
      this._dragKind = source.kind;
    },
    onOver: (target) => (this._over = target),
    onDrop: (source, target) =>
      this.#commit(
        source.kind === 'app'
          ? applyAppDrop(this.#inputs, this.#arrangement, source.app, target)
          : applyGroupDrop(this.#inputs, this.#arrangement, source.groupId, target),
      ),
    onEnd: () => {
      this._dragging = false;
      this._over = undefined;
      this._dragKind = undefined;
    },
    // Whichever element the active theme lets scroll, not always the body: a theme may keep part
    // of the panel fixed and scroll an inner element instead, as Umbraco 4 does with its fixed
    // Favourites over a scrolling tree, and scrolling a body that cannot scroll leaves everything
    // below the fold out of reach of the drag.
    scroller: () => (this.shadowRoot ? dragScroller(this.shadowRoot, this._mode) : null),
  });

  /**
   * Adopts the theme's launcher sheet and subscribes to the four contexts the panel draws from: the
   * catalogue (what exists), the window manager (where a launch goes), the settings (what the user
   * changed) and the current user (the footer). Each one feeds state, so the panel redraws itself
   * when any of them changes while it is open.
   */
  constructor() {
    super();
    // Adopts the active theme's launcher-surface stylesheet into this element's shadow root.
    new UmbraDesktopThemeStyles(this, 'launcher');
    this.consumeContext(UMBRADESKTOP_APP_CATALOGUE_CONTEXT, (ctx) => {
      if (!ctx) return;
      this.observe(ctx.apps, (apps) => (this._apps = apps));
      this.observe(ctx.catalogueGroups, (groups) => (this._catalogueGroups = groups));
    });
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (ctx) => {
      this.#manager = ctx ?? undefined;
    });
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (ctx) => {
      this.#settings = ctx ?? undefined;
      if (!ctx) return;
      this.observe(ctx.pinned, (pinned) => (this._pinned = pinned));
      this.observe(ctx.layout, (layout) => (this._layout = layout));
    });
    this.consumeContext(UMB_CURRENT_USER_CONTEXT, (ctx) => {
      if (!ctx) return;
      this.observe(ctx.currentUser, (user) => (this._currentUser = user));
    });
  }

  /** What the catalogue says exists, in the shape the layout functions take. */
  get #inputs(): UmbraDesktopLauncherInputs {
    return { apps: this._apps, catalogueGroups: this._catalogueGroups };
  }

  /** What the user has chosen, in the shape the layout functions take. */
  get #arrangement(): UmbraDesktopLauncherArrangement {
    return { pinned: this._pinned, layout: this._layout };
  }

  /**
   * A group heading's text: a catalogue label through the translator, the user's own name as typed.
   * @param label The label from the view.
   * @returns The text to show.
   */
  #label(label: UmbraDesktopGroupLabel): string {
    return label.translate ? this.localize.string(label.text) : label.text;
  }

  /**
   * What a drag over a point would drop on. A group over no group card, or over Pinned where no
   * group can go, lands beside the nearest group instead, so the bar showing where it lands does not
   * go out between two cards or above the first one (see `nearestGroupTarget`).
   * @param root This element's shadow root.
   * @param x The pointer's client x.
   * @param y The pointer's client y.
   * @param source What is being dragged.
   * @returns The target, or `undefined` for none.
   */
  #targetAt(root: ShadowRoot, x: number, y: number, source: UmbraDesktopDragSource): UmbraDesktopDropTarget | undefined {
    const hit = dropTargetAt(root, x, y, source.kind);
    if (source.kind === 'group' && (!hit || (hit.kind === 'group' && hit.groupId === UMBRADESKTOP_PINNED_GROUP_ID))) {
      return nearestGroupTarget(root, x, y, [UMBRADESKTOP_PINNED_GROUP_ID, source.groupId]);
    }
    return this.#accepted(source, hit);
  }

  /**
   * The drop target, unless dropping this source there would be refused anyway, in which case the
   * pointer is over nothing: a highlight has to mean the drop will land. A group cannot go into
   * Pinned or onto itself, and a palette app dropped back on the palette is not a removal.
   * @param source What is being dragged.
   * @param target What is under the pointer.
   * @returns The target, or `undefined` when the drop would be refused.
   */
  #accepted(source: UmbraDesktopDragSource, target: UmbraDesktopDropTarget | undefined): UmbraDesktopDropTarget | undefined {
    if (!target) return undefined;
    if (source.kind === 'app') return source.fromPalette && target.kind === 'palette' ? undefined : target;
    const refused = target.kind === 'group' && (target.groupId === UMBRADESKTOP_PINNED_GROUP_ID || target.groupId === source.groupId);
    return refused ? undefined : target;
  }

  /**
   * Whether the launcher should stay open when a pointer goes down outside it or focus leaves for a
   * window. True while arranging: a missed click there closed the whole launcher and dropped the user
   * out of the mode, and Done is the way out of it. Nothing is lost either way, since every edit is
   * stored as it is made, so the hold is about not being thrown out rather than about saving work.
   * @returns True while in arrange mode.
   */
  get holdsOpen(): boolean {
    return this._mode === 'arrange';
  }

  /**
   * Step back one level, which is what Escape does: from All apps or arrange mode to the launcher.
   * The taskbar asks this first and closes the launcher only when there is nowhere to step back to.
   * @returns True when it stepped back, false when it was already showing the launcher.
   */
  back(): boolean {
    if (this._mode === 'launcher') return false;
    void this.#setMode('launcher');
    return true;
  }

  /**
   * Ask the taskbar to put a question to the user, in a modal the taskbar owns (see the class
   * comment for why this element never opens one itself).
   * @param question What to ask.
   * @returns The answer; no when nothing handled the request.
   */
  #confirm(question: Omit<UmbraDesktopLauncherConfirm, 'answer'>): Promise<boolean> {
    return new Promise((resolve) => {
      const event = new CustomEvent<UmbraDesktopLauncherConfirm>('confirm', {
        cancelable: true,
        detail: { ...question, answer: resolve },
      });
      if (this.dispatchEvent(event)) resolve(false);
    });
  }

  /** Launch an app and let the taskbar know so it can close the launcher. */
  #open(app: UmbraDesktopApp) {
    this.#manager?.open(app);
    this.dispatchEvent(new CustomEvent('launched'));
  }

  /**
   * Store the result of one launcher action. Nothing to store is a no-op, which is what a drop
   * that changes nothing returns, and so is a result equal to what is already stored: a tile
   * dropped just after itself comes back as an identical arrangement, and every write is a round
   * trip to the user's account.
   *
   * Compared with `JSON.stringify`, like the layout edits compare their own results: both sides are
   * built by the same functions from the same state, so equal arrangements serialise identically.
   * @param result The new arrangement, or `undefined`.
   */
  #commit(result: UmbraDesktopLauncherArrangement | undefined) {
    if (!result) return;
    const current = this.#arrangement;
    const same =
      JSON.stringify({ pinned: result.pinned, layout: result.layout }) ===
      JSON.stringify({ pinned: current.pinned, layout: current.layout });
    if (!same) this.#settings?.setLauncherArrangement(result.pinned, result.layout);
  }

  /**
   * The taskbar unmounts the launcher on any outside press, so this is where a visit ends. A group
   * name still being typed is stored first, since the press unmounts it before the field can blur
   * and fire `change`. Then a drag in flight is abandoned, listeners and all.
   */
  override disconnectedCallback() {
    if (this._mode === 'arrange') this.#arrange.flush();
    this.#drag.cancel();
    super.disconnectedCallback();
  }

  /**
   * Switch the panel's body, and put focus where the new body wants it.
   *
   * Every switch needs this, because the control that took the click leaves the DOM the moment
   * `_mode` flips, which would otherwise drop keyboard focus to the document body with no visible
   * landing place. Back into the launcher, focus returns to the control that left it: All apps from
   * the drawer, Arrange from arrange mode. Into arrange mode it lands on Done, the one control that
   * is always drawn there whatever the panel's width. Without scrolling: Done is in the banner at the
   * top of the panel, so it is already in view, and letting the browser scroll for it would only
   * ever move something else, such as a page narrower than the panel.
   * @param mode The body to show.
   */
  async #setMode(mode: UmbraDesktopLauncherMode) {
    const from = this._mode;
    if (from === 'launcher' && mode !== 'launcher') this.style.setProperty(HELD_HEIGHT, `${this.getBoundingClientRect().height}px`);
    if (mode === 'drawer') this.#drawer.reset();
    if (mode === 'arrange') this.#arrange.reset();
    this._mode = mode;
    await this.updateComplete;
    if (mode === 'drawer') this.#drawer.focus();
    else if (mode === 'arrange') this.shadowRoot?.querySelector<HTMLElement>('.ctl.done')?.focus({ preventScroll: true });
    else this.shadowRoot?.querySelector<HTMLElement>(from === 'arrange' ? '.ctl.arrange' : '.ctl.all-apps')?.focus();
  }

  /**
   * Mark the host while arranging, so the theme's arrange width applies (see the `:host([arranging])`
   * rule). Before the render rather than after, so the first frame of arrange mode is already wide.
   * @param changed The properties about to update.
   */
  override willUpdate(changed: Map<PropertyKey, unknown>) {
    super.willUpdate(changed);
    this.toggleAttribute('arranging', this._mode === 'arrange');
  }

  /**
   * Arrange mode puts focus where its last action asked, once the result has rendered. Then the
   * panel's height is held, see {@link #holdHeight}.
   * @param changed The properties that changed in this update.
   */
  override updated(changed: Map<PropertyKey, unknown>) {
    super.updated(changed);
    if (this._mode === 'arrange') this.#arrange.afterRender();
    this.#holdHeight();
  }

  /**
   * Keep the panel from shrinking while All apps or arrange mode is open. Its height follows its
   * content, so every letter a filter took away made the panel jump shorter, and so did opening
   * All apps from a launcher taller than the list. It may grow, and the hold grows with it; it never
   * shrinks until the launcher is back, which lets go. Held as a minimum rather than a height, and
   * capped in CSS by the panel's maximum, so a window made smaller still shrinks it.
   */
  #holdHeight(): void {
    if (this._mode === 'launcher') {
      this.style.removeProperty(HELD_HEIGHT);
      return;
    }
    const height = this.getBoundingClientRect().height;
    if (height > (parseFloat(this.style.getPropertyValue(HELD_HEIGHT)) || 0)) this.style.setProperty(HELD_HEIGHT, `${height}px`);
  }

  /** Ask the taskbar to open the native backoffice search modal. */
  #requestSearch() {
    this.dispatchEvent(new CustomEvent('search'));
  }

  /** Ask the taskbar to open the desktop settings dialog. */
  #requestSettings() {
    this.dispatchEvent(new CustomEvent('settings'));
  }

  /** Ask the taskbar to open the native current-user modal (profile, MFA, etc.). */
  #requestProfile() {
    this.dispatchEvent(new CustomEvent('profile'));
  }

  /** Sign the current user out. */
  async #logout() {
    const auth = await this.getContext(UMB_AUTH_CONTEXT);
    await auth?.signOut();
  }

  /** Ask the taskbar to run its exit-desktop confirm flow. */
  #exit() {
    this.dispatchEvent(new CustomEvent('exit'));
  }

  /**
   * One app tile: launches on click, drags on a press that moves (design D6). `data-drop`,
   * `data-group` and `data-alias` are what the drag reads to know it is over this tile.
   * @param app The app.
   * @param groupId The group it is drawn in, or the Pinned id.
   * @returns The tile template.
   */
  #tile(app: UmbraDesktopApp, groupId: string) {
    return html`
      <div
        class="tile ${dropClassFor(this._over, groupId, app.alias)}"
        data-drop="tile"
        data-group=${groupId}
        data-alias=${app.alias}
        @pointerdown=${(e: PointerEvent) => this.#drag.begin(e, { kind: 'app', app })}>
        <button class="launch" title=${this.localize.string(app.name)} @click=${() => this.#open(app)}>
          <umb-icon name=${app.icon}></umb-icon>
          <span class="tlb">${this.localize.string(app.name)}</span>
        </button>
      </div>
    `;
  }

  /**
   * A grid of app tiles.
   * @param apps The apps.
   * @param groupId The group they are drawn in, or the Pinned id.
   * @returns The grid template.
   */
  #grid(apps: ReadonlyArray<UmbraDesktopApp>, groupId: string) {
    return html`<div class="grid">${repeat(apps, (a) => a.alias, (a) => this.#tile(a, groupId))}</div>`;
  }

  /**
   * The Pinned place: the full-width hero card above the groups, drawn when it holds anything. An
   * empty Pinned is the header's to draw, during a drag (see {@link #renderPinTarget}).
   * @param view The launcher view.
   * @returns The card, or nothing.
   */
  #renderPinned(view: UmbraDesktopLauncherView) {
    if (view.pinned.length === 0) return '';
    return html`
      <div
        class="card fav ${dropClassFor(this._over, UMBRADESKTOP_PINNED_GROUP_ID)}"
        data-drop="group"
        data-group=${UMBRADESKTOP_PINNED_GROUP_ID}>
        <div class="ch">${this.localize.term('umbraDesktop_favourites')}</div>
        ${this.#grid(view.pinned, UMBRADESKTOP_PINNED_GROUP_ID)}
      </div>
    `;
  }

  /**
   * An empty Pinned, for as long as a drag lasts: without it there would be no way to pin by
   * dragging on a fresh launcher (design §3.1). Drawn over the header row, which a drag has no use
   * for, the way the remove pane is drawn over the footer, so that nothing in the flow moves when it
   * appears. A card in the flow above the groups pushed every group down the moment a drag started,
   * and the tile being pressed jumped away from the pointer; one laid over the top of the body
   * covered the first group's tiles instead, and a drop meant for them pinned. The hint says what it
   * is for, since with nothing in it a bare heading reads as a label.
   * @returns The drop target.
   */
  #renderPinTarget() {
    return html`
      <div
        class="pin-target ${dropClassFor(this._over, UMBRADESKTOP_PINNED_GROUP_ID)}"
        data-drop="group"
        data-group=${UMBRADESKTOP_PINNED_GROUP_ID}>
        <umb-icon name="icon-pushpin"></umb-icon>
        <span class="pin-title">${this.localize.term('umbraDesktop_favourites')}</span>
        <span class="hint">${this.localize.term('umbraDesktop_pinnedDropHint')}</span>
      </div>
    `;
  }

  /**
   * The groups as cards, skipping any with nothing to show (design §4.2 step 6).
   * @param view The launcher view.
   * @returns The cards template.
   */
  #renderGroups(view: UmbraDesktopLauncherView) {
    const groups = view.groups.filter((group) => group.apps.length > 0);
    return html`
      <div class="cards">
        ${repeat(
          groups,
          (g) => g.id,
          (g) => html`
            <div class="card ${dropClassFor(this._over, g.id)}" data-drop="group" data-group=${g.id}>
              <div class="ch">${this.#label(g.label)}</div>
              ${this.#grid(g.apps, g.id)}
            </div>
          `,
        )}
      </div>
    `;
  }

  /**
   * The remove pane, over the footer for as long as a drag lasts. It exists only then, so a removal
   * can only ever be a deliberate drop on it.
   * @returns The pane template.
   */
  #renderRemovePane() {
    return html`
      <div class="removepane ${this._over?.kind === 'remove' ? 'drop' : ''}" data-drop="remove">
        <umb-icon name="icon-trash"></umb-icon>
        <span class="remove-text">
          <span class="remove-title">${this.localize.term('umbraDesktop_removeFromLauncher')}</span>
          <span class="remove-hint">${this.localize.term('umbraDesktop_removeFromLauncherHint')}</span>
        </span>
      </div>
    `;
  }

  /**
   * What the launcher shows when nothing is pinned and every group is empty: a way back to Arrange
   * and to All apps, rather than a blank panel (design §3.1).
   * @returns The empty state.
   */
  #renderEmpty() {
    return html`
      <div class="empty">
        <p>${this.localize.term('umbraDesktop_launcherEmpty')}</p>
        <button class="ctl arrange" @click=${() => this.#setMode('arrange')}>${this.localize.term('umbraDesktop_arrange')}</button>
        <button class="ctl all-apps" @click=${() => this.#setMode('drawer')}>${this.localize.term('umbraDesktop_allApps')}</button>
      </div>
    `;
  }

  /**
   * The footer: the user, then Desktop settings, Log out and Exit. Shared by the launcher and All
   * apps, so the account and the way out are one click away from either. Each button reports intent
   * to the taskbar rather than opening anything itself (see the class comment).
   * @returns The footer template.
   */
  #renderFooter() {
    const user = this._currentUser;
    return html`
      <div class="footer">
        <button class="user" title=${user?.name ?? ''} @click=${this.#requestProfile}>
          <umb-user-avatar .name=${user?.name} .imgUrls=${user?.avatarUrls ?? []}></umb-user-avatar>
          <span class="user-name">${user?.name ?? ''}</span>
        </button>
        <div class="actions">
          <button
            class="fbtn"
            title=${this.localize.term('umbraDesktop_desktopSettings')}
            aria-label=${this.localize.term('umbraDesktop_desktopSettings')}
            @click=${this.#requestSettings}>
            <umb-icon name="icon-settings"></umb-icon>
          </button>
          <button
            class="fbtn"
            title=${this.localize.term('umbraDesktop_logout')}
            aria-label=${this.localize.term('umbraDesktop_logout')}
            @click=${this.#logout}>
            <umb-icon name="icon-log-out"></umb-icon>
          </button>
          <button
            class="fbtn"
            title=${this.localize.term('umbraDesktop_exitDesktop')}
            aria-label=${this.localize.term('umbraDesktop_exitDesktop')}
            @click=${this.#exit}>
            <umb-icon name="icon-door-open"></umb-icon>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * The panel for the current mode. The launcher view is resolved afresh on every render rather
   * than cached, because it is a pure function of the catalogue and the user's arrangement and both
   * arrive as state: whichever changed, the view follows without any bookkeeping here.
   * @returns The panel template.
   */
  override render() {
    if (this._mode === 'drawer') return html`${this.#drawer.render(this._apps)} ${this.#renderFooter()}`;
    const view = resolveLauncher(this.#inputs, this.#arrangement);
    if (this._mode === 'arrange') {
      // No remove pane here: in arrange mode the palette is where a tile goes to leave the launcher.
      return html`
        ${this.#arrange.render({
          inputs: this.#inputs,
          arrangement: this.#arrangement,
          view,
          over: this._over,
          dragging: this._dragKind,
          label: (label) => this.#label(label),
        })}
        ${this.#renderFooter()}
      `;
    }
    // Not while dragging: the drag needs Pinned and the groups drawn as targets, even empty ones.
    const empty = view.pinned.length === 0 && view.groups.every((g) => g.apps.length === 0) && !this._dragging;
    const pinTarget = this._dragging && view.pinned.length === 0;
    return html`
      <div class="hdr ${pinTarget ? 'pinning' : ''}">
        <button class="search" @click=${this.#requestSearch}>
          <umb-icon name="icon-search"></umb-icon>
          <span>${this.localize.term('umbraDesktop_search')}</span>
        </button>
        <button class="ctl all-apps" @click=${() => this.#setMode('drawer')}>
          <umb-icon name="icon-thumbnails-small"></umb-icon>
          <span>${this.localize.term('umbraDesktop_allApps')}</span>
        </button>
        <!-- Layout blocks rather than the grip, which is what a group's drag handle shows. -->
        <button class="ctl arrange" @click=${() => this.#setMode('arrange')}>
          <umb-icon name="icon-layout-masonry"></umb-icon>
          <span>${this.localize.term('umbraDesktop_arrange')}</span>
        </button>
        ${pinTarget ? this.#renderPinTarget() : ''}
      </div>
      <div class="body">${empty ? this.#renderEmpty() : html`${this.#renderPinned(view)} ${this.#renderGroups(view)}`}</div>
      <div class="foot ${this._dragging ? 'dragging' : ''}">${this.#renderFooter()} ${this._dragging ? this.#renderRemovePane() : ''}</div>
    `;
  }

  /**
   * The base look, tokenised throughout so a theme restyles it through its palette and its own
   * launcher sheet, plus the drawer's rules, which live beside the drawer but render in this root.
   */
  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        /* Roomy: cards flow into as many columns as fit, so the panel only scrolls on
           genuinely small screens. Column count is capped by this width, not by .cards itself
           (it flows into repeat(auto-fill, minmax(UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH, 1fr))): with padding
           --uui-size-space-4 (12px) on each side and gap --uui-size-space-5 (18px) between
           columns, N columns need 24 + N*260 + (N-1)*18 px — 840 for 3, 1118 for 4, 1396 for 5.
           UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH (1180, in launcher/geometry.ts) rather than exactly
           1118 so four columns get roughly 275px each instead of sitting at their 260px minimum.
           Ten groups now exist, so three columns (960px) read as cramped; measured in a browser
           after picking 1180, per docs/developer/theming.md §4. Windows 98, Windows 11 and Umbraco 4 each pin
           --umbradesktop-launcher-width in their own palette and are unaffected by this default. */
        width: var(--umbradesktop-launcher-width, min(${unsafeCSS(UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH)}px, 92vw));
        /* height/backdrop-filter/color below are dormant handles, not live behaviour: their
           fallbacks (auto, none, none) are the CSS initial values, so nothing changes today.
           They exist so a future theme can turn this panel into a fullscreen blurred surface. */
        height: var(--umbradesktop-launcher-height, auto);
        max-height: var(--umbradesktop-launcher-max-height, calc(100vh - 66px));
        /* The height held while All apps or arrange mode is open (see holdHeight), never more than
           the maximum, so a smaller window still wins. */
        min-height: min(var(${unsafeCSS(HELD_HEIGHT)}, 0px), var(--umbradesktop-launcher-max-height, calc(100vh - 66px)));
        overflow: hidden;
        /* Light-grey canvas so the white group cards read as distinct "boxes". */
        background: var(
          --umbradesktop-launcher-background,
          var(--uui-color-surface-alt, var(--uui-color-background))
        );
        backdrop-filter: var(--umbradesktop-launcher-backdrop, none);
        -webkit-backdrop-filter: var(--umbradesktop-launcher-backdrop, none);
        border: var(--umbradesktop-launcher-border, 1px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-launcher-radius, var(--uui-border-radius, 3px));
        box-shadow: var(--umbradesktop-launcher-shadow, var(--uui-shadow-depth-4));
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      /* Arrange mode's own width, for a theme whose launcher is too narrow for the palette to sit
         beside the layout (a Start menu list, say): see arrangeWidthFor in launcher/geometry.ts.
         Unset, arrange mode keeps the launcher's width. */
      :host([arranging]) {
        width: var(
          --umbradesktop-launcher-arrange-width,
          var(--umbradesktop-launcher-width, min(${unsafeCSS(UMBRADESKTOP_LAUNCHER_DEFAULT_WIDTH)}px, 92vw))
        );
      }
      .search {
        flex: 1;
        min-width: 0;
        margin: 0;
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
        /* Its own radius token, not the cards': the search field follows the panel's radius
           (3px) while the group cards are deliberately rounder (6px). One token with two
           different defaults would silently reshape both the first time a theme set it. */
        border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        font-family: inherit;
        font-size: var(--uui-type-small-size);
        text-align: left;
        cursor: pointer;
      }
      .search:hover {
        border-color: var(--umbradesktop-launcher-border-emphasis, var(--uui-color-border-emphasis, var(--uui-color-border)));
      }
      /* One line, ending in an ellipsis where the row is short of room, rather than wrapping: the
         field shares its row with All apps and Arrange, and a placeholder wrapped onto three to five
         lines made the whole row that tall. */
      .search span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .search umb-icon {
        flex-shrink: 0;
        font-size: 16px;
        opacity: 0.7;
      }
      /* The header row: search, then the panel's own controls. Its margin is what the search field
         used to carry on its own, so the panel's top edge is where it was. */
      .hdr {
        position: relative;
        flex-shrink: 0;
        display: flex;
        align-items: stretch;
        gap: var(--uui-size-space-2);
        margin: var(--uui-size-space-4) var(--uui-size-space-4) 0;
      }
      /* An empty Pinned, during a drag, takes over the header row's box exactly: the row stays in the
         layout, only hidden, so nothing below it moves when the target appears. It is the footer's
         remove pane mirrored at the top. Dashed like an arrange tile, because it is a place to drop
         rather than something to press; one line, with the hint ellipsised when the row is short. */
      .hdr.pinning > :not(.pin-target) {
        visibility: hidden;
      }
      .pin-target {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-2);
        padding: 0 var(--uui-size-space-3);
        overflow: hidden;
        border: 1px dashed var(--umbradesktop-launcher-text-muted, var(--uui-color-border));
        border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .pin-target umb-icon {
        flex-shrink: 0;
        font-size: 16px;
      }
      .pin-title {
        flex-shrink: 0;
        font-weight: 700;
      }
      .pin-target .hint {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      /* One look for every button the launcher adds: All apps, Arrange, Back, the arrange banner's
         buttons and the palette's. Tokenised in full, so a theme restyles all of them in one place. */
      .ctl {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-2);
        min-height: 32px;
        padding: 0 var(--uui-size-space-4);
        border: var(--umbradesktop-launcher-control-border, var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border)));
        border-radius: var(--umbradesktop-launcher-search-radius, var(--uui-border-radius, 3px));
        background: var(--umbradesktop-launcher-control-background, var(--umbradesktop-launcher-card-background, var(--uui-color-surface)));
        color: var(--umbradesktop-launcher-control-text, var(--umbradesktop-launcher-text, var(--uui-color-text)));
        font-family: inherit;
        font-size: var(--uui-type-small-size);
        white-space: nowrap;
        cursor: pointer;
      }
      .ctl:hover {
        background: var(--umbradesktop-launcher-hover-background, var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05)));
      }
      .ctl[aria-pressed='true'],
      .ctl.primary {
        background: var(--umbradesktop-launcher-control-active-background, var(--uui-color-selected, #3544b1));
        color: var(--uui-color-selected-contrast, #fff);
      }
      .ctl umb-icon {
        font-size: 16px;
      }
      .body {
        flex: 1;
        overflow: auto;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5);
        padding: var(--uui-size-space-4);
      }
      /* Group cards flow into as many columns as the width allows; each card is wide enough
         (min UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH, from launcher/geometry.ts) to hold 2-3 tiles
         per row. Capped at 100% so a single column can shrink below that when the space is short
         of it, say by a classic scrollbar at arrange mode's narrowest split, rather than push the
         pane into scrolling sideways. */
      .cards {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(${unsafeCSS(UMBRADESKTOP_LAUNCHER_CARD_MIN_WIDTH)}px, 100%), 1fr));
        gap: var(--uui-size-space-5);
        /* Equal-height cards per row — tidier than ragged, content-sized boxes. */
        align-items: stretch;
      }
      .card {
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        border: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
        border-radius: var(--umbradesktop-launcher-card-radius, 6px);
        padding: var(--uui-size-space-4);
      }
      .card.fav {
        /* Full-width hero, whatever the column layout below does. */
        grid-column: 1 / -1;
      }
      /* A group heading, the way the backoffice writes one: core's 'uui-box' renders its headline as
         <h5 class="uui-h5">, and 'uui-text.css' gives that '--uui-type-h5-size' at weight 400, in
         the normal text colour, normal case. Restated rather than borrowed, because that stylesheet
         is global to the backoffice document and cannot reach inside this shadow root.

         It used to be a spaced-out uppercase micro-label at 60% opacity, which is a style this
         package invented and Umbraco uses nowhere. Three of the five themes were already overriding
         it — Win11 to sentence case, Win98 to a menu groove, Umbraco 4 to a grooved strip — which
         is its own evidence: a base that every theme has to undo is not a base.

         The colour is the launcher's own text token rather than '--uui-color-text', because this
         panel sits over a wallpaper and each theme decides what reads on it. */
      .ch {
        margin: 0 0 var(--uui-size-space-3);
        font-size: var(--uui-type-h5-size, 16px);
        font-weight: 400;
        line-height: inherit;
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
      }
      /* Exactly three tiles per row, evenly filling the card width with symmetric padding —
         no ragged right edge. The full-width Pinned hero overrides this to fill its own width. */
      .grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--uui-size-space-3);
      }
      .fav .grid {
        grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
      }
      .tile {
        position: relative;
        /* A grid item defaults to 'min-width: auto', so its column cannot be narrower than its
           longest unbreakable word: one long app name turns 'repeat(3, 1fr)' into three unequal
           columns, grows the grid past its card, paints the label over the group beside it and
           gives the whole panel a horizontal scrollbar. Dutch found it — "Documenttype-
           machtigingen" against "Document Type permissions" — but any language can, and so can an
           English app somebody else registers. The label below is what makes this safe rather than
           merely narrow: it cuts a word that does not fit with an ellipsis, so nothing here has a
           width it must have. */
        min-width: 0;
      }
      .launch {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--uui-size-space-1);
        width: 100%;
        padding: var(--uui-size-space-2) var(--uui-size-space-1);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        cursor: pointer;
        font-family: inherit;
        text-align: center;
      }
      .tile:hover .launch {
        background: var(
          --umbradesktop-launcher-hover-background,
          var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05))
        );
      }
      .launch umb-icon {
        font-size: 26px;
      }
      .tlb {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        max-width: 100%;
        /* A word wider than the tile. Hyphenate it where the browser can (the backoffice sets the
           document language, so it knows the rules), so "Documenttype-machtigingen" breaks at a
           sensible point. Where it cannot, cut the line with an ellipsis and let the tile's title
           carry the full name. This used to fall back to 'overflow-wrap: anywhere', which broke
           Minesweeper into "Minesweepe" / "r" because English hyphenation has no point in it at
           this width (issue #121).
           The column stays honest without 'anywhere': 'min-width: 0' on the tile lets it be
           narrower than the word, and 'overflow: hidden' above gives this label an automatic
           minimum of 0 in the themes that lay it out as a flex row. Before the ellipsis, that
           combination clipped the word mid-letter; 'text-overflow' is what turns the clip into a
           cut the reader can see. It applies to each line, so the two-line clamp still ends in its
           own ellipsis too. */
        hyphens: auto;
        text-overflow: ellipsis;
        font-size: var(--uui-type-small-size);
        line-height: 1.2;
        /* Reserve two lines so every tile is the same height whether the name wraps or not. */
        min-height: 2.4em;
        /* Lato sits high in its line box; nudge the label down ~1px so it optically centers. */
        transform: translateY(1px);
      }
      /* A press on a tile may become a drag, so the platform's own long-press behaviours (text
         selection, the iOS callout) must not start instead. */
      .tile {
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
      }
      /* The tile being dragged stays in place, faded, so the gap it leaves reads as where it was. */
      [data-lifted] {
        opacity: 0.35;
      }
      /* While a drag is under way the pressed element holds the pointer, so its cursor is the one
         shown: the four arrows Umbraco uses for moving things around. */
      [data-lifted] {
        cursor: move;
      }
      /* The icon that follows the pointer: the pressed tile's icon alone, beside the pointer rather
         than under it, so the landing bar the user is steering by stays in sight; above a finger
         instead, which would cover it. Out of hit-testing so the drop target underneath is what the
         pointer finds. The drag shows it in the top layer as a popover, so a theme that blurs this
         panel cannot become its containing block or clip it; the resets below undo the browser's
         popover styles (centred with margin: auto over the whole viewport, with a border, padding,
         a background and its own colours) so it sits where left and top put it. Its shadow is a
         drop shadow, which follows the icon's outline where a box shadow would draw the square the
         icon sits in. */
      .drag-ghost {
        position: fixed;
        z-index: 1000;
        inset: auto;
        margin: 0;
        padding: 0;
        border: 0;
        overflow: visible;
        background: transparent;
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        font-size: 28px;
        pointer-events: none;
        transform: translate(${unsafeCSS(UMBRADESKTOP_DRAG_GHOST_OFFSET_PX)}px, ${unsafeCSS(UMBRADESKTOP_DRAG_GHOST_OFFSET_PX)}px);
        filter: drop-shadow(var(--umbradesktop-launcher-ghost-shadow, 0 4px 12px rgba(0, 0, 0, 0.3)));
      }
      .drag-ghost[data-pointer='touch'] {
        transform: translate(-50%, calc(-100% - ${unsafeCSS(UMBRADESKTOP_DRAG_GHOST_TOUCH_LIFT_PX)}px));
      }
      /* Where a drop lands: a highlighted card, or a bar before or after a tile. */
      .card.drop,
      .pin-target.drop,
      .palette.drop {
        background: var(--umbradesktop-launcher-drop-background, color-mix(in srgb, var(--uui-color-focus, #3544b1) 8%, transparent));
        outline: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
        outline-offset: 2px;
      }
      .tile.drop-before::before,
      .tile.drop-after::after {
        content: '';
        position: absolute;
        top: 4px;
        bottom: 4px;
        border-left: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
      }
      .tile.drop-before::before {
        left: calc(var(--uui-size-space-3) / -2 - 1px);
      }
      .tile.drop-after::after {
        right: calc(var(--uui-size-space-3) / -2 - 1px);
      }
      /* The footer's place, which the remove pane takes over during a drag without changing its size:
         both sit in one grid cell, the footer alone decides how big that cell is, and it stays in the
         layout, only hidden, while the pane covers it. A pane with a height of its own grew the panel
         the moment a drag started and moved everything under the pointer. */
      /* One column exactly as wide as the panel, which the footer's contents shrink to fit. An auto
         column is never narrower than the footer's widest unbreakable content, and in a narrow theme
         that is the user's name at full length: Windows 98's footer grew past its panel, the name
         stopped truncating and the exit button ended up outside the panel, out of sight. */
      .foot {
        flex-shrink: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
      }
      .foot > .footer,
      .foot > .removepane {
        grid-area: 1 / 1;
        min-width: 0;
      }
      .foot.dragging > .footer {
        visibility: hidden;
      }
      /* Size containment is what keeps the pane out of the cell's sizing: it counts as empty, and is
         stretched to whatever the footer makes the cell. What does not fit is ellipsised, one line
         each for the title and the hint, rather than growing the pane; and a footer too short for
         both lines clips the hint below rather than the title above, which is what the safe
         centring is for. */
      .removepane {
        contain: size;
        overflow: hidden;
        display: flex;
        align-items: safe center;
        justify-content: center;
        gap: var(--uui-size-space-3);
        padding: 0 var(--uui-size-space-4);
        background: var(--umbradesktop-launcher-remove-background, color-mix(in srgb, var(--uui-color-danger, #d42054) 10%, transparent));
        border-top: var(--umbradesktop-launcher-remove-border, 2px dashed var(--uui-color-danger, #d42054));
        color: var(--umbradesktop-launcher-remove-text, var(--uui-color-danger, #d42054));
        font-weight: 700;
      }
      .removepane umb-icon {
        flex-shrink: 0;
      }
      .remove-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .remove-title,
      .remove-hint {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .removepane.drop {
        outline: var(--umbradesktop-launcher-drop-outline, 2px solid var(--uui-color-focus, #3544b1));
        outline-offset: -4px;
      }
      .removepane umb-icon {
        font-size: 20px;
      }
      .remove-hint {
        font-weight: 400;
        font-size: var(--uui-type-small-size);
      }
      /* The empty state: a line saying so, then Arrange and All apps side by side beneath it. */
      .empty {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-6, 24px);
        text-align: center;
      }
      .empty p {
        flex-basis: 100%;
        margin: 0;
      }
      .footer {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--uui-size-space-3);
        padding: var(--uui-size-space-3) var(--uui-size-space-4);
        background: var(--umbradesktop-launcher-card-background, var(--uui-color-surface));
        border-top: var(--umbradesktop-launcher-card-border, 1px solid var(--uui-color-border));
      }
      .user {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-3);
        min-width: 0;
        padding: var(--uui-size-space-2);
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        cursor: pointer;
        font-family: inherit;
      }
      .user:hover {
        background: var(
          --umbradesktop-launcher-hover-background,
          var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05))
        );
      }
      .user-name {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: calc(var(--uui-type-small-size) + 1px);
        transform: translateY(1px);
      }
      .actions {
        flex-shrink: 0;
        display: flex;
        gap: var(--uui-size-space-1);
      }
      .fbtn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--umbradesktop-launcher-text, var(--uui-color-text));
        cursor: pointer;
      }
      .fbtn:hover {
        background: var(
          --umbradesktop-launcher-hover-background,
          var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05))
        );
      }
      .fbtn:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .fbtn umb-icon {
        font-size: 18px;
      }
    `,
    drawerStyles,
    arrangeStyles,
  ];
}

export default UmbraDesktopLauncherElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-launcher': UmbraDesktopLauncherElement;
  }
}
