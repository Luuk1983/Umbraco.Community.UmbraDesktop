import { expect } from '@open-wc/testing';
import { routeFrame, startFrameWatches } from './frame-watches.js';
import type { UmbraDesktopFrameSink } from './frame-watches.js';
import { UMBRADESKTOP_OPEN_HELP_EVENT } from './constants.js';

/**
 * The watches a backoffice frame gets, shared by a window and a pane (#144, plan task 2.1). The
 * window's own tests (`window-dirty`, `window-location`, `window-notifications`, `window-body`,
 * `window-path`) pin what each watch does for a window; these pin what the shared module promises
 * any caller: only what is asked for starts, and stopping leaves nothing behind.
 */

/** A page the test server serves, so a frame is same-origin with a real path, as a backoffice's is. */
const PAGE = new URL('./frame-watches.test.ts', import.meta.url).pathname;

/** Frames made by a test, removed after it. */
let frames: HTMLIFrameElement[] = [];
afterEach(() => {
  for (const frame of frames) frame.remove();
  frames = [];
});

/**
 * A loaded same-origin frame on a real path, which is all the watches need to attach.
 * @returns The frame, loaded.
 */
async function blankFrame(): Promise<HTMLIFrameElement> {
  const frame = document.createElement('iframe');
  frame.src = PAGE;
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }));
  document.body.appendChild(frame);
  frames.push(frame);
  await loaded;
  return frame;
}

/**
 * A sink that writes down every call it gets.
 * @returns The sink and its record.
 */
function recordingSink(): { sink: UmbraDesktopFrameSink; calls: string[] } {
  const calls: string[] = [];
  const sink: UmbraDesktopFrameSink = {
    chromeProfile: 'workspace-only',
    loaded: () => calls.push('loaded'),
    applyTheme: () => calls.push('theme'),
    setDirty: (dirty) => calls.push(`dirty:${dirty}`),
    setSubjects: (subjects) => calls.push(`subjects:${subjects.length}`),
    setSaves: (saves) => calls.push(`saves:${saves}`),
    setLocation: (location) => calls.push(`location:${location}`),
    setTasks: (tasks) => calls.push(`tasks:${tasks.length}`),
    openHelp: (target) => calls.push(`help:${target}`),
  };
  return { sink, calls };
}

/**
 * Count the listeners added to and removed from a frame's window and document, from now on.
 * @param frame The frame.
 * @returns A function giving the number still attached.
 */
function countListeners(frame: HTMLIFrameElement): () => number {
  let attached = 0;
  for (const target of [frame.contentWindow!, frame.contentDocument!] as EventTarget[]) {
    const add = target.addEventListener.bind(target);
    const remove = target.removeEventListener.bind(target);
    target.addEventListener = (...args: Parameters<EventTarget['addEventListener']>) => {
      attached += 1;
      add(...args);
    };
    target.removeEventListener = (...args: Parameters<EventTarget['removeEventListener']>) => {
      attached -= 1;
      remove(...args);
    };
  }
  return () => attached;
}

it('starts only the named watches', async () => {
  const frame = await blankFrame();
  const { sink, calls } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['location']);

  expect(calls, 'the location is reported on start').to.deep.equal([`location:${PAGE}`]);
  frame.contentWindow!.dispatchEvent(new CustomEvent(UMBRADESKTOP_OPEN_HELP_EVENT, { detail: { target: 'x' } }));
  expect(calls.some((call) => call.startsWith('help')), 'help was not asked for').to.equal(false);
  stop();
});

it('resets dirty state and subjects when the dirty watch starts', async () => {
  const frame = await blankFrame();
  const { sink, calls } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['dirty']);

  expect(calls).to.include('dirty:false');
  expect(calls).to.include('subjects:0');
  expect(calls.some((call) => call.startsWith('location')), 'location was not asked for').to.equal(false);
  stop();
});

it('applies the theme once on start when asked', async () => {
  const frame = await blankFrame();
  const { sink, calls } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['theme']);

  expect(calls).to.deep.equal(['theme']);
  stop();
});

