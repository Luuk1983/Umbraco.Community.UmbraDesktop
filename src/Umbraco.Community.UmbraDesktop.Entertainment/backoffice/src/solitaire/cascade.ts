/**
 * The win cascade (design D4): cards leave the foundations one by one, bounce along the bottom of
 * the window and leave a trail. On a canvas, because the trail is hundreds of copies of a card.
 */
import {
  CASCADE_DAMPING,
  CASCADE_GRAVITY,
  CASCADE_LAUNCH_VY_MAX,
  CASCADE_SPEED_MAX,
  CASCADE_SPEED_MIN,
} from './constants.js';

/** One moving card, in px and px per frame. */
export interface Bouncer {
  /** Left edge in px. */
  readonly x: number;
  /** Top edge in px. */
  readonly y: number;
  /** Horizontal speed in px per frame. */
  readonly vx: number;
  /** Vertical speed in px per frame, positive downwards. */
  readonly vy: number;
}

/**
 * One frame of a card's flight.
 * @param b The card now.
 * @param floor The lowest y its top edge may reach.
 * @param gravity Added to vy each frame.
 * @param damping Share of vertical speed kept after a bounce.
 * @returns The card one frame later.
 */
export function stepBouncer(b: Bouncer, floor: number, gravity: number, damping: number): Bouncer {
  let y = b.y + b.vy;
  let vy = b.vy + gravity;
  if (y > floor) {
    y = floor;
    vy = -b.vy * damping;
  }
  return { x: b.x + b.vx, y, vx: b.vx, vy };
}

/** A card the cascade launches: its image and where it starts. */
export interface CascadeCard {
  /** The card's picture; drawn once per frame, so it should already be decoded. */
  readonly image: CanvasImageSource;
  /** Where its left edge starts, in CSS px. */
  readonly x: number;
  /** Where its top edge starts, in CSS px. */
  readonly y: number;
}

/** Everything a test may replace; each defaults to the real thing. */
export interface WinCascadeOptions {
  /** Source of randomness; injected so a test can fix the launch. */
  readonly random?: () => number;
  /** Asks for the next frame. Injected because background test tabs never deliver real ones. */
  readonly schedule?: (callback: () => void) => number;
  /** Withdraws a frame asked for with `schedule`. */
  readonly cancel?: (handle: number) => void;
}

/**
 * Runs the cascade on a canvas until every card has left, or until stopped.
 *
 * The caller owns the canvas's CSS size (it is read, never written): the cascade only sizes the
 * backing store to match, in device pixels.
 */
export class WinCascade {
  /** The canvas drawn on, already sized to its element in CSS px by the caller. */
  readonly #canvas: HTMLCanvasElement;
  /** Cards in launch order. */
  readonly #cards: ReadonlyArray<CascadeCard>;
  /** The card size in CSS px. */
  readonly #size: { readonly w: number; readonly h: number };
  /** Randomness for launch speed and direction. */
  readonly #random: () => number;
  /** Frame scheduler. */
  readonly #schedule: (callback: () => void) => number;
  /** Frame canceller. */
  readonly #cancel: (handle: number) => void;
  /** The pending frame's handle, so {@link WinCascade.stop} can withdraw it. */
  #frame = 0;
  /** Set by stop; checked so a stop before start, or mid-frame, still ends the run. */
  #stopped = false;
  /** The running cascade's promise, so a second start joins it instead of starting a second loop. */
  #running: Promise<void> | undefined;
  /** Resolves {@link WinCascade.#running}. */
  #resolve: () => void = () => {};

  /**
   * @param canvas The canvas, already sized to the element in CSS px.
   * @param cards Cards in launch order.
   * @param size The card size in CSS px.
   * @param options Test seams for randomness and frame scheduling.
   */
  constructor(
    canvas: HTMLCanvasElement,
    cards: ReadonlyArray<CascadeCard>,
    size: { readonly w: number; readonly h: number },
    options: WinCascadeOptions = {},
  ) {
    this.#canvas = canvas;
    this.#cards = cards;
    this.#size = size;
    this.#random = options.random ?? Math.random;
    this.#schedule = options.schedule ?? ((callback) => requestAnimationFrame(callback));
    this.#cancel = options.cancel ?? ((handle) => cancelAnimationFrame(handle));
  }

  /**
   * Start. Sizes the backing store in device pixels so the cards stay sharp on high-DPI screens.
   * Calling it again while running returns the same promise; after stop it resolves at once.
   * @returns Resolves when the last card has left or stop was called.
   */
  start(): Promise<void> {
    if (this.#running) return this.#running;
    if (this.#stopped) return Promise.resolve();
    const dpr = window.devicePixelRatio || 1;
    // Layout size, not the bounding box: a scaled ancestor would shrink or stretch the latter.
    const { clientWidth: width, clientHeight: height } = this.#canvas;
    this.#canvas.width = Math.round(width * dpr);
    this.#canvas.height = Math.round(height * dpr);
    const ctx = this.#canvas.getContext('2d');
    if (!ctx || this.#cards.length === 0) return Promise.resolve();
    ctx.scale(dpr, dpr);
    const floor = height - this.#size.h;
    let index = 0;
    let current: Bouncer | undefined;
    /**
     * One frame: launch the next card if none is flying, move it, draw it, ask for the next frame.
     * A card whose image cannot be drawn is skipped rather than ending the whole cascade.
     */
    const tick = (): void => {
      if (this.#stopped) return;
      if (!current) {
        if (index >= this.#cards.length) return this.#finish();
        const card = this.#cards[index];
        const speed = CASCADE_SPEED_MIN + this.#random() * (CASCADE_SPEED_MAX - CASCADE_SPEED_MIN);
        current = {
          x: card.x,
          y: card.y,
          vx: this.#random() < 0.5 ? -speed : speed,
          vy: -this.#random() * CASCADE_LAUNCH_VY_MAX,
        };
      }
      current = stepBouncer(current, floor, CASCADE_GRAVITY, CASCADE_DAMPING);
      try {
        ctx.drawImage(this.#cards[index].image, current.x, current.y, this.#size.w, this.#size.h);
      } catch {
        // An undecoded or broken image throws; move this card off-canvas so the rest still fall.
        current = { ...current, x: -this.#size.w * 2 };
      }
      if (current.x < -this.#size.w || current.x > width) {
        current = undefined;
        index++;
      }
      this.#frame = this.#schedule(tick);
    };
    this.#running = new Promise<void>((resolve) => {
      this.#resolve = resolve;
    });
    this.#frame = this.#schedule(tick);
    return this.#running;
  }

  /** End it early (a click or a key). Safe before start, while running and repeatedly. */
  stop(): void {
    this.#stopped = true;
    this.#cancel(this.#frame);
    this.#finish();
  }

  /** Resolve the running promise once; later calls find nothing to resolve. */
  #finish(): void {
    const resolve = this.#resolve;
    this.#resolve = () => {};
    resolve();
  }
}
