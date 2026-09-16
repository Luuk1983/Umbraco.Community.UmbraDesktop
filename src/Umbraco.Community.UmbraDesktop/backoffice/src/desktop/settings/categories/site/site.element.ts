import { UmbraDesktopService } from '../../../../api/sdk.gen';
import { refreshManifestLink } from '../../../manifest-link/manifest-link';
import type { AppIconModeModel } from '../../../../api/types.gen';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_MEDIA_PICKER_MODAL } from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { tryExecute } from '@umbraco-cms/backoffice/resources';

/**
 * Site-wide settings: what the backoffice is called and which icon it wears once installed as an
 * app.
 *
 * Unlike every other category, this reads and writes the server rather than the per-user settings
 * context. The values are one site's, not one person's, and they have to be readable by an
 * anonymous manifest request that no browser session is attached to.
 */
@customElement('umbradesktop-settings-site')
export class UmbraDesktopSettingsSiteElement extends UmbLitElement {
  /** The icon mode currently in force. */
  @state()
  private _mode: AppIconModeModel = 'Default';

  /** The chosen media item's key, when the mode is Custom. */
  @state()
  private _mediaKey: string | null = null;

  /** The icon the manifest would actually serve, as the server reports it. */
  @state()
  private _previewUrl: string | null = null;

  /** The app's effective name, or null when nothing names this site. */
  @state()
  private _name: string | null = null;

  /** Whether appsettings.json owns the icon, in which case its controls are disabled. */
  @state()
  private _iconLocked = false;

  /** Whether appsettings.json owns the name. Tracked apart from the icon: the two pin separately. */
  @state()
  private _nameLocked = false;

  /** Whether the first load has finished, so the controls do not flash a wrong value first. */
  @state()
  private _loaded = false;

  /**
   * Whether a media picker is already open.
   *
   * `uui-radio-group` reports a selection twice — once from the group and once from the `uui-radio`
   * whose own `change` bubbles through it — so a single click on Custom opened two stacked pickers.
   * Guarding the opener rather than the handler fixes it wherever else a second call comes from,
   * including an impatient double click on the Choose button.
   */
  #picking = false;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  /** Read the current values from the server. */
  async #load(): Promise<void> {
    const { data } = await tryExecute(this, UmbraDesktopService.getAppIdentity(), {
      disableNotifications: true,
    });
    if (!data) return;

