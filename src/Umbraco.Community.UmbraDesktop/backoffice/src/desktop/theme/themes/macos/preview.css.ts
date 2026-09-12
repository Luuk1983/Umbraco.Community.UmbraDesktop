import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { MACOS_TRAFFIC_LIGHTS } from './palette.js';

/**
 * What the settings picker's miniature of this theme cannot get from the palette.
 *
 * Two things, and both are the first thing anyone names about a Mac. The traffic lights are
 * colours the theme sets on *controls*, not on tokens, so a preview drawing its control glyphs in
 * `--umbradesktop-control-color` draws three grey dots where everyone expects red, amber and
 * green. And the dock is a dock because it is only as wide as its contents: the taskbar's own
 * tokens carry its radius and its margin, but "as wide as what is in it" is not a value, so
 * without this rule the pill stretches the full width of the scene and reads as a bar with
 * rounded ends.
 *
 * Written against the preview element's class names, which are deliberately the chrome's own:
 * `.taskbar`, `.controls`, `.start`, `.task`.
 */
export default css`
  /* A dock, not a bar. 'left: 50%' with the translate rather than 'margin: auto', because the
     margin shorthand is the theme's own token and setting it here would drop the bottom offset
     that lifts the dock off the screen edge. */
  .taskbar {
    right: auto;
    left: 50%;
    width: max-content;
    transform: translateX(-50%);
  }
  /* Dock icons are square-ish tiles of one size, where the base preview draws a start button and
     two wider task pills. */
  .start,
  .task {
    width: 36px;
    border-radius: 9px;
  }
  .controls.leading i {
    opacity: 1;
  }
  .controls.leading i:nth-child(1) {
    background: ${unsafeCSS(MACOS_TRAFFIC_LIGHTS.close)};
  }
  .controls.leading i:nth-child(2) {
    background: ${unsafeCSS(MACOS_TRAFFIC_LIGHTS.minimize)};
  }
  .controls.leading i:nth-child(3) {
    background: ${unsafeCSS(MACOS_TRAFFIC_LIGHTS.maximize)};
  }
`;
