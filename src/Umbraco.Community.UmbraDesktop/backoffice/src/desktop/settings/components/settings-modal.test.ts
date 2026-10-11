import { expect } from '@open-wc/testing';
import './settings-modal.element.js';
import { UMBRADESKTOP_SETTINGS_CATEGORIES } from '../categories/index.js';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import type {
  UmbConditionConfigBase,
  UmbConditionControllerArguments,
  UmbExtensionCondition,
} from '@umbraco-cms/backoffice/extension-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The panel's own job is navigation: show the categories, go into one, come back, and put focus
 * where the person using it would look for it. Everything else on screen belongs to a category's
 * element or to a picker.
 *
 * Two things about testing this surface, both learned the hard way here:
 *
 * **Assert on strings and booleans, never on a DOM node.** When an assertion over an element fails,
 * chai builds its message by inspecting the value, and inspecting a Lit element with a shadow root
 * and resolved contexts does not come back — the run dies at the runner's 120s file timeout with no
 * failure to read. Every check below compares a tag name, an id or a boolean, so a failure prints a
 * diff instead of hanging the suite.
 *
 * **Clicks on a `uui-button` land a macrotask late.** Measured: a click on one of our own elements
 * runs its handler synchronously, so `await element.updateComplete` sees the new state, while a
 * click on `uui-button` — the back button — has not run its handler by the time that promise
 * resolves. Hence `settle()`, which waits a macrotask first. Awaiting `updateComplete` twice does
 * not help; the handler has not run at all yet.
 */

/** Wait for a click to have been handled and the panel to have rendered what it did. */
const settle = async (element: { updateComplete: Promise<unknown> }) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
};

/**
 * Mount the panel, optionally at a category.
 *
 * Mounted by hand rather than with `fixture()`, which never settles for a modal element — it waits
 * on the whole rendered tree, and this renders `umb-body-layout` and `uui-button`, neither
 * registered in a bare test page.
 * @param data The modal data, for the deep-link cases.
 * @param registry Where package settings come from, for the package cases.
 * @returns The element and queries over what it rendered.
 */
async function panel(data?: { category?: string }, registry?: UmbExtensionRegistry<UmbExtensionManifest>) {
  const element = document.createElement('umbradesktop-settings-modal');
  // Always a registry of the test's own, empty unless the case fills it, so a manifest registered
  // on the backoffice's registry by another test file cannot add a row here. Set before the element
  // connects, because that is when it is read.
  element.registry = registry ?? new UmbExtensionRegistry<UmbExtensionManifest>();
  if (data) element.data = data;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;

  const root = element.shadowRoot!;
  return {
    element,
    rowIds: () =>
      [...root.querySelectorAll('umbradesktop-settings-row')].map((row) => (row as HTMLElement).dataset.category),
    iconNames: () =>
      [...root.querySelectorAll('umbradesktop-settings-row uui-icon')].map((icon) => icon.getAttribute('name')),
    // By id, not by index: the order of the categories is the registry's business and changes when
    // it changes, and a test that clicked "the first row" would quietly start testing another one.
    // Escaped, because a package row's id carries the package's name, spaces and all.
    clickRow: (id: string) =>
      (root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(id)}"]`) as HTMLElement).click(),
    headline: (id: string) =>
      root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(id)}"]`)?.getAttribute('headline') ??
      null,
    detail: (id: string) =>
      root.querySelector(`umbradesktop-settings-row[data-category="${CSS.escape(id)}"]`)?.getAttribute('detail') ?? null,
    sectionHeading: () => root.querySelector('.section')?.textContent?.trim() ?? null,
    headingText: () => root.querySelector('.heading')?.textContent?.trim() ?? null,
    clickBack: () => (root.querySelector('.crumb uui-button') as HTMLElement | null)?.click(),
    hasHeading: () => !!root.querySelector('.heading'),
    showing: (tag: string) => !!root.querySelector(tag),
    focused: () => {
      const active = root.activeElement as HTMLElement | null;
      return active?.dataset?.category ?? active?.className ?? null;
    },
  };
}

const ids = UMBRADESKTOP_SETTINGS_CATEGORIES.map((category) => category.id);

it('opens on the categories, one row each', async () => {
  const view = await panel();

  expect(view.rowIds()).to.deep.equal(ids);
  expect(view.hasHeading(), 'the list is not inside a category, so it has no back heading').to.equal(false);
});

