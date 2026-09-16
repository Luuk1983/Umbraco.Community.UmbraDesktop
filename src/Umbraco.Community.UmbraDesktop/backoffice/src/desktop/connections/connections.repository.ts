import { UmbraDesktopService } from '../../api/sdk.gen';
import type {
  DesktopConnectionRequestModel,
  DesktopConnectionResponseModel,
  DesktopConnectionStatusResponseModel,
} from '../../api/types.gen';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Everything the browser may do with connections to other Umbraco instances.
 *
 * A thin seam over the generated client rather than a repository in Umbraco's fuller sense: there is
 * no store, no observables and no entity actions, because nothing here is edited in two places at
 * once. What it does buy is one place where the server's shapes are turned into plain answers, so
 * neither the settings screen nor the Status app has to know about `tryExecute` or about which of
 * the generated methods is which.
 *
 * Note what is missing on purpose: nothing writes to a connected instance. The server refuses that
 * too, but the absence here is what makes it visible to anyone reading this file.
 */
export class UmbraDesktopConnectionsRepository {
  /** The element or controller these requests belong to, for Umbraco's own error notifications. */
  #host: UmbControllerHost;

  /**
   * @param host The controller host the requests are made on behalf of.
   */
  constructor(host: UmbControllerHost) {
    this.#host = host;
  }

  /**
   * Gets every configured connection.
   * @returns The connections, or undefined when the request failed.
   */
  async getConnections(): Promise<DesktopConnectionResponseModel[] | undefined> {
    const { data } = await tryExecute(this.#host, UmbraDesktopService.getConnections());

    return data as DesktopConnectionResponseModel[] | undefined;
  }

  /**
   * Adds a connection.
   * @param body The connection to add, optionally with its secret.
   * @returns The stored connection, or undefined when the request failed.
   */
  async createConnection(
    body: DesktopConnectionRequestModel,
  ): Promise<DesktopConnectionResponseModel | undefined> {
    const { data } = await tryExecute(this.#host, UmbraDesktopService.createConnection({ body }));

    return data as DesktopConnectionResponseModel | undefined;
  }

  /**
   * Replaces a connection.
   * @param id The connection's id.
   * @param body The new values. Leave the secret unset to keep the stored one.
   * @returns The stored connection, or undefined when the request failed.
   */
  async updateConnection(
    id: string,
    body: DesktopConnectionRequestModel,
  ): Promise<DesktopConnectionResponseModel | undefined> {
    const { data } = await tryExecute(
      this.#host,
      UmbraDesktopService.updateConnection({ path: { id }, body }),
    );

    return data as DesktopConnectionResponseModel | undefined;
  }

  /**
   * Removes a connection and the secret stored against it.
   * @param id The connection's id.
   * @returns Whether the request succeeded.
   */
  async deleteConnection(id: string): Promise<boolean> {
    const { error } = await tryExecute(this.#host, UmbraDesktopService.deleteConnection({ path: { id } }));

    return !error;
  }

  /**
   * Reports on every configured connection.
   *
   * Slower than the other calls by design: each report is two round trips to somebody else's server,
   * so a caller showing this should expect seconds rather than milliseconds and say so on screen.
   * @returns One report per connection, or undefined when the request failed.
   */
  async getStatuses(): Promise<DesktopConnectionStatusResponseModel[] | undefined> {
    const { data } = await tryExecute(this.#host, UmbraDesktopService.getConnectionStatuses());

    return data as DesktopConnectionStatusResponseModel[] | undefined;
  }

  /**
   * Reports on one connection, which is how the settings screen tests a connection after saving it.
   * @param id The connection's id.
   * @returns The report, or undefined when the request failed.
   */
  async getStatus(id: string): Promise<DesktopConnectionStatusResponseModel | undefined> {
    const { data } = await tryExecute(
      this.#host,
      UmbraDesktopService.getConnectionStatus({ path: { id } }),
    );

    return data as DesktopConnectionStatusResponseModel | undefined;
  }
}
