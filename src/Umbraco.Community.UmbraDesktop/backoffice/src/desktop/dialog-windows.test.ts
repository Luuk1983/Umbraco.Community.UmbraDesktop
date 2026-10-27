import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowManagerContext } from './window-manager.context';
import type { UmbraDesktopApp, UmbraDesktopWindow } from './types';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { dialogOf, dialogRect, focusGroup, minimizeInGroup } from './window-group';
import { snapshotLayout } from './windows/layout';

/**
 * Dialog windows: a window that belongs to another and keeps it waiting until it is answered, as
 * the Media add-on's guidelines warning does (#179). The pure rules are in `window-group.ts`, beside
 * the rest of a group's; the manager's cases are about calling them with its sizes and bounds.
 */

/** The owner's app. */
const DOC: UmbraDesktopApp = {
  alias: 'doc',
  name: 'Doc',
  icon: 'icon-document',
  content: { kind: 'element', element: () => Promise.resolve({ element: HTMLElement }) },
  chromeProfile: 'bare',
  defaultSize: { w: 900, h: 600 },
};

/** A dialog's app. */
const ASK: UmbraDesktopApp = {
  alias: 'ask',
  name: 'Ask',
  icon: 'icon-alert',
  content: { kind: 'element', element: () => Promise.resolve({ element: HTMLElement }) },
  chromeProfile: 'bare',
  defaultSize: { w: 400, h: 300 },
};

/**
 * A window with sensible defaults.
 * @param id The id.
 * @param z Its stacking order.
 * @param over Fields to override.
 * @returns The window.
 */
function win(id: string, z: number, over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return { id, app: { ...ASK, alias: id }, rect: { x: 0, y: 0, w: 100, h: 100 }, z, active: false, state: 'normal', ...over };
}

/** Every host to tear down after a test. */
let hosts: UmbElementControllerHost[] = [];

afterEach(() => {
  for (const host of hosts) host.destroy();
  hosts = [];
});

/**
 * A manager on a 1600 by 900 desktop with one window at 200, 100.
 * @returns The manager and the window's id.
 */
function withOwner(): { ctx: UmbraDesktopWindowManagerContext; owner: string } {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  const ctx = new UmbraDesktopWindowManagerContext(host);
  ctx.clampToBounds({ w: 1600, h: 900 });
  ctx.open(DOC);
  const owner = ctx.getWindows()[0].id;
  ctx.move(owner, 200, 100);
  return { ctx, owner };
}

/**
 * The window with an id.
 * @param ctx The manager.
 * @param id The id.
 * @returns The window.
 */
function find(ctx: UmbraDesktopWindowManagerContext, id: string): UmbraDesktopWindow {
  return ctx.getWindows().find((w) => w.id === id)!;
}

describe('dialogOf', () => {
  it('finds the dialog an owner has open, and not its other attached windows', () => {
    const windows = [win('a', 1), win('preview', 2, { owner: 'a' }), win('ask', 3, { owner: 'a', dialog: true })];
    expect(dialogOf(windows, 'a')?.id).to.equal('ask');
    expect(dialogOf([win('a', 1), win('preview', 2, { owner: 'a' })], 'a') === undefined).to.equal(true);
  });
});

describe('dialogRect', () => {
  it('centres the dialog over its owner', () => {
    const rect = dialogRect({ owner: { x: 100, y: 100, w: 800, h: 600 }, size: { w: 400, h: 300 }, bounds: { w: 1600, h: 900 } });
    expect(rect).to.deep.equal({ x: 300, y: 250, w: 400, h: 300 });
  });

  it('keeps it on the desktop, and no larger than it', () => {
    const rect = dialogRect({ owner: { x: 1300, y: 700, w: 300, h: 200 }, size: { w: 700, h: 1200 }, bounds: { w: 1600, h: 900 } });
    expect(rect).to.deep.equal({ x: 900, y: 0, w: 700, h: 900 });
  });
});

