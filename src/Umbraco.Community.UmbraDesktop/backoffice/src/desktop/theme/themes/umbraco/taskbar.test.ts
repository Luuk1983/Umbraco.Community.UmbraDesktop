import { expect } from '@open-wc/testing';
import { sendMouse } from '@web/test-runner-commands';
import '../../../components/taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from '../../../components/taskbar.element.js';
import type { UmbraDesktopApp } from '../../../types.js';
import { UmbraDesktopWindowManagerContext } from '../../../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../../../window-manager.context-token.js';
import { UMBRADESKTOP_APP_CATALOGUE_CONTEXT } from '../../../app-catalogue.context-token.js';
import { UMBRADESKTOP_SETTINGS_CONTEXT } from '../../../settings/settings.context-token.js';
import { UMBRADESKTOP_DEFAULT_SETTINGS } from '../../../settings/settings-store.js';
import { paletteCss } from '../../palette-css.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState, UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMBRADESKTOP_UMBRACO_THEME } from './index.js';
import { UMBRACO_PALETTE } from './palette.js';
import { UMBRACO_TEST_BACKOFFICE_TOKENS, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import {
  UMBRACO_MIN_TOUCH,
  UMBRACO_TASK_LINE,
  UMBRACO_TASK_LINE_INSET,
  UMBRACO_TASK_GROUP_RADIUS,
  UMBRACO_TASK_TILE_BOTTOM,
  UMBRACO_TASK_TILE_RADIUS,
  UMBRACO_TASK_TILE_SIDE,
  UMBRACO_TASK_TILE_TOP,
} from './metrics.js';

/**
 * The Umbraco taskbar, with real task buttons, because the things worth holding here are the ones a
 * bare mount cannot show: the hover tile on a button, the box around a window and its attached
 * windows, and the coral line staying exactly where it has always been.
 *
 * The active window's marker is the one fixed point of this redesign, and it is two cues: a lit tile,
 * and the section menu's coral line under it, which stays on the bar's bottom edge. How the line is
 * drawn was allowed to change, from an edge-to-edge 3px shadow to a short 2px bar with soft ends.
 */

/** Coral, `--uui-color-current`, which the active window's line is drawn in. */
const CORAL = 'rgb(245, 193, 188)';

/** An app a window can be opened for. `about:blank` loads instantly and boots no backoffice. */
const app = (alias: string, icon: string): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon,
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
  defaultSize: { w: 700, h: 500 },
  minSize: { w: 600, h: 300 },
});

/** The document the group is built around. */
const CONTENT = app('content', 'icon-document');

/** An ordinary second window, so the bar holds both a group and a lone button. */
const MEDIA = app('media', 'icon-picture');

/** The attached window that makes the box. */
const PREVIEW = app('preview', 'icon-eye');

let wrapper: HTMLElement;
let host: UmbElementControllerHost;
let taskbar: UmbraDesktopTaskbarElement;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  wrapper = document.createElement('div');
  wrapper.style.cssText = `position:fixed; left:0; top:0; width:800px; height:900px;`;
  wrapper.setAttribute('style', `${wrapper.getAttribute('style')} ${UMBRACO_TEST_BACKOFFICE_TOKENS}${paletteCss(UMBRACO_PALETTE)}`);
  document.body.appendChild(wrapper);
  host = new UmbElementControllerHost(wrapper);

  const manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  manager.clampToBounds({ w: 800, h: 900 });
  // Provided by hand, as `components/taskbar-features.test.ts` does, so the fixed row of buttons
  // renders: a bar with no features row cannot show that its buttons are wide enough to touch.
  new UmbContextProvider(wrapper, UMBRADESKTOP_APP_CATALOGUE_CONTEXT, {
    apps: new UmbArrayState<UmbraDesktopApp>([CONTENT, MEDIA], (a) => a.alias).asObservable(),
    groups: new UmbArrayState<never>([], (g) => g).asObservable(),
    isRefRegistered: () => true,
    getEntryRef: () => undefined,
    getHostElement: () => wrapper,
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMBRADESKTOP_SETTINGS_CONTEXT, {
    pinned: new UmbArrayState<string>(['content', 'media'], (a) => a).asObservable(),
    taskbarFeatures: new UmbObjectState<Record<string, boolean>>({}).asObservable(),
    locale: new UmbObjectState(UMBRADESKTOP_DEFAULT_SETTINGS.locale).asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();

  manager.open(CONTENT);
  manager.openAttached(manager.getWindows()[0].id, PREVIEW, 'right');
  manager.open(MEDIA);

  taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
  wrapper.appendChild(taskbar);
  await taskbar.updateComplete;

  const sheet = (await UMBRADESKTOP_UMBRACO_THEME.sheets!()).taskbar?.styleSheet;
  if (!sheet) throw new Error('The Umbraco theme ships no taskbar stylesheet to mount.');
  const root = taskbar.renderRoot as ShadowRoot;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
  await taskbar.updateComplete;
});

afterEach(async () => {
  await sendMouse({ type: 'move', position: [790, 590] });
});

after(() => {
  host?.destroy();
  wrapper?.remove();
});

/**
 * The first element matching a selector in the taskbar's shadow root.
 * @param selector What to find.
 * @returns The element.
 */
function find(selector: string): HTMLElement {
  const found = taskbar.renderRoot.querySelector(selector) as HTMLElement | null;
  expect(found, `the taskbar should render ${selector}`).to.not.equal(null);
  return found!;
}

/**
 * Move the real pointer to the middle of an element.
 * @param element What to hover.
 */
async function hover(element: HTMLElement): Promise<void> {
  const box = element.getBoundingClientRect();
  await sendMouse({ type: 'move', position: [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)] });
}

