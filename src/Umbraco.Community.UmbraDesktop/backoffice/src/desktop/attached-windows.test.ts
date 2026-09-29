import { expect } from '@open-wc/testing';
import { UmbraDesktopWindowManagerContext } from './window-manager.context';
import type { UmbraDesktopApp, UmbraDesktopWindow } from './types';
import { UmbElementControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMBRADESKTOP_DEFAULT_METRICS } from './constants';

/**
 * The window manager's side of attached content: the pure rules live in `window-group.ts` and are
 * tested there, so these cases are about the manager calling them at the right moments, with the
 * sizes, minimums and desktop bounds it owns. Design: `docs/design/2026-09-27-attached-windows-design.md`.
 */

/** The owner's app: a document-sized window. */
const DOC: UmbraDesktopApp = {
  alias: 'doc',
  name: 'Doc',
  icon: 'icon-document',
  content: { kind: 'iframe', url: 'about:blank' },
  chromeProfile: 'bare',
  defaultSize: { w: 900, h: 600 },
  minSize: { w: 800, h: 400 },
};

/**
 * An attached app of a given kind. The alias is the kind, so two calls with the same alias are the
 * same kind of attached content.
 * @param alias The kind.
 * @returns The app.
 */
function attachedApp(alias = 'preview'): UmbraDesktopApp {
  return {
    alias,
    name: alias,
    icon: 'icon-eye',
    content: { kind: 'element', element: () => Promise.resolve({ element: HTMLElement }) },
    chromeProfile: 'bare',
    defaultSize: { w: 400, h: 500 },
    minSize: { w: 300, h: 300 },
  };
}

/** A manager whose discard dialog is a recorded answer instead of a modal. */
class ProbeManager extends UmbraDesktopWindowManagerContext {
  /** What the stand-in dialog will answer. */
  public answer = true;
  /** How many times the dialog was opened. */
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
 * A manager on a throwaway host, told how big its desktop is, with one document window moved away
 * from the edges so there is room either side of it.
 * @param bounds The desktop size.
 * @returns The manager and the document window's id.
 */
function withDocument(bounds = { w: 1920, h: 1000 }): { ctx: ProbeManager; doc: string } {
  const host = new UmbElementControllerHost(document.createElement('div'));
  hosts.push(host);
  const ctx = new ProbeManager(host);
  ctx.clampToBounds(bounds);
  ctx.open(DOC);
  const doc = ctx.getWindows()[0].id;
  ctx.move(doc, 300, 60);
  return { ctx, doc };
}

/**
 * One window by id, from the manager's current list.
 * @param ctx The manager.
 * @param id The window id.
 * @returns The window.
 */
function get(ctx: UmbraDesktopWindowManagerContext, id: string): UmbraDesktopWindow {
  const found = ctx.getWindows().find((w) => w.id === id);
  if (!found) throw new Error(`no window ${id}`);
  return found;
}

/**
 * The dock zones the manager is offering.
 * @param ctx The manager to read.
 * @returns The zones, empty when none are on offer.
 */
function zonesOf(ctx: UmbraDesktopWindowManagerContext) {
  let zones: ReadonlyArray<{ side: string; rect: { x: number; y: number; w: number; h: number }; active: boolean }> = [];
  ctx.dockZones.subscribe((value) => (zones = value)).unsubscribe();
  return zones;
}

/**
 * The manager's current ghost rectangle.
 * @param ctx The manager to read.
 * @returns The preview rect, or undefined when nothing is on offer.
 */
function previewOf(ctx: UmbraDesktopWindowManagerContext) {
  let rect: { x: number; y: number; w: number; h: number } | undefined;
  ctx.snapPreview.subscribe((value) => (rect = value)).unsubscribe();
  return rect;
}

describe('opening attached content', () => {
  it('opens a pane inside the owner, widening the window by the pane', () => {
    const { ctx, doc } = withDocument();
    const before = get(ctx, doc).rect;
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    const owner = get(ctx, doc);
    expect(ctx.getWindows()).to.have.lengthOf(1);
    expect(owner.panes?.map((p) => [p.id, p.side, p.width])).to.deep.equal([[id, 'right', 400]]);
    expect(owner.rect).to.deep.equal({ ...before, w: before.w + 400 });
  });

  it('widens to the left for a pane on the left, keeping the right edge', () => {
    const { ctx, doc } = withDocument();
    ctx.move(doc, 700, 60);
    const before = get(ctx, doc).rect;
    ctx.openAttached(doc, attachedApp(), 'left');
    expect(get(ctx, doc).rect).to.deep.equal({ ...before, x: before.x - 400, w: before.w + 400 });
  });

  it('takes the pane from the editor beside a maximized window, which cannot grow', () => {
    const { ctx, doc } = withDocument();
    ctx.setState(doc, 'maximized');
    const before = get(ctx, doc).rect;
    ctx.openAttached(doc, attachedApp(), 'right');
    expect(get(ctx, doc).rect).to.deep.equal(before);
    expect(get(ctx, doc).panes?.[0].grew).to.equal(0);
  });

  it('opens floating when the desktop cannot fit the widened window', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    expect(get(ctx, doc).panes ?? []).to.have.lengthOf(0);
    expect(get(ctx, id)).to.include({ owner: doc, active: true });
  });

  it("pays for a floating window's strip at the theme's path strip height, which is what draws it", () => {
    const heights = [20, 40].map((pathbarHeight) => {
      const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
      ctx.setMetrics({ ...UMBRADESKTOP_DEFAULT_METRICS, pathbarHeight });
      const id = ctx.openAttached(doc, attachedApp(), 'right')!;
      return get(ctx, id).rect.h;
    });
    expect(heights[1] - heights[0]).to.equal(20);
  });

  it('opens nothing new for a kind already open as a pane', () => {
    const { ctx, doc } = withDocument();
    const first = ctx.openAttached(doc, attachedApp(), 'right');
    expect(ctx.openAttached(doc, attachedApp(), 'right')).to.equal(first);
    expect(get(ctx, doc).panes).to.have.lengthOf(1);
  });

  it('focuses a kind already open as a floating window', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const first = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.focus(doc);
    expect(ctx.openAttached(doc, attachedApp(), 'right')).to.equal(first);
    expect(get(ctx, first).active).to.equal(true);
  });

