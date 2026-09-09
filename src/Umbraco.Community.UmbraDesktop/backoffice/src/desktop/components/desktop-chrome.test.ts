import { expect } from '@open-wc/testing';
import './desktop.element.js';
import './taskbar.element.js';
import type { UmbraDesktopDesktopElement } from './desktop.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import { UMBRADESKTOP_SECTION_ALIAS } from '../constants';
import { sectionTabSelector } from '../../headerapps/section-tab-hide';
import type { UmbraDesktopApp } from '../types.js';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import { UMBRADESKTOP_WINDOW_MANAGER_CONTEXT } from '../window-manager.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The desktop hides the whole backoffice header while it is open, so the Desktop section tab is
 * invisible for as long as you stay on the desktop. If the boot-time hide never landed — the
 * bounded poll in `hideSectionTab` timed out on a slow load, or the shell mounted after it gave
 * up — the very first moment you would notice is when the desktop unmounts and the header comes
 * back. The desktop therefore re-asserts the hide on the way out.
 */

/** Mount a stand-in backoffice shell: a shadow root owning the header and the section tab list. */
function mountShell() {
  const host = document.createElement('div');
  const root = host.attachShadow({ mode: 'open' });
  root.appendChild(document.createElement('umb-backoffice-header'));
  const group = document.createElement('uui-tab-group');
  const tab = document.createElement('uui-tab');
  tab.setAttribute('data-mark', `section-link:${UMBRADESKTOP_SECTION_ALIAS}`);
  tab.setAttribute('label', 'Desktop');
  group.appendChild(tab);
  root.appendChild(group);
  document.body.appendChild(host);
  return { host, root };
}

it('re-asserts the section-tab hide when the desktop unmounts', async () => {
  const shell = mountShell();
  try {
    // Mounted by hand rather than via `fixture`, whose `nextFrame()` never resolves in the
    // backgrounded pages the test runner uses when it has several files in flight.
    const desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
    document.body.appendChild(desktop);
    await desktop.updateComplete;

    expect(
      shell.root.querySelector('style#umbradesktop-hide-section-tab'),
      'the tab hide should not be present before the desktop exits',
    ).to.equal(null);

    desktop.remove();

    const style = shell.root.querySelector('style#umbradesktop-hide-section-tab');
    expect(style, 'the desktop should re-assert the tab hide on unmount').to.not.equal(null);
    expect(style!.textContent).to.contain(sectionTabSelector(UMBRADESKTOP_SECTION_ALIAS));
  } finally {
    shell.host.remove();
  }
});

