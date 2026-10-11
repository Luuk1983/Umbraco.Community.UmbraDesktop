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

  /** Package names settings were opened at, instead of a modal. */
  public settingsOpened: string[] = [];

  /**
   * Record the request instead of opening the settings modal, which needs a booted backoffice's
   * modal manager.
   * @param packageName The package settings would have opened at.
   */
  protected override _openSettings(packageName: string): void {
    this.settingsOpened.push(packageName);
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

/**
 * `allowMultiple: false`, and what the second launcher click has to do.
 *
 * The branch in `open()` predates these tests and had none of its own, which stopped being
 * acceptable when the Copilot Workspace chat became a single-window app (the AI design's D16): a
 * second click on its launcher tile must surface the conversation already open, not start a fresh
 * document over the top of it and not quietly do nothing. `findAppWindow` is covered in
 * `window-model.test.ts`; what is untested is the manager acting on its answer.
 *
 * The cases below are the four ways this can go wrong, and each one is a thing a user would report
 * as losing their chat: stacking a duplicate, replacing the window and taking its state with it,
 * leaving it buried behind whatever covered it, and leaving it minimized.
 */
describe('opening an app window at a location', () => {
  const HELP: UmbraDesktopApp = { ...APP, alias: 'help', content: { kind: 'element', element: HTMLElement } };

  it('hands the location to the app as a property and records it on the window', () => {
    const ctx = manager();
    ctx.open(HELP, { location: 'umbradesktop/snapping' });
    const [opened] = windowsOf(ctx);
    expect(opened.app.content).to.eql({ kind: 'element', element: HTMLElement, props: { location: 'umbradesktop/snapping' } });
    expect(opened.location).to.equal('umbradesktop/snapping');
    expect(HELP.content, 'the catalogue’s own app is not touched').to.eql({ kind: 'element', element: HTMLElement });
  });

  it('opens a second window at another location rather than moving the first', () => {
    const ctx = manager();
    ctx.open(HELP, { location: 'a' });
    ctx.open(HELP, { location: 'b' });
    expect(windowsOf(ctx).map((w) => w.location)).to.eql(['a', 'b']);
  });

  it('opens as before without one', () => {
    const ctx = manager();
    ctx.open(HELP);
    const [opened] = windowsOf(ctx);
    expect(opened.app).to.equal(HELP);
    expect(opened.location).to.equal(undefined);
  });
});

describe('single-window apps', () => {
  /** A single-window app: the shape the chat catalogue entry uses. */
  const SOLO: UmbraDesktopApp = { ...APP, alias: 'solo', name: 'Solo', allowMultiple: false };
  /** A second, ordinary app. Covers `SOLO` so "raises it" has something to be raised above. */
  const OTHER: UmbraDesktopApp = { ...APP, alias: 'other', name: 'Other' };

  it('focuses the window already open instead of stacking a second one', () => {
    const ctx = manager();
    ctx.open(SOLO);
    const first = windowsOf(ctx)[0].id;

    ctx.open(SOLO);

    expect(windowsOf(ctx), 'a single-window app never stacks').to.have.lengthOf(1);
    expect(windowsOf(ctx)[0].id, 'and it is the same window, not a replacement').to.equal(first);
  });

  it('keeps what that window was holding, unsaved changes included', () => {
    // Why this is the load-bearing one for the chat: relaunching must not throw the conversation
    // away. A window that was replaced rather than focused would also drop its dirty flag, so the
    // unsaved-changes guard above would stop protecting it, and the loss would be silent.
    const ctx = manager();
    ctx.open(SOLO);
    const id = windowsOf(ctx)[0].id;
    ctx.setDirty(id, true);

    ctx.open(SOLO);

    // Asserted through the list rather than through `[0]`, because a stacked duplicate is appended
    // and would leave the original sitting at index 0, still dirty — so `[0].dirty` alone passes
    // even with the branch deleted. Verified by mutation: this is the assertion that catches it.
    const list = windowsOf(ctx);
    expect(list, 'no second window holding a fresh, empty copy of the chat').to.have.lengthOf(1);
    expect(list[0].id, 'the window is the original one').to.equal(id);
    expect(list[0].dirty, 'focusing must not reset it').to.equal(true);
  });

  it('raises the window when something is covering it', () => {
    const ctx = manager();
    ctx.open(SOLO);
    const solo = windowsOf(ctx)[0].id;
    ctx.open(OTHER);
    expect(
      windowsOf(ctx).find((w) => w.id === solo)!.active,
      'precondition: opening OTHER took the focus',
    ).to.equal(false);

    ctx.open(SOLO);

    const list = windowsOf(ctx);
    const win = list.find((w) => w.id === solo)!;
    expect(list, 'the other window is untouched').to.have.lengthOf(2);
    expect(win.active, 'the second launch surfaces it').to.equal(true);
    expect(win.z, 'and puts it on top').to.equal(Math.max(...list.map((w) => w.z)));
  });

  it('restores the window when it was minimized', () => {
    // The likeliest version of the gesture: the chat is minimized to the taskbar, and clicking the
    // launcher tile is how a user asks for it back. Left minimized, the click looks like nothing.
    const ctx = manager();
    ctx.open(SOLO);
    const id = windowsOf(ctx)[0].id;
    ctx.setState(id, 'minimized');

    ctx.open(SOLO);

    expect(windowsOf(ctx)[0].state, 'a minimized single-window app comes back').to.equal('normal');
  });

  it('stacks freely for an app that has not opted out', () => {
    // The control. Without it, every assertion above would pass just as well on a manager that
    // refused to open anything twice, which is a different and much worse desktop.
    const ctx = manager();
    ctx.open(OTHER);
    ctx.open(OTHER);

    expect(windowsOf(ctx), 'multiples are still the default').to.have.lengthOf(2);
  });
});

describe('snapping', () => {
  /** The desktop these cases snap into. Wide enough that half of it beats the 320px floor. */
  const BOUNDS = { w: 1200, h: 800 };

  /**
   * A manager that has been told how big its desktop is, which is what every snap rect is derived
   * from. Without it the manager has no bounds and nothing to snap into.
   * @returns The manager under test.
   */
  function snappable(): ProbeManager {
    const ctx = manager();
    ctx.clampToBounds(BOUNDS);
    return ctx;
  }

  /**
   * The manager's current ghost rectangle.
   * @param ctx The manager to read.
   * @returns The preview rect, or undefined when no snap is on offer.
   */
  function previewOf(ctx: UmbraDesktopWindowManagerContext) {
    let rect: { x: number; y: number; w: number; h: number } | undefined;
    ctx.snapPreview.subscribe((value) => (rect = value)).unsubscribe();
    return rect;
  }

  it('offers a half of the desktop while the pointer is at a side edge', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;

    ctx.previewSnap(id, { x: 0, y: 400 });

    expect(previewOf(ctx)).to.eql({ x: 0, y: 0, w: 600, h: 800 });
    expect(windowsOf(ctx)[0].snapped, 'a preview is an offer, not a snap').to.equal(undefined);
  });

  it('withdraws the offer when the pointer leaves the edge', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;

    ctx.previewSnap(id, { x: 0, y: 400 });
    ctx.previewSnap(id, { x: 600, y: 400 });

    expect(previewOf(ctx)).to.equal(undefined);
  });

  it('snaps on commit, and clears the ghost with it', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;

    ctx.previewSnap(id, { x: BOUNDS.w, y: 400 });
    ctx.commitSnap(id);

    const w = windowsOf(ctx)[0];
    expect(w.snapped).to.equal('right');
    expect(w.rect).to.eql({ x: 600, y: 0, w: 600, h: 800 });
    expect(previewOf(ctx), 'the ghost has to go the moment the window takes its place').to.equal(
      undefined,
    );
  });

  it('commits nothing when the drag ended away from an edge', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;
    const before = windowsOf(ctx)[0].rect;

    ctx.previewSnap(id, { x: 600, y: 400 });
    ctx.commitSnap(id);

    expect(windowsOf(ctx)[0].rect).to.eql(before);
    expect(windowsOf(ctx)[0].snapped).to.equal(undefined);
  });

  it('maximizes for a top snap rather than inventing a second full-screen state', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;

    ctx.previewSnap(id, { x: 600, y: 0 });
    expect(previewOf(ctx), 'the ghost fills the surface').to.eql({ x: 0, y: 0, w: 1200, h: 800 });

    ctx.commitSnap(id);

    const w = windowsOf(ctx)[0];
    expect(w.state).to.equal('maximized');
    expect(w.snapped, 'maximized already knows how to restore; a flag beside it would be a ' +
      'second answer to the same question').to.equal(undefined);
  });

  it('re-derives a snapped window when the desktop changes size', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;
    ctx.previewSnap(id, { x: 0, y: 400 });
    ctx.commitSnap(id);

    ctx.clampToBounds({ w: 800, h: 600 });

    expect(windowsOf(ctx)[0].rect).to.eql({ x: 0, y: 0, w: 400, h: 600 });
  });

  it('gives up the snap when the window is resized by hand', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;
    ctx.previewSnap(id, { x: 0, y: 400 });
    ctx.commitSnap(id);

    ctx.resize(id, { x: 0, y: 0, w: 700, h: 800 });
    ctx.clampToBounds(BOUNDS);

    expect(windowsOf(ctx)[0].snapped).to.equal(undefined);
    expect(windowsOf(ctx)[0].rect.w, 'a re-derive after the resize would undo it').to.equal(700);
  });

  it('restores the pre-snap size where a drag put it', () => {
    const ctx = snappable();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;
    const before = windowsOf(ctx)[0].rect;
    ctx.previewSnap(id, { x: 0, y: 400 });
    ctx.commitSnap(id);

    ctx.unsnapTo(id, 250, 0);

    const w = windowsOf(ctx)[0];
    expect(w.rect).to.eql({ x: 250, y: 0, w: before.w, h: before.h });
    expect(w.snapped).to.equal(undefined);
  });
});

