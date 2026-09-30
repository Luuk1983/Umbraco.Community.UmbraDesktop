import type {
  DesktopLabelCornerModel,
  DesktopLabelRequestModel,
  DesktopLabelResponseModel,
} from '../../../../api/types.gen';
import type { UmbraDesktopLabelContext } from '../../../desktop-label/desktop-label.context';
import { UMBRADESKTOP_DESKTOP_LABEL_CONTEXT } from '../../../desktop-label/desktop-label.context-token';
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The four corners in the order the picker lists them: the default first, then the rest going round
 * the desktop anticlockwise, so neighbouring corners sit next to each other in the list.
 */
const CORNERS: ReadonlyArray<{ value: DesktopLabelCornerModel; term: string }> = [
  { value: 'TopRight', term: 'umbraDesktop_siteDesktopLabelCornerTopRight' },
  { value: 'TopLeft', term: 'umbraDesktop_siteDesktopLabelCornerTopLeft' },
  { value: 'BottomLeft', term: 'umbraDesktop_siteDesktopLabelCornerBottomLeft' },
  { value: 'BottomRight', term: 'umbraDesktop_siteDesktopLabelCornerBottomRight' },
];

/**
 * The Site screen's controls for the desktop label: whether it is shown, which corner it sits in,
 * and whether the domain goes underneath.
 *
 * Its own element rather than more of the Site screen, because it talks to a different endpoint
 * through a different context, and because that screen shows nothing but a loader until the app
 * identity has loaded. Kept apart, these controls can be tested against a stand-in server.
 *
 * There is no name field here. The label's text is the App name, edited in the Name box above, so a
 * site has one name to set rather than two that can disagree.
 */
@customElement('umbradesktop-settings-desktop-label')
export class UmbraDesktopSettingsDesktopLabelElement extends UmbLitElement {
  /** The label as the server last reported it, or null before it has loaded. */
  @state()
  private _label: DesktopLabelResponseModel | null = null;

  /** The desktop's label context, which holds the label and saves it. */
  #context?: UmbraDesktopLabelContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_DESKTOP_LABEL_CONTEXT, (context) => {
      this.#context = context;
      this.observe(context?.label, (label) => (this._label = label ?? null), 'umbraDesktopLabel');
    });
  }

  /**
   * Store the switches with one of them changed.
   *
   * **All three go on every save.** The server stores them as one document, so a save carrying only
   * the switch that changed would reset the other two.
   * @param change The switch that changed.
   */
  #save(change: Partial<DesktopLabelRequestModel>): void {
    if (!this._label) return;
    const { show, corner, showDomain } = this._label;
    void this.#context?.save({ show, corner, showDomain, ...change });
  }

  /**
   * The switch, the corner and the domain, as three rows.
   *
   * The corner and the domain are always drawn and only disabled while the label is off. Hidden,
   * they made the screen jump under the pointer the moment the switch was flipped, and an admin
   * could not see what else there was to set before deciding.
   *
   * Nothing at all before the label has loaded, so a control never shows a default and then jumps
   * to the stored value.
   * @returns The controls.
   */
  override render() {
    if (!this._label) return nothing;
    const { show, corner, showDomain } = this._label;

    return html`
      <div class="row">
        <uui-toggle
          label=${this.localize.term('umbraDesktop_siteDesktopLabelShow')}
          ?checked=${show}
          @change=${(event: Event) =>
            this.#save({ show: !!(event.target as HTMLInputElement | null)?.checked })}></uui-toggle>
        <p class="hint">${this.localize.term('umbraDesktop_siteDesktopLabelShowAbout')}</p>
      </div>
      <div class="row">
        <div class="field-label ${show ? '' : 'inapplicable'}">
          ${this.localize.term('umbraDesktop_siteDesktopLabelCorner')}
        </div>
        <uui-select
          label=${this.localize.term('umbraDesktop_siteDesktopLabelCorner')}
          ?disabled=${!show}
          .options=${CORNERS.map((option) => ({
            name: this.localize.term(option.term),
            value: option.value,
            selected: option.value === corner,
          }))}
          @change=${(event: Event) =>
            this.#save({ corner: (event.target as HTMLSelectElement).value as DesktopLabelCornerModel })}></uui-select>
      </div>
      <div class="row">
        <uui-toggle
          label=${this.localize.term('umbraDesktop_siteDesktopLabelDomain')}
          ?checked=${showDomain}
          ?disabled=${!show}
          @change=${(event: Event) =>
            this.#save({ showDomain: !!(event.target as HTMLInputElement | null)?.checked })}></uui-toggle>
        <p class="hint ${show ? '' : 'inapplicable'}">${this.localize.term('umbraDesktop_siteDesktopLabelDomainAbout')}</p>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* One setting per row, a hairline between them, the same rhythm as the other boxes on the
         Site screen. */
      .row {
        padding: var(--uui-size-space-4) 0;
      }
      .row:first-child {
        padding-top: 0;
      }
      .row:last-child {
        padding-bottom: 0;
      }
      .row + .row {
        border-top: 1px solid var(--uui-color-divider, var(--uui-color-border));
      }
      .field-label {
        font-weight: 700;
        margin-bottom: var(--uui-size-space-2);
      }
      .hint {
        margin: var(--uui-size-space-2) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* Text that belongs to a disabled control greys with it, so the row reads as one unit that
         does not apply yet rather than as live text beside a dead control. */
      .inapplicable {
        color: var(--uui-color-disabled-contrast, var(--uui-color-text-alt));
      }
      uui-select {
        display: block;
        max-width: 240px;
      }
    `,
  ];
}

export default UmbraDesktopSettingsDesktopLabelElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-desktop-label': UmbraDesktopSettingsDesktopLabelElement;
  }
}
