import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopTrayItemsController } from './tray-items.controller.js';
import type { UmbraDesktopTrayItem } from './tray-items.js';
import type { ManifestUmbraDesktopTrayItem } from '../../tray.extension.js';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * The controller's host. An `UmbLitElement`, as the taskbar is, because a controller needs a real
 * controller host to attach to and `requestUpdate` is the one thing the controller calls on it.
 * Counts those calls so a case can tell that the tray was asked to redraw.
 */
class TrayItemsTestHost extends UmbLitElement {
  /** How many times the controller asked for a redraw. */
  updates = 0;

  /** Counts the request and passes it on, so Lit still behaves as it would in the taskbar. */
  override requestUpdate(...args: Parameters<UmbLitElement['requestUpdate']>) {
    this.updates += 1;
    super.requestUpdate(...args);
  }
}
customElements.define('umbradesktop-tray-items-test-host', TrayItemsTestHost);

/** A tray item's element: plain, so everything under test is the controller's own doing. */
class TestTrayItem extends HTMLElement {}
customElements.define('umbradesktop-test-tray-item', TestTrayItem);

/**
 * A validated tray item, as the tray context hands it over.
 * @param alias The item's alias.
 * @param element What the manifest's `element` holds; a class by default, as a static import gives.
 * @param defaultEnabled Whether it is on for a user with no opinion.
 * @returns The item.
 */
function item(
  alias: string,
  element: ManifestUmbraDesktopTrayItem['element'] = TestTrayItem,
  defaultEnabled = true,
): UmbraDesktopTrayItem {
  return {
    alias,
    label: 'L',
    description: 'D',
    defaultEnabled,
    manifest: { type: 'umbraDesktopTrayItem', alias, name: alias, element, meta: { label: 'L', description: 'D' } },
  };
}

/**
 * The elements the controller would put in the tray, in its order.
 * @param controller The controller under test.
 * @returns Its entries' elements.
 */
const elements = (controller: UmbraDesktopTrayItemsController) => controller.entries.map((entry) => entry.element);

/** A tray item's element that has nothing to show from the moment it exists. */
class HiddenFromStartTrayItem extends HTMLElement {
  /** Hides itself at once, as an item with nothing to report yet would. */
  constructor() {
    super();
    this.hidden = true;
  }
}
customElements.define('umbradesktop-hidden-from-start-tray-item', HiddenFromStartTrayItem);

/** A second element class, so a case can tell which of two manifests an element came from. */
class OtherTrayItem extends HTMLElement {}
customElements.define('umbradesktop-other-tray-item', OtherTrayItem);

/** @returns A connected host and a controller on it. */
async function setup() {
  const host = await fixture<TrayItemsTestHost>(html`<umbradesktop-tray-items-test-host></umbradesktop-tray-items-test-host>`);
  return { host, controller: new UmbraDesktopTrayItemsController(host) };
}

/**
 * Let the `hidden` watcher run. A `MutationObserver` callback is a microtask, so a macrotask hop is
 * comfortably after it without depending on how many microtasks deep it sits.
 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * A load that finishes only when the test says so, for the cases about a switch that changes while
 * an element is still being fetched.
 * @returns The `element` loader to put on a manifest, and the function that lets it finish.
 */
function deferredLoad() {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  const element = (() => gate.then(() => ({ default: TestTrayItem }))) as unknown as ManifestUmbraDesktopTrayItem['element'];
  return { element, finish };
}

