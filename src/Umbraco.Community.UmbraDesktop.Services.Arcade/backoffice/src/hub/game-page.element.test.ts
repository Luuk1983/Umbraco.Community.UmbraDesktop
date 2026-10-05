import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import { resetMouse, sendMouse } from '@web/test-runner-commands';
// Defines core's `umb-dropdown`, the moderator's menu, so the keyboard test has a real button to focus.
import '@umbraco-cms/backoffice/components';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import en from '../localization/en.js';
import nl from '../localization/nl.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './game-page.element.js';

/** A game with two modes, so the page draws its pill, and a rule of its own. */
const solitaire = { alias: 'Pkg.Sol.Game', app: 'Pkg.Sol', label: 'Solitaire', icon: 'icon-playing-cards', weight: 0, rule: 'Highest score wins, time bonus included', leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] };
/** A board row; the key is derived from the name, so a test can say whose row an action hit. */
const e = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-09-30T09:00:00Z', isViewer });
/** The mock's five shown players, so three stand on the podium and two are listed. */
const top = [e(1, 'Tom Visser', 3960), e(2, 'Sophie Bakker', 3710), e(3, 'Anna de Vries', 3120), e(4, 'Bram Jansen', 2870), e(5, 'Noor Hendriks', 2400)];
/** The mock's board: five shown, the viewer twelfth. */
const board = (over: Partial<ArcadeBoard> = {}): ArcadeBoard => ({ played: true, top, viewer: e(12, 'Luuk Peters', 1140, true), viewerIsPublic: true, canModerate: false, players: 12, above: e(11, 'Eva', 1200), ...over });

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

/**
 * The page for Solitaire under a fake Arcade, once its board is drawn. The page is the element that
 * localizes, so `lang` is pinned on it: the localizer reads its own host's `lang`, never an
 * ancestor's, and this machine's browser may not be English, which would write "1.140".
 */
async function page(options: Parameters<typeof arcadeHarness>[0] = {}, boardAlias = '') {
  const harness = await arcadeHarness({ games: [solitaire], board: board(), ...options });
  const el = await fixture(html`<umbradesktop-arcade-game-page lang="en" .game=${solitaire} .board=${boardAlias}></umbradesktop-arcade-game-page>`, { parentNode: harness.wrapper });
  await waitUntil(() => el.shadowRoot!.querySelector('.podium, .empty'), 'drawn');
  return { el, root: el.shadowRoot!, ...harness };
}

