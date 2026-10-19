import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The mode panels' shared look: boxes with a heading, buttons, a segmented choice, sliders, fields
 * and colour swatches, all in the desktop's app tokens so every theme draws them in its own idiom.
 * Surfaces are `background:` and never `background-color:` (`docs/developer/theming.md` §4).
 */
export const panelStyles = css`
  .panel h3 {
    margin: 0;
    font-size: 15px;
  }

  .box {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--umbradesktop-app-surface-raised, var(--uui-color-surface-emphasis));
    border-radius: var(--umbradesktop-app-radius, 3px);
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
  }

  .box > h4 {
    margin: 0;
    font-size: 13px;
    font-weight: 700;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .panel p {
    margin: 0;
    font-size: 13px;
  }

  /* A note led by an icon: the icon beside its first line, not on a line of its own. */
  .panel p:has(> umb-icon) {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .panel p > umb-icon {
    flex: none;
    margin-top: 2px;
  }

  .panel button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    font: inherit;
    font-size: 13px;
    font-family: var(--umbradesktop-app-font, inherit);
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface, var(--uui-color-surface));
    border: var(--umbradesktop-app-edge-width, 1px) solid var(--umbradesktop-app-edge-dark, var(--uui-color-border));
    border-radius: var(--umbradesktop-app-radius, 3px);
    box-shadow: inset var(--umbradesktop-app-edge-width, 1px) var(--umbradesktop-app-edge-width, 1px) 0
      var(--umbradesktop-app-edge-light, transparent);
    cursor: pointer;
  }

  .panel button.square {
    width: 40px;
    padding: 0;
  }

  .panel button umb-icon {
    font-size: 16px;
  }

  .panel button[aria-pressed='true'] {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    font-weight: 700;
  }

  .panel button.primary {
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    font-weight: 700;
  }

  .panel button:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .panel button:focus-visible,
  .panel input:focus-visible {
    outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
    outline-offset: 1px;
  }

  .segmented {
    display: flex;
    gap: 2px;
  }

  .segmented button {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 4px;
  }

  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 8px;
    font-size: 13px;
  }

  .slider input[type='range'] {
    grid-column: 1 / -1;
    width: 100%;
    accent-color: var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    font-size: 13px;
  }

  .field input {
    width: 100%;
    min-height: 32px;
    padding: 0 6px;
    font: inherit;
    color: var(--umbradesktop-app-text, var(--uui-color-text));
    background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
    border: none;
    box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  /* Resize's width, link and height on one row: the two fields share what the link leaves. */
  .size-row {
    flex-wrap: nowrap;
    align-items: flex-end;
  }

  .size-row .field {
    flex: 1 1 0;
  }

  .swatches {
    display: flex;
    gap: 6px;
  }

  /* Each swatch rings itself in the border token, which stays visible on every surface: a theme's
     control edge may be invisible, and the white swatch would then vanish into a white panel. */
  .swatches button {
    width: 32px;
    min-height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
  }

  .swatches button[aria-pressed='true'] {
    box-shadow:
      inset 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt)),
      0 0 0 2px var(--umbradesktop-app-surface, var(--uui-color-surface)),
      0 0 0 4px var(--umbradesktop-app-accent, var(--uui-color-selected));
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: auto;
  }
`;
