import '../../../connections/permission-card.element.js';
import { UmbraDesktopConnectionsRepository } from '../../../connections/connections.repository';
import { connectionStateLabel, connectionStateTone } from '../../../connections/connection-state';
import { notifyConnectionsChanged } from '../../../connections/connections-changed';
import { UMBRADESKTOP_CONNECTION_EDITOR_MODAL } from '../../modal-tokens';
import type {
  DesktopConnectionResponseModel,
  DesktopConnectionStatusResponseModel,
} from '../../../../api/types.gen';
import { css, customElement, html, nothing, repeat, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { umbOpenModal } from '@umbraco-cms/backoffice/modal';

/**
 * Configures the Umbraco instances this desktop may read from.
 *
 * The first settings category that is server state rather than a per-user preference, and it needs
 * three things no other category does: it loads, it can fail, and it can be refused. Everything else
 * in settings reads from a store that is already in memory and cannot say no.
 *
 * Refusal is shown rather than hidden. Somebody without Settings access on this instance still sees
 * this category and is told what is missing, the same way a connection whose API user lacks a
 * section is told rather than dropped. An affordance that silently disappears is a bug here, which
 * is the rule the themes follow and the reason this screen does not check a permission up front.
 *
 * This screen is the list and nothing else. Adding and editing happen in a modal, because a form
 * needs a footer that says Save and Cancel and means it: pushed in place, those same two buttons sat
 * at the end of a scrolling column where they read as the bottom of the content rather than as the
 * decision, and nothing stopped a half-filled form being abandoned with the back chevron.
 */
@customElement('umbradesktop-settings-connections')
export class UmbraDesktopSettingsConnectionsElement extends UmbLitElement {
  /** The configured connections, or undefined while the first read is out. */
  @state()
  private _connections?: DesktopConnectionResponseModel[];

  /** Whether the load was refused for want of Settings access on this instance. */
  @state()
  private _refused = false;

  /** The last test result, keyed by connection id, so a saved connection says whether it works. */
  @state()
  private _tested: Record<string, DesktopConnectionStatusResponseModel> = {};

  #repository = new UmbraDesktopConnectionsRepository(this);

  /** Loads on first connect. */
  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }

  /** Reads the configured connections. */
  async #load(): Promise<void> {
    const connections = await this.#repository.getConnections();

    // Undefined means the request failed, and on this endpoint the overwhelmingly likely reason is
    // that this user has no Settings access. Saying so beats a generic failure, and the worst case
    // of being wrong is an explanation that points one step away from the real cause.
    this._refused = connections === undefined;
    this._connections = connections ?? [];
  }

  /**
   * Opens the editor, and saves whatever it hands back.
   *
   * The editor owns the form and the decision; this owns the repository, the test and telling the
   * rest of the desktop. Closing the modal any other way rejects, which is how Cancel and the escape
   * key come to mean the same thing without either being handled here.
   * @param connection The connection to edit, or undefined to add one.
   */
  async #edit(connection?: DesktopConnectionResponseModel): Promise<void> {
    const body = await umbOpenModal(this, UMBRADESKTOP_CONNECTION_EDITOR_MODAL, {
      data: { connection },
    }).catch(() => undefined);

    if (!body) return;

    const saved = connection
      ? await this.#repository.updateConnection(connection.id, body)
      : await this.#repository.createConnection(body);

    if (!saved) return;

    await this.#load();

    // Tell the rest of the desktop before testing rather than after: the launcher's gate only needs
    // to know a connection exists, and it should not wait on two round trips to somebody's server.
    notifyConnectionsChanged();

    await this.#test(saved.id);
  }

  /**
   * Asks one connection to report on itself.
   *
   * Run straight after a save rather than behind a button of its own, because the question a person
   * has the moment they paste a client id is whether it worked, and a screen that makes them go and
   * find out is a screen they will not go back to.
   * @param id The connection's id.
   */
  async #test(id: string): Promise<void> {
    const report = await this.#repository.getStatus(id);
    if (report) {
      this._tested = { ...this._tested, [id]: report };
    }
  }

  /**
   * Removes a connection after confirming, because its secret goes with it and cannot be recovered.
   * @param connection The connection to remove.
   */
  async #remove(connection: DesktopConnectionResponseModel): Promise<void> {
    const question = this.localize.term('umbraDesktop_connectionRemoveConfirm', connection.name);
    if (!globalThis.confirm(question)) return;

    if (await this.#repository.deleteConnection(connection.id)) {
      await this.#load();
      notifyConnectionsChanged();
    }
  }

  /**
   * One configured connection, with what the last test said about it.
   * @param connection The connection to render.
   * @returns The row.
   */
  #renderConnection(connection: DesktopConnectionResponseModel) {
    const report = this._tested[connection.id];

    return html`
      <li>
        <span class="dot" style="background:${connection.colour}"></span>
        <div class="details">
          <strong>${connection.name}</strong>
          <span class="url">${connection.baseUrl}</span>
          ${connection.hasClientSecret
            ? nothing
            : html`<span class="warn">
                ${this.localize.term('umbraDesktop_connectionSecretMissing')}
              </span>`}
          ${report
            ? html`<uui-tag color=${connectionStateTone(report.status)} look="secondary">
                ${this.localize.term(connectionStateLabel(report.status))}
              </uui-tag>`
            : nothing}
        </div>
        <uui-button
          look="secondary"
          label=${this.localize.term('umbraDesktop_connectionEdit')}
          @click=${() => void this.#edit(connection)}
        ></uui-button>
        <uui-button
          look="secondary"
          color="danger"
          label=${this.localize.term('umbraDesktop_connectionRemove')}
          @click=${() => void this.#remove(connection)}
        ></uui-button>
      </li>
    `;
  }

  /**
   * Says out loud that this is not finished.
   *
   * Repeated inside the editor rather than shown only here, because somebody who clicks straight
   * through to the form would otherwise never meet it. It is a warning about churn, not about
   * danger: nothing on this screen can damage a connected instance, but the shape of what is stored
   * is still moving, so a reader deserves to know before they go and create API users on eight
   * client sites.
   *
   * A flask rather than a warning triangle, for that reason: the triangle would be claiming a risk
   * that is not there. The box keeps the warning colours, which is what makes it read as something
   * to take note of rather than as decoration. Both icon aliases were checked against the shipped
   * set, because `icon-server` looked every bit as plausible and does not exist.
   * @returns The notice.
   */
  #renderExperimentalNotice() {
    return html`
      <div class="experimental" role="note">
        <uui-icon name="icon-lab"></uui-icon>
        <span>${this.localize.term('umbraDesktop_connectionsExperimental')}</span>
      </div>
    `;
  }

  /** @returns The category. */
  override render() {
    if (this._refused) {
      return html`<umbradesktop-permission-card></umbradesktop-permission-card>`;
    }

    return html`
      ${this.#renderExperimentalNotice()}

      <p class="about">${this.localize.term('umbraDesktop_connectionsAbout')}</p>
      ${this._connections === undefined
        ? html`<uui-loader></uui-loader>`
        : this._connections.length === 0
          ? html`<p class="empty">${this.localize.term('umbraDesktop_connectionsEmpty')}</p>`
          : html`<ul>
              ${repeat(
                this._connections,
                (connection) => connection.id,
                (connection) => this.#renderConnection(connection),
              )}
            </ul>`}
      <uui-button
        look="primary"
        label=${this.localize.term('umbraDesktop_connectionAdd')}
        @click=${() => void this.#edit()}
      ></uui-button>
    `;
  }

  /**
   * Styles.
   *
   * Only the list lives here now. The form's spacing moved into the editor modal along with the
   * form, so there is one place deciding what a field looks like rather than two that have to agree.
   */
  static override styles = [
    css`
      :host {
        display: block;
      }

      .about,
      .empty {
        color: var(--uui-color-text-alt, var(--uui-color-text));
      }

      .experimental {
        display: flex;
        gap: var(--uui-size-space-3);
        align-items: flex-start;
        margin-bottom: var(--uui-size-space-5);
        padding: var(--uui-size-space-4);
        border: 1px solid var(--uui-color-warning-standalone, #d8d7d9);
        border-radius: var(--uui-border-radius, 3px);
        background: var(--uui-color-warning, #fdf7e4);
        color: var(--uui-color-warning-contrast, var(--uui-color-text));
        font-size: var(--uui-type-small-size);
      }

      .experimental uui-icon {
        flex: 0 0 auto;
        margin-top: 1px;
      }

      ul {
        margin: 0 0 var(--uui-size-space-5);
        padding: 0;
        list-style: none;
      }

      li {
        display: flex;
        gap: var(--uui-size-space-3);
        align-items: center;
        padding: var(--uui-size-space-4) 0;
        border-bottom: 1px solid var(--uui-color-border, #d8d7d9);
      }

      .details {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        gap: var(--uui-size-space-2);
        align-items: baseline;
        min-width: 0;
      }

      .url {
        color: var(--uui-color-text-alt, var(--uui-color-text));
        overflow-wrap: anywhere;
      }

      .warn {
        color: var(--uui-color-warning-standalone, #bf8f00);
      }

      .dot {
        flex: 0 0 auto;
        width: 12px;
        height: 12px;
        border-radius: 50%;
      }
    `,
  ];
}

export default UmbraDesktopSettingsConnectionsElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-settings-connections': UmbraDesktopSettingsConnectionsElement;
  }
}
