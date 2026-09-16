import { UmbraDesktopConnectionsRepository } from './connections.repository';
import { connectionStateLabel, connectionStateTone } from './connection-state';
import type { DesktopConnectionStatusResponseModel } from '../../api/types.gen';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * Every Umbraco instance this desktop is connected to, and what each reports about itself.
 *
 * The first app that reads from somewhere other than the instance it runs on, and deliberately the
 * smallest one worth having: it proves the credential storage, the token exchange and the failure
 * mapping while asking a client for nothing more than an API user with no sections at all.
 *
 * What it shows and why those three columns. Version answers the question an agency actually asks
 * itself ("which of our clients is behind"). Runtime mode catches a client site left in
 * Development, which is a real thing that ships and which nobody notices from the outside. State is
 * Umbraco's own runtime level, and it is the one that comes from an endpoint needing no credentials
 * at all — so an instance stuck mid-upgrade says so, where everything authenticated would just time
 * out and read as the site being down.
 *
 * There is no refresh timer. Each row is two round trips to somebody else's server, so this is
 * seconds of work rather than milliseconds, and a screen that quietly re-ran it would spend a
 * client's bandwidth on a question nobody asked twice. The button is the whole of the refresh
 * policy.
 *
 * The instance the desktop runs on is listed too, under its own heading, and it costs no network at
 * all. Two groups rather than a column saying local or remote: that column would read "local" once
 * and "remote" on every other row, which is a column carrying one bit of information about one row.
 * The local row is also the only one a reader can calibrate the others against, which is worth the
 * heading on its own.
 */
@customElement('umbradesktop-connection-status')
export class UmbraDesktopConnectionStatusElement extends UmbLitElement {
  /** The reports, or undefined while the first read is still out. */
  @state()
  private _reports?: DesktopConnectionStatusResponseModel[];

  /** Whether a read is in flight, which is what disables the button and shows the loader. */
  @state()
  private _loading = false;

  /** Whether the last read failed outright, as opposed to reporting failures per connection. */
  @state()
  private _failed = false;

  #repository = new UmbraDesktopConnectionsRepository(this);

  /** Reads on first connect, because an app that opens empty and waits to be asked is a dead window. */
  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  /** Reads every connection's status and replaces what is on screen. */
  async #load(): Promise<void> {
    this._loading = true;
    const reports = await this.#repository.getStatuses();
    this._loading = false;

