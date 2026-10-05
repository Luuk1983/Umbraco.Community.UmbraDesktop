import { expect, fixture, html, oneEvent, waitUntil } from '@open-wc/testing';
import { sendKeys } from '@web/test-runner-commands';
import type { ArcadeBoard, ArcadeBoardEntry } from '../api/arcade-api.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import { ARCADE_COMPACT_BELOW_PX } from './constants.js';
import './leaderboard.element.js';
import type { UmbraDesktopArcadeLeaderboardElement } from './leaderboard.element.js';

/** A game with two boards and its own rule, so the panel shows the mode switch and the game's wording. */
const solitaire = { alias: 'Pkg.Sol.Game', app: 'Pkg.Sol', label: 'Solitaire', icon: 'icon-playing-cards', weight: 0, rule: 'Highest score wins', leaderboards: [{ alias: 'draw-1', label: 'Draw 1', better: 'higher' as const, format: 'points' as const }, { alias: 'draw-3', label: 'Draw 3', better: 'higher' as const, format: 'points' as const }] };
/** A board row, keyed by name so each player's avatar is stable. */
const entry = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
/** A full top ten of other players, P1 to P10. */
const top = Array.from({ length: 10 }, (_, i) => entry(i + 1, `P${i + 1}`, 5000 - i * 100));
/** The top ten as a board read, with the given viewer and whether their scores are shown. */
const board = (viewer: ArcadeBoardEntry | null, viewerIsPublic = true): ArcadeBoard => ({ played: true, top, viewer, viewerIsPublic, canModerate: false, players: 14, above: null });

/** Mount a closed panel in a positioned box under a fake Arcade, then open it. */
async function open(options: { width?: number; height?: number; board?: string; lastBoard?: Record<string, string>; data?: ArcadeBoard; compact?: boolean; showBoardOpens?: boolean } = {}) {
  const harness = await arcadeHarness({ games: [solitaire], board: options.data ?? board(null), lastBoard: options.lastBoard, showBoardOpens: options.showBoardOpens });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${options.width ?? 600}px;height:${options.height ?? 480}px"></div>`, { parentNode: harness.wrapper });
  const panel = document.createElement('umbradesktop-arcade-leaderboard') as UmbraDesktopArcadeLeaderboardElement;
  // The localizer reads the panel's own `lang`, not an ancestor's, then the browser's.
  panel.lang = 'en';
  panel.game = 'Pkg.Sol.Game';
  if (options.board) panel.board = options.board;
  panel.compact = options.compact ?? false;
  box.append(panel);
  await panel.updateComplete;
  const opened = oneEvent(panel, 'open');
  panel.open = true;
  await opened;
  await waitUntil(() => panel.shadowRoot!.querySelector('.list li'), 'rows drawn');
  const shown = (selector: string) => getComputedStyle(panel.shadowRoot!.querySelector(selector)!).display !== 'none';
  return { panel, root: panel.shadowRoot!, shown, ...harness };
}

