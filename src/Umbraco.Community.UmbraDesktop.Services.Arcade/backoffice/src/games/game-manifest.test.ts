import { expect } from '@open-wc/testing';
import { normaliseGames } from './game-manifest.js';

/** A valid Minesweeper manifest, to vary. */
const minesweeper = {
  type: 'umbraDesktopGame',
  alias: 'Pkg.Minesweeper.Game',
  name: 'Minesweeper scores',
  meta: {
    app: 'Pkg.Minesweeper',
    label: 'Minesweeper',
    icon: 'icon-bomb',
    leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower', format: 'time' }],
  },
};

it('reads a valid game', () => {
  const { games, dropped } = normaliseGames([minesweeper]);
  expect(dropped).to.deep.equal([]);
  expect(games).to.deep.equal([
    {
      alias: 'Pkg.Minesweeper.Game',
      app: 'Pkg.Minesweeper',
      label: 'Minesweeper',
      icon: 'icon-bomb',
      weight: 0,
      leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower', format: 'time', min: undefined, max: undefined }],
    },
  ]);
});

it('drops, never throws on, malformed manifests, and says why', () => {
  const broken = [
    { ...minesweeper, alias: 'A', meta: undefined },
    { ...minesweeper, alias: 'B', meta: { ...minesweeper.meta, app: '' } },
    { ...minesweeper, alias: 'C', meta: { ...minesweeper.meta, leaderboards: [] } },
    { ...minesweeper, alias: 'D', meta: { ...minesweeper.meta, leaderboards: [{ alias: 'Easy Board', label: 'x', better: 'lower', format: 'time' }] } },
    { ...minesweeper, alias: 'E', meta: { ...minesweeper.meta, leaderboards: [{ alias: 'easy', label: 'x', better: 'sideways', format: 'time' }] } },
    { ...minesweeper, alias: 'F', meta: { ...minesweeper.meta, leaderboards: [minesweeper.meta.leaderboards[0], minesweeper.meta.leaderboards[0]] } },
    { ...minesweeper, alias: 'G', meta: { ...minesweeper.meta, leaderboards: [{ alias: 'e'.repeat(65), label: 'x', better: 'lower', format: 'time' }] } },
    { ...minesweeper, alias: 'Pkg Minesweeper' },
    { ...minesweeper, alias: 'P'.repeat(201) },
    null,
    'nonsense',
  ];
  const { games, dropped } = normaliseGames(broken);
  expect(games).to.deep.equal([]);
  expect(dropped.map((d) => d.alias)).to.deep.equal(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'Pkg Minesweeper', 'P'.repeat(201), '(no alias)', '(no alias)']);
});

it('orders games by manifest weight, higher first, as Umbraco does', () => {
  const snake = { ...minesweeper, alias: 'Pkg.Snake.Game', weight: 900, meta: { ...minesweeper.meta, app: 'Pkg.Snake' } };
  const { games } = normaliseGames([{ ...minesweeper, weight: 1000 }, snake].reverse());
  expect(games.map((g) => g.alias)).to.deep.equal(['Pkg.Minesweeper.Game', 'Pkg.Snake.Game']);
});
