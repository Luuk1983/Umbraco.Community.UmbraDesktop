import type {
  UmbraDesktopConnectionEditorModalData,
  UmbraDesktopConnectionEditorModalValue,
} from '../modal-tokens';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement } from '@umbraco-cms/backoffice/modal';

/** What a new connection starts as. The colour is Umbraco's own, so a row is never colourless. */
const BLANK: UmbraDesktopConnectionEditorModalValue = {
  name: '',
  baseUrl: '',
  colour: '#3544b1',
  clientId: '',
};

/**
 * Adds or edits one connection to another Umbraco instance.
 *
 * Every field carries a sentence under it rather than a hint icon, the way General and Language do.
 * That matters more here than anywhere else in settings, because the hardest part of adding a
 * connection happens in somebody else's backoffice: without the sentence under Client ID, nothing on
 * screen says an API user has to exist over there at all.
 *
 * Save is refused until the three fields that cannot be guessed are filled. It is disabled rather
 * than hidden, and rather than accepting the form and failing afterwards, because a Save that is
 * visibly not available says which fields are still wanted while the person is still looking at
 * them.
 *
 * The secret is write-only throughout: never loaded, never rendered, and an empty box on an existing
 * connection means keep what is stored rather than clear it, which is the only possible reading
 * since the browser was never given the value it would otherwise be sending back.
 */
@customElement('umbradesktop-connection-editor-modal')
export class UmbraDesktopConnectionEditorModalElement extends UmbModalBaseElement<
  UmbraDesktopConnectionEditorModalData,
  UmbraDesktopConnectionEditorModalValue
