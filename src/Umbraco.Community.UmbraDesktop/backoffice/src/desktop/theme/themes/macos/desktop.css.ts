import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The desktop root: centres the dock (its own `.bar` already shrinks to content width; this
 * belt-and-braces centres the host too) and drops the Umbraco watermark — decorative, not an
 * affordance, and one of the two sanctioned exceptions to "restyle, never remove".
 */
export default css`
  umbradesktop-taskbar {
    display: flex;
    justify-content: center;
  }
  .wallpaper-brand {
    display: none;
  }
`;
