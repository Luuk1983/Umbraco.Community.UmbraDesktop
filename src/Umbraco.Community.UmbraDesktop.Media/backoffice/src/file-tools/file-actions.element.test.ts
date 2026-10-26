import { expect, fixture, html } from '@open-wc/testing';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import './file-actions.element.js';
import type { UmbraDesktopFileActionsElement } from './file-actions.element.js';

/**
 * File actions (#176, the owner's second look): a footer button that only opens a menu, so no file tool
 * is the default behind the others. Its entries are the workspace action menu items registered for it,
 * as core's own fold-out lists those of Save and publish.
 */

const ALIAS = 'Test.FileActions';

/** A stand-in entry, as a menu item's element would draw itself. */
class ProbeEntry extends HTMLElement {
  /** Draws its label. */
  connectedCallback() {
    this.textContent = 'Probe entry';
  }
}
customElements.define('probe-file-actions-entry', ProbeEntry);

/** A stand-in entry's api. */
class ProbeApi {
  /** Does nothing. */
  async execute() {}
  /** Nothing to tear down. */
  destroy() {}
}

const ENTRIES = ['Test.FileActions.One', 'Test.FileActions.Two', 'Test.FileActions.Elsewhere'];

before(() => {
  umbExtensionsRegistry.registerMany([
    { type: 'workspaceActionMenuItem', alias: ENTRIES[0], name: 'One', weight: 20, forWorkspaceActions: ALIAS, element: ProbeEntry, api: ProbeApi, meta: { label: 'One' } },
    { type: 'workspaceActionMenuItem', alias: ENTRIES[1], name: 'Two', weight: 10, forWorkspaceActions: ALIAS, element: ProbeEntry, api: ProbeApi, meta: { label: 'Two' } },
    { type: 'workspaceActionMenuItem', alias: ENTRIES[2], name: 'Elsewhere', forWorkspaceActions: 'Some.Other.Action', element: ProbeEntry, api: ProbeApi, meta: { label: 'Elsewhere' } },
  ] as never);
});
after(() => ENTRIES.forEach((alias) => umbExtensionsRegistry.unregister(alias)));

/**
 * The button with its manifest, once its entries have arrived.
 * @param label Its label.
 * @returns The element.
 */
async function mount(label = 'File actions') {
  const element = await fixture<UmbraDesktopFileActionsElement>(html`<umbradesktop-media-file-actions></umbradesktop-media-file-actions>`);
  element.manifest = { type: 'workspaceAction', alias: ALIAS, name: 'File actions', meta: { label } } as never;
  for (let i = 0; i < 40 && element.shadowRoot!.querySelectorAll('probe-file-actions-entry').length < 2; i++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await element.updateComplete;
  return element;
}

describe('File actions', () => {
  it('is a button labelled from its manifest, which opens a menu', async () => {
    const element = await mount();
    const button = element.shadowRoot!.querySelector('uui-button')!;
    expect(button.getAttribute('label')).to.equal('File actions');
    expect(button.getAttribute('popovertarget')).to.equal('file-actions-popover');
    expect(element.shadowRoot!.querySelector('uui-popover-container#file-actions-popover')).to.not.equal(null);
  });

  it('lists the entries registered for it, heaviest first, and no others', async () => {
    const element = await mount();
    const entries = [...element.shadowRoot!.querySelectorAll('probe-file-actions-entry')];
    expect(entries.length).to.equal(2);
  });

  it('opens on a click, as core’s fold-out does', async () => {
    const element = await mount();
    element.shadowRoot!.querySelector<HTMLElement>('uui-button')!.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(element.shadowRoot!.querySelector('#file-actions-popover')!.matches(':popover-open')).to.equal(true);
  });
});
