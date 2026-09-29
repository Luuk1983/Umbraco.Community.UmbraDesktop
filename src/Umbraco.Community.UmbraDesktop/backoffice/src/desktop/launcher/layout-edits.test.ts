import { expect } from '@open-wc/testing';
import {
  addApp,
  addGroup,
  createGroup,
  deleteGroup,
  moveApp,
  moveGroup,
  pinApp,
  removeApp,
  renameGroup,
  resetLayout,
} from './layout-edits';
import { resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from '../constants';

/** Two catalogue groups, labelled as term keys the way the curated catalogue writes them. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#g_editing', weight: 10 },
  { alias: 'diagnostics', label: '#g_diagnostics', weight: 40 },
];

/**
 * A stand-in app.
 * @param alias The alias.
 * @param group Its catalogue group.
 * @param weight Its weight.
 * @returns The app.
 */
function app(alias: string, group: string, weight = 0): UmbraDesktopApp {
  return { alias, name: alias, icon: 'icon-box', content: { kind: 'iframe', url: '/x' }, chromeProfile: 'bare', group, weight };
}

/** Editing's first app. */
const content = app('content', 'editing', 10);
/** Editing's second app. */
const media = app('media', 'editing', 20);
/** Diagnostics' first app. */
const logs = app('logs', 'diagnostics', 10);
/** Diagnostics' second app. */
const profiling = app('profiling', 'diagnostics', 20);
/** The catalogue every edit works against unless a case needs a different one. */
const INPUTS: UmbraDesktopLauncherInputs = { apps: [content, media, logs, profiling], catalogueGroups: GROUPS };
/** A launcher nobody has arranged or pinned anything on, which is where most edits start. */
const UNTOUCHED: UmbraDesktopLauncherArrangement = { pinned: [] };

/**
 * The launcher an arrangement draws, as `[id, aliases]` pairs.
 * @param arrangement The arrangement.
 * @param catalogue The catalogue to draw it against; defaults to {@link INPUTS} for the tests that
 * do not need a different one (a package with a "More"-only app, say).
 * @returns The shape.
 */
const drawn = (arrangement: UmbraDesktopLauncherArrangement, catalogue: UmbraDesktopLauncherInputs = INPUTS) =>
  resolveLauncher(catalogue, arrangement).groups.map((g) => [g.id, g.apps.map((a) => a.alias)]);

describe('pinning', () => {
  it('stores no layout for a pin on an unarranged launcher, so the catalogue order keeps reaching the user', () => {
    const result = pinApp(INPUTS, UNTOUCHED, logs);
    expect(result).to.deep.equal({ pinned: ['logs'], layout: undefined });
  });

  it('takes the app out of its group on an arranged launcher', () => {
    const arranged = moveApp(INPUTS, UNTOUCHED, media, 'editing', content);
    const result = pinApp(INPUTS, arranged, media);
    expect(result.pinned).to.deep.equal(['media']);
    expect(result.layout?.groups.find((g) => g.id === 'editing')?.apps).to.deep.equal(['content']);
  });

  it('pins before another pinned app', () => {
    expect(pinApp(INPUTS, { pinned: ['content'] }, logs, content).pinned).to.deep.equal(['logs', 'content']);
  });
});

describe('moving', () => {
  it('moves an app between groups and stores the layout', () => {
    const result = moveApp(INPUTS, UNTOUCHED, logs, 'editing', media);
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'logs', 'media']],
      ['diagnostics', ['profiling']],
    ]);
  });

  it('unpins an app moved out of Pinned', () => {
    const result = moveApp(INPUTS, { pinned: ['content'] }, content, 'diagnostics');
    expect(result.pinned).to.deep.equal([]);
    expect(drawn(result)[1]).to.deep.equal(['diagnostics', ['logs', 'profiling', 'content']]);
  });

  it('keeps a hidden alias in place when the group around it changes', () => {
    const arrangement = {
      pinned: [],
      layout: { groups: [{ id: 'editing', label: null, apps: ['hidden', 'content', 'media'] }], removed: [], deletedGroups: [] },
    };
    const result = moveApp(INPUTS, arrangement, media, 'editing', content);
    expect(result.layout?.groups[0].apps).to.deep.equal(['hidden', 'media', 'content']);
  });

  it('changes nothing when an app is dropped before itself', () => {
    const result = moveApp(INPUTS, UNTOUCHED, content, 'editing', content);
    expect(result).to.deep.equal({ pinned: [], layout: undefined });
  });

  it('stores no layout for a move that leaves an unarranged launcher exactly as it already draws (design §4.3)', () => {
    // content is already directly before media in the catalogue's own order.
    expect(moveApp(INPUTS, UNTOUCHED, content, 'editing', media)).to.deep.equal({ pinned: [], layout: undefined });
    // media is already last in editing.
    expect(moveApp(INPUTS, UNTOUCHED, media, 'editing')).to.deep.equal({ pinned: [], layout: undefined });
  });

  it('stores no layout for unpinning an app back to its own catalogue-ordered spot', () => {
    // Unpinning media by moving it to the end of its own catalogue group lands it exactly where an
    // unarranged launcher with nothing pinned already puts it, so nothing should be stored.
    const result = moveApp(INPUTS, { pinned: ['media'] }, media, 'editing');
    expect(result).to.deep.equal({ pinned: [], layout: undefined });
  });

  it('lifts a stored section fallback alias when the app that now covers the section is moved', () => {
    const pkg: UmbraDesktopApp = { ...app('pkg-app', 'editing', 30), coversSection: 'Pkg.Section' };
    const withPkg: UmbraDesktopLauncherInputs = { apps: [content, media, logs, profiling, pkg], catalogueGroups: GROUPS };
    const arrangement = {
      pinned: [],
      layout: {
        groups: [{ id: 'editing', label: null, apps: ['content', 'section:Pkg.Section', 'media'] }],
        removed: [],
        deletedGroups: [],
      },
    };
    const result = moveApp(withPkg, arrangement, pkg, 'editing', content);
    expect(result.layout?.groups[0].apps).to.deep.equal(['pkg-app', 'content', 'media']);
  });
});