it('gives every row an icon to be recognised by', async () => {
  const view = await panel();

  expect(view.iconNames()).to.deep.equal(UMBRADESKTOP_SETTINGS_CATEGORIES.map((category) => category.icon));
});

it('shows a category when its row is picked, and the list stops being there', async () => {
  const view = await panel();

  view.clickRow('appearance');
  await settle(view.element);

  expect(view.showing('umbradesktop-settings-appearance')).to.equal(true);
  expect(view.rowIds(), 'the category list is replaced, not appended to').to.deep.equal([]);
});

it('comes back to the list', async () => {
  const view = await panel();

  view.clickRow('appearance');
  await settle(view.element);
  view.clickBack();
  await settle(view.element);

  expect(view.showing('umbradesktop-settings-appearance')).to.equal(false);
  expect(view.rowIds()).to.deep.equal(ids);
});

it('opens straight at the category it was asked for', async () => {
  const view = await panel({ category: 'general' });

  expect(view.showing('umbradesktop-settings-general')).to.equal(true);
  expect(view.hasHeading()).to.equal(true);
});

it('opens at the list when asked for a category it has never heard of', async () => {
  // A deep link from a version that had a category this one does not, or a typo in whatever wrote
  // it. Either way, a list is a recoverable place to land and an empty screen is not.
  const view = await panel({ category: 'nothing-of-the-sort' });

  expect(view.rowIds()).to.deep.equal(ids);
  expect(view.hasHeading()).to.equal(false);
});

it('moves focus to the category heading on the way in, and back to its row on the way out', async () => {
  // Without this the panel loses its place twice per visit: going in leaves focus on a row that is
  // no longer rendered, coming back leaves it on a back button that has just gone.
  const view = await panel();

  view.clickRow('appearance');
  await settle(view.element);
  expect(view.focused(), 'focus follows you into the category').to.equal('heading');

  view.clickBack();
  await settle(view.element);
  expect(view.focused(), 'focus returns to the row you came from').to.equal('appearance');
});