it('opens on the board it is given', async () => {
  const { root, calls } = await open({ board: 'draw-3' });
  expect(calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  expect(root.querySelector('[data-mode="draw-3"]')!.getAttribute('aria-selected')).to.equal('true');
});

it('opens on the mode last played when given none, and on the first otherwise', async () => {
  const remembered = await open({ lastBoard: { 'Pkg.Sol.Game': 'draw-3' } });
  expect(remembered.calls).to.include('getBoard:Pkg.Sol.Game:draw-3');
  const fresh = await open();
  expect(fresh.calls).to.include('getBoard:Pkg.Sol.Game:draw-1');
});

it('switches the board with the pill', async () => {
  const { root, calls } = await open({ board: 'draw-1' });
  (root.querySelector('[data-mode="draw-3"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('getBoard:Pkg.Sol.Game:draw-3'), JSON.stringify(calls));
});

it('stands the top three on a podium in its full form, and drops the podium in its compact form', async () => {
  const full = await open({ width: 600 });
  expect(full.shown('.podium-wrap')).to.equal(true);
  expect(full.shown('.list li[data-rank="1"]'), 'rank 1 is on the podium, not the list').to.equal(false);
  const narrow = await open({ width: ARCADE_COMPACT_BELOW_PX - 1 });
  expect(narrow.shown('.podium-wrap')).to.equal(false);
  expect(narrow.shown('.list li[data-rank="1"]')).to.equal(true);
  const forced = await open({ width: 600, compact: true });
  expect(forced.shown('.podium-wrap')).to.equal(false);
});

it('pins the player under the list when outside the top ten, marked when hidden', async () => {
  const { root } = await open({ data: board(entry(14, 'Ada', 100, true), false) });
  const pinned = root.querySelector('.pinned .lr')!;
  expect(pinned.textContent).to.contain('You').and.contain('Only you see this');
  expect(pinned.classList.contains('ghost')).to.equal(true);
});

it('lists a hidden player inside the top ten in their place, renumbering the rows below', async () => {
  const { root } = await open({ data: board(entry(2, 'Ada', 4950, true), false), compact: true });
  const rows = [...root.querySelectorAll('.list .lr')];
  expect(rows.map((r) => r.getAttribute('data-rank'))).to.deep.equal(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  expect(rows[1].classList.contains('ghost')).to.equal(true);
  expect(rows[1].textContent).to.contain('You').and.contain('Only you see this');
  expect(rows[2].textContent).to.contain('P2');
  expect(root.querySelector('.pinned') === null, 'no pinned row when listed').to.equal(true);
});

it('says how many players, and how to win', async () => {
  const { root } = await open();
  expect(root.querySelector('.sfoot')!.textContent).to.contain('14');
  expect(root.querySelector('.rule')!.textContent).to.contain('Highest score wins');
});

it('closes on ✕ and on Esc, firing close each time', async () => {
  const { panel, root } = await open();
  setTimeout(() => (root.querySelector('[data-action="close"]') as HTMLElement).click());
  await oneEvent(panel, 'close');
  expect(panel.open).to.equal(false);
  const reopened = oneEvent(panel, 'open');
  panel.open = true;
  await reopened;
  setTimeout(() => panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })));
  await oneEvent(panel, 'close');
  expect(panel.open).to.equal(false);
});

it('keeps Esc inside the panel: focus starts on ✕ and a click on the sheet keeps it there', async () => {
  // A short board, so the sheet does not scroll: Chrome makes a scrolling box focusable on its own.
  const { panel, root } = await open({ data: { ...board(null), top: top.slice(0, 2), players: 2 } });
  expect(root.activeElement === root.querySelector('[data-action="close"]'), 'focus on ✕ when opened').to.equal(true);
  // A click on a plain part of the sheet focuses the nearest focusable thing; without the sheet being
  // one, that is the game (or the page), and Esc would never reach the panel.
  const sheet = root.querySelector<HTMLElement>('.sheet')!;
  sheet.focus();
  expect(root.activeElement === sheet, 'the sheet takes focus').to.equal(true);
  setTimeout(() => sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true })));
  await oneEvent(panel, 'close');
});

it('keeps Tab inside the open sheet, so the game under the scrim never takes a key', async () => {
  // A short board, so the sheet does not scroll and the buttons are the only stops.
  const { root } = await open({ data: { ...board(null), top: top.slice(0, 2), players: 2 } });
  const first = root.querySelector<HTMLElement>('[data-mode="draw-1"]')!;
  const last = root.querySelector<HTMLElement>('[data-action="open-in-arcade"]')!;
  last.focus();
  await sendKeys({ press: 'Tab' });
  expect(root.activeElement === first, 'Tab from the last stop wraps to the first').to.equal(true);
  await sendKeys({ down: 'Shift' });
  await sendKeys({ press: 'Tab' });
  await sendKeys({ up: 'Shift' });
  expect(root.activeElement === last, 'Shift+Tab from the first stop wraps to the last').to.equal(true);
});