describe('removing and adding back', () => {
  it('removes an app into the removed list and the palette', () => {
    const result = removeApp(INPUTS, UNTOUCHED, profiling);
    expect(result.layout?.removed).to.deep.equal(['profiling']);
    expect(resolveLauncher(INPUTS, result).palette[0].apps.map((a) => a.alias)).to.deep.equal(['profiling']);
  });

  it('unpins an app removed from Pinned', () => {
    expect(removeApp(INPUTS, { pinned: ['logs'] }, logs).pinned).to.deep.equal([]);
  });

  it('adds an app back to the end of its catalogue group', () => {
    const removed = removeApp(INPUTS, removeApp(INPUTS, UNTOUCHED, logs), profiling);
    const result = addApp(INPUTS, removed, logs);
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs']],
    ]);
  });

  it('brings a deleted group back when one of its apps is added', () => {
    const deleted = deleteGroup(INPUTS, UNTOUCHED, 'diagnostics');
    const result = addApp(INPUTS, deleted, profiling);
    expect(result.layout?.deletedGroups).to.deep.equal([]);
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['profiling']],
    ]);
  });

  it('adds a whole deleted group back with every app waiting for it', () => {
    const result = addGroup(INPUTS, deleteGroup(INPUTS, UNTOUCHED, 'diagnostics'), 'diagnostics');
    expect(drawn(result)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs', 'profiling']],
    ]);
    expect(result.layout?.removed).to.deep.equal([]);
  });
});

