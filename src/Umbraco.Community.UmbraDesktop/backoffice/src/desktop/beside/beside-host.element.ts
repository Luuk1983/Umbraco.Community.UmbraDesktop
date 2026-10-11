import { acceptForeignInstances, forwardContextRequest, relayProvideEvents } from './bridge';
import { findViewAnchor } from './frame-views';
import { besideLinkAction } from './link-rule';
import { watchWindowFrame } from './owner-frames';
import { realmOf } from './realm';
import { CONTEXT_REQUEST_EVENT } from '../frame-context';
import { css, customElement, html, nothing, state } from '@umbraco-cms/backoffice/external/lit';
import { createExtensionElement } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

/** How often to look for the owner's editor while its frame is still booting, in ms. */
const ANCHOR_RETRY_MS = 100;

/**
 * How long to keep looking before settling on the waiting message, in ms. Generous, because a cold
 * frame boots a whole backoffice before it renders the document; the message says what is happening
 * in the meantime, and a reload of the owner starts the search again.
 */
const ANCHOR_GIVE_UP_MS = 30_000;

/** A workspace view manifest as the registry hands it over, kind merged. */
type BesideManifest = Record<string, unknown> & { alias: string };

/** What the host is showing. */
type HostStatus =
  /** Looking for the owner's editor, which a booting or reloading frame has not rendered yet. */
  | 'waiting'
  /** The view is mounted and running on the owner's workspace. */
  | 'ready'
  /** The view's manifest is not registered on the desktop page, so there is nothing to build. */
  | 'missing';

/**
 * The body of a workspace view opened beside its editor (issue #131): the view itself, built on the
 * desktop page and running on its owner window's own workspace.
 *
 * **It is not a copy.** The view's element is built from its manifest here, as core's workspace
 * editor builds it in the tab, and every context request it makes is answered by the owner's frame
 * (`bridge.ts`). So it shows the document as it is being edited, unsaved changes included, and its
 * actions act on it: picking a template in Info marks the owner unsaved, and the picker opens as a
 * dialog in the owner, because the modal manager the view asks for is the owner's.
 *
 * **It holds no work of its own** (design D8). The attached-windows rule that attached content is
 * read-only exists because a pane must hold nothing to lose; here the work sits in the owner, so
 * closing, docking or reloading this loses nothing, which is that rule's reason still holding.
 *
 * **It follows the owner's frame** through `owner-frames.ts`. A reload of the owner replaces the
 * page every object the view holds came from, and a view left alone keeps showing the dead page's
 * values without a sign, so each load remounts it and applies both of the bridge's fixes again.
 *
 * **It must live inside the desktop element**, which it does as any attached content does: icons
 * are found by a request that rises to a registry near the app root, and the host lets that one
 * through to the desktop page because the frame neither answers nor matches it.
 */
@customElement('umbradesktop-beside-host')
export class UmbraDesktopBesideHostElement extends UmbLitElement {
  /** The document window this view belongs to. Assigned by the app host before connecting. */
  public ownerId?: string;

  /** The workspace view's manifest alias. Assigned by the app host before connecting. */
  public viewAlias?: string;

  /** What is on screen: the view, or why it is not there yet. */
  @state()
  private _status: HostStatus = 'waiting';

  /**
   * The view's manifest from the desktop page's registry, kind merged. Undefined until the registry
   * has answered, and null once it has answered that it holds no such view.
   */
  #manifest?: BesideManifest | null;

  /** The owner's frame as last announced, or undefined while it has none. */
  #frame?: HTMLIFrameElement;

  /** The owner's first-split workspace editor every request is asked from. */
  #anchor?: HTMLElement;

  /** The view element, once mounted. Requests and clicks are only bridged from inside it. */
  #view?: HTMLElement;

  /** Every context alias the view has asked the owner for, which is what the relay passes on. */
  #asked = new Set<string>();

  /** Undoes everything the current mount set up in the frame and on this page. */
  #unmount: Array<() => void> = [];

  /** Stops following the owner's frame announcements. */
  #stopFrames?: () => void;

  /** Bumped on every remount, so a slow step of an older one finds it is stale and stops. */
  #generation = 0;

