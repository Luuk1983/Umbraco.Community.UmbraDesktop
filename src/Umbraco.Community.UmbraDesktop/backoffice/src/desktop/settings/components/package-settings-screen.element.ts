import type { UmbraDesktopSettingsBox, UmbraDesktopSettingsPackage } from '../package-settings';
import { css, customElement, html, nothing, property, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * One package's screen in Desktop settings (design §4): a line saying whose settings these are, then
 * one `uui-box` per manifest with the package's element inside.
 *
 * The host draws the box and its heading, so every package's screen has the same grouping the
 * desktop's own screens use, and a package cannot draw itself as part of ours. What is inside the box
 * is the package's.
 *
 * A box's element is loaded the first time this screen shows it, not when the panel opens, and kept
 * for as long as this screen exists, so going back to the list and in again does not rebuild it.
 */
@customElement('umbradesktop-settings-package')
export class UmbraDesktopSettingsPackageElement extends UmbLitElement {
  /** The package to show. Handed over again, with fresh objects, whenever its boxes change. */
  @property({ attribute: false })
  package?: UmbraDesktopSettingsPackage;

  /** Bumped when a box finishes loading or fails, to re-render. */
  @state()
  private _loads = 0;

  /** Loaded elements by manifest alias. */
  #elements = new Map<string, HTMLElement>();

  /** Aliases whose load is under way, so a box is asked for once. */
  #loading = new Set<string>();

  /** Aliases whose element could not be loaded. */
  #failed = new Set<string>();

  /**
   * A box's contents: its element once loaded, a loader until then, and a line saying it could not be
   * loaded if it failed, never an empty box.
   *
   * The load starts from here, the first time the box is drawn, which is what makes it lazy. The
   * state change that follows is deferred to a promise, so it never lands inside the render that
   * started it.
   * @param box The box.
   * @returns What goes inside the box.
   */
  #content(box: UmbraDesktopSettingsBox) {
    const loaded = this.#elements.get(box.alias);
    if (loaded) return loaded;
    if (this.#failed.has(box.alias)) {
      return html`<p class="failed">${this.localize.term('umbraDesktop_settingsBoxLoadFailed')}</p>`;
    }
    if (!this.#loading.has(box.alias)) {
      this.#loading.add(box.alias);
      // One package's broken chunk must not take the others down, so a failure is the box's own:
      // logged for whoever ships the package, and shown as a line rather than as an empty box.
      createExtensionElement(box.manifest)
        .then((element) => {
          if (element) this.#elements.set(box.alias, element);
          else this.#failed.add(box.alias);
        })
        .catch((error: unknown) => {
          console.error(`[UmbraDesktop] Package settings "${box.alias}" could not be loaded.`, error);
          this.#failed.add(box.alias);
        })
        .finally(() => {
          this.#loading.delete(box.alias);
          this._loads++;
        });
    }
    return html`<uui-loader></uui-loader>`;
  }

  /**
   * The attribution line, then the boxes keyed by alias so a box keeps its element when the package
   * is handed over again, and one that left the package is dropped.
   * @returns The screen's contents.
   */
  override render() {
    // Setting `_loads` is what re-renders; this read only keeps TypeScript from calling it unused.
    void this._loads;
    const value = this.package;
    if (!value) return nothing;
    return html`
      <p class="attribution">${this.localize.term('umbraDesktop_settingsPackageAttribution', value.name)}</p>
      ${repeat(
        value.boxes,
        (box) => box.alias,
        (box) =>
          html`<uui-box data-box=${box.alias} headline=${this.localize.string(box.label)}>${this.#content(box)}</uui-box>`,
      )}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-5);
      }
      /* Above the boxes and quieter than them: it frames them rather than competing with them. */
      .attribution {
        margin: 0;
        color: var(--uui-color-text-alt, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }
      .failed {
        margin: 0;
        color: var(--uui-color-danger);
      }
    `,
  ];
}

export default UmbraDesktopSettingsPackageElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-package': UmbraDesktopSettingsPackageElement;
  }
}
