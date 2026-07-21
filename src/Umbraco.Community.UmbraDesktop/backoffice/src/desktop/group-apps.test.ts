import { expect } from '@open-wc/testing';
import { groupApps } from './group-apps';
import { UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS } from './constants';
import type { UmbraDesktopApp, UmbraDesktopCategory, UmbraDesktopGroup } from './types';

function app(over: Partial<UmbraDesktopApp> = {}): UmbraDesktopApp {
  return {
    alias: 'a', name: 'A', icon: 'icon', url: '/x', chromeProfile: 'full-section',
    categoryAlias: 'settings', confidence: 'certified', ...over,
  };
}

const categories: UmbraDesktopCategory[] = [
  { alias: 'content', label: 'Content', weight: 10 },
  { alias: 'settings', label: 'Settings', weight: 20 },
];
const groups: UmbraDesktopGroup[] = [
  { alias: 'diagnostics', label: 'Diagnostics', categoryAlias: 'settings', weight: 10 },
];

it('places apps under their category header', () => {
  const tree = groupApps([app({ alias: 'c', categoryAlias: 'content' })], categories, groups);
  const content = tree.find((c) => c.category.alias === 'content')!;
  expect(content.apps.map((a) => a.alias)).to.deep.equal(['c']);
});

it('drops categories with no apps', () => {
  const tree = groupApps([app({ categoryAlias: 'settings' })], categories, groups);
  expect(tree.some((c) => c.category.alias === 'content')).to.be.false;
});

it('separates loose apps from grouped apps', () => {
  const tree = groupApps(
    [app({ alias: 'loose' }), app({ alias: 'grouped', groupAlias: 'diagnostics' })],
    categories,
    groups,
  );
  const settings = tree.find((c) => c.category.alias === 'settings')!;
  expect(settings.apps.map((a) => a.alias)).to.deep.equal(['loose']);
  expect(settings.groups[0].apps.map((a) => a.alias)).to.deep.equal(['grouped']);
});

it('treats an app whose groupAlias has no matching group as loose', () => {
  const tree = groupApps([app({ alias: 'x', groupAlias: 'nope' })], categories, groups);
  const settings = tree.find((c) => c.category.alias === 'settings')!;
  expect(settings.apps.map((a) => a.alias)).to.deep.equal(['x']);
});

it('sorts categories by weight ascending', () => {
  const tree = groupApps(
    [app({ alias: 'c', categoryAlias: 'content' }), app({ alias: 's', categoryAlias: 'settings' })],
    categories,
    groups,
  );
  expect(tree.map((c) => c.category.alias)).to.deep.equal(['content', 'settings']);
});

it('sorts apps within a category by weight then name', () => {
  const tree = groupApps(
    [
      app({ alias: 'b', name: 'Bravo', weight: 20 }),
      app({ alias: 'a', name: 'Alpha', weight: 10 }),
      app({ alias: 'c', name: 'Charlie', weight: 10 }),
    ],
    categories,
    groups,
  );
  const settings = tree.find((c) => c.category.alias === 'settings')!;
  expect(settings.apps.map((a) => a.alias)).to.deep.equal(['a', 'c', 'b']);
});

it('synthesizes the reserved "More" category and orders it last', () => {
  const tree = groupApps(
    [
      app({ alias: 'more', categoryAlias: UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS, confidence: 'uncertified' }),
      app({ alias: 's', categoryAlias: 'settings' }),
    ],
    categories,
    groups,
  );
  expect(tree[tree.length - 1].category.alias).to.equal(UMBRADESKTOP_UNCERTIFIED_CATEGORY_ALIAS);
  expect(tree[tree.length - 1].category.label).to.equal('More');
});