  it('refuses to attach content to a floating attached window', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    expect(ctx.openAttached(id, attachedApp('changes'), 'right')).to.equal(undefined);
  });
});

describe('closing attached content', () => {
  it('gives the width back when a pane closes', () => {
    const { ctx, doc } = withDocument();
    const before = get(ctx, doc).rect;
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.closeAttached(doc, id);
    expect(get(ctx, doc).panes ?? []).to.have.lengthOf(0);
    expect(get(ctx, doc).rect).to.deep.equal(before);
  });

  it('closes floating windows with their owner', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    ctx.openAttached(doc, attachedApp(), 'right');
    ctx.close(doc);
    expect(ctx.getWindows()).to.have.lengthOf(0);
  });

  it('leaves the owner open when a floating window closes', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.closeAttached(doc, id);
    expect(ctx.getWindows().map((w) => w.id)).to.deep.equal([doc]);
  });

  it('asks about unsaved changes in a floating window before closing its owner', async () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.setDirty(id, true);
    ctx.answer = false;
    await ctx.requestClose(doc);
    expect(ctx.asked).to.equal(1);
    expect(ctx.getWindows()).to.have.lengthOf(2);
  });

  it('closes panes and floating windows when the owner moves to a different document', () => {
    const { ctx, doc } = withDocument();
    ctx.openAttached(doc, attachedApp('preview'), 'right');
    ctx.setSubjects(doc, [{ entityType: 'document', unique: 'one' }] as never);
    ctx.setSubjects(doc, [{ entityType: 'document', unique: 'two' }] as never);
    expect(get(ctx, doc).panes ?? []).to.have.lengthOf(0);
  });

  it('keeps them through a reload of the same document', () => {
    const { ctx, doc } = withDocument();
    ctx.setSubjects(doc, [{ entityType: 'document', unique: 'one' }] as never);
    ctx.openAttached(doc, attachedApp(), 'right');
    ctx.setSubjects(doc, []);
    ctx.setSubjects(doc, [{ entityType: 'document', unique: 'one' }] as never);
    expect(get(ctx, doc).panes).to.have.lengthOf(1);
  });
});

