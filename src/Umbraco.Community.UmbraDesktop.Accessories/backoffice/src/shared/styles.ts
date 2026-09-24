import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The surfaces every accessory is built from, written once.
 *
 * Each app is one custom element in its own window, and they share no state and no shell (the
 * desktop-apps design's §11 is explicit that a shared frame around several apps would make them one
 * app wearing several names). What they do share is a look, because Notepad's toolbar and
 * Calculator's keys are the same control under the same theme. So this is ordinary code reuse: one
 * stylesheet each element adopts next to its own, and nothing else.
 *
 * Every rule reads the app tokens with the fallbacks `docs/desktop-apps.md` §4 publishes, so the
 * apps render as the Umbraco theme with no theme set. The guide's traps all apply and are honoured
 * here rather than repeated per app: `background`, never `background-color`, since a surface token
 * may carry a gradient; lines between controls in `border`, not `edge-dark`, since only `border`
 * promises contrast; the sunken edge as a spread shadow rather than a border, so it costs no layout
 * and no declared size depends on a theme's bevel width; and every per-theme block a refinement on
 * top of correct unbranched rules, changing appearance and never geometry.
 */
export const accessoryStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-height: 100%;
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    font-family: var(--umbradesktop-app-font, inherit);
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  /* A control a person presses: a toolbar button, a calculator key, a palette well. Fixed-size and
     border-box wherever it is used, so its border is inside its box and costs nothing, which is
     the case the guide keeps a border for. */
  .control {
    display: inline-grid;
    place-items: center;
    padding: 0 10px;
    font: inherit;
    font-family: var(--umbradesktop-app-font, inherit);
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border: var(--umbradesktop-app-edge-width, 1px) solid
      var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    border-radius: var(--umbradesktop-app-radius, 3px);
    box-shadow: inset var(--umbradesktop-app-edge-width, 1px) var(--umbradesktop-app-edge-width, 1px)
      0 var(--umbradesktop-app-edge-light, transparent);
    cursor: pointer;
  }

  .control:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: -2px;
  }

  /* A control that is switched on: the pencil tool while it is the pencil, word wrap while it
     wraps. The accent and its own text colour, because white is unreadable on some themes' accent
     and that is the reason accent-text exists. */
  .control[aria-pressed='true'] {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
  }

  /* A recessed field: Notepad's page, Calculator's display, Paint's canvas well. The ring is a
     one-pixel spread shadow in border rather than a border of edge-width in edge-dark, for the two
     reasons Minesweeper's well gives: a border would put a theme's bevel width into the declared
     size, and edge-dark is allowed to be invisible. */
  .sunken {
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  /* A strip of controls along the top of an app. */
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .muted {
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  /* Windows 98's two-tone bevels, which are structure rather than a value, so no token pair can say
     them: edge-light and edge-dark are one colour each and a real bevel is two per edge. The greys
     are that operating system's own, hardcoded for that reason. Appearance only: box-shadow and
     border colour take no layout, so every size the manifests declare holds under this theme too. */
  :host([data-umbradesktop-theme='win98']) .control {
    border-color: transparent;
    box-shadow:
      inset -1px -1px #000,
      inset 1px 1px #fff,
      inset -2px -2px #808080,
      inset 2px 2px #dfdfdf;
  }

  :host([data-umbradesktop-theme='win98']) .control[aria-pressed='true'],
  :host([data-umbradesktop-theme='win98']) .control:active {
    box-shadow:
      inset 1px 1px #000,
      inset -1px -1px #fff,
      inset 2px 2px #808080,
      inset -2px -2px #dfdfdf;
  }

  :host([data-umbradesktop-theme='win98']) .sunken {
    box-shadow:
      inset 1px 1px #808080,
      inset -1px -1px #fff,
      inset 2px 2px #000,
      inset -2px -2px #dfdfdf;
  }
`;
