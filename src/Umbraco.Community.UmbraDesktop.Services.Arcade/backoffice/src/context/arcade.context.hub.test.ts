import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextToken } from '@umbraco-cms/backoffice/context-api';
import type { UmbContextMinimal } from '@umbraco-cms/backoffice/context-api';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { ARCADE_HUB_ALIAS } from '../hub/constants.js';
import type { ArcadeHubRequest } from './arcade.context.js';
import { UmbraDesktopArcadeContext } from './arcade.context.js';

/** Hosts the context and provides the window manager on the same element, as the desktop element does. */
@customElement('umbradesktop-arcade-hub-request-test-host')
class TestHost extends UmbLitElement {}

/** The newest request seen; the package targets ES2020, which has no `Array.prototype.at`. @param requests Everything the observable emitted. @returns The last one. */
function latest(requests: Array<ArcadeHubRequest | undefined>): ArcadeHubRequest | undefined {
  return requests[requests.length - 1];
}

/** A context on a host that may or may not provide a window manager answering `openApp` with `opens`. */
async function setup(windowManager: boolean, opens = true) {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-hub-request-test-host></umbradesktop-arcade-hub-request-test-host>`);
  const opened: string[] = [];
  if (windowManager) {
    host.provideContext(new UmbContextToken<UmbContextMinimal>('UmbraDesktopWindowManagerContext'), {
      getHostElement: () => host,
      openApp: (alias: string) => { opened.push(alias); return opens; },
    } as never);
  }
  const context = new UmbraDesktopArcadeContext(host, {
    api: { takeBeaten: async () => [] } as never,
    registry: new UmbExtensionRegistry<UmbExtensionManifest>() as never,
    storage: () => ({ getItem: () => null, setItem: () => undefined }) as unknown as Storage,
  });
  const requests: Array<ArcadeHubRequest | undefined> = [];
  context.hubRequest.subscribe((request) => requests.push(request));
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { context, opened, requests };
}

it('records the board to show and opens the hub, finding the window manager on its own host', async () => {
  const { context, opened, requests } = await setup(true);
  expect(context.showBoard('Pkg.Snake.Game', 'default')).to.equal(true);
  expect(opened).to.deep.equal([ARCADE_HUB_ALIAS]);
  expect(latest(requests)).to.deep.equal({ game: 'Pkg.Snake.Game', board: 'default' });
});

it('forgets a request once the hub has taken it', async () => {
  const { context, requests } = await setup(true);
  context.showBoard('Pkg.Snake.Game');
  context.clearHubRequest();
  expect(latest(requests)).to.equal(undefined);
});

it('keeps no request when the hub cannot be opened', async () => {
  const refused = await setup(true, false);
  expect(refused.context.showBoard('Pkg.Snake.Game')).to.equal(false);
  expect(latest(refused.requests)).to.equal(undefined);
  const alone = await setup(false);
  expect(alone.context.showBoard('Pkg.Snake.Game')).to.equal(false);
  expect(latest(alone.requests)).to.equal(undefined);
});
