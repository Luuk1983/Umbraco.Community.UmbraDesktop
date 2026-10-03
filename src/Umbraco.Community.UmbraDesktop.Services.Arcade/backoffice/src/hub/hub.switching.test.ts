import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './hub.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const games = [
  { alias: 'Pkg.Minesweeper.Game', app: 'Pkg.Minesweeper', label: 'Minesweeper', icon: 'icon-bomb', weight: 1000, leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower' as const, format: 'time' as const }] },
  { alias: 'Pkg.Solitaire.Game', app: 'Pkg.Solitaire', label: 'Solitaire', icon: 'icon-playing-cards', weight: 800, leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] },
];

it('shows the other game\'s scores and asks for its alias after switching tabs', async () => {
  const boardFor = (g: string, b: string) => ({ played: true, top: [{ rank: 1, userKey: 'k1', displayName: `${g}/${b}`, value: 5, achievedAtUtc: '2026-10-01T09:00:00Z', isViewer: false }], viewer: null, viewerIsPublic: true, canModerate: true });
  const { wrapper, calls } = await arcadeHarness({ games, boardFor });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-arcade-board')?.shadowRoot?.textContent?.includes('Pkg.Minesweeper.Game/easy'), 'first game drawn');
  (el.shadowRoot!.querySelectorAll('uui-tab')[1] as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board').length === 2, 'two boards');
  const boards = [...el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board')];
  await waitUntil(() => boards.every((b) => b.shadowRoot?.textContent?.includes('Pkg.Solitaire.Game')), 'second game drawn');
  expect(calls).to.include('getBoard:Pkg.Solitaire.Game:draw-1').and.include('getBoard:Pkg.Solitaire.Game:draw-3');
  expect(boards[0].shadowRoot!.textContent).to.not.contain('Minesweeper');
});
