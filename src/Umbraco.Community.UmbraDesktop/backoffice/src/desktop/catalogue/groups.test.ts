import { expect } from '@open-wc/testing';
import { groups } from './groups';
import { UMBRADESKTOP_MORE_GROUP_WEIGHT } from '../constants';

it('gives every group a unique alias and a token label', () => {
  const aliases = groups.map((g) => g.alias);
  expect(new Set(aliases).size).to.equal(aliases.length);
  for (const group of groups) {
    expect(group.label, `${group.alias} must use a loc token`).to.match(/^#/);
  }
});

/**
 * `group-apps.ts` sorts with `group.weight ?? 0`: a group whose `weight` is left unset does not
 * error, it silently sorts first, ahead of every curated group. The ordering case below dereferences
 * `weight!` as if it were guaranteed, so this makes that guarantee an explicit, checked one rather
 * than an assumption borrowed from the non-null assertions. The weights are also published, so
 * packages can place their own groups among ours (package catalogues design D11).
 */
it('gives every group a weight, so none of them silently sort first', () => {
  for (const group of groups) {
    expect(group.weight, `${group.alias} must declare a weight`).to.not.be.undefined;
  }
});

/**
 * Experimental is the last real group, immediately before the reserved "More": after everything this
 * repository ships, because an app still working out what it should be is furthest from what anybody
 * came for, and before "More", the bucket for apps nobody curated. Games used to sit between the two;
 * it belongs to the Entertainment package now, which places it at 60 (package catalogues design D10).
 *
 * "More" is not in this array at all: `group-apps.ts` synthesises it from
 * {@link UMBRADESKTOP_MORE_GROUP_WEIGHT} and appends it, which is why that half is asserted against
 * the constant rather than against a member of `groups`.
 */
it('sorts experimental after every other group and before the reserved More group', () => {
  const experimental = groups.find((g) => g.alias === 'experimental')!;
  for (const group of groups.filter((g) => g.alias !== 'experimental')) {
    expect(experimental.weight!, `experimental must sort after ${group.alias}`).to.be.greaterThan(group.weight!);
  }
  expect(experimental.weight!).to.be.lessThan(UMBRADESKTOP_MORE_GROUP_WEIGHT);
});

/** The host no longer defines a group for another package's apps (package catalogues design D10). */
it('does not define a games group of its own', () => {
  expect(groups.map((g) => g.alias)).to.not.contain('games');
});

/**
 * These weights are published (package catalogues design D11): a package places its own group among
 * ours by number, and `docs/developer/package-catalogues.md` §4 prints this table. Renumbering one is a
 * breaking change for somebody else's package, so this is where it has to be a decision.
 */
it('keeps the published group weights', () => {
  expect(Object.fromEntries(groups.map((g) => [g.alias, g.weight]))).to.deep.equal({
    editing: 10,
    workflow: 12,
    'marketing-sales': 15,
    development: 20,
    synchronisation: 25,
    security: 30,
    'advanced-security': 35,
    diagnostics: 40,
    automation: 43,
    ai: 45,
    system: 50,
    experimental: 70,
  });
});
