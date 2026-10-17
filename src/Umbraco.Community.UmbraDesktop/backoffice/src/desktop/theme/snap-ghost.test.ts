import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { contrastRatio } from './contrast.js';
import { UMBRADESKTOP_SNAP_GHOST_DEFAULTS } from '../components/snap-ghost.js';
import type { UmbraDesktopPalette } from './types.js';

/**
 * The snap outline must be readable on whatever it lands on (#135).
 *
 * It shipped as a white line on a faint white fill, which disappears on a light wallpaper or over a
 * maximised window's white content: the case the issue was filed for. Nothing tested it, because
 * every value was a valid colour and the outline rendered; it just could not be seen.
 *
 * The rule measured here: on a white ground and on a black ground, at least one of the outline's
 * lines (the border, or a ring drawn by the shadow) contrasts 3:1 with that ground, WCAG 1.4.11's
 * ratio for a graphical object. A dark and a light line together pass both; a single tone can only
 * pass one. Measured from computed style on a probe element, so the browser does the parsing and a
 * theme can write its values however it likes.
 */

/** WCAG 1.4.11: the contrast a graphical object needs against what is next to it. */
const MIN_CONTRAST = 3;

/** The two extremes an outline can land on. Anything between is easier than one of them. */
const GROUNDS = { white: [255, 255, 255], black: [0, 0, 0] } as const;

/** An `rgb()`/`rgba()` computed colour as channels and alpha, or `null` for anything else. */
function parseColor(value: string): { rgb: [number, number, number]; alpha: number } | null {
  const match = /rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)/.exec(value);
  if (!match) return null;
  return {
    rgb: [Number(match[1]), Number(match[2]), Number(match[3])],
    alpha: match[4] === undefined ? 1 : Number(match[4]),
  };
}

/**
 * A translucent colour painted over an opaque one, as the opaque `rgb()` the eye ends up seeing.
 * @param top The computed colour painted on top.
 * @param under The opaque channels underneath.
 * @returns The composite channels, or `under` itself when `top` is not a colour this can read.
 */
function over(top: string, under: readonly number[]): [number, number, number] {
  const color = parseColor(top);
  if (!color) return [under[0], under[1], under[2]];
  return color.rgb.map((channel, i) => channel * color.alpha + under[i] * (1 - color.alpha)) as [
    number,
    number,
    number,
  ];
}

/** Channels as a string {@link contrastRatio} reads. */
const rgb = (channels: readonly number[]) => `rgb(${channels.map(Math.round).join(', ')})`;

/**
 * The colours of the shadows in a computed `box-shadow` that draw a line: a ring, with spread and
 * no blur. A soft drop shadow is depth, not an edge, so it is not counted as one.
 */
function ringColors(boxShadow: string): string[] {
  if (!boxShadow || boxShadow === 'none') return [];
  // Split on the commas between shadows, not the ones inside `rgba(...)`.
  return boxShadow
    .split(/,(?![^(]*\))/)
    .map((shadow) => shadow.trim())
    .filter((shadow) => {
      const lengths = shadow.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(parseFloat);
      // x, y, blur, spread; computed style always writes all four.
      return !shadow.startsWith('inset') && lengths[2] === 0 && lengths[3] > 0;
    })
    .map((shadow) => /rgba?\([^)]*\)/.exec(shadow)?.[0] ?? '');
}

/** One probe element, shared: these cases read computed style and nothing else. */
let probe: HTMLDivElement;

before(() => {
  probe = document.createElement('div');
  probe.style.cssText = 'position:fixed; left:0; top:0; width:100px; height:100px; box-sizing:border-box;';
  document.body.appendChild(probe);
});

after(() => probe.remove());

/**
 * Paint the probe as the ghost would be painted under a palette, falling back to the defaults the
 * desktop itself falls back to.
 */
function paint(palette: UmbraDesktopPalette | undefined) {
  const value = (token: keyof typeof UMBRADESKTOP_SNAP_GHOST_DEFAULTS) =>
    (palette?.[token] as string | undefined) ?? UMBRADESKTOP_SNAP_GHOST_DEFAULTS[token];
  probe.style.background = value('--umbradesktop-snap-ghost-background');
  probe.style.border = value('--umbradesktop-snap-ghost-border');
  probe.style.boxShadow = value('--umbradesktop-snap-ghost-shadow');
  return getComputedStyle(probe);
}

/** What the probe paints, measured against both grounds. */
function measure(name: string, palette: UmbraDesktopPalette | undefined) {
  const style = paint(palette);
  for (const [groundName, ground] of Object.entries(GROUNDS)) {
    // The border sits on the fill, which sits on the ground; a ring sits on the ground alone.
    const fill = over(style.backgroundColor, ground);
    const lines = [
      ...(parseFloat(style.borderTopWidth) > 0 ? [over(style.borderTopColor, fill)] : []),
      ...ringColors(style.boxShadow).map((color) => over(color, ground)),
    ];
    const best = Math.max(0, ...lines.map((line) => contrastRatio(rgb(line), rgb(ground)) ?? 0));
    expect(
      best,
      `${name}: no line of the snap outline reaches ${MIN_CONTRAST}:1 on a ${groundName} ground ` +
        `(border ${style.borderTopColor}, shadow ${style.boxShadow})`,
    ).to.be.at.least(MIN_CONTRAST);
  }
}

it('draws a default snap outline that reads on white and on black', () => {
  measure('the default', undefined);
});

it('blurs what is behind the default snap outline', () => {
  expect(UMBRADESKTOP_SNAP_GHOST_DEFAULTS['--umbradesktop-snap-ghost-backdrop']).to.match(/blur\(/);
});

for (const theme of UMBRADESKTOP_THEMES) {
  for (const variant of ['light', 'dark'] as const) {
    const palette = theme.palettes[variant];
    // A theme need not ship a dark palette (Win98 and Umbraco 4 do not).
    if (!palette) continue;
    it(`draws the ${theme.name} ${variant} snap outline so it reads on white and on black`, () => {
      measure(`${theme.name} ${variant}`, palette);
    });
  }
}
