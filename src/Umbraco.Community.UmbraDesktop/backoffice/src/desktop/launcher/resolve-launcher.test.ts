import { expect } from '@open-wc/testing';
import { effectiveLayout, resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherInputs } from './resolve-launcher';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from '../constants';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';

/** Three catalogue groups, in weight order editing, diagnostics, system. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#g_editing', weight: 10 },
  { alias: 'diagnostics', label: '#g_diagnostics', weight: 40 },
  { alias: 'system', label: '#g_system', weight: 50 },
];

/**
 * A stand-in app.
 * @param alias The alias.
 * @param group Its catalogue group.
 * @param weight Its weight within the group.
 * @returns The app.
 */
function app(alias: string, group?: string, weight = 0): UmbraDesktopApp {
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
/** System's only app, the last group by weight, for cases about where a returning group lands. */
const settings = app('settings', 'system', 10);

/**
 * The catalogue inputs for a set of apps.
 * @param apps The apps this user may open.
 * @returns The inputs.
 */
const inputs = (apps: UmbraDesktopApp[]): UmbraDesktopLauncherInputs => ({ apps, catalogueGroups: GROUPS });

/**
 * The aliases in each view group, for compact assertions.
 * @param view The view.
 * @returns `[id, aliases]` pairs.
 */
const shape = (view: ReturnType<typeof resolveLauncher>) => view.groups.map((g) => [g.id, g.apps.map((a) => a.alias)]);

describe('with no stored layout', () => {
  it("is the catalogue's grouping, which is today's launcher", () => {
    const view = resolveLauncher(inputs([content, media, logs, settings]), { pinned: [] });
    expect(shape(view)).to.deep.equal([
      ['editing', ['content', 'media']],
      ['diagnostics', ['logs']],
      ['system', ['settings']],
    ]);
  });

  it('leaves a pinned app out of its group, because Pinned is a place (D4)', () => {
    const view = resolveLauncher(inputs([content, media, logs]), { pinned: ['content'] });
    expect(view.pinned.map((a) => a.alias)).to.deep.equal(['content']);
    expect(shape(view)).to.deep.equal([
      ['editing', ['media']],
      ['diagnostics', ['logs']],
    ]);
  });

  it('has an empty palette, because everything is on the launcher', () => {
    expect(resolveLauncher(inputs([content, logs]), { pinned: [] }).palette).to.deep.equal([]);
  });
});

describe('with a stored layout', () => {
  it("draws the user's groups in the user's order", () => {
    const layout = {
      groups: [
        { id: 'custom-1', label: 'Daily', apps: ['logs', 'content'] },
        { id: 'editing', label: null, apps: ['media'] },
      ],
      removed: [],
      deletedGroups: ['diagnostics'],
    };
    const view = resolveLauncher(inputs([content, media, logs]), { pinned: [], layout });
    expect(shape(view)).to.deep.equal([
      ['custom-1', ['logs', 'content']],
      ['editing', ['media']],
    ]);
    expect(view.groups[0].label).to.deep.equal({ text: 'Daily', translate: false });
    expect(view.groups[0].custom).to.equal(true);
    expect(view.groups[1].label).to.deep.equal({ text: '#g_editing', translate: true });
  });

  it('skips an app this user cannot open, keeps it stored, and shows it in place when it returns', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['content', 'media'] }], removed: [], deletedGroups: [] };
    const without = { pinned: [], layout };
    expect(shape(resolveLauncher(inputs([media]), without))).to.deep.equal([['editing', ['media']]]);
    expect(effectiveLayout(inputs([media]), without).groups[0].apps).to.deep.equal(['content', 'media']);
    expect(shape(resolveLauncher(inputs([content, media]), without))).to.deep.equal([['editing', ['content', 'media']]]);
  });

  it('appends a new app to the end of its catalogue group (D3)', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] };
    const view = resolveLauncher(inputs([content, media]), { pinned: [], layout });
    expect(shape(view)).to.deep.equal([['editing', ['media', 'content']]]);
  });

  it("puts a new package group directly after the nearest catalogue group before it that the user still has", () => {
    const layout = {
      groups: [
        { id: 'system', label: null, apps: ['settings'] },
        { id: 'custom-1', label: 'Mine', apps: [] },
        { id: 'editing', label: null, apps: ['content'] },
      ],
      removed: [],
      deletedGroups: [],
    };
    const view = resolveLauncher(inputs([content, logs, settings]), { pinned: [], layout });
    expect(view.groups.map((g) => g.id)).to.deep.equal(['system', 'custom-1', 'editing', 'diagnostics']);
  });

  it('puts a new group first when no catalogue group before it is on the launcher', () => {
    const layout = { groups: [{ id: 'system', label: null, apps: ['settings'] }], removed: [], deletedGroups: [] };
    const view = resolveLauncher(inputs([content, settings]), { pinned: [], layout });
    expect(view.groups.map((g) => g.id)).to.deep.equal(['editing', 'system']);
  });

  it("keeps a deleted group's new apps in the palette instead of bringing the group back", () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['content'] }], removed: [], deletedGroups: ['diagnostics'] };
    const view = resolveLauncher(inputs([content, logs]), { pinned: [], layout });
    expect(view.groups.map((g) => g.id)).to.deep.equal(['editing']);
    expect(view.palette.map((p) => [p.group.alias, p.apps.map((a) => a.alias), p.onLauncher])).to.deep.equal([
      ['diagnostics', ['logs'], false],
    ]);
  });

  it('keeps a removed app off the launcher and in the palette, marked as belonging to a group that is there', () => {
    const layout = { groups: [{ id: 'diagnostics', label: null, apps: ['logs'] }], removed: ['profiling'], deletedGroups: [] };
    const view = resolveLauncher(inputs([logs, profiling]), { pinned: [], layout });
    expect(shape(view)).to.deep.equal([['diagnostics', ['logs']]]);
    expect(view.palette.map((p) => [p.group.alias, p.apps.map((a) => a.alias), p.onLauncher])).to.deep.equal([
      ['diagnostics', ['profiling'], true],
    ]);
  });

  it('returns an unpinned app with nowhere else to go to its catalogue group', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] };
    // Pinned, content is not stored in the layout at all: it is excluded from every group.
    const arranged = { pinned: ['content'], layout };
    expect(shape(resolveLauncher(inputs([content, media]), arranged))).to.deep.equal([['editing', ['media']]]);
    // Unpinned, it has nowhere stored to go, so it lands at the end of its own catalogue group.
    expect(shape(resolveLauncher(inputs([content, media]), { pinned: [], layout }))).to.deep.equal([
      ['editing', ['media', 'content']],
    ]);
  });

  it('is idempotent: feeding its own output back in as the stored layout changes nothing', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['content'] }], removed: ['profiling'], deletedGroups: [] };
    const apps = [content, media, logs, profiling];
    const once = effectiveLayout(inputs(apps), { pinned: [], layout });
    const twice = effectiveLayout(inputs(apps), { pinned: [], layout: once });
    expect(twice).to.deep.equal(once);
  });

  it('shows an app listed twice only where it first appears', () => {
    const layout = {
      groups: [
        { id: 'editing', label: null, apps: ['content'] },
        { id: 'custom-1', label: 'Again', apps: ['content'] },
      ],
      removed: [],
      deletedGroups: [],
    };
    expect(shape(resolveLauncher(inputs([content]), { pinned: [], layout }))).to.deep.equal([
      ['editing', ['content']],
      ['custom-1', []],
    ]);
  });

  it("follows a section's fallback alias to the app that now covers the section", () => {
    const pkg = { ...app('pkg-app', 'system'), coversSection: 'Pkg.Section' };
    const layout = { groups: [{ id: 'custom-1', label: 'Mine', apps: ['section:Pkg.Section'] }], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([pkg]), { pinned: [], layout }))).to.deep.equal([['custom-1', ['pkg-app']]]);
  });

  it('keeps empty groups in the view, so arrange mode can draw them as drop targets', () => {
    const layout = { groups: [{ id: 'custom-1', label: 'Empty', apps: [] }], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([]), { pinned: [], layout }))).to.deep.equal([['custom-1', []]]);
  });

  it('files an app with no known group under More', () => {
    const stray = app('stray');
    const layout = { groups: [], removed: [], deletedGroups: [] };
    expect(shape(resolveLauncher(inputs([stray]), { pinned: [], layout }))).to.deep.equal([
      [UMBRADESKTOP_MORE_GROUP_ALIAS, ['stray']],
    ]);
  });

  it('never changes the stored layout it is given', () => {
    const layout = { groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] };
    resolveLauncher(inputs([content, media, logs]), { pinned: [], layout });
    expect(layout).to.deep.equal({ groups: [{ id: 'editing', label: null, apps: ['media'] }], removed: [], deletedGroups: [] });
  });
});
