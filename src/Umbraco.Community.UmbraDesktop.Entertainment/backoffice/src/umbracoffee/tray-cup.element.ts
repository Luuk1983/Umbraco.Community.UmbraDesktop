import { UMBRACOFFEE_APP_ALIAS, UMBRACOFFEE_LIVE_REMINDER_MS, UMBRACOFFEE_TRAY_ICON_SIZE } from './constants.js';
// Defines the reminder's element before the cup can raise one: the desktop toast draws a
// notification's own element only when its tag is already defined, and falls back to text otherwise.
import './reminder-notification.element.js';
import type { UmbraCoffeeReminderData } from './reminder-notification.element.js';
import {
  formatUmbraCoffeeDate,
  UMBRACOFFEE_TIME_OPTIONS,
  UMBRADESKTOP_SETTINGS_CONTEXT,
  type UmbraDesktopSettingsContextLike,
} from './desktop-format.js';
import { umbraCoffeeTerm } from './localize.js';
import { markReminded, readReminded, type ReminderStorageSource } from './reminder-record.js';
import {
  dueReminders,
  reminderKey,
  trayStateFor,
  viewFor,
  type UmbraCoffeeDueReminder,
  type UmbraCoffeeTrayState,
} from './schedule.js';
import {
  browserEnvironment,
  umbraCoffeeStore,
  type UmbraCoffeeStore,
  type UmbraCoffeeStoreEnvironment,
} from './store.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import type { UmbraCoffeeData } from './types.js';
import { css, customElement, html, property, state, unsafeCSS, type PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_NOTIFICATION_CONTEXT } from '@umbraco-cms/backoffice/notification';
import { coffeeIcon, coffeeIconStyles } from './coffee-icon.js';
import { installConsole } from './console.js';

// The console commands (`umbraCoffee.help()`), here because the cup loads with every desktop that
// has umbraCoffee switched on, so the commands are there before the window is ever opened.
installConsole();

/**
 * How often the cup's clock moves, in ms. Half a minute, as the window's countdown does: the tooltip
 * shows whole minutes, and a reminder falling due between two polls (ten minutes before the start
 * lands anywhere in a poll's interval) is then raised at most half a minute late.
 */
const TICK_MS = 30_000;

/**
 * The shortest a "soon" reminder stays up, in ms. It is timed to the start, so one first raised in
 * the minutes between the scheduled start and YouTube saying live would otherwise be gone before it
 * could be read, or be raised with no time at all.
 */
const MIN_SOON_REMINDER_MS = 60_000;

/**
 * The umbraCoffee cup in the tray (design §6.2), and the one place the reminders are raised (§6.3).
 *
 * The cup shows only while an episode is coming up or live (D6), and hides itself with `hidden`
 * otherwise, including before the first data and while offline, which is how a tray item leaves the tray
 * (`docs/developer/desktop-apps.md` §9.2). Clicking it opens the umbraCoffee app by alias.
 *
 * Reminders live here rather than in a service of their own because the switch that turns the cup
 * off must turn the reminders off too (D1, D8): switched off, this element is not in the tray at all,
 * so nothing here runs. And the tray item is the long-lived subscriber the guide describes (§9.4):
 * it is created with the desktop and kept until the desktop goes or the switch is turned off, which
 * is exactly how long reminders should be raised for.
 *
 * What is showing and what is due are `schedule.ts`'s decisions, from the store's latest data and
 * this element's clock, so the cup and the window agree on "is it upcoming?" and stale, aged or
 * offline data shows no cup and raises nothing (D4: a missed reminder, never a wrong one).
 *
 * Reminders are raised only from a tab the user can see. Every desktop tab has a cup, and a reminder
 * raised in a background tab would be recorded as shown without anyone seeing it, taking it from the
 * tab the user is actually looking at. A hidden tab's cup keeps its state and raises what is still
 * due when the user comes back to it.
 *
 * Across tabs the record is read and then written, with nothing in between to stop two visible tabs
 * doing the same at once, and that race is accepted. It needs two desktops visible at the same moment
 * (two windows side by side) that decide on the same tick, and the worst case is one reminder shown
 * twice, most likely on a machine waking from sleep, where every tab's clock catches up at once.
 * Browsers offer nothing lighter than Web Locks to close it, and a duplicate reminder does not
 * justify that.
 */
