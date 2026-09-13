import type { UmbraDesktopSettingsContext } from '../../settings.context';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../settings.context-token';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The settings that are not about how the desktop looks. One today: whether you land on it when you
 * sign in.
 *
 * Called General rather than System or Startup on purpose. Startup describes the only setting here
 * and would be wrong the moment a second one arrives; System means machine-level things — display,
 * power, storage — that this package will never own, and `groupSystem` already means something else
 * in the launcher's catalogue.
 */
@customElement('umbradesktop-settings-general')
export class UmbraDesktopSettingsGeneralElement extends UmbLitElement {
  /** Whether this user boots straight into the desktop. */
  @state()
  private _bootIntoDesktop = false;

  #settings?: UmbraDesktopSettingsContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_SETTINGS_CONTEXT, (context) => {
      this.#settings = context ?? undefined;
      if (!context) return;
      this.observe(context.bootIntoDesktop, (enabled) => (this._bootIntoDesktop = enabled === true));
    });
  }

  /**
   * One toggle, and the sentence that stops it looking broken.
   *
   * No sub-heading over it, unlike the two groups under Appearance: the toggle's own label says what
   * it does, and a heading over a single switch would be a label for a label. Add one when a second
   * setting arrives.
   *
   * The hint is load-bearing. The preference is read while the backoffice boots, so flipping it
   * changes nothing on screen, and a toggle that appears to do nothing reads as a bug. It also names
   * the escape hatch, because the desktop hides the backoffice header and somebody whose desktop
   * breaks needs a way back that does not depend on the desktop.
   * @returns The screen's contents.
   */
  override render() {
    return html`
      <uui-toggle
        label=${this.localize.term('umbraDesktop_bootIntoDesktop')}
        ?checked=${this._bootIntoDesktop}
        @change=${(event: Event) =>
          this.#settings?.setBootIntoDesktop(!!(event.target as HTMLInputElement | null)?.checked)}></uui-toggle>
      <p class="hint">${this.localize.term('umbraDesktop_bootDescription')}</p>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* A hint that explains the control above it rather than the one below. */
      .hint {
        margin: var(--uui-size-space-3) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
    `,
  ];
}

export default UmbraDesktopSettingsGeneralElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-general': UmbraDesktopSettingsGeneralElement;
  }
}