it('names the game, its rule, and its one action, Play', async () => {
  const { root, calls } = await page();
  expect(root.querySelector('h2')!.textContent).to.equal('Solitaire');
  expect(root.querySelector('.ghero')!.textContent).to.contain('Highest score wins, time bonus included');
  expect(root.querySelectorAll('.ghero button')).to.have.length(1);
  (root.querySelector('[data-action="play"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('open:Pkg.Sol'), JSON.stringify(calls));
});

it('stands the top three on a podium, lists the rest, and pins you under a divider outside the top ten', async () => {
  const { root } = await page();
  expect([...root.querySelectorAll('.podium .pod')].map((p) => p.getAttribute('data-rank'))).to.deep.equal(['2', '1', '3']);
  expect([...root.querySelectorAll('.list .lr')].map((r) => r.getAttribute('data-rank'))).to.deep.equal(['4', '5']);
  const pinned = root.querySelector('.pinned .lr')!;
  expect(pinned.classList.contains('mine')).to.equal(true);
  expect(pinned.textContent).to.contain('Luuk Peters').and.contain('You').and.contain('1,140');
  expect(root.querySelector('.pinned .gap')).to.not.equal(null);
});

it('pins you without a gap when you are right under a full list', async () => {
  const ten = Array.from({ length: 10 }, (_, i) => e(i + 1, `Player ${i + 1}`, 5000 - i * 100));
  const { root } = await page({ board: board({ top: ten, viewer: e(11, 'Luuk Peters', 1140, true), above: ten[9], players: 11 }) });
  expect(root.querySelector('.pinned .lr')!.getAttribute('data-rank')).to.equal('11');
  expect(root.querySelector('.pinned .gap') === null, 'nobody stands between').to.equal(true);
});

it('stamps the desktop theme on itself, since the hub stamp does not reach inside its shadow root', async () => {
  const { el } = await page({ theme: 'windows98' });
  await waitUntil(() => el.getAttribute('data-umbradesktop-theme') === 'windows98', 'stamped');
});

it('marks your own row Only you see this while your scores are hidden', async () => {
  const { root } = await page({ board: board({ viewerIsPublic: false }) });
  expect(root.querySelector('.pinned .lr')!.textContent).to.contain('Only you see this');
});

it('does not pin you when you are already on the page', async () => {
  const mine = e(2, 'Luuk Peters', 3710, true);
  const { root } = await page({ board: board({ top: [top[0], mine, top[2]], viewer: mine, above: top[0] }) });
  expect(root.querySelector('.pinned') === null).to.equal(true);
  expect(root.querySelector('.pod.mine')).to.not.equal(null);
});

it('stands you on the podium at your own rank while hidden, rather than pinning you and showing a rank twice', async () => {
  // Hidden, so `top` ranks only the five shown players; the viewer's 2 counts themselves.
  const { root } = await page({ board: board({ viewerIsPublic: false, viewer: e(2, 'Luuk Peters', 3800, true), above: top[0] }) });
  expect(root.querySelector('.pinned') === null, 'not pinned').to.equal(true);
  const mine = root.querySelector('.pod.mine')!;
  expect(mine.getAttribute('data-rank')).to.equal('2');
  expect(mine.classList.contains('ghost')).to.equal(true);
  expect(mine.textContent).to.contain('Only you see this');
  const ranks = [...root.querySelectorAll('.pod, .lr')].map((r) => r.getAttribute('data-rank'));
  // Five shown players and the viewer make six: a short board keeps everyone, so Noor stays, sixth.
  expect(ranks, 'each rank once').to.deep.equal(['2', '1', '3', '4', '5', '6']);
  expect([...root.querySelectorAll('.list .lr .who')].map((w) => w.textContent)).to.deep.equal(['Anna de Vries', 'Bram Jansen', 'Noor Hendriks']);
});

it('moderates the player in the row, not the rank it shows, once the rows are renumbered', async () => {
  const { root, calls } = await page({ board: board({ canModerate: true, viewerIsPublic: false, viewer: e(2, 'Luuk Peters', 3800, true), above: top[0] }) });
  // Anna is third on the server's board and shows fourth to the viewer.
  root.querySelector('.list [data-action="remove"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => calls.some((c) => c.startsWith('removeScore:')), JSON.stringify(calls));
  expect(calls).to.include('removeScore:Pkg.Sol.Game:draw-1:k-Anna de Vries');
});

it('opens on the mode it is given, else the one last played, and switches with the pill', async () => {
  const given = await page({}, 'draw-3');
  expect(given.calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  const remembered = await page({ lastBoard: { 'Pkg.Sol.Game': 'draw-3' } });
  expect(remembered.calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  const fresh = await page();
  expect(fresh.calls).to.include('getBoard:Pkg.Sol.Game:draw-1');
  (fresh.root.querySelector('[data-mode="draw-3"]') as HTMLElement).click();
  await waitUntil(() => fresh.calls.includes('getBoard:Pkg.Sol.Game:draw-3'), JSON.stringify(fresh.calls));
});

it('gives a moderator a menu per row and Reset this board, and nobody else', async () => {
  const player = await page();
  expect(player.root.querySelector('[data-action="remove"]') === null).to.equal(true);
  expect(player.root.querySelector('[data-action="reset-board"]') === null).to.equal(true);
  const admin = await page({ board: board({ canModerate: true }) });
  expect(admin.root.querySelectorAll('.list [data-action="remove"]')).to.have.length(2);
  expect(admin.root.querySelectorAll('.podium [data-action="remove"]')).to.have.length(3);
  expect(admin.root.querySelector('[data-action="reset-board"]')).to.not.equal(null);
});

it('shows a menu on keyboard focus, in the list and on the podium', async () => {
  const { root } = await page({ board: board({ canModerate: true }) });
  for (const where of ['.list .lr', '.podium .pod[data-rank="1"]']) {
    const menu = root.querySelector(`${where} umb-dropdown.more`) as HTMLElement;
    await waitUntil(() => getComputedStyle(menu).opacity === '0', `${where}: hidden until wanted`);
    const button = await found(() => menu.shadowRoot?.querySelector('uui-button')?.shadowRoot?.querySelector('button'), `${where}: the menu button`);
    expect(button.tabIndex, `${where}: in the tab order`).to.be.at.least(0);
    button.focus();
    await waitUntil(() => getComputedStyle(menu).opacity === '1', `${where}: shown on focus`);
    button.blur();
  }
});

it('shows a menu on hover, in the list and on the podium', async () => {
  const { root } = await page({ board: board({ canModerate: true }) });
  after(() => resetMouse());
  for (const where of ['.list .lr', '.podium .pod[data-rank="1"]']) {
    const holder = root.querySelector(where) as HTMLElement;
    const menu = holder.querySelector('umb-dropdown.more') as HTMLElement;
    await waitUntil(() => getComputedStyle(menu).opacity === '0', `${where}: hidden until wanted`);
    // Every earlier test's page is still in the body, so this one may be below the fold.
    holder.scrollIntoView({ block: 'center' });
    const box = holder.getBoundingClientRect();
    await sendMouse({ type: 'move', position: [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)] });
    await waitUntil(() => getComputedStyle(menu).opacity === '1', `${where}: shown on hover`);
    await resetMouse();
  }
});

it('uses only words both dictionaries have, and none of the old board table', async () => {
  // The page's own source, so a key added to the page later is checked too, not only a list kept here.
  const source = await (await fetch(new URL('./game-page.element.ts', import.meta.url))).text();
  const keys = [...source.matchAll(/say\([^,]+,\s*['"](\w+)['"]/g)].map((m) => m[1]);
  expect(keys, 'read the keys').to.include('resetBoard');
  // Asserted as booleans: a failing `have.property` prints the whole dictionary.
  for (const dropped of ['colRank', 'colPlayer', 'colScore', 'colDate', 'colActions', 'private']) expect(keys.includes(dropped), `dropped: ${dropped}`).to.equal(false);
  for (const key of keys) {
    expect(key in en.umbraDesktopArcade, `en: ${key}`).to.equal(true);
    expect(key in nl.umbraDesktopArcade, `nl: ${key}`).to.equal(true);
  }
});

it('removes a score after confirming, and reloads the board', async () => {
  const { root, calls } = await page({ board: board({ canModerate: true }) });
  expect(calls.filter((c) => c.startsWith('getBoard')), 'read once on opening').to.have.length(1);
  root.querySelector('.list [data-action="remove"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => calls.some((c) => c.startsWith('removeScore:')), JSON.stringify(calls));
  expect(calls).to.include('confirm:Remove this score?');
  expect(calls).to.include('removeScore:Pkg.Sol.Game:draw-1:k-Bram Jansen');
  await waitUntil(() => calls.filter((c) => c.startsWith('getBoard')).length === 2, 'reloaded');
});

it('keeps the list on show while it reloads after a moderation, rather than flashing the loader', async () => {
  const { root, calls } = await page({ board: board({ canModerate: true }) });
  let loader = false;
  const watch = new MutationObserver(() => (loader ||= root.querySelector('uui-loader-bar') !== null));
  watch.observe(root, { childList: true, subtree: true });
  after(() => watch.disconnect());
  root.querySelector('.list [data-action="remove"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => calls.filter((c) => c.startsWith('getBoard')).length === 2, 'reloaded');
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  expect(loader, 'the loader never replaced the list').to.equal(false);
  expect(root.querySelector('.list') !== null).to.equal(true);
});

it('reads the board again, without a loader, when the Arcade says the scores changed', async () => {
  const { root, calls, scoresChanged } = await page();
  expect(calls.filter((c) => c.startsWith('getBoard')), 'read once on opening').to.have.length(1);
  let loader = false;
  const watch = new MutationObserver(() => (loader ||= root.querySelector('uui-loader-bar') !== null));
  watch.observe(root, { childList: true, subtree: true });
  after(() => watch.disconnect());
  scoresChanged.setValue(scoresChanged.getValue() + 1);
  await waitUntil(() => calls.filter((c) => c.startsWith('getBoard')).length === 2, JSON.stringify(calls));
  await (root.host as HTMLElement & { updateComplete: Promise<unknown> }).updateComplete;
  expect(loader, 'no loader').to.equal(false);
  expect(root.querySelector('.podium') !== null).to.equal(true);
});

it('resets a name and the board after confirming', async () => {
  const { root, calls } = await page({ board: board({ canModerate: true }) });
  root.querySelector('.list [data-action="reset-name"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => calls.includes('resetName:k-Bram Jansen'), JSON.stringify(calls));
  expect(calls).to.include('confirm:Reset this name?');
  (root.querySelector('[data-action="reset-board"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('resetBoard:Pkg.Sol.Game:draw-1'), JSON.stringify(calls));
  expect(calls).to.include('confirm:Reset this board?');
});

it('does nothing when the moderator cancels, and says so when the server refuses', async () => {
  const cancelled = await page({ board: board({ canModerate: true }), confirmAnswer: 'cancel' });
  (cancelled.root.querySelector('[data-action="reset-board"]') as HTMLElement).click();
  cancelled.root.querySelector('.list [data-action="reset-name"]')!.dispatchEvent(new CustomEvent('click-label'));
  await waitUntil(() => cancelled.calls.filter((c) => c.startsWith('confirm:')).length === 2, 'asked');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(cancelled.calls.some((c) => c.startsWith('resetBoard') || c.startsWith('resetName'))).to.equal(false);
  const refused = await page({ board: board({ canModerate: true }), failWrites: true });
  (refused.root.querySelector('[data-action="reset-board"]') as HTMLElement).click();
  await waitUntil(() => refused.root.querySelector('[role="alert"]'), 'error shown');
});

it('says when nobody has played yet, and when the board cannot be loaded, and loads again on Retry', async () => {
  const unplayed = await page({ board: { played: false, top: [], viewer: null, viewerIsPublic: true, canModerate: false, players: 0, above: null } });
  expect(unplayed.root.querySelector('.empty')!.textContent).to.contain('Nobody has played this yet.');
  let down = true;
  const harness = await arcadeHarness({ games: [solitaire], boardFor: () => (down ? undefined : board()) });
  const el = await fixture(html`<umbradesktop-arcade-game-page lang="en" .game=${solitaire}></umbradesktop-arcade-game-page>`, { parentNode: harness.wrapper });
  const retry = await found(() => el.shadowRoot!.querySelector<HTMLElement>('[data-action="retry"]'), 'retry offered');
  down = false;
  retry.click();
  await waitUntil(() => el.shadowRoot!.querySelector('.podium'), 'loaded on retry');
});
