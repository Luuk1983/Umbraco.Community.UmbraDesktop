import { expect } from '@open-wc/testing';
import { groups } from './groups';
import { UMBRADESKTOP_MORE_GROUP_WEIGHT } from '../constants';

/**
 * The `games` group is a curated label in the host, not a list of games: the entertainment package
 * names this alias from its own manifests, and nothing here knows which games exist. That is what
 * keeps the two packages' releases independent of each other's contents.
 */
it('declares a games group whose label is the existing loc token', () => {
  const games = groups.find((g) => g.alias === 'games');
  expect(games, 'the games group must exist for registered game apps to land in').to.not.be
    .undefined;
  expect(games!.label).to.equal('#umbraDesktop_groupGames');
});

it('sorts games after every other curated group', () => {
  const games = groups.find((g) => g.alias === 'games')!;
  const others = groups.filter((g) => g.alias !== 'games');
  for (const group of others) {
    expect(
      games.weight!,
      `games must sort after ${group.alias} (it is the last thing an editor is looking for)`,
    ).to.be.greaterThan(group.weight!);
  }
});

/**
 * And before the reserved "More" group, which is the one ordering fact the loop above cannot see.
 *
 * "More" is not in this array at all: `group-apps.ts` synthesises it from
 * {@link UMBRADESKTOP_MORE_GROUP_WEIGHT} and appends it, so a comparison against the members of
 * `groups` is silent about the only neighbour Games has on that side. Games sorting after "More"
 * would put the curated group behind the bucket for everything uncurated, which reads as a bug in
 * the launcher rather than a weight nobody checked. There is plenty of headroom today (60 against
 * 9999) and that is exactly the reason to assert it: an unchecked fact held true only by a manual
 * comparison is the one that drifts.
 */
it('sorts games before the reserved More group, which is not in this array', () => {
  const games = groups.find((g) => g.alias === 'games')!;
  expect(
    games.weight!,
    'games is a curated group and must not sort behind the bucket for uncurated apps',
  ).to.be.lessThan(UMBRADESKTOP_MORE_GROUP_WEIGHT);
});

it('gives every group a unique alias and a token label', () => {
  const aliases = groups.map((g) => g.alias);
  expect(new Set(aliases).size).to.equal(aliases.length);
  for (const group of groups) {
    expect(group.label, `${group.alias} must use a loc token`).to.match(/^#/);
  }
});

/**
 * `group-apps.ts` sorts with `group.weight ?? 0`: a group whose `weight` is left unset does not
 * error, it silently sorts first, ahead of every curated group. The two tests above already
 * dereference `weight!` as if it were guaranteed, so this makes that guarantee an explicit,
 * checked one rather than an assumption borrowed from the non-null assertions.
 */
it('gives every group a weight, so none of them silently sort first', () => {
  for (const group of groups) {
    expect(group.weight, `${group.alias} must declare a weight`).to.not.be.undefined;
  }
});
