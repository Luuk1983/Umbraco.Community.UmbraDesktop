import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import './hub.element.js';
import { arcadeHarness } from './harness.test-helper.js';

const games = [
  { alias: 'Pkg.Minesweeper.Game', app: 'Pkg.Minesweeper', label: 'Minesweeper', icon: 'icon-bomb', weight: 1000, leaderboards: [{ alias: 'easy', label: 'Easy', better: 'lower' as const, format: 'time' as const }] },
  { alias: 'Pkg.Solitaire.Game', app: 'Pkg.Solitaire', label: 'Solitaire', icon: 'icon-playing-cards', weight: 800, leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] },
];
const empty = { played: false, top: [], viewer: null, viewerIsPublic: false, canModerate: false };

it('has a tab per game plus Profile, and shows the first game by default', async () => {
  const { wrapper } = await arcadeHarness({ games, board: empty });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('uui-tab').length === 3, 'tabs');
  expect(el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board')).to.have.length(1);
});

it('shows every board of the selected game side by side', async () => {
  const { wrapper } = await arcadeHarness({ games, board: empty });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('uui-tab').length === 3, 'tabs');
  (el.shadowRoot!.querySelectorAll('uui-tab')[1] as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board').length === 2, 'two boards');
});

it('opens the game from Play', async () => {
  const { wrapper, calls } = await arcadeHarness({ games, board: empty });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('[data-action="play"]'), 'play');
  (el.shadowRoot!.querySelector('[data-action="play"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('open:Pkg.Minesweeper'), JSON.stringify(calls));
});

it('keeps the tab strip short and gives the body the rest of a fixed-size window', async () => {
  const { wrapper } = await arcadeHarness({ games, board: empty });
  const el = await fixture(html`<umbradesktop-arcade-hub style="width:600px;height:540px"></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelectorAll('uui-tab').length === 3, 'tabs');
  await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-arcade-board'), 'board');
  const tabs = el.shadowRoot!.querySelector('uui-tab-group')!.getBoundingClientRect().height;
  const body = el.shadowRoot!.querySelector('.body')!.getBoundingClientRect().height;
  expect(tabs, 'tab group height').to.be.lessThan(120);
  expect(body, 'body height').to.be.greaterThan(300);
});

it('fetches a board once when the hub opens', async () => {
  const { wrapper, calls } = await arcadeHarness({ games, board: empty });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-arcade-board'), 'board');
  await new Promise((r) => setTimeout(r, 100));
  expect(calls.filter((c) => c.startsWith('getBoard'))).to.deep.equal(['getBoard:Pkg.Minesweeper.Game:easy']);
});

it('does not repeat the game name as a board heading when the game has one board', async () => {
  const played = { played: true, top: [{ rank: 1, userKey: 'k1', displayName: 'Ada', value: 5000, achievedAtUtc: '2026-10-01T09:00:00Z', isViewer: false }], viewer: null, viewerIsPublic: true, canModerate: false };
  const { wrapper } = await arcadeHarness({ games, board: played });
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`, { parentNode: wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('umbradesktop-arcade-board'), 'board');
  const board = el.shadowRoot!.querySelector('umbradesktop-arcade-board')!;
  await waitUntil(() => board.shadowRoot!.querySelector('table'), 'table');
  expect(board.shadowRoot!.querySelector('h3') !== null, 'a separate board heading').to.equal(false);
  expect(board.shadowRoot!.querySelector('table')!.getAttribute('aria-label')).to.equal('Easy');
  (el.shadowRoot!.querySelectorAll('uui-tab')[1] as HTMLElement).click();
  await waitUntil(() => el.shadowRoot!.querySelectorAll('umbradesktop-arcade-board').length === 2, 'two boards');
  const first = el.shadowRoot!.querySelector('umbradesktop-arcade-board')!;
  await waitUntil(() => first.shadowRoot!.querySelector('h3'), 'heading with several boards');
});

it('says it needs the desktop when there is no Arcade context', async () => {
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`);
  await waitUntil(() => el.shadowRoot!.querySelector('.missing'), 'message');
});