describe('moving between pane and floating window', () => {
  it('pops a pane out into a floating window with the same id, giving the width back', () => {
    const { ctx, doc } = withDocument();
    const before = get(ctx, doc).rect;
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    expect(get(ctx, doc).panes ?? []).to.have.lengthOf(0);
    expect(get(ctx, doc).rect).to.deep.equal(before);
    expect(get(ctx, id)).to.include({ owner: doc, active: true });
  });

  it('pops a pane out at the position a drag asks for, and says which window it became', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    expect(ctx.undock(doc, id, { x: 50, y: 70 })).to.equal(id);
    expect(get(ctx, id).rect).to.deep.include({ x: 50, y: 70 });
  });

  it('docks a floating window back to the side it came from, from a button', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'left')!;
    ctx.undock(doc, id);
    expect(ctx.canDock(id)).to.equal(true);
    ctx.dock(id);
    expect(ctx.getWindows().map((w) => w.id)).to.deep.equal([doc]);
    expect(get(ctx, doc).panes?.map((p) => [p.id, p.side])).to.deep.equal([[id, 'left']]);
  });

  it('says a floating window cannot dock when there is no room beside its owner', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    expect(ctx.canDock(id)).to.equal(false);
    ctx.dock(id);
    expect(get(ctx, id).owner, 'nothing happened').to.equal(doc);
  });

  it('shows every place it could dock as soon as a floating window is dragged', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    ctx.previewSnap(id, { x: 5, y: 5 });
    const zones = zonesOf(ctx);
    expect(zones.map((z) => z.side).sort()).to.deep.equal(['left', 'right']);
    expect(zones.some((z) => z.active)).to.equal(false);
  });

  it('marks the zone under the pointer, anywhere in it, and docks there on release', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    ctx.previewSnap(id, { x: 5, y: 5 });
    const right = zonesOf(ctx).find((z) => z.side === 'right')!.rect;
    ctx.previewSnap(id, { x: right.x + right.w / 2, y: right.y + right.h / 2 });
    expect(zonesOf(ctx).find((z) => z.active)?.side).to.equal('right');
    ctx.commitSnap(id);
    expect(ctx.getWindows().map((w) => w.id)).to.deep.equal([doc]);
    expect(get(ctx, doc).panes?.map((p) => [p.id, p.side])).to.deep.equal([[id, 'right']]);
    expect(zonesOf(ctx), 'the zones go with the drag').to.deep.equal([]);
  });

  it("draws each zone as a band just inside the owner's own edge, below its titlebar", () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    const owner = get(ctx, doc).rect;
    ctx.previewSnap(id, { x: 5, y: 5 });
    const left = zonesOf(ctx).find((z) => z.side === 'left')!.rect;
    const right = zonesOf(ctx).find((z) => z.side === 'right')!.rect;
    expect(left.x).to.equal(owner.x);
    expect(right.x + right.w).to.equal(owner.x + owner.w);
    expect(left.y).to.be.greaterThan(owner.y);
    expect(left.y + left.h).to.equal(owner.y + owner.h);
  });

  it("keeps the zones narrow, so most of the owner is not a target and they never meet", () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    const owner = get(ctx, doc).rect;
    ctx.previewSnap(id, { x: 5, y: 5 });
    const [a, b] = zonesOf(ctx).map((z) => z.rect);
    expect(a.w).to.be.at.most(owner.w / 3);
    expect(b.w).to.be.at.most(owner.w / 3);
    expect(zonesOf(ctx).find((z) => z.side === 'left')!.rect.x + a.w).to.be.lessThan(
      zonesOf(ctx).find((z) => z.side === 'right')!.rect.x,
    );
  });

  it('offers nothing in the middle of the owner or anywhere off it', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    const owner = get(ctx, doc).rect;
    ctx.previewSnap(id, { x: owner.x + owner.w / 2, y: owner.y + owner.h / 2 });
    expect(zonesOf(ctx).some((z) => z.active)).to.equal(false);
    ctx.previewSnap(id, { x: owner.x + owner.w + 300, y: owner.y + owner.h / 2 });
    expect(zonesOf(ctx).some((z) => z.active)).to.equal(false);
  });

  it('shows no zone where the pane would not fit', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.previewSnap(id, { x: 5, y: 5 });
    expect(zonesOf(ctx)).to.deep.equal([]);
  });

  it('shows no zones while an ordinary window is dragged', () => {
    const { ctx, doc } = withDocument();
    ctx.previewSnap(doc, { x: 5, y: 5 });
    expect(zonesOf(ctx)).to.deep.equal([]);
  });

  it('still offers the half-desktop snap to a floating window away from its owner', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.undock(doc, id);
    ctx.previewSnap(id, { x: 1920, y: 500 });
    expect(previewOf(ctx)).to.deep.include({ x: 960, y: 0 });
  });
});