describe('package settings', () => {
  /** A box element that does nothing, since these cases are about the list and the navigation. */
  class Box extends HTMLElement {}
  if (!customElements.get('test-package-box')) customElements.define('test-package-box', Box);

  /**
   * A registry holding one package-settings manifest per entry.
   * @param boxes The boxes, each naming its package and, for the condition case, its conditions.
   * @returns The registry.
   */
  function registryWith(...boxes: Array<{ alias: string; pkg: string; label: string; conditions?: unknown[] }>) {
    const registry = new UmbExtensionRegistry<UmbExtensionManifest>();
    for (const box of boxes) addBox(registry, box);
    return registry;
  }

  /**
   * Register one package-settings manifest, for the cases where a package arrives after the panel
   * opened.
   * @param registry The registry to add it to.
   * @param box The box, naming its package and, for the condition case, its conditions.
   */
  function addBox(
    registry: UmbExtensionRegistry<UmbExtensionManifest>,
    { alias, pkg, label, conditions }: { alias: string; pkg: string; label: string; conditions?: unknown[] },
  ) {
    registry.register({
      type: 'umbraDesktopPackageSettings',
      alias,
      name: alias,
      element: Box,
      meta: { package: pkg, label },
      ...(conditions ? { conditions } : {}),
    } as UmbExtensionManifest);
  }

  /**
   * Wait until `done` holds. Package rows arrive through condition evaluation, which is async and
   * debounced to an animation frame, so a single settle is not enough.
   * @param view The mounted panel.
   * @param done What has to hold.
   */
  async function until(view: Awaited<ReturnType<typeof panel>>, done: () => boolean) {
    for (let tries = 0; tries < 50 && !done(); tries++) await settle(view.element);
  }

  /**
   * A package row's id.
   * @param name The package name.
   * @returns The id the panel gives its row.
   */
  const row = (name: string) => `package:${name}`;

  it('shows no package section when no package has settings', async () => {
    const view = await panel();
    expect(view.sectionHeading()).to.equal(null);
    expect(view.rowIds()).to.deep.equal(ids);
  });

  it('adds one row per package after our own categories, under a heading', async () => {
    const view = await panel(
      undefined,
      registryWith(
        { alias: 'B1', pkg: 'Beta tools', label: 'One' },
        { alias: 'A1', pkg: 'Alpha tools', label: 'Main' },
        { alias: 'B2', pkg: 'Beta tools', label: 'Two' },
      ),
    );
    await until(view, () => view.rowIds().includes(row('Beta tools')));
    expect(view.rowIds()).to.deep.equal([...ids, row('Alpha tools'), row('Beta tools')]);
    expect(view.sectionHeading()).to.match(/settingsAddOns|Add-ons/);
    expect(view.headline(row('Beta tools'))).to.equal('Beta tools');
    expect(view.detail(row('Beta tools'))).to.equal('One, Two');
  });

  it('opens a package’s screen, headed by its name', async () => {
    const view = await panel(undefined, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'Main' }));
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    view.clickRow(row('Alpha tools'));
    await settle(view.element);
    expect(view.showing('umbradesktop-settings-package')).to.equal(true);
    expect(view.headingText()).to.equal('Alpha tools');
  });

  it('leaves out a box whose conditions are not met, and a package with none left', async () => {
    const registry = registryWith(
      { alias: 'Shown', pkg: 'Shown tools', label: 'x' },
      { alias: 'Hidden', pkg: 'Hidden tools', label: 'x', conditions: [{ alias: 'Test.Condition.Never' }] },
    );
    registry.register({
      type: 'condition',
      alias: 'Test.Condition.Never',
      name: 'Never',
      api: class extends UmbConditionBase<UmbConditionConfigBase> implements UmbExtensionCondition {
        constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase>) {
          super(host, args);
          this.permitted = false;
        }
      },
    });
    const view = await panel(undefined, registry);
    await until(view, () => view.rowIds().includes(row('Shown tools')));
    await settle(view.element);
    expect(view.rowIds()).to.deep.equal([...ids, row('Shown tools')]);
  });

  it('opens straight at a package it was asked for by name, even though it arrives late', async () => {
    const view = await panel({ category: 'Alpha tools' }, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' }));
    await until(view, () => view.showing('umbradesktop-settings-package'));
    expect(view.headingText()).to.equal('Alpha tools');
  });

  it('drops a held deep link once the user has gone somewhere themselves', async () => {
    // The link names a package that has not arrived. The user does not wait for it: they go into a
    // category and back. When the package does arrive, jumping into it now would be the panel
    // moving under them unasked.
    const registry = registryWith();
    const view = await panel({ category: 'Alpha tools' }, registry);
    view.clickRow('appearance');
    await settle(view.element);
    view.clickBack();
    await settle(view.element);

    addBox(registry, { alias: 'A1', pkg: 'Alpha tools', label: 'x' });
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    await settle(view.element);

    expect(view.showing('umbradesktop-settings-package')).to.equal(false);
    expect(view.rowIds()).to.deep.equal([...ids, row('Alpha tools')]);
  });

  it('opens at the package it was asked for again when it is reconnected', async () => {
    // A category link reopens on reconnect because it is answered on the spot. A package link has to
    // be too: the observer reports nothing on a reconnect when nothing changed, so waiting for it
    // would leave the list showing.
    const view = await panel({ category: 'Alpha tools' }, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' }));
    await until(view, () => view.showing('umbradesktop-settings-package'));
    view.clickBack();
    await settle(view.element);

    view.element.remove();
    document.body.append(view.element);
    await settle(view.element);

    expect(view.showing('umbradesktop-settings-package')).to.equal(true);
    expect(view.headingText()).to.equal('Alpha tools');
  });

  it('goes back to the list when the open package goes away', async () => {
    const registry = registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' });
    const view = await panel(undefined, registry);
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    view.clickRow(row('Alpha tools'));
    await settle(view.element);
    registry.unregister('A1');
    await until(view, () => !view.showing('umbradesktop-settings-package'));
    expect(view.hasHeading()).to.equal(false);
    expect(view.rowIds()).to.deep.equal(ids);
  });

  it('puts focus back on the package row on the way out', async () => {
    const view = await panel(undefined, registryWith({ alias: 'A1', pkg: 'Alpha tools', label: 'x' }));
    await until(view, () => view.rowIds().includes(row('Alpha tools')));
    view.clickRow(row('Alpha tools'));
    await settle(view.element);
    view.clickBack();
    await settle(view.element);
    expect(view.focused()).to.equal(row('Alpha tools'));
  });
});
