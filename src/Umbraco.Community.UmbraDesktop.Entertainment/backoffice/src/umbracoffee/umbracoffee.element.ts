import '../media-player/control-bar.element.js';
import '../media-player/player.element.js';
import './chat.element.js';
import './countdown.element.js';
import './episode-list.element.js';
import './settings-dialog.element.js';
import { MEDIA_FRAME_MAX_HEIGHT_PROPERTY, MEDIA_MIN_HEIGHT_PX } from '../media-player/constants.js';
import { ENGINE_EVENTS, type PlayerEngine } from '../media-player/engine.js';
import { YouTubeEngine } from '../media-player/youtube-engine.js';
import {
  UMBRACOFFEE_FIELD_HEIGHT,
  UMBRACOFFEE_INFO,
  UMBRACOFFEE_INFO_RESERVED_HEIGHT,
  UMBRACOFFEE_INFO_SUMMARY_LINES,
  UMBRACOFFEE_LIST_MIN_HEIGHT,
  UMBRACOFFEE_MIN_CONTENT_SIZE,
  UMBRACOFFEE_NARROW_INFO,
  UMBRACOFFEE_NARROW_INFO_HEIGHT,
  UMBRACOFFEE_NARROW_SIDE_TOP_HEIGHT,
  UMBRACOFFEE_NARROW_SUMMARY_LINES,
  UMBRACOFFEE_NEXT_MAX_AGE_MS,
  UMBRACOFFEE_PANEL_WIDTH,
  UMBRACOFFEE_PLAYER_ASPECT,
  UMBRACOFFEE_PLAYER_BAR_HEIGHT,
  UMBRACOFFEE_STACK_BREAKPOINT,
  UMBRACOFFEE_TABS_HEIGHT,
  UMBRACOFFEE_THUMBNAIL_URL,
  UMBRACOFFEE_TRAY_ALIAS,
} from './constants.js';
import {
  formatUmbraCoffeeDate,
  UMBRACOFFEE_DATETIME_OPTIONS,
  UMBRACOFFEE_SHORT_DATETIME_OPTIONS,
  UMBRADESKTOP_SETTINGS_CONTEXT,
  type UmbraDesktopSettingsContextLike,
} from './desktop-format.js';
import type { UmbraCoffeeLeadRow } from './episode-list.element.js';
import { umbraCoffeeTerm } from './localize.js';
import { viewFor, type UmbraCoffeeView } from './schedule.js';
import { browserEnvironment, umbraCoffeeStore, type UmbraCoffeeStore, type UmbraCoffeeStoreEnvironment } from './store.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import type { UmbraCoffeeCurrent, UmbraCoffeeData, UmbraCoffeeEpisode } from './types.js';
import {
  css,
  customElement,
  html,
  nothing,
  property,
  state,
  unsafeCSS,
  type PropertyValues,
} from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { installConsole } from './console.js';

// The console commands, here as well as in the cup, for a desktop whose reminders are switched off
// and so has no cup. A second install keeps the first.
installConsole();

/**
 * How often the countdown's clock moves, in ms. Half a minute, because the countdown shows whole
 * minutes: a tick a second would re-render sixty times for one visible change, and a tick a minute
 * could show a number up to a minute late.
 */
const TICK_MS = 30_000;

/** One minute, in ms, for the bar's "Starts in 28 days". */
const MINUTE_MS = 60_000;

/** The attribute the desktop stamps on an app's element with the active theme's id (`docs/developer/desktop-apps.md` §5). */
const THEME_ATTRIBUTE = 'data-umbradesktop-theme';

/** How many rounds {@link settledWithin} waits at most, so a part that keeps re-rendering cannot hold it forever. */
const SETTLE_ROUNDS = 5;

/**
 * Resolves once every Lit element under a root, through nested shadow roots, has finished its
 * pending update: the player, and the control bar inside the player's own shadow root. Waits in
 * rounds, since one part's render can start another's, up to {@link SETTLE_ROUNDS}.
 * @param root Where to look; nothing to wait for when absent.
 * @returns A promise that never rejects.
 */
