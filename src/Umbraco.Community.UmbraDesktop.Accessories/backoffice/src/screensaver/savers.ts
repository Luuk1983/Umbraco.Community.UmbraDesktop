import type { AccessoriesScreensaverId } from '../settings/settings.js';

/**
 * The screensavers, as small simulations: state, a step that moves it on by some milliseconds, and
 * a draw onto a canvas.
 *
 * The state is exposed and the randomness is injected so the rules can be tested without watching
 * pixels: stars stay in front of the viewer, Mystify's corners stay on the screen. The element owns
 * the canvas, the frame loop and the size; a saver is rebuilt when the size changes, since every
 * saver's state is laid out for one screen.
 *
 * Their colours are their own, on black, under every theme. A screensaver is the one thing on the
 * desktop that is meant to look like nothing else on it.
 */

/** A source of numbers in [0, 1). `Math.random` in use, a seeded one in tests. */
export type Random = () => number;

/** One running screensaver. */
export interface Saver {
  /** Its state, for tests. */
  readonly state: unknown;
  /**
   * Move on by some time.
   * @param elapsedMs Milliseconds since the last step.
   */
  step(elapsedMs: number): void;
  /**
   * Draw the current state, covering the whole canvas.
   * @param context The canvas to draw on.
   */
  draw(context: CanvasRenderingContext2D): void;
}

/** Builds a saver for a screen of `width` by `height` pixels. */
export type SaverFactory = (width: number, height: number, random: Random) => Saver;

/**
 * A small, fast, seedable random source (mulberry32), so a test can say "from this seed" and get the
 * same sky every time.
 * @param seed Any integer.
 * @returns A {@link Random}.
 */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Something flying towards the viewer: a position across the screen, and a depth. */
interface Flier {
  /** Across, from -1 (left) to 1 (right), at the far plane. */
  x: number;
  /** Down, from -1 (top) to 1 (bottom), at the far plane. */
  y: number;
  /** Depth: 1 is the far plane, towards 0 is closer. Always above 0. */
  z: number;
}

/** How close a flier may come before it is recycled to the far plane. */
const NEAREST = 0.02;

/**
 * A new flier somewhere across the far plane, or anywhere in depth when the field is being filled
 * for the first time, so the screen does not start empty.
 * @param random The random source.
 * @param anyDepth Whether to place it at a random depth rather than at the far plane.
 * @returns The flier.
 */
function spawn(random: Random, anyDepth: boolean): Flier {
  return { x: random() * 2 - 1, y: random() * 2 - 1, z: anyDepth ? NEAREST + random() * (1 - NEAREST) : 1 };
}

/**
 * Move fliers towards the viewer, recycling any that reach it.
 * @param fliers The fliers, changed in place.
 * @param speed Depth covered per second.
 * @param elapsedMs Time since the last step.
 * @param random The random source, for recycling.
 */
function fly(fliers: Flier[], speed: number, elapsedMs: number, random: Random): void {
  for (let i = 0; i < fliers.length; i++) {
    const flier = fliers[i];
    flier.z -= (speed * elapsedMs) / 1000;
    if (flier.z <= NEAREST) fliers[i] = spawn(random, false);
  }
}

/**
 * Where a flier appears on screen, and how near it is: perspective is division by depth.
 * @param flier The flier.
 * @param width Screen width.
 * @param height Screen height.
 * @returns Its screen position and a nearness from 0 (far) to 1 (at the viewer).
 */
function project(flier: Flier, width: number, height: number): { x: number; y: number; near: number } {
  const half = Math.max(width, height) / 2;
  return {
    x: width / 2 + (flier.x / flier.z) * half * 0.5,
    y: height / 2 + (flier.y / flier.z) * half * 0.5,
    near: 1 - flier.z,
  };
}

/** Paint the whole canvas black. */
function blackout(context: CanvasRenderingContext2D): void {
  context.fillStyle = '#000';
  context.fillRect(0, 0, context.canvas.width, context.canvas.height);
}

/** Starfield's state. */
export interface StarfieldState {
  /** Every star. */
  stars: Flier[];
}

/**
 * Starfield: flying through space, as Windows shipped from 3.1 to XP. Stars start far away and
 * dim, and grow brighter and larger as they pass.
 */
const starfield: SaverFactory = (width, height, random) => {
  const state: StarfieldState = { stars: Array.from({ length: 300 }, () => spawn(random, true)) };
  return {
    state,
    step: (elapsedMs) => fly(state.stars, 0.35, elapsedMs, random),
    draw(context) {
      blackout(context);
      for (const star of state.stars) {
        const { x, y, near } = project(star, width, height);
        const size = 0.5 + near * 2.5;
        context.fillStyle = `rgba(255, 255, 255, ${0.25 + near * 0.75})`;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }
    },
  };
};

