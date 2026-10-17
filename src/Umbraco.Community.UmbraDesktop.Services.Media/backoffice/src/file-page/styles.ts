import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The File page's shared look, painted with the desktop's app tokens so every theme draws it in
 * its own idiom (`docs/developer/desktop-apps.md` §4). Each token is read with the backoffice's own
 * colour as its fallback, so the page still reads outside the desktop. Surfaces are `background:`
 * and never `background-color:`, because a theme's surface token may be a gradient.
 *
 * Its own copy of the base the add-ons share, since nothing is imported from another package.
 */
export const filePageStyles = css`
  :host {
    box-sizing: border-box;
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    font-family: var(--umbradesktop-app-font, inherit);
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  h2 {
    margin: 0;
    font-size: 22px;
    font-weight: 700;
  }

  p {
    margin: 0;
  }

  .muted {
    color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
  }

  /* A button the person presses: a big target, per D2, in the theme's control face. */
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 16px;
    font: inherit;
    font-family: var(--umbradesktop-app-font, inherit);
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    border-radius: var(--umbradesktop-app-radius, 3px);
    box-shadow: inset var(--umbradesktop-app-edge-width, 1px) var(--umbradesktop-app-edge-width, 1px) 0
      var(--umbradesktop-app-edge-light, transparent);
    cursor: pointer;
  }

  /* The one action a page is for: in the accent, with the accent's own text colour. */
  .button.primary {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
  }

  .button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .button:focus-visible,
  input:focus-visible,
  .choice:focus-within {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }

  /* A recessed field, ringed with the border token, which stays visible on every surface. */
  input[type='text'] {
    min-height: 36px;
    padding: 0 8px;
    font: inherit;
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border: none;
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }
`;