it('paints a hover tile inside the button instead of lighting the whole button', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const task = find('.running .task:not(.active)');
  const tile = getComputedStyle(task, '::before');
  expect(tile.position, 'the tile is positioned inside the button').to.equal('absolute');
  expect(tile.borderTopLeftRadius).to.equal(`${UMBRACO_TASK_TILE_RADIUS}px`);
  expect(tile.top).to.equal(`${UMBRACO_TASK_TILE_TOP}px`);
  expect(tile.bottom).to.equal(`${UMBRACO_TASK_TILE_BOTTOM}px`);
  expect(tile.left).to.equal(`${UMBRACO_TASK_TILE_SIDE}px`);
  expect(tile.backgroundColor, 'nothing painted at rest').to.equal('rgba(0, 0, 0, 0)');

  await hover(task);
  expect(
    getComputedStyle(task, '::before').backgroundColor,
    'the tile lights under the pointer',
  ).to.not.equal('rgba(0, 0, 0, 0)');
  expect(
    getComputedStyle(task).backgroundColor,
    'while the button itself stays clear, so the hover is not a full-height block',
  ).to.equal('rgba(0, 0, 0, 0)');
});

it('gives the Start button the same tile', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const start = find('.start');
  await hover(start);
  expect(getComputedStyle(start, '::before').backgroundColor).to.not.equal('rgba(0, 0, 0, 0)');
  expect(getComputedStyle(start).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
});

it("marks the active window with a lit tile and a short coral line under it, on the bar's bottom edge", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const active = find('.task.active');
  await Promise.all(active.getAnimations().map((animation) => animation.finished));

  // The tile: the same one hover paints, lit before anyone hovers, so the focused window is the one
  // button on the bar that is never at rest.
  expect(getComputedStyle(active, '::before').backgroundColor, 'a tile is lit under the active window').to.not.equal(
    'rgba(0, 0, 0, 0)',
  );
  const idle = find('.running .task:not(.active)');
  expect(
    getComputedStyle(active, '::before').backgroundColor,
    'and it is not the colour an idle button has',
  ).to.not.equal(getComputedStyle(idle, '::before').backgroundColor);

  // The line: the section menu's marker, kept, but drawn as a short bar with soft ends rather than
  // an edge-to-edge shadow. It is a pseudo-element now, so the base's inset shadow is switched off.
  expect(getComputedStyle(active).boxShadow, 'the base\'s full-width inset line is gone').to.equal('none');
  const line = getComputedStyle(active, '::after');
  expect(line.content, 'a line is drawn').to.not.equal('none');
  expect(line.position).to.equal('absolute');
  expect(line.height, 'thin').to.equal(`${UMBRACO_TASK_LINE}px`);
  expect(line.backgroundColor, 'still coral').to.equal(CORAL);
  expect(line.bottom, 'on the button\'s bottom edge').to.equal('0px');
  expect(line.left, 'stopping short of the button edges').to.equal(`${UMBRACO_TASK_LINE_INSET}px`);
  expect(line.borderTopLeftRadius, 'with soft ends, like the underline under an active tab').to.not.equal('0px');

  const bar = find('.bar').getBoundingClientRect();
  const group = find('.task-group').getBoundingClientRect();
  const lone = find('.running > .task').getBoundingClientRect();
  expect(group.bottom, 'a group rises from the bar\'s edge, so the line inside it is on that edge too').to.be.closeTo(
    bar.bottom,
    1.5,
  );
  expect(lone.bottom, 'and a lone button reaches it as it always did').to.be.closeTo(bar.bottom, 1.5);
});

it('keeps every taskbar button a touch target: at least 44px wide, and the bar tall', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const bar = find('.bar');
  const inner = bar.clientHeight;
  const buttons = [
    find('.start'),
    ...taskbar.renderRoot.querySelectorAll<HTMLElement>('.features .task'),
    ...taskbar.renderRoot.querySelectorAll<HTMLElement>('.running .task'),
  ];
  expect(buttons.length, 'the bar rendered its feature row and its window buttons').to.be.greaterThan(3);
  for (const button of buttons) {
    const box = button.getBoundingClientRect();
    expect(box.width, `${button.className} is wide enough to tap`).to.be.at.least(UMBRACO_MIN_TOUCH);
    // A button inside the group box is the group's height, which is the bar's less a few px of
    // border, so the bar's full height is only asked of the ones that sit on it directly.
    if (!button.closest('.task-group')) {
      expect(box.height, `${button.className} runs the height of the bar`).to.be.closeTo(inner, 1.5);
    }
  }
});

it('draws a connected group as a tab rising from the bar: rounded above, open below', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const group = getComputedStyle(find('.task-group'));
  expect(group.borderTopLeftRadius).to.equal(`${UMBRACO_TASK_GROUP_RADIUS}px`);
  expect(group.borderTopRightRadius).to.equal(`${UMBRACO_TASK_GROUP_RADIUS}px`);
  expect(group.borderBottomLeftRadius, 'square where it meets the bar').to.equal('0px');
  expect(group.borderBottomWidth, 'with no line of its own under it, so the active line is the only one').to.equal(
    '0px',
  );
  expect(group.backgroundColor, 'a faint fill that says the buttons belong together').to.not.equal(
    'rgba(0, 0, 0, 0)',
  );
  expect(find('.task-group').querySelectorAll('.task'), 'both windows are in the box').to.have.lengthOf(2);
});
