import { css, customElement, html, nothing, property } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Where the box is drawn, relative to the manager window's own box. */
export interface UmbraDesktopBoxPlacement {
  /** From the window's left edge. */
  left: number;
  /** From the window's top edge. */
  top: number;
  /** Its width. */
  width: number;
  /** Its height. */
  height: number;
}

/**
 * The selection box, drawn over core's cards while a drag from empty space is under way (design §3).
 * Core has none, so it is ours: drawn in the app's accent, the token every theme sets for selection,
 * so each theme draws it in its own selection colour. It never takes the pointer, which belongs to the
 * drag under it.
 */
@customElement('umbradesktop-media-selection-box')
export class UmbraDesktopMediaSelectionBoxElement extends UmbLitElement {
  /** Where to draw it, or nothing while no drag is under way. */
  @property({ attribute: false })
  box?: UmbraDesktopBoxPlacement;

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    // An attribute as well as the drawing, so a theme or a test can tell a box is up.
    this.toggleAttribute('active', !!this.box);
  }

  override render() {
    const box = this.box;
    if (!box) return nothing;
    return html`<div
      class="box"
      style="left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px"></div>`;
  }

  static override styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }

    .box {
      position: absolute;
      box-sizing: border-box;
      border: 1px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
      background: color-mix(in srgb, var(--umbradesktop-app-accent, var(--uui-color-selected)) 18%, transparent);
      border-radius: min(var(--umbradesktop-app-radius, 3px), 2px);
    }
  `;
}

export default UmbraDesktopMediaSelectionBoxElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-selection-box': UmbraDesktopMediaSelectionBoxElement;
  }
}