describe('a group with a dialog', () => {
  it('gives the focus to the dialog, whichever member was focused', () => {
    const windows = [win('a', 1), win('ask', 2, { owner: 'a', dialog: true }), win('b', 3, { active: true })];
    const next = focusGroup(windows, 'a');
    expect(next.find((w) => w.id === 'ask')?.active).to.equal(true);
    expect(next.find((w) => w.id === 'a')?.active).to.equal(false);
    const z = (id: string) => next.find((w) => w.id === id)!.z;
    expect(z('ask')).to.be.greaterThan(z('a'));
    expect(z('a')).to.be.greaterThan(z('b'));
  });

  it('brings a minimized owner back with its dialog', () => {
    const windows = [
      win('a', 1, { state: 'minimized' }),
      win('ask', 2, { owner: 'a', dialog: true, state: 'minimized', minimizedWithOwner: true }),
    ];
    const next = focusGroup(windows, 'a');
    expect(next.map((w) => w.state)).to.deep.equal(['normal', 'normal']);
  });

  it('minimizes the owner when the dialog is minimized, since a dialog has no button to come back from', () => {
    const windows = [win('a', 1), win('ask', 2, { owner: 'a', dialog: true })];
    const next = minimizeInGroup(windows, 'ask');
    expect(next.map((w) => w.state)).to.deep.equal(['minimized', 'minimized']);
    expect(next[1].minimizedWithOwner).to.equal(true);
  });
});

describe('the manager and a dialog', () => {
  it('opens a dialog centred over its owner, active, fixed in size and owned by it', () => {
    const { ctx, owner } = withOwner();
    const id = ctx.openDialog(owner, ASK)!;
    const dialog = find(ctx, id);
    const o = find(ctx, owner);
    expect(dialog.owner).to.equal(owner);
    expect(dialog.dialog).to.equal(true);
    expect(dialog.active).to.equal(true);
    expect(dialog.app.resizable).to.equal(false);
    expect(Math.round(dialog.rect.x + dialog.rect.w / 2)).to.equal(Math.round(o.rect.x + o.rect.w / 2));
    expect(dialog.rect.h).to.be.greaterThan(ASK.defaultSize!.h);
  });

  it('opens one dialog at a time per owner', () => {
    const { ctx, owner } = withOwner();
    ctx.openDialog(owner, ASK);
    expect(ctx.openDialog(owner, { ...ASK, alias: 'other' }) === undefined).to.equal(true);
    expect(ctx.getWindows().filter((w) => w.dialog)).to.have.lengthOf(1);
  });

  it('opens none for a window that is not open, or that belongs to another', () => {
    const { ctx, owner } = withOwner();
    expect(ctx.openDialog('nope', ASK) === undefined).to.equal(true);
    const id = ctx.openDialog(owner, ASK)!;
    expect(ctx.openDialog(id, ASK) === undefined).to.equal(true);
  });

  it('takes the dialog along when the owner is moved', () => {
    const { ctx, owner } = withOwner();
    const id = ctx.openDialog(owner, ASK)!;
    const before = find(ctx, id).rect;
    ctx.move(owner, 260, 140);
    expect(find(ctx, id).rect).to.deep.equal({ ...before, x: before.x + 60, y: before.y + 40 });
  });

  it('moves the dialog alone when the dialog is moved', () => {
    const { ctx, owner } = withOwner();
    const id = ctx.openDialog(owner, ASK)!;
    ctx.move(id, 50, 60);
    expect(find(ctx, owner).rect.x).to.equal(200);
  });

  it('closes the dialog with its owner, and the owner stays when the dialog closes', () => {
    const { ctx, owner } = withOwner();
    const id = ctx.openDialog(owner, ASK)!;
    ctx.close(id);
    expect(ctx.getWindows().map((w) => w.id)).to.deep.equal([owner]);
    ctx.openDialog(owner, ASK);
    ctx.close(owner);
    expect(ctx.getWindows()).to.have.lengthOf(0);
  });

  it('flashes the dialog and brings it forward when its owner is clicked', () => {
    const { ctx, owner } = withOwner();
    const id = ctx.openDialog(owner, ASK)!;
    ctx.open({ ...DOC, alias: 'other' });
    ctx.flashDialog(owner);
    ctx.flashDialog(owner);
    expect(find(ctx, id).flashes).to.equal(2);
    expect(find(ctx, id).active).to.equal(true);
  });

  it('leaves a dialog out of the saved layout', () => {
    const { ctx, owner } = withOwner();
    ctx.openDialog(owner, ASK);
    expect(snapshotLayout(ctx.getWindows()).windows).to.have.lengthOf(1);
  });
});
