import { css, customElement, html, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbChangeEvent } from '@umbraco-cms/backoffice/event';

/**
 * The welcome wizard's last page: one switch, off, with the label Desktop settings uses, and one
 * line saying it applies from the next visit (design doc §3.4).
 *
 * That line is not a limitation being hidden: the setting is read during boot, before the desktop
 * exists, so it cannot apply to the visit that set it. Saying so stops the switch looking broken.
 */
@customElement('umbradesktop-welcome-sign-in')
export class UmbraDesktopWelcomeSignInPageElement extends UmbLitElement {
  /** Whether the desktop should open when the user signs in. */
  @property({ type: Boolean })
  public checked = false;

  /**
   * Take the switch's new state and report it.
   * @param event The toggle's change event.
   */
  #onChange = (event: Event) => {
    this.checked = !!(event.target as HTMLInputElement | null)?.checked;
    this.dispatchEvent(new UmbChangeEvent());
  };

  override render() {
    return html`
      <div class="row">
        <uui-toggle
          label=${this.localize.term('umbraDesktop_bootIntoDesktop')}
          ?checked=${this.checked}
          @change=${this.#onChange}></uui-toggle>
        <p class="hint">${this.localize.term('umbraDesktop_welcomeSignInHint')}</p>
      </div>
    `;
  }

  static override styles = css`
    :host {
      display: block;
    }

    .row {
      width: min(520px, 100%);
      margin: 0 auto;
      padding: 20px 22px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
    }

    uui-toggle {
      font-size: 16px;
      font-weight: 600;
      /* The toggle's track and label read the backoffice's tokens, which are made for a light or
         dark surface rather than this fixed navy one. */
      --uui-toggle-background-color: rgba(255, 255, 255, 0.2);
      --uui-toggle-border-color: rgba(255, 255, 255, 0.28);
      --uui-color-border-emphasis: rgba(255, 255, 255, 0.45);
      --uui-color-selected: #3544b1;
      --uui-color-selected-emphasis: #2152a3;
      --uui-color-selected-contrast: #fff;
      color: inherit;
    }

    .hint {
      margin: 10px 0 0;
      font-size: 13px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.72);
    }
  `;
}

export default UmbraDesktopWelcomeSignInPageElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-welcome-sign-in': UmbraDesktopWelcomeSignInPageElement;
  }
}
