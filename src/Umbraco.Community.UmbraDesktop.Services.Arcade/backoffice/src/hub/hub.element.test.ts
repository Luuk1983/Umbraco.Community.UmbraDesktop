import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import type { ArcadeBoardEntry, ArcadeOverview } from '../api/arcade-api.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './hub.element.js';

const time = { better: 'lower' as const, format: 'time' as const };
const points = { better: 'higher' as const, format: 'points' as const };
const games = [
  { alias: 'Pkg.Mines.Game', app: 'Pkg.Mines', label: 'Minesweeper', icon: 'icon-bomb', weight: 1000, leaderboards: [{ alias: 'easy', label: 'Beginner', ...time }] },
  { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 900, leaderboards: [{ alias: 'default', label: 'Classic', ...points }] },
  { alias: 'Pkg.Sol.Game', app: 'Pkg.Sol', label: 'Solitaire', icon: 'icon-playing-cards', weight: 800, rule: 'Highest score wins, time bonus included', leaderboards: [{ alias: 'draw-1', label: 'Draw 1', ...points }, { alias: 'draw-3', label: 'Draw 3', ...points }] },
];
/** A board row for the overview's fixture. */
const e = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
/** The viewer's own row. */
const me = (rank: number, value: number) => e(rank, 'Luuk Peters', value, true);
const overview: ArcadeOverview = {
  colleagues: 12,
  boards: [
    { game: 'Pkg.Mines.Game', board: 'easy', players: 12, viewer: me(3, 38_100), leader: e(1, 'Anna', 31_800), next: e(2, 'Bram', 35_000) },
    { game: 'Pkg.Snake.Game', board: 'default', players: 9, viewer: me(1, 480), leader: me(1, 480), next: e(2, 'Bram', 450) },
    { game: 'Pkg.Sol.Game', board: 'draw-1', players: 9, viewer: me(2, 4_910), leader: e(1, 'Sophie', 5_880), next: me(2, 4_910) },
    { game: 'Pkg.Sol.Game', board: 'draw-3', players: 5, viewer: null, leader: e(1, 'Tom', 3_960), next: e(2, 'Sophie', 3_710) },
    { game: 'Pkg.Gone.Game', board: 'x', players: 1, viewer: me(1, 10), leader: me(1, 10), next: null },
  ],
};
const empty = { played: false, top: [], viewer: null, viewerIsPublic: true, canModerate: false, players: 0, above: null };
const profile = { displayName: 'Luuk Peters', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };

/**
 * Wait for something to appear and hand it back. `waitUntil` resolves with nothing, whatever its
 * predicate returned, so a test that wants the element it waited for asks again once it is there.
 * @param query Finds the thing, or null while it is not there yet.
 * @param message What timed out.
 * @returns The thing.
 */
async function found<T>(query: () => T | null | undefined, message: string): Promise<T> {
  await waitUntil(() => query(), message);
  return query()!;
}

/** The hub under a fake Arcade, and its overview once loaded. */
async function hub(extra: Parameters<typeof arcadeHarness>[0] = {}) {
  const harness = await arcadeHarness({ games, overview, board: empty, profile, ...extra });
  const el = await fixture(html`<umbradesktop-arcade-hub style="width:820px;height:580px"></umbradesktop-arcade-hub>`, { parentNode: harness.wrapper });
  return { el, root: el.shadowRoot!, ...harness };
}

/**
 * The overview's shadow root, once its tiles are drawn. The overview is the element that localizes,
 * so the language is pinned on it: the localizer reads its host's own `lang`, never an ancestor's,
 * and this machine's browser may not be English, which would write "38,1" for 38.1.
 */
async function overviewOf(root: ShadowRoot) {
  const view = await found(() => root.querySelector('umbradesktop-arcade-overview'), 'overview');
  view.lang = 'en';
  view.requestUpdate();
  await view.updateComplete;
  await waitUntil(() => view.shadowRoot!.querySelectorAll('.tile').length > 0, 'tiles');
  return view.shadowRoot!;
}

it('opens on the overview: your standing, then a tile per installed game', async () => {
  const { root } = await hub();
  const view = await overviewOf(root);
  const stat = (name: string) => view.querySelector(`[data-stat="${name}"] b`)!.textContent;
  expect(stat('lead'), 'boards led, the uninstalled game left out').to.equal('1');
  expect(stat('top3')).to.equal('2');
  expect(stat('colleagues')).to.equal('12');
  expect(view.querySelector('[data-stat="lead"]')!.textContent).to.contain('Snake');
  expect([...view.querySelectorAll('.tile')].map((t) => t.getAttribute('data-game'))).to.deep.equal(['Pkg.Mines.Game', 'Pkg.Snake.Game', 'Pkg.Sol.Game']);
});

it('shows, per mode, your medal and best beside the leader and their crown', async () => {
  const view = await overviewOf((await hub()).root);
  const row = view.querySelector('[data-game="Pkg.Mines.Game"] [data-board="easy"]')!;
  expect(row.querySelector('.medal')!.textContent).to.equal('3');
  expect(row.textContent).to.contain('38.1').and.contain('Anna').and.contain('31.8');
  expect(row.querySelector('.lead .crown')).to.not.equal(null);
});

