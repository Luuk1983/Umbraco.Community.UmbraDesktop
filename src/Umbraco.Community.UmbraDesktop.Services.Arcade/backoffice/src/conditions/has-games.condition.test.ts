import { expect, fixture, html } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { customElement } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopArcadeHasGamesCondition } from './has-games.condition.js';

@customElement('umbradesktop-arcade-condition-test-host')
class TestHost extends UmbLitElement {}

it('refuses with no games and permits once one is registered', async () => {
  const host = await fixture<TestHost>(html`<umbradesktop-arcade-condition-test-host></umbradesktop-arcade-condition-test-host>`);
  const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
  UmbraDesktopArcadeHasGamesCondition.registry = registry as never;
  const changes: boolean[] = [];
  const condition = new UmbraDesktopArcadeHasGamesCondition(host, { host, config: { alias: 'x' }, onChange: (p: boolean) => changes.push(p) } as never);
  expect(condition.permitted).to.equal(false);

  registry.register({ type: 'umbraDesktopGame', alias: 'G', name: 'G', meta: { app: 'A', label: 'G', leaderboards: [] } } as unknown as UmbExtensionManifest);
  await new Promise((resolve) => setTimeout(resolve, 20));

  expect(condition.permitted).to.equal(true);
  expect(changes[changes.length - 1]).to.equal(true);
});
