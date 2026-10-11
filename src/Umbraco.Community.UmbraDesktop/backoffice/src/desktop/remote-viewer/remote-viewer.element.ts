import '../components/loader.element.js';
import { backofficePathFromBaseHref } from '../boot/backoffice-path';
import { connectionStateLabel, isConnectionUsable } from '../connections/connection-state';
import { observeConnectionsChanged } from '../connections/connections-changed';
import { UmbraDesktopConnectionsRepository } from '../connections/connections.repository';
import type { DesktopConnectionStatusResponseModel } from '../../api/types.gen';
import { loadRemoteFrame } from './frame-loader';
import { REMOTE_VIEWER_FRAME_NAME } from './frame-read-only';
import { chooseConnection, compareVersions, proxyBaseFor, remoteOriginOf } from './remote-viewer.model';
import { css, customElement, html, keyed, nothing, query, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Where the last instance looked at is remembered, per browser. A convenience, so localStorage. */
const REMEMBERED_KEY = 'umbradesktop.remoteContent.connection';

/**
 * Where the viewer is in getting a remote instance on screen. The frame is covered in every state but
 * `ready`, so nobody sees the backoffice half-built or, worse, half-remote.
 */
type ViewerState =
  /** Reading the list of connections. */
  | 'listing'
  /** There are no connections. The app is not offered then, but a connection can go while it is open. */
  | 'empty'
  /** Asking the chosen connection whether it can be read, and which version it runs. */
  | 'connecting'
  /** It runs another Umbraco version, and the person has to say whether to open it anyway. */
  | 'version'
  /** The frame is booting with the shim in place. */
  | 'loading'
  /** Booted, redirected, and nothing reached this instance by mistake. Safe to show. */
  | 'ready'
  /** Something reached this instance ahead of the redirect, so what is on screen may not be remote. */
  | 'leaked'
  /** The connection cannot be read, or the frame never settled. */
  | 'failed';

/**
 * Another Umbraco instance's content, read-only, in this instance's own backoffice.
 *
 * The app is a frame of the local backoffice's content section whose data calls are redirected to
 * the chosen connection through this package's GET-only proxy (`ConnectionProxyController`). Because
 * the frame is a whole backoffice, every tree, workspace and property editor works as it does at
 * home, block grid and pickers included. Inside the frame, `frame-read-only.ts` hides every action
 * and locks every workspace, and the proxy refuses anything but a read, which is the protection; the
 * interface only says the same thing out loud.
 *
 * Switching instance throws the frame away and builds a fresh one, rather than redirecting a live
 * backoffice to another site: everything it has cached (the tree, the types, the languages) belongs to
 * the old one. The generation counter is what makes the frame new, and the run counter is what stops a
 * slow answer about the old one landing after the switch.
 */
@customElement('umbradesktop-remote-viewer')
export class UmbraDesktopRemoteViewerElement extends UmbLitElement {
  /** The frame the remote backoffice runs in. */
  @query('iframe')
  private _frame?: HTMLIFrameElement;

  /** Where the viewer is, which decides what covers the frame. */
  @state()
  private _state: ViewerState = 'listing';

  /** The connected instances, without the local one. */
  @state()
  private _connections: DesktopConnectionStatusResponseModel[] = [];

  /** The connection being looked at, as the last status check reported it. */
  @state()
  private _current?: DesktopConnectionStatusResponseModel;

  /** This instance's Umbraco version, for the version check. */
  @state()
  private _localVersion?: string | null;

  /** What went wrong, when the state is `failed`. Already localized. */
  @state()
  private _message = '';

  /**
   * The requests to show under a failure: ones that reached this instance ahead of the redirect, or
   * proxied ones that were refused. Empty is what we want.
   */
  @state()
  private _escaped: string[] = [];

  /** Bumped to throw the frame away and build a fresh one. */
  @state()
  private _generation = 0;

  /** Reads connections and their status through the desktop's own API. */
  #repository = new UmbraDesktopConnectionsRepository(this);

  /** Bumped on every open, so a slow answer about a previous choice is ignored. */
  #run = 0;

  /** Stops listening for connection changes. */
  #stopListening?: () => void;

  override connectedCallback() {
    super.connectedCallback();
    // Follow the connections as they change: added in settings, it can be chosen here straight away;
    // removed, and if it was the one on screen the viewer moves off it.
    this.#stopListening = observeConnectionsChanged(() => void this.#list());
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#stopListening?.();
    this.#stopListening = undefined;
  }

  override firstUpdated() {
    void this.#list();
  }

  /** Read the connections, then open the remembered one, or the first. */
  async #list() {
    const reports = await this.#repository.getStatuses();
    if (!reports) return this.#fail(this.localize.term('umbraDesktop_connectionStatusLoadFailed'));

    this._localVersion = reports.find((report) => report.isLocal)?.version;
    this._connections = reports.filter((report) => report.isLocal === false);

    const chosen = chooseConnection(
      this._connections.map((connection) => connection.id),
      this._current?.id ?? readRemembered(),
    );
    if (!chosen) {
      this._state = 'empty';
      return;
    }
    // A list refresh for the instance already on screen changes nothing on screen.
    if (chosen === this._current?.id && this._state !== 'failed') return;
    void this.#open(chosen);
  }

  /**
   * Check a connection can be read, and open it.
   * @param id The connection's id.
   */
  async #open(id: string) {
    const run = ++this.#run;
    remember(id);
    this._escaped = [];
    this._current = this._connections.find((connection) => connection.id === id);
    this._generation++;
    this._state = 'connecting';

    const report = await this.#repository.getStatus(id);
    if (run !== this.#run) return;
    if (!report) return this.#fail(this.localize.term('umbraDesktop_connectionStatusLoadFailed'));
    this._current = report;

    if (isConnectionUsable(report.status) === false) {
      return this.#fail(
        this.localize.term('umbraDesktop_remoteContentNotUsable', report.name, this.localize.term(connectionStateLabel(report.status))),
      );
    }

    if (compareVersions(this._localVersion, report.version) === 'different') {
      this._state = 'version';
      return;
    }
    await this.#load(run);
  }

  /**
   * Load the frame for the current connection and wait until it is safe to show.
   * @param run The open this belongs to, so a switch in the meantime wins.
   */
  async #load(run: number) {
    const current = this._current;
    const remoteOrigin = current ? remoteOriginOf(current.baseUrl) : undefined;
    if (!current || !remoteOrigin) return this.#fail(this.localize.term('umbraDesktop_connectionStatusLoadFailed'));

    this._state = 'loading';
    await this.updateComplete;
    if (run !== this.#run || !this._frame) return;

    const startUrl = `${backofficePathFromBaseHref(document.baseURI)}/section/content`;
    try {
      const handle = await loadRemoteFrame(this._frame, startUrl, {
        proxyBase: proxyBaseFor(window.location.origin, current.id),
        remoteOrigin,
      });
      const outcome = await handle.whenSettled();
      if (run !== this.#run) return;
      if (outcome === 'timeout') return this.#fail(this.localize.term('umbraDesktop_remoteContentLoadFailed', current.name));
      // A frame whose calls were all refused settles as readily as one whose calls all worked.
      const failed = handle.failedProxyCalls();
      if (failed.length > 0) {
        this._escaped = failed;
        return this.#fail(this.localize.term('umbraDesktop_remoteContentLoadFailed', current.name));
      }
      this._escaped = handle.escapedRequests();
      this._state = this._escaped.length === 0 ? 'ready' : 'leaked';
    } catch {
      if (run === this.#run) this.#fail(this.localize.term('umbraDesktop_remoteContentLoadFailed', current.name));
    }
  }

  /**
   * Put the viewer in the failed state.
   * @param message What to tell the person, already localized.
   */
  #fail(message: string) {
    this._message = message;
    this._state = 'failed';
  }

  /** The switcher changed. */
  #onChoose = (event: Event) => {
    const value = (event.target as { value?: unknown } | null)?.value;
    if (typeof value === 'string' && value !== this._current?.id) void this.#open(value);
  };

  /** Open the current connection again, from the top. */
  #retry = () => {
    if (this._current) void this.#open(this._current.id);
    else void this.#list();
  };

  /** Open a connection on another version, having been warned. */
  #openAnyway = () => {
    void this.#load(this.#run);
  };

  override render() {
    return html`
      <div class="bar" style=${this._current ? `--connection-colour: ${this._current.colour}` : ''}>
        <uui-select
          label=${this.localize.term('umbraDesktop_remoteContentConnection')}
          .options=${this._connections.map((connection) => ({
            name: connection.name,
            value: connection.id,
            selected: connection.id === this._current?.id,
          }))}
          ?disabled=${this._connections.length === 0}
          @change=${this.#onChoose}></uui-select>
        <span class="address">${this._current?.baseUrl ?? ''}</span>
        <uui-tag look="secondary">${this.localize.term('umbraDesktop_remoteContentReadOnly')}</uui-tag>
      </div>
      <div class="stage">
        ${keyed(this._generation, html`<iframe name=${REMOTE_VIEWER_FRAME_NAME}></iframe>`)}
        ${this._state === 'ready' ? nothing : this.#renderCover()}
      </div>
    `;
  }

  /** What sits over the frame while it is not safe to look at. */
  #renderCover() {
    const name = this._current?.name ?? '';
    switch (this._state) {
      case 'listing':
      case 'connecting':
      case 'loading':
        return html`<div class="cover">
          <umbradesktop-loader></umbradesktop-loader>
          ${this._state === 'listing'
            ? nothing
            : html`<p>
                ${this.localize.term(this._state === 'connecting' ? 'umbraDesktop_remoteContentConnecting' : 'umbraDesktop_remoteContentLoading', name)}
              </p>`}
        </div>`;
      case 'empty':
        return html`<div class="cover"><p>${this.localize.term('umbraDesktop_remoteContentNoConnections')}</p></div>`;
      case 'version':
        return html`<div class="cover">
          <h3>${this.localize.term('umbraDesktop_remoteContentVersionTitle')}</h3>
          <p>
            ${this.localize.term(
              'umbraDesktop_remoteContentVersionBody',
              name,
              this._current?.version ?? '',
              this._localVersion ?? '',
            )}
          </p>
          <uui-button look="primary" label=${this.localize.term('umbraDesktop_remoteContentOpenAnyway')} @click=${this.#openAnyway}></uui-button>
        </div>`;
      default:
        return html`<div class="cover">
          <p>${this._state === 'leaked' ? this.localize.term('umbraDesktop_remoteContentLeaked', name) : this._message}</p>
          ${this._escaped.length > 0 ? html`<pre>${this._escaped.join('\n')}</pre>` : nothing}
          <uui-button look="primary" label=${this.localize.term('umbraDesktop_remoteContentTryAgain')} @click=${this.#retry}></uui-button>
        </div>`;
    }
  }

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      background: var(--uui-color-background);
    }
    .bar {
      display: flex;
      gap: var(--uui-size-space-4);
      align-items: center;
      padding: var(--uui-size-space-2) var(--uui-size-space-4);
      border-bottom: 1px solid var(--uui-color-border);
      /* The connection's own colour, the one it has in settings and Connection status, so the instance
         being looked at is recognisable at a glance and never mistaken for this one. */
      border-left: 6px solid var(--connection-colour, var(--uui-color-border));
      background: var(--uui-color-surface);
    }
    .address {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--uui-color-text-alt);
    }
    .stage {
      position: relative;
      flex: 1;
      min-height: 0;
    }
    iframe {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
    .cover {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--uui-size-space-4);
      padding: var(--uui-size-space-6);
      background: var(--uui-color-surface);
      color: var(--uui-color-text);
      text-align: center;
    }
    .cover p {
      max-width: 60ch;
      margin: 0;
    }
    .cover h3 {
      margin: 0;
    }
    .cover pre {
      max-width: 100%;
      max-height: 40%;
      overflow: auto;
      font-size: 11px;
      text-align: left;
    }
  `;
}

/**
 * The connection looked at last, if the browser remembers one.
 * @returns Its id, or undefined.
 */
function readRemembered(): string | undefined {
  try {
    return localStorage.getItem(REMEMBERED_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Remember the connection being looked at, for next time.
 * @param id Its id.
 */
function remember(id: string) {
  try {
    localStorage.setItem(REMEMBERED_KEY, id);
  } catch {
    // Private windows and blocked storage: the viewer simply opens the first connection next time.
  }
}

export default UmbraDesktopRemoteViewerElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-remote-viewer': UmbraDesktopRemoteViewerElement;
  }
}
