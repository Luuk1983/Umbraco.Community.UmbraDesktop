import { accessoryStyles } from '../shared/styles.js';
import {
  CLOCK_DATE_HEIGHT_PX,
  CLOCK_MIN_FACE_PX,
  CLOCK_PADDING_PX,
  CLOCK_TIME_HEIGHT_PX,
} from './constants.js';
import { handAngles, msUntilNextSecond } from './hands.js';
import { css, customElement, html, property, state, svg } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The face is drawn in a 200-unit box centred on the origin, so a hand is a line from `0,0` and a
 * mark is a line at a radius. The SVG scales to whatever box the window gives it; these are units of
 * that box, not pixels.
 */
const RADIUS = 96;

/** How far in from the rim each kind of mark starts, and how long each hand is, in face units. */
const GEOMETRY = {
  hourMark: 14,
  minuteMark: 6,
  hourHand: 50,
  minuteHand: 74,
  secondHand: 82,
} as const;

/**
 * Clock, as a self-contained UmbraDesktop app: an analogue face, the time in words under it, and the
 * date.
 *
 * The time is formatted by `this.localize.date`, so it follows the backoffice culture the user has
 * chosen, the same culture every other date in the backoffice uses. It does **not** follow the
 * desktop's own 12/24-hour setting, and cannot: that setting lives in the host package's own context,
 * and a separate package has no route to it (`docs/desktop-apps.md` §1 is the whole of the contract,
 * and it is a manifest). The culture's own hour cycle is what shows.
 */
@customElement('umbradesktop-clock')
export class ClockElement extends UmbLitElement {
  /**
   * Where the time comes from. The real clock unless a test says otherwise; a clock whose time
   * cannot be fixed is a clock whose face can only be tested by waiting.
   */
  @property({ attribute: false })
  now: () => Date = () => new Date();

  /** The moment on the face. */
  @state()
  private _moment?: Date;

  /** The pending tick's `setTimeout` handle, or undefined when stopped. */
  #timer?: number;

  /** Whether the clock is ticking. Public so a test can see that closing the window stops it. */
  get running(): boolean {
    return this.#timer !== undefined;
  }

  /** Read the time and start ticking. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.tick();
  }

  /**
   * Stop ticking. The whole of teardown: closing the window removes the element, and a timer left
   * behind would keep a detached face turning for as long as the backoffice tab lives. Minimizing
   * does not remove it, so a minimized clock keeps time, which is what a clock is for.
   */
  override disconnectedCallback(): void {
    window.clearTimeout(this.#timer);
    this.#timer = undefined;
    super.disconnectedCallback();
  }

  /**
   * Read the time now and schedule the next reading for the next whole second.
   *
   * A timeout to the boundary each time rather than one 1000ms interval, so the second hand turns
   * over with the real second and with the taskbar clock beside it, instead of whenever the window
   * happened to open, drifting from there.
   */
  tick(): void {
    this._moment = this.now();
    window.clearTimeout(this.#timer);
    if (!this.isConnected) {
      this.#timer = undefined;
      return;
    }
    this.#timer = window.setTimeout(() => this.tick(), msUntilNextSecond(this._moment));
  }

  /**
   * The marks round the rim: sixty, with every fifth one longer and heavier.
   * @returns The marks, as SVG.
   */
  #renderMarks() {
    return Array.from({ length: 60 }, (_unused, index) => {
      const hour = index % 5 === 0;
      const inner = RADIUS - (hour ? GEOMETRY.hourMark : GEOMETRY.minuteMark);
      return svg`<line
        class=${hour ? 'mark mark-hour' : 'mark'}
        x1="0" y1=${-inner} x2="0" y2=${-RADIUS + 2}
        transform="rotate(${index * 6})"
      />`;
    });
  }

  /**
   * One hand.
   * @param name Which hand, for the class the stylesheet and the tests read.
   * @param length How far it reaches, in face units.
   * @param angle Where it points, in degrees clockwise from twelve.
   * @returns The hand, as SVG.
   */
  #renderHand(name: string, length: number, angle: number) {
    return svg`<line class="hand hand-${name}" x1="0" y1=${length * 0.15} x2="0" y2=${-length} transform="rotate(${angle})" />`;
  }