@customElement('umbracoffee-tray-cup')
export class UmbraCoffeeTrayCupElement extends UmbLitElement {
  /**
   * The store to read: the shared one, unless a test passes its own over a fixed data so nothing
   * reaches the network. Read when the cup connects, which is after a test has set it.
   */
  @property({ attribute: false })
  store: UmbraCoffeeStore = umbraCoffeeStore;

  /**
   * The timers and clock the cup's tick runs on, in the store's shape: the browser's, except for
   * whatever a test passes in their place, so a case can move the clock and see a reminder fall due.
   * Read when the cup connects.
   */
  @property({ attribute: false })
  environment: Partial<UmbraCoffeeStoreEnvironment> = {};

  /**
   * Where the reminder record is kept. Undefined means this browser's `localStorage`, which the
   * record looks up itself inside its guard; a test passes a map so it never touches the real one.
   */
  @property({ attribute: false })
  reminderStorage?: ReminderStorageSource;

  /** The store's latest data, with when it came. Undefined until the first. */
  @state()
  private _data?: UmbraCoffeeData;

  /**
   * The clock the cup's state is worked out against, epoch ms. A field rather than `Date.now()` in
   * the update, so it moves on {@link TICK_MS} and on each new data, and a re-render for any other
   * reason cannot quietly move it.
   */
  @state()
  private _now = 0;

  /**
   * The desktop's settings context, which says how the user wants the "soon" reminder's start time
   * written. Undefined outside the desktop; `desktop-format.ts` has the fallback.
   */
  #desktop?: UmbraDesktopSettingsContextLike;

  /** The host's tray context, for opening the app. Undefined outside the desktop. */
  #tray?: UmbraDesktopTrayContextLike;

  /**
   * Where reminders are raised: the notification context of the desktop's own document, since the
   * cup lives there, which is what makes the desktop toast draw the reminder's element (D15).
   */
  #notifications?: typeof UMB_NOTIFICATION_CONTEXT.TYPE;

  /**
   * Keys of the reminders this element has raised, beside the record in storage. The record is what
   * stops a reload or a second tab repeating a reminder; this is what stops the cup repeating one on
   * every tick when the record cannot be written, because blocked storage reads back empty each time.
   * On the element rather than in the module, so a desktop built again with storage blocked may raise
   * a reminder once more, which is the cost the record already accepts.
   */
  #raised = new Set<string>();

  /**
   * The "soon" reminder this cup raised, so raising "live" can close it. Only `close` is called on it;
   * Umbraco's handler, or nothing from a context that returns none.
   */
  #soon?: { close(): void };

  /** Ends the cup's subscription to the store, so switching it off stops its share of the polling. */
  #unsubscribe?: () => void;

  /** The tick's interval handle, cleared on disconnect so a cup that left the tray stops ticking. */
  #tick?: number;

  /** The timers and clock in use, fixed at connect so the interval is cleared on the timers that set it. */
  #env: UmbraCoffeeStoreEnvironment = browserEnvironment;

  /**
   * Asks for an update when the tab is shown or hidden, so a reminder held back while the tab was
   * hidden is raised as soon as the user comes back. An arrow field so the same function is added
   * and removed.
   */
  #onVisibilityChange = (): void => this.requestUpdate();

