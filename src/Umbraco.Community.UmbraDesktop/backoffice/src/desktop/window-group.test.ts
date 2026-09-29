import { expect } from '@open-wc/testing';
import {
  attachedKind,
  dockTargetAt,
  floatingRect,
  focusGroup,
  groupOf,
  minimizeInGroup,
  paneTotal,
  placePane,
  removeGroup,
  removePane,
  resizePane,
} from './window-group';
import type { UmbraDesktopPaneRequest } from './window-group';
import type { UmbraDesktopApp, UmbraDesktopPane, UmbraDesktopWindow } from './types';

/**
 * An app with the given alias. The alias is what "one of each kind" is keyed on, so the fixtures
 * need to be able to vary it.
 * @param alias The app alias.
 * @returns The app.
 */
function app(alias: string): UmbraDesktopApp {
  return { alias, name: alias, icon: 'icon-umbraco', content: { kind: 'iframe', url: '/x' }, chromeProfile: 'bare' };
}

/**
 * A window with sensible defaults, overridable per test.
 * @param id The window id.
 * @param z Its stacking order.
 * @param over Fields to override.
 * @returns The window.
 */
function win(id: string, z: number, over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return { id, app: app(id), rect: { x: 0, y: 0, w: 100, h: 100 }, z, active: false, state: 'normal', ...over };
}

/**
 * A pane with sensible defaults.
 * @param id The pane id.
 * @param over Fields to override.
 * @returns The pane.
 */
function pane(id: string, over: Partial<UmbraDesktopPane> = {}): UmbraDesktopPane {
  return { id, app: app(id), side: 'right', width: 400, ...over };
}

/**
 * The window with the given id, which every test here needs and none should have to spell out.
 * @param list The window list.
 * @param id The id to find.
 * @returns The window.
 */
function byId(list: ReadonlyArray<UmbraDesktopWindow>, id: string): UmbraDesktopWindow {
  const found = list.find((w) => w.id === id);
  if (!found) throw new Error(`no window ${id}`);
  return found;
}

describe('groupOf', () => {
  const desk = [win('doc', 1), win('other', 2), win('changes', 3, { owner: 'doc' }), win('preview', 4, { owner: 'doc' })];

  it('finds the owner and its floating windows from the owner', () => {
    const group = groupOf(desk, 'doc');
    expect(group?.owner.id).to.equal('doc');
    expect(group?.attached.map((w) => w.id)).to.deep.equal(['changes', 'preview']);
  });

  it('finds the same group from a floating window', () => {
    expect(groupOf(desk, 'preview')?.owner.id).to.equal('doc');
  });

  it('treats an ordinary window as a group of one', () => {
    const group = groupOf(desk, 'other');
    expect(group?.owner.id).to.equal('other');
    expect(group?.attached).to.deep.equal([]);
  });

  it('answers nothing for a window that is not open', () => {
    expect(groupOf(desk, 'gone')).to.equal(undefined);
  });
});

describe('attachedKind', () => {
  it('finds a kind that is open as a pane', () => {
    const desk = [win('doc', 1, { panes: [pane('p1', { app: app('preview') })] })];
    expect(attachedKind(desk, 'doc', 'preview')).to.deep.include({ kind: 'pane' });
  });

  it('finds a kind that is open as a floating window', () => {
    const desk = [win('doc', 1), win('p1', 2, { owner: 'doc', app: app('preview') })];
    expect(attachedKind(desk, 'doc', 'preview')).to.deep.include({ kind: 'window' });
  });

  it('does not find the same kind attached to a different owner', () => {
    const desk = [win('doc', 1), win('doc2', 2, { panes: [pane('p1', { app: app('preview') })] })];
    expect(attachedKind(desk, 'doc', 'preview')).to.equal(undefined);
  });

  it('does not mistake an ordinary window of that app for attached content', () => {
    const desk = [win('doc', 1), win('p1', 2, { app: app('preview') })];
    expect(attachedKind(desk, 'doc', 'preview')).to.equal(undefined);
  });
});