/**
 * `resizable: false`: an app whose window stays the size it opened at, the way Minesweeper's did on
 * every Windows up to XP. The rule is the manager's, not the titlebar's, because a window can be
 * maximized or resized from more places than one button: a double-click, a drag into an edge, a
 * resize handle. Enforced here, every one of them is covered at once, and any later route that goes
 * through the manager inherits it.
 */
describe('fixed-size apps', () => {
  /** The desktop these cases would snap into, if the window were allowed to. */
  const BOUNDS = { w: 1200, h: 800 };

  /** An app that asked to keep its size. */
  const FIXED: UmbraDesktopApp = { ...APP, alias: 'fixed', resizable: false };

  /**
   * A manager with one fixed-size window open, and that window's id.
   * @returns The manager and the window id.
   */
  function fixedWindow(): { ctx: ProbeManager; id: string } {
    const ctx = manager();
    ctx.clampToBounds(BOUNDS);
    ctx.open(FIXED);
    return { ctx, id: windowsOf(ctx)[0].id };
  }

  /**
   * The manager's current ghost rectangle.
   * @param ctx The manager to read.
   * @returns The preview rect, or undefined when no snap is on offer.
   */
  function previewOf(ctx: UmbraDesktopWindowManagerContext) {
    let rect: { x: number; y: number; w: number; h: number } | undefined;
    ctx.snapPreview.subscribe((value) => (rect = value)).unsubscribe();
    return rect;
  }

  it('will not maximize', () => {
    const { ctx, id } = fixedWindow();
    ctx.setState(id, 'maximized');
    expect(windowsOf(ctx)[0].state).to.equal('normal');
  });

  it('still minimizes and restores, which change nothing about its size', () => {
    const { ctx, id } = fixedWindow();
    ctx.setState(id, 'minimized');
    expect(windowsOf(ctx)[0].state).to.equal('minimized');
    ctx.setState(id, 'normal');
    expect(windowsOf(ctx)[0].state).to.equal('normal');
  });

  it('ignores a resize', () => {
    const { ctx, id } = fixedWindow();
    const before = windowsOf(ctx)[0].rect;
    ctx.resize(id, { ...before, w: before.w + 200, h: before.h + 100 });
    expect(windowsOf(ctx)[0].rect).to.eql(before);
  });

  it('still moves', () => {
    const { ctx, id } = fixedWindow();
    const before = windowsOf(ctx)[0].rect;
    ctx.move(id, before.x + 40, before.y + 30);
    expect(windowsOf(ctx)[0].rect).to.eql({ ...before, x: before.x + 40, y: before.y + 30 });
  });

  it('offers no snap at a side edge, and commits none', () => {
    const { ctx, id } = fixedWindow();
    const before = windowsOf(ctx)[0].rect;
    ctx.previewSnap(id, { x: 0, y: 400 });
    expect(previewOf(ctx), 'no ghost: a half of the desktop is a resize').to.equal(undefined);
    ctx.commitSnap(id);
    expect(windowsOf(ctx)[0].snapped).to.equal(undefined);
    expect(windowsOf(ctx)[0].rect).to.eql(before);
  });

  it('offers no snap at the top edge either, which would maximize it', () => {
    const { ctx, id } = fixedWindow();
    ctx.previewSnap(id, { x: 600, y: 0 });
    expect(previewOf(ctx)).to.equal(undefined);
    ctx.commitSnap(id);
    expect(windowsOf(ctx)[0].state).to.equal('normal');
  });

  it('leaves every other app resizable, since the default is allowed', () => {
    const ctx = manager();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;
    ctx.setState(id, 'maximized');
    expect(windowsOf(ctx)[0].state).to.equal('maximized');
  });
});

