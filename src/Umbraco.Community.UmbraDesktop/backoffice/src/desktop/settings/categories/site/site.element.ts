import { UmbraDesktopService } from '../../../../api/sdk.gen';
import { refreshManifestLink } from '../../../manifest-link/manifest-link';
import type { AppIconModeModel } from '../../../../api/types.gen';
import { css, customElement, html, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_MEDIA_PICKER_MODAL } from '@umbraco-cms/backoffice/media';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbraDesktopLabelContext } from '../../../desktop-label/desktop-label.context';
import { UMBRADESKTOP_DESKTOP_LABEL_CONTEXT } from '../../../desktop-label/desktop-label.context-token';
import './desktop-label-settings.element.js';
import './site-preview.element.js';

/**
 * Site-wide settings: what the backoffice is called, whether the desktop shows that name, and which
 * icon it wears once installed as an app.
 *
 * Four boxes: a preview of the result, then one per thing you set. The name has its own because
 * the desktop label and the installed app both use it, so it belongs to neither. Nothing on the
 * screen appears or disappears as a setting changes: a control that does not apply is disabled in
 * place, so the screen never rearranges itself under the pointer.
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

  /** The desktop's label context, read again after a save so the desktop draws the new name. */
  #labelContext?: UmbraDesktopLabelContext;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_DESKTOP_LABEL_CONTEXT, (context) => (this.#labelContext = context));
  }

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

    // The label's text is this name, but the label context read it when the desktop loaded. Without
    // this, a renamed site kept its old name on the desktop until the next refresh. One read on
    // every save rather than only on a rename: it is a small GET, and knowing which field changed
    // is not worth a second code path.
    await this.#labelContext?.load();

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
   * The four boxes: the preview, then the name, the desktop label and the installed app.
   * @returns The screen's contents.
   */
  override render() {
    if (!this._loaded) return html`<uui-loader></uui-loader>`;

    return html`
      <uui-box headline=${this.localize.term('umbraDesktop_siteGroupPreview')}>
        <umbradesktop-settings-site-preview
          .name=${this._name}
          .iconUrl=${this._previewUrl}></umbradesktop-settings-site-preview>
      </uui-box>

      <uui-box headline=${this.localize.term('umbraDesktop_siteGroupName')}>
        <div class="field-label">${this.localize.term('umbraDesktop_siteAppName')}</div>
        <p class="hint">${this.localize.term('umbraDesktop_siteAppNameAbout')}</p>
        <uui-input
          .value=${this._name ?? ''}
          ?disabled=${this._nameLocked}
          label=${this.localize.term('umbraDesktop_siteAppName')}
          @change=${(event: Event) =>
            void this.#saveName((event.target as HTMLInputElement).value)}></uui-input>
        ${this.#lockedHint(this._nameLocked)}
      </uui-box>

      <uui-box headline=${this.localize.term('umbraDesktop_siteGroupDesktopLabel')}>
        <umbradesktop-settings-desktop-label></umbradesktop-settings-desktop-label>
      </uui-box>

      <uui-box headline=${this.localize.term('umbraDesktop_siteGroupInstalledApp')}>
        <div class="field-label">${this.localize.term('umbraDesktop_siteAppIcon')}</div>
        <p class="hint">${this.localize.term('umbraDesktop_siteAppIconAbout')}</p>
        <uui-radio-group
          .value=${this._mode}
          ?disabled=${this._iconLocked}
          @change=${(event: Event) =>
            void this.#selectMode((event.target as HTMLInputElement).value as AppIconModeModel)}>
          <uui-radio value="Default">${this.localize.term('umbraDesktop_siteAppIconDefault')}</uui-radio>
          <uui-radio value="Custom">${this.localize.term('umbraDesktop_siteAppIconCustom')}</uui-radio>
        </uui-radio-group>
        ${this.#renderImage()}
        ${this.#lockedHint(this._iconLocked)}
      </uui-box>
    `;
  }

  /**
   * The chosen image and the button that picks it, under the radio that makes it apply.
   *
   * Always drawn, disabled until "your own image" is chosen. It used to appear only in Custom mode,
   * which moved everything below it the moment the radio changed and left an admin on the default
   * icon with no hint that an image could be picked at all.
   * @returns The image row and its guidance.
   */
  #renderImage() {
    const custom = this._mode === 'Custom';
    const chosen = custom && !!this._mediaKey;
    const applies = custom && !this._iconLocked;

    return html`
      <div class="image ${applies ? '' : 'inapplicable'}">
        ${chosen && this._previewUrl
          ? html`<img class="thumb" src=${this._previewUrl} alt="" />`
          : html`<span class="thumb empty"></span>`}
        <uui-button
          class="choose"
          look="secondary"
          ?disabled=${!applies}
          label=${this.localize.term(chosen ? 'umbraDesktop_siteAppIconChange' : 'umbraDesktop_siteAppIconChoose')}
          @click=${() => void this.#pickMedia()}></uui-button>
      </div>
      <p class="hint guidance ${applies ? '' : 'inapplicable'}">${this.localize.term('umbraDesktop_siteAppIconGuidance')}</p>
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
      /* The boxes stack with the gap the backoffice leaves between boxes in a workspace. */
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5);
      }
      .field-label {
        font-weight: 700;
        margin-bottom: var(--uui-size-space-1);
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
      /* Indented to the radio labels, so it reads as belonging to "your own image" above it. */
      .image,
      .guidance {
        margin-left: calc(var(--uui-size-space-5) + var(--uui-size-space-2));
      }
      .image {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-4);
        margin-top: var(--uui-size-space-4);
      }
      .guidance {
        margin-top: var(--uui-size-space-3);
        margin-bottom: 0;
      }
      /* Deliberately small and rounded, at the 48px the preview shows the icon at. */
      .thumb {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        display: block;
        flex-shrink: 0;
      }
      .thumb.empty {
        box-sizing: border-box;
        border: 1px dashed var(--uui-color-border);
      }
      /* Text belonging to a control that does not apply greys with it, so the two read as one unit
         that does not apply yet rather than live text beside a dead control. */
      .inapplicable {
        color: var(--uui-color-disabled-contrast, var(--uui-color-text-alt));
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
