import { expect } from '@open-wc/testing';
import { inferUrl } from './url-inference';

it('infers a section URL from its pathname', () => {
  expect(inferUrl({ type: 'section', pathname: 'content' })).to.equal('/umbraco/section/content');
});

it('returns null for a section with no pathname', () => {
  expect(inferUrl({ type: 'section' })).to.equal(null);
});

it('infers a dashboard URL from section + dashboard pathname', () => {
  expect(
    inferUrl({ type: 'dashboard', sectionPathname: 'settings', pathname: 'welcome' }),
  ).to.equal('/umbraco/section/settings/dashboard/welcome');
});

it('returns null for a dashboard missing its section pathname', () => {
  expect(inferUrl({ type: 'dashboard', pathname: 'welcome' })).to.equal(null);
});

it('infers a default menu-item workspace URL from section + entityType', () => {
  expect(
    inferUrl({ type: 'menuItem', sectionPathname: 'settings', entityType: 'logviewer' }),
  ).to.equal('/umbraco/section/settings/workspace/logviewer');
});

it('treats an explicit "default" kind as navigable', () => {
  expect(
    inferUrl({ type: 'menuItem', kind: 'default', sectionPathname: 'settings', entityType: 'logviewer' }),
  ).to.equal('/umbraco/section/settings/workspace/logviewer');
});

it('returns null for non-default menu-item kinds (tree/link/action)', () => {
  for (const kind of ['tree', 'link', 'action']) {
    expect(
      inferUrl({ type: 'menuItem', kind, sectionPathname: 'settings', entityType: 'logviewer' }),
    ).to.equal(null);
  }
});

it('returns null for a menu item missing its entityType', () => {
  expect(inferUrl({ type: 'menuItem', sectionPathname: 'settings' })).to.equal(null);
});
