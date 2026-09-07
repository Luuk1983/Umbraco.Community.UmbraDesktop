import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowManagerContext } from './window-manager.context';
import type { UmbraDesktopApp } from './types';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * The unsaved-changes guard lives on the manager rather than on the window element, because the two
 * things that can throw work away want different scopes of the same answer: the close and reload
 * buttons act on one window, and Exit acts on every open window at once.
 *
 * These tests substitute the dialog through the manager's one seam, so they exercise the guard's
 * decisions without needing a modal manager context — which only resolves inside a booted
 * backoffice, and would make these tests about Umbraco's modal plumbing rather than about the
 * guard.
 */

/** A throwaway app; nothing here loads a frame. */
const APP: UmbraDesktopApp = {
  alias: 'probe',
  name: 'Probe',
  icon: 'icon-umbraco',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
};

/** A manager whose discard dialog is a recorded answer instead of a modal. */
class ProbeManager extends UmbraDesktopWindowManagerContext {
  /** What the stand-in dialog will answer. */
  public answer = true;
  /** How many times the dialog was opened — the "asks once" criterion is a count. */
  public asked = 0;

  protected override async _askToDiscard(): Promise<boolean> {
    this.asked += 1;
    return this.answer;
  }
}

/** Every host to tear down after a test. */
let hosts: UmbElementControllerHost[] = [];

afterEach(() => {
  for (const host of hosts) host.destroy();
  hosts = [];
});

/**
 * A manager on a throwaway controller host.
 * @returns The manager under test.
 */
function manager(): ProbeManager {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  return new ProbeManager(host);
}

/**
 * The manager's current window list.
 * @param ctx The manager to read.
 * @returns The open windows.
 */
function windowsOf(ctx: UmbraDesktopWindowManagerContext) {
  let list: ReadonlyArray<{ id: string; dirty?: boolean }> = [];
  ctx.windows.subscribe((value) => (list = value)).unsubscribe();
  return list;
}

it('closes a clean window immediately, with no dialog', async () => {
  const ctx = manager();
  ctx.open(APP);
  const id = windowsOf(ctx)[0].id;

  await ctx.requestClose(id);

  expect(ctx.asked, 'nothing was at stake, so nothing was asked').to.equal(0);
  expect(windowsOf(ctx)).to.have.lengthOf(0);
});

it('asks before closing a window with unsaved changes, and closes it when confirmed', async () => {
  const ctx = manager();
  ctx.open(APP);
  const id = windowsOf(ctx)[0].id;
  ctx.setDirty(id, true);

  ctx.answer = true;
  await ctx.requestClose(id);

  expect(ctx.asked).to.equal(1);
  expect(windowsOf(ctx)).to.have.lengthOf(0);
});

it('leaves the window open, still marked, when the discard is cancelled', async () => {
  const ctx = manager();
  ctx.open(APP);
  const id = windowsOf(ctx)[0].id;
  ctx.setDirty(id, true);

  ctx.answer = false;
  await ctx.requestClose(id);

  expect(ctx.asked).to.equal(1);
  expect(windowsOf(ctx), 'cancelling must not close the window').to.have.lengthOf(1);
  expect(windowsOf(ctx)[0].dirty, 'nor clear its mark').to.equal(true);
});

it('confirmDiscard answers for one window without closing anything', async () => {
  // This is the reload button's caller: it needs the answer, and then does its own thing with the
  // frame. A guard that closed the window would be catastrophic there.
  const ctx = manager();
  ctx.open(APP);
  const id = windowsOf(ctx)[0].id;
  ctx.setDirty(id, true);

  ctx.answer = false;
  expect(await ctx.confirmDiscard(id)).to.equal(false);
  ctx.answer = true;
  expect(await ctx.confirmDiscard(id)).to.equal(true);

  expect(windowsOf(ctx), 'confirmDiscard never closes').to.have.lengthOf(1);
});

it('confirmDiscard passes a clean window straight through', async () => {
  const ctx = manager();
  ctx.open(APP);
  const id = windowsOf(ctx)[0].id;

  expect(await ctx.confirmDiscard(id)).to.equal(true);
  expect(ctx.asked).to.equal(0);
});

it('confirmDiscard passes an id that is no longer open, rather than stranding its caller', async () => {
  const ctx = manager();
  expect(await ctx.confirmDiscard('never-opened')).to.equal(true);
  expect(ctx.asked).to.equal(0);
});

it('setDirty marks and clears the named window only', () => {
  const ctx = manager();
  ctx.open({ ...APP, alias: 'a' });
  ctx.open({ ...APP, alias: 'b' });
  const [first, second] = windowsOf(ctx);

  ctx.setDirty(first.id, true);
  expect(windowsOf(ctx).find((w) => w.id === first.id)!.dirty).to.equal(true);
  expect(windowsOf(ctx).find((w) => w.id === second.id)!.dirty).to.equal(undefined);

  ctx.setDirty(first.id, false);
  expect(windowsOf(ctx).find((w) => w.id === first.id)!.dirty).to.equal(false);
});

it('unsavedWindows reports what Exit has to warn about', () => {
  const ctx = manager();
  ctx.open({ ...APP, alias: 'a' });
  ctx.open({ ...APP, alias: 'b' });
  ctx.open({ ...APP, alias: 'c' });
  const ids = windowsOf(ctx).map((w) => w.id);

  expect(ctx.unsavedWindows()).to.have.lengthOf(0);

  ctx.setDirty(ids[0], true);
  ctx.setDirty(ids[2], true);
  expect(ctx.unsavedWindows().map((w) => w.id)).to.deep.equal([ids[0], ids[2]]);
});

it('drops a closed window from unsavedWindows, so Exit cannot warn about a window that is gone', async () => {
  const ctx = manager();
  ctx.open(APP);
  const id = windowsOf(ctx)[0].id;
  ctx.setDirty(id, true);

  ctx.answer = true;
  await ctx.requestClose(id);

  expect(ctx.unsavedWindows()).to.have.lengthOf(0);
});
