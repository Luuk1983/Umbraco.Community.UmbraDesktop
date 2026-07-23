import { UMBRADESKTOP_SECTION_PATHNAME } from '../desktop/constants';
import { css, customElement, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Header-app launcher for UmbraDesktop: an icon button in the top-right backoffice header
 * (alongside Search / Help / the current user) that navigates into the Desktop section route.
 * The manifest gates it on a section-user-permission condition, so it renders only for users who
 * may access the desktop. See the header-app launcher design doc (2026-07-23).
 */
@customElement('umbradesktop-header-app')
export class UmbraDesktopHeaderAppElement extends UmbLitElement {
  /** Render the launcher button. The `href` uses the backoffice router (same as the section tabs). */
  override render() {
    const label = this.localize.term('umbraDesktop_launchDesktop');
    return html`
      <uui-button
        look="primary"
        label=${label}
        title=${label}
        href="section/${UMBRADESKTOP_SECTION_PATHNAME}"
        compact>
        <umb-icon name="icon-desktop"></umb-icon>
      </uui-button>
    `;
  }

  static override styles = [
    css`
      /* Match the flat, transparent header glyphs (Search/Help/user): the core header-app button
         kind sets these same custom properties, so the primary look reads as a plain icon here. */
      uui-button {
        font-size: 18px;
        --uui-button-background-color: transparent;
        --uui-button-background-color-hover: var(--uui-color-emphasis);
      }
    `,
  ];
}

export default UmbraDesktopHeaderAppElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-header-app': UmbraDesktopHeaderAppElement;
  }
}
