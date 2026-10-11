import { UMBRACOFFEE_STACK_BREAKPOINT } from './constants.js';
import { umbraCoffeeTerm } from './localize.js';
import { css, customElement, html, property, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** One minute in ms, the unit the countdown rounds to. */
const MINUTE_MS = 60_000;

/** Minutes in an hour. */
const HOUR_MINUTES = 60;

/** Minutes in a day. */
const DAY_MINUTES = 24 * HOUR_MINUTES;

/** What the countdown shows: whole days, then the hours and minutes left over. */
export interface UmbraCoffeeRemaining {
  /** Whole days. */
  days: number;
  /** Hours past the days, 0 to 23. */
  hours: number;
  /** Minutes past the hours, 0 to 59. */
  minutes: number;
}

/**
 * Split a time left into days, hours and minutes, **rounding up** to the minute, as the first version
 * did: "in 1 min" lasts until the start instead of reading zero a minute early. Anything at or past the
 * start is all zeros, never negative, for the minutes between the scheduled start and YouTube saying
 * the stream is live.
 * @param ms Milliseconds until the start.
 * @returns The three numbers.
 */
export function splitRemaining(ms: number): UmbraCoffeeRemaining {
  const total = Math.max(0, Math.ceil(ms / MINUTE_MS));
  return {
    days: Math.floor(total / DAY_MINUTES),
    hours: Math.floor((total % DAY_MINUTES) / HOUR_MINUTES),
    minutes: total % HOUR_MINUTES,
  };
}

/**
 * Zero-pad a number to two digits, the way a clock writes hours and minutes.
 * @param n The number.
 * @returns At least two digits.
 */
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The countdown's three blocks: days, hours and minutes to a start (design §5; drawn as the
 * 2026-10-01 mock's view C draws them).
 *
 * All three blocks are always drawn, zero included, because a block that appears and disappears as the
 * days run out moves everything beside it. It reads its colours from `currentColor`, so it takes
 * whatever ground the hero puts it on and needs no theme block of its own.
 *
 * It is a `role="timer"`, whose implicit live region is off: the number changes every minute, and a
 * screen reader announcing each change would talk over the stream. Its label carries the whole time
 * for whoever reaches it.
 */
@customElement('umbracoffee-countdown')
export class UmbraCoffeeCountdownElement extends UmbLitElement {
  /** Milliseconds until the start. The window computes it from its clock, so this element has no timer. */
  @property({ type: Number, attribute: false })
  remaining = 0;

  /**
   * The three blocks and the timer's spoken label.
   * @returns The template.
   */
  override render() {
    const { days, hours, minutes } = splitRemaining(this.remaining);
    const label = (key: string, fallback: string) => umbraCoffeeTerm(this.localize, key, fallback);
    const units = [
      { unit: 'days', value: String(days), label: label('umbraCoffeeDays', 'days') },
      { unit: 'hours', value: pad(hours), label: label('umbraCoffeeHours', 'hours') },
      { unit: 'minutes', value: pad(minutes), label: label('umbraCoffeeMinutes', 'minutes') },
    ];
    const spoken = units.map((u) => `${Number(u.value)} ${u.label}`).join(', ');
    return html`<div class="count" role="timer" aria-label=${spoken}>
      ${units.map((u) => html`<div data-unit=${u.unit}><b>${u.value}</b><span>${u.label}</span></div>`)}
    </div>`;
  }

  /**
   * The mock's countdown: three big numbers with their units under them, a hairline between each,
   * all drawn from the current text colour, so they sit on whatever ground the picture area has. The
   * sizes are the same under every theme.
   *
   * The numbers scale with the height of the picture area they sit in (`cqh`, which resolves against
   * the window's stage, a size container), so a window short enough to cap the picture still fits the
   * whole countdown in it rather than clipping it; at the opening size they are the mock's 64px. They
   * also shrink in a window narrow enough to stack, the same breakpoint the window uses.
   */
  static override styles = css`
    :host {
      display: inline-block;
    }

    .count {
      display: inline-flex;
    }

    .count div {
      min-width: 116px;
      padding: 0 20px;
      text-align: center;
    }

    .count div + div {
      box-shadow: inset 1px 0 0 0 color-mix(in srgb, currentColor 18%, transparent);
    }

    .count b {
      display: block;
      font-size: clamp(28px, 17cqh, 64px);
      font-weight: 900;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .count span {
      display: block;
      margin-top: 8px;
      font-size: 13px;
      opacity: 0.72;
    }

    @container umbracoffee (width < ${unsafeCSS(UMBRACOFFEE_STACK_BREAKPOINT)}px) {
      .count div {
        min-width: 88px;
        padding: 0 14px;
      }

      .count b {
        font-size: clamp(28px, 14cqh, 48px);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbracoffee-countdown': UmbraCoffeeCountdownElement;
  }
}
