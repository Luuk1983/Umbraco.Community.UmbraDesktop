import { expect } from '@open-wc/testing';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import { UmbraDesktopWindowManagerContext } from '../window-manager.context.js';
import type { UmbraDesktopApp } from '../types.js';
import { UmbraDesktopHelpContext } from './help.context.js';
import { UMBRADESKTOP_HELP_APP_ALIAS } from './manifest.js';

const HELP: UmbraDesktopApp = {
  alias: UMBRADESKTOP_HELP_APP_ALIAS,
  name: 'Help',
  icon: 'icon-help-alt',
  content: { kind: 'element', element: HTMLElement },
  chromeProfile: 'bare',
  allowMultiple: true,
};

let hosts: UmbElementControllerHost[] = [];
afterEach(() => {
  for (const host of hosts) host.destroy();
  hosts = [];
});

/**
 * A Help context over a real window manager.
 * @param apps The apps this user may open.
 * @returns The context and the manager.
 */
function setup(apps: UmbraDesktopApp[] = [HELP]) {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  const manager = new UmbraDesktopWindowManagerContext(host);
  const help = new UmbraDesktopHelpContext(host, { manager, apps: new UmbArrayState(apps, (a) => a.alias).asObservable() });
  return { help, manager };
}

describe('UmbraDesktopHelpContext', () => {
  it('opens a Help window at the target', () => {
    const { help, manager } = setup();
    expect(help.open('umbradesktop/snapping/on-a-narrow-screen')).to.equal(true);
    const [win] = manager.getWindows();
    expect(win.app.alias).to.equal(UMBRADESKTOP_HELP_APP_ALIAS);
    expect(win.location).to.equal('umbradesktop/snapping/on-a-narrow-screen');
  });

  it('brings forward a Help window already showing that page instead of opening another', () => {
    const { help, manager } = setup();
    help.open('umbradesktop/snapping');
    help.open('umbradesktop/themes');
    help.open('umbradesktop/snapping');
    const windows = manager.getWindows();
    expect(windows.map((w) => w.location)).to.deep.equal(['umbradesktop/snapping', 'umbradesktop/themes']);
    expect(windows.find((w) => w.active)?.location).to.equal('umbradesktop/snapping');
  });

  it('treats the same page with and without a heading as two places', () => {
    const { help, manager } = setup();
    help.open('umbradesktop/snapping');
    help.open('umbradesktop/snapping/on-a-narrow-screen');
    expect(manager.getWindows()).to.have.length(2);
  });

  it('writes the target the way a window reports it, so a hand-typed one still finds its window', () => {
    const { help, manager } = setup();
    help.open('UmbraDesktop/Snapping/');
    help.open('umbradesktop/snapping');
    expect(manager.getWindows().map((w) => w.location)).to.deep.equal(['umbradesktop/snapping']);
  });

  it('refuses a malformed target and opens nothing', () => {
    const { help, manager } = setup();
    expect(help.open('not a target')).to.equal(false);
    expect(manager.getWindows()).to.have.length(0);
  });

  it('opens nothing while Help is not an app this user may open', () => {
    const { help, manager } = setup([]);
    expect(help.open('umbradesktop')).to.equal(false);
    expect(manager.getWindows()).to.have.length(0);
  });

  it('holds a request made before the catalogue knows Help, and opens it once it does', () => {
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const manager = new UmbraDesktopWindowManagerContext(host);
    const apps = new UmbArrayState<UmbraDesktopApp>([], (a) => a.alias);
    const help = new UmbraDesktopHelpContext(host, { manager, apps: apps.asObservable() });
    help.openWhenReady('umbradesktop/snapping');
    expect(manager.getWindows()).to.have.length(0);
    apps.setValue([HELP]);
    expect(manager.getWindows().map((w) => w.location)).to.deep.equal(['umbradesktop/snapping']);
    apps.setValue([HELP]);
    expect(manager.getWindows(), 'and only once').to.have.length(1);
  });

  it('answers the umbradesktop-open-help event from anywhere under the desktop', () => {
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const manager = new UmbraDesktopWindowManagerContext(host);
    new UmbraDesktopHelpContext(host, { manager, apps: new UmbArrayState([HELP], (a) => a.alias).asObservable() });
    const child = document.createElement('span');
    host.getHostElement().append(child);
    const event = new CustomEvent('umbradesktop-open-help', { detail: { target: 'umbradesktop/themes' }, bubbles: true, composed: true });
    child.dispatchEvent(event);
    expect(manager.getWindows().map((w) => w.location)).to.deep.equal(['umbradesktop/themes']);
  });

  it('ignores an event without a target string', () => {
    const host = new UmbElementControllerHost(document.createElement('div'));
    hosts.push(host);
    const manager = new UmbraDesktopWindowManagerContext(host);
    new UmbraDesktopHelpContext(host, { manager, apps: new UmbArrayState([HELP], (a) => a.alias).asObservable() });
    host.getHostElement().dispatchEvent(new CustomEvent('umbradesktop-open-help', { detail: { target: 42 }, bubbles: true }));
    host.getHostElement().dispatchEvent(new CustomEvent('umbradesktop-open-help', { bubbles: true }));
    expect(manager.getWindows()).to.have.length(0);
  });
});