  constructor() {
    super();
    this.addEventListener(CONTEXT_REQUEST_EVENT, this.#onRequest);
    this.addEventListener('click', this.#onClick);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this.viewAlias || !this.ownerId) return;
    this.observe(
      umbExtensionsRegistry.byAlias(this.viewAlias),
      (manifest) => {
        this.#manifest = (manifest as BesideManifest | undefined) ?? null;
        void this.#remount();
      },
      '_umbraDesktopBesideManifest',
    );
    this.#stopFrames = watchWindowFrame(this.ownerId, (frame) => {
      this.#frame = frame;
      void this.#remount();
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#stopFrames?.();
    this.#stopFrames = undefined;
    this.#generation++;
    this.#teardown();
  }

  /** Take the view down and undo what its mount set up. */
  #teardown() {
    for (const undo of this.#unmount) undo();
    this.#unmount = [];
    this.#view?.remove();
    this.#view = undefined;
    this.#anchor = undefined;
  }

  /**
   * Build the view again against the owner's frame as it is now: on the first connect, on every load
   * of the owner's frame, and when the owner's editor was replaced under the view.
   */
  async #remount() {
    const generation = ++this.#generation;
    this.#teardown();
    const manifest = this.#manifest;
    if (!manifest) {
      this._status = manifest === null ? 'missing' : 'waiting';
      return;
    }
    this._status = 'waiting';
    const frameWindow = this.#frame?.contentWindow;
    const anchor = await this.#waitForAnchor(generation);
    if (!anchor || !frameWindow || generation !== this.#generation) return;
    this.#anchor = anchor;

    // The two fixes, before the view exists, so its first requests and the first re-provide after
    // them already find them in place (design §4.4).
    const frameRealm = realmOf(frameWindow);
    if (frameRealm) acceptForeignInstances(frameRealm.UmbModalToken, UmbModalToken);
    this.#unmount.push(relayProvideEvents(frameWindow, window, (alias) => this.#asked.has(alias)));

    // An editor replaced without a reload, which a variant switch can do, would leave every request
    // rising through a detached tree that answers nothing. The frame's router reports each change.
    const recheck = () => {
      if (this.#anchor && !this.#anchor.isConnected) void this.#remount();
    };
    frameWindow.addEventListener('navigationsuccess', recheck);
    frameWindow.addEventListener('changestate', recheck);
    this.#unmount.push(() => {
      frameWindow.removeEventListener('navigationsuccess', recheck);
      frameWindow.removeEventListener('changestate', recheck);
    });

    const view = (await createExtensionElement(manifest as never)) as HTMLElement | undefined;
    if (!view || generation !== this.#generation) return;
    // Core's workspace editor sets this on every view it renders, and views read it.
    (view as unknown as { manifest: unknown }).manifest = manifest;
    this.#view = view;
    await this.updateComplete;
    this.renderRoot.querySelector('.view')?.append(view);
    this._status = 'ready';
  }

  /**
   * Look for the owner's first-split workspace editor until it is there, the frame changes, or the
   * search gives up.
   * @param generation The remount this search belongs to.
   * @returns The editor, or undefined.
   */
  async #waitForAnchor(generation: number): Promise<HTMLElement | undefined> {
    const started = Date.now();
    while (generation === this.#generation && Date.now() - started < ANCHOR_GIVE_UP_MS) {
      let doc: Document | null | undefined;
      try {
        doc = this.#frame?.contentDocument;
      } catch {
        doc = undefined;
      }
      const anchor = doc ? findViewAnchor(doc) : undefined;
      if (anchor) return anchor;
      await new Promise((resolve) => setTimeout(resolve, ANCHOR_RETRY_MS));
    }
    return undefined;
  }

  /**
   * Answer the view's context requests from the owner (design §4.2). Only the view's: anything the
   * host itself asks for is left to rise through the desktop page as usual.
   * @param event A context request rising out of this element's shadow tree.
   */
  #onRequest = (event: Event) => {
    const view = this.#view;
    const anchor = this.#anchor;
    if (!view || !anchor || !event.composedPath().includes(view)) return;
    if (!anchor.isConnected) {
      // Stopped here rather than passed on: the desktop page's answer would be the wrong one, and the
      // remount builds the view again, whose new consumers ask again.
      event.stopPropagation();
      void this.#remount();
      return;
    }
    const alias = (event as Event & { contextAlias?: unknown }).contextAlias;
    if (typeof alias === 'string') this.#asked.add(alias);
    forwardContextRequest(event, anchor, this);
  };

  /**
   * Send a link clicked in the view to the owner window, as the same link in the tab would go
   * (design §5).
   *
   * Every link click in the view is stopped here, whatever the rule says, because the desktop page's
   * own router listens for clicks on its window and does not skip the ones the rule leaves to the
   * browser: a shift-click or a click the view already handled would otherwise navigate the whole
   * desktop. The browser still does its own part, a new tab or a download, since only a rerouted
   * click is prevented.
   * @param event A click inside this element.
   */
  #onClick = (event: MouseEvent) => {
    const view = this.#view;
    if (!view || !event.composedPath().includes(view)) return;
    const action = besideLinkAction(event, document.baseURI);
    if (!action) return;
    event.stopPropagation();
    if (action.action === 'pass') return;
    event.preventDefault();
    const frameWindow = this.#frame?.contentWindow;
    if (!frameWindow) return;
    // The frame's own history, which its router patches, so the owner routes exactly as it would for
    // the same click in the tab: core's anchor handler does nothing but this, and the owner's
    // unsaved-changes guard sees it.
    if (action.action === 'route') frameWindow.history.pushState(null, '', action.path);
    else frameWindow.location.assign(action.path);
  };

  override render() {
    return html`
      <div class="view" ?hidden=${this._status !== 'ready'}></div>
      ${this._status === 'waiting'
        ? html`<div class="message"><uui-loader></uui-loader><span>${this.localize.term('umbraDesktop_besideWaiting')}</span></div>`
        : this._status === 'missing'
          ? html`<div class="message">${this.localize.term('umbraDesktop_besideMissing')}</div>`
          : nothing}
    `;
  }

  static override styles = [
    css`
      :host {
        display: block;
        height: 100%;
        background: var(--uui-color-background);
        color: var(--uui-color-text);
      }
      /* The view scrolls inside the pane, as it does inside the editor's body in its tab. */
      .view {
        height: 100%;
        overflow: auto;
        box-sizing: border-box;
      }
      .view[hidden] {
        display: none;
      }
      .message {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--uui-size-space-3);
        align-items: center;
        justify-content: center;
        padding: var(--uui-size-space-4);
        box-sizing: border-box;
        text-align: center;
        color: var(--uui-color-text-alt);
      }
    `,
  ];
}

export default UmbraDesktopBesideHostElement;
export { UmbraDesktopBesideHostElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-beside-host': UmbraDesktopBesideHostElement;
  }
}
