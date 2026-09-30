import type { UmbraDesktopWindow } from '../types';
import type { UmbraDesktopWindowManagerContext } from '../window-manager.context';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token';
import {
  UMBRADESKTOP_DEFAULT_PREVIEW_PROVIDER,
  UMBRADESKTOP_PREVIEW_APP_ALIAS,
  UMBRADESKTOP_PREVIEW_WIDTHS,
  previewOptions,
  previewRefreshesItself,
  previewReloadNeeded,
} from './preview-model';
import type { UmbraDesktopPreviewOption } from './preview-model';
import type { UmbraDesktopPreviewTarget } from './preview-target';
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbPreviewRepository } from '@umbraco-cms/backoffice/preview';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';

/**
 * The body of a preview window: a document's page as its site's own Save and preview would show it,
 * in a window attached to the document window it belongs to (#21).
 *
 * **Where the URL comes from.** The same call the Save and preview button makes: the document's
 * `preview-url` endpoint with a URL provider alias, `umbDocumentUrlProvider` unless the site offers
 * more. A site that renders its own pages gets Umbraco's preview page; a headless site that overrides
 * the provider gets its front-end, with nothing configured here. Opening the preview does not save,
 * so it shows the last saved version and says so while the editor has unsaved changes.
 *
 * **When it reloads.** Whenever the saved version changes, and at no other time: see
 * `previewReloadNeeded`. The URL is fetched again rather than the frame merely reloaded, because a
 * provider may hand out a URL that is only good for one preview session.
 *
 * **What it cannot know.** Whether the front-end let itself be framed. A refusal is invisible from
 * outside the frame, so the new-tab link is always there as the way out.
 */
@customElement('umbradesktop-preview')
export class UmbraDesktopPreviewElement extends UmbLitElement {
  /** The document window this preview belongs to. Assigned by the app host before connecting. */
  public ownerId?: string;

  /** The document and variant to preview. Assigned by the app host before connecting. */
  public target?: UmbraDesktopPreviewTarget;

  /** The URL the frame shows, or undefined while fetching or when there is none. */
  @state()
  private _url?: string;

  /** What to say instead of a frame: the server's reason there is no URL, or a failure. */
  @state()
  private _message?: string;

  /** Whether the owner window holds unsaved changes the preview cannot show. */
  @state()
  private _dirty = false;

  /** The preview options the site registers; more than one puts a picker in the toolbar. */
  @state()
  private _options: UmbraDesktopPreviewOption[] = [];

  /** The URL provider currently asked for. */
  @state()
  private _provider = UMBRADESKTOP_DEFAULT_PREVIEW_PROVIDER;

  /** The window manager, for the owner's state and for resizing this window. */
  #manager?: UmbraDesktopWindowManagerContext;

  /** The owner as last seen, so a change can be told apart from a repeat. */
  #owner?: Pick<UmbraDesktopWindow, 'saves' | 'changedElsewhere' | 'dirty'>;

  /** Asks the server for preview URLs. */
  #repository = new UmbPreviewRepository(this);

  /**
   * A counter for fetches, so a slow answer that arrives after a newer request cannot paint over it.
   */
  #fetch = 0;