describe('focusGroup', () => {
  it('raises the whole group above every other window', () => {
    const desk = [win('doc', 1), win('other', 5), win('preview', 2, { owner: 'doc' })];
    const next = focusGroup(desk, 'doc');
    expect(byId(next, 'doc').z).to.be.greaterThan(byId(next, 'other').z);
    expect(byId(next, 'preview').z).to.be.greaterThan(byId(next, 'other').z);
  });

  it('puts the owner on top when the owner is focused', () => {
    const desk = [win('doc', 1), win('preview', 2, { owner: 'doc' })];
    const next = focusGroup(desk, 'doc');
    expect(byId(next, 'doc').z).to.be.greaterThan(byId(next, 'preview').z);
  });

  it('puts a floating window on top when it is focused', () => {
    const desk = [win('doc', 3), win('preview', 2, { owner: 'doc' })];
    const next = focusGroup(desk, 'preview');
    expect(byId(next, 'preview').z).to.be.greaterThan(byId(next, 'doc').z);
  });

  it('keeps the rest of the group in the order it was stacked', () => {
    const desk = [win('doc', 1), win('a', 4, { owner: 'doc' }), win('b', 3, { owner: 'doc' })];
    const next = focusGroup(desk, 'doc');
    expect(byId(next, 'a').z).to.be.greaterThan(byId(next, 'b').z);
  });

  it('makes only the focused window active', () => {
    const desk = [win('doc', 1, { active: true }), win('preview', 2, { owner: 'doc' }), win('other', 3)];
    expect(focusGroup(desk, 'preview').filter((w) => w.active).map((w) => w.id)).to.deep.equal(['preview']);
  });

  it('brings back what was minimized with the owner, and not what was minimized on its own', () => {
    const desk = [
      win('doc', 1, { state: 'minimized' }),
      win('with', 2, { owner: 'doc', state: 'minimized', minimizedWithOwner: true }),
      win('alone', 3, { owner: 'doc', state: 'minimized' }),
    ];
    const next = focusGroup(desk, 'doc');
    expect(byId(next, 'doc').state).to.equal('normal');
    expect(byId(next, 'with')).to.include({ state: 'normal', minimizedWithOwner: undefined });
    expect(byId(next, 'alone').state).to.equal('minimized');
  });

  it('restores a floating window minimized on its own when it is the one focused', () => {
    const desk = [win('doc', 1), win('preview', 2, { owner: 'doc', state: 'minimized' })];
    expect(byId(focusGroup(desk, 'preview'), 'preview').state).to.equal('normal');
  });

  it('brings the owner back too when a floating window of a minimized group is focused', () => {
    const desk = [
      win('doc', 1, { state: 'minimized' }),
      win('preview', 2, { owner: 'doc', state: 'minimized', minimizedWithOwner: true }),
    ];
    const next = focusGroup(desk, 'preview');
    expect(next.map((w) => w.state)).to.deep.equal(['normal', 'normal']);
  });

  it('leaves a maximized window maximized', () => {
    const desk = [win('doc', 1, { state: 'maximized' })];
    expect(focusGroup(desk, 'doc')[0].state).to.equal('maximized');
  });

  it('focuses an ordinary window exactly as before', () => {
    const desk = [win('a', 1, { active: true }), win('b', 5, { state: 'minimized' })];
    const next = focusGroup(desk, 'b');
    expect(byId(next, 'b')).to.include({ active: true, z: 6, state: 'normal' });
    expect(byId(next, 'a').active).to.equal(false);
  });
});

describe('minimizeInGroup', () => {
  it('takes the floating windows along when the owner is minimized, and says so', () => {
    const desk = [win('doc', 1), win('preview', 2, { owner: 'doc' }), win('other', 3)];
    const next = minimizeInGroup(desk, 'doc');
    expect(byId(next, 'doc').state).to.equal('minimized');
    expect(byId(next, 'preview')).to.include({ state: 'minimized', minimizedWithOwner: true });
    expect(byId(next, 'other').state).to.equal('normal');
  });

  it('leaves a floating window that was already minimized as the editor left it', () => {
    const desk = [win('doc', 1), win('preview', 2, { owner: 'doc', state: 'minimized' })];
    expect(byId(minimizeInGroup(desk, 'doc'), 'preview').minimizedWithOwner).to.equal(undefined);
  });

  it('minimizes a floating window on its own', () => {
    const desk = [win('doc', 1), win('preview', 2, { owner: 'doc' })];
    const next = minimizeInGroup(desk, 'preview');
    expect(byId(next, 'preview').state).to.equal('minimized');
    expect(byId(next, 'preview').minimizedWithOwner).to.equal(undefined);
    expect(byId(next, 'doc').state).to.equal('normal');
  });
});

