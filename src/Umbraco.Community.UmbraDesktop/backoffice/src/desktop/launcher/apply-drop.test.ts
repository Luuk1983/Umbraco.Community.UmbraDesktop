import { expect } from '@open-wc/testing';
import { applyAppDrop, applyGroupDrop } from './apply-drop';
import { resolveLauncher } from './resolve-launcher';
import type { UmbraDesktopLauncherArrangement, UmbraDesktopLauncherInputs } from './resolve-launcher';
import { UMBRADESKTOP_PINNED_GROUP_ID } from '../constants';
import type { UmbraDesktopApp, UmbraDesktopGroup } from '../types';

/** Two catalogue groups, so a drop can move an app from one group into another. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: 'E', weight: 10 },
  { alias: 'diagnostics', label: 'D', weight: 40 },
];

/**
 * A stand-in app.
 * @param alias The alias.
 * @param group Its group.
 * @param weight Its weight.
 * @returns The app.
 */
const app = (alias: string, group: string, weight: number): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon: 'icon-box',
  content: { kind: 'iframe', url: '/x' },
  chromeProfile: 'bare',
  group,
  weight,
});
/** Editing's first app. */
const content = app('content', 'editing', 10);
/** Editing's second app, so Editing has a tile to drop before and one to drop after. */
const media = app('media', 'editing', 20);
/** Diagnostics' only app, the one moved across in most cases. */
const logs = app('logs', 'diagnostics', 10);
/** The catalogue every case drops into. */
const INPUTS: UmbraDesktopLauncherInputs = { apps: [content, media, logs], catalogueGroups: GROUPS };
/** A launcher nobody has arranged or pinned anything on. */
const UNTOUCHED: UmbraDesktopLauncherArrangement = { pinned: [] };

/**
 * The launcher an arrangement draws.
 * @param a The arrangement.
 * @returns `[id, aliases]` pairs.
 */
const drawn = (a: UmbraDesktopLauncherArrangement) =>
  resolveLauncher(INPUTS, a).groups.map((g) => [g.id, g.apps.map((x) => x.alias)]);

it('drops before a tile, or after it by which half the pointer is over', () => {
  const before = applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'tile', groupId: 'editing', alias: 'media', after: false })!;
  expect(drawn(before)[0]).to.deep.equal(['editing', ['content', 'logs', 'media']]);
  const after = applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'tile', groupId: 'editing', alias: 'media', after: true })!;
  expect(drawn(after)[0]).to.deep.equal(['editing', ['content', 'media', 'logs']]);
});

it('appends when dropped on a group card', () => {
  const result = applyAppDrop(INPUTS, UNTOUCHED, content, { kind: 'group', groupId: 'diagnostics', after: false })!;
  expect(drawn(result)[1]).to.deep.equal(['diagnostics', ['logs', 'content']]);
});

it('pins when dropped on Pinned or on a pinned tile', () => {
  const onCard = applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'group', groupId: UMBRADESKTOP_PINNED_GROUP_ID, after: false })!;
  expect(onCard.pinned).to.deep.equal(['logs']);
  const onTile = applyAppDrop(INPUTS, { pinned: ['content'] }, logs, {
    kind: 'tile',
    groupId: UMBRADESKTOP_PINNED_GROUP_ID,
    alias: 'content',
    after: false,
  })!;
  expect(onTile.pinned).to.deep.equal(['logs', 'content']);
});

it('removes when dropped on the remove pane or the palette', () => {
  expect(applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'remove' })!.layout?.removed).to.deep.equal(['logs']);
  expect(applyAppDrop(INPUTS, UNTOUCHED, logs, { kind: 'palette' })!.layout?.removed).to.deep.equal(['logs']);
});

it('does nothing when a tile is dropped on itself', () => {
  expect(applyAppDrop(INPUTS, UNTOUCHED, media, { kind: 'tile', groupId: 'editing', alias: 'media', after: false })).to.equal(undefined);
});

it('moves a group before or after the group it is dropped on, and ignores anything else', () => {
  const result = applyGroupDrop(INPUTS, UNTOUCHED, 'diagnostics', { kind: 'group', groupId: 'editing', after: false })!;
  expect(drawn(result).map(([id]) => id)).to.deep.equal(['diagnostics', 'editing']);
  expect(applyGroupDrop(INPUTS, UNTOUCHED, 'editing', { kind: 'group', groupId: 'editing', after: true })).to.equal(undefined);
  expect(applyGroupDrop(INPUTS, UNTOUCHED, 'editing', { kind: 'remove' })).to.equal(undefined);
});
