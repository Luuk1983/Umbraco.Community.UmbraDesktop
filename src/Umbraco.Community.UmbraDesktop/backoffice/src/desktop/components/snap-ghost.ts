/**
 * What the snap outline paints when a theme sets none of its tokens.
 *
 * Its own module rather than literals in the desktop's stylesheet, because two things read these
 * values: that stylesheet, and `theme/snap-ghost.test.ts`, which measures that the outline can be
 * seen on a light ground and a dark one. A copy in the test would measure a number nobody paints.
 */
export const UMBRADESKTOP_SNAP_GHOST_DEFAULTS = {
  // Dark enough to stand out on a light ground, light enough that the blurred content still shows.
  '--umbradesktop-snap-ghost-background': 'rgba(0, 0, 0, 0.3)',
  // The light line, which carries the outline on a dark ground...
  '--umbradesktop-snap-ghost-border': '2px solid rgba(255, 255, 255, 0.85)',
  // ...and the dark ring around it, which carries it on a light one. The second shadow is depth.
  '--umbradesktop-snap-ghost-shadow': '0 0 0 1px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.25)',
  // Blurs what is behind, so a busy window under the outline cannot break its edge up.
  '--umbradesktop-snap-ghost-backdrop': 'blur(12px)',
  '--umbradesktop-snap-ghost-radius': '6px',
} as const;