it('leaves Esc alone while closed, so the game still gets it', async () => {
  const { panel, wrapper } = await open();
  panel.open = false;
  await panel.updateComplete;
  let heard = false;
  wrapper.addEventListener('keydown', () => (heard = true), { once: true });
  panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  expect(heard).to.equal(true);
});

it('fires close when the game closes it itself', async () => {
  const { panel } = await open();
  setTimeout(() => (panel.open = false));
  await oneEvent(panel, 'close');
});

it('opens the same board in the Arcade and stays open, since opening the hub is not being done with the panel', async () => {
  const { panel, root, calls } = await open({ board: 'draw-3' });
  let closed = false;
  panel.addEventListener('close', () => (closed = true));
  (root.querySelector('[data-action="open-in-arcade"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('show:Pkg.Sol.Game:draw-3'), JSON.stringify(calls));
  await panel.updateComplete;
  expect(panel.open, 'still open').to.equal(true);
  expect(closed, 'no close fired').to.equal(false);
});

it('says so when the Arcade cannot be opened, rather than doing nothing', async () => {
  const { root, calls } = await open({ board: 'draw-3', showBoardOpens: false });
  expect(root.querySelector('[role="alert"]') === null, 'no error before trying').to.equal(true);
  (root.querySelector('[data-action="open-in-arcade"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('show:Pkg.Sol.Game:draw-3'), JSON.stringify(calls));
  const alert = await waitUntil(() => root.querySelector('[role="alert"]'), 'error shown').then(() => root.querySelector('[role="alert"]')!);
  expect(alert.textContent).to.contain('That did not work. Try again.');
});

/**
 * Solitaire's window, where the viewer's pinned 12th row sat half under the sheet's bottom edge until
 * the player scrolled: in a box too short for the whole list, in both forms, the pinned row and the
 * footer must be in sight without scrolling, as the hub's game page keeps its pinned row.
 */
it('keeps the pinned row and the footer in sight in a short box, in both forms, without scrolling', async () => {
  for (const [width, compact] of [[600, false], [ARCADE_COMPACT_BELOW_PX - 1, true]] as const) {
    const { root } = await open({ width, height: 360, data: board(entry(12, 'Ada', 100, true)) });
    const sheet = root.querySelector<HTMLElement>('.sheet')!;
    // The sheet rises 24px into place; measure where it settles.
    await Promise.all(sheet.getAnimations().map((a) => a.finished));
    const seen = sheet.getBoundingClientRect();
    for (const selector of ['.pinned .lr', '.sfoot']) {
      const part = root.querySelector(selector)!.getBoundingClientRect();
      const form = compact ? 'compact' : 'full';
      expect(part.top >= seen.top, `${selector} top in the sheet (${form})`).to.equal(true);
      expect(part.bottom <= seen.bottom, `${selector} bottom ${part.bottom} within the sheet's ${seen.bottom} (${form})`).to.equal(true);
    }
  }
});

it('draws the gap above a pinned row only when players stand between', async () => {
  const next = await open({ data: board(entry(11, 'Ada', 100, true)) });
  expect(next.root.querySelector('.pinned .lr') !== null, 'pinned at 11th').to.equal(true);
  expect(next.root.querySelector('.pinned .gap') === null, 'no gap at 11th').to.equal(true);
  const further = await open({ data: board(entry(14, 'Ada', 100, true)) });
  expect(further.root.querySelector('.pinned .gap') !== null, 'a gap at 14th').to.equal(true);
});

it('draws nothing while closed', async () => {
  const harness = await arcadeHarness({ games: [solitaire], board: board(null) });
  const panel = await fixture<UmbraDesktopArcadeLeaderboardElement>(html`<umbradesktop-arcade-leaderboard game="Pkg.Sol.Game"></umbradesktop-arcade-leaderboard>`, { parentNode: harness.wrapper });
  expect(getComputedStyle(panel).display).to.equal('none');
});