    this._mode = data.mode;
    this._mediaKey = data.mediaKey ?? null;
    this._name = data.name ?? null;
    this._previewUrl = data.previewUrl;
    this._iconLocked = data.iconLockedByConfiguration;
    this._nameLocked = data.nameLockedByConfiguration;
    this._loaded = true;
  }

  /**
   * Store the current values, then re-read rather than trusting the write.
   *
   * Re-reading is not ceremony: the server refuses a write that would change something
   * configuration owns, so a UI that assumed its own write landed would show a setting the manifest
   * does not actually use.
   *
   * **Both fields go on every write.** They share one stored document, so posting an icon without
   * the name would blank the name as a side effect of changing the picture.
   * @param mode The icon mode to store.
   * @param mediaKey The media item, for Custom mode.
   * @param name The app name, or blank to fall back to the site's own name.
   */
  async #save(mode: AppIconModeModel, mediaKey: string | null, name: string | null): Promise<void> {
    await tryExecute(
      this,
      UmbraDesktopService.setAppIdentity({ body: { mode, mediaKey, name } }),
    );
    await this.#load();

    // Prompt the browser to read the manifest again. It reads one when a page loads and then leaves
    // it alone, so without this a change here did nothing at all until the desktop was refreshed —
    // which looks exactly like a setting that does not work.
    refreshManifestLink();
  }

  /**
   * Switch icon mode.
   *
   * Custom only reveals the picker rather than saving, because Custom with no media is refused by
   * the server — posting it would be a certain 400 and would make the radio look broken.
   * @param mode The chosen mode.
   */
  async #selectMode(mode: AppIconModeModel): Promise<void> {
    if (this._iconLocked) return;

    // The duplicated change event reports the same value twice, so a no-op selection is not worth a
    // round trip to the server either.
    if (mode === this._mode && mode !== 'Custom') return;

    if (mode === 'Custom' && !this._mediaKey) {
      this._mode = 'Custom';
      await this.#pickMedia();
      return;
    }

    await this.#save(mode, mode === 'Custom' ? this._mediaKey : null, this._name);
  }

  /**
   * Open Umbraco's own Media Library picker and store whatever comes back.
   *
   * Umbraco's picker already includes an upload dropzone, so this is also how somebody uploads a
   * new image: drop a file in and it is added to the library and selected in one gesture. That is
   * why there is no separate upload control — a second path would need its own storage, serving
   * endpoint, permissions and cleanup, all of which the Media Library provides behind a URL Umbraco
   * knows how to resolve whether the site stores media on disk or in blob storage.
   *
   * Folders and inaccessible items are filtered out, matching the wallpaper picker: neither can
   * produce an image.
   *
   * A cancelled pick leaves the mode showing Custom with nothing chosen, which is a half-finished
   * state rather than a broken one — the server refuses Custom with no media, and the resolver falls
   * back to the shipped mark, so nothing downstream breaks while the user decides.
   */
  async #pickMedia(): Promise<void> {
    if (this._iconLocked || this.#picking) return;
    this.#picking = true;

    try {
      const result = await umbOpenModal(this, UMB_MEDIA_PICKER_MODAL, {
        data: {
          multiple: false,
          pickableFilter: (item) => !item.isFolder && !item.noAccess,
        },
      }).catch(() => undefined);

      const unique = result?.selection?.[0];
      if (!unique) return;

      await this.#save('Custom', unique, this._name);
    } finally {
      this.#picking = false;
    }
  }

  /**
   * Store a new app name.
   *
   * Bound to `change` rather than `input`: this writes a site-wide setting, and saving per keystroke
   * would be one request per character and a stored value that is briefly a half-typed name.
   *
   * An empty value is sent as-is, deliberately. The server stores blank as null, which means "stop
   * overriding" — clearing the field is how an admin returns to the site's own name, so it must not
   * be swallowed here.
   * @param value The typed name.
   */
  async #saveName(value: string): Promise<void> {
    if (this._nameLocked) return;
    await this.#save(this._mode, this._mediaKey, value);
  }

  /**
   * The two site-wide settings, each with the sentence that stops a disabled control looking broken.
   * @returns The screen's contents.
   */
  override render() {
    if (!this._loaded) return html`<uui-loader></uui-loader>`;

    return html`
      <h4>${this.localize.term('umbraDesktop_siteAppName')}</h4>
      <p class="hint">${this.localize.term('umbraDesktop_siteAppNameAbout')}</p>
      <uui-input
        .value=${this._name ?? ''}
        ?disabled=${this._nameLocked}
        label=${this.localize.term('umbraDesktop_siteAppName')}
        @change=${(event: Event) =>
          void this.#saveName((event.target as HTMLInputElement).value)}></uui-input>
      ${this.#lockedHint(this._nameLocked)}

      <h4 class="second">${this.localize.term('umbraDesktop_siteAppIcon')}</h4>
      <p class="hint">${this.localize.term('umbraDesktop_siteAppIconAbout')}</p>
      <uui-radio-group
        .value=${this._mode}
        ?disabled=${this._iconLocked}
        @change=${(event: Event) =>
          void this.#selectMode((event.target as HTMLInputElement).value as AppIconModeModel)}>
        <uui-radio value="Default">${this.localize.term('umbraDesktop_siteAppIconDefault')}</uui-radio>
        <uui-radio value="Custom">${this.localize.term('umbraDesktop_siteAppIconCustom')}</uui-radio>
      </uui-radio-group>

      ${this._mode === 'Custom'
        ? html`
            <uui-button
              look="secondary"
              ?disabled=${this._iconLocked}
              label=${this.localize.term('umbraDesktop_siteAppIconChoose')}
              @click=${() => void this.#pickMedia()}></uui-button>
            <p class="hint">${this.localize.term('umbraDesktop_siteAppIconGuidance')}</p>
          `
        : null}

      ${this.#lockedHint(this._iconLocked)}

      ${this._previewUrl
        ? html`
            <h5>${this.localize.term('umbraDesktop_siteAppIconPreview')}</h5>
            <div class="preview">
              <img src=${this._previewUrl} alt="" />
              <span>${this._name ?? ''}</span>
            </div>
          `
        : null}
    `;
  }

  /**
   * The line explaining why a control is disabled.
   *
   * Shared by both settings because the reason is identical, and a disabled control with no
   * explanation reads as a bug rather than as a decision somebody made in CI.
   * @param locked Whether the control is locked.
   * @returns The hint, or nothing.
   */
  #lockedHint(locked: boolean) {
    return locked
      ? html`<p class="hint locked">${this.localize.term('umbraDesktop_siteLockedByConfiguration')}</p>`
      : null;
  }

  static override styles = [
    css`
      :host {
        display: block;
      }
      h4 {
        margin: 0 0 var(--uui-size-space-2);
      }
      /* Space above the second setting, so the two do not read as one group. */
      h4.second {
        margin-top: var(--uui-size-space-6);
      }
      .hint {
        margin: 0 0 var(--uui-size-space-4);
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      /* Sits under the disabled control it explains, not over it. */
      .locked {
        margin: var(--uui-size-space-3) 0 0;
      }
      uui-input {
        width: 100%;
      }
      h5 {
        margin: var(--uui-size-space-5) 0 var(--uui-size-space-2);
      }
      /* Deliberately small and rounded: this is a rehearsal of a taskbar tile, not a gallery. Shown
         at 48px because a preview that flatters at 512 tells you nothing about the size the icon is
         actually used at. */
      .preview {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
      }
      .preview img {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        display: block;
      }
      .preview span {
        font-size: var(--uui-type-small-size);
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }
    `,
  ];
}

export default UmbraDesktopSettingsSiteElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-site': UmbraDesktopSettingsSiteElement;
  }
}
