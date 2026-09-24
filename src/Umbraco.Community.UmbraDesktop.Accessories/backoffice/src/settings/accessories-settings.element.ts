import '../screensaver/screensaver-panel.element.js';
import { AREA } from '../shared/area.js';
import { UmbraDesktopAccessoriesSettingsController } from './settings.source.js';
import type { AccessoriesSettingsSource } from './settings.source.js';
import type { AccessoriesMediaFolder } from './settings.js';
import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_MEDIA_TREE_PICKER_MODAL, UmbMediaItemRepository } from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * The Accessories category of Desktop settings: which media folder a new Notepad or Paint file is
 * saved into, and the screen saver. A file opened from the media library is saved back where it
 * lives.
 *
 * The screen saver part is the Screen Saver window's own element, over the same settings, so the two
 * places it can be set cannot come to look or behave differently.
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
  source?: AccessoriesSettingsSource;

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
  #source?: AccessoriesSettingsSource;

  /** Stops listening to the source. */
  #unsubscribe?: () => void;

  /** Settle on a source and listen to it. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.#source ??= this.source ?? new UmbraDesktopAccessoriesSettingsController(this);
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
   * The folder row.
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
   * @returns The folder new files are saved into, and the screen saver.
   */
  override render() {
    void this._revision;
    const folder = this.#source?.value.folder ?? null;
    return html`
      <section>
        <h4>${this.#term('settingsSaveTo', 'Save new files to')}</h4>
        <p class="about">
          ${this.#term(
            'settingsSaveToAbout',
            'Where Notepad and Paint put a file the first time it is saved. A file opened from the media library is saved back where it is.',
          )}
        </p>
        ${this.#renderFolder(folder)}
      </section>
      <section>
        <h4>${this.#term('settingsScreensaver', 'Screen saver')}</h4>
        <umbradesktop-screensaver-panel .source=${this.#source}></umbradesktop-screensaver-panel>
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

    .folder {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--uui-size-space-3);
    }

    section + section {
      margin-top: var(--uui-size-space-6);
    }

    /* The panel is a window's body elsewhere, with the window's surface; here it sits on the panel's. */
    umbradesktop-screensaver-panel {
      background: none;
      padding: 0;
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