  /**
   * The whole window body.
   * @returns The face, the time and the date.
   */
  override render() {
    const moment = this._moment ?? this.now();
    const angles = handAngles(moment);
    const time = this.localize.date(moment, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const date = this.localize.date(moment, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return html`
      <div class="face">
        <svg viewBox="-100 -100 200 200" aria-hidden="true">
          <circle class="rim" r=${RADIUS} />
          ${this.#renderMarks()}
          ${this.#renderHand('hour', GEOMETRY.hourHand, angles.hour)}
          ${this.#renderHand('minute', GEOMETRY.minuteHand, angles.minute)}
          ${this.#renderHand('second', GEOMETRY.secondHand, angles.second)}
          <circle class="pin" r="3" />
        </svg>
      </div>
      <time class="time" datetime=${moment.toISOString()}>${time}</time>
      <div class="date muted">${date}</div>
    `;
  }

  /**
   * The shared accessory look, plus the face.
   *
   * The face takes whatever height the words leave it and the SVG scales to fit, so a maximized
   * Clock is a big clock. Its colours are the app tokens: the dial is the sunken field, the rim is
   * `border` (the one line colour guaranteed to show against it), the marks and hands are text, and
   * the second hand is the accent, which is the one moving thing and the one a reader's eye should
   * find.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        align-items: center;
        padding: ${CLOCK_PADDING_PX}px;
        gap: ${CLOCK_PADDING_PX}px;
      }

      /* The face's height is whatever the two lines of words leave, and the SVG is taken out of flow
         to fill it. In flow, an SVG with a viewBox sizes itself from its width, so the face asked
         for a square as wide as the window and pushed the words 40px out of the bottom of a Clock
         at its minimum size. Measured, not reasoned: the unit tests were green throughout. */
      .face {
        position: relative;
        flex: 1 1 0;
        width: 100%;
        min-height: ${CLOCK_MIN_FACE_PX}px;
      }

      svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        overflow: visible;
      }

      /* SVG paints take colours only, never a gradient, so the dial uses the flat-colour fallback
         chain the tokens document rather than trying to read a background value into a fill. The
         app-tokens test in the host holds every shipped surface to a flat colour, which is what
         makes reading one into fill safe. */
      .rim {
        fill: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
        stroke: var(--umbradesktop-app-border, var(--uui-color-text-alt));
        stroke-width: 2;
      }

      .mark {
        stroke: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
        stroke-width: 1.5;
      }

      .mark-hour {
        stroke: var(--umbradesktop-app-text, var(--uui-color-text));
        stroke-width: 3;
      }

      .hand {
        stroke: var(--umbradesktop-app-text, var(--uui-color-text));
        stroke-linecap: round;
      }

      .hand-hour {
        stroke-width: 6;
      }

      .hand-minute {
        stroke-width: 4;
      }

      .hand-second,
      .pin {
        stroke: var(--umbradesktop-app-accent, var(--uui-color-selected));
        fill: var(--umbradesktop-app-accent, var(--uui-color-selected));
        stroke-width: 1.5;
      }

      .time {
        height: ${CLOCK_TIME_HEIGHT_PX}px;
        line-height: ${CLOCK_TIME_HEIGHT_PX}px;
        font-size: 1.75em;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
      }

      .date {
        height: ${CLOCK_DATE_HEIGHT_PX}px;
        line-height: ${CLOCK_DATE_HEIGHT_PX}px;
        white-space: nowrap;
      }
    `,
  ];
}

export { ClockElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-clock': ClockElement;
  }
}
