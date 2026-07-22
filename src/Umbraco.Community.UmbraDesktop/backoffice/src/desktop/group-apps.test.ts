import { expect } from '@open-wc/testing';
import { groupApps } from './group-apps';
import { UMBRADESKTOP_MORE_GROUP_ALIAS } from './constants';
import type { UmbraDesktopApp, UmbraDesktopGroup } from './types';

const groups: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#g_editing', weight: 10 },
  { alias: 'diagnostics', label: '#g_diagnostics', weight: 20 },
];
function app(alias: string, over: Partial<UmbraDesktopApp> = {}): UmbraDesktopApp {
  return { alias, name: `#a_${alias}`, icon: 'icon-box', url: '/x', chromeProfile: 'bare', ...over };
}

it('groups apps by their group alias, sorted by group weight', () => {
  const result = groupApps(
    [app('logs', { group: 'diagnostics', weight: 10 }), app('content', { group: 'editing', weight: 10 })],
    groups,
  );
  expect(result.map((g) => g.group.alias)).to.deep.equal(['editing', 'diagnostics']);
});

it('sorts apps within a group by weight then name token', () => {
  const result = groupApps(
    [app('b', { group: 'editing', weight: 20 }), app('a', { group: 'editing', weight: 10 })],
    groups,
  );
  expect(result[0].apps.map((a) => a.alias)).to.deep.equal(['a', 'b']);
});

it('routes apps with no/unknown group into the reserved More group, always last', () => {
  const result = groupApps(
    [app('x', { group: 'editing', weight: 10 }), app('y'), app('z', { group: 'nope' })],
    groups,
  );
  const last = result[result.length - 1];
  expect(last.group.alias).to.equal(UMBRADESKTOP_MORE_GROUP_ALIAS);
  expect(last.group.auto).to.equal(true);
  expect(last.apps.map((a) => a.alias).sort()).to.deep.equal(['y', 'z']);
});

it('drops empty groups', () => {
  const result = groupApps([app('content', { group: 'editing' })], groups);
  expect(result.map((g) => g.group.alias)).to.deep.equal(['editing']);
});
