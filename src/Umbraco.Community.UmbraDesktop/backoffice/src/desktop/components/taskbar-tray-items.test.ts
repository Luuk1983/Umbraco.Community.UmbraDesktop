import { expect, waitUntil } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../settings/settings.context-token.js';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../settings/settings-store.js';
import { UMBRADESKTOP_TRAY_CONTEXT } from '../taskbar/tray/tray.context-token.js';
import type { UmbraDesktopTrayItem } from '../taskbar/tray/tray-items.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The taskbar's end of package tray items (umbraCoffee design §7): that it reads the tray context's
 * list and the user's switches, and puts one element per switched-on item in the tray, before the
 * clock. The loading, keeping and ordering are the controller's and tested beside it; this is only
 * the wiring the controller cannot see.
 */

/** Mounting a chrome component is slow in this runner; see `desktop-chrome.test.ts`. */
const MOUNT_TIMEOUT_MS = 20_000;

/** A tray item's element, plain, so what lands in the tray is recognisably the package's. */
class WiringTrayItem extends HTMLElement {}
customElements.define('umbradesktop-wiring-tray-item', WiringTrayItem);

/** One validated tray item, as the tray context lists it. */
const ITEM: UmbraDesktopTrayItem = {
  alias: 'Pkg.Tray',
  label: 'L',
  description: 'D',
  defaultEnabled: true,
  manifest: {
    type: 'umbraDesktopTrayItem',
    alias: 'Pkg.Tray',
    name: 'Tray',
    element: WiringTrayItem,
    meta: { label: 'L', description: 'D' },
  },
};

/**
 * A tray item that counts how often it has left the page. A kept element must never leave it: an
 * item holds state (the umbraCoffee cup polls), and a disconnect is what tears that down, so a
 * redraw that moves a node, rather than leaving it where it is, restarts the item.
 */
class CountingTrayItem extends HTMLElement {
  /** How many times this element has been disconnected. */
  disconnects = 0;

  /** Counts the disconnect. */
  disconnectedCallback() {
    this.disconnects += 1;
  }
}
customElements.define('umbradesktop-counting-tray-item', CountingTrayItem);

/**
 * A tray item whose element is a {@link CountingTrayItem}.
 * @param alias The item's alias; unique per case, since the taskbar is shared across the file.
 * @param element What the manifest's `element` holds; the class itself unless a case slows it down.
 * @returns The item.
 */
function countingItem(
  alias: string,
  element: UmbraDesktopTrayItem['manifest']['element'] = CountingTrayItem,
): UmbraDesktopTrayItem {
  return {
    alias,
    label: 'L',
    description: 'D',
    defaultEnabled: true,
    manifest: { type: 'umbraDesktopTrayItem', alias, name: alias, element, meta: { label: 'L', description: 'D' } },
  };
}

describe('the taskbar tray with package items', () => {
  let wrapper: HTMLElement;
  let host: UmbElementControllerHost;
  let taskbar: UmbraDesktopTaskbarElement;
  let items: UmbArrayState<UmbraDesktopTrayItem>;
  let features: UmbObjectState<Record<string, boolean>>;

  before(async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    host = new UmbElementControllerHost(wrapper);
    items = new UmbArrayState<UmbraDesktopTrayItem>([], (item) => item.alias);
    features = new UmbObjectState<Record<string, boolean>>({});
    // Stubs carrying only the observables the taskbar reads, provided by hand as
    // `taskbar-features.test.ts` does. `getHostElement` is there because the consumer calls it.
    new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
      pinned: new UmbArrayState<string>([], (a) => a).asObservable(),
      taskbarFeatures: features.asObservable(),
      locale: new UmbObjectState(UMBRADESKTOP_DEFAULT_SETTINGS.locale).asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();
    new UmbContextProvider(wrapper, UMBRADESKTOP_TRAY_CONTEXT, {
      items: items.asObservable(),
      getHostElement: () => wrapper,
    } as never).hostConnected();
    taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;
  });

  after(() => {
    host?.destroy();
    wrapper?.remove();
  });

  /** The package item's element in the tray, if drawn. */
  const drawn = () => taskbar.renderRoot.querySelector('.tray > umbradesktop-wiring-tray-item');

  /** The counting items in the tray, in DOM order. */
  const counting = () => [...taskbar.renderRoot.querySelectorAll<CountingTrayItem>('.tray > umbradesktop-counting-tray-item')];

  beforeEach(async () => {
    items.setValue([]);
    features.setValue({});
    await taskbar.updateComplete;
  });

  it('leaves an item in place when an item listed before it finishes loading later', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    const slow = (() => gate.then(() => ({ default: CountingTrayItem }))) as unknown as UmbraDesktopTrayItem['manifest']['element'];
    items.setValue([countingItem('Slow.First', slow), countingItem('Fast.Second')]);
    await waitUntil(() => counting().length === 1, 'the fast item should reach the tray first');
    const [fast] = counting();
    finish();
    await waitUntil(() => counting().length === 2, 'the slow item should reach the tray');
    expect(fast.isConnected, 'the fast item is still in the tray').to.equal(true);
    expect(fast.disconnects, 'the fast item was never taken off the page').to.equal(0);
  });

  it('leaves the other items in place when one between them is switched off', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    items.setValue([countingItem('Keep.A'), countingItem('Drop.B'), countingItem('Keep.C')]);
    await waitUntil(() => counting().length === 3, 'all three items should reach the tray');
    const [a, , c] = counting();
    features.setValue({ 'Drop.B': false });
    await waitUntil(() => counting().length === 2, 'the middle item should leave the tray');
    expect(counting()).to.deep.equal([a, c]);
    expect(a.disconnects, 'the first item was never taken off the page').to.equal(0);
    expect(c.disconnects, 'the last item was never taken off the page').to.equal(0);
  });

  it('draws a listed item in the tray, before the clock', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    items.setValue([ITEM]);
    await waitUntil(() => drawn() !== null, 'the item should reach the tray');
    const tray = taskbar.renderRoot.querySelector('.tray')!;
    expect(tray.lastElementChild?.classList.contains('clock'), 'the clock stays last').to.equal(true);
  });

  it('takes the item away when the user switches it off', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    items.setValue([ITEM]);
    await waitUntil(() => drawn() !== null, 'the item should reach the tray');
    features.setValue({ 'Pkg.Tray': false });
    await waitUntil(() => drawn() === null, 'the item should leave the tray');
  });
});
