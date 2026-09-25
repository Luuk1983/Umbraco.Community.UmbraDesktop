import { expect } from '@open-wc/testing';
import { resetMouse, sendKeys, sendMouse } from '@web/test-runner-commands';
import './window.element.js';
import type { UmbraDesktopWindowElement } from './window.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Keyboard focus follows the active app window, as it follows the active window in an operating
 * system. It did not: activating a window changed its z-order and nothing else, so an app that
 * takes the keyboard lost it for good the moment another window was clicked, and every way back
 * left focus on the page body or on the taskbar. Snake showed it: "Press space to carry on" after a
 * pause did nothing, and Space on a taskbar button that had just restored it minimised it again.
 *
 * Driven with real mouse and keyboard input (sendMouse, sendKeys), because the bug lived in what a
 * real mousedown does to focus, which a dispatched event does not do.
 */

/** A stand-in app with Snake's focus model: a focusable playfield it focuses itself, and a button. */
class FocusProbeApp extends HTMLElement {
  /** Every key the playfield received. */
  keys: string[] = [];
  /** How many times the playfield lost focus. */
  blurs = 0;
  /** The playfield. */
  field: HTMLElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<button class="new">New game</button>
      <div class="field" tabindex="0" style="width: 200px; height: 120px">Playfield</div>`;
    this.field = root.querySelector<HTMLElement>('.field')!;
    this.field.addEventListener('keydown', (event) => this.keys.push(event.key));
    this.field.addEventListener('focusout', () => this.blurs++);
  }

  connectedCallback(): void {
    // As Snake does in firstUpdated: the playfield takes the keyboard as soon as the app is shown.
    queueMicrotask(() => this.field.focus());
  }
}
customElements.define('focus-probe-app', FocusProbeApp);

/** A stand-in app that takes the keyboard on its own element but never focuses itself. */
class QuietApp extends HTMLElement {
  /** Every key the app received. */
  keys: string[] = [];

  connectedCallback(): void {
    this.tabIndex = 0;
    this.addEventListener('keydown', (event) => this.keys.push(event.key));
  }
}
customElements.define('focus-quiet-app', QuietApp);

/**
 * An element app of one of the two stand-ins.
 * @param alias The app alias.
 * @param element The app's class.
 * @returns The app.
 */
const app = (alias: string, element: CustomElementConstructor): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon: 'icon-umbraco',
  content: { kind: 'element', element },
  chromeProfile: 'bare',
  defaultSize: { w: 320, h: 200 },
});

/** How long a mounted case may take: windows render frames and apps load. */
const TIMEOUT_MS = 20_000;

/** Everything a case mounted, torn down after it. */
let cleanup: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const dispose of cleanup) await dispose();
  cleanup = [];
});

/**
 * A desktop surface pinned to the viewport's corner with a manager, and a window element for every
 * window the manager holds, kept in step with it the way the desktop's own repeat keeps them.
 * @returns The manager, a way to open an app and get its window element and app, and a sync.
 */
async function desktop() {
  const surface = document.createElement('div');
  surface.style.cssText = 'position: fixed; left: 0; top: 0; width: 1000px; height: 700px;';
  document.body.appendChild(surface);
  const host = new UmbElementControllerHost(surface);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(surface, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds({ w: 1000, h: 700 });

  const elements = new Map<string, UmbraDesktopWindowElement>();
  const subscription = manager.windows.subscribe((windows: ReadonlyArray<UmbraDesktopWindow>) => {
    for (const w of windows) {
      let element = elements.get(w.id);
      if (!element) {
        element = document.createElement('umbradesktop-window') as UmbraDesktopWindowElement;
        elements.set(w.id, element);
        surface.appendChild(element);
      }
      element.window = { ...w };
    }
  });
  cleanup.push(async () => {
    subscription.unsubscribe();
    host.destroy();
    surface.remove();
    await resetMouse();
  });

  /** Let every window, its app host and its app finish rendering. */
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      for (const element of elements.values()) {
        await element.updateComplete;
        await element.shadowRoot?.querySelector<HTMLElement & { mountComplete: Promise<void> }>('umbradesktop-app-host')?.mountComplete;
      }
      await new Promise((resolve) => setTimeout(resolve));
    }
  };

  /**
   * Open an app and return its window and the app element inside it.
   * @param which The app to open.
   * @param at Where to put its window, so windows do not overlap.
   */
  const open = async <T extends HTMLElement>(which: UmbraDesktopApp, at: { x: number; y: number }) => {
    manager.open(which);
    const id = manager.getWindows().find((w) => w.app.alias === which.alias)!.id;
    manager.move(id, at.x, at.y);
    await settle();
    const element = elements.get(id)!;
    const appElement = element.shadowRoot!.querySelector('umbradesktop-app-host')!.firstElementChild as T;
    return { id, element, app: appElement };
  };

  return { manager, open, settle };
}

/** The centre of a part of a window, for clicking it. */
function pointIn(element: UmbraDesktopWindowElement, selector: string): [number, number] {
  const box = element.shadowRoot!.querySelector(selector)!.getBoundingClientRect();
  return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
}

/** A real click at a point. */
async function click([x, y]: [number, number]): Promise<void> {
  await sendMouse({ type: 'click', position: [x, y] });
}

it('gives the keyboard back when the window is clicked back on, through its focus catcher', async function () {
  this.timeout(TIMEOUT_MS);
  const { open, settle } = await desktop();
  const a = await open<FocusProbeApp>(app('a', FocusProbeApp), { x: 20, y: 20 });
  await open<FocusProbeApp>(app('b', FocusProbeApp), { x: 500, y: 20 });

  await click(pointIn(a.element, '.focus-catcher'));
  await settle();
  await sendKeys({ press: 'Space' });

  expect(a.app.keys, 'the first click back on the window is enough').to.deep.equal([' ']);
});

it('gives the keyboard back when the window is brought forward by its titlebar', async function () {
  this.timeout(TIMEOUT_MS);
  const { open, settle } = await desktop();
  const a = await open<FocusProbeApp>(app('a', FocusProbeApp), { x: 20, y: 20 });
  await open<FocusProbeApp>(app('b', FocusProbeApp), { x: 500, y: 20 });

  await click(pointIn(a.element, '.title-text'));
  await settle();
  await sendKeys({ press: 'Space' });

  expect(a.app.keys).to.deep.equal([' ']);
});

/**
 * The taskbar's own route, stood in for by a button that restores the window as the taskbar's does:
 * clicking it focuses the button, and without the fix Space then clicked it a second time.
 */
it('gives the keyboard back when the window is restored from a button, rather than leaving it there', async function () {
  this.timeout(TIMEOUT_MS);
  const { manager, open, settle } = await desktop();
  const a = await open<FocusProbeApp>(app('a', FocusProbeApp), { x: 20, y: 20 });
  manager.setState(a.id, 'minimized');
  await settle();

  const task = document.createElement('button');
  task.textContent = 'a';
  task.style.cssText = 'position: fixed; left: 20px; bottom: 20px;';
  let presses = 0;
  task.addEventListener('click', () => {
    presses++;
    manager.focus(a.id);
  });
  document.body.appendChild(task);
  cleanup.push(() => task.remove());

  const box = task.getBoundingClientRect();
  await click([Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)]);
  await settle();
  await sendKeys({ press: 'Space' });

  expect(a.app.keys, 'Space goes to the app').to.deep.equal([' ']);
  expect(presses, 'and does not press the restoring button again').to.equal(1);
});

it('keeps the keyboard in the app when its own titlebar or edge is clicked', async function () {
  this.timeout(TIMEOUT_MS);
  const { open, settle } = await desktop();
  const a = await open<FocusProbeApp>(app('a', FocusProbeApp), { x: 20, y: 20 });
  const blurs = a.app.blurs;

  await click(pointIn(a.element, '.title-text'));
  await click(pointIn(a.element, '.rh-e'));
  await settle();
  await sendKeys({ press: 'Space' });

  expect(a.app.blurs, 'a paused game would have paused here').to.equal(blurs);
  expect(a.app.keys).to.deep.equal([' ']);
});

it('leaves a click inside the app to the app', async function () {
  this.timeout(TIMEOUT_MS);
  const { open, settle } = await desktop();
  const a = await open<FocusProbeApp>(app('a', FocusProbeApp), { x: 20, y: 20 });
  const newGame = a.app.shadowRoot!.querySelector<HTMLElement>('.new')!.getBoundingClientRect();

  await click([Math.round(newGame.left + newGame.width / 2), Math.round(newGame.top + newGame.height / 2)]);
  await settle();

  expect(a.app.shadowRoot!.activeElement, 'the clicked button has focus, as it should').to.equal(
    a.app.shadowRoot!.querySelector('.new'),
  );
});

it('gives the keyboard to a newly opened app that takes it but does not focus itself', async function () {
  this.timeout(TIMEOUT_MS);
  const { open } = await desktop();
  const quiet = await open<QuietApp>(app('quiet', QuietApp), { x: 20, y: 20 });

  await sendKeys({ press: 'x' });

  expect(quiet.app.keys).to.deep.equal(['x']);
});
