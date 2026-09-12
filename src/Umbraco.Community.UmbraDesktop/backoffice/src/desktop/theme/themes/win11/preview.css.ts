import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * What the settings picker's miniature of this theme cannot get from the palette: Windows 11 puts
 * the Start button and the task buttons in the *middle* of the taskbar, which is the one thing
 * everybody names about it and is a layout rule rather than a value, so the theme's own taskbar
 * sheet carries it and its palette cannot.
 *
 * Written against the preview element's class names, which are deliberately the chrome's own.
 */
export default css`
  .taskbar {
    justify-content: center;
  }
  /* Square-ish tiles rather than the base preview's wider task pills, matching how this theme's
     taskbar sizes its own buttons. */
  .start,
  .task {
    width: 40px;
    border-radius: 4px;
  }
`;
