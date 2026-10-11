import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { UMBRADESKTOP_TITLEBAR_BORDER } from '../../../constants.js';
import { UMBRACO_CONTROL_FACE } from './metrics.js';
import { UMBRACO_LIGHT_DANGER } from './palette.js';

/**
 * The Umbraco window, for the parts a palette cannot say.
 *
 * Most of this theme is values and lives in `palette.ts`: the navy caption, the round corner, the
 * tinted shadow, the hover faces. What is here is what needs a state or a shape.
 *
 * **The unfocused caption.** A palette has one value per token and a window needs two, so the
 * unfocused frame redeclares the tokens the focused one set. They are redeclared on `.frame` rather
 * than restyled on `.titlebar` and `.title`, and the difference is the point: every reader of those
 * tokens, including the unsaved marker whose colour chains from the caption's text, follows along
 * without this sheet knowing it exists. A restyle would have to find each of them.
 *
 * **The title is Regular.** Light text on the navy reads heavier than the same weight on white, so
 * the Bold the base draws for the Umbraco look came out as the heavy line this theme set out to fix.
 * Lato ships Light, Regular, Bold and Black, so there is no 600 to step down to.
 *
 * **There is no line under the title.** One was tried, in the colour of the active section's marker,
 * and dropped: pale coral on navy read as a smear along the caption's edge, and it repeated the
 * identical line under the active tab in the content a hundred pixels below it. The navy caption is
 * what says a window is in front. The line under the focused window's taskbar button stays.
 *
 * Nothing here changes a box. The caption is still 40px, the buttons are still 46px wide and the
 * frame ring is still 1px, which is why this theme's `metrics` are still the base chrome's.
 */
export default css`
  /* The unfocused caption: sand, with navy ink at enough strength to read. 70 percent is where the
     title clears 4.5:1 on sand; the 55 the first mock used was a prettier 3.4:1. */
  .frame:not(.active) {
    --umbradesktop-titlebar-background: var(--uui-color-surface-alt);
    --umbradesktop-titlebar-border-bottom: ${UMBRADESKTOP_TITLEBAR_BORDER}px solid
      color-mix(in srgb, var(--uui-color-interactive) 10%, transparent);
    --umbradesktop-titlebar-text: color-mix(in srgb, var(--uui-color-interactive) 70%, transparent);
    --umbradesktop-control-color: color-mix(in srgb, var(--uui-color-interactive) 70%, transparent);
    --umbradesktop-control-hover-background: radial-gradient(
      circle ${UMBRACO_CONTROL_FACE / 2}px at 50% 50%,
      color-mix(in srgb, var(--uui-color-interactive) 9%, transparent) ${UMBRACO_CONTROL_FACE / 2 - 1}px,
      transparent ${UMBRACO_CONTROL_FACE / 2}px
    );
    /* Not a solid disc: on a quiet caption a red one would be the loudest thing on the screen. A
       pale wash with a danger glyph says the same thing, and a white glyph would vanish on sand. */
    --umbradesktop-control-close-hover-background: radial-gradient(
      circle ${UMBRACO_CONTROL_FACE / 2}px at 50% 50%,
      color-mix(in srgb, var(--uui-color-danger) 13%, transparent) ${UMBRACO_CONTROL_FACE / 2 - 1}px,
      transparent ${UMBRACO_CONTROL_FACE / 2}px
    );
    --umbradesktop-control-close-hover-color: var(--uui-color-danger);
    /* A progress ring on the sand: the base's own blue is right here, written against a light
       caption, so it is stated rather than left to chain from the focused values above. A window
       uploading in the background is the usual reason it is ever drawn. */
    --umbradesktop-titlebar-progress-fill: var(--uui-color-interactive-emphasis);
    --umbradesktop-titlebar-progress-track: color-mix(in srgb, var(--uui-color-interactive-emphasis) 22%, transparent);
    --umbradesktop-titlebar-progress-failed: var(--uui-color-danger);
  }
  /* The error marker in a focused caption. Umbraco's danger-standalone is a dark maroon, darkened to
     read on a white ground, and on the navy it measured 2.1 to 1. This lightens it for the caption
     alone: scoped to the titlebar, so the notice banner under it, which is a pale pink, keeps the
     dark one it was drawn for. Warning needs nothing, its dark mustard clears 3 to 1 on navy. */
  .frame.active .titlebar {
    --umbradesktop-notice-error-color: ${unsafeCSS(UMBRACO_LIGHT_DANGER)};
  }
  /* Regular, for the reason in the note above. */
  .title {
    font-weight: 400;
  }
  /* Rounder strokes to go with round faces: the base draws them square, which suits a square hover. */
  .ctrl .glyph {
    stroke-width: 1.3;
    stroke-linecap: round;
  }
  .ctrl .glyph.ring {
    stroke-width: 1.5;
  }
  /* The pane header's buttons and the Dock button are about 20px tall, in a strip 28px high. Their
     touch target grows to the strip's own height through an overlay, never through padding, which
     would move the button and change the strip. Vertical only, on purpose: the pane's three buttons
     sit a few pixels apart, so widening each would make neighbours' targets overlap and a tap on
     one land on another. That makes this 28px, which clears WCAG 2.5.8's 24px and is short of
     Apple's 44. The strip cannot be taller without costing content, and its height is a metric. */
  .pane-button,
  .attached-dock {
    position: relative;
  }
  .pane-button::after,
  .attached-dock::after {
    content: '';
    position: absolute;
    top: -4px;
    bottom: -4px;
    left: 0;
    right: 0;
  }
`;
