import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowManagerContext } from './window-manager.context';
import type { UmbraDesktopApp, UmbraDesktopWindow } from './types';
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
function windowsOf(ctx: UmbraDesktopWindowManagerContext): ReadonlyArray<UmbraDesktopWindow> {
  let list: ReadonlyArray<UmbraDesktopWindow> = [];
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

describe('server state and its guards', () => {
  /** A manager whose two dialogs are recorded answers instead of modals. */
  class GuardProbe extends UmbraDesktopWindowManagerContext {
    /** What the discard dialog answers. */
    public discardAnswer = true;
    /** What the keep-mine confirmation answers. */
    public keepAnswer = true;
    /** Which dialogs were opened, in order. */
    public opened: string[] = [];

    protected override async _askToDiscard(): Promise<boolean> {
      this.opened.push('discard');
      return this.discardAnswer;
    }

    protected override async _askToDiscardConflicted(): Promise<boolean> {
      this.opened.push('discard-conflicted');
      return this.discardAnswer;
    }

    protected override async _askToKeepMine(): Promise<boolean> {
      this.opened.push('keep');
      return this.keepAnswer;
    }
  }

  let guardHost: UmbElementControllerHost;
  let guard: GuardProbe;

  beforeEach(() => {
    guardHost = new UmbElementControllerHost(document.createElement('div'));
    guard = new GuardProbe(guardHost);
    guard.open(APP);
  });

  afterEach(() => {
    guardHost.destroy();
  });

  /** The one open window's id. */
  const only = () => windowsOf(guard)[0].id;

  it('asks the ordinary discard question for a dirty window', async () => {
    guard.setDirty(only(), true);
    expect(await guard.confirmDiscard(only())).to.equal(true);
    expect(guard.opened).to.eql(['discard']);
  });

  it('asks the inverted question when the window also changed elsewhere', async () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { changedElsewhere: true });
    expect(await guard.confirmDiscard(only())).to.equal(true);
    expect(guard.opened).to.eql(['discard-conflicted']);
  });

  it('asks nothing at all for a deleted window', async () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { deleted: true });
    expect(await guard.confirmDiscard(only())).to.equal(true);
    expect(guard.opened).to.eql([]);
  });

  // A trashed document cannot be saved from a window once it reloads, so closing it loses the
  // editor's own work and nobody else's. It is a warning like a conflict is, and it wants the
  // opposite dialog.
  it('asks the ordinary discard question for a trashed window', async () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { trashed: true });
    expect(await guard.confirmDiscard(only())).to.equal(true);
    expect(guard.opened).to.eql(['discard']);
  });

  it('records an acknowledgement only when the confirmation is confirmed', async () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { changedElsewhere: true });
    guard.keepAnswer = false;
    await guard.acknowledge(only());
    expect(windowsOf(guard)[0].acknowledged).to.equal(undefined);
    guard.keepAnswer = true;
    await guard.acknowledge(only());
    expect(windowsOf(guard)[0].acknowledged).to.equal(true);
  });

  it('counts the windows whose work is at risk', () => {
    guard.setDirty(only(), true);
    expect(guard.conflictedWindows().length).to.equal(0);
    guard.setServerState(only(), { changedElsewhere: true });
    expect(guard.conflictedWindows().length).to.equal(1);
  });

  it('keeps a window subjects out of the render model', () => {
    // The marker is deliberately not hex and not a GUID. A window's own `id` is a
    // `crypto.randomUUID()`, whose 31 hex characters contain any given pair like 'a1' about one
    // run in nine, so a scan of the serialised window for such a marker fails intermittently on
    // the id rather than on anything this test is about. 'zz' cannot appear in a UUID at all.
    const subjects = [{ entityType: 'document', unique: 'zz-subject-marker' }];
    guard.setSubjects(only(), subjects as never);
    expect(guard.subjectsOf(only())).to.equal(subjects);
    expect(JSON.stringify(windowsOf(guard)[0])).to.not.contain('zz-subject-marker');
  });

  it('forgets a closed window subjects', () => {
    const id = only();
    guard.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);
    guard.close(id);
    expect(guard.subjectsOf(id)).to.eql([]);
  });

  it('going clean clears an acknowledged conflict, so a later edit does not resurrect it', async () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { changedElsewhere: true });
    guard.keepAnswer = true;
    await guard.acknowledge(only());
    expect(windowsOf(guard)[0].changedElsewhere).to.equal(true);
    expect(windowsOf(guard)[0].acknowledged).to.equal(true);

    guard.setDirty(only(), false);

    expect(windowsOf(guard)[0].changedElsewhere).to.equal(false);
    expect(windowsOf(guard)[0].acknowledged).to.equal(false);
  });

  it('going clean leaves a trashed mark alone', () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { trashed: true });

    guard.setDirty(only(), false);

    expect(windowsOf(guard)[0].trashed).to.equal(true);
  });

  it('going clean leaves a deleted mark alone', () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { deleted: true });

    guard.setDirty(only(), false);

    expect(windowsOf(guard)[0].deleted).to.equal(true);
  });

  it('going dirty clears nothing, so an already-flagged window keeps its flags', async () => {
    guard.setDirty(only(), true);
    guard.setServerState(only(), { changedElsewhere: true });
    guard.keepAnswer = true;
    await guard.acknowledge(only());

    guard.setDirty(only(), true);

    expect(windowsOf(guard)[0].changedElsewhere).to.equal(true);
    expect(windowsOf(guard)[0].acknowledged).to.equal(true);
  });

  // A window hosting the Content section navigates internally all the time, and in-window
  // navigation is not an iframe load — so `#startDirtyWatch`'s own reset never runs for it, and
  // `setSubjects` is the only hook left that knows a window has started showing something else.
  describe('setSubjects clearing the subject-scoped flags on a document change', () => {
    it('clears changedElsewhere, trashed, deleted and acknowledged when the subject changes', async () => {
      const id = only();
      guard.setDirty(id, true);
      guard.setServerState(id, { changedElsewhere: true, trashed: true, deleted: true });
      guard.keepAnswer = true;
      await guard.acknowledge(id);
      // Establish node A as the last subject this window reported.
      guard.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);

      guard.setSubjects(id, [{ entityType: 'document', unique: 'b2' }] as never);

      const w = windowsOf(guard)[0];
      expect(w.changedElsewhere, 'changedElsewhere').to.equal(false);
      expect(w.trashed, 'trashed').to.equal(false);
      expect(w.deleted, 'deleted').to.equal(false);
      expect(w.acknowledged, 'acknowledged').to.equal(false);
    });

    it('clears nothing when the same subject is reported again', () => {
      const id = only();
      guard.setDirty(id, true);
      guard.setServerState(id, { trashed: true });
      guard.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);

      // The dirty watcher re-evaluates on every keystroke and rebuilds the subject object each
      // time, so a same-node report is a fresh object with the same identity, not the same
      // reference.
      guard.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);

      expect(windowsOf(guard)[0].trashed).to.equal(true);
    });

    it('clears nothing when an empty subject set is reported', () => {
      // `#startDirtyWatch` reports `[]` while a frame is between documents on every reload,
      // including a reload of a document that was permanently deleted — which must keep saying so
      // rather than silently forgetting the moment the reload starts.
      const id = only();
      guard.setDirty(id, true);
      guard.setServerState(id, { deleted: true });
      guard.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);

      guard.setSubjects(id, []);

      expect(windowsOf(guard)[0].deleted).to.equal(true);
    });

    it('DATA LOSS: after a different subject is reported, confirmDiscard asks again instead of returning true', async () => {
      // This is the regression the fix closes. Before it, opening node A, having a colleague
      // empty the recycle bin under it (`deleted: true`), and then clicking node B in the same
      // window would carry `deleted` onto B — and `confirmDiscard`'s `if (target.deleted) return
      // true` would let the editor close over unsaved work on B with no prompt at all.
      const id = only();
      guard.setSubjects(id, [{ entityType: 'document', unique: 'a1' }] as never);
      guard.setDirty(id, true);
      guard.setServerState(id, { deleted: true });

      // The editor navigates to a different node, B, inside the same window, and edits it — the
      // navigation clears `deleted` (asserted by the sibling test above), and the edit is what
      // makes B's own unsaved work the thing at stake below.
      guard.setSubjects(id, [{ entityType: 'document', unique: 'b2' }] as never);
      guard.setDirty(id, true);

      guard.discardAnswer = true;
      expect(await guard.confirmDiscard(id), 'confirmDiscard still answers true once asked').to.equal(true);
      expect(guard.opened, 'it must ask the ordinary discard question rather than skip it').to.eql(['discard']);
    });
  });
});
