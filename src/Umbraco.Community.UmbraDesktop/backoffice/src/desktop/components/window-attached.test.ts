import { expect } from '@open-wc/testing';
import './window.element.js';
import './taskbar.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The chrome's side of attached content: what only a rendered taskbar, window or pane can answer.
 * What the group *does* is tested on the manager and in `window-group.test.ts`.
 */

/** How long a mounted case may take: a window renders a frame. */
const TIMEOUT_MS = 20_000;

/** The owner's app. */
const DOC: UmbraDesktopApp = {
  alias: 'doc',
  name: 'Doc',
  icon: 'icon-document',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
  defaultSize: { w: 700, h: 500 },
  minSize: { w: 600, h: 300 },
};

/** A trivial element standing in for a preview, so a pane and a floating window have a body. */
class ProbeBodyElement extends HTMLElement {}
customElements.define('umbradesktop-test-attached-body', ProbeBodyElement);

/** The attached app. */
const PREVIEW: UmbraDesktopApp = {
  alias: 'preview',
  name: 'Preview: Home',
  icon: 'icon-eye',
  content: { kind: 'element', element: () => Promise.resolve({ element: ProbeBodyElement }) },
  chromeProfile: 'bare',
  defaultSize: { w: 300, h: 400 },
  minSize: { w: 250, h: 200 },
};

/** Everything a case mounted, torn down after it. */
let cleanup: Array<() => void> = [];

afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A manager on a surface pinned to the viewport's corner, with a document window on it.
 * @param bounds The desktop size, which decides whether a pane fits.
 * @returns The wrapper, the manager and the document's id.
 */
