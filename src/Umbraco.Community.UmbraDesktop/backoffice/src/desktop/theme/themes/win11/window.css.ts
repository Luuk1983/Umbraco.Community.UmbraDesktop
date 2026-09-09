import { css, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { W11_FONT } from './palette.js';
import { W11_TITLEBAR_HEIGHT } from './metrics.js';

/**
 * The Windows 11 window: a seamless 32px caption over an 8px rounded frame, with contiguous
 * full-height caption buttons at the trailing end.
 *
 * There is very little here, and that is the point — almost everything this theme does to a
 * window is a value, so it goes through the palette. What is left is the caption's own box, the
 * title's weight, and undoing two base rules written for a different typeface and a different
 * inactive treatment.
 *
 * No `order` on the controls, unlike macOS: Windows renders reload, minimize, maximize, close
 * left to right, which is already the DOM order.
 */
export default css`
  :host {
    font-family: ${unsafeCSS(W11_FONT)};
  }
  /* box-sizing so the caption's height token means the whole band. There is no hairline under it
     to absorb here — W11_TITLEBAR_BORDER is 0, and metrics.test.ts asserts that stays true — but
     stating it keeps the caption honest if one is ever added. */
  .titlebar {
    box-sizing: border-box;
    min-height: ${W11_TITLEBAR_HEIGHT}px;
    padding-left: 12px;
  }
  .title {
    font-size: 12px;
    /* Windows captions are not bold; the base sets 700 for the Umbraco theme's heavier bar. */
    font-weight: 400;
  }
  /* '.app-icon' and not '.title umb-icon': the severity marker is an 'umb-icon' in this same
     caption now, and 16px is the app icon's size, not the marker's. */
  .title .app-icon {
    font-size: 16px;
  }
  /* The base nudges the title down a pixel because Lato sits high in its line box. Segoe does
     not, and inheriting the nudge just knocks the title off centre. */
  .title-text {
    transform: none;
  }
  /* Windows fades an inactive caption's *text* and leaves its buttons alone. The base fades the
     controls with the title, so they are restored here — a caption button on an unfocused
     Windows window is as crisp and as clickable as on a focused one. */
  .frame:not(.active) .controls {
    opacity: 1;
  }
  /* Square, contiguous, full height. The corner button reaching the frame's edge is deliberate
     Fitts's-law behaviour that the base already renders and this theme keeps; the frame's
     overflow: hidden is what rounds the outermost one against the 8px corner. */
  .ctrl {
    border-radius: 0;
    transition: background-color 90ms ease;
  }
  /* Windows 11's in-app info bar is a Mica-ish neutral sheet with the severity carried by the icon
     beside the text, not a tinted band — the pale yellow wash this used to paint was the one thing
     the base design moved away from, and repeating it here would have put it straight back. Kept
     translucent, because every other surface in this theme is. */
  .notice {
    background: var(--umbradesktop-notice-background, rgba(249, 249, 249, 0.92));
    color: var(--umbradesktop-notice-text, #1a1a1a);
    border-bottom-width: 1px;
  }
  /* The buttons are 'uui-button's now, so their radius is reached through UUI's own custom property
     rather than by selecting into a shadow root this sheet cannot see. */
  .notice .notice-actions uui-button {
    --uui-button-border-radius: 4px;
  }
`;
