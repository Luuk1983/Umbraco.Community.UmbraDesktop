import { css, customElement, html } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMBRADESKTOP_MEDIA_BIN_TREE, UMBRADESKTOP_MEDIA_FOLDER_TREE } from '../tree/constants.js';

/**
 * The tree beside a manager window's contents: the media library's folders, with the recycle bin as one
 * row at its foot (design §2, §9, §17).
 *
 * Both are core's default tree, hosted as the Media section's sidebar hosts its trees
 * (`tree-menu-item.element.js`), on repositories of the manager's own that pass on folders only and
 * keep the bin closed. So folders get core's look, menus, other packages' tree actions and core's start
 * nodes, and the bin's root carries core's Empty recycle bin. Its clicks are not handled here: every
 * tree item is a link, and the manager reads links for the whole window in one place.
 */
@customElement('umbradesktop-media-tree-host')
export class UmbraDesktopMediaTreeHostElement extends UmbLitElement {
  /**
   * The props core's sidebar gives a tree, less its expansion memory, which is the Media section's.
   * @returns The props.
   */
  #props() {
    return { hideTreeRoot: false, selectionConfiguration: { selectable: false, multiple: false }, isMenu: true };
  }

  override render() {
    return html`
      <umb-tree class="media" alias=${UMBRADESKTOP_MEDIA_FOLDER_TREE} .props=${this.#props()}></umb-tree>
      <umb-tree class="bin" alias=${UMBRADESKTOP_MEDIA_BIN_TREE} .props=${this.#props()}></umb-tree>
    `;
  }

  static override styles = css`
    /* The media tree scrolls on its own and the recycle bin, one row, stays at its foot: however long
       the tree, the bin is a drop target in view. */
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      box-sizing: border-box;
    }

    .media {
      display: block;
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
      padding-top: var(--uui-size-space-3);
    }

    .bin {
      display: block;
      flex: 0 0 auto;
      border-top: 1px solid var(--uui-color-border);
      padding: var(--uui-size-space-3) 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-tree-host': UmbraDesktopMediaTreeHostElement;
  }
}
