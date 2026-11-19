import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopService } from '../../api/sdk.gen';
import { markClientReady } from '../boot/client-ready.js';
import { UmbraDesktopConnectionsRepository } from './connections.repository.js';

/**
 * The repository's list of connections is read at boot, by the condition that decides whether the
 * Remote content app shows. On a full load that can be before the entry point has configured the API
 * client, and a request sent then goes to the generated client's default host and fails.
 */
describe('the connections repository', () => {
  it('waits for the API client to be configured before it lists the connections', async () => {
    const host = new UmbElementControllerHost(document.createElement('div'));
    const real = UmbraDesktopService.getConnections;
    let asked = 0;
    UmbraDesktopService.getConnections = (() => {
      asked++;
      return Promise.resolve({ data: [] });
    }) as never;
    try {
      const list = new UmbraDesktopConnectionsRepository(host).getConnections();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(asked).to.equal(0);

      markClientReady();

      expect(await list).to.deep.equal([]);
      expect(asked).to.equal(1);
    } finally {
      UmbraDesktopService.getConnections = real;
      host.destroy();
    }
  });
});