it('passes a request for Help on as a target', async () => {
  const frame = await blankFrame();
  const { sink, calls } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['help']);

  frame.contentWindow!.dispatchEvent(new CustomEvent(UMBRADESKTOP_OPEN_HELP_EVENT, { detail: { target: 'media-manager' } }));
  expect(calls).to.deep.equal(['help:media-manager']);
  stop();
});

it('stop removes every listener', async () => {
  const frame = await blankFrame();
  const attached = countListeners(frame);
  const { sink } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['dirty', 'uploads', 'location', 'help']);

  expect(attached(), 'the watches listen to the frame').to.be.greaterThan(0);
  stop();
  expect(attached()).to.equal(0);
});

it('starting twice on one frame stops the first', async () => {
  const frame = await blankFrame();
  const first = recordingSink();
  const second = recordingSink();
  startFrameWatches(frame, first.sink, ['location']);
  const stop = startFrameWatches(frame, second.sink, ['location']);
  first.calls.length = 0;

  frame.contentWindow!.dispatchEvent(new Event('changestate'));
  expect(first.calls, 'the first watches are stopped').to.deep.equal([]);
  expect(second.calls.filter((call) => call.startsWith('location')).length).to.equal(2);
  stop();
});

it('routes a frame through its own history, which the location watch hears', async () => {
  const frame = await blankFrame();
  const { sink, calls } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['location']);
  calls.length = 0;
  let popped = 0;
  frame.contentWindow!.addEventListener('popstate', () => (popped += 1));

  routeFrame(frame, '/umbraco/section/media/workspace/media/edit/abc');

  expect(frame.contentWindow!.location.pathname, 'the route is the frame owns').to.equal('/umbraco/section/media/workspace/media/edit/abc');
  expect(popped, 'and its router is told').to.equal(1);
  expect(calls).to.deep.equal(['location:/umbraco/section/media/workspace/media/edit/abc']);
  stop();
});

/**
 * Put a stand-in for core's app element in a frame, with the minimum width core gives it, and say how
 * wide it may get now.
 * @param frame The frame.
 * @returns The element's computed minimum width.
 */
function appMinWidth(frame: HTMLIFrameElement): string {
  const win = frame.contentWindow! as Window & typeof globalThis;
  if (!win.customElements.get('umb-app')) {
    win.customElements.define(
      'umb-app',
      class extends win.HTMLElement {
        constructor() {
          super();
          this.attachShadow({ mode: 'open' }).innerHTML = '<style>:host { display: block; min-width: 920px; }</style>';
        }
      },
    );
  }
  const app = frame.contentDocument!.querySelector('umb-app') ?? frame.contentDocument!.body.appendChild(frame.contentDocument!.createElement('umb-app'));
  return win.getComputedStyle(app).minWidth;
}

it('lets a frame beside a window lay out narrower than the backoffice minimum', async () => {
  const frame = await blankFrame();
  const { sink } = recordingSink();
  const stop = startFrameWatches(frame, { ...sink, narrow: true }, ['chrome']);
  expect(appMinWidth(frame)).to.equal('0px');
  stop();
});

it('leaves the backoffice minimum alone in a window of its own', async () => {
  const frame = await blankFrame();
  const { sink } = recordingSink();
  const stop = startFrameWatches(frame, sink, ['chrome']);
  expect(appMinWidth(frame)).to.equal('920px');
  stop();
});

it("does not tell the router when the frame refused the route, which would close the question core is asking", async () => {
  const frame = await blankFrame();
  let popped = 0;
  frame.contentWindow!.addEventListener('popstate', () => (popped += 1));
  // As core's router does for a workspace with unsaved changes: the push is refused, and core asks.
  frame.contentWindow!.history.pushState = () => undefined;
  routeFrame(frame, '/umbraco/section/media/workspace/media/edit/abc');
  expect(frame.contentWindow!.location.pathname).to.equal(PAGE);
  expect(popped).to.equal(0);
});