  /**
   * Consumes the three contexts the cup acts through: the tray's, the desktop's settings and the
   * notification context. The store needs nothing from the backoffice's session any more (it reads
   * two public files), so the cup no longer touches the auth context.
   *
   * The notification context arriving asks for an update, because a reminder that fell due before
   * it arrived was skipped and is still due. The desktop's settings context does not: the cup draws
   * no time, and the reminder's start time is written only as the reminder is raised.
   */
  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_TRAY_CONTEXT, (tray) => (this.#tray = tray));
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (desktop) => (this.#desktop = desktop ?? undefined));
    this.consumeContext(UMB_NOTIFICATION_CONTEXT, (notifications) => {
      this.#notifications = notifications;
      this.requestUpdate();
    });
  }

  /**
   * Hide at once, then subscribe to the store, start the clock and listen for the tab being shown.
   *
   * Hidden before anything else, because the first update is a microtask away and a tray item with
   * nothing to show must not take a place in the tray even for that long. Here rather than in the
   * constructor, where an element made by `createElement` may not set attributes.
   */
  override connectedCallback(): void {
    this.hidden = true;
    super.connectedCallback();
    const env = (this.#env = { ...browserEnvironment, ...this.environment });
    this._now = env.now();
    this.#unsubscribe = this.store.subscribe((data) => {
      this._data = data;
      this._now = env.now();
    });
    this.#tick = env.setInterval(() => (this._now = env.now()), TICK_MS);
    document.addEventListener('visibilitychange', this.#onVisibilityChange);
  }

  /**
   * Leave the store, stop the clock and stop listening for the tab, before `super`, in the order the
   * window uses: the cup is removed when the desktop goes or the switch is turned off (guide §9.4),
   * and the last subscriber leaving is what stops the desktop polling.
   */
  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (this.#tick !== undefined) this.#env.clearInterval(this.#tick);
    this.#tick = undefined;
    document.removeEventListener('visibilitychange', this.#onVisibilityChange);
    super.disconnectedCallback();
  }

  /**
   * Show or hide, and raise what has fallen due, before each render, since the data and the clock
   * are the only inputs to both and both are reactive.
   * @param changed What changed since the last update.
   */
  override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    this.#applyTrayState(trayStateFor(this._data, this._now));
    this.#remind();
  }

  /**
   * Put the state on the host: `hidden` for the tray, which watches that attribute and nothing else,
   * and `data-state`, which the render reads to draw the cup plain or steaming. Each is written only
   * when it changes, since the tray reorders on every change of `hidden` it hears about.
   * @param trayState The cup's state.
   */
  #applyTrayState(trayState: UmbraCoffeeTrayState): void {
    const hide = trayState === 'hidden';
    if (this.hidden !== hide) this.hidden = hide;
    if (this.dataset.state !== trayState) this.dataset.state = trayState;
  }

  /**
   * Raise each due reminder once, and record it before raising it, so nothing that runs while it is
   * being raised, an update the desktop's toast causes or a second tab reading the record, can find it
   * still due and raise it again. Skipped until the notification context is there, and while the
   * tab is hidden (see the class comment); the reminder stays due, and the context arriving or the
   * tab being shown asks for the update that raises it. The cross-tab race this leaves open is
   * accepted, for the reasons the class comment gives.
   */
  #remind(): void {
    const notifications = this.#notifications;
    if (!notifications || document.visibilityState !== 'visible') return;
    const shown = readReminded(this.reminderStorage);
    for (const key of this.#raised) shown.add(key);
    for (const due of dueReminders(this._data, this._now, shown)) {
      const key = reminderKey(due.episode.videoId, due.kind);
      this.#raised.add(key);
      markReminded(key, this.reminderStorage);
      // "Soon" is out of date once the episode is live, so raising "live" closes it, and the
      // desktop's toast goes with it (the desktop drops a toast whose original left the list).
      if (due.kind === 'live') {
        this.#soon?.close();
        this.#soon = undefined;
      }
      const handler = notifications.peek('default', {
        elementName: 'umbracoffee-reminder-notification',
        data: this.#reminderData(due),
        duration: this.#durationOf(due),
      });
      if (due.kind === 'soon') this.#soon = handler;
    }
  }

