import { UmbraDesktopConnectionsRepository } from './connections.repository';
import { observeConnectionsChanged } from './connections-changed';
import { UMBRADESKTOP_CONNECTIONS_CATEGORY_ID } from './constants';
import { UMBRADESKTOP_SETTINGS_MODAL } from '../settings/modal-tokens';
import { connectionStateLabel, connectionStateTone, isConnectionChecking } from './connection-state';
import type { DesktopConnectionStatusResponseModel } from '../../api/types.gen';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

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
 * It follows the connections as they change: add one in settings and it appears here with its
 * spinner, remove one and it is gone, without anybody pressing Refresh. Rows that already have an
 * answer keep it, so adding a ninth client does not re-interrogate the other eight.
 *
 * Rows arrive in two stages, and the reason is the slowest client. Listing contacts nobody, so the
 * whole table is on screen immediately with each connection marked as being checked; then one
 * request per connection fills its row in. Asking for everything in one call was concurrent on the
 * server and still left the screen blank until the last of somebody else's servers answered - one
 * client with a dead site held every other row hostage, the local one included.
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

  /** Stops following connection changes. Held so disconnect can call it. */
  #stopListening?: () => void;

  /** Reads on first connect, because an app that opens empty and waits to be asked is a dead window. */
  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load();

    // Follows the same signal the launcher's gate does, so adding or removing a connection in
    // settings is reflected here without anybody pressing Refresh - including when the settings
    // panel was opened from this very window.
    this.#stopListening = observeConnectionsChanged(() => void this.#load());
  }

  /** @inheritdoc */
  override disconnectedCallback(): void {
    this.#stopListening?.();
    this.#stopListening = undefined;
    super.disconnectedCallback();
  }

  /**
   * Opens desktop settings at the Connections screen.
   *
   * Shown to everybody, including someone without Settings access on this instance, who lands on the
   * permission card rather than on nothing. An affordance that disappears because of a permission is
   * a bug here, and the destination is the right place to explain why it is refused.
   */
  async #manage(): Promise<void> {
    await umbOpenModal(this, UMBRADESKTOP_SETTINGS_MODAL, {
      data: { category: UMBRADESKTOP_CONNECTIONS_CATEGORY_ID },
    }).catch(() => undefined);
  }

  /**
   * Draws the table, then fills in every row that has no answer yet.
   *
   * The listing is instant because it contacts nobody. Each connection is then checked on its own, so
   * a client whose site is down costs its own row and nothing else.
   *
   * Answers already on screen are kept, which is what makes adding and removing a connection feel
   * immediate: a removed row is gone the moment the list comes back, and an added one appears
   * straight away with its spinner while the seven that were already fine stay as they were. Only
   * Refresh re-asks everybody.
   * @param recheckAll Whether to discard the answers already on screen and ask every instance again.
   */
  async #load(recheckAll = false): Promise<void> {
    this._loading = true;
    const rows = await this.#repository.getStatuses();

    // A failed read leaves the previous rows in place rather than blanking the screen: stale numbers
    // with a warning above them are more use than an empty table, and the same choice the background
    // jobs viewer makes for the same reason.
    this._failed = rows === undefined;

    if (!rows) {
      this._loading = false;
      return;
    }

    // Mapping over the *fresh* list is what removes a deleted connection: a row nobody listed any
    // more simply has nothing to carry forward into.
    const known = new Map(this._reports?.map((row) => [row.id, row]));
    this._reports = rows.map((row) => {
      if (recheckAll || row.isLocal) {
        return row;
      }

      const previous = known.get(row.id);
      return previous && !isConnectionChecking(previous.status) ? previous : row;
    });

    await Promise.all(
      this._reports
        .filter((row) => !row.isLocal && isConnectionChecking(row.status))
        .map((row) => this.#check(row.id)),
    );

    this._loading = false;
  }

  /**
   * Checks one connection and replaces its row.
   *
   * A row whose check fails is left saying it is being checked, and the banner above the table
   * carries the failure instead. Marking it unreachable would be a lie of exactly the kind the
   * server works to avoid: a request that fails here failed against *this* instance, and says
   * nothing whatsoever about whether the client's site is up.
   * @param id The connection's id.
   */
  async #check(id: string): Promise<void> {
    const report = await this.#repository.getStatus(id);

    if (!report) {
      this._failed = true;
      return;
    }

    this._reports = this._reports?.map((row) => (row.id === id ? report : row));
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
            ${isConnectionChecking(report.status)
              ? html`<uui-loader-circle class="checking"></uui-loader-circle>`
              : nothing}
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
        <div class="actions">
          <uui-button
            look="secondary"
            label=${this.localize.term('umbraDesktop_connectionStatusManage')}
            @click=${() => void this.#manage()}
          ></uui-button>
          <uui-button
            look="secondary"
            .disabled=${this._loading}
            label=${this.localize.term('umbraDesktop_connectionStatusRefresh')}
            @click=${() => void this.#load(true)}
          ></uui-button>
        </div>
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

      header .actions {
        display: flex;
        flex: 0 0 auto;
        gap: var(--uui-size-space-3, 9px);
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

      /* Sized to the tag's own text rather than to a fixed pixel count, so it stays level with the
         word beside it under every theme's type scale. */
      .checking {
        margin-right: var(--uui-size-space-2, 6px);
        font-size: 1em;
        vertical-align: -0.1em;
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