/**
 * Reopening a saved window, for the window layout (`windows/layout.ts`), and recording where a
 * backoffice window's frame is, which is what lets it reopen at that page.
 */
describe('restoring saved windows', () => {
  const SECTION: UmbraDesktopApp = { ...APP, alias: 'section', content: { kind: 'iframe', url: '/umbraco/section/content' } };

  it('reopens a window at its saved rectangle, state and snap, without taking focus', () => {
    const ctx = manager();
    ctx.open(APP);
    ctx.restoreWindow(
      {
        app: 'section',
        rect: { x: 40, y: 50, w: 600, h: 400 },
        state: 'maximized',
        z: 7,
        active: true,
        snapped: 'left',
        restoreRect: { x: 1, y: 2, w: 300, h: 200 },
      },
      SECTION,
    );
    const restored = windowsOf(ctx).find((w) => w.app.alias === 'section')!;
    expect(restored.rect).to.eql({ x: 40, y: 50, w: 600, h: 400 });
    expect(restored.state).to.equal('maximized');
    expect(restored.snapped).to.equal('left');
    expect(restored.restoreRect).to.eql({ x: 1, y: 2, w: 300, h: 200 });
    expect(restored.active, 'focus is the restorer’s to give, once every window is back').to.equal(false);
  });

  it('stacks restored windows above what is open, in the order they are restored', () => {
    const ctx = manager();
    ctx.open(APP);
    ctx.restoreWindow({ app: 'section', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 1, active: false }, SECTION);
    ctx.restoreWindow({ app: 'section', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 2, active: false }, SECTION);
    const [first, second, third] = windowsOf(ctx);
    expect(second.z).to.be.greaterThan(first.z);
    expect(third.z).to.be.greaterThan(second.z);
  });

  it('opens a restored backoffice window at the page it was showing', () => {
    const ctx = manager();
    ctx.restoreWindow(
      { app: 'section', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 1, active: false, location: '/umbraco/section/content/workspace/document/edit/abc' },
      SECTION,
    );
    const [restored] = windowsOf(ctx);
    expect(restored.app.content).to.eql({ kind: 'iframe', url: '/umbraco/section/content/workspace/document/edit/abc' });
    expect(restored.location).to.equal('/umbraco/section/content/workspace/document/edit/abc');
  });

  it('hands a restored app window its saved location, as a property and as its location', () => {
    const ctx = manager();
    const HELP: UmbraDesktopApp = { ...APP, alias: 'help', content: { kind: 'element', element: HTMLElement, props: { keep: 1 } } };
    ctx.restoreWindow(
      { app: 'help', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 1, active: false, appLocation: 'umbradesktop/snapping' },
      HELP,
    );
    const [restored] = windowsOf(ctx);
    expect(restored.app.content).to.eql({ kind: 'element', element: HTMLElement, props: { keep: 1, location: 'umbradesktop/snapping' } });
    expect(restored.location).to.equal('umbradesktop/snapping');
    expect(HELP.content, 'the catalogue’s own app is not touched').to.eql({ kind: 'element', element: HTMLElement, props: { keep: 1 } });
  });

  it('records where a window’s frame is', () => {
    const ctx = manager();
    ctx.open(APP);
    const id = windowsOf(ctx)[0].id;
    ctx.setLocation(id, '/umbraco/section/media');
    expect(windowsOf(ctx)[0].location).to.equal('/umbraco/section/media');
  });
});