> {
  /** The values being edited. Seeded from the modal's data on first render. */
  @state()
  private _draft: UmbraDesktopConnectionEditorModalValue = { ...BLANK };

  /** Whether a secret is already stored, which decides what the secret's hint says. */
  @state()
  private _hasClientSecret = false;

  /** Whether this is editing something that already exists, which decides the headline. */
  @state()
  private _editing = false;

  /** Seeds the draft from the modal's data once the modal system has set it. */
  override connectedCallback(): void {
    super.connectedCallback();

    const connection = this.data?.connection;
    if (!connection) {
      return;
    }

    this._editing = true;
    this._hasClientSecret = connection.hasClientSecret;
    this._draft = {
      name: connection.name,
      baseUrl: connection.baseUrl,
      colour: connection.colour,
      clientId: connection.clientId,
    };
  }

  /**
   * Whether the form can be submitted.
   *
   * The secret is deliberately not required. On an existing connection an empty box means keep the
   * stored one, and on a new connection it means the connection is saved unconfigured, which the
   * list then says out loud - that is a reasonable thing to want when the client has not sent the
   * credentials over yet.
   */
  get #complete(): boolean {
    return (
      this._draft.name.trim() !== ''
      && this._draft.baseUrl.trim() !== ''
      && this._draft.clientId.trim() !== ''
    );
  }

  /**
   * Updates one field of the draft.
   * @param field The field to change.
   * @param value Its new value.
   */
  #edit(field: keyof UmbraDesktopConnectionEditorModalValue, value: string): void {
    this._draft = { ...this._draft, [field]: value };
  }

  /** Hands the values back to whoever opened this, trimmed of the whitespace a paste brings with it. */
  #submit(): void {
    if (!this.#complete) {
      return;
    }

    this.value = {
      ...this._draft,
      name: this._draft.name.trim(),
      // Trailing slashes are stripped server-side too, but doing it here means the address the user
      // sees stored is the address they will see everywhere else.
      baseUrl: this._draft.baseUrl.trim().replace(/\/+$/, ''),
      clientId: this._draft.clientId.trim(),
      // Empty means unchanged, which is why it travels as undefined rather than as an empty string.
      clientSecret: this._draft.clientSecret === '' ? undefined : this._draft.clientSecret,
    };

    this._submitModal();
  }

  /** @returns The editor. */
  override render() {
    return html`
      <umb-body-layout
        headline=${this.localize.term(
          this._editing ? 'umbraDesktop_connectionEditHeadline' : 'umbraDesktop_connectionAdd',
        )}
      >
        <div class="experimental" role="note">
          <uui-icon name="icon-lab"></uui-icon>
          <span>${this.localize.term('umbraDesktop_connectionsExperimental')}</span>
        </div>

        <section>
          <h4>${this.localize.term('umbraDesktop_connectionName')}</h4>
          <uui-input
            label=${this.localize.term('umbraDesktop_connectionName')}
            .value=${this._draft.name}
            @input=${(event: Event) => this.#edit('name', (event.target as HTMLInputElement).value)}
          ></uui-input>
          <p class="hint">${this.localize.term('umbraDesktop_connectionNameAbout')}</p>
        </section>

        <section>
          <h4>${this.localize.term('umbraDesktop_connectionUrl')}</h4>
          <uui-input
            label=${this.localize.term('umbraDesktop_connectionUrl')}
            .value=${this._draft.baseUrl}
            placeholder="https://www.example.com"
            @input=${(event: Event) => this.#edit('baseUrl', (event.target as HTMLInputElement).value)}
          ></uui-input>
          <p class="hint">${this.localize.term('umbraDesktop_connectionUrlAbout')}</p>
        </section>

        <section>
          <h4>${this.localize.term('umbraDesktop_connectionColour')}</h4>
          <input
            class="colour"
            type="color"
            aria-label=${this.localize.term('umbraDesktop_connectionColour')}
            .value=${this._draft.colour}
            @input=${(event: Event) => this.#edit('colour', (event.target as HTMLInputElement).value)}
          />
          <p class="hint">${this.localize.term('umbraDesktop_connectionColourAbout')}</p>
        </section>

        <section>
          <h4>${this.localize.term('umbraDesktop_connectionClientId')}</h4>
          <uui-input
            label=${this.localize.term('umbraDesktop_connectionClientId')}
            .value=${this._draft.clientId}
            @input=${(event: Event) => this.#edit('clientId', (event.target as HTMLInputElement).value)}
          ></uui-input>
          <p class="hint">${this.localize.term('umbraDesktop_connectionClientIdAbout')}</p>
        </section>

        <section>
          <h4>${this.localize.term('umbraDesktop_connectionClientSecret')}</h4>
          <uui-input
            type="password"
            label=${this.localize.term('umbraDesktop_connectionClientSecret')}
            .value=${this._draft.clientSecret ?? ''}
            @input=${(event: Event) => this.#edit('clientSecret', (event.target as HTMLInputElement).value)}
          ></uui-input>
          <p class="hint">${this.localize.term('umbraDesktop_connectionClientSecretAbout')}</p>
          <p class="hint">
            ${this._hasClientSecret
              ? this.localize.term('umbraDesktop_connectionSecretStored')
              : this.localize.term('umbraDesktop_connectionSecretWriteOnly')}
          </p>
        </section>

        <uui-button
          slot="actions"
          look="secondary"
          label=${this.localize.term('umbraDesktop_connectionCancel')}
          @click=${() => this._rejectModal()}
        ></uui-button>
        <uui-button
          slot="actions"
          look="primary"
          color="positive"
          .disabled=${!this.#complete}
          label=${this.localize.term('umbraDesktop_connectionSave')}
          @click=${() => this.#submit()}
        ></uui-button>
      </umb-body-layout>
    `;
  }

  /**
   * Styles.
   *
   * Spacing follows the Language category rather than being chosen again: one step from a heading to
   * its control, one from a control to its sentence, a bigger one between whole fields.
   */
  static override styles = [
    css`
      section + section {
        margin-top: var(--uui-size-space-5);
      }

      h4 {
        margin: 0 0 var(--uui-size-space-3);
      }

      uui-input {
        width: 100%;
      }

      /* A hint explains the control above it, not the one below. Same rule as General and Language. */
      .hint {
        margin: var(--uui-size-space-3) 0 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }

      /* Two hints under one control are a paragraph apart, not a whole field apart. */
      .hint + .hint {
        margin-top: var(--uui-size-space-2);
      }

      .experimental {
        display: flex;
        gap: var(--uui-size-space-3);
        align-items: flex-start;
        margin-bottom: var(--uui-size-space-5);
        padding: var(--uui-size-space-4);
        border: 1px solid var(--uui-color-warning-standalone, #d8d7d9);
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-warning, #fdf7e4);
        color: var(--uui-color-warning-contrast, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }

      .experimental uui-icon {
        flex: 0 0 auto;
        margin-top: 1px;
      }

      /* The native colour swatch has no UUI equivalent, so it is sized to sit level with the inputs
         above and below it rather than floating as a small square in its own row. */
      .colour {
        width: 64px;
        height: var(--uui-size-12, 36px);
        padding: 2px;
        border: 1px solid var(--uui-color-border, #d8d7d9);
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-surface, #fff);
        cursor: pointer;
      }
    `,
  ];
}

export default UmbraDesktopConnectionEditorModalElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-connection-editor-modal': UmbraDesktopConnectionEditorModalElement;
  }
}
