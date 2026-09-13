import {
  UMBRADESKTOP_MARK_PATH,
  UMBRADESKTOP_MARK_VIEWBOX,
  UMBRADESKTOP_RING_DASHARRAY,
  UMBRADESKTOP_RING_RADIUS,
  UMBRADESKTOP_RING_SPIN_MS,
  UMBRADESKTOP_RING_VIEWBOX,
  UMBRADESKTOP_WINDOW_RING_SIZE,
  ringMarkSize,
  ringStrokeWidth,
} from '../loader-ring.js';
import { css, customElement, html, svg } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Half the viewBox: the centre both circles share, and the point the arc turns about. */
const RING_CENTRE = UMBRADESKTOP_RING_VIEWBOX / 2;

/** The stroke both circles carry, in viewBox units, for the one size this element is drawn at. */
const RING_STROKE = ringStrokeWidth(UMBRADESKTOP_WINDOW_RING_SIZE);

/**
 * The waiting animation in a window body: the Umbraco mark with an arc turning around it.
 *
 * The boot splash's logo, shrunk. Both window kinds show it — an iframe whose backoffice is still
 * booting and an element app whose bundle is still importing — so that "the desktop is fetching
 * something" looks the same wherever it happens, which is what makes a section window and a game
 * window feel like the same window. It replaced `uui-loader`'s three dots, which said the same
 * thing in the backoffice's voice rather than the desktop's.
 *
 * A real element rather than a template helper because one of its two callers,
 * `app-host.element.ts`, renders into the light DOM and so has nowhere to put a stylesheet: it pays
 * for the failure message and the body ground in hand-built `style` attributes already, and a
 * keyframe cannot be bought that way at any price. A shadow root here gives both callers the same
 * thing and keeps the animation out of reach of whatever the app inside brings with it.
 *
 * Silent to assistive technology, as `uui-loader` was in the same position: the mark is decoration
 * over content that is arriving, and the window it covers is already reachable. Announcing it would
 * mean a localized string, which is worth doing on its own terms rather than smuggled in behind an
 * animation.
 */
@customElement('umbradesktop-loader')
export class UmbraDesktopLoaderElement extends UmbLitElement {
  /**
   * The mark inside the ring, and the ring around it.
   *
   * `svg` rather than `html` for the two fragments, so Lit parses them in the SVG namespace: an
   * `html` template producing `<circle>` yields an unknown HTML element that renders as nothing at
   * all, which is the kind of nothing that looks like a CSS problem for an hour.
   * @returns The mark and its ring.
   */
  override render() {
    return html`
      <svg class="ring" viewBox="0 0 ${UMBRADESKTOP_RING_VIEWBOX} ${UMBRADESKTOP_RING_VIEWBOX}" aria-hidden="true">
        ${svg`<circle
          class="track"
          cx="${RING_CENTRE}"
          cy="${RING_CENTRE}"
          r="${UMBRADESKTOP_RING_RADIUS}"
          stroke-width="${RING_STROKE}" />`}
        ${svg`<circle
          class="arc"
          cx="${RING_CENTRE}"
          cy="${RING_CENTRE}"
          r="${UMBRADESKTOP_RING_RADIUS}"
          stroke-width="${RING_STROKE}"
          stroke-dasharray="${UMBRADESKTOP_RING_DASHARRAY}" />`}
      </svg>
      <svg class="mark" viewBox="${UMBRADESKTOP_MARK_VIEWBOX}" aria-hidden="true">
        ${svg`<path d="${UMBRADESKTOP_MARK_PATH}" />`}
      </svg>
    `;
  }

  static override styles = css`
    /* One grid cell holding both children, so the mark sits in the middle of its own progress
       rather than beside it. Stacking them this way rather than with 'position: absolute' keeps the
       host sized by its contents' own box, which is what lets the measurement in
       'loader.element.test.ts' be a real measurement. */
    :host {
      display: grid;
      place-items: center;
      width: ${UMBRADESKTOP_WINDOW_RING_SIZE}px;
      height: ${UMBRADESKTOP_WINDOW_RING_SIZE}px;
      /* A theme's whole say over this element. The fallback is the backoffice's own text colour,
         deliberately not one of this package's tokens, and it is right only for a theme that also
         lets the ground follow the backoffice — which the base Umbraco theme does, by pinning
         neither.

         A palette that pins '--umbradesktop-window-background', the ground the loading overlay
         paints, must pin this too. Windows 98's face is grey because 1998 was grey rather than
         because the room is bright, so its palette is light-only and that grey stays put under the
         backoffice's dark setting — while this fallback went white on it, 1.82:1. Umbraco 4 had it
         identically and worse: its panel is near-white, so white on it is 1.07:1, which is not
         faint but gone. 'theme/tokens.test.ts' now fails on a palette that pins one and not the
         other, so the pairing is checked rather than remembered. */
      color: var(--umbradesktop-window-loader-color, var(--uui-color-text));
    }
    .ring,
    .mark {
      grid-area: 1 / 1;
    }
    .ring {
      width: 100%;
      height: 100%;
    }
    .track {
      fill: none;
      stroke: currentColor;
      /* The track is the same colour as the arc, faint. Two tokens would let a theme set them so
         they no longer read as one ring. */
      opacity: 0.16;
    }
    .arc {
      fill: none;
      stroke: currentColor;
      stroke-linecap: round;
      /* In viewBox units, so this is the centre at any rendered size rather than a pixel position
         that would have to be recomputed per size. */
      transform-origin: ${RING_CENTRE}px ${RING_CENTRE}px;
      animation: umbradesktop-loader-spin ${UMBRADESKTOP_RING_SPIN_MS}ms linear infinite;
    }
    .mark {
      width: ${ringMarkSize(UMBRADESKTOP_WINDOW_RING_SIZE)}px;
      height: ${ringMarkSize(UMBRADESKTOP_WINDOW_RING_SIZE)}px;
      fill: currentColor;
    }
    @keyframes umbradesktop-loader-spin {
      to {
        transform: rotate(360deg);
      }
    }
    /* The arc goes and the ring behind it stays, exactly as on the splash. A stopped arc sits there
       as a fragment of a circle and reads as progress that has stalled; the whole ring reads as an
       ornament around the mark, which says nothing rather than something wrong. Kept last in the
       file on purpose — 'loader.element.test.ts' reads everything past this query to check that the
       ring is not what disappears. */
    @media (prefers-reduced-motion: reduce) {
      .arc {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-loader': UmbraDesktopLoaderElement;
  }
}