describe('UmbraDesktopTrayItemsController', () => {
  it('creates an element per enabled item and none for a disabled one', async () => {
    const { host, controller } = await setup();
    await controller.sync([item('a'), item('b')], { b: false });
    expect(elements(controller).map((e) => e.localName)).to.deep.equal(['umbradesktop-test-tray-item']);
    expect(host.updates).to.be.greaterThan(0);
  });

  it('respects an item that ships switched off, and one the user switched on', async () => {
    const { controller } = await setup();
    await controller.sync([item('a', TestTrayItem, false)], {});
    expect(elements(controller)).to.deep.equal([]);
    await controller.sync([item('a', TestTrayItem, false)], { a: true });
    expect(elements(controller)).to.have.length(1);
  });

  it('keeps an element across syncs rather than rebuilding it', async () => {
    const { controller } = await setup();
    await controller.sync([item('a')], {});
    const first = elements(controller)[0];
    await controller.sync([item('a'), item('b')], {});
    expect(elements(controller)[0]).to.equal(first);
  });

  it('puts package items before the clock, oldest nearest it', async () => {
    const { controller } = await setup();
    await controller.sync([item('a'), item('b')], {});
    const [a, b] = elements(controller);
    // Both arrived together, so registry order decides: a first, nearest the clock at order 0.
    expect(Number(a.style.order)).to.equal(-1);
    expect(Number(b.style.order)).to.equal(-2);
  });

  it('sends an item that hides and comes back to the far end', async () => {
    const { controller } = await setup();
    await controller.sync([item('a'), item('b')], {});
    const [a, b] = elements(controller);
    a.hidden = true;
    await settle();
    expect(a.style.order).to.equal('');
    expect(Number(b.style.order)).to.equal(-1);
    a.hidden = false;
    await settle();
    expect(Number(a.style.order)).to.be.lessThan(Number(b.style.order));
  });

  it('forgets an item switched off, and makes a fresh element when it comes back', async () => {
    const { controller } = await setup();
    await controller.sync([item('a')], {});
    const first = elements(controller)[0];
    await controller.sync([item('a')], { a: false });
    expect(elements(controller)).to.deep.equal([]);
    await controller.sync([item('a')], { a: true });
    expect(elements(controller)).to.have.length(1);
    expect(elements(controller)[0]).to.not.equal(first);
  });

  it('drops an element whose item was switched off while it was still loading', async () => {
    const { controller } = await setup();
    const slow = deferredLoad();
    const first = controller.sync([item('a', slow.element)], {});
    await controller.sync([item('a', slow.element)], { a: false });
    slow.finish();
    await first;
    expect(elements(controller)).to.deep.equal([]);
  });

  it('makes one element when a second sync arrives while the first is still loading', async () => {
    const { controller } = await setup();
    const slow = deferredLoad();
    let loads = 0;
    const counting = (() => {
      loads += 1;
      return (slow.element as unknown as () => Promise<unknown>)();
    }) as unknown as ManifestUmbraDesktopTrayItem['element'];
    // One item object for both syncs: the tray context hands the same manifest over by reference on
    // every emission, and a load is shared per manifest, not per alias.
    const a = item('a', counting);
    const first = controller.sync([a], {});
    const second = controller.sync([a], { unrelated: true });
    slow.finish();
    await Promise.all([first, second]);
    expect(loads).to.equal(1);
    expect(elements(controller)).to.have.length(1);
  });

  it('skips an item whose element fails to load, says so once, and still draws the rest', async () => {
    const errors: unknown[][] = [];
    const realError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const { controller } = await setup();
      const broken = (() => Promise.reject(new Error('404'))) as unknown as ManifestUmbraDesktopTrayItem['element'];
      const items = [item('broken', broken), item('fine')];
      await controller.sync(items, {});
      await controller.sync(items, { unrelated: true });
      expect(elements(controller).map((e) => e.localName)).to.deep.equal(['umbradesktop-test-tray-item']);
      const reports = errors.filter((args) => String(args[0]).includes('"broken"'));
      expect(reports).to.have.length(1);
      expect(String(reports[0][0])).to.contain('[UmbraDesktop]');
    } finally {
      console.error = realError;
    }
  });

  it('never gives a flex order to an item hidden from the start, and puts it at the far end when it shows', async () => {
    const { controller } = await setup();
    await controller.sync([item('a'), item('b', HiddenFromStartTrayItem)], {});
    const [a, b] = elements(controller);
    expect(b.hidden, 'this case needs b hidden from the start').to.equal(true);
    expect(b.style.order).to.equal('');
    expect(Number(a.style.order)).to.equal(-1);
    b.hidden = false;
    await settle();
    // a was visible first, so it keeps the seat nearest the clock even though b is listed after it
    // only by chance: b joins at the far end because it appeared later.
    expect(Number(a.style.order)).to.equal(-1);
    expect(Number(b.style.order)).to.equal(-2);
  });

  it('draws nothing for a load still in flight when it is destroyed', async () => {
    const { host, controller } = await setup();
    const slow = deferredLoad();
    const pending = controller.sync([item('a', slow.element)], {});
    controller.destroy();
    const updates = host.updates;
    slow.finish();
    await pending;
    expect(elements(controller)).to.deep.equal([]);
    expect(host.updates, 'no redraw was asked for').to.equal(updates);
  });

  it('discards a load for a manifest that was replaced under the same alias while it ran', async () => {
    const { controller } = await setup();
    const slow = deferredLoad();
    const first = controller.sync([item('a', slow.element)], {});
    await controller.sync([item('a', OtherTrayItem)], {});
    slow.finish();
    await first;
    expect(elements(controller).map((e) => e.localName)).to.deep.equal(['umbradesktop-other-tray-item']);
  });

  it('follows hidden again after the host comes back', async () => {
    const { host, controller } = await setup();
    await controller.sync([item('a'), item('b')], {});
    const [a, b] = elements(controller);
    const parent = host.parentNode!;
    host.remove();
    parent.append(host);
    a.hidden = true;
    await settle();
    expect(a.style.order).to.equal('');
    expect(Number(b.style.order)).to.equal(-1);
  });
});