/** One of Mystify's shapes. */
export interface MystifyShape {
  /** Its corners. */
  points: Array<{ x: number; y: number; dx: number; dy: number }>;
  /** Earlier positions of its corners, newest last, drawn fading behind it. */
  trail: Array<Array<{ x: number; y: number }>>;
  /** Its colour, as a hue in degrees, which drifts. */
  hue: number;
}

/** Mystify's state. */
export interface MystifyState {
  /** The shapes. */
  shapes: MystifyShape[];
  /** How many earlier positions each shape keeps. */
  trailLength: number;
}

/**
 * Mystify Your Mind: two four-cornered shapes bouncing off the edges of the screen, each trailing
 * copies of itself, their colours drifting.
 */
const mystify: SaverFactory = (width, height, random) => {
  const trailLength = 12;
  const speed = () => (0.12 + random() * 0.2) * (random() < 0.5 ? -1 : 1);
  const shape = (hue: number): MystifyShape => {
    const points = Array.from({ length: 4 }, () => ({ x: random() * width, y: random() * height, dx: speed(), dy: speed() }));
    return { points, trail: Array.from({ length: trailLength }, () => points.map(({ x, y }) => ({ x, y }))), hue };
  };
  const state: MystifyState = { shapes: [shape(random() * 360), shape(random() * 360)], trailLength };
  return {
    state,
    step(elapsedMs) {
      for (const each of state.shapes) {
        for (const point of each.points) {
          point.x += point.dx * elapsedMs;
          point.y += point.dy * elapsedMs;
          // Bounce: reflect off an edge and stay on the screen.
          if (point.x < 0 || point.x > width) {
            point.dx = -point.dx;
            point.x = Math.min(width, Math.max(0, point.x));
          }
          if (point.y < 0 || point.y > height) {
            point.dy = -point.dy;
            point.y = Math.min(height, Math.max(0, point.y));
          }
        }
        each.trail.push(each.points.map(({ x, y }) => ({ x, y })));
        if (each.trail.length > trailLength) each.trail.shift();
        each.hue = (each.hue + elapsedMs * 0.03) % 360;
      }
    },
    draw(context) {
      blackout(context);
      context.lineWidth = 1.5;
      for (const each of state.shapes) {
        each.trail.forEach((points, age) => {
          context.strokeStyle = `hsla(${each.hue}, 90%, 60%, ${(age + 1) / each.trail.length})`;
          context.beginPath();
          points.forEach(({ x, y }, i) => (i === 0 ? context.moveTo(x, y) : context.lineTo(x, y)));
          context.closePath();
          context.stroke();
        });
      }
    },
  };
};

/** Flying Umbraco's state. */
export interface FlyingState {
  /** Every logo. */
  logos: Flier[];
}

/** The Umbraco blue, and the white of the U on it. */
const UMBRACO_BLUE = '#3544b1';

/**
 * Draw the Umbraco mark: a blue disc with a white U in it, as a path rather than an image, so it is
 * sharp at every size and needs no asset.
 * @param context The canvas.
 * @param x Centre across.
 * @param y Centre down.
 * @param radius The disc's radius.
 */
function drawMark(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  context.fillStyle = UMBRACO_BLUE;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  // The U: two uprights joined by a half circle, drawn as one thick rounded stroke.
  context.strokeStyle = '#fff';
  context.lineWidth = radius * 0.2;
  context.lineCap = 'round';
  const halfWidth = radius * 0.36;
  const top = y - radius * 0.42;
  const bend = y + radius * 0.08;
  context.beginPath();
  context.moveTo(x - halfWidth, top);
  context.lineTo(x - halfWidth, bend);
  context.arc(x, bend, halfWidth, Math.PI, 0, true);
  context.lineTo(x + halfWidth, top);
  context.stroke();
}

/**
 * Flying Umbraco: Windows' Flying Windows, with the Umbraco mark. Logos come out of the dark towards
 * the viewer, growing as they come.
 */
const flying: SaverFactory = (width, height, random) => {
  const state: FlyingState = { logos: Array.from({ length: 24 }, () => spawn(random, true)) };
  return {
    state,
    step: (elapsedMs) => fly(state.logos, 0.18, elapsedMs, random),
    draw(context) {
      blackout(context);
      // Far ones first, so a near logo passes in front of a far one.
      for (const logo of [...state.logos].sort((a, b) => b.z - a.z)) {
        const { x, y, near } = project(logo, width, height);
        context.globalAlpha = Math.min(1, 0.2 + near);
        drawMark(context, x, y, 4 + near * near * 70);
      }
      context.globalAlpha = 1;
    },
  };
};

/**
 * Every saver, by the id the settings store. Typed by the settings' own list of ids, so a saver
 * added there and not here, or here and not there, fails to compile.
 */
export const SAVERS: Record<AccessoriesScreensaverId, SaverFactory> = { starfield, mystify, flying };