it('opens settings instead of a window for an app that opens settings', () => {
  const ctx = manager();
  ctx.open({ ...APP, alias: 'shortcut', opensSettings: 'My Package' });
  expect(windowsOf(ctx)).to.have.lengthOf(0);
  expect(ctx.settingsOpened).to.deep.equal(['My Package']);
});

describe('work in progress', () => {
  /** A manager whose dialogs are recorded answers, with the stop-work question told apart. */
  class WorkProbe extends UmbraDesktopWindowManagerContext {
    /** What any dialog answers. */
    public answer = true;
    /** Which dialogs were opened, in order, and for which window. */
    public opened: string[] = [];

    protected override async _askToDiscard(): Promise<boolean> {
      this.opened.push('discard');
      return this.answer;
    }

    protected override async _askToStopWork(w: UmbraDesktopWindow): Promise<boolean> {
      this.opened.push(`stop:${w.dirty ? 'dirty' : 'clean'}`);
      return this.answer;
    }
  }

  let workHost: UmbElementControllerHost;
  let work: WorkProbe;

  beforeEach(() => {
    workHost = new UmbElementControllerHost(document.createElement('div'));
    work = new WorkProbe(workHost);
    work.open(APP);
  });

  afterEach(() => {
    workHost.destroy();
  });

  /** The one open window. */
  const only = () => windowsOf(work)[0];

  it('puts a summary of the reported tasks on the window', () => {
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running', completed: 14, total: 50 }]);
    expect(only().progress?.state).to.equal('determinate');
    expect(only().progress?.total).to.equal(50);
  });

  it('sums what two sources report into one state', () => {
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running', completed: 4, total: 10 }]);
    work.setTasks(only().id, 'app', [{ id: 'a', state: 'running', completed: 10, total: 40 }]);
    expect(only().progress?.completed).to.equal(14);
    expect(only().progress?.total).to.equal(50);
  });

  it('clears the summary when the last source stops reporting, minimized or not', () => {
    work.setState(only().id, 'minimized');
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running' }]);
    work.setTasks(only().id, 'frame', []);
    expect(only().progress).to.equal(undefined);
  });

  it('hands back the same list when a report changes nothing, so a repeat costs no render', () => {
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running', completed: 1, total: 2 }]);
    const before = windowsOf(work);
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running', completed: 1, total: 2 }]);
    expect(windowsOf(work)).to.equal(before);
  });

  it('asks before closing a window with work in flight', async () => {
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running' }]);
    work.answer = false;
    await work.requestClose(only().id);
    expect(work.opened).to.deep.equal(['stop:clean']);
    expect(windowsOf(work)).to.have.lengthOf(1);
  });

  it('asks once, not twice, for a window that is both busy and unsaved', async () => {
    work.setDirty(only().id, true);
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'running' }]);
    await work.requestClose(only().id);
    expect(work.opened).to.deep.equal(['stop:dirty']);
    expect(windowsOf(work)).to.have.lengthOf(0);
  });

  it('closes a failed window without asking: nothing is left to stop', async () => {
    work.setTasks(only().id, 'frame', [{ id: 'a', state: 'failed', failed: 1 }]);
    await work.requestClose(only().id);
    expect(work.opened).to.deep.equal([]);
    expect(windowsOf(work)).to.have.lengthOf(0);
  });

  it('counts busy windows for Exit, leaving failed and idle ones out', () => {
    work.open({ ...APP, alias: 'b' });
    work.open({ ...APP, alias: 'c' });
    const [a, b] = windowsOf(work);
    work.setTasks(a.id, 'frame', [{ id: 'x', state: 'running' }]);
    work.setTasks(b.id, 'frame', [{ id: 'x', state: 'failed' }]);
    expect(work.busyWindows().map((w) => w.id)).to.deep.equal([a.id]);
  });

  it('forgets a closed window tasks, so a window reopened later starts idle', () => {
    const id = only().id;
    work.setTasks(id, 'frame', [{ id: 'a', state: 'running' }]);
    work.close(id);
    work.setTasks(id, 'app', []);
    expect(windowsOf(work)).to.have.lengthOf(0);
    expect(work.busyWindows()).to.have.lengthOf(0);
  });
});
