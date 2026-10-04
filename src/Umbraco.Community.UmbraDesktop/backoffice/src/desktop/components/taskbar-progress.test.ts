import { expect } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import type { UmbraDesktopApp } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * A busy window's taskbar button: the surface that matters most, because the window doing the work
 * is often not the one being looked at, and a minimized one shows nothing else. Issue #108.
 */

/** A throwaway app; nothing here loads a frame. */
const APP: UmbraDesktopApp = {
  alias: 'probe',
  name: 'Media',
  icon: 'icon-picture',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

let wrapper: HTMLElement;
let host: UmbElementControllerHost;
let manager: UmbraDesktopWindowManagerContext;
let taskbar: UmbraDesktopTaskbarElement;

beforeEach(async () => {
  wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  host = new UmbElementControllerHost(wrapper);
  manager = new UmbraDesktopWindowManagerContext(host);
  new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();
  taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
  wrapper.appendChild(taskbar);
  await taskbar.updateComplete;
  manager.open(APP);
  await taskbar.updateComplete;
});

afterEach(() => {
  host.destroy();
  wrapper.remove();
});

/** The one window's id. */
const only = () => manager.getWindows()[0].id;

/** The window's task button. */
const button = () => taskbar.renderRoot.querySelector('.task.window') as HTMLElement;

/** The progress element on that button, or null. */
const progress = () => button().querySelector('.progress') as HTMLElement | null;

it('draws nothing on an idle window', () => {
  expect(progress()).to.equal(null);
});

it('draws progress on the button, round its icon, and names it in the tooltip', async () => {
  manager.setTasks(only(), 'frame', [
    { id: 'a', state: 'running', completed: 14, total: 50, label: '#umbraDesktop_progressUploading' },
  ]);
  await taskbar.updateComplete;
  expect(progress()?.getAttribute('data-state')).to.equal('determinate');
  expect(progress()?.closest('.progress-anchor')?.querySelector('.task-icon'), 'beside the icon').to.not.equal(null);
  expect(progress()?.getAttribute('aria-hidden'), 'the button carries the words').to.equal('true');
  // The wording is `progress.test.ts`'s to pin; this test has no localization loaded, so it checks
  // the caption reached the button's words at all, after the name.
  expect(button().getAttribute('title')).to.match(/^Media — .*progressCount/);
  expect(button().getAttribute('aria-label')).to.equal(button().getAttribute('title'));
});

it('keeps saying it is busy while the window is minimized', async () => {
  manager.setState(only(), 'minimized');
  manager.setTasks(only(), 'frame', [{ id: 'a', state: 'running' }]);
  await taskbar.updateComplete;
  expect(progress()?.getAttribute('data-state')).to.equal('indeterminate');
});

it('clears when the work finishes, minimized or not', async () => {
  manager.setState(only(), 'minimized');
  manager.setTasks(only(), 'frame', [{ id: 'a', state: 'running' }]);
  await taskbar.updateComplete;
  manager.setTasks(only(), 'frame', []);
  await taskbar.updateComplete;
  expect(progress()).to.equal(null);
});

it('shows the unsaved dot and the progress together', async () => {
  manager.setDirty(only(), true);
  manager.setTasks(only(), 'frame', [{ id: 'a', state: 'running' }]);
  await taskbar.updateComplete;
  expect(button().querySelector('.notice-badge-dot')).to.not.equal(null);
  expect(progress()).to.not.equal(null);
});

it('leaves a failure visible on the button', async () => {
  manager.setTasks(only(), 'frame', [{ id: 'a', state: 'failed', completed: 50, total: 50, failed: 3 }]);
  await taskbar.updateComplete;
  expect(progress()?.getAttribute('data-state')).to.equal('failed');
  expect(button().getAttribute('title')).to.match(/^Media — .*progressFailedCount/);
});