  /**
   * How long a reminder stays. Timed rather than staying until closed, because the original raised in
   * the desktop's document is hidden (the desktop draws its own toast from it), and a timed one clears
   * itself there. "Soon" lasts until the start, since after it the reminder is out of date, and never
   * less than {@link MIN_SOON_REMINDER_MS}; "live" lasts {@link UMBRACOFFEE_LIVE_REMINDER_MS}.
   * @param due The reminder.
   * @returns Milliseconds.
   */
  #durationOf(due: UmbraCoffeeDueReminder): number {
    if (due.kind === 'live') return UMBRACOFFEE_LIVE_REMINDER_MS;
    // The schedule only lets an upcoming episode with a readable start through, so this is a time.
    return Math.max(MIN_SOON_REMINDER_MS, Date.parse(due.episode.scheduledStart!) - this._now);
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
   * The reminder's data. `headline` and `message` carry the whole reminder in words, because they are
   * also what the desktop's scrollback lists and what a repeat is folded on; the element adds only the
   * buttons. Plain JSON, since the desktop copies it through JSON, which is also why the start time is
   * written into the message here, the way the desktop's clock writes it, rather than by the element.
   * @param due The reminder.
   * @returns The data.
   */
  #reminderData(due: UmbraCoffeeDueReminder): UmbraCoffeeReminderData {
    const { videoId, title } = due.episode;
    if (due.kind === 'live') {
      return {
        headline: this.#term('umbraCoffeeLiveHeadline', 'Grab a cuppa, umbraCoffee is live!'),
        message: title,
        kind: 'live',
        videoId,
        title,
      };
    }
    const at = formatUmbraCoffeeDate(
      this.#desktop,
      this.localize,
      new Date(due.episode.scheduledStart!),
      UMBRACOFFEE_TIME_OPTIONS,
    );
    return {
      headline: this.#term('umbraCoffeeSoonHeadline', 'Put the kettle on, umbraCoffee starts soon'),
      message: `${title}. ${this.#term('umbraCoffeeStartsAt', `Starts at ${at}`, at)}`,
      kind: 'soon',
      videoId,
      title,
      // ISO, for the toast's clock: the data crosses JSON, so a Date would not survive the copy.
      startsAt: new Date(due.episode.scheduledStart!).toISOString(),
    };
  }

  /**
   * The tooltip and the button's name: how long until it starts and what it is, or that it is live.
   * Empty while hidden, when nothing reads it.
   * @returns The label.
   */
  #label(): string {
    const view = viewFor(this._data, this._now);
    if (view.kind === 'live') {
      return this.#term('umbraCoffeeTrayLive', `umbraCoffee is live: ${view.episode.title}`, view.episode.title);
    }
    if (view.kind === 'upcoming') {
      const { minutesLeft, episode } = view;
      return this.#term(
        'umbraCoffeeTrayUpcoming',
        `umbraCoffee in ${minutesLeft} min: ${episode.title}`,
        minutesLeft,
        episode.title,
      );
    }
    return '';
  }

  /**
   * The cup: a button that opens the app, drawing the app's own icon, plain while the episode is
   * coming up and steaming while it is live (`coffee-icon.ts`, shared with the reminder). The state
   * is read from `data-state`, which {@link willUpdate} sets before every render.
   * @returns The template.
   */
  override render() {
    const label = this.#label();
    return html`<button
      type="button"
      class="cup"
      title=${label}
      aria-label=${label}
      @click=${() => this.#tray?.openApp(UMBRACOFFEE_APP_ALIAS)}>
      ${coffeeIcon(this.dataset.state === 'live')}
    </button>`;
  }

  /**
   * The cup as the clock's neighbour. It copies what the taskbar's base `.clock` rule declares: the
   * same `var(--uui-size-space-2)` side padding, `--uui-border-radius` corners and focus ring, and the
   * hover from the one taskbar token the clock's hover uses, `--umbradesktop-task-hover-background`.
   * The padding is copied, not shared: there is no token for it, so a theme that pads its own clock
   * differently leaves the cup on the base padding. The colour is inherited from the taskbar rather
   * than named, so a theme that colours its tray some other way is followed too.
   *
   * The host sets a plain `display`, never `!important`, so the tray's own `.tray > [hidden]` rule
   * can take it out (guide §9.2). It stretches to the tray's height so the hover covers the whole bar
   * height, as the clock's does.
   */
  static override styles = [
    coffeeIconStyles,
    css`
    :host {
      display: flex;
      align-self: stretch;
    }

    .cup {
      display: inline-flex;
      align-items: center;
      margin: 0;
      padding: 0 var(--uui-size-space-2);
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
      border-radius: var(--uui-border-radius);
    }

    .cup:hover {
      background: var(--umbradesktop-task-hover-background, rgba(255, 255, 255, 0.1));
    }

    .cup:focus-visible {
      outline: 2px solid var(--uui-color-focus);
      outline-offset: -2px;
    }

    svg.coffee {
      width: ${unsafeCSS(UMBRACOFFEE_TRAY_ICON_SIZE)}px;
      height: ${unsafeCSS(UMBRACOFFEE_TRAY_ICON_SIZE)}px;
    }
  `,
  ];
}

/**
 * The cup under the name the tray manifest's `element: () => import(...)` loader looks for, so the
 * host finds it without a default export.
 */
export { UmbraCoffeeTrayCupElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-tray-cup': UmbraCoffeeTrayCupElement;
  }
}