  constructor() {
    super();
    this.consumeContext(UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, (manager) => {
      this.#manager = manager;
      if (manager) this.observe(manager.windows, (list) => this.#onWindows(list), '_umbraDesktopWindows');
    });
    this.observe(
      umbExtensionsRegistry.byType('workspaceActionMenuItem'),
      (manifests) => (this._options = previewOptions(manifests)),
      '_umbraDesktopPreviewOptions',
    );
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  /**
   * Follow the owner window: its unsaved state for the notice, and its saved version for reloading.
   * @param list The current window list.
   */
  #onWindows(list: ReadonlyArray<UmbraDesktopWindow>) {
    const owner = list.find((w) => w.id === this.ownerId);
    if (!owner) return;
    this._dirty = owner.dirty === true;
    const previous = this.#owner;
    this.#owner = { saves: owner.saves, changedElsewhere: owner.changedElsewhere, dirty: owner.dirty };
    // Umbraco's own preview page refreshes itself on a save, and reloading it here as well makes it
    // flash a "connection lost" warning as it goes; see `previewRefreshesItself`.
    if (this._url && previewRefreshesItself(this._url, document.baseURI)) return;
    if (previous && previewReloadNeeded(previous, this.#owner)) void this.#load();
  }

  /** Ask the server where the preview is, and show it. */
  async #load() {
    const target = this.target;
    if (!target) return;
    const attempt = ++this.#fetch;
    try {
      const data = await this.#repository.getPreviewUrl(target.unique, this._provider, target.culture, target.segment);
      if (attempt !== this.#fetch) return;
      if (data?.url) {
        // A cache-buster, as core's own preview adds, so a reload after a save fetches the page again
        // rather than showing the copy the frame already has.
        const url = new URL(data.url, document.baseURI);
        url.searchParams.set('rnd', Date.now().toString());
        this._url = url.toString();
        this._message = undefined;
      } else {
        this._url = undefined;
        this._message = data?.message ?? this.localize.term('umbraDesktop_previewFailed');
      }
    } catch {
      if (attempt !== this.#fetch) return;
      this._url = undefined;
      this._message = this.localize.term('umbraDesktop_previewFailed');
    }
  }

  /**
   * Resize this window to a device's width, through the manager so a docked preview stays against
   * its document and a maximized pair is laid out again.
   * @param width The content width.
   */
  #setWidth(width: number) {
    // By kind rather than by id, because the same preview is a pane or a floating window depending
    // on where the editor put it, and the manager is the one that knows which.
    if (this.ownerId) this.#manager?.setAttachedContentWidth(this.ownerId, UMBRADESKTOP_PREVIEW_APP_ALIAS, width);
  }

  /**
   * Switch to another of the site's preview options.
   * @param event The picker's change event.
   */
  #onProvider(event: Event) {
    this._provider = (event.target as HTMLSelectElement).value;
    void this.#load();
  }

  /**
   * Whether the frame is showing Umbraco's own preview page, which has a device switcher of its own
   * in its footer. The toolbar's width buttons are left out then: they would duplicate it, and at a
   * phone's width that page cuts off the very footer its own switcher lives in.
   * @returns True for Umbraco's own preview page.
   */
  #ownPage(): boolean {
    return !!this._url && previewRefreshesItself(this._url, document.baseURI);
  }

  override render() {
    return html`
      <div class="toolbar">
        ${this.#ownPage()
          ? nothing
          : html`
          <button
            type="button"
            title=${this.localize.term('umbraDesktop_previewPhone')}
            aria-label=${this.localize.term('umbraDesktop_previewPhone')}
            @click=${() => this.#setWidth(UMBRADESKTOP_PREVIEW_WIDTHS.phone)}>
            <umb-icon name="icon-iphone"></umb-icon>
          </button>
          <button
            type="button"
            title=${this.localize.term('umbraDesktop_previewTablet')}
            aria-label=${this.localize.term('umbraDesktop_previewTablet')}
            @click=${() => this.#setWidth(UMBRADESKTOP_PREVIEW_WIDTHS.tablet)}>
            <umb-icon name="icon-application-window-alt"></umb-icon>
          </button>
          <button
            type="button"
            title=${this.localize.term('umbraDesktop_previewDesktop')}
            aria-label=${this.localize.term('umbraDesktop_previewDesktop')}
            @click=${() => this.#setWidth(UMBRADESKTOP_PREVIEW_WIDTHS.desktop)}>
            <umb-icon name="icon-desktop"></umb-icon>
          </button>
            `}
        ${this._options.length > 1
          ? html`<select
              aria-label=${this.localize.term('umbraDesktop_previewOption')}
              title=${this.localize.term('umbraDesktop_previewOption')}
              @change=${this.#onProvider}>
              ${this._options.map(
                (o) =>
                  html`<option value=${o.providerAlias} ?selected=${o.providerAlias === this._provider}>
                    ${this.localize.string(o.label)}
                  </option>`,
              )}
            </select>`
          : nothing}
        <span class="spacer"></span>
        ${this._url
          ? html`<a class="newtab" href=${this._url} target="_blank" rel="noopener">
              <umb-icon name="icon-out"></umb-icon>
              ${this.localize.term('umbraDesktop_previewOpenInTab')}
            </a>`
          : nothing}
      </div>
      ${this._dirty ? html`<div class="unsaved" role="status">${this.localize.term('umbraDesktop_previewUnsaved')}</div>` : nothing}
      ${this._url
        ? html`<iframe class="page" src=${this._url} title=${this.localize.term('umbraDesktop_previewOpen')}></iframe>`
        : this._message
          ? html`<div class="message">${this._message}</div>`
          : html`<div class="message"><uui-loader></uui-loader></div>`}
    `;
  }

  static override styles = [
    css`
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--uui-color-surface);
        color: var(--uui-color-text);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: var(--uui-size-space-1);
        padding: var(--uui-size-space-1) var(--uui-size-space-2);
        border-bottom: 1px solid var(--uui-color-divider);
        font-size: 12px;
      }
      .toolbar button {
        display: inline-flex;
        align-items: center;
        border: 0;
        padding: 4px;
        border-radius: 3px;
        background: none;
        color: inherit;
        cursor: pointer;
      }
      .toolbar button:hover {
        background: var(--uui-color-surface-emphasis);
      }
      .spacer {
        flex: 1;
      }
      .newtab {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: var(--uui-color-interactive);
        text-decoration: none;
      }
      .newtab:hover {
        text-decoration: underline;
      }
      .unsaved {
        padding: var(--uui-size-space-2) var(--uui-size-space-3);
        border-left: 4px solid var(--uui-color-warning-standalone);
        background: var(--uui-color-surface-alt);
        font-size: 12px;
      }
      .page {
        flex: 1;
        width: 100%;
        border: 0;
        background: white;
      }
      .message {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--uui-size-space-4);
        text-align: center;
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export default UmbraDesktopPreviewElement;
export { UmbraDesktopPreviewElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-preview': UmbraDesktopPreviewElement;
  }
}