describe('groups', () => {
  it("deletes a catalogue group: its apps are removed and its id remembered, so it does not come back", () => {
    const result = deleteGroup(INPUTS, UNTOUCHED, 'diagnostics');
    expect(result.layout?.removed).to.deep.equal(['logs', 'profiling']);
    expect(result.layout?.deletedGroups).to.deep.equal(['diagnostics']);
    expect(drawn(result)).to.deep.equal([['editing', ['content', 'media']]]);
  });

  it("deletes a user's group without recording it as a deleted catalogue group", () => {
    const created = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    const moved = moveApp(INPUTS, created, logs, 'custom-1');
    const result = deleteGroup(INPUTS, moved, 'custom-1');
    expect(result.layout?.deletedGroups).to.deep.equal([]);
    expect(result.layout?.removed).to.deep.equal(['logs']);
  });

  it('leaves a pinned alias out of removed when its group is deleted, because Pinned still shows it', () => {
    // A stale layout: content is pinned, yet its alias still sits in the group being deleted.
    const arrangement = {
      pinned: ['content'],
      layout: { groups: [{ id: 'editing', label: null, apps: ['content', 'media'] }], removed: [], deletedGroups: [] },
    };
    const result = deleteGroup(INPUTS, arrangement, 'editing');
    expect(result.layout?.removed).to.deep.equal(['media']);
  });

  it('leaves an alias out of removed when it is also listed in a surviving group', () => {
    // media is listed in both editing (being deleted) and diagnostics (surviving): design §4.2 step
    // 3 says it counts at its first occurrence, so it is still shown and must not become removed.
    const arrangement = {
      pinned: [],
      layout: {
        groups: [
          { id: 'editing', label: null, apps: ['content', 'media'] },
          { id: 'diagnostics', label: null, apps: ['logs', 'profiling', 'media'] },
        ],
        removed: [],
        deletedGroups: [],
      },
    };
    const result = deleteGroup(INPUTS, arrangement, 'editing');
    expect(result.layout?.removed).to.deep.equal(['content']);
  });

  it('creates an empty group at the end', () => {
    const result = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    const groups = result.layout?.groups ?? [];
    // Indexed rather than `.at(-1)`: this project's `lib` target predates it.
    expect(groups[groups.length - 1]).to.deep.equal({ id: 'custom-1', label: 'Mine', apps: [] });
  });

  it('renames a group to literal text', () => {
    const result = renameGroup(INPUTS, UNTOUCHED, 'editing', '  Writing  ');
    expect(result.layout?.groups[0].label).to.equal('Writing');
  });

  it("restores a catalogue group's translated name when its name is cleared", () => {
    const renamed = renameGroup(INPUTS, UNTOUCHED, 'editing', 'Writing');
    expect(renameGroup(INPUTS, renamed, 'editing', '   ').layout?.groups[0].label).to.equal(null);
  });

  it("keeps a user's group's name when it is cleared", () => {
    const created = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    const groups = renameGroup(INPUTS, created, 'custom-1', '').layout?.groups ?? [];
    // Indexed rather than `.at(-1)`: this project's `lib` target predates it.
    expect(groups[groups.length - 1]?.label).to.equal('Mine');
  });

  it('moves a group before another, or to the end', () => {
    expect(drawn(moveGroup(INPUTS, UNTOUCHED, 'diagnostics', 'editing')).map(([id]) => id)).to.deep.equal([
      'diagnostics',
      'editing',
    ]);
    expect(drawn(moveGroup(INPUTS, UNTOUCHED, 'editing')).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
  });

  it('stores no layout for a group move that leaves the catalogue order exactly as it was', () => {
    // editing is already directly before diagnostics.
    expect(moveGroup(INPUTS, UNTOUCHED, 'editing', 'diagnostics')).to.deep.equal({ pinned: [], layout: undefined });
  });

  it('stores no layout for clearing a catalogue group name that was already translated', () => {
    expect(renameGroup(INPUTS, UNTOUCHED, 'editing', '')).to.deep.equal({ pinned: [], layout: undefined });
  });

  it('leaves the arrangement unchanged when asked to add back a group that is not in the catalogue', () => {
    expect(addGroup(INPUTS, UNTOUCHED, 'made-up')).to.deep.equal({ pinned: [], layout: undefined });
    const arranged = createGroup(INPUTS, UNTOUCHED, 'custom-1', 'Mine');
    expect(addGroup(INPUTS, arranged, 'custom-1')).to.deep.equal(arranged);
  });

  it('deletes and re-adds the reserved More group', () => {
    const stray = app('stray', 'unknown-group');
    const withStray: UmbraDesktopLauncherInputs = { apps: [content, media, logs, profiling, stray], catalogueGroups: GROUPS };
    const deleted = deleteGroup(withStray, UNTOUCHED, UMBRADESKTOP_MORE_GROUP_ALIAS);
    expect(deleted.layout?.deletedGroups).to.deep.equal([UMBRADESKTOP_MORE_GROUP_ALIAS]);
    expect(drawn(deleted, withStray).some(([id]) => id === UMBRADESKTOP_MORE_GROUP_ALIAS)).to.equal(false);

    const restored = addGroup(withStray, deleted, UMBRADESKTOP_MORE_GROUP_ALIAS);
    expect(restored.layout?.deletedGroups).to.deep.equal([]);
    expect(drawn(restored, withStray)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs', 'profiling']],
      [UMBRADESKTOP_MORE_GROUP_ALIAS, ['stray']],
    ]);
  });
});