async function settledWithin(root: ShadowRoot | null): Promise<void> {
  for (let round = 0; round < SETTLE_ROUNDS && root; round++) {
    const pending: Array<Promise<unknown>> = [];
    const visit = (node: ParentNode) => {
      for (const element of node.querySelectorAll('*')) {
        const lit = element as Element & { isUpdatePending?: boolean; updateComplete?: Promise<unknown> };
        if (lit.isUpdatePending && lit.updateComplete) pending.push(lit.updateComplete.catch(() => undefined));
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(root);
    if (pending.length === 0) return;
    await Promise.all(pending);
  }
}

/** Which tab of the column is open while live. */
type PanelTab = 'chat' | 'episodes';

/** The look of the tag on the date line. */
type TagKind = 'live' | 'soon' | 'latest';

/** The icons the window draws itself, inline so they follow `currentColor` under every theme. */
const ICONS = {
  gear: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.4 1.8 3 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.5-1c-1.6.9-3.3-.9-2.4-2.4a1.7 1.7 0 0 0-1.1-2.6c-1.8-.4-1.8-3 0-3.4a1.7 1.7 0 0 0 1.1-2.5c-.9-1.6.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.5-1.1z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
  warn: html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.4 4.6a1.85 1.85 0 0 1 3.2 0l7.1 12.6a1.85 1.85 0 0 1-1.6 2.8H4.9a1.85 1.85 0 0 1-1.6-2.8z"></path><path d="M12 9.5v4"></path><circle class="dotfill" cx="12" cy="16.6" r=".4"></circle></svg>`,
  play: html`<svg class="solid" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z"></path></svg>`,
} as const;

/**
 * Whether the data is an answer the window can believe says "nothing else is live": the feed was
 * reachable, and either it says nothing is current (its normal state, whose `updatedAt` is not
 * refreshed while it is empty, so its age means nothing) or it says something and is fresh.
 *
 * This is the window's own test, for {@link UmbraCoffeeAppElement.leadFor}. The schedule's `trusted`
 * answers a different question, "may the cup and the reminders act on this?", and returns null for
 * an empty file too, which is why it cannot be used to decide a live stream has ended.
 * @param data The store's data, if any.
 * @param now Epoch ms.
 * @returns True when the data can end a live stream the window is showing.
 */
function answers(data: UmbraCoffeeData | undefined, now: number): boolean {
  if (!data || data.offline) return false;
  if (data.current === null) return true;
  return data.currentUpdatedAt !== undefined && now - data.currentUpdatedAt <= UMBRACOFFEE_NEXT_MAX_AGE_MS;
}

/**
 * The umbraCoffee window (v2 plan, addendum 2026-10-01 (2), and its mock): the player edge to edge
 * with the shared control bar under it and the episode on the window itself (title, a state tag and
 * the date, the guests, the summary), beside a column with the search and the episode list. While a
 * stream is on, the column has Chat and Episodes tabs and opens on Chat; while one is coming, a
 * countdown takes the picture's place. A gear opens the settings, where the Remind me switch is; while
 * the feed cannot be reached a warning sits beside the gear and says so in a tooltip.
 *
 * This element is layout and state. The parts are their own elements: the countdown, the episode
 * list, the chat and the settings dialog, and the picture and its control bar are the shared media
 * player. The player and the chat are YouTube's own embeds, so nothing of ours is drawn over the
 * video; everything else is drawn from the app tokens, so it follows the theme the way the games do.
 *
 * What to lead with is decided by `schedule.ts` for the whole desktop, from the store's data and the
 * clock, so an untrusted next-episode file shows no countdown here for the same reason the cup hides.
 * The element adds what is the user's own (an episode picked from the list, the open tab) and one rule
 * of its own: a live stream the window is showing stays until an answer it can believe says otherwise
 * (see {@link UmbraCoffeeAppElement.leadFor}). The way back from a picked episode to the stream or the
 * countdown is the list's first row, which is that episode.
 *
 * Nothing scrolls but the episode list. The column moves under the player in a window too narrow for
 * it beside a usable player, and the picture's height is capped at what the window has left once the
 * bar, the details and (when narrow) a row of the list have theirs, so a short window letterboxes the
 * picture instead of pushing the rest out of sight. Both are CSS, container queries and units on this
 * element's own box derived from `constants.ts`, so crossing a size takes no script and does not
 * reload the chat.
 */
@customElement('umbracoffee-app')
export class UmbraCoffeeAppElement extends UmbLitElement {
  /**
   * The store to read: the shared one, unless a test passes its own over fixed data so nothing
   * reaches the network. Read when the window connects, which is after a template has set it.
   */
  @property({ attribute: false })
  store: UmbraCoffeeStore = umbraCoffeeStore;

  /**
   * The timers and clock the countdown runs on, in the store's shape: the browser's, except for
   * whatever a test passes in their place, so a case can move the clock and see the minutes move.
   * Read when the window connects.
   */
  @property({ attribute: false })
  environment: Partial<UmbraCoffeeStoreEnvironment> = {};

  /**
   * The engine the shared player plays through. Left unset, the window makes a YouTube engine of its
   * own when it connects (which loads nothing until a video is), so it can follow whether the player
   * is playing; a test passes a fake so no case loads YouTube's script.
   */
  @property({ attribute: false })
  playerEngine?: PlayerEngine;

  /** The store's latest data. Undefined until the first answer. */
  @state()
  private _data?: UmbraCoffeeData;

  /**
   * The clock the view is worked out against, epoch ms. A field rather than `Date.now()` in
   * `render`, so the countdown moves on {@link TICK_MS} and on each new answer, and a re-render for
   * any other reason cannot quietly move it.
   */
  @state()
  private _now = 0;

  /**
   * An episode the user picked from the list, which plays in place of whatever leads. Undefined
   * means "follow the schedule", which is also what the list's first row returns to.
   */
  @state()
  private _picked?: string;

  /**
   * Whether the user has chosen what to watch in this window, by picking an episode or going back to
   * the stream. From then on the player starts at once, since they clicked to watch; until then it
   * waits, so opening the window never starts a video by itself.
   */
  @state()
  private _chosen = false;

  /** The tab the user chose while live. Undefined means "the natural one", which is Chat. */
  @state()
  private _tab?: PanelTab;

  /** Whether the desktop says reminders are on, from the tray context. False until it says. */
  @state()
  private _remind = false;

  /** Whether the player is playing, for the list's "Now playing" against "Paused". */
  @state()
  private _playing = false;

  /** Whether the offline warning's tooltip is open: on hover and on focus, closed by leaving or Escape. */
  @state()
  private _tip = false;

  /** Whether the settings dialog is open. */
  @state()
  private _settings = false;

  /**
   * This element's own theme id, copied onto the window's parts so their `:host([data-umbradesktop-theme])`
   * blocks can match it: an attribute on this element does not reach into their shadow roots by
   * itself. Undefined when there is none, which is "absent, not empty" as the guide asks.
   */
  @state()
  private _theme?: string;

  /** Ends this window's subscription to the store, so the last window closing stops the polling. */
  #unsubscribe?: () => void;

  /** The countdown's interval handle, cleared on disconnect so a closed window stops ticking. */
  #tick?: number;

  /** The timers and clock in use, fixed at connect so the interval is cleared on the timers that set it. */
  #env: UmbraCoffeeStoreEnvironment = browserEnvironment;

  /** Watches this element's theme attribute, so a theme change reaches the parts. */
  #themeObserver?: MutationObserver;

  /**
   * The engine the player is given: {@link playerEngine}, or one made here at connect. Kept for the
   * window's lifetime, so a player put back after a countdown reuses it.
   */
  #engine?: PlayerEngine;

  /** Follows the engine's state into {@link _playing}. */
  readonly #onEngineState = (): void => {
    this._playing = this.#engine?.state === 'playing';
  };

  /**
   * The live stream this window is showing, kept while later answers only distrust it. See
   * {@link leadFor}. Not reactive: it changes only while an update is being prepared.
   */
  #heldLive?: UmbraCoffeeCurrent;

  /**
   * The desktop's settings context, which says how the user wants times written. Undefined outside
   * the desktop; `desktop-format.ts` has the fallback.
   */
  #desktop?: UmbraDesktopSettingsContextLike;

  /**
   * The desktop's tray context, for the Remind me switch. Undefined outside the desktop.
   */
  #tray?: UmbraDesktopTrayContextLike;

  /** What the window leads with, worked out once per update in {@link willUpdate}. */
  #view: UmbraCoffeeView = { kind: 'empty' };

  /**
   * Watches the details' box, so the summary's clamp follows the room it has as the window is
   * resized or maximized. See {@link fitSummary}.
   */
  #infoObserver?: ResizeObserver;

  /**
   * Consume the desktop's two contexts. Consumed here rather than in {@link connectedCallback} so the
   * consumers are in place when the element connects.
   *
   * The settings context is for the start time and the episodes' dates, which it writes the way the
   * taskbar clock does; its arrival asks for an update, since what was drawn before it came was in the
   * backoffice language, and so does every change of the user's settings it announces.
   *
   * The tray context is for the Remind me switch: `trayItemEnabled` (optional, because an older
   * desktop lacks it) says whether it is on and follows Desktop settings live, `setTrayItemEnabled`
   * changes it. There is no session to consume: the store reads GitHub, not Umbraco.
   */
  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (desktop) => {
      this.#desktop = desktop ?? undefined;
      this.observe(desktop?.locale, () => this.requestUpdate(), '_umbraCoffeeLocale');
      this.requestUpdate();
    });
    this.consumeContext(UMBRADESKTOP_TRAY_CONTEXT, (tray) => {
      this.#tray = tray ?? undefined;
      const reading = tray?.trayItemEnabled?.(UMBRACOFFEE_TRAY_ALIAS);
      if (!reading) this._remind = false;
      this.observe(reading, (on) => (this._remind = !!on), '_umbraCoffeeRemind');
      this.requestUpdate();
    });
  }

  /**
   * Subscribe to the store, start the countdown's clock, start watching the theme attribute, and
   * listen to the player's engine.
   */
  override connectedCallback(): void {
    super.connectedCallback();
    const env = (this.#env = { ...browserEnvironment, ...this.environment });
    this._now = env.now();
    this.#unsubscribe = this.store.subscribe((data) => {
      this._data = data;
      this._now = env.now();
    });
    this.#tick = env.setInterval(() => (this._now = env.now()), TICK_MS);
    this._theme = this.getAttribute(THEME_ATTRIBUTE) ?? undefined;
    this.#themeObserver = new MutationObserver(() => (this._theme = this.getAttribute(THEME_ATTRIBUTE) ?? undefined));
    this.#themeObserver.observe(this, { attributes: true, attributeFilter: [THEME_ATTRIBUTE] });
    this.#engine ??= this.playerEngine ?? new YouTubeEngine();
    this.#engine.addEventListener(ENGINE_EVENTS.stateChange, this.#onEngineState);
    this.#onEngineState();
  }

  /**
   * Leave the store, stop the clock, stop watching the theme and the engine: closing the window
   * unmounts the element (guide §7), and the last subscriber leaving is what stops the desktop polling.
   */
  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (this.#tick !== undefined) this.#env.clearInterval(this.#tick);
    this.#tick = undefined;
    this.#themeObserver?.disconnect();
    this.#themeObserver = undefined;
    this.#engine?.removeEventListener(ENGINE_EVENTS.stateChange, this.#onEngineState);
    this.#infoObserver?.disconnect();
    this.#infoObserver = undefined;
    super.disconnectedCallback();
  }

  /**
   * After each render, fit the summary to the details again (the episode, its title's lines or its
   * guests may have changed without the box changing size) and make sure the box is watched. The
   * details are one element for the window's life, so they are observed once per connection.
   * @param changed What changed in this update.
   */
  override updated(changed: PropertyValues): void {
    super.updated(changed);
    const info = this.shadowRoot?.querySelector<HTMLElement>('.info');
    if (info && !this.#infoObserver) {
      this.#infoObserver = new ResizeObserver(() => this.fitSummary());
      this.#infoObserver.observe(info);
    }
    this.fitSummary();
    // Fit again once everything inside has rendered too. The fit above runs before the player and
    // its control bar have drawn, when the details are still taller than they will be. The observer
    // corrects that, but it only fires as a frame is drawn, which a page in a background tab never
    // does: CI's test pages showed the summary running 200px past the details (2026-10-11).
    void settledWithin(this.shadowRoot).then(() => this.fitSummary());
  }

  /**
   * Clamp the summary to the whole lines the details have room for under the title and the date
   * line, and drop it when there is not room for one.
   *
   * The details take what the picture leaves, which is any height at all: a fixed clamp of
   * {@link UMBRACOFFEE_INFO_SUMMARY_LINES} is right at the opening size and too many in a window
   * whose picture got taller, where the details' clip then cut the summary through a line at the
   * window's bottom edge (the owner's maximized window, 2026-10-01). CSS cannot count how many lines
   * fit under a title that wraps to one line or two, so this measures it: the room between the
   * summary's top and the details' bottom padding, in whole summary lines. A ResizeObserver runs
   * after layout and before paint, so the cut line is never drawn.
   *
   * In a narrow window the details are sized by their content and the narrow block's fixed clamp
   * wins over the property, so the measure comes out at that clamp and changes nothing.
   *
   * Protected rather than private only so the observer and {@link updated} can share it under a name
   * the class comment can link; nothing overrides it.
   */
  protected fitSummary(): void {
    const info = this.shadowRoot?.querySelector<HTMLElement>('.info');
    const summary = info?.querySelector<HTMLElement>('.summary');
    if (!info || !summary) return;
    summary.hidden = false;
    const bottom = info.getBoundingClientRect().bottom - parseFloat(getComputedStyle(info).paddingBottom);
    const lineHeight = parseFloat(getComputedStyle(summary).lineHeight) || UMBRACOFFEE_INFO.summaryLine;
    const lines = Math.max(0, Math.floor((bottom - summary.getBoundingClientRect().top + 0.5) / lineHeight));
    if (lines === 0) {
      summary.hidden = true;
      return;
    }
    summary.style.setProperty('--_summary-lines', String(lines));
  }

  /**
   * Work out what to lead with before each render, since the data and the clock are its only inputs
   * and both are reactive.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.#view = this.leadFor(this._data, this._now);
  }

  /**
   * What the window leads with: the schedule's view, except that a live stream the window is already
   * showing stays through answers that merely distrust it.
   *
   * The schedule drops a live episode it cannot vouch for, which is right for the cup and the
   * reminders (a missed reminder, never a wrong one) and wrong for someone watching: an unreachable
   * feed or a next-episode file gone stale would take the chat away and swap the stream for the latest
   * episode mid-watch. So the window keeps the stream until an answer it can believe (see
   * {@link answers}) says something else: another episode is current, or nothing is.
   *
   * Protected rather than private only so the class comment can link to it; nothing overrides it.
   * @param data The store's latest data, if any.
   * @param now Epoch ms.
   * @returns The view.
   */
  protected leadFor(data: UmbraCoffeeData | undefined, now: number): UmbraCoffeeView {
    const view = viewFor(data, now);
    if (view.kind === 'live') {
      this.#heldLive = view.episode;
      return view;
    }
    if (this.#heldLive && !answers(data, now)) return { kind: 'live', episode: this.#heldLive };
    this.#heldLive = undefined;
    return view;
  }

  /**
   * A term from this package's dictionary with its English fallback; `localize.ts` has the rule.
   * @param key The key under this package's area.
   * @param fallback The English, with any arguments already in it.
   * @param args The arguments for the dictionary's `%0%`, `%1%`.
   * @returns The text.
   */
  #term(key: string, fallback: string, ...args: Array<string | number>): string {
    return umbraCoffeeTerm(this.localize, key, fallback, ...args);
  }

  /**
   * A date or time the way the desktop's clock writes it, or in the backoffice language outside a
   * desktop that can say how; `desktop-format.ts` has the rule.
   * @param date The moment.
   * @param options What to show.
   * @returns The text.
   */
  #format(date: Date, options: Intl.DateTimeFormatOptions): string {
    return formatUmbraCoffeeDate(this.#desktop, this.localize, date, options);
  }

  /**
   * A moment the feed gave as text, or nothing when it cannot be read, since `Intl.DateTimeFormat`
   * throws on an invalid date and one bad row must not blank the window.
   * @param iso The feed's time.
   * @param options What to show.
   * @returns The formatted text, or an empty string.
   */
  #when(iso: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
    const date = new Date(iso ?? '');
    return Number.isNaN(date.getTime()) ? '' : this.#format(date, options);
  }

  /**
   * The feed's episode with an id.
   * @param videoId The id.
   * @returns The episode, or undefined when the feed does not list it (a live stream often is not there yet).
   */
  #episode(videoId: string | undefined): UmbraCoffeeEpisode | undefined {
    return videoId === undefined ? undefined : this._data?.episodes.find((e) => e.videoId === videoId);
  }

  /**
   * Play what the user chose.
   * @param videoId An episode from the list, or undefined to go back to what the schedule leads with,
   *   which also puts a live stream's column back on Chat.
   */
  #choose(videoId: string | undefined): void {
    this._picked = videoId;
    this._chosen = true;
    if (videoId === undefined) this._tab = undefined;
  }

  /**
   * Why the Remind me switch cannot act, or undefined when it can. It is the tray item's switch, so it
   * cannot while the feed is unreachable (the cup is hidden then, so a reminder would never come), nor
   * on a desktop too old to say what the switch is, nor outside a desktop.
   * @param offline Whether the feed is unreachable.
   * @returns The reason, for the dialog to show under the disabled switch.
   */
  #remindReason(offline: boolean): string | undefined {
    if (offline) return this.#term('umbraCoffeeRemindOffline', "Can't reach the umbraCoffee feed, so reminders are off until it is back.");
    if (this.#tray?.trayItemEnabled) return undefined;
    return this.#term('umbraCoffeeRemindersWhere', 'The tray cup and the reminders can be switched off under Taskbar in Desktop settings.');
  }

  /** Flip the Remind me switch through the desktop, which then announces the new value back to this element. */
  #toggleReminders(): void {
    this.#tray?.setTrayItemEnabled(UMBRACOFFEE_TRAY_ALIAS, !this._remind);
  }

  /** Close the settings and give focus back to the gear that opened them, so a keyboard user is where they were. */
  async #closeSettings(): Promise<void> {
    this._settings = false;
    await this.updateComplete;
    this.shadowRoot?.querySelector<HTMLButtonElement>('.gear')?.focus({ preventScroll: true });
  }

  /**
   * "Starts in 28 days", for the waiting control bar: the largest whole unit the time left has, in
   * the browser's own relative-time wording, so it is plural-correct in every language.
   * @param ms Milliseconds until the start.
   * @returns The text.
   */
  #startsIn(ms: number): string {
    const minutes = Math.max(0, Math.ceil(ms / MINUTE_MS));
    const relative =
      minutes >= 24 * 60
        ? this.localize.relativeTime(Math.floor(minutes / (24 * 60)), 'day')
        : minutes >= 60
          ? this.localize.relativeTime(Math.floor(minutes / 60), 'hour')
          : this.localize.relativeTime(minutes, 'minute');
    return this.#term('umbraCoffeeStartsRelative', `Starts ${relative}`, relative);
  }

  /**
   * The tools beside the search (or the tabs while live): the offline warning with its tooltip, and
   * the gear. Slotted into the list's top row, so they sit beside its field in both layouts.
   * @param offline Whether the feed is unreachable.
   * @returns The tools.
   */
  #tools(offline: boolean) {
    const asOf = this.#when(this._data?.episodesAsOf, { dateStyle: 'long' });
    const tip = asOf
      ? this.#term(
          'umbraCoffeeUnavailable',
          `Can't reach the umbraCoffee feed. Showing episodes up to ${asOf}. Reminders are off until it is back.`,
          asOf,
        )
      : this.#term(
          'umbraCoffeeUnavailableNoDate',
          "Can't reach the umbraCoffee feed. Showing the episodes that came with the package. Reminders are off until it is back.",
        );
    const settings = this.#term('umbraCoffeeSettings', 'Settings');
    return html`<div class="tools" slot="tools">
      ${offline
        ? html`<button
              type="button"
              class="ib warn"
              aria-label=${this.#term('umbraCoffeeFeedUnavailable', 'Feed unavailable')}
              aria-describedby="feed-tip"
              @mouseenter=${() => (this._tip = true)}
              @mouseleave=${() => (this._tip = false)}
              @focus=${() => (this._tip = true)}
              @blur=${() => (this._tip = false)}
              @keydown=${(event: KeyboardEvent) => event.key === 'Escape' && (this._tip = false)}
            >
              ${ICONS.warn}
            </button>
            <div class="tip" id="feed-tip" role="tooltip" ?hidden=${!this._tip}>${ICONS.warn}<p>${tip}</p></div>`
        : nothing}
      <button type="button" class="ib gear" aria-label=${settings} title=${settings} @click=${() => (this._settings = true)}>
        ${ICONS.gear}
      </button>
    </div>`;
  }

  /**
   * The countdown in the picture's place: what it counts to, the three numbers, and a way to watch the
   * latest episode meanwhile, over the latest episode's picture blurred into the ground.
   * @param view The upcoming view.
   * @returns The countdown.
   */
  #hero(view: Extract<UmbraCoffeeView, { kind: 'upcoming' }>) {
    const latest = this._data?.episodes[0];
    const note = latest ? [latest.title, this.#when(latest.published, { day: 'numeric', month: 'long' })].filter(Boolean).join(', ') : '';
    return html`<div class="hero">
      ${latest
        ? html`<img
            class="art"
            src=${`${UMBRACOFFEE_THUMBNAIL_URL}${encodeURIComponent(latest.videoId)}/hqdefault.jpg`}
            alt=""
            @error=${(event: Event) => ((event.target as HTMLElement).hidden = true)}
          />`
        : nothing}
      <div class="hero-in">
        <div class="hero-kicker">${this.#term('umbraCoffeeStartsIn', 'Starts in')}</div>
        <umbracoffee-countdown data-umbradesktop-theme=${this._theme ?? nothing} .remaining=${view.start.getTime() - this._now}></umbracoffee-countdown>
        <button type="button" class="watch-last" ?disabled=${!latest} @click=${() => latest && this.#choose(latest.videoId)}>
          ${ICONS.play}${this.#term('umbraCoffeeWatchLast', 'Watch the last episode')}
        </button>
        ${note ? html`<div class="hero-note">${note}</div>` : nothing}
      </div>
    </div>`;
  }

  /**
   * The guests, "With Matt Brailsford, Umbraco HQ and Lucy Smith", the names bold.
   * @param episode The episode.
   * @returns The line's content, or nothing when it names none.
   */
  #guests(episode: UmbraCoffeeEpisode | undefined) {
    const guests = (episode?.guests ?? []).filter((g) => g.name.trim() !== '');
    if (guests.length === 0) return nothing;
    const and = this.#term('umbraCoffeeAnd', 'and');
    return html`<span class="dot" aria-hidden="true">·</span
      ><span class="guests"
        >${this.#term('umbraCoffeeWith', 'With')}
        ${guests.map(
          (g, i) => html`${i > 0 ? ` ${and} ` : ''}<b>${g.name}</b>${g.affiliation ? html`<span class="aff">, ${g.affiliation}</span>` : ''}`,
        )}</span
      >`;
  }

  /**
   * The episode on the window itself: its title, the date line (a state tag, when, and the guests)
   * and the summary. A part the episode has nothing for is not drawn at all.
   * @param title The title.
   * @param tag The state tag, if any.
   * @param when When, formatted, or empty.
   * @param episode The archive's episode, for the guests and the summary, if it has one.
   * @returns The details.
   */
  #info(title: string, tag: { kind: TagKind; text: string } | undefined, when: string, episode: UmbraCoffeeEpisode | undefined) {
    const guests = this.#guests(episode);
    return html`<div class="info">
      <h1 class="ep-title">${title}</h1>
      ${tag || when || guests !== nothing
        ? html`<div class="meta">
            ${tag ? html`<span class="tag ${tag.kind}">${tag.kind === 'live' ? html`<i></i>` : nothing}${tag.text}</span>` : nothing}
            ${when ? html`<span class="when">${when}</span>` : nothing}${guests}
          </div>`
        : nothing}
      ${episode?.summary ? html`<p class="summary">${episode.summary}</p>` : nothing}
    </div>`;
  }

  /**
   * The column: the tabs and the chat while the window shows a live stream, and the episode list,
   * which is always the same element so its search survives the tabs coming and going. The list is
   * the Episodes tab's panel while there are tabs, and hidden behind Chat; the chat frame is drawn
   * only while the stream is what plays, so a chat the user left is not still streaming behind an
   * older episode.
   * @param liveVideo The live stream the window shows, or undefined.
   * @param current What the window shows, marked in the list.
   * @param lead The list's first row, if one is coming or on.
   * @param offline Whether the feed is unreachable.
   * @returns The column.
   */
  #side(liveVideo: string | undefined, current: string | undefined, lead: UmbraCoffeeLeadRow | undefined, offline: boolean) {
    const tabs = liveVideo !== undefined;
    const tab: PanelTab = this._tab ?? 'chat';
    const theme = this._theme ?? nothing;
    return html`<aside class="side">
      ${tabs
        ? html`<div class="tabs-top">
              <div class="tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  id="tab-chat"
                  class="tab"
                  aria-selected=${tab === 'chat' ? 'true' : 'false'}
                  aria-controls="pane-chat"
                  @click=${() => (this._tab = 'chat')}
                >
                  ${this.#term('umbraCoffeeChat', 'Chat')}<i class="tab-live" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  role="tab"
                  id="tab-episodes"
                  class="tab"
                  aria-selected=${tab === 'episodes' ? 'true' : 'false'}
                  aria-controls="pane-episodes"
                  @click=${() => (this._tab = 'episodes')}
                >
                  ${this.#term('umbraCoffeeEpisodes', 'Episodes')}
                </button>
              </div>
              ${this.#tools(offline)}
            </div>
            <div class="pane" role="tabpanel" id="pane-chat" aria-labelledby="tab-chat" ?hidden=${tab !== 'chat'}>
              <umbracoffee-chat data-umbradesktop-theme=${theme} video-id=${liveVideo}></umbracoffee-chat>
            </div>`
        : nothing}
      <umbracoffee-episode-list
        id="pane-episodes"
        role=${tabs ? 'tabpanel' : nothing}
        aria-labelledby=${tabs ? 'tab-episodes' : nothing}
        ?hidden=${tabs && tab === 'chat'}
        data-umbradesktop-theme=${theme}
        .episodes=${this._data?.episodes ?? []}
        .current=${current}
        .playing=${this._playing}
        .lead=${lead}
        .formatDate=${(iso: string) => this.#when(iso, { dateStyle: 'medium' })}
        @episode-selected=${(event: CustomEvent<string>) => this.#choose(event.detail)}
        @lead-selected=${() => this.#choose(undefined)}
        >${tabs ? nothing : this.#tools(offline)}</umbracoffee-episode-list
      >
    </aside>`;
  }

  /**
   * The whole window: the picture (the player, the countdown, or an empty ground while there is no
   * answer yet) with the control bar under it, the episode under that, the column, and the settings
   * dialog over all of it while open.
   * @returns The template.
   */
  override render() {
    const view = this.#view;
    const offline = !!this._data?.offline;
    const leadId = view.kind === 'live' || view.kind === 'latest' ? view.episode.videoId : undefined;
    const playing = this._picked ?? leadId;
    const liveVideo = view.kind === 'live' && playing === view.episode.videoId ? playing : undefined;
    const hero = playing === undefined && view.kind === 'upcoming' ? view : undefined;
    const theme = this._theme ?? nothing;

    let lead: UmbraCoffeeLeadRow | undefined;
    if (view.kind === 'upcoming') {
      lead = {
        kind: 'upcoming',
        videoId: view.episode.videoId,
        title: view.episode.title,
        when: this.#format(view.start, UMBRACOFFEE_SHORT_DATETIME_OPTIONS),
        day: this.#format(view.start, { day: 'numeric' }),
        month: this.#format(view.start, { month: 'short' }),
      };
    } else if (view.kind === 'live') {
      const started = this.#when(view.episode.actualStart, UMBRACOFFEE_SHORT_DATETIME_OPTIONS);
      lead = {
        kind: 'live',
        videoId: view.episode.videoId,
        title: view.episode.title,
        when: started ? this.#term('umbraCoffeeStartedAt', `Started ${started}`, started) : '',
      };
    }

    const episode = this.#episode(playing);
    let title = this.#term('umbraCoffee', 'umbraCoffee');
    let tag: { kind: TagKind; text: string } | undefined;
    let when = '';
    if (hero) {
      title = hero.episode.title;
      tag = { kind: 'soon', text: this.#term('umbraCoffeeUpcoming', 'Upcoming') };
      when = this.#format(hero.start, UMBRACOFFEE_DATETIME_OPTIONS);
    } else if (playing !== undefined) {
      title = (view.kind !== 'empty' && view.episode.videoId === playing ? view.episode.title : undefined) ?? episode?.title ?? '';
      if (liveVideo !== undefined && view.kind === 'live') {
        tag = { kind: 'live', text: this.#term('umbraCoffeeLive', 'Live') };
        const started = this.#when(view.episode.actualStart, UMBRACOFFEE_DATETIME_OPTIONS);
        when = started ? this.#term('umbraCoffeeStartedAt', `Started ${started}`, started) : '';
      } else {
        if (view.kind === 'latest' && view.episode.videoId === playing) tag = { kind: 'latest', text: this.#term('umbraCoffeeLatest', 'Latest episode') };
        when = this.#when(episode?.published, { dateStyle: 'full' });
      }
    }

    const stage =
      playing !== undefined
        ? html`<umbradesktop-media-player
            data-umbradesktop-theme=${theme}
            .videoId=${playing}
            ?autoplay=${this._chosen}
            .engine=${this.#engine}
          ></umbradesktop-media-player>`
        : html`${hero ? this.#hero(hero) : html`<div class="hero blank"></div>`}
            <umbradesktop-control-bar
              disabled
              data-umbradesktop-theme=${theme}
              .status=${hero ? this.#startsIn(hero.start.getTime() - this._now) : ''}
              .videoId=${hero ? hero.episode.videoId : ''}
            ></umbradesktop-control-bar>`;

    return html`<div class="app">
      <div class="main">
        <div class="stage">${stage}</div>
        ${this.#info(title, tag, when, hero ? undefined : episode)}
      </div>
      ${this.#side(liveVideo, hero ? hero.episode.videoId : playing, lead, offline)}
      ${this._settings
        ? html`<umbracoffee-settings
            .theme=${this._theme}
            .remind=${this._remind}
            .reason=${this.#remindReason(offline)}
            @umbracoffee-settings-close=${() => void this.#closeSettings()}
            @umbracoffee-remind-toggle=${() => this.#toggleReminders()}
          ></umbracoffee-settings>`
        : nothing}
    </div>`;
  }

  /**
   * One stylesheet for five themes: tokens first, then one paint-only refinement block per theme.
   *
   * Every colour, edge and radius is an app token read with the fallback the guide publishes (§4),
   * and every ground is `background`, never `background-color`, since a surface token may carry a
   * gradient. Lines are spread or inset shadows, not borders, so they cost no layout (guide §8).
   * Every size is a constant from `constants.ts`, and no refinement changes one: a theme changes
   * colours, gradients, bevels and radii only. `--_live` is this window's own token for the live red
   * and `--_hero` for the countdown's ground, since the contract has neither.
   *
   * The host is a named size container. Its width drives the breakpoint where the column moves under
   * the player, and its height (`100cqh`) the cap on the picture: everything else in the window has a
   * height from the constants, so the cap is the box less those, handed to the player through
   * `--umbradesktop-media-frame-max-height` and used by the countdown too. The grid is an inner
   * element because a container query styles a container's descendants, never the container. Size
   * containment means the host's own height cannot come from its content, which is right here: the
   * window body hands it an exact box. The minimum height guards the day a parent does not: a size
   * container under a parent of auto height is zero pixels tall.
   *
   * Nothing clips by scrolling. The host and the columns clip (`overflow: clip`, which unlike hidden
   * cannot be scrolled by focus or script either), and the list's rows are the one scroll area.
   */
  static override styles = css`
    :host {
      --_live: #d42054;
      --_hero: #141c3f;
      --_divider: var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      --_tab-mark: var(--umbradesktop-app-accent, var(--uui-color-selected));
      --_soon-bg: var(--umbradesktop-app-accent, var(--uui-color-selected));
      --_soon-text: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
      --_latest-bg: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      --_latest-text: var(--umbradesktop-app-text, var(--uui-color-text));
      container: umbracoffee / size;
      display: grid;
      grid-template: minmax(0, 1fr) / minmax(0, 1fr);
      box-sizing: border-box;
      height: 100%;
      min-height: ${unsafeCSS(UMBRACOFFEE_MIN_CONTENT_SIZE.h)}px;
      min-width: 0;
      overflow: clip;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-family: var(--umbradesktop-app-font, inherit);
      font-size: 14px;
      line-height: 22px;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    [hidden] {
      display: none !important;
    }

    button {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }

    button:disabled {
      cursor: not-allowed;
    }

    button:focus-visible,
    a:focus-visible {
      outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      outline-offset: -2px;
    }

    svg {
      width: 1em;
      height: 1em;
      flex: none;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    svg.solid,
    svg .dotfill {
      fill: currentColor;
      stroke: none;
    }

    /* The grid: the picture and the episode beside the column. The picture's cap is the box less the
       bar and the title and date line, which a short window keeps on screen. */
    .app {
      --_frame-max: calc(100cqh - ${unsafeCSS(UMBRACOFFEE_PLAYER_BAR_HEIGHT + UMBRACOFFEE_INFO_RESERVED_HEIGHT)}px);
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) ${unsafeCSS(UMBRACOFFEE_PANEL_WIDTH)}px;
      grid-template-rows: minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
      overflow: clip;
    }

    .main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      overflow: clip;
    }

    .stage {
      flex: none;
      ${unsafeCSS(MEDIA_FRAME_MAX_HEIGHT_PROPERTY)}: var(--_frame-max);
    }

    umbradesktop-media-player,
    umbradesktop-control-bar {
      display: block;
    }

    /* The countdown, in the picture's place at the picture's size, cap and floor included, so the
       window does not move when the stream starts. A size container itself, so the countdown's numbers
       can scale with its height. */
    .hero {
      container: umbracoffee-stage / size;
      position: relative;
      width: 100%;
      aspect-ratio: ${unsafeCSS(UMBRACOFFEE_PLAYER_ASPECT.w)} / ${unsafeCSS(UMBRACOFFEE_PLAYER_ASPECT.h)};
      min-height: ${unsafeCSS(MEDIA_MIN_HEIGHT_PX)}px;
      max-height: var(--_frame-max);
      overflow: clip;
      background: var(--_hero);
      color: #fff;
    }

    .hero.blank {
      background: #000;
    }

    .art {
      position: absolute;
      inset: -40px;
      width: calc(100% + 80px);
      height: calc(100% + 80px);
      object-fit: cover;
      filter: blur(26px) saturate(120%);
      opacity: 0.42;
    }

    .hero::after {
      content: '';
      position: absolute;
      inset: 0;
      background: radial-gradient(80% 90% at 50% 45%, color-mix(in srgb, var(--_hero) 55%, transparent), color-mix(in srgb, var(--_hero) 92%, transparent));
    }

    .hero-in {
      position: relative;
      z-index: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 12px 20px;
      text-align: center;
    }

    .hero-kicker {
      font-size: 12px;
      line-height: 16px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #f5c1bc;
    }

    umbracoffee-countdown {
      margin: 12px 0 24px;
    }

    .watch-last {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      height: ${unsafeCSS(UMBRACOFFEE_FIELD_HEIGHT)}px;
      padding: 0 18px;
      border: 0;
      border-radius: var(--umbradesktop-app-radius, 3px);
      background: #fff;
      color: #1b264f;
      font-weight: 700;
      white-space: nowrap;
    }

    .watch-last svg {
      font-size: 14px;
    }

    .watch-last:disabled {
      opacity: 0.55;
    }

    .hero-note {
      margin-top: 10px;
      font-size: 13px;
      line-height: 19px;
      opacity: 0.66;
    }

    /* The episode on the window: each line's height from constants.ts. It takes what is left under
       the bar, and the summary is clamped to the whole lines that fit there (fitSummary); the title
       and date line are what the cap keeps for it. */
    .info {
      flex: 1 1 auto;
      min-height: 0;
      overflow: clip;
      padding: ${unsafeCSS(UMBRACOFFEE_INFO.padTop)}px 24px ${unsafeCSS(UMBRACOFFEE_INFO.padBottom)}px;
      box-shadow: inset 0 1px 0 0 var(--_divider);
    }

    .ep-title {
      margin: 0;
      font-size: 21px;
      line-height: ${unsafeCSS(UMBRACOFFEE_INFO.title)}px;
      font-weight: 700;
      letter-spacing: -0.005em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0 8px;
      margin-top: ${unsafeCSS(UMBRACOFFEE_INFO.metaGap)}px;
      min-height: ${unsafeCSS(UMBRACOFFEE_INFO.meta)}px;
      font-size: 13px;
      line-height: ${unsafeCSS(UMBRACOFFEE_INFO.meta)}px;
      color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
    }

    .dot {
      opacity: 0.7;
    }

    .guests {
      min-width: 0;
    }

    .guests b {
      font-weight: 700;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
    }

    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex: none;
      height: ${unsafeCSS(UMBRACOFFEE_INFO.meta)}px;
      padding: 0 9px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      white-space: nowrap;
    }

    .tag.live {
      background: var(--_live);
      color: #fff;
      letter-spacing: 0.02em;
    }

    .tag.live i {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #fff;
    }

    .tag.soon {
      background: var(--_soon-bg);
      color: var(--_soon-text);
    }

    .tag.latest {
      background: var(--_latest-bg);
      color: var(--_latest-text);
      box-shadow: inset 0 0 0 1px var(--_divider);
    }

    .summary {
      margin: ${unsafeCSS(UMBRACOFFEE_INFO.summaryGap)}px 0 0;
      max-width: 66ch;
      font-size: 14px;
      line-height: ${unsafeCSS(UMBRACOFFEE_INFO.summaryLine)}px;
      display: -webkit-box;
      /* The lines that fit, measured by fitSummary; the opening size's count until it has run. */
      -webkit-line-clamp: var(--_summary-lines, ${unsafeCSS(UMBRACOFFEE_INFO_SUMMARY_LINES)});
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* The column: a hairline on its left drawn as an inset shadow. */
    .side {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: var(--umbradesktop-app-surface, var(--uui-color-surface));
      box-shadow: inset 1px 0 0 0 var(--_divider);
    }

    umbracoffee-episode-list,
    .pane {
      flex: 1;
      min-height: 0;
    }

    umbracoffee-chat {
      height: 100%;
    }

    .tabs-top {
      flex: none;
      display: flex;
      align-items: center;
      gap: 3px;
      height: ${unsafeCSS(UMBRACOFFEE_TABS_HEIGHT)}px;
      padding: 0 9px 0 6px;
      box-shadow:
        inset 1px 0 0 0 var(--_divider),
        inset 0 -1px 0 0 var(--_divider);
    }

    .tabs {
      flex: 1;
      display: flex;
      align-self: stretch;
    }

    .tab {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 15px;
      border: 0;
      background: none;
      font-size: 14px;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
    }

    .tab[aria-selected='true'] {
      font-weight: 700;
    }

    .tab[aria-selected='true']::after {
      content: '';
      position: absolute;
      left: 7px;
      right: 7px;
      bottom: 0;
      height: 4px;
      border-radius: 3px 3px 0 0;
      background: var(--_tab-mark);
    }

    .tab-live {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--_live);
    }

    .tools {
      position: relative;
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .ib {
      display: grid;
      place-items: center;
      flex: none;
      width: ${unsafeCSS(UMBRACOFFEE_FIELD_HEIGHT)}px;
      height: ${unsafeCSS(UMBRACOFFEE_FIELD_HEIGHT)}px;
      padding: 0;
      border: 0;
      border-radius: var(--umbradesktop-app-radius, 3px);
      background: transparent;
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      font-size: 19px;
    }

    .ib:hover,
    .warn[aria-describedby]:focus-visible {
      background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    }

    .warn {
      color: #a17700;
    }

    /* The offline tooltip, under the warning, its arrow pointing at it. */
    .tip {
      position: absolute;
      z-index: 10;
      top: calc(100% + 9px);
      right: -3px;
      display: flex;
      gap: 10px;
      width: 308px;
      padding: 13px 16px 13px 14px;
      background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface));
      color: var(--umbradesktop-app-text, var(--uui-color-text));
      border: 1px solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-radius: var(--umbradesktop-app-radius, 3px);
      box-shadow:
        0 6px 16px rgba(0, 0, 0, 0.12),
        0 0 2px rgba(0, 0, 0, 0.1);
      font-size: 13px;
      line-height: 19px;
      text-align: start;
    }

    .tip::before {
      content: '';
      position: absolute;
      top: -6px;
      right: 49px;
      width: 10px;
      height: 10px;
      background: inherit;
      border-left: 1px solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      border-top: 1px solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
      transform: rotate(45deg);
    }

    .tip p {
      margin: 0;
    }

    .tip svg {
      font-size: 18px;
      margin-top: 1px;
      color: #a17700;
    }

    /* ---- Narrow: the list under the episode, still the only thing that scrolls. The cap now also
       keeps the narrow details, the search row and one row of the list on screen. ---- */
    @container umbracoffee (width < ${unsafeCSS(UMBRACOFFEE_STACK_BREAKPOINT)}px) {
      .app {
        --_frame-max: calc(
          100cqh -
            ${unsafeCSS(
              UMBRACOFFEE_PLAYER_BAR_HEIGHT +
                UMBRACOFFEE_NARROW_INFO_HEIGHT +
                UMBRACOFFEE_NARROW_SIDE_TOP_HEIGHT +
                UMBRACOFFEE_LIST_MIN_HEIGHT,
            )}px
        );
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
      }

      .info {
        flex: none;
        padding: ${unsafeCSS(UMBRACOFFEE_NARROW_INFO.pad)}px 18px;
      }

      .ep-title {
        font-size: 18px;
        line-height: ${unsafeCSS(UMBRACOFFEE_NARROW_INFO.title)}px;
        -webkit-line-clamp: 1;
      }

      .meta {
        flex-wrap: nowrap;
        overflow: clip; /* not a scroll container: see .ep-d in episode-list */
        white-space: nowrap;
      }

      .guests {
        overflow: clip; /* not a scroll container: see .ep-d in episode-list */
        text-overflow: ellipsis;
      }

      .summary {
        margin-top: ${unsafeCSS(UMBRACOFFEE_NARROW_INFO.summaryGap)}px;
        -webkit-line-clamp: ${unsafeCSS(UMBRACOFFEE_NARROW_SUMMARY_LINES)};
      }

      .side,
      .tabs-top {
        box-shadow: inset 0 1px 0 0 var(--_divider);
      }

      .tabs-top {
        box-shadow:
          inset 0 1px 0 0 var(--_divider),
          inset 0 -1px 0 0 var(--_divider);
      }

      /* Above the warning rather than under it, where a short list has no room for it. */
      .tip {
        top: auto;
        bottom: calc(100% + 9px);
      }

      .tip::before {
        top: auto;
        bottom: -6px;
        transform: rotate(225deg);
      }
    }

    /* ---- Theme refinements: paint only, never a size ---- */

    /* Umbraco: Umbraco 17's own values, the light pink current mark, navy interactive. */
    :host([data-umbradesktop-theme='umbraco']) {
      --_live: var(--uui-color-danger, #d42054);
      --_divider: var(--uui-color-divider, #e9e9eb);
      --_tab-mark: var(--uui-color-current, #f5c1bc);
      --_soon-bg: var(--uui-color-selected, #283a97);
      --_soon-text: #fff;
      --_latest-bg: #f7f7f8;
      --_latest-text: #25358b;
    }
    :host([data-umbradesktop-theme='umbraco']) .ib,
    :host([data-umbradesktop-theme='umbraco']) .tab {
      color: var(--uui-color-interactive, #1b264f);
    }

    /* Umbraco 4: Verdana's grey-beige, bevelled gradient faces and the v4 blue. */
    :host([data-umbradesktop-theme='umbraco4']) {
      --_live: #b23a2d;
      --_hero: #1f3f6b;
      --_divider: #b4afa4;
      --_tab-mark: #7ba7d4;
      --_soon-bg: #1f4e8c;
      --_soon-text: #fff;
    }
    :host([data-umbradesktop-theme='umbraco4']) .tabs-top {
      background: linear-gradient(180deg, #f7f6f2 0%, #ebe8e2 100%);
    }
    :host([data-umbradesktop-theme='umbraco4']) .ib {
      border-radius: 2px;
      background: linear-gradient(180deg, #fbfaf7 0%, #f1efea 48%, #ddd9d0 100%);
      box-shadow:
        inset 0 0 0 1px #9d988e,
        inset 0 2px 0 -1px #fff;
    }
    :host([data-umbradesktop-theme='umbraco4']) .tag {
      border-radius: 2px;
    }

    /* macOS: a sidebar-grey column and quiet glyph buttons. */
    :host([data-umbradesktop-theme='macos']) {
      --_live: #d70015;
      --_hero: #1c1c1e;
    }
    :host([data-umbradesktop-theme='macos']) .side {
      background: color-mix(in srgb, var(--umbradesktop-app-text, #1d1d1f) 4%, var(--umbradesktop-app-surface, #fff));
    }
    :host([data-umbradesktop-theme='macos']) .ib {
      border-radius: 6px;
    }
    :host([data-umbradesktop-theme='macos']) .tag {
      border-radius: 5px;
    }

    /* Windows 11: Mica, the accent tab mark and square-ish tags. Tokens only, so light on a light
       backoffice and dark on a dark one. */
    :host([data-umbradesktop-theme='win11']) {
      --_live: #c42b1c;
      --_hero: #0f2f6e;
    }
    :host([data-umbradesktop-theme='win11']) .ib {
      border-radius: 4px;
    }
    :host([data-umbradesktop-theme='win11']) .tag {
      border-radius: 4px;
    }

    /* Windows 98: silver, raised buttons and tabs, a navy countdown ground. */
    :host([data-umbradesktop-theme='win98']) {
      --_live: #800000;
      --_hero: #000080;
      --_divider: #808080;
      --_tab-mark: #000080;
    }
    :host([data-umbradesktop-theme='win98']) .ib,
    :host([data-umbradesktop-theme='win98']) .watch-last {
      border-radius: 0;
      background: #c0c0c0;
      color: #000;
      box-shadow:
        inset -1px -1px #000,
        inset 1px 1px #fff,
        inset -2px -2px #808080,
        inset 2px 2px #dfdfdf;
    }
    :host([data-umbradesktop-theme='win98']) .warn {
      color: #000;
    }
    :host([data-umbradesktop-theme='win98']) .tag,
    :host([data-umbradesktop-theme='win98']) .tip,
    :host([data-umbradesktop-theme='win98']) .tab[aria-selected='true']::after {
      border-radius: 0;
    }
    :host([data-umbradesktop-theme='win98']) .tip {
      background: #ffffe1;
      color: #000;
      border-color: #000;
    }
  `;
}

/**
 * The window under the name the app manifest's `element: () => import(...)` loader looks for, so the
 * host finds it without a default export.
 */
export { UmbraCoffeeAppElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-app': UmbraCoffeeAppElement;
  }
}
