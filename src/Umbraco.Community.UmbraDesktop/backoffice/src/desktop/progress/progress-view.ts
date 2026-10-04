import { css, html, nothing, styleMap, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  UMBRADESKTOP_RING_ARC,
  UMBRADESKTOP_RING_SPIN_MS,
  UMBRADESKTOP_RING_STROKE_PX,
  UMBRADESKTOP_RING_TRACK_OPACITY,
} from '../loader-ring.js';
import { UMBRADESKTOP_CHROME_ICON_PX } from '../constants.js';
import type { UmbraDesktopWindowProgress } from './progress.js';

/**
 * How a busy window's progress is drawn, shared by the two surfaces that draw it: the title bar and
 * the taskbar button. One template and one base sheet, so a theme restyles one element with one
 * set of attributes wherever it appears. Issue #108, design D6 and D7.
 *
 * The base drawing is the Umbraco theme's, since that theme is the base chrome: the window loader's
 * ring, drawn round the app icon. Determinate progress fills the ring clockwise; indeterminate work
 * turns the loader's own quarter arc at the loader's own speed; a failure stops where it stopped,
 * in the failure colour. Every other theme restyles the same element into its own idiom.
 */

/**
 * How far the ring stands off the icon's box, in px. Into the gap the caption and the task button
 * already leave between the icon and the label, which is why the ring costs no width.
 *
 * Two, not the four it started at. At four the ring ran into the title text, which sits 6px after
 * the icon, and through the icon's own corners; both showed in a real backoffice and neither in the
 * mock. `theme/progress.test.ts` measures both.
 */
export const UMBRADESKTOP_PROGRESS_OFFSET_PX = 2;

/**
 * The side of an icon in ems, as `uui-icon` sizes itself inside `umb-icon`. The ring is drawn round
 * the icon's box, so the box has to be the icon's real size even where the icon has not rendered:
 * a page without the backoffice's icon registry, which is every test page, gives it no size at all
 * and the ring collapses to a speck. As a minimum, so the backoffice's own rendering wins wherever
 * it exists.
 */
const ICON_EM = 1.125;

/** Air between the shrunken icon's corners and the ring's inside edge, in px. */
const ICON_CLEARANCE_PX = 0.5;

/**
 * How far the icon shrinks while the ring is drawn round it, so its corners clear the ring's inside
 * edge, as the window loader's mark sits inside its ring with room to spare.
 *
 * Derived rather than chosen. The icon is a square of `CHROME_ICON_PX * ICON_EM`; the ring's inside
 * edge is the square's half-side plus the offset, less the stroke; and a square's corner is its
 * half-side times the square root of two from its centre. Scale the corner in to the inside edge,
 * less a hairline. Rounded to three places so the stylesheet carries a plain number.
 */
const ICON_RING_SCALE = (() => {
  const side = UMBRADESKTOP_CHROME_ICON_PX * ICON_EM;
  const inner = side / 2 + UMBRADESKTOP_PROGRESS_OFFSET_PX - UMBRADESKTOP_RING_STROKE_PX;
  return Math.round(((inner - ICON_CLEARANCE_PX) / ((side / 2) * Math.SQRT2)) * 1000) / 1000;
})();

/**
 * The track a surface draws under the ring when its theme sets none: the fill's own colour, faint,
 * exactly as the window loader draws its track. Without it a ring at 28% is a stray arc above the
 * icon rather than a ring a quarter full; measured in a backoffice, where it read as a rendering
 * fault. For each surface's `--_progress-track` fallback.
 */
export const UMBRADESKTOP_PROGRESS_TRACK_DEFAULT = unsafeCSS(
  `color-mix(in srgb, var(--_progress-fill) ${UMBRADESKTOP_RING_TRACK_OPACITY * 100}%, transparent)`,
);