describe('an alias this user cannot open (design §8)', () => {
  /**
   * An arranged launcher whose Editing group holds an alias with no app behind it for this user,
   * first, so every edit has to step around it rather than count it.
   */
  const WITH_HIDDEN: UmbraDesktopLauncherArrangement = {
    pinned: [],
    layout: {
      groups: [
        { id: 'editing', label: null, apps: ['hidden', 'content', 'media'] },
        { id: 'diagnostics', label: null, apps: ['logs', 'profiling'] },
      ],
      removed: [],
      deletedGroups: [],
    },
  };

  /**
   * The apps a result stores for Editing, hidden aliases included.
   * @param result An edit's result.
   * @returns The stored aliases.
   */
  const editing = (result: UmbraDesktopLauncherArrangement) => result.layout?.groups.find((g) => g.id === 'editing')?.apps;

  it('keeps its place when an app beside it is pinned', () => {
    expect(editing(pinApp(INPUTS, WITH_HIDDEN, media))).to.deep.equal(['hidden', 'content']);
  });

  it('keeps its place when an app beside it is removed', () => {
    const result = removeApp(INPUTS, WITH_HIDDEN, content);
    expect(editing(result)).to.deep.equal(['hidden', 'media']);
    expect(result.layout?.removed).to.deep.equal(['content']);
  });

  it('keeps its place when an app is added back beside it', () => {
    const result = addApp(INPUTS, removeApp(INPUTS, WITH_HIDDEN, media), media);
    expect(editing(result)).to.deep.equal(['hidden', 'content', 'media']);
  });

  it('goes to removed with its group when the group is deleted (design §4.6)', () => {
    // Add group cannot bring it back while it has no app, since its group cannot be known; it waits
    // in the palette once access returns. Accepted on purpose.
    const result = deleteGroup(INPUTS, WITH_HIDDEN, 'editing');
    expect(result.layout?.removed).to.deep.equal(['hidden', 'content', 'media']);
  });

  it('moves with its group', () => {
    const result = moveGroup(INPUTS, WITH_HIDDEN, 'diagnostics', 'editing');
    expect(result.layout?.groups.map((g) => g.id)).to.deep.equal(['diagnostics', 'editing']);
    expect(editing(result)).to.deep.equal(['hidden', 'content', 'media']);
  });

  it('stays in its group when the group is renamed', () => {
    expect(editing(renameGroup(INPUTS, WITH_HIDDEN, 'editing', 'Writing'))).to.deep.equal(['hidden', 'content', 'media']);
  });
});

describe('reset', () => {
  it('deletes the layout and keeps the pins (D10)', () => {
    const arranged = removeApp(INPUTS, { pinned: ['content'] }, logs);
    expect(resetLayout(arranged)).to.deep.equal({ pinned: ['content'], layout: undefined });
  });
});

it('never changes the arrangement it is given, across all ten edits', () => {
  const arrangement = {
    pinned: ['content'],
    layout: { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] },
  };
  const before = JSON.stringify(arrangement);
  moveApp(INPUTS, arrangement, logs, 'editing');
  pinApp(INPUTS, arrangement, media);
  removeApp(INPUTS, arrangement, media);
  addApp(INPUTS, arrangement, profiling);
  addGroup(INPUTS, arrangement, 'diagnostics');
  deleteGroup(INPUTS, arrangement, 'editing');
  createGroup(INPUTS, arrangement, 'custom-1', 'Mine');
  renameGroup(INPUTS, arrangement, 'editing', 'Renamed');
  moveGroup(INPUTS, arrangement, 'editing', 'diagnostics');
  resetLayout(arrangement);
  expect(JSON.stringify(arrangement)).to.equal(before);
});
