import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import {
  U4_EDGE,
  U4_FONT,
  U4_HILIGHT,
  U4_PRESSED,
  U4_RAISED,
  U4_SELECT_LINE,
  U4_TASK_ACTIVE,
  U4_WELL,
} from './palette.js';
import { U4_TASKBAR_HEIGHT, U4_TASKBAR_PADDING } from './metrics.js';

/**
 * The taskbar is the one surface with no Umbraco 4 antecedent: v4 was a web application and had
 * nothing of the kind. So rather than being copied, it is assembled from v4's own vocabulary —
 * raised grey buttons with a white top edge, a hairline along the bar, and the clock in a sunken
 * white well — which keeps it period-correct while being invented outright.
 *
 * Nothing here positions the launcher. That panel is mounted inside this component's shadow root,
 * so the base rule owns its geometry, and for this theme that rule needs only the two palette
 * tokens it already reads: '--umbradesktop-launcher-left', which opens the panel hard against the
 * screen's leading edge, and '--umbradesktop-launcher-bottom', which defaults to the bar's own
 * reserve and sits the panel directly on top of it. Between them they put the launcher exactly
 * where v4 kept its Sections panel, which is why this theme needs no repositioning at all.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(U4_FONT)};
  }
  /* box-sizing so the bar's top hairline and its padding come out of the height the token
     declares rather than being added to it. The height is also metrics.taskbarReserve, and a bar
     taller than the space reserved for it would let windows slide underneath — measured, not
     assumed, in metrics.test.ts. The buttons inside keep the base rule's height: 100% and simply
     end up shorter, which is what insets them from the bar's edges the way a 2009 toolbar was. */
  .bar {
    box-sizing: border-box;
    height: ${U4_TASKBAR_HEIGHT}px;
    padding: ${U4_TASKBAR_PADDING}px;
    gap: ${U4_TASKBAR_PADDING}px;
  }
  .cluster {
    gap: ${U4_TASKBAR_PADDING}px;
  }
  /* Every button on the bar is the same raised object: a gradient face, a hairline edge, and the
     1px of white inside the top that makes it read as raised at all. box-sizing keeps the edge
     inside the height the base gives them. */
  .start,
  .task {
    box-sizing: border-box;
    border: 1px solid ${unsafeCSS(U4_EDGE)};
    border-radius: 3px;
    background: ${unsafeCSS(U4_RAISED)};
    box-shadow: inset 0 1px 0 ${unsafeCSS(U4_HILIGHT)};
    font-size: 11px;
    /* v4 had no cross-fades, and a gradient that fades between raised and pressed looks like a
       rendering fault rather than a transition. */
    transition: none;
  }
  .start {
    gap: 5px;
    padding: 0 8px 0 5px;
    font-weight: 700;
  }
  .start umb-icon {
    font-size: 17px;
  }
  /* The label. A theme cannot add DOM, so it arrives as generated content — and it cannot invent
     the word either: a string written in here is invisible to the localization files and would
     stay English in every language. The button already carries a title, which is its accessible
     name, so rendering that gives the visible label and the accessible name the same words and
     means the label follows the title wherever it comes from. Guarded by taskbar.test.ts, which
     compares the rendered label against the live title rather than against an expected string. */
  .start::after {
    content: attr(title);
    /* Capped, because a translation is free to be long and the running task list beside it is
       what should give way rather than the bar. A block box so text-overflow applies. */
    display: block;
    max-width: 110px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* Held down for as long as the launcher is open, which is what a 2009 toggle looked like. */
  .start.active {
    background: ${unsafeCSS(U4_PRESSED)};
    border-color: #8d887e;
    box-shadow: inset 1px 1px 2px rgba(0, 0, 0, 0.18);
  }
  .running {
    gap: ${U4_TASKBAR_PADDING}px;
    margin-left: ${U4_TASKBAR_PADDING}px;
  }
  .task {
    gap: 5px;
    padding: 0 7px;
  }
  .task umb-icon {
    font-size: 14px;
    /* The base pulls the icon left to balance the transparent padding inside an Umbraco glyph
       against a wider label gap. This theme's gap is tight enough that the pull just clips the
       glyph against the button's edge. */
    margin-left: 0;
  }
  /* The base nudges the label down a pixel for Lato, which Verdana does not need. */
  .task-label {
    transform: none;
  }
  /* The focused window's button is held down and filled blue — v4's selection colour, and the
     same fill its tree used for the selected node. This *replaces* the base rule's coral
     underline, which is fed by '--umbradesktop-task-active-marker': that token is deliberately
     left unset in the palette, so if this rule ever stops matching the marker does not vanish, it
     reverts to Umbraco coral on a warm grey bar. taskbar.test.ts is what notices. */
  .task.active {
    background: ${unsafeCSS(U4_TASK_ACTIVE)};
    border-color: ${unsafeCSS(U4_SELECT_LINE)};
    box-shadow: inset 1px 1px 2px rgba(40, 70, 110, 0.2);
    font-weight: 700;
  }
  /* The clock sits in a sunken white well, as every v4 field did. The base leaves it an inline
     flex item sized by its own text, so it has to be stretched and re-padded before an edge
     around it means anything. */
  .clock {
    align-self: stretch;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    margin-left: ${U4_TASKBAR_PADDING}px;
    padding: 0 7px;
    border: 1px solid ${unsafeCSS(U4_EDGE)};
    border-radius: 3px;
    background: ${unsafeCSS(U4_WELL)};
    box-shadow: inset 1px 1px 0 #e2ded6;
    font-size: 11px;
    /* The base dims the clock to 0.85 against a dark bar. On a warm grey one that just reads as a
       rendering artefact. */
    opacity: 1;
  }
`;
