import { css } from '@umbraco-cms/backoffice/external/lit';

/**
 * The four health colours, from UUI's own, declared once on each element that stands on its own: the
 * window, and the details pane, which the desktop mounts outside it (design §16.15). Every theme
 * restyles them through UUI, and every screen reads the same four.
 */
export const healthColours = css`
  :host {
    --umbradesktop-health-unused: var(--uui-color-danger);
    --umbradesktop-health-orphaned: var(--uui-color-warning);
    --umbradesktop-health-oversized: var(--uui-color-positive);
    --umbradesktop-health-fine: var(--umbradesktop-app-accent, var(--uui-color-interactive));
  }
`;

/**
 * What every Media Health screen shares: the colour of each kind, read from the four tokens the
 * window declares once on its host (`media-health.element.ts`), so a theme restyles them in one place
 * and the bar, the rows, the dots and the cards can never disagree.
 */
export const healthScreenStyles = css`
  [data-kind='unused'] {
    --umbradesktop-health-colour: var(--umbradesktop-health-unused);
  }

  [data-kind='orphaned'] {
    --umbradesktop-health-colour: var(--umbradesktop-health-orphaned);
  }

  [data-kind='oversized'] {
    --umbradesktop-health-colour: var(--umbradesktop-health-oversized);
  }

  [data-kind='fine'] {
    --umbradesktop-health-colour: var(--umbradesktop-health-fine);
  }

  .dot {
    display: inline-block;
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    margin-right: 6px;
    vertical-align: -1px;
    background: var(--umbradesktop-health-colour);
  }

  .muted {
    color: var(--uui-color-text-alt);
    font-size: var(--uui-type-small-size, 12px);
  }
`;
