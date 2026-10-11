/**
 * Format a position or length as a clock.
 *
 * `m:ss` under an hour and `h:mm:ss` from an hour up, the way every media player writes it. Anything
 * that is not a sensible position (negative, not a number, infinite) reads as `0:00` rather than
 * `NaN:NaN`, since a live stream reports an infinite or zero duration and the bar must never print
 * garbage while it works that out.
 * @param seconds The position or length in seconds.
 * @returns The clock text.
 */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const ss = String(secs).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}

/**
 * Whether a duration means a live stream.
 *
 * YouTube reports zero for a stream that has no end yet, HTML5 video reports infinity, and a video
 * that has not loaded reports nothing. All three mean "there is no scrubber to draw".
 * @param duration The engine's reported duration in seconds.
 * @returns True when the bar should show Live instead of a seek slider.
 */
export function isLiveDuration(duration: number): boolean {
  return !Number.isFinite(duration) || duration <= 0;
}