/**
 * The fraction as written into the style, rounded so a report that moves it by a hair does not
 * repaint. Three places is a tenth of a percent, finer than any ring on this desktop can show.
 * @param fraction 0 to 1.
 * @returns The value for `--umbradesktop-progress-value`.
 */
function styleValue(fraction: number): string {
  return String(Math.round(fraction * 1000) / 1000);
}

/**
 * The progress element for a window, or nothing when it is idle.
 *
 * Its state goes on `data-state` and its value on `--umbradesktop-progress-value`, which are the
 * two things a theme reads. In the title bar it is the window's `progressbar`, with the caption as
 * its name and a value only when there is a proportion to give. On a taskbar button it is
 * decoration, because the button's own label already carries the caption in words, and a
 * progressbar inside a button is a widget inside a widget.
 * @param progress The window's summary.
 * @param caption The words for it, from `progressCaption`.
 * @param decorative True on a taskbar button.
 * @returns The template.
 */
export function renderProgress(
  progress: UmbraDesktopWindowProgress | undefined,
  caption: string,
  decorative = false,
) {
  if (!progress) return nothing;
  const style = progress.fraction === undefined ? {} : { '--umbradesktop-progress-value': styleValue(progress.fraction) };
  if (decorative) {
    return html`<span class="progress" data-state=${progress.state} style=${styleMap(style)} aria-hidden="true"></span>`;
  }
  const now = progress.fraction === undefined ? nothing : String(Math.round(progress.fraction * 100));
  return html`<span
    class="progress"
    role="progressbar"
    data-state=${progress.state}
    style=${styleMap(style)}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-valuenow=${now}
    aria-label=${caption}
    title=${caption}></span>`;
}

/**
 * The base drawing. Each surface supplies its colours by setting the three private properties on
 * its own `.progress` rule from its own tokens (`--umbradesktop-titlebar-progress-*` and
 * `--umbradesktop-taskbar-progress-*`), because the two sit on different grounds: a white caption
 * and a navy bar want different fills.
 *
 * Positioned against `.progress-anchor`, the wrapper round the icon. A theme that draws a strip
 * along an edge instead sets the anchor to `position: static`, so the element positions against
 * the caption or the button, which both already establish a containing block.
 */
export const progressStyles = css`
  .progress-anchor {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  .progress-anchor > umb-icon {
    min-width: ${ICON_EM}em;
    min-height: ${ICON_EM}em;
  }
  /* Only while there is a ring to make room for, and as a transform, so the caption and the task
     button lay out exactly as they do when the window is idle and nothing beside the icon moves. */
  .progress-anchor:has(.progress) > umb-icon {
    transform: scale(${ICON_RING_SCALE});
  }
  .progress {
    position: absolute;
    inset: calc(-1 * var(--umbradesktop-progress-offset, ${UMBRADESKTOP_PROGRESS_OFFSET_PX}px));
    border-radius: 50%;
    pointer-events: none;
    background: conic-gradient(
      var(--_progress-fill) calc(var(--umbradesktop-progress-value, 0) * 1turn),
      var(--_progress-track) 0
    );
    /* A ring rather than a disc: everything inside the stroke is masked away, so the icon shows
       through. The half pixel softens the inner edge the way an SVG stroke is antialiased. */
    -webkit-mask: radial-gradient(
      farthest-side,
      transparent calc(100% - var(--umbradesktop-progress-thickness, ${UMBRADESKTOP_RING_STROKE_PX}px)),
      #000 calc(100% - var(--umbradesktop-progress-thickness, ${UMBRADESKTOP_RING_STROKE_PX}px) + 0.5px)
    );
    mask: radial-gradient(
      farthest-side,
      transparent calc(100% - var(--umbradesktop-progress-thickness, ${UMBRADESKTOP_RING_STROKE_PX}px)),
      #000 calc(100% - var(--umbradesktop-progress-thickness, ${UMBRADESKTOP_RING_STROKE_PX}px) + 0.5px)
    );
  }
  /* The loader's own arc, at the loader's own speed: work with no known end looks like the
     window loading, which is what it is. */
  .progress[data-state='indeterminate'] {
    background: conic-gradient(var(--_progress-fill) 0 ${unsafeCSS(UMBRADESKTOP_RING_ARC)}turn, var(--_progress-track) 0);
    animation: umbradesktop-progress-turn ${UMBRADESKTOP_RING_SPIN_MS}ms linear infinite;
  }
  /* Its own background rather than a reassigned fill variable. Each surface sets the fill from its
     tokens in a later rule of the same specificity, which won, and every theme drew a failure
     exactly like progress until a rendered test compared the two. */
  .progress[data-state='failed'] {
    background: conic-gradient(
      var(--_progress-failed) calc(var(--umbradesktop-progress-value, 1) * 1turn),
      var(--_progress-track) 0
    );
  }
  @keyframes umbradesktop-progress-turn {
    to {
      transform: rotate(1turn);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .progress[data-state='indeterminate'] {
      animation: none;
    }
  }
`;