it('shows who is next when you lead', async () => {
  const view = await overviewOf((await hub()).root);
  expect(view.querySelector('[data-board="default"] .lead')!.textContent).to.contain('Next: Bram').and.contain('450');
});

it('says Not played yet for a mode you never played, and still shows its leader', async () => {
  const view = await overviewOf((await hub()).root);
  const row = view.querySelector('[data-game="Pkg.Sol.Game"] [data-board="draw-3"]')!;
  expect(row.textContent).to.contain('Not played yet').and.contain('Tom');
});

it('gives a game with several modes a wide tile, and its own rule', async () => {
  const view = await overviewOf((await hub()).root);
  const tile = view.querySelector('[data-game="Pkg.Sol.Game"]')!;
  expect(tile.classList.contains('wide')).to.equal(true);
  expect(tile.textContent).to.contain('Highest score wins, time bonus included');
  expect(view.querySelector('[data-game="Pkg.Mines.Game"]')!.textContent).to.contain('Fastest time wins');
});

/**
 * How many lines a piece of text was laid out on: the distinct tops of its boxes.
 * @param element The element whose text is measured.
 * @returns The number of lines.
 */
function lines(element: Element): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
}

it('keeps a long leader\'s name on one line, cut with its full name in the title, and a board\'s name whole', async () => {
  const long = 'Arcade Carolina van Oranje-Nassau';
  const named = games.map((g) => (g.alias === 'Pkg.Sol.Game' ? { ...g, label: 'Solitaire Deluxe', leaderboards: [{ ...g.leaderboards[0], label: 'Draw one card' }, g.leaderboards[1]] } : g));
  const boards = overview.boards.map((b) =>
    b.board === 'easy' ? { ...b, leader: e(1, long, 31_800) } : b.board === 'default' ? { ...b, next: e(2, long, 450) } : b,
  );
  const view = await overviewOf((await hub({ games: named, overview: { ...overview, boards } })).root);
  for (const board of ['easy', 'default']) {
    const who = view.querySelector(`[data-board="${board}"] .lead .who`)!;
    expect(lines(who), `${board}: the name on one line`).to.equal(1);
    expect(who.getAttribute('title'), `${board}: the full name in the title`).to.equal(long);
  }
  // The cut is for a name that cannot fit: an ordinary one in a one-mode tile, which has the room, shows whole.
  const ordinary = await overviewOf((await hub({ overview: { ...overview, boards: overview.boards.map((b) => (b.board === 'easy' ? { ...b, leader: e(1, 'Arcade Carol', 31_800) } : b.board === 'default' ? { ...b, next: e(2, 'Arcade Alice', 450) } : b)) } })).root);
  for (const board of ['easy', 'default']) {
    const who = ordinary.querySelector<HTMLElement>(`[data-board="${board}"] .lead .who`)!;
    expect(who.scrollWidth <= who.clientWidth, `${board}: "${who.textContent}" whole (${who.scrollWidth} in ${who.clientWidth})`).to.equal(true);
  }
  const names = [...view.querySelectorAll('[data-stat="top3"] .bname')];
  expect(names.map((n) => n.textContent)).to.deep.equal(['Minesweeper', 'Solitaire Deluxe Draw one card']);
  for (const name of names) expect(lines(name), `${name.textContent} whole on one line`).to.equal(1);
});

