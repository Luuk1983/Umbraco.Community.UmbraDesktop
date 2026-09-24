/**
 * An analogue face's geometry, as a pure function of a date.
 *
 * Kept apart from the element so the angles can be checked at midnight, at noon and at half past six
 * without waiting for any of them, the same reason the desktop's own `clock-format.ts` is a function
 * rather than a taskbar.
 */

/** Degrees clockwise from twelve for each hand, which is what an SVG `rotate()` about the centre takes. */
export interface ClockHandAngles {
  /** The hour hand. Creeps: half a degree a minute. */
  hour: number;
  /** The minute hand. Sweeps: a tenth of a degree a second. */
  minute: number;
  /** The second hand. Ticks: whole seconds only. */
  second: number;
}

/**
 * Where each hand points at `moment`, in its local time.
 *
 * The hour and minute hands move between their marks, because that is what a clock's do and a face
 * where half past six sat exactly on the six would be read as wrong. The second hand reads whole
 * seconds only, so the element needs one timer a second rather than a frame loop.
 * @param moment The time to show.
 * @returns The three angles.
 */
export function handAngles(moment: Date): ClockHandAngles {
  const seconds = moment.getSeconds();
  const minutes = moment.getMinutes() + seconds / 60;
  const hours = (moment.getHours() % 12) + minutes / 60;
  return { hour: hours * 30, minute: minutes * 6, second: seconds * 6 };
}

/**
 * How long until the next whole second.
 *
 * The element waits this long before each tick rather than running a plain 1000ms interval, which
 * would sit up to a second behind the real second from whenever the window opened and drift further
 * from there. Never zero: on a boundary exactly, the next one is a whole second away.
 * @param moment Now.
 * @returns Milliseconds, between 1 and 1000.
 */
export function msUntilNextSecond(moment: Date): number {
  return 1000 - moment.getMilliseconds();
}