    // A failed read leaves the previous rows in place rather than blanking the screen: stale numbers
    // with a warning above them are more use than an empty table, and the same choice the background
    // jobs viewer makes for the same reason.
    this._failed = reports === undefined;
    if (reports) {
      this._reports = reports;
    }
  }

  /**
   * One row.
   * @param report The connection's report.
   * @returns The row.
   */
  #renderRow(report: DesktopConnectionStatusResponseModel) {
    // The server sends the local row with no name and no address on purpose: a name could not be
    // translated, and an instance behind a proxy does not reliably know its own public address. The
    // browser knows both, so it fills them in here.
    const name = report.isLocal ? globalThis.location.host : report.name;
    const href = report.isLocal ? globalThis.location.origin : report.baseUrl;

    return html`
      <tr>
        <td>
          <span
            class="dot ${report.isLocal ? 'local' : ''}"
            style=${report.isLocal ? '' : `background:${report.colour}`}
          ></span>
          <a href=${href} target="_blank" rel="noopener noreferrer">${name}</a>
        </td>
        <td>
          <uui-tag color=${connectionStateTone(report.status)} look="secondary">
            ${this.localize.term(connectionStateLabel(report.status))}
          </uui-tag>
        </td>
        <td>${report.serverStatus ?? this.#unknown}</td>
        <td>${report.version ?? this.#unknown}</td>
        <td>${report.runtimeMode ?? this.#unknown}</td>
      </tr>
    `;
  }

  /** The instance this desktop runs on. One row, or none while the first read is still out. */
  get #local(): DesktopConnectionStatusResponseModel[] {
    return this._reports?.filter((report) => report.isLocal) ?? [];
  }

  /** The configured connections, which is every row that is not the local instance. */
  get #remote(): DesktopConnectionStatusResponseModel[] {
    return this._reports?.filter((report) => !report.isLocal) ?? [];
  }

  /**
   * One labelled group of rows.
   * @param headingKey Localisation key for the group's heading.
   * @param reports The rows in this group.
   * @param sayWhenEmpty Whether an empty group says so rather than disappearing.
   * @returns The group.
   */
  #renderGroup(
    headingKey: string,
    reports: DesktopConnectionStatusResponseModel[],
    sayWhenEmpty = false,
  ) {
    if (reports.length === 0 && !sayWhenEmpty) {
      return nothing;
    }

    return html`
      <tbody>
        <tr class="group">
          <th colspan="5">${this.localize.term(headingKey)}</th>
        </tr>
        ${reports.length === 0
          ? html`<tr>
              <td colspan="5" class="empty">
                ${this.localize.term('umbraDesktop_connectionsEmpty')}
              </td>
            </tr>`
          : repeat(reports, (report) => report.id, (report) => this.#renderRow(report))}
      </tbody>
    `;
  }

  /** What an absent value reads as, rather than an empty cell that looks like a rendering bug. */
  get #unknown(): string {
    return this.localize.term('umbraDesktop_connectionStatusUnknown');
  }

  /** @returns The app. */
  override render() {
    return html`
      <header>
        <p>${this.localize.term('umbraDesktop_connectionStatusAbout')}</p>
        <uui-button
          look="secondary"
          .disabled=${this._loading}
          label=${this.localize.term('umbraDesktop_connectionStatusRefresh')}
          @click=${() => void this.#load()}
        ></uui-button>
      </header>

      ${this._failed
        ? html`<uui-tag color="danger" look="secondary">
            ${this.localize.term('umbraDesktop_connectionStatusLoadFailed')}
          </uui-tag>`
        : nothing}
      ${this._loading && !this._reports ? html`<uui-loader></uui-loader>` : nothing}
      ${this._reports?.length
        ? html`
            <table>
              <thead>
                <tr>
                  <th>${this.localize.term('umbraDesktop_connectionName')}</th>
                  <th>${this.localize.term('umbraDesktop_connectionStatusConnection')}</th>
                  <th>${this.localize.term('umbraDesktop_connectionStatusRuntime')}</th>
                  <th>${this.localize.term('umbraDesktop_connectionStatusVersion')}</th>
                  <th>${this.localize.term('umbraDesktop_connectionStatusMode')}</th>
                </tr>
              </thead>
              ${this.#renderGroup('umbraDesktop_connectionStatusGroupLocal', this.#local)}
              ${this.#renderGroup('umbraDesktop_connectionStatusGroupRemote', this.#remote, true)}
            </table>
          `
        : nothing}
    `;
  }

  /** Styles. Every colour is a token, so the five themes restyle this without touching it. */
  static override styles = [
    css`
      :host {
        display: block;
        padding: var(--uui-size-space-4, 12px);
        overflow: auto;
        color: var(--uui-color-text, #1b264f);
        background: var(--uui-color-surface, #fff);
      }

      header {
        display: flex;
        gap: var(--uui-size-space-4, 12px);
        align-items: center;
        justify-content: space-between;
        margin-bottom: var(--uui-size-space-4, 12px);
      }

      header p {
        margin: 0;
        color: var(--uui-color-text-alt, #515054);
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: var(--uui-size-space-3, 9px);
        text-align: left;
        border-bottom: 1px solid var(--uui-color-border, #d8d7d9);
        white-space: nowrap;
      }

      .dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-right: 8px;
        border-radius: 50%;
        vertical-align: baseline;
      }

      /* The local instance has no colour of its own, because nobody chose one for it. */
      .dot.local {
        background: var(--uui-color-current, #f5c1bc);
      }

      .group th {
        padding-top: var(--uui-size-space-4, 12px);
        color: var(--uui-color-text-alt, #515054);
        font-weight: 700;
      }

      .empty {
        color: var(--uui-color-text-alt, #515054);
      }
    `,
  ];
}

export default UmbraDesktopConnectionStatusElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-connection-status': UmbraDesktopConnectionStatusElement;
  }
}
