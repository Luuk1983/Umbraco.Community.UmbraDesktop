import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbraDesktopWindowManagerContext } from './window-manager.context';
import type { UmbraDesktopEntityChange } from './window-manager.context';

/**
 * A change made on the desktop itself (#176): the Image Editor saving a picture, Replace file, an
 * Optimize run. The windows showing that item hear it from the desktop at once, rather than only
 * through the server's event connection, which can be down or slow (measured 2026-10-26: with the hub
 * blocked, an item pane kept the old picture while the Manager's card, told directly, took the new one).
 */

/**
 * A manager on a host of its own.
 * @returns The manager and its host.
 */
function manager() {
  const host = new UmbElementControllerHost(document.createElement('div'));
  return { host, manager: new UmbraDesktopWindowManagerContext(host) };
}

describe('entityChanged', () => {
  it('tells every listener which entity changed', () => {
    const { host, manager: m } = manager();
    const heard: UmbraDesktopEntityChange[] = [];
    m.onEntityChanged((change) => heard.push(change));
    m.onEntityChanged((change) => heard.push(change));
    m.entityChanged('media', 'banjo');
    expect(heard).to.deep.equal([
      { entityType: 'media', unique: 'banjo' },
      { entityType: 'media', unique: 'banjo' },
    ]);
    host.destroy();
  });

  it('stops telling a listener that has gone', () => {
    const { host, manager: m } = manager();
    const heard: string[] = [];
    const stop = m.onEntityChanged((change) => heard.push(change.unique));
    stop();
    m.entityChanged('media', 'banjo');
    expect(heard).to.deep.equal([]);
    host.destroy();
  });

  it('ignores a change without a key', () => {
    const { host, manager: m } = manager();
    const heard: string[] = [];
    m.onEntityChanged((change) => heard.push(change.unique));
    m.entityChanged('media', '');
    expect(heard).to.deep.equal([]);
    host.destroy();
  });
});
