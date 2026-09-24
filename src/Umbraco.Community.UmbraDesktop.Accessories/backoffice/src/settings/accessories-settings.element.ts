import { AREA } from '../shared/area.js';
import { UmbraDesktopAccessoriesSaveSettingsController } from './save-settings.source.js';
import type { AccessoriesSaveSettingsSource } from './save-settings.source.js';
import type { AccessoriesMediaFolder, AccessoriesSaveDestination } from './save-settings.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_MEDIA_TREE_PICKER_MODAL, UmbMediaItemRepository } from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * The Accessories category of Desktop settings: where Notepad's and Paint's Save goes.
 *
 * Registered into the host's settings panel as a `umbraDesktopSettingsCategory`, so it sits beside
 * the desktop's own settings rather than in a panel of its own, and only exists when this package is
 * installed. The host draws the row and the heading; everything under the heading is this element.
 *
 * Like every other settings screen on the desktop there is no Save button here: a choice applies the
 * moment it is made, and an open Notepad window picks it up on its next save.
 */
@customElement('umbradesktop-accessories-settings')
export class UmbraDesktopAccessoriesSettingsElement extends UmbLitElement {
  /**
   * Where the settings are read from and written to. The stored per-user settings unless a test
   * says otherwise.
   */
  @property({ attribute: false })
  source?: AccessoriesSaveSettingsSource;

  /**
   * Ask for a media folder. Umbraco's media tree picker, folders only, unless a test says otherwise.
   * Resolves to undefined when the person cancels.
   */
  @property({ attribute: false })
  pickFolder: () => Promise<AccessoriesMediaFolder | undefined> = () => this.#pickFromTree();

  /** Bumped when the settings change, to re-render. The values themselves live in the source. */
  @state()
  private _revision = 0;

  /** The source in use: the one given, or the stored settings. */
  #source?: AccessoriesSaveSettingsSource;

  /** Stops listening to the source. */
  #unsubscribe?: () => void;

  /** Settle on a source and listen to it. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.#source ??= this.source ?? new UmbraDesktopAccessoriesSaveSettingsController(this);
    this.#unsubscribe = this.#source.subscribe(() => this._revision++);
  }

  /** Stop listening. */
  override disconnectedCallback(): void {
    this.#unsubscribe?.();
    super.disconnectedCallback();
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /**
   * Umbraco's media tree picker, limited to folders, and the chosen folder's name.
   *
   * The name is looked up once here and stored beside the key, so this screen can show it without a
   * request every time it opens. It is for display only: saving uses the key, so a folder renamed
   * later still receives the files and merely shows its old name here until it is chosen again.
   * @returns The folder, or undefined if the picker was cancelled.
   */
  async #pickFromTree(): Promise<AccessoriesMediaFolder | undefined> {
    const result = await umbOpenModal(this, UMB_MEDIA_TREE_PICKER_MODAL, {
      data: { multiple: false, foldersOnly: true },
    }).catch(() => undefined);
    const unique = result?.selection?.[0];
    if (!unique) return undefined;
    const { data } = await new UmbMediaItemRepository(this).requestItems([unique]);
    return { unique, name: data?.[0]?.name ?? unique };
  }

  /**
   * The destination radio changed.
   * @param event The radio group's change event.
   */
  #onDestination(event: Event): void {
    const destination = (event.target as HTMLElement & { value: string }).value as AccessoriesSaveDestination;
    if (destination !== 'computer' && destination !== 'media') return;
    this.#source!.set({ ...this.#source!.value, destination });
  }

  /** Choose a folder, keeping the current one if the picker is cancelled. */
  async #chooseFolder(): Promise<void> {
    const folder = await this.pickFolder();
    if (folder) this.#source!.set({ ...this.#source!.value, folder });
  }

  /** Go back to the root of the media library. */
  #useRoot(): void {
    this.#source!.set({ ...this.#source!.value, folder: null });
  }

  /**
   * The folder row, shown only while Save goes to the media library.
   * @param folder The chosen folder, or null for the root.
   * @returns The row.
   */
  #renderFolder(folder: AccessoriesMediaFolder | null) {
    return html`
      <div class="folder">
        <uui-icon name="icon-folder"></uui-icon>
        <span class="folder-name">${folder?.name ?? this.#term('settingsMediaRoot', 'Media library root')}</span>
        <uui-button
          data-action="pick-folder"
          look="secondary"
          compact
          label=${this.#term('settingsChooseFolder', 'Choose folder…')}
          @click=${this.#chooseFolder}></uui-button>
        ${folder
          ? html`<uui-button
              data-action="use-root"
              look="default"
              compact
              label=${this.#term('settingsUseRoot', 'Use the root')}
              @click=${this.#useRoot}></uui-button>`
          : nothing}
      </div>
    `;
  }

  /**
   * The screen.
   * @returns The destination choice, and the folder when it applies.
   */
  override render() {
    void this._revision;
    const { destination, folder } = this.#source?.value ?? { destination: 'computer', folder: null };
    return html`
      <section>
        <h4>${this.#term('settingsSaveTo', 'Save Notepad and Paint files to')}</h4>
        <p class="about">
          ${this.#term(
            'settingsSaveToAbout',
            'What Save and Ctrl+S do. Each app keeps a button for the other place, so both are always one click away.',
          )}
        </p>
        <uui-radio-group data-setting="destination" .value=${destination} @change=${this.#onDestination}>
          <uui-radio value="computer" label=${this.#term('settingsComputer', 'This computer')}></uui-radio>
          <p class="hint">
            ${this.#term('settingsComputerAbout', 'Downloads the file, the way your browser saves anything.')}
          </p>
          <uui-radio value="media" label=${this.#term('settingsMedia', 'Media library')}></uui-radio>
          <p class="hint">
            ${this.#term(
              'settingsMediaAbout',
              'Saves the file as a media item. Saving the same document again updates that item rather than adding another.',
            )}
          </p>
        </uui-radio-group>
        ${destination === 'media' ? this.#renderFolder(folder) : nothing}
      </section>
    `;
  }

  /**
   * The backoffice's own settings look, restated from the host's category screens so that this one
   * reads as part of the same panel: a shadow root cannot reach the global stylesheet those rely on.
   */
  static override styles = css`
    :host {
      display: block;
    }

    h4 {
      margin: 0 0 var(--uui-size-space-2);
      font-size: var(--uui-type-h5-size, 16px);
      font-weight: 400;
      line-height: inherit;
      color: var(--uui-color-text);
    }

    .about {
      margin: 0 0 var(--uui-size-space-4);
      color: var(--uui-color-text-alt, var(--uui-color-text));
      font-size: var(--uui-type-small-size);
    }

    .hint {
      margin: var(--uui-size-space-1) 0 var(--uui-size-space-4) var(--uui-size-space-6);
      color: var(--uui-color-text-alt, var(--uui-color-text));
      font-size: var(--uui-type-small-size);
    }

    .folder {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--uui-size-space-3);
      margin-left: var(--uui-size-space-6);
    }

    .folder-name {
      flex: 1;
      min-width: 8em;
      font-weight: 600;
    }
  `;
}

export { UmbraDesktopAccessoriesSettingsElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-accessories-settings': UmbraDesktopAccessoriesSettingsElement;
  }
}
