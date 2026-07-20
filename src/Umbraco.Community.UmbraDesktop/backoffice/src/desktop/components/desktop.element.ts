import type { UmbraDesktopWindow } from '../types';
import { UMBRADESKTOP_TASKBAR_HEIGHT } from '../constants';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import './window.element.js';
import './taskbar.element.js';
import { css, customElement, html, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

const OUTER_CHROME_STYLE_ID = 'umbradesktop-outer-chrome';

/** Root element of the Desktop section. Owns the window manager and layout. */
@customElement('umbradesktop-desktop')
export class UmbraDesktopDesktopElement extends UmbLitElement {
  #manager = new UmbraDesktopWindowManagerContext(this);

  @state()
  private _windows: UmbraDesktopWindow[] = [];

  constructor() {
    super();
    this.observe(this.#manager.windows, (list) => (this._windows = list));
  }

  override connectedCallback() {
    super.connectedCallback();
    this.#hideOuterChrome(true);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#hideOuterChrome(false);
  }

  /** Toggle a document-level style that hides the backoffice header for fullscreen. */
  #hideOuterChrome(hide: boolean) {
    const doc = this.ownerDocument;
    let style = doc.getElementById(OUTER_CHROME_STYLE_ID) as HTMLStyleElement | null;
    if (hide) {
      if (!style) {
        style = doc.createElement('style');
        style.id = OUTER_CHROME_STYLE_ID;
        style.textContent = `
          umb-backoffice-header { display: none !important; }
          umb-backoffice-main { height: 100% !important; }
        `;
        doc.head.appendChild(style);
      }
    } else {
      style?.remove();
    }
  }

  override render() {
    return html`
      <div class="desktop">
        <div class="surface" style="bottom:${UMBRADESKTOP_TASKBAR_HEIGHT}px">
          ${repeat(
            this._windows,
            (w) => w.id,
            (w) => html`<umbradesktop-window .window=${w}></umbradesktop-window>`,
          )}
        </div>
        <umbradesktop-taskbar></umbradesktop-taskbar>
      </div>
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        height: 100%;
        width: 100%;
      }
      .desktop {
        position: relative;
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        background:
          radial-gradient(circle at 30% 20%, rgba(28, 35, 58, 0.9), rgba(20, 22, 34, 0.95)),
          var(--uui-color-background);
      }
      .surface {
        position: absolute;
        inset: 0;
        overflow: hidden;
      }
      umbradesktop-taskbar {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
      }
    `,
  ];
}

export default UmbraDesktopDesktopElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-desktop': UmbraDesktopDesktopElement;
  }
}
