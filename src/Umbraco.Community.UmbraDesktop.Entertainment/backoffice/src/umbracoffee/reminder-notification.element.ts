import {
  UMBRACOFFEE_APP_ALIAS,
  UMBRACOFFEE_REMINDER_BADGE_SIZE,
  UMBRACOFFEE_REMINDER_ICON_SIZE,
  UMBRACOFFEE_TRAY_ALIAS,
} from './constants.js';
import { formatClock } from '../media-player/time.js';
import { coffeeIcon, coffeeIconStyles } from './coffee-icon.js';
import type { UmbraCoffeeReminderKind } from './schedule.js';
import { umbraCoffeeTerm } from './localize.js';
import { UMBRADESKTOP_TRAY_CONTEXT, type UmbraDesktopTrayContextLike } from './tray-context.js';
import { css, customElement, html, nothing, property, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * What the cup raises a reminder with, and so what the desktop toast hands back as `data`.
 *
 * Plain JSON on purpose: the toast copies it through JSON (`docs/developer/desktop-apps.md` §9.9), so it holds
 * values, never functions. `headline` and `message` carry the whole reminder in words, because they
 * are what the notification history lists and what a repeat is folded on. The toast draws its own
 * words from `kind`, `title` and `startsAt` instead (owner, 2026-10-11), so those two are optional:
 * an older copy without them still draws, naming the episode from `message`.
 */
export interface UmbraCoffeeReminderData {
  /** "umbraCoffee starts soon" or "umbraCoffee is live", already localised. */
  headline: string;
  /** The episode's title, and for "soon" the time it starts, already localised. */
  message: string;
  /** Which of the two reminders this is. */
  kind: UmbraCoffeeReminderKind;
  /** The episode it is about. Carried for completeness; Watch does not need it (see the class comment). */
  videoId: string;
  /** The episode's title alone, for the toast's own words. */
  title?: string;
  /** For "soon": the scheduled start, ISO, which the toast's clock counts down to. */
  startsAt?: string;
}

/**
 * The part of the handler the desktop toast gives a notification's element that this one calls.
 * The toast also sets `key`, `color`, `duration` and `onClose()` (guide §9.9); nothing here needs
 * them, so they are left out of the type rather than promised.
 */
export interface UmbraCoffeeReminderHandler {
  /** Takes the toast down. */
  close(): void;
}

/**
 * A reminder, drawn on the desktop toast (design D15) with its two buttons: Watch, and Stop reminding
 * me, which switches the tray item off exactly as its switch in Desktop settings does (D8). That
 * switch is the cup's too, so the cup goes with the reminders (D1).
 *
 * Watch opens the app and nothing more. There is no payload to open it with (D11): the window works
 * out what to lead with from the store, which is the live stream or the countdown whenever a reminder
 * is up. `openApp` is the launcher's own open, and umbraCoffee allows one window at a time, so Watch
 * opens that window leading with the stream when none is open, and otherwise brings the open one to
 * the front as it is: a window where the user picked an old episode from the list stays on it, with
 * its Back to the live stream button one click away.
 *
 * The buttons are drawn only once the tray context has arrived, which is only inside the desktop.
 * Outside it they would do nothing, and a Stop reminding me that switched nothing off would leave the
 * user believing the reminders had stopped, so there the reminder is its text alone.
 *
 * The element can be made more than once for the same notification: the desktop toast makes one,
 * and clicking the entry in the scrollback shows it again as a new toast with a new element. So
 * everything it draws comes from {@link data}, and nothing is kept on the element that the next one
 * would need.
 */
@customElement('umbracoffee-reminder-notification')
export class UmbraCoffeeReminderNotificationElement extends UmbLitElement {
  /**
   * What the reminder was raised with, set by the desktop toast as a JSON copy, as Umbraco's own
   * container sets `data` on a notification layout. Read defensively, since a copy is whatever it is.
   */
  @property({ attribute: false })
  data?: Partial<UmbraCoffeeReminderData>;

  /**
   * The clock the countdown reads, epoch ms: the browser's, unless a test passes one it can move.
   * Read on each tick rather than kept, so a reminder shown again from the history counts from now.
   */
  @property({ attribute: false })
  now: () => number = () => Date.now();

  /** The countdown's interval, running while connected. One second, since the clock shows seconds. */
  #tick?: number;

  /** Set once by the desktop toast when it makes the element; closing it takes the toast down. */
  @property({ attribute: false })
  notificationHandler?: UmbraCoffeeReminderHandler;

  /**
   * The host's tray context, which both buttons call. Undefined outside the desktop, where there is
   * no provider, and then no buttons are drawn (see the class comment). Reactive, so the buttons
   * appear when it arrives.
   */
  @state()
  private _tray?: UmbraDesktopTrayContextLike;

  /** Consumes the tray context, which the desktop provides above its toasts. */
  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_TRAY_CONTEXT, (tray) => (this._tray = tray));
  }

  /** Start the clock's tick: a re-render a second, which reads {@link now} afresh. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.#tick = window.setInterval(() => this.requestUpdate(), 1000);
  }

  /** Stop the tick, so a closed toast leaves no timer behind. */
  override disconnectedCallback(): void {
    if (this.#tick !== undefined) window.clearInterval(this.#tick);
    this.#tick = undefined;
    super.disconnectedCallback();
  }

  /**
   * A term from this package's dictionary with its English fallback; `localize.ts` has the rule.
   * @param key The key under this package's area.
   * @param fallback The English.
   * @returns The text.
   */
  #term(key: string, fallback: string): string {
    return umbraCoffeeTerm(this.localize, key, fallback);
  }

  /**
   * One field of {@link data} as text, or nothing when the copy does not carry a string there, so a
   * malformed copy draws an empty line rather than "undefined" or "[object Object]".
   * @param value The field.
   * @returns The text.
   */
  #text(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  /** Open the app (see the class comment for what that opens) and take the reminder down. */
  #watch(): void {
    this._tray?.openApp(UMBRACOFFEE_APP_ALIAS);
    this.notificationHandler?.close();
  }

  /** Switch the cup and the reminders off, and take the reminder down. */
  #stop(): void {
    this._tray?.setTrayItemEnabled(UMBRACOFFEE_TRAY_ALIAS, false);
    this.notificationHandler?.close();
  }

  /**
   * The countdown for "soon": minutes and seconds to the start, or "Starting now" once it has passed
   * and YouTube has not yet said live. Nothing when the copy carries no readable start.
   * @returns The clock, or nothing.
   */
  #clock() {
    const start = Date.parse(this.#text(this.data?.startsAt));
    if (Number.isNaN(start)) return nothing;
    const left = (start - this.now()) / 1000;
    if (left <= 0) return html`<span class="clock now">${this.#term('umbraCoffeeStartingNow', 'Starting now')}</span>`;
    return html`<span class="clock" role="timer"
      ><b>${formatClock(Math.ceil(left))}</b
      ><small>${this.#term('umbraCoffeeClockMin', 'min')} ${this.#term('umbraCoffeeClockSec', 'sec')}</small></span
    >`;
  }

  /**
   * The cup badge, "umbraCoffee", the line in the show's own voice and the episode, then the clock
   * or "On air" on the right, and, inside the desktop, the two buttons (owner, 2026-10-11, mock round
   * 2, option 1). The words come from `kind` and `title`, not from the headline, which is the
   * history's sentence.
   * @returns The template.
   */
  override render() {
    const live = this.data?.kind === 'live';
    const title = this.#text(this.data?.title) || this.#text(this.data?.message);
    return html`
      <div class="row">
        <span class="badge ${live ? 'live' : ''}">${coffeeIcon(live)}</span>
        <div class="words">
          <span class="kicker">${this.#term('umbraCoffee', 'umbraCoffee')}</span>
          <strong class="lead"
            >${live ? this.#term('umbraCoffeeToastLive', 'Grab a cuppa!') : this.#term('umbraCoffeeToastSoon', 'Put the kettle on')}</strong
          >
          <span class="title">${title}</span>
        </div>
        ${live ? html`<span class="onair"><i></i>${this.#term('umbraCoffeeOnAir', 'On air')}</span>` : this.#clock()}
      </div>
      ${this._tray
        ? html`<div class="actions">
            <button type="button" class="watch ${live ? 'live' : ''}" @click=${this.#watch}>
              ${live ? this.#term('umbraCoffeeWatchNow', 'Watch now') : this.#term('umbraCoffeeWatch', 'Watch')}
            </button>
            <button type="button" class="stop" @click=${this.#stop}>
              ${this.#term('umbraCoffeeStopReminding', 'Stop reminding me')}
            </button>
          </div>`
        : nothing}
    `;
  }

  /**
   * Themed by the toast, without knowing any theme: the toast gives its own element its text colour
   * and font, and the buttons draw from `currentColor`, so they read on every toast surface the five
   * themes paint. Native buttons rather than `uui-button`, whose Umbraco look would sit on a Windows 98
   * toast as a stranger. Watch is the one to press, so it is the bolder of the two.
   */
  static override styles = [
    coffeeIconStyles,
    css`
    /* The cup in its badge beside the words, the clock or "On air" on the right, the buttons under.
       The badge and the live colour are umbraCoffee's own, the same on every theme; the words and the
       buttons take the toast's colours, as the desktop paints it. */
    :host {
      display: grid;
      gap: var(--uui-size-space-3);
      min-width: 0;
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--uui-size-space-3);
      min-width: 0;
    }

    .badge {
      flex: none;
      display: grid;
      place-items: center;
      width: ${unsafeCSS(UMBRACOFFEE_REMINDER_BADGE_SIZE)}px;
      height: ${unsafeCSS(UMBRACOFFEE_REMINDER_BADGE_SIZE)}px;
      border-radius: 50%;
      color: #fff;
      background: radial-gradient(120% 120% at 20% 10%, #3544b1, #1b264f);
    }

    .badge.live {
      background: radial-gradient(120% 120% at 20% 10%, #ef4b7d, #a3123f);
    }

    svg.coffee {
      width: ${unsafeCSS(UMBRACOFFEE_REMINDER_ICON_SIZE)}px;
      height: ${unsafeCSS(UMBRACOFFEE_REMINDER_ICON_SIZE)}px;
    }

    .words {
      flex: 1;
      display: grid;
      min-width: 0;
      line-height: 1.3;
    }

    .kicker {
      font-size: 0.85em;
      opacity: 0.75;
    }

    .lead {
      font-size: 1.15em;
      font-weight: 900;
    }

    .title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      opacity: 0.8;
    }

    .clock {
      flex: none;
      display: grid;
      justify-items: center;
      line-height: 1;
    }

    .clock b {
      font-size: 2em;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
    }

    .clock small {
      font-size: 0.8em;
      opacity: 0.7;
      word-spacing: 0.5em;
    }

    .clock.now,
    .onair {
      font-weight: 900;
    }

    .onair {
      flex: none;
      display: flex;
      align-items: center;
      gap: 6px;
      color: #d42054;
    }

    .onair i {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 20%, transparent);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--uui-size-space-2);
      margin-top: var(--uui-size-space-2);
    }

    button {
      padding: 2px 10px;
      font: inherit;
      color: inherit;
      background: none;
      border: 1px solid currentColor;
      border-radius: var(--uui-border-radius);
      cursor: pointer;
    }

    .watch {
      font-weight: 700;
    }

    .watch.live {
      color: #fff;
      background: #d42054;
      border-color: #d42054;
    }

    button:hover {
      background: color-mix(in srgb, currentColor 12%, transparent);
    }

    button:focus-visible {
      outline: 2px solid var(--uui-color-focus);
      outline-offset: 1px;
    }
  `,
  ];
}

/**
 * The element as the module's default export, for a loader that asks for one. Nothing loads it that
 * way today: the cup imports this module for its side effect, defining the tag before a reminder is
 * raised.
 */
export default UmbraCoffeeReminderNotificationElement;

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-reminder-notification': UmbraCoffeeReminderNotificationElement;
  }
}