it('starts a game from Play, and opens its page from the tile', async () => {
  const { root, calls } = await hub();
  const view = await overviewOf(root);
  (view.querySelector('[data-game="Pkg.Snake.Game"] [data-action="play"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('open:Pkg.Snake'), JSON.stringify(calls));
  expect(root.querySelector('umbradesktop-arcade-game-page'), 'Play does not also open the page').to.equal(null);
  (view.querySelector('[data-game="Pkg.Snake.Game"] [data-action="open-game"]') as HTMLElement).click();
  const page = await found(() => root.querySelector('umbradesktop-arcade-game-page'), 'game page');
  expect(page.game!.alias).to.equal('Pkg.Snake.Game');
});

it('keeps the profile behind your name, not among the games, with a way back', async () => {
  const { root } = await hub();
  await overviewOf(root);
  expect(root.querySelector('uui-tab')).to.equal(null);
  const me = root.querySelector('[data-action="profile"]') as HTMLElement;
  expect(me.textContent).to.contain('Luuk Peters');
  me.click();
  await waitUntil(() => root.querySelector('umbradesktop-arcade-profile'), 'profile');
  expect(me.getAttribute('aria-expanded')).to.equal('true');
  (root.querySelector('[data-action="back"]') as HTMLElement).click();
  await waitUntil(() => root.querySelector('umbradesktop-arcade-overview'), 'overview again');
});

it('opens on the board the Arcade was asked to show, and follows a request while open', async () => {
  const { root, calls, request } = await hub({ hubRequest: { game: 'Pkg.Sol.Game', board: 'draw-3' } });
  const page = await found(() => root.querySelector('umbradesktop-arcade-game-page'), 'game page');
  expect(page.board).to.equal('draw-3');
  expect(calls).to.include('clearHubRequest');
  request.setValue({ game: 'Pkg.Mines.Game' });
  await waitUntil(() => root.querySelector('umbradesktop-arcade-game-page')?.game?.alias === 'Pkg.Mines.Game', 'followed');
});

it('reads the board afresh when asked again for the board already on show, after the player switched mode', async () => {
  // The panel's "Open in the Arcade" on Draw 1, the pill to Draw 3, then the same button again.
  const { root, calls, request } = await hub({ hubRequest: { game: 'Pkg.Sol.Game', board: 'draw-1' } });
  const reads = () => calls.filter((c) => c === 'getBoard:Pkg.Sol.Game:draw-1').length;
  await waitUntil(() => reads() === 1, JSON.stringify(calls));
  const page = await found(() => root.querySelector('umbradesktop-arcade-game-page'), 'game page');
  (await found(() => page.shadowRoot!.querySelector<HTMLElement>('[data-mode="draw-3"]'), 'pill')).click();
  await waitUntil(() => calls.includes('getBoard:Pkg.Sol.Game:draw-3'), JSON.stringify(calls));
  request.setValue({ game: 'Pkg.Sol.Game', board: 'draw-1' });
  await waitUntil(() => reads() === 2, `read again: ${JSON.stringify(calls)}`);
  const shown = await found(() => root.querySelector('umbradesktop-arcade-game-page'), 'game page again');
  await waitUntil(() => shown.shadowRoot!.querySelector('[data-mode="draw-1"]')?.getAttribute('aria-selected') === 'true', 'Draw 1 selected again');
});

it('reads the overview again, without a loader, when the Arcade says the scores changed', async () => {
  const { root, calls, scoresChanged } = await hub();
  const view = await overviewOf(root);
  expect(calls.filter((c) => c === 'getOverview').length, 'read once on opening').to.equal(1);
  scoresChanged.setValue(scoresChanged.getValue() + 1);
  await waitUntil(() => calls.filter((c) => c === 'getOverview').length === 2, JSON.stringify(calls));
  expect(view.querySelector('uui-loader-bar') === null, 'no loader').to.equal(true);
  expect(view.querySelectorAll('.tile').length).to.equal(3);
});

it('clears a request for a game that is not installed and stays on the overview', async () => {
  const { root, calls, request } = await hub({ hubRequest: { game: 'Pkg.Gone.Game', board: 'x' } });
  await overviewOf(root);
  expect(calls).to.include('clearHubRequest');
  expect(request.getValue(), 'not left waiting').to.equal(undefined);
  expect(root.querySelector('umbradesktop-arcade-game-page')).to.equal(null);
  expect(root.querySelector('[data-action="back"]'), 'nowhere to go back from').to.equal(null);
});

it('says so when the overview cannot be loaded, and retries', async () => {
  const { root, calls } = await hub({ overview: undefined });
  const view = await found(() => root.querySelector('umbradesktop-arcade-overview'), 'overview');
  const retry = await found(() => view.shadowRoot!.querySelector<HTMLElement>('[data-action="retry"]'), 'retry');
  retry.click();
  await waitUntil(() => calls.filter((c) => c === 'getOverview').length === 2, JSON.stringify(calls));
});

it('keeps its top bar short and lets the body scroll in a fixed-size window', async () => {
  const { root } = await hub();
  await overviewOf(root);
  expect(root.querySelector('.hhead')!.getBoundingClientRect().height).to.be.lessThan(80);
  const body = root.querySelector('.body') as HTMLElement;
  expect(getComputedStyle(body).overflowY).to.equal('auto');
});

/**
 * WCAG relative luminance of a computed `rgb()` colour.
 * @param rgb A computed colour.
 * @returns Its luminance, 0 to 1.
 */
function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map((n) => {
    const c = Number(n) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Under Windows 98 the profile button is a silver bevel on the teal, and it inherited the felt's
 * white text: "UmbraDesktop Admin" in white on silver, measured unreadable in a real desktop.
 */
it('keeps the profile button readable under Windows 98', async () => {
  const { el, root } = await hub();
  // The hub is an app, so the desktop stamps it, as it does every app.
  el.setAttribute('data-umbradesktop-theme', 'win98');
  const me = await found(() => root.querySelector<HTMLElement>('.me'), 'profile button');
  const style = getComputedStyle(me);
  const [hi, lo] = [luminance(style.color), luminance(style.backgroundColor)].sort((x, y) => y - x);
  expect((hi + 0.05) / (lo + 0.05) >= 4.5, `${style.color} on ${style.backgroundColor}`).to.equal(true);
});

it('says it needs the desktop when there is no Arcade', async () => {
  const el = await fixture(html`<umbradesktop-arcade-hub></umbradesktop-arcade-hub>`);
  await waitUntil(() => el.shadowRoot!.querySelector('.missing'), 'message');
});
