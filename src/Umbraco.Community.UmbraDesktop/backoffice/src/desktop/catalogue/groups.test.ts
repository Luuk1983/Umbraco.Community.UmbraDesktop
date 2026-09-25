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

it('sorts games after every other finished group', () => {
  const games = groups.find((g) => g.alias === 'games')!;
  // Experimental is excluded rather than compared: it is a holding pen between the finished groups
  // and the reserved "More", not a peer of them, and the assertion below is what pins it down.
  const others = groups.filter((g) => g.alias !== 'games' && g.alias !== 'experimental');
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

/**
 * Experimental sits between Games and the reserved "More".
 *
 * Both halves matter and neither is visible to the loop above. After Games, because an app that is
 * still working out what it should be is further from what anybody came here for than a game is.
 * Before "More", because "More" is the bucket for apps nobody curated at all, and a group this
 * repository deliberately created should not sort behind it.
 */
it('sorts experimental after games and before the reserved More group', () => {
  const games = groups.find((g) => g.alias === 'games')!;
  const experimental = groups.find((g) => g.alias === 'experimental')!;

  expect(experimental.weight!).to.be.greaterThan(games.weight!);
  expect(experimental.weight!).to.be.lessThan(UMBRADESKTOP_MORE_GROUP_WEIGHT);
});

/**
 * `accessories` is the second group the host owns and leaves empty, on the same contract as
 * `games`: the Accessories package names this alias from its own manifests (Notepad, Paint,
 * Calculator, Clock), and nothing here knows which tools exist.
 */
it('declares an accessories group whose label is a loc token', () => {
  const accessories = groups.find((g) => g.alias === 'accessories');
  expect(accessories, 'the accessories group must exist for registered tools to land in').to.not.be
    .undefined;
  expect(accessories!.label).to.equal('#umbraDesktop_groupAccessories');
});

/**
 * After System and directly before Games, which is where Windows filed both: Start > Programs >
 * Accessories held the small tools, and Games was a folder inside it. A tool is closer to what an
 * editor came for than a game is, so it sorts first of the two, and it is further from it than the
 * administrative plumbing System holds.
 */
it('sorts accessories after system and before games', () => {
  const accessories = groups.find((g) => g.alias === 'accessories')!;
  const system = groups.find((g) => g.alias === 'system')!;
  const games = groups.find((g) => g.alias === 'games')!;

  expect(accessories.weight!).to.be.greaterThan(system.weight!);
  expect(accessories.weight!).to.be.lessThan(games.weight!);
});