describe('the notice badge on a task button', () => {
  /**
   * All three severities reach the taskbar, and the *shape* says which: a dot for `info`, the
   * severity glyph above it. Design D4 originally kept `info` off the taskbar entirely, on issue
   * #20's reasoning that the editor caused their own unsaved changes and knows about them — but the
   * argument for putting a conflict there is that a state you cannot see is a state nobody acts on,
   * and a window minimized an hour ago with unsaved work in it is exactly that. So it goes on,
   * quietly: the same dot the titlebar draws, in the same slot the glyph would take.
   *
   * A dot rather than an `info` glyph, which was the other option considered. Every window being
   * edited is dirty, so a glyph badge on all of them would spend the slot's scarcity — and it is
   * that scarcity that makes a warning badge mean "look at this". A dot is also what every other
   * application uses for unsaved work: macOS in the close button, VS Code on the tab.
   */

  /** A throwaway app; `about:blank` loads instantly and boots no backoffice. */
  const APP: UmbraDesktopApp = {
    alias: 'badge-probe',
    name: 'Probe',
    icon: 'icon-umbraco',
    content: { kind: 'iframe', url: 'about:blank' },
    chromeProfile: 'bare',
  };

  /**
   * A manager whose keep-mine confirmation answers yes without a modal, following `ProbeManager` in
   * `window-dirty.test.ts`. A modal manager context only resolves inside a booted backoffice.
   */
  class BadgeProbe extends UmbraDesktopWindowManagerContext {
    protected override async _askToKeepMine(): Promise<boolean> {
      return true;
    }
  }

  /**
   * Mounting a chrome component is documented as slow in this runner (see `window-dirty.test.ts`),
   * so the taskbar is mounted once for the file and re-pointed at a fresh window per test.
   */
  const MOUNT_TIMEOUT_MS = 20_000;

  let wrapper: HTMLElement;
  let host: UmbElementControllerHost;
  let manager: BadgeProbe;
  let taskbar: UmbraDesktopTaskbarElement;

  before(async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    wrapper = document.createElement('div');
    document.body.appendChild(wrapper);

    host = new UmbElementControllerHost(wrapper);
    manager = new BadgeProbe(host);
    // Provided on the wrapper by hand rather than by mounting a whole desktop: the taskbar
    // consumes the manager from its ancestors, and that is all it needs to be a real consumer.
    new UmbContextProvider(wrapper, UMBRADESKTOP_WINDOW_MANAGER_CONTEXT, manager).hostConnected();

    taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
    wrapper.appendChild(taskbar);
    await taskbar.updateComplete;
  });

  after(() => {
    host?.destroy();
    wrapper?.remove();
  });

  /**
   * Close whatever is open, then open one fresh window and wait for the taskbar to catch up.
   * @returns The id of the newly opened window.
   */
  async function showWindow(): Promise<string> {
    for (const open of manager.getWindows()) manager.close(open.id);
    manager.open(APP);
    await taskbar.updateComplete;
    return manager.getWindows()[0].id;
  }

  /**
   * The glyph badge on the first task button, if any.
   *
   * An `umb-icon` after the label rather than a coloured dot on the button's corner: at label
   * height beside the name it reads as part of the button, and the icon's shape carries the
   * severity that a hue alone could not. Queried as `umb-icon.notice-badge` specifically, so the
   * `info` dot — the same class, a bare span — cannot satisfy an assertion about a severity glyph.
   */
  const badge = () => taskbar.renderRoot.querySelector('.task umb-icon.notice-badge');

  /** The `info` dot on the first task button, if any. */
  const dot = () => taskbar.renderRoot.querySelector('.task .notice-badge-dot');

  it('draws a dot, and no glyph, for a window with ordinary unsaved changes', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    const id = await showWindow();
    manager.setDirty(id, true);
    await taskbar.updateComplete;
    expect(dot(), 'a minimized window with unsaved work has to say so').to.not.equal(null);
    expect(badge(), 'but quietly: a glyph here would spend the slot the warning needs').to.equal(
      null,
    );
  });

  it('draws nothing at all for a clean window', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    await showWindow();
    await taskbar.updateComplete;
    expect(dot()).to.equal(null);
    expect(badge()).to.equal(null);
  });

  it('replaces the dot with the glyph once something is wrong', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    // One slot, never two markers: a conflicted window is dirty by definition, so both notices are
    // present and only the worst one draws. The titlebar marker works the same way.
    const id = await showWindow();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await taskbar.updateComplete;
    expect(dot()).to.equal(null);
    expect(badge()?.getAttribute('data-severity')).to.equal('warning');
  });

  it('draws a badge for a conflict', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    const id = await showWindow();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await taskbar.updateComplete;
    expect(badge()?.getAttribute('data-severity')).to.equal('warning');
    // The shape, not just the colour, and the same glyph the titlebar marker uses — one mapping in
    // `notices.ts` answers for all three surfaces.
    expect(badge()?.getAttribute('name')).to.equal('icon-alert');
  });

  it('keeps the badge after the conflict is acknowledged', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    // The point of acknowledging is that the window stops shouting, not that it starts looking
    // safe: a minimized window that will overwrite somebody still has to say so.
    const id = await showWindow();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await manager.acknowledge(id);
    await taskbar.updateComplete;
    expect(badge()?.getAttribute('data-severity')).to.equal('warning');
  });

  it('draws an error badge for a deleted document', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    const id = await showWindow();
    manager.setServerState(id, { deleted: true });
    await taskbar.updateComplete;
    expect(badge()?.getAttribute('data-severity')).to.equal('error');
    expect(badge()?.getAttribute('name')).to.equal('icon-wrong');
  });

  it('names unsaved changes in the accessible name too, since a dot says nothing to a reader', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    const id = await showWindow();
    manager.setDirty(id, true);
    await taskbar.updateComplete;
    const button = taskbar.renderRoot.querySelector('.task') as HTMLElement;
    // As below: no localization manifest is registered in this isolated mount, so the raw key
    // (`umbraDesktop_unsavedChanges`) is what lands in the title. Matching on "unsaved" pins it
    // under both that and the English wording.
    expect(button.getAttribute('title')).to.match(/unsaved/i);
    expect(button.getAttribute('aria-label')).to.match(/unsaved/i);
  });

  it('names the state in the button accessible name, so colour is not the only carrier', async function () {
    this.timeout(MOUNT_TIMEOUT_MS);
    const id = await showWindow();
    manager.setDirty(id, true);
    manager.setServerState(id, { changedElsewhere: true });
    await taskbar.updateComplete;
    const button = taskbar.renderRoot.querySelector('.task') as HTMLElement;
    // No localization manifest is registered in this isolated mount, so `localize.term` falls back
    // to the raw key (`umbraDesktop_noticeChangedTitle`) rather than the English sentence a booted
    // backoffice would show — the same reason `window-dirty.test.ts` checks a marker's title for
    // non-empty content rather than for its translated wording. A case-insensitive match on
    // "changed" still pins the thing this test is for — the notice's own heading reaches the title,
    // not just a generic "conflict" word — under both the raw key and the real translation.
    expect(button.getAttribute('title')).to.match(/changed/i);
    expect(button.getAttribute('aria-label')).to.match(/changed/i);
  });
});
