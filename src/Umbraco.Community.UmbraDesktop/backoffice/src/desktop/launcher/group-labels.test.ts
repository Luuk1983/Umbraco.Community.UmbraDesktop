import { expect } from '@open-wc/testing';
import { groupLabel } from './group-labels';
import { UMBRADESKTOP_MORE_GROUP_ALIAS, UMBRADESKTOP_MORE_GROUP_LABEL } from '../constants';
import type { UmbraDesktopGroup } from '../types';

/** The catalogue groups these cases name against, one curated and one from a package. */
const GROUPS: UmbraDesktopGroup[] = [
  { alias: 'editing', label: '#umbraDesktop_groupEditing', weight: 10 },
  { alias: 'games', label: 'Games', weight: 60 },
];

it("translates a catalogue group's label when the user has not renamed it", () => {
  expect(groupLabel('editing', null, GROUPS)).to.deep.equal({ text: '#umbraDesktop_groupEditing', translate: true });
});

it('names a group a package brought, not only the curated ones', () => {
  expect(groupLabel('games', null, GROUPS)).to.deep.equal({ text: 'Games', translate: true });
});

it('names the reserved More group', () => {
  expect(groupLabel(UMBRADESKTOP_MORE_GROUP_ALIAS, null, GROUPS)).to.deep.equal({
    text: UMBRADESKTOP_MORE_GROUP_LABEL,
    translate: true,
  });
});

it("shows the user's own text as it is, never through the translator", () => {
  expect(groupLabel('editing', '#not a token', GROUPS)).to.deep.equal({ text: '#not a token', translate: false });
});

it('falls back to the id for a group nobody knows any more', () => {
  expect(groupLabel('uninstalled', null, GROUPS)).to.deep.equal({ text: 'uninstalled', translate: false });
});