/** Where and how big a theme draws progress as a strip rather than a ring. */
export interface UmbraDesktopProgressStripOptions {
  /** Where the strip sits in its surface's box, as a CSS `inset`. Defaults to the bottom edge. */
  inset?: string;
  /** Its thickness, in px. */
  height: number;
  /** Its corner radius, in px. */
  radius?: number;
}

/**
 * The rules a theme appends to draw progress as a strip on one surface instead of the base ring:
 * a bar along an edge, a capsule over a dock tile, a well in a caption. Shared so the four themes
 * that want a bar position it and fill it the same way, and differ only in where it sits and what
 * it is painted with.
 *
 * Sets the icon's anchor static, so the strip positions against the surface itself — the caption,
 * or the task button — which this also makes a containing block. Fills from the left by the value,
 * sweeps a quarter-length segment for indeterminate work (the loader's own arc, unrolled), and
 * stops where it stopped in the failure colour. All three in the surface's own colours, which it
 * still sets from its own tokens.
 * @param surface `.titlebar` or `.task`.
 * @param options Where it sits and how thick it is.
 * @returns The rules, to interpolate into the theme's sheet for that surface.
 */
export function progressStrip(surface: '.titlebar' | '.task', options: UmbraDesktopProgressStripOptions) {
  const s = unsafeCSS(surface);
  const inset = unsafeCSS(options.inset ?? 'auto 0 0 0');
  const fill = (colour: string, size: string) =>
    unsafeCSS(`linear-gradient(${colour}, ${colour}) 0 0 / ${size} 100% no-repeat, var(--_progress-track)`);
  return css`
    ${s} {
      position: relative;
    }
    ${s} .progress-anchor {
      position: static;
    }
    ${s} .progress-anchor > umb-icon {
      transform: none;
    }
    ${s} .progress {
      inset: ${inset};
      height: var(--umbradesktop-progress-thickness, ${options.height}px);
      border-radius: ${options.radius ?? 0}px;
      -webkit-mask: none;
      mask: none;
      background: ${fill('var(--_progress-fill)', 'calc(var(--umbradesktop-progress-value, 0) * 100%)')};
    }
    ${s} .progress[data-state='indeterminate'] {
      background: ${fill('var(--_progress-fill)', `${UMBRADESKTOP_RING_ARC * 100}%`)};
      animation: umbradesktop-progress-sweep ${UMBRADESKTOP_RING_SPIN_MS}ms ease-in-out infinite alternate;
    }
    ${s} .progress[data-state='failed'] {
      background: ${fill('var(--_progress-failed)', 'calc(var(--umbradesktop-progress-value, 1) * 100%)')};
    }
    @keyframes umbradesktop-progress-sweep {
      from {
        background-position: 0 0;
      }
      to {
        background-position: 100% 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      ${s} .progress[data-state='indeterminate'] {
        animation: none;
        background-position: 50% 0;
      }
    }
  `;
}
