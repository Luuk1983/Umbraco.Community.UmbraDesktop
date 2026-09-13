import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * One row in the settings panel: something to look at, what it is, and a chevron.
 *
 * The same component at both levels — a category in the list, and a setting inside a category —
 * because they are the same gesture. That is the whole argument for the shape: the panel teaches
 * you one row and then never asks you to learn another.
 *
 * **The chevron is a claim, and it has to be true.** It says "this opens somewhere you come back
 * from", which is what every row using this does: a category pushes a screen you can go back from,
 * and a setting opens a picker that applies as you click and closes when you say so. A row that
 * ended in a dialog with OK and Cancel should not be one of these.
 *
 * What goes in the `lead` slot is the caller's: a theme preview, a wallpaper thumbnail, an icon.
 * The row sizes nothing there, so a 144px preview and a 24px icon both sit in it without this
 * element knowing which it got.
 */
@customElement('umbradesktop-settings-row')
export class UmbraDesktopSettingsRowElement extends UmbLitElement {
  /** What this row is: a category's name, a theme's name, a wallpaper's name. */
  @property({ type: String })
  public headline = '';

  /** The line under it, saying what is set inside. Omitted when the headline says everything. */
  @property({ type: String })
  public detail = '';

  /**
   * Focus lands on the button inside, so a caller can `focus()` the row without reaching into its
   * shadow root — which is what returning focus to the row you came from needs.
   */
  static override shadowRootOptions: ShadowRootInit = {
    ...UmbLitElement.shadowRootOptions,
    delegatesFocus: true,
  };

  override render() {
    return html`
      <button type="button">
        <slot name="lead"></slot>
        <span class="text">
          <span class="headline">${this.headline}</span>
          ${this.detail ? html`<span class="detail">${this.detail}</span>` : nothing}
        </span>
        <uui-icon class="chevron" name="icon-navigation-right"></uui-icon>
      </button>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      /* The negative margin lets the hover fill reach past the panel's own padding, so the row
         reads as the width of the panel the way a list row does, rather than as a button that
         happens to be wide. */
      button {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        width: calc(100% + var(--uui-size-space-3) * 2);
        margin: 0 calc(var(--uui-size-space-3) * -1);
        /* Taller than the text needs. A list of rows this short reads as a stack of labels until
           each one has room around it, and the hover fill has to look like a row rather than a
           highlighted line of text. */
        padding: var(--uui-size-space-4) var(--uui-size-space-3);
        border: 0;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: inherit;
        text-align: left;
        cursor: pointer;
      }
      button:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .headline {
        font-weight: 700;
      }
      .detail {
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* At the trailing edge, where a "there is more this way" marker belongs.

         'flex-shrink: 0' is not tidiness. A flex item shrinks by default, and this one has nothing
         to give: beside a row whose detail wrapped to three lines the chevron came out at about
         half the size it has beside a one-line row, so one screen showed two sizes of the same
         marker. The text is the only thing here that should resize. */
      .chevron {
        flex-shrink: 0;
        margin-left: auto;
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
    `,
  ];
}

export default UmbraDesktopSettingsRowElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-row': UmbraDesktopSettingsRowElement;
  }
}
