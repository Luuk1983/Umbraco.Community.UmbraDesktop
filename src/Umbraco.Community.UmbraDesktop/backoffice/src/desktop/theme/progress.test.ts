import { expect } from '@open-wc/testing';
import '../components/window.element.js';
import '../components/taskbar.element.js';
import type { UmbraDesktopWindowElement } from '../components/window.element.js';
import type { UmbraDesktopTaskbarElement } from '../components/taskbar.element.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';
import type { UmbraDesktopWindowProgress } from '../progress/progress.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { paletteCss } from './palette-css.js';
import { UMBRADESKTOP_PROBE_WINDOW_RECT, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './themes/mount-themed.js';
import type { UmbraDesktopTheme } from './types.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * *A theme may restyle, never remove*, held for a busy window's progress in all five themes and on
 * both surfaces, by rendering them rather than by reading their CSS: a ring sized to nothing, a bar
 * clipped by the taskbar's `overflow: hidden` and a well hidden along with the macOS caption icon
 * are all removals that a stylesheet's text does not show. Issue #108, design D6.
 */

/** A throwaway app whose window only has to render. */
const APP: UmbraDesktopApp = {
  alias: 'progress-probe',
  name: 'Media',
  icon: 'icon-picture',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

/**
 * The backoffice spacing the base chrome pads its caption and task buttons with, which a bare test
 * page does not load. Set here because, unlike in the metrics tests, they move an edge this file
 * measures: without them the icon sits flush against the frame and the button, and the ring round
 * it measures as clipped in a layout the backoffice never produces. UUI's values, which step by
 * its 3px base.
 */
const BACKOFFICE_TOKENS =
  '--uui-size-space-1:3px;--uui-size-space-2:6px;--uui-size-space-3:9px;--uui-size-space-4:12px;';

/** One summary per state a theme has to draw. */
const STATES: Record<UmbraDesktopWindowProgress['state'], UmbraDesktopWindowProgress> = {
  determinate: { state: 'determinate', fraction: 0.5, completed: 25, total: 50, failed: 0 },
  indeterminate: { state: 'indeterminate', completed: 0, failed: 0 },
  failed: { state: 'failed', fraction: 0.62, completed: 31, total: 50, failed: 3 },
};

/**
 * Mount one chrome element under a theme: its light palette on a wrapper, its surface sheet adopted
 * after the element's own styles. `mount-themed.ts` does the same for a single element; this one
 * also provides a window manager, which the taskbar needs before it draws any window.
 * @param theme The theme.
 * @param tag The element to mount.
 * @param surface Its stylesheet.
 * @returns The element, its manager and a teardown.
 */
async function mount<T extends HTMLElement & { updateComplete: Promise<unknown> }>(
  theme: UmbraDesktopTheme,
  tag: string,
  surface: 'window' | 'taskbar',
) {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('style', `${BACKOFFICE_TOKENS}${paletteCss(theme.palettes.light)}`);
  document.body.appendChild(wrapper);
  const host = new UmbElementControllerHost(wrapper);
  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  const element = document.createElement(tag) as T;
  wrapper.appendChild(element);
  await element.updateComplete;
  // The Umbraco theme ships no sheets: it is the base, which is the thing being checked for it.
  const sheet = (await theme.sheets?.())?.[surface]?.styleSheet;
  if (sheet) element.shadowRoot!.adoptedStyleSheets = [...element.shadowRoot!.adoptedStyleSheets, sheet];
  await element.updateComplete;
  return {
    element,
    manager,
    dispose: () => {
      host.destroy();
      wrapper.remove();
    },
  };
}

/**
 * Assert a progress element is drawn: present, shown, with a box, and inside the box that clips it.
 * @param progress The element.
 * @param clip The nearest ancestor that clips, whose box it must stay inside.
 * @param what What is being checked, for the message.
 */
function expectDrawn(progress: HTMLElement | null, clip: HTMLElement, what: string) {
  expect(progress, `${what}: rendered`).to.not.equal(null);
  const style = getComputedStyle(progress!);
  expect(style.display, `${what}: displayed`).to.not.equal('none');
  expect(style.visibility, `${what}: visible`).to.equal('visible');
  expect(parseFloat(style.opacity), `${what}: opaque`).to.be.greaterThan(0);
  const box = progress!.getBoundingClientRect();
  expect(box.width * box.height, `${what}: has an area`).to.be.greaterThan(0);
  // A drawing, not a speck: a ring round a hidden icon collapses to a few pixels and still has an
  // area. Twelve is less than any ring or strip a theme here draws, and more than a collapsed one.
  expect(Math.max(box.width, box.height), `${what}: big enough to read`).to.be.at.least(12);
  const bounds = clip.getBoundingClientRect();
  // Half a pixel either way, for sub-pixel layout.
  expect(box.left, `${what}: not clipped on the left`).to.be.at.least(bounds.left - 0.5);
  expect(box.right, `${what}: not clipped on the right`).to.be.at.most(bounds.right + 0.5);
  expect(box.top, `${what}: not clipped at the top`).to.be.at.least(bounds.top - 0.5);
  expect(box.bottom, `${what}: not clipped at the bottom`).to.be.at.most(bounds.bottom + 0.5);
}

for (const theme of UMBRADESKTOP_THEMES) {
  describe(`the ${theme.name} theme draws progress`, () => {
    let win: Awaited<ReturnType<typeof mount<UmbraDesktopWindowElement>>>;
    let bar: Awaited<ReturnType<typeof mount<UmbraDesktopTaskbarElement>>>;
    const base: UmbraDesktopWindow = {
      id: 'w1',
      app: APP,
      rect: UMBRADESKTOP_PROBE_WINDOW_RECT,
      z: 1,
      active: true,
      state: 'normal',
    };

    before(async function () {
      this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
      win = await mount<UmbraDesktopWindowElement>(theme, 'umbradesktop-window', 'window');
      win.element.window = base;
      await win.element.updateComplete;
      bar = await mount<UmbraDesktopTaskbarElement>(theme, 'umbradesktop-taskbar', 'taskbar');
      bar.manager.open(APP);
      await bar.element.updateComplete;
    });

    after(() => {
      win?.dispose();
      bar?.dispose();
    });

    for (const [name, progress] of Object.entries(STATES)) {
      it(`in the title bar, ${name}, without moving the window's content`, async function () {
        this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
        const root = win.element.shadowRoot!;
        win.element.window = base;
        await win.element.updateComplete;
        const before = (root.querySelector('.body') as HTMLElement).getBoundingClientRect();
        win.element.window = { ...base, progress };
        await win.element.updateComplete;
        expectDrawn(
          root.querySelector('.titlebar .progress'),
          root.querySelector('.frame') as HTMLElement,
          `${theme.name} title bar, ${name}`,
        );
        const after = (root.querySelector('.body') as HTMLElement).getBoundingClientRect();
        expect(after.top, 'the body does not move').to.equal(before.top);
        expect(after.height, 'nor change height').to.equal(before.height);
      });

      it(`on the taskbar button, ${name}, inside the box that clips it`, async function () {
        this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
        const id = bar.manager.getWindows()[0].id;
        const task = progress.state === 'indeterminate'
          ? { id: 'x', state: 'running' as const }
          : progress.state === 'failed'
            ? { id: 'x', state: 'failed' as const, completed: 31, total: 50, failed: 3 }
            : { id: 'x', state: 'running' as const, completed: 25, total: 50 };
        bar.manager.setTasks(id, 'probe', [task]);
        await bar.element.updateComplete;
        const root = bar.element.shadowRoot!;
        expectDrawn(
          root.querySelector('.task.window .progress'),
          root.querySelector('.running') as HTMLElement,
          `${theme.name} taskbar, ${name}`,
        );
      });
    }

    it('draws a failure differently from progress', async function () {
      this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
      const root = win.element.shadowRoot!;
      const paint = async (progress: UmbraDesktopWindowProgress) => {
        win.element.window = { ...base, progress };
        await win.element.updateComplete;
        const el = root.querySelector('.titlebar .progress') as HTMLElement;
        const style = getComputedStyle(el);
        return `${style.backgroundImage}|${style.backgroundColor}|${getComputedStyle(el, '::before').backgroundImage}`;
      };
      const running = await paint({ ...STATES.failed, state: 'determinate' });
      const failed = await paint(STATES.failed);
      expect(failed, `${theme.name}: a failure looks like progress`).to.not.equal(running);
    });
  });
}