describe('removeGroup', () => {
  const desk = [win('doc', 1), win('a', 2, { owner: 'doc' }), win('b', 3, { owner: 'doc' }), win('other', 4)];

  it('closes the floating windows with their owner', () => {
    expect(removeGroup(desk, 'doc').map((w) => w.id)).to.deep.equal(['other']);
  });

  it('closes only the floating window itself', () => {
    expect(removeGroup(desk, 'a').map((w) => w.id)).to.deep.equal(['doc', 'b', 'other']);
  });
});

describe('placePane', () => {
  /**
   * A request for a 400px pane on the right of a 900px window on a wide desktop, which every test
   * then bends in the one respect it is about.
   * @param over Fields to override.
   * @returns The request.
   */
  function request(over: Partial<UmbraDesktopPaneRequest> = {}): UmbraDesktopPaneRequest {
    return {
      owner: { x: 100, y: 50, w: 900, h: 700 },
      fixed: false,
      editorMinWidth: 800,
      panes: 0,
      side: 'right',
      width: 400,
      minWidth: 300,
      bounds: { w: 1920, h: 1000 },
      ...over,
    };
  }

  it('widens the window on the right by the pane, so the editor keeps its width', () => {
    expect(placePane(request())).to.deep.equal({ fits: true, owner: { x: 100, y: 50, w: 1300, h: 700 }, width: 400 });
  });

  it('widens the window to the left for a pane on the left', () => {
    const placed = placePane(request({ side: 'left', owner: { x: 600, y: 50, w: 900, h: 700 } }));
    expect(placed).to.deep.equal({ fits: true, owner: { x: 200, y: 50, w: 1300, h: 700 }, width: 400 });
  });

  it('shifts the widened window back onto the desktop', () => {
    const placed = placePane(request({ owner: { x: 800, y: 50, w: 900, h: 700 } }));
    expect(placed).to.deep.equal({ fits: true, owner: { x: 620, y: 50, w: 1300, h: 700 }, width: 400 });
  });

  it('narrows the pane towards its minimum before the editor', () => {
    const placed = placePane(request({ owner: { x: 0, y: 50, w: 900, h: 700 }, width: 800, bounds: { w: 1500, h: 1000 } }));
    expect(placed).to.deep.equal({ fits: true, owner: { x: 0, y: 50, w: 1500, h: 700 }, width: 600 });
  });

  it('narrows the editor towards its minimum once the pane is at its own', () => {
    const placed = placePane(
      request({ owner: { x: 0, y: 50, w: 1000, h: 700 }, editorMinWidth: 900, width: 500, minWidth: 400, bounds: { w: 1300, h: 1000 } }),
    );
    expect(placed).to.deep.equal({ fits: true, owner: { x: 0, y: 50, w: 1300, h: 700 }, width: 400 });
  });

  it('does not fit when both minimums do not', () => {
    const placed = placePane(request({ editorMinWidth: 900, minWidth: 400, bounds: { w: 1200, h: 1000 } }));
    expect(placed).to.deep.equal({ fits: false });
  });

  it('counts the panes already there', () => {
    const placed = placePane(request({ owner: { x: 100, y: 50, w: 1300, h: 700 }, panes: 400 }));
    expect(placed).to.deep.include({ fits: true, owner: { x: 100, y: 50, w: 1700, h: 700 } });
  });

  it('takes its width from the editor beside a window that cannot grow', () => {
    const placed = placePane(request({ fixed: true, owner: { x: 0, y: 0, w: 1920, h: 1000 }, editorMinWidth: 900 }));
    expect(placed).to.deep.equal({ fits: true, owner: { x: 0, y: 0, w: 1920, h: 1000 }, width: 400 });
  });

  it('narrows the pane beside a window that cannot grow, down to its minimum', () => {
    const placed = placePane(request({ fixed: true, owner: { x: 0, y: 0, w: 1200, h: 1000 }, editorMinWidth: 900, minWidth: 250 }));
    expect(placed).to.deep.include({ fits: true, width: 300 });
  });

  it('does not fit beside a window that cannot grow when the editor would go below its minimum', () => {
    const placed = placePane(request({ fixed: true, owner: { x: 0, y: 0, w: 1100, h: 1000 }, editorMinWidth: 900, minWidth: 250 }));
    expect(placed).to.deep.equal({ fits: false });
  });
});