describe('a group of an owner and its floating windows', () => {
  it('rises as one, with the focused window on top', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.open(DOC);
    const other = ctx.getWindows().find((w) => w.id !== doc && w.id !== id)!.id;
    ctx.focus(doc);
    expect(get(ctx, doc).z).to.be.greaterThan(get(ctx, id).z);
    expect(get(ctx, id).z).to.be.greaterThan(get(ctx, other).z);
  });

  it('minimizes along with its owner and comes back with it', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.setState(doc, 'minimized');
    expect(get(ctx, id).state).to.equal('minimized');
    ctx.focus(doc);
    expect(get(ctx, id).state).to.equal('normal');
  });

  it('minimizes a floating window on its own', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.setState(id, 'minimized');
    expect(get(ctx, id).state).to.equal('minimized');
    expect(get(ctx, doc).state).to.equal('normal');
  });

  it('maximizes a floating window on its own', () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.setState(id, 'maximized');
    expect(get(ctx, id).state).to.equal('maximized');
    expect(get(ctx, doc).state).to.equal('normal');
  });
});

describe('pane widths', () => {
  it('sets a pane width from its splitter, leaving the editor its minimum', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.setPaneWidth(doc, id, 5000);
    const owner = get(ctx, doc);
    expect(owner.panes?.[0].width).to.be.lessThan(owner.rect.w);
    expect(owner.panes?.[0].width).to.be.greaterThan(400);
  });

  it('never sets a pane narrower than its minimum', () => {
    const { ctx, doc } = withDocument();
    const id = ctx.openAttached(doc, attachedApp(), 'right')!;
    ctx.setPaneWidth(doc, id, 10);
    expect(get(ctx, doc).panes?.[0].width).to.equal(300);
  });

  it("sets attached content's width by its kind, as a pane", () => {
    const { ctx, doc } = withDocument();
    ctx.openAttached(doc, attachedApp('preview'), 'right');
    ctx.setAttachedContentWidth(doc, 'preview', 375);
    expect(get(ctx, doc).panes?.[0].width).to.equal(375);
  });

  it("sets attached content's width by its kind, as a floating window", () => {
    const { ctx, doc } = withDocument({ w: 1000, h: 1000 });
    const id = ctx.openAttached(doc, attachedApp('preview'), 'right')!;
    ctx.setAttachedContentWidth(doc, 'preview', 375);
    expect(get(ctx, id).rect.w).to.be.at.least(375);
    expect(get(ctx, id).rect.w).to.be.lessThan(400);
  });
});

describe('the saved-version signal', () => {
  it("records how often a window's document has been saved", () => {
    const { ctx, doc } = withDocument();
    ctx.setSaves(doc, 2);
    expect(get(ctx, doc).saves).to.equal(2);
  });

  it('hands back the same list when the count has not moved', () => {
    const { ctx, doc } = withDocument();
    ctx.setSaves(doc, 2);
    const before = ctx.getWindows();
    ctx.setSaves(doc, 2);
    expect(ctx.getWindows()).to.equal(before);
  });
});
