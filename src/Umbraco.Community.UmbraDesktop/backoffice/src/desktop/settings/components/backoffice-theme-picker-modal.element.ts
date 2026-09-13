import type { UmbraDesktopBackofficeThemePickerModalData } from '../modal-tokens';
import type { UmbraDesktopBackofficeTheme } from '../../theme/backoffice-themes';
import type { UmbraDesktopThemeContext } from '../../theme/theme.context';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';

/**
 * The picker onto the backoffice's *own* theme: Umbraco's Light, Dark and High contrast, the setting
 * that also lives in the current-user modal.
 *
 * **Names, not previews**, where the theme picker beside it is a column of miniature desktops. That
 * is the honest shape: what these change is the content inside every window — someone else's
 * document in an iframe — and a miniature of this package's chrome would preview the one part of the
 * screen they leave alone. It is also why this is a separate surface rather than three more rows in
 * that picker.
 *
 * **It applies and stays open**, as the theme picker does and for the same reason: a colour scheme
 * is something you flip between and look at, and the whole backoffice behind this sheet repaints as
 * you click.
 *
 * Applying goes through the desktop's theme context, which hands it to core's. Core is what stores
 * the alias and swaps the stylesheet, so there is one value with two front ends and no way for this
 * picker and the current-user modal to disagree about what is set.
 */
@customElement('umbradesktop-backoffice-theme-picker-modal')
export class UmbraDesktopBackofficeThemePickerModalElement extends UmbModalBaseElement<
  UmbraDesktopBackofficeThemePickerModalData,
  never
> {
  /** Every backoffice theme registered, in the order the registry's weights ask for. */
  @state()
  private _themes: ReadonlyArray<UmbraDesktopBackofficeTheme> = [];

  /**
   * The alias in force, which is what the picker marks. Seeded from the modal's data on open and
   * then kept up to date from the theme context — so a click marks the row it came from without
   * this element assuming the write succeeded, and a change made in the current-user modal while
   * this is open moves the mark too.
   */
  @state()
  private _alias?: string;

  #theme?: UmbraDesktopThemeContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_THEME_CONTEXT, (context) => {
      this.#theme = context ?? undefined;
      if (!context) return;
      this.observe(context.backofficeThemes, (themes) => (this._themes = themes));
      this.observe(context.backofficeTheme, (alias) => (this._alias = alias));
    });
  }

  override connectedCallback() {
    super.connectedCallback();
    // The opener already knows which theme is in force, and the context may take a moment to
    // arrive. Seeding means the right row is marked on the first paint rather than a frame later.
    this._alias ??= this.data?.current;
  }

  override render() {
    return html`
      <umb-body-layout headline=${this.localize.term('umbraDesktop_backofficeThemePickerTitle')}>
        <p class="hint">${this.localize.term('umbraDesktop_backofficeThemeAbout')}</p>
        <div class="themes">
          ${repeat(
            this._themes,
            (theme) => theme.alias,
            (theme) => html`
              <button
                class="theme ${theme.alias === this._alias ? 'on' : ''}"
                aria-pressed=${theme.alias === this._alias ? 'true' : 'false'}
                @click=${() => this.#theme?.setBackofficeTheme(theme.alias)}>
                <span class="name">${theme.name}</span>
              </button>
            `,
          )}
        </div>
        <uui-button
          slot="actions"
          look="primary"
          label=${this.localize.term('general_close')}
          @click=${() => this._rejectModal()}></uui-button>
      </umb-body-layout>
    `;
  }

  static override styles = [
    css`
      /* The sentence the row in the panel cannot carry in full: what makes this setting different
         from the theme above it. It belongs here, where you are deciding. */
      .hint {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .themes {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
      }
      /* The same row the theme picker uses, minus its preview: one list shape across both pickers,
         so the second one teaches nothing new. */
      .theme {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        padding: var(--uui-size-space-4) var(--uui-size-space-3);
        border: 2px solid transparent;
        border-radius: var(--uui-border-radius, 3px);
        background: transparent;
        color: var(--uui-color-text);
        font-family: inherit;
        font-size: inherit;
        text-align: left;
        cursor: pointer;
      }
      .theme:hover {
        background: var(--uui-color-surface-alt, rgba(0, 0, 0, 0.05));
      }
      .theme.on {
        border-color: var(--uui-color-selected, var(--uui-color-focus));
      }
      .name {
        font-weight: 700;
      }
    `,
  ];
}

export default UmbraDesktopBackofficeThemePickerModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-backoffice-theme-picker-modal': UmbraDesktopBackofficeThemePickerModalElement;
  }
}
