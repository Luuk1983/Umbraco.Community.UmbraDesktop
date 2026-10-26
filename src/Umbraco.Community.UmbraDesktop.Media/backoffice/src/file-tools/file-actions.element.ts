import { css, customElement, html, nothing, property, query, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbTextStyles } from '@umbraco-cms/backoffice/style';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbExtensionsElementAndApiInitializer } from '@umbraco-cms/backoffice/extension-api';
import type { UmbExtensionElementAndApiInitializer } from '@umbraco-cms/backoffice/extension-api';
import type { ManifestWorkspaceAction, ManifestWorkspaceActionMenuItem } from '@umbraco-cms/backoffice/workspace';

/**
 * **File actions** in the media item's footer (#176, the owner's second look): a button that only
 * opens a menu, so no file tool is the default behind the others, as core's split buttons make one
 * ("Edit image is not more important than the other options", owner, 2026-10-26).
 *
 * Built from core's own parts so it reads as Umbraco's: the button and chevron of core's fold-out
 * (`umb-workspace-action-menu`, which draws the chevron alone), its popover and layout, and its
 * entries, which are the workspace action menu items registered for this action, found and drawn by
 * the same extension initializer core's `umb-workspace-action` uses. So Edit image, Replace file and
 * Optimize stay extensions, and another package can add an entry with `forWorkspaceActions`.
 */
@customElement('umbradesktop-media-file-actions')
export class UmbraDesktopFileActionsElement extends UmbLitElement {
  /** The workspace action's manifest, set by core's footer: its alias finds the entries, its label names the button. */
  @property({ attribute: false })
  set manifest(value: ManifestWorkspaceAction | undefined) {
    if (!value || value === this.#manifest) return;
    this.#manifest = value;
    this.#observeEntries(value.alias);
    this.requestUpdate();
  }
  get manifest(): ManifestWorkspaceAction | undefined {
    return this.#manifest;
  }

  /** The manifest, as set. */
  #manifest?: ManifestWorkspaceAction;

  /** The entries, permitted by their conditions and ordered by weight, as the initializer hands them over. */
  @state()
  private _entries: Array<UmbExtensionElementAndApiInitializer<ManifestWorkspaceActionMenuItem>> = [];

  /** Whether the menu is open, for the chevron. */
  @state()
  private _open = false;

  /** The menu. */
  @query('#file-actions-popover')
  private _popover?: HTMLElement & { hidePopover(): void };

  /** Finds and draws the entries for this action. */
  #initializer?: UmbExtensionsElementAndApiInitializer<ManifestWorkspaceActionMenuItem, 'workspaceActionMenuItem', ManifestWorkspaceActionMenuItem>;

  /**
   * Follow the menu items registered for an action, as core's workspace action follows its fold-out.
   * @param alias The action's alias.
   */
  #observeEntries(alias: string): void {
    this.#initializer?.destroy();
    this.#initializer = new UmbExtensionsElementAndApiInitializer(
      this,
      umbExtensionsRegistry,
      'workspaceActionMenuItem',
      (manifest) => [{ meta: manifest.meta }],
      (manifest) => ([] as string[]).concat(manifest.forWorkspaceActions ?? []).includes(alias),
      (entries) => (this._entries = entries),
      undefined,
    );
  }

  /**
   * The chevron follows the menu.
   * @param event The popover's toggle.
   */
  #onToggle = (event: Event) => {
    this._open = (event as Event & { newState?: string }).newState === 'open';
  };

  /**
   * Close the menu as an entry is chosen, before its action opens a dialog or a file picker: core's
   * fold-out does the same in the capture phase, for WebKit (Umbraco-CMS #22777).
   */
  #onChoose = () => {
    if (this._open) this._popover?.hidePopover();
  };

  override render() {
    if (!this.#manifest || !this._entries.length) return nothing;
    // Core types the default kind's meta, not one of an action with its own element; the manifest gives a label.
    const label = this.localize.string((this.#manifest.meta as { label?: string } | undefined)?.label ?? this.#manifest.name);
    return html`
      <uui-button id="trigger" popovertarget="file-actions-popover" look="secondary" label=${label}>
        ${label}
        <uui-symbol-expand id="chevron" .open=${this._open}></uui-symbol-expand>
      </uui-button>
      <uui-popover-container id="file-actions-popover" margin="6" placement="top-end" @toggle=${this.#onToggle} @click=${{ handleEvent: this.#onChoose, capture: true }}>
        <umb-popover-layout id="layout">
          <uui-scroll-container>
            ${repeat(
              this._entries,
              (entry) => entry.alias,
              (entry) => entry.component,
            )}
          </uui-scroll-container>
        </umb-popover-layout>
      </uui-popover-container>
    `;
  }

  static override styles = [
    UmbTextStyles,
    css`
      :host {
        --uui-menu-item-flat-structure: 1;
      }

      #chevron {
        margin-left: var(--uui-size-space-2);
        /* Pointing up while closed, as the menu opens above it; core's fold-out turns its own the same way. */
        transform: rotate(-90deg);
      }

      #chevron[open] {
        transform: rotate(0deg);
      }

      #file-actions-popover {
        min-width: 200px;
      }

      #layout {
        overflow: visible;
      }
    `,
  ];
}

export { UmbraDesktopFileActionsElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-file-actions': UmbraDesktopFileActionsElement;
  }
}
