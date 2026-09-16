import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Stands in for something that could not be read because somebody lacks a permission.
 *
 * One component for both directions, which is the point of it. A permission can be missing here, on
 * the instance the desktop runs on, or over there, on the API user of a connected instance, and
 * those are fixed by different people — but they should look like the same kind of answer rather
 * than like one feature being broken and another being absent. Nothing is ever hidden because of a
 * permission: the affordance stays and explains itself, which is the same rule the themes follow.
 */
@customElement('umbradesktop-permission-card')
export class UmbraDesktopPermissionCardElement extends UmbLitElement {
  /**
   * The instance whose API user is missing the permission, when the refusal came from over there.
   *
   * Left unset for a permission missing on this instance, which is what switches the wording: an
   * explanation naming a client's site would be nonsense when the thing to fix is here.
   */
  @property({ type: String })
  public connectionName?: string;

  /** @returns The card. */
  override render() {
    return html`
      <div class="card" role="note">
        <uui-icon name="icon-lock"></uui-icon>
        <div>
          <strong>${this.localize.term('umbraDesktop_permissionNeeded')}</strong>
          <p>
            ${this.connectionName
              ? this.localize.term('umbraDesktop_permissionNeededRemote', this.connectionName)
              : this.localize.term('umbraDesktop_permissionNeededLocal')}
          </p>
        </div>
      </div>
    `;
  }

  /** Styles. Tokens rather than literals, so every theme restyles this without changing it. */
  static override styles = [
    css`
      :host {
        display: block;
      }

      .card {
        display: flex;
        gap: var(--uui-size-space-4, 12px);
        align-items: flex-start;
        padding: var(--uui-size-space-4, 12px);
        border: 1px solid var(--uui-color-border, #d8d7d9);
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-surface-alt, #f3f3f5);
      }

      uui-icon {
        flex: 0 0 auto;
        margin-top: 2px;
        color: var(--uui-color-warning-emphasis, #fbd142);
      }

      p {
        margin: 4px 0 0;
        color: var(--uui-color-text-alt, #515054);
      }
    `,
  ];
}

export default UmbraDesktopPermissionCardElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-permission-card': UmbraDesktopPermissionCardElement;
  }
}
