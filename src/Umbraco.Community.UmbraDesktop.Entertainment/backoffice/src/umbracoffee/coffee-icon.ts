/**
 * @file The umbraCoffee cup, as the tray and the reminder draw it: the app's own icon, Umbraco's
 * `icon-coffee` (the one the launcher and the taskbar button show), inlined so its three steam
 * strokes can rise on their own while an episode is live.
 *
 * In one place so the tray's cup and the reminder's cannot drift apart: the owner chose the rule
 * (2026-10-11) that the cup is plain while an episode is coming up and steams once it is live, with
 * no other mark for "live".
 */

import { css, html, nothing, svg, type TemplateResult } from '@umbraco-cms/backoffice/external/lit';

/**
 * The cup. The paths are `icon-coffee`'s, split into its three steam strokes and the cup, in its own
 * 24-unit grid. It strokes in `currentColor`, so it takes the colour of wherever it is drawn: the
 * taskbar's text under every theme, the toast's text in a reminder. The size is the caller's, set on
 * the `svg` in its styles.
 * @param steaming Whether the steam rises: true while an episode is live.
 * @returns The SVG.
 */
export function coffeeIcon(steaming: boolean): TemplateResult {
  return html`<svg class="coffee" viewBox="0 0 24 24" aria-hidden="true">
    ${steaming
      ? svg`<g class="steam"><path d="M6 2v2"></path><path d="M10 2v2"></path><path d="M14 2v2"></path></g>`
      : nothing}
    <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"></path>
  </svg>`;
}

/**
 * The cup's strokes and its steam's motion: each stroke rises and fades in turn, a second apart,
 * and stands still for anyone who has asked for less motion, when the steam alone still says "live".
 */
export const coffeeIconStyles = css`
  svg.coffee {
    display: block;
    overflow: visible;
    color: inherit;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.75;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (prefers-reduced-motion: no-preference) {
    svg.coffee .steam path {
      animation: umbracoffee-steam 3s ease-in-out infinite;
    }

    svg.coffee .steam path:nth-child(2) {
      animation-delay: -1s;
    }

    svg.coffee .steam path:nth-child(3) {
      animation-delay: -2s;
    }
  }

  @keyframes umbracoffee-steam {
    0% {
      transform: translateY(1.5px);
      opacity: 0;
    }
    40% {
      opacity: 1;
    }
    100% {
      transform: translateY(-2px);
      opacity: 0;
    }
  }
`;
