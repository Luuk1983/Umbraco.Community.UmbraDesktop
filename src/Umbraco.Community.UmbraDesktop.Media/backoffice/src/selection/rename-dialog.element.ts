import { css, customElement, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbModalBaseElement, UmbModalToken } from '@umbraco-cms/backoffice/modal';
import { cleanName } from './rename.js';

/** What the Rename dialog is opened with. */
export interface UmbraDesktopMediaRenameData {
  /** The item's name now. */
  name: string;
}

/** What it answers with. */
export interface UmbraDesktopMediaRenameValue {
  /** The name typed. */
  name: string;
}

/** The Rename dialog's modal alias, registered in the bundle's manifests. */
export const UMBRADESKTOP_MEDIA_RENAME_MODAL_ALIAS = 'Umbraco.Community.UmbraDesktop.Media.Modal.Rename';

/** Opens the Rename dialog through core's modal manager. */
export const UMBRADESKTOP_MEDIA_RENAME_MODAL = new UmbModalToken<UmbraDesktopMediaRenameData, UmbraDesktopMediaRenameValue>(
  UMBRADESKTOP_MEDIA_RENAME_MODAL_ALIAS,
  { modal: { type: 'dialog' } },
);

/**
 * The Rename dialog F2 opens (decided 2026-10-17): one field with the name selected, so typing
 * replaces it, then Rename or Cancel. A dialog of ours because core's cards cannot be edited in place.
 * Drawn from core's own dialog layout and inputs, so every theme draws it as it draws core's dialogs.
 */
@customElement('umbradesktop-media-rename-dialog')
export class UmbraDesktopMediaRenameDialogElement extends UmbModalBaseElement<
  UmbraDesktopMediaRenameData,
  UmbraDesktopMediaRenameValue
> {
  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.value?.name) this.value = { name: this.data?.name ?? '' };
  }

  override async firstUpdated(): Promise<void> {
    // Selected once the field has drawn its own input, so typing replaces the name, as in a file
    // manager.
    const input = this.shadowRoot?.querySelector('uui-input') as (HTMLElement & { updateComplete?: Promise<unknown> }) | null;
    await input?.updateComplete;
    const field = input?.shadowRoot?.querySelector('input');
    field?.focus();
    field?.select();
  }

  /** Whether Rename would save anything. */
  get #canRename(): boolean {
    return cleanName(this.value?.name ?? '', this.data?.name ?? '') !== undefined;
  }

  /**
   * Keep what is typed.
   * @param event The field's input event.
   */
  #onInput = (event: Event): void => {
    this.updateValue({ name: (event.target as HTMLInputElement).value ?? '' });
  };

  /**
   * Enter renames, as in a file manager.
   * @param event The key.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    this.#rename();
  };

  /** Answer with the name typed, when it would change anything. */
  #rename(): void {
    if (this.#canRename) this._submitModal();
  }

  override render() {
    return html`
      <uui-dialog-layout headline=${this.localize.term('umbraDesktopMedia_renameHeadline')}>
        <uui-label for="name">${this.localize.term('umbraDesktopMedia_renameLabel')}</uui-label>
        <uui-input
          id="name"
          label=${this.localize.term('umbraDesktopMedia_renameLabel')}
          .value=${this.value?.name ?? ''}
          @input=${this.#onInput}
          @keydown=${this.#onKeyDown}></uui-input>
        <uui-button
          slot="actions"
          label=${this.localize.term('general_cancel')}
          @click=${() => this._rejectModal()}></uui-button>
        <uui-button
          slot="actions"
          look="primary"
          color="positive"
          label=${this.localize.term('umbraDesktopMedia_renameConfirm')}
          ?disabled=${!this.#canRename}
          @click=${() => this.#rename()}></uui-button>
      </uui-dialog-layout>
    `;
  }

  static override styles = css`
    uui-dialog-layout {
      min-width: min(420px, 90vw);
    }

    uui-label {
      display: block;
      margin-bottom: var(--uui-size-space-2);
    }

    uui-input {
      width: 100%;
    }
  `;
}

export default UmbraDesktopMediaRenameDialogElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-rename-dialog': UmbraDesktopMediaRenameDialogElement;
  }
}