function desk(bounds = { w: 1600, h: 900 }) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed; left:0; top:0; width:${bounds.w}px; height:${bounds.h}px;`;
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds(bounds);
  cleanup.push(() => {
    host.destroy();
    wrapper.remove();
  });
  manager.open(DOC);
  const doc = manager.getWindows()[0].id;
  manager.move(doc, 100, 50);
  return { wrapper, manager, doc };
}

/**
 * Mount a window element for one window, kept in step with the manager the way the desktop's repeat
 * would.
 * @param wrapper Where to mount it.
 * @param manager The manager holding the window.
 * @param id The window's id.
 * @returns The element and a function that re-reads the manager into it.
 */
async function mountWindow(wrapper: HTMLElement, manager: UmbraDesktopWindowManagerContext, id: string) {
  const element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
  const read = (): UmbraDesktopWindow => manager.getWindows().find((w) => w.id === id)!;
  element.window = read();
  wrapper.appendChild(element);
  await element.updateComplete;
  const sync = async () => {
    element.window = { ...read() };
    await element.updateComplete;
  };
  return { element, sync };
}

/**
 * The window's pane, once it has rendered.
 * @param element The window.
 * @returns The pane element.
 */
async function paneOf(element: UmbraDesktopWindowElement): Promise<HTMLElement> {
  const pane = element.renderRoot.querySelector('umbradesktop-window-pane') as HTMLElement & { updateComplete: Promise<unknown> };
  await pane.updateComplete;
  return pane;
}

/**
 * Wait for a condition, for what settles after an animation rather than on the next render.
 * @param condition What to wait for.
 */
async function until(condition: () => boolean): Promise<void> {
  const start = performance.now();
  while (!condition()) {
    if (performance.now() - start > 5_000) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Answer the reduced-motion query as a system with that setting would, for one test.
 * @returns What puts the real query back.
 */
function reduceMotion(): () => void {
  const real = window.matchMedia;
  window.matchMedia = ((query: string) =>
    query.includes('prefers-reduced-motion') ? ({ matches: true } as MediaQueryList) : real.call(window, query)) as typeof window.matchMedia;
  return () => (window.matchMedia = real);
}

/**
 * Mount a taskbar against the manager.
 * @param wrapper Where to mount it.
 * @returns The taskbar.
 */
async function mountTaskbar(wrapper: HTMLElement): Promise<UmbraDesktopTaskbarElement> {
  const taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
  wrapper.appendChild(taskbar);
  await taskbar.updateComplete;
  return taskbar;
}

/**
 * The space a strip button leaves around what it shows, on each side: to its first icon on the left,
 * top and bottom, and to its last child on the right, which is the label on a labelled button.
 * @param button The button.
 * @returns The four paddings, in px.
 */
function paddings(button: Element): { left: number; right: number; top: number; bottom: number } {
  const box = button.getBoundingClientRect();
  const icon = button.querySelector('umb-icon')!.getBoundingClientRect();
  const last = button.lastElementChild!.getBoundingClientRect();
  return { left: icon.left - box.left, right: box.right - last.right, top: icon.top - box.top, bottom: box.bottom - icon.bottom };
}

/**
 * Expect a strip button to pad what it shows by the same amount on all four sides, to within half a
 * pixel, since an odd space split in two lands on a half.
 * @param button The button.
 * @param name What to call it in a failure.
 */
function expectEvenPadding(button: Element, name: string): void {
  const pad = paddings(button);
  for (const side of ['left', 'right', 'bottom'] as const) {
    expect(pad[side], `${name}: ${side} against top`).to.be.closeTo(pad.top, 0.5);
  }
}

describe('the taskbar and a group', () => {
  it('puts the owner and its floating window inside one group box', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    manager.openAttached(doc, PREVIEW, 'right');
    const taskbar = await mountTaskbar(wrapper);
    const group = taskbar.renderRoot.querySelector('.running .task-group');
    expect(group?.querySelectorAll('.task')).to.have.lengthOf(2);
  });

  it('draws a window with nothing floating exactly as before, with no group box', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper } = desk();
    const taskbar = await mountTaskbar(wrapper);
    expect(taskbar.renderRoot.querySelector('.task-group')).to.equal(null);
    expect(taskbar.renderRoot.querySelectorAll('.running .task')).to.have.lengthOf(1);
  });

  it('draws no button for a pane, which is part of its window', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const taskbar = await mountTaskbar(wrapper);
    expect(taskbar.renderRoot.querySelectorAll('.running .task')).to.have.lengthOf(1);
  });

  it('marks the focused window button active, not the whole group', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const taskbar = await mountTaskbar(wrapper);
    manager.focus(id);
    await taskbar.updateComplete;
    const active = [...taskbar.renderRoot.querySelectorAll('.task-group .task.active')];
    expect(active).to.have.lengthOf(1);
    expect(active[0].getAttribute('title')).to.contain('Preview');
  });

  it('focuses the window whose button was clicked', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    manager.focus(doc);
    const taskbar = await mountTaskbar(wrapper);
    const buttons = taskbar.renderRoot.querySelectorAll('.task-group .task');
    (buttons[1] as HTMLElement).click();
    expect(manager.getWindows().find((w) => w.id === id)?.active).to.equal(true);
  });
});

describe('a pane', () => {
  it('is drawn inside its window, beside the content column rather than in it', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = element.renderRoot.querySelector('umbradesktop-window-pane');
    expect(pane).to.exist;
    expect(element.renderRoot.querySelector('.column')?.contains(pane)).to.equal(false);
    expect(element.renderRoot.querySelector('.column .bodywrap')).to.exist;
  });

  it('has a header with reload, pop out and hide, and no close cross, minimize or maximize', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const root = (await paneOf(element)).shadowRoot!;
    expect(root.querySelector('.pane-reload')).to.exist;
    expect(root.querySelector('.pane-popout')).to.exist;
    // Every pane, whatever opened it: the opener steps aside while the pane is out, so this is the
    // one way to put it away, and it is the same on every pane.
    expect(root.querySelector('.pane-hide')).to.exist;
    expect(!!root.querySelector('.pane-close, .ctrl-minimize, .ctrl-maximize')).to.equal(false);
  });

  it("draws its buttons with Umbraco's icons, with hide kept apart from the others", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const root = (await paneOf(element)).shadowRoot!;
    expect(root.querySelector('.pane-reload umb-icon')?.getAttribute('name')).to.equal('icon-refresh');
    const popout = root.querySelector('.pane-popout')!;
    expect(popout.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-window-popout');
    expect(popout.nextElementSibling?.classList.contains('pane-divider'), 'a divider after pop out').to.equal(true);
    const hide = popout.nextElementSibling?.nextElementSibling;
    expect(hide?.classList.contains('pane-hide'), 'then hide, last, at the edge').to.equal(true);
    expect(hide?.querySelector('umb-icon')?.getAttribute('name'), 'the panel, pointing back in').to.equal('icon-panel-show');
  });

  it('carries the opening icon out on its hide button, then turns it to point back in once open', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    const { element, sync } = await mountWindow(wrapper, manager, doc);
    manager.openAttached(doc, PREVIEW, 'right');
    await sync();
    const pane = await paneOf(element);
    await (pane as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    const icon = () => pane.shadowRoot!.querySelector('.pane-hide umb-icon')?.getAttribute('name');
    expect(icon(), 'while it slides out').to.equal('icon-pannel-close');
    await Promise.all(pane.getAnimations().map((a) => a.finished));
    await until(() => icon() === 'icon-panel-show');
  });

  it('draws its title in regular weight, centred on its capitals like the path strip beside it', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const title = (await paneOf(element)).shadowRoot!.querySelector('.pane-title')!;
    const style = getComputedStyle(title) as CSSStyleDeclaration & { textBoxTrim?: string };
    expect(style.fontWeight, 'not bold: it reads as the path, not a heading').to.equal('400');
    expect(style.textBoxTrim).to.equal('trim-both');
    expect(parseFloat(style.paddingBottom), 'room for descenders inside its clip').to.be.greaterThan(0);
  });

  it("underlines its header in the backoffice's border colour, as the path strip beside it is", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    wrapper.style.setProperty('--uui-color-border', 'rgb(1, 2, 3)');
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const header = getComputedStyle((await paneOf(element)).shadowRoot!.querySelector('.pane-header')!);
    expect(header.borderBottomColor).to.equal('rgb(1, 2, 3)');
  });

  it("draws its title at the path strip's 13px, and its own icon at the buttons' size", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const root = (await paneOf(element)).shadowRoot!;
    expect(getComputedStyle(root.querySelector('.pane-header')!).fontSize).to.equal('13px');
    expect(getComputedStyle(root.querySelector('.pane-icon')!).fontSize).to.equal('16px');
    expect(getComputedStyle(root.querySelector('.pane-reload umb-icon')!).fontSize).to.equal('16px');
  });

  it("fills the strip's height with its buttons, square, with the icon padded evenly", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    wrapper.style.setProperty('--umbradesktop-path-height', '37px');
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const root = (await paneOf(element)).shadowRoot!;
    const header = root.querySelector('.pane-header')!;
    expect(header.getBoundingClientRect().height, 'the strip itself').to.equal(37);
    // Icon only, so even padding makes them square. They were 32 wide whatever the strip's height,
    // which in Windows 98's strip was 32 by 22, and the bevel showed it.
    for (const name of ['.pane-reload', '.pane-popout', '.pane-hide']) {
      const button = root.querySelector(name)!;
      const box = button.getBoundingClientRect();
      expect(box.height, `${name} height, inside any border the strip draws`).to.equal(header.clientHeight);
      expect(box.width, `${name} width`).to.be.closeTo(box.height, 0.5);
      expectEvenPadding(button, name);
    }
  });

  it('pads its header the same at both ends, so the title starts as far in as Hide ends', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const header = (await paneOf(element)).shadowRoot!.querySelector('.pane-header')!;
    const box = header.getBoundingClientRect();
    const first = header.firstElementChild!.getBoundingClientRect();
    const last = header.lastElementChild!.getBoundingClientRect();
    expect(box.right - last.right).to.equal(first.left - box.left);
  });

  it('slides back in from its hide button before it closes, then gives the width back', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    const before = manager.getWindows()[0].rect.w;
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = await paneOf(element);
    (pane.shadowRoot!.querySelector('.pane-hide') as HTMLElement).click();
    expect(manager.getWindows()[0].panes, 'still there while it slides').to.have.lengthOf(1);
    expect(pane.getAnimations().length, 'the pane is moving').to.be.greaterThan(0);
    await until(() => (manager.getWindows()[0].panes ?? []).length === 0);
    expect(manager.getWindows()[0].rect.w).to.equal(before);
  });

  it('closes at once from its hide button when the system asks for reduced motion', async function () {
    this.timeout(TIMEOUT_MS);
    const restore = reduceMotion();
    try {
      const { wrapper, manager, doc } = desk();
      manager.openAttached(doc, PREVIEW, 'right');
      const { element } = await mountWindow(wrapper, manager, doc);
      const pane = await paneOf(element);
      (pane.shadowRoot!.querySelector('.pane-hide') as HTMLElement).click();
      expect(manager.getWindows()[0].panes ?? []).to.have.lengthOf(0);
    } finally {
      restore();
    }
  });

  it('slides out when it opens on a window already on the desktop, and not when the window mounts with it', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const restored = await mountWindow(wrapper, manager, doc);
    expect((await paneOf(restored.element)).getAnimations(), 'a pane that was already open does not move').to.have.lengthOf(0);
    restored.element.remove();

    const fresh = desk();
    const { element, sync } = await mountWindow(fresh.wrapper, fresh.manager, fresh.doc);
    const column = element.renderRoot.querySelector('.column') as HTMLElement;
    const before = column.getBoundingClientRect().width;
    fresh.manager.openAttached(fresh.doc, PREVIEW, 'right');
    await sync();
    const pane = await paneOf(element);
    expect(pane.getAnimations().length, 'the pane rides out').to.be.greaterThan(0);
    const frame = element.renderRoot.querySelector('.frame') as HTMLElement;
    expect(frame.getAnimations().length, 'the window edge moves out with it').to.be.greaterThan(0);
    // The editor keeps the width it had for the whole slide, so its page does not reflow on the way;
    // it gives up the splitter's few px once, when the pane has landed. The first live run read that
    // width after letting go of it and shrank the editor to its tree for the length of the slide.
    expect(column.getBoundingClientRect().width, 'during the slide').to.equal(before);
  });

  it('holds the editor at its width while the gap a popped-out pane left closes', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element, sync } = await mountWindow(wrapper, manager, doc);
    const pane = await paneOf(element);
    (pane.shadowRoot!.querySelector('.pane-popout') as HTMLElement).click();
    await sync();
    const frame = element.renderRoot.querySelector('.frame') as HTMLElement;
    const column = element.renderRoot.querySelector('.column') as HTMLElement;
    expect(frame.getAnimations().length, 'the edge closes the gap').to.be.greaterThan(0);
    const during = column.getBoundingClientRect().width;
    await Promise.all(frame.getAnimations().map((a) => a.finished));
    await until(() => !frame.classList.contains('pane-moving'));
    expect(during).to.equal(column.getBoundingClientRect().width);
  });

  it('pops out from its own button into a floating window', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = await paneOf(element);
    (pane.shadowRoot!.querySelector('.pane-popout') as HTMLElement).click();
    expect(manager.getWindows().filter((w) => w.owner === doc)).to.have.lengthOf(1);
  });

  it('lifts off when it pops out: the new window starts where the pane was', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = await paneOf(element);
    (pane.shadowRoot!.querySelector('.pane-popout') as HTMLElement).click();
    const floating = manager.getWindows().find((w) => w.owner === doc)!;
    const popped = await mountWindow(wrapper, manager, floating.id);
    const frame = popped.element.renderRoot.querySelector('.frame') as HTMLElement;
    expect(frame.getAnimations().length).to.be.greaterThan(0);
  });

  it('tears off after a short drag of its header, like a browser tab, and follows the pointer', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = element.renderRoot.querySelector('umbradesktop-window-pane')!;
    await (pane as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    const header = pane.shadowRoot!.querySelector('.pane-header') as HTMLElement;
    const frame = element.renderRoot.querySelector('.frame') as HTMLElement;
    const box = header.getBoundingClientRect();
    const start = { clientX: box.x + 60, clientY: box.y + 10, pointerId: 1, bubbles: true, composed: true };
    header.dispatchEvent(new PointerEvent('pointerdown', start));
    // A wobble is still a click: nothing happens under the tear-off distance.
    frame.dispatchEvent(new PointerEvent('pointermove', { ...start, clientX: start.clientX - 5 }));
    expect(manager.getWindows()).to.have.lengthOf(1);
    // A short, deliberate drag tears it off, well inside the window, the way a browser tab comes away.
    const out = { ...start, clientX: start.clientX - 40, clientY: start.clientY + 10 };
    frame.dispatchEvent(new PointerEvent('pointermove', out));
    const floating = manager.getWindows().find((w) => w.id === id);
    expect(floating?.owner).to.equal(doc);
    frame.dispatchEvent(new PointerEvent('pointermove', { ...out, clientX: out.clientX + 30 }));
    const moved = manager.getWindows().find((w) => w.id === id)!.rect.x;
    expect(moved).to.equal(floating!.rect.x + 30);
    frame.dispatchEvent(new PointerEvent('pointerup', { ...out, clientX: out.clientX + 30 }));
    expect(manager.getWindows().find((w) => w.id === id)?.owner).to.equal(doc);
  });

  it('does not start a text selection when its header is pressed, so tearing it off selects nothing', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = element.renderRoot.querySelector('umbradesktop-window-pane')!;
    await (pane as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
    const header = pane.shadowRoot!.querySelector('.pane-header') as HTMLElement;
    const press = new PointerEvent('pointerdown', { clientX: 10, clientY: 10, pointerId: 1, bubbles: true, composed: true, cancelable: true });
    header.dispatchEvent(press);
    expect(press.defaultPrevented, 'the press that starts a drag must not also start a selection').to.equal(true);
    expect(getComputedStyle(header).userSelect).to.equal('none');
  });

  it('counts in the window minimum, so a resize cannot squeeze it out', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    const { element, sync } = await mountWindow(wrapper, manager, doc);
    const frame = () => element.renderRoot.querySelector('.frame') as HTMLElement;
    const without = parseFloat(frame().style.minWidth);
    manager.openAttached(doc, PREVIEW, 'right');
    await sync();
    expect(parseFloat(frame().style.minWidth)).to.equal(without + 300);
  });

  it("has a header exactly as tall as the path strip beside it, so the two read as one strip", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    wrapper.style.setProperty('--umbradesktop-path-height', '37px');
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = element.renderRoot.querySelector('umbradesktop-window-pane')!;
    await (pane as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const header = pane.shadowRoot!.querySelector('.pane-header') as HTMLElement;
    expect(header.getBoundingClientRect().height).to.equal(37);
  });

  it("draws its header from the path strip's tokens when a theme sets no pane tokens", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    wrapper.style.setProperty('--umbradesktop-path-background', 'rgb(1, 2, 3)');
    wrapper.style.setProperty('--umbradesktop-path-text', 'rgb(4, 5, 6)');
    manager.openAttached(doc, PREVIEW, 'right');
    const { element } = await mountWindow(wrapper, manager, doc);
    const pane = element.renderRoot.querySelector('umbradesktop-window-pane')!;
    await (pane as unknown as { updateComplete: Promise<unknown> }).updateComplete;
    const header = getComputedStyle(pane.shadowRoot!.querySelector('.pane-header')!);
    expect(header.backgroundColor).to.equal('rgb(1, 2, 3)');
    expect(header.color).to.equal('rgb(4, 5, 6)');
  });

  it('resizes from its splitter', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    manager.openAttached(doc, PREVIEW, 'right');
    const { element, sync } = await mountWindow(wrapper, manager, doc);
    const splitter = element.renderRoot.querySelector('.splitter') as HTMLElement;
    const box = splitter.getBoundingClientRect();
    const at = { clientX: box.x + 2, clientY: box.y + 50, pointerId: 1, bubbles: true, cancelable: true };
    const press = new PointerEvent('pointerdown', at);
    splitter.dispatchEvent(press);
    expect(press.defaultPrevented, 'dragging the splitter must not select text either').to.equal(true);
    splitter.dispatchEvent(new PointerEvent('pointermove', { ...at, clientX: at.clientX - 60 }));
    splitter.dispatchEvent(new PointerEvent('pointerup', { ...at, clientX: at.clientX - 60 }));
    await sync();
    expect(manager.getWindows()[0].panes?.[0].width).to.equal(360);
  });
});

describe('a floating attached window', () => {
  it('has the full set of window controls', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, id);
    for (const control of ['.ctrl-reload', '.ctrl-minimize', '.ctrl-maximize', '.ctrl-close']) {
      expect(element.renderRoot.querySelector(control), control).to.exist;
    }
  });

  it('says in words which window it belongs to, in a strip under its titlebar', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, id);
    const strip = element.renderRoot.querySelector('.column .attached-strip');
    expect(strip).to.exist;
    expect(strip?.querySelector('.attached-strip-owner')?.textContent).to.equal('Doc');
  });

  it('docks back into its owner from the strip, and says when it cannot', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    manager.undock(doc, id);
    const { element } = await mountWindow(wrapper, manager, id);
    const button = element.renderRoot.querySelector('.attached-dock') as HTMLButtonElement;
    expect(button.disabled).to.equal(false);
    button.click();
    expect(manager.getWindows().map((w) => w.id)).to.deep.equal([doc]);
  });

  it("draws its strip at the path strip's height and from its tokens, like a section window's path", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    wrapper.style.setProperty('--umbradesktop-path-height', '37px');
    wrapper.style.setProperty('--umbradesktop-path-background', 'rgb(1, 2, 3)');
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, id);
    const strip = element.renderRoot.querySelector('.attached-strip') as HTMLElement;
    expect(strip.getBoundingClientRect().height).to.equal(37);
    expect(getComputedStyle(strip).backgroundColor).to.equal('rgb(1, 2, 3)');
  });

  it('draws Dock as a toolbar button with a glyph, not as a form button', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, id);
    const button = element.renderRoot.querySelector('.attached-dock') as HTMLButtonElement;
    expect(
      button.querySelector('umb-icon')?.getAttribute('name'),
      "Umbraco's pop-in, the pop-out button's opposite, beside the word",
    ).to.equal('icon-window-popin');
    const style = getComputedStyle(button);
    expect(style.borderTopWidth, 'no border at rest').to.equal('0px');
    expect(style.backgroundColor, 'no face of its own at rest').to.equal('rgba(0, 0, 0, 0)');
    wrapper.style.setProperty('--umbradesktop-path-link', 'rgb(200, 0, 0)');
    wrapper.style.setProperty('--umbradesktop-path-text', 'rgb(0, 90, 0)');
    expect(getComputedStyle(button).color, "in the strip's text colour, not a link's").to.equal('rgb(0, 90, 0)');
  });

  it("fills the strip's height with Dock, as the pane header's buttons fill theirs", async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    wrapper.style.setProperty('--umbradesktop-path-height', '37px');
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, id);
    const button = element.renderRoot.querySelector('.attached-dock') as HTMLButtonElement;
    const strip = element.renderRoot.querySelector('.attached-strip')!;
    expect(button.getBoundingClientRect().height).to.equal(strip.clientHeight);
    expectEvenPadding(button, 'Dock');
  });

  it('pads its strip the same at both ends, so the words start as far in as Dock ends', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 800, h: 900 });
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    const { element } = await mountWindow(wrapper, manager, id);
    const strip = element.renderRoot.querySelector('.attached-strip')!;
    const box = strip.getBoundingClientRect();
    const first = strip.firstElementChild!.getBoundingClientRect();
    const last = strip.lastElementChild!.getBoundingClientRect();
    expect(box.right - last.right).to.equal(first.left - box.left);
  });

  it('draws no strip on an ordinary window', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk();
    const { element } = await mountWindow(wrapper, manager, doc);
    expect(element.renderRoot.querySelector('.attached-strip')).to.equal(null);
  });
});

describe('the dock zones', () => {
  it('are drawn inside the owner window, under the window being dragged, never over it', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 1920, h: 1000 });
    manager.move(doc, 500, 50);
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    manager.undock(doc, id);
    const owner = await mountWindow(wrapper, manager, doc);
    const floating = await mountWindow(wrapper, manager, id);

    manager.previewSnap(id, { x: 5, y: 5 });
    await owner.sync();
    await floating.sync();
    const zones = () => [...owner.element.renderRoot.querySelectorAll('.frame .dock-zone')] as HTMLElement[];
    expect(zones()).to.have.lengthOf(2);
    expect(floating.element.renderRoot.querySelector('.dock-zone'), 'the dragged window draws none').to.equal(null);
    const frames = [owner.element, floating.element].map((e) => Number((e.renderRoot.querySelector('.frame') as HTMLElement).style.zIndex));
    expect(frames[1], 'the dragged window is above the owner and so above its zones').to.be.greaterThan(frames[0]);
  });

  it('draws the zone under the pointer more strongly than the rest, in something that shows on a window', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 1920, h: 1000 });
    manager.move(doc, 500, 50);
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    manager.undock(doc, id);
    const owner = await mountWindow(wrapper, manager, doc);
    const rect = manager.getWindows().find((w) => w.id === doc)!.rect;
    manager.previewSnap(id, { x: rect.x + rect.w - 20, y: rect.y + 200 });
    await owner.sync();
    const active = owner.element.renderRoot.querySelector('.dock-zone.active') as HTMLElement;
    const idle = owner.element.renderRoot.querySelector('.dock-zone:not(.active)') as HTMLElement;
    const a = getComputedStyle(active);
    const i = getComputedStyle(idle);
    expect(a.borderTopStyle, 'solid once aimed at, dashed while only on offer').to.equal('solid');
    expect(i.borderTopStyle).to.equal('dashed');
    expect(parseFloat(a.borderTopWidth)).to.be.at.least(parseFloat(i.borderTopWidth));
    // The regression: the active zone once borrowed the snap ghost's translucent white, which shows
    // over a dark wallpaper and vanishes over a white window.
    const [r, g, b, alpha = 1] = (a.backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
    expect(r > 200 && g > 200 && b > 200 && alpha < 0.5, `pale translucent fill: ${a.backgroundColor}`).to.equal(false);
  });

  it('marks the one under the pointer, and goes away on release', async function () {
    this.timeout(TIMEOUT_MS);
    const { wrapper, manager, doc } = desk({ w: 1920, h: 1000 });
    manager.move(doc, 500, 50);
    const id = manager.openAttached(doc, PREVIEW, 'right')!;
    manager.undock(doc, id);
    const owner = await mountWindow(wrapper, manager, doc);
    const rect = manager.getWindows().find((w) => w.id === doc)!.rect;
    manager.previewSnap(id, { x: rect.x + rect.w - 20, y: rect.y + 200 });
    await owner.sync();
    const active = owner.element.renderRoot.querySelector('.dock-zone.active') as HTMLElement | null;
    expect(active?.dataset.side).to.equal('right');
    manager.commitSnap(id);
    await owner.sync();
    expect(owner.element.renderRoot.querySelector('.dock-zone')).to.equal(null);
  });
});