describe('removePane', () => {
  it('gives back the width the window grew by, on the right', () => {
    const owner = win('doc', 1, { rect: { x: 100, y: 50, w: 1300, h: 700 }, panes: [pane('p', { grew: 400 })] });
    const next = removePane(owner, 'p');
    expect(next.panes).to.deep.equal([]);
    expect(next.rect).to.deep.equal({ x: 100, y: 50, w: 900, h: 700 });
  });

  it('gives back the width the window grew by, on the left, keeping its right edge', () => {
    const owner = win('doc', 1, { rect: { x: 200, y: 50, w: 1300, h: 700 }, panes: [pane('p', { side: 'left', grew: 400 })] });
    expect(removePane(owner, 'p').rect).to.deep.equal({ x: 600, y: 50, w: 900, h: 700 });
  });

  it('gives nothing back for a pane that took its width from the editor', () => {
    const owner = win('doc', 1, { state: 'maximized', rect: { x: 100, y: 50, w: 900, h: 700 }, panes: [pane('p', { grew: 0 })] });
    expect(removePane(owner, 'p').rect).to.deep.equal({ x: 100, y: 50, w: 900, h: 700 });
  });

  it('narrows the remembered rectangle of a snapped window, which is what it grew', () => {
    const owner = win('doc', 1, {
      snapped: 'left',
      rect: { x: 0, y: 0, w: 960, h: 1000 },
      restoreRect: { x: 100, y: 50, w: 1300, h: 700 },
      panes: [pane('p', { grew: 400 })],
    });
    const next = removePane(owner, 'p');
    expect(next.rect).to.deep.equal({ x: 0, y: 0, w: 960, h: 1000 });
    expect(next.restoreRect).to.deep.equal({ x: 100, y: 50, w: 900, h: 700 });
  });
});

describe('resizePane', () => {
  const owner = win('doc', 1, {
    rect: { x: 0, y: 0, w: 1400, h: 700 },
    panes: [pane('p', { width: 400 }), pane('q', { width: 200, side: 'left' })],
  });

  it('sets the width the splitter asks for', () => {
    expect(resizePane(owner, 'p', 450, 700, 300).panes?.[0].width).to.equal(450);
  });

  it('stops at the pane minimum', () => {
    expect(resizePane(owner, 'p', 100, 700, 300).panes?.[0].width).to.equal(300);
  });

  it('stops where the editor would go below its minimum, counting the other panes', () => {
    expect(resizePane(owner, 'p', 900, 700, 300).panes?.[0].width).to.equal(500);
  });
});

describe('dockTargetAt', () => {
  const zones = [
    { side: 'left' as const, rect: { x: 100, y: 80, w: 400, h: 600 } },
    { side: 'right' as const, rect: { x: 1000, y: 80, w: 400, h: 600 } },
  ];

  it('offers the side whose zone the pointer is in, anywhere in it', () => {
    expect(dockTargetAt({ x: 300, y: 300 }, zones, 16)).to.equal('left');
    expect(dockTargetAt({ x: 1390, y: 650 }, zones, 16)).to.equal('right');
  });

  it('offers it just outside the zone too, within the edge', () => {
    expect(dockTargetAt({ x: 1410, y: 300 }, zones, 16)).to.equal('right');
  });

  it('offers nothing between the zones', () => {
    expect(dockTargetAt({ x: 750, y: 300 }, zones, 16)).to.equal(undefined);
  });

  it('offers nothing when no zone fits', () => {
    expect(dockTargetAt({ x: 300, y: 300 }, [], 16)).to.equal(undefined);
  });
});

describe('floatingRect', () => {
  const base = { owner: { x: 100, y: 50, w: 1000, h: 700 }, size: { w: 500, h: 600 }, bounds: { w: 1200, h: 1000 }, titlebar: 32 };

  it("opens inside the owner's right edge, one titlebar down", () => {
    expect(floatingRect({ ...base, side: 'right' })).to.deep.equal({ x: 600, y: 82, w: 500, h: 600 });
  });

  it("opens inside the owner's left edge on the left", () => {
    expect(floatingRect({ ...base, side: 'left' })).to.deep.equal({ x: 100, y: 82, w: 500, h: 600 });
  });

  it('stays on the desktop', () => {
    const rect = floatingRect({ ...base, side: 'left', owner: { x: -200, y: 500, w: 1000, h: 700 } });
    expect(rect).to.deep.equal({ x: 0, y: 400, w: 500, h: 600 });
  });
});

describe('paneTotal', () => {
  it('adds up the widths of every pane a window draws', () => {
    expect(paneTotal(win('doc', 1, { panes: [pane('a', { width: 300 }), pane('b', { width: 250, side: 'left' })] }))).to.equal(550);
  });

  it('is nothing for a window with no panes', () => {
    expect(paneTotal(win('doc', 1))).to.equal(0);
  });
});
