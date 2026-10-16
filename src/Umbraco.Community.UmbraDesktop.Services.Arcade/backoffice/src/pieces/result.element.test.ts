import { expect, fixture, html, oneEvent, waitUntil } from '@open-wc/testing';
import { sendKeys } from '@web/test-runner-commands';
import type { ArcadeBoard, ArcadeBoardEntry, ArcadeProfile } from '../api/arcade-api.js';
import type { ArcadeGameResult } from '../context/arcade.context.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import './result.element.js';
import type { UmbraDesktopArcadeResultElement } from './result.element.js';

/** A timed game, lower wins: the card's seconds and "behind" wording. */
const minesweeper = { alias: 'Pkg.Mines.Game', app: 'Pkg.Mines', label: 'Minesweeper', icon: 'icon-bomb', weight: 0, leaderboards: [{ alias: 'easy', label: 'Beginner', better: 'lower' as const, format: 'time' as const }] };
/** A points game, higher wins: the card's points wording. */
const snake = { alias: 'Pkg.Snake.Game', app: 'Pkg.Snake', label: 'Snake', icon: 'icon-game', weight: 0, leaderboards: [{ alias: 'default', label: 'Classic', better: 'higher' as const, format: 'points' as const }] };
/** A board row, keyed by name so each player's avatar is stable. */
const entry = (rank: number, name: string, value: number, isViewer = false): ArcadeBoardEntry => ({ rank, userKey: `k-${name}`, displayName: name, value, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer });
/** A shown player's new best of 38.1 seconds at 3rd on Minesweeper, to vary. */
const result = (over: Partial<ArcadeGameResult> = {}): ArcadeGameResult => ({
  status: 'accepted', isPersonalBest: true, previousBest: 40_200, rank: 3, isPublic: true, askedAboutPublic: true, displayName: 'Luuk Peters', passed: null,
  game: 'Pkg.Mines.Game', board: 'easy', value: 38_100, rankText: '3rd', ...over,
});
/** The Minesweeper board that result matches: the viewer 3rd behind Bram and Anna. */
const minesBoard: ArcadeBoard = {
  played: true, top: [entry(1, 'Anna', 31_800), entry(2, 'Bram', 35_000), entry(3, 'Luuk Peters', 38_100, true)],
  viewer: entry(3, 'Luuk Peters', 38_100, true), viewerIsPublic: true, canModerate: false, players: 12, above: entry(2, 'Bram', 35_000),
};
/** A profile that has answered and shows its scores, so the card asks nothing. */
const shown: ArcadeProfile = { displayName: 'Luuk Peters', isPublic: true, notifyWhenBeaten: true, askedAboutPublic: true };

/** Mount the card in a positioned box of the given width, under a fake Arcade. */
async function mount(r: ArcadeGameResult, board: ArcadeBoard, width = 400, profile?: ArcadeProfile, games = [minesweeper, snake]) {
  const harness = await arcadeHarness({ games, board, profile });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${width}px;height:420px"></div>`, { parentNode: harness.wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  // The localizer reads the card's own `lang`, not an ancestor's, then the browser's: without this
  // the digits follow a Dutch machine and "38.1" reads "38,1".
  card.lang = 'en';
  card.result = r;
  box.append(card);
  await waitUntil(() => card.shadowRoot?.querySelector('.card'), 'card drawn');
  return { card, root: card.shadowRoot!, ...harness };
}

it('shows the time, a New best ribbon, and the rank of the player count', async () => {
  const { root } = await mount(result(), minesBoard);
  await waitUntil(() => root.textContent!.includes('12'), 'count loaded');
  expect(root.querySelector('.big')!.textContent).to.contain('38.1');
  expect(root.querySelector('.ribbon')!.textContent).to.contain('New best');
  expect(root.querySelector('.meta')!.textContent).to.contain('3rd of 12');
  expect(root.querySelector('.kicker')!.textContent).to.equal('You won · Beginner');
});

it('gives first place the First place ribbon and names who was passed', async () => {
  const board: ArcadeBoard = { ...minesBoard, top: [entry(1, 'Luuk Peters', 30_000, true), entry(2, 'Anna', 31_800)], viewer: entry(1, 'Luuk Peters', 30_000, true), above: null };
  const { root } = await mount(result({ rank: 1, rankText: '1st', value: 30_000, passed: { displayName: 'Anna', value: 31_800 } }), board);
  await waitUntil(() => root.querySelector('.ribbon'), 'ribbon');
  expect(root.querySelector('.ribbon')!.textContent).to.contain('First place');
  expect(root.querySelector('.meta')!.textContent).to.contain("past Anna's 31.8");
});

it('says where the best stands when this run is not a best', async () => {
  const leader = entry(1, 'Luuk Peters', 480, true);
  const snakeBoard: ArcadeBoard = { played: true, top: [leader, entry(2, 'Bram', 450), entry(3, 'Noor', 290)], viewer: leader, viewerIsPublic: true, canModerate: false, players: 9, above: null };
  const leads = await mount(result({ game: 'Pkg.Snake.Game', board: 'default', isPersonalBest: false, previousBest: 480, value: 310, rank: 1, rankText: '1st' }), snakeBoard);
  await waitUntil(() => leads.root.querySelector('.meta'), 'meta');
  expect(leads.root.querySelector('.meta')!.textContent).to.contain('Your best 480 still leads');
  expect(leads.root.querySelector('.ribbon')).to.equal(null);
});

it('says Game over when the game says so', async () => {
  const { card, root } = await mount(result({ game: 'Pkg.Snake.Game', board: 'default', value: 310 }), minesBoard);
  card.outcome = 'over';
  await card.updateComplete;
  expect(root.querySelector('.kicker')!.textContent).to.equal('Game over · Classic');
});

it('asks the first time, worded around the would-be rank, with two equal outlined answers and no actions yet', async () => {
  const { root } = await mount(result({ askedAboutPublic: false, isPublic: false }), minesBoard);
  await waitUntil(() => root.querySelector('.q')!.textContent!.includes('12'), 'count loaded');
  expect(root.querySelector('.q')!.textContent).to.contain("That's 3rd of 12.").and.contain('Arcade leaderboard');
  const answers = [...root.querySelectorAll('[data-answer]')] as HTMLElement[];
  expect(answers.map((a) => a.textContent!.trim())).to.deep.equal(['Yes, show my scores', 'No, only I see them']);
  expect(answers.every((a) => a.classList.contains('ghost'))).to.equal(true);
  expect(answers[0].getBoundingClientRect().width).to.be.closeTo(answers[1].getBoundingClientRect().width, 1);
  expect(root.querySelector('[data-action="play-again"]')).to.equal(null);
});

it('saves the answer through the Arcade, then shows the card with its actions', async () => {
  const { root, calls } = await mount(result({ askedAboutPublic: false, isPublic: false }), minesBoard);
  (root.querySelector('[data-answer="show"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('shown:true'), JSON.stringify(calls));
  await waitUntil(() => root.querySelector('[data-action="play-again"]'), 'actions');
  expect(root.querySelector('.quiet')).to.equal(null);
});

it('says when an answer could not be saved, keeps the question to retry, and clears the line on the next attempt', async () => {
  const harness = await arcadeHarness({ games: [minesweeper], board: minesBoard, failWrites: true });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:400px;height:420px"></div>`, { parentNode: harness.wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  card.lang = 'en';
  card.result = result({ askedAboutPublic: false, isPublic: false });
  box.append(card);
  const root = card.shadowRoot!;
  await waitUntil(() => root.querySelector('[data-answer="show"]'), 'question');
  (root.querySelector('[data-answer="show"]') as HTMLElement).click();
  await waitUntil(() => root.querySelector('.error'), 'error line');
  expect(root.querySelector('.error')!.textContent).to.contain('Your changes could not be saved.');
  expect(root.querySelector('[data-answer="show"]') !== null, 'the question stays').to.equal(true);
  expect(root.querySelector('[data-action="play-again"]') === null, 'no actions yet').to.equal(true);
  // The next attempt clears the line before it answers, so a second failure is a fresh message.
  let cleared = false;
  const watch = new MutationObserver(() => (cleared ||= root.querySelector('.error') === null));
  watch.observe(root, { childList: true, subtree: true });
  (root.querySelector('[data-answer="hide"]') as HTMLElement).click();
  await waitUntil(() => harness.calls.includes('shown:false'), JSON.stringify(harness.calls));
  await waitUntil(() => root.querySelector('.error') && cleared, 'cleared, then shown again');
  watch.disconnect();
});

it('ends every card with the quiet line while scores are hidden, and its link shows them', async () => {
  const hidden: ArcadeProfile = { ...shown, isPublic: false };
  const { root, calls } = await mount(result({ isPublic: false, isPersonalBest: false, value: 40_200, previousBest: 36_400 }), minesBoard, 400, hidden);
  await waitUntil(() => root.querySelector('.quiet'), 'quiet line');
  expect(root.querySelector('.quiet')!.textContent).to.contain('Your scores are hidden from the leaderboard.');
  expect(root.querySelector('.meta')!.textContent).to.contain('Your best 36.4').and.contain('would be 3rd');
  (root.querySelector('[data-action="show"]') as HTMLElement).click();
  await waitUntil(() => calls.includes('shown:true'), JSON.stringify(calls));
});

it('names the person to chase in its compact form', async () => {
  const { root } = await mount(result(), minesBoard, 280);
  await waitUntil(() => root.querySelector('.chase'), 'chase');
  expect(root.querySelector('.chase')!.textContent).to.equal('3.1 sec behind Bram');
});

it('fires leaderboard with its game and board, and play-again', async () => {
  const { card, root } = await mount(result(), minesBoard);
  await waitUntil(() => root.querySelector('[data-action="leaderboard"]'), 'actions');
  setTimeout(() => (root.querySelector('[data-action="leaderboard"]') as HTMLElement).click());
  const leaderboard = await oneEvent(card, 'leaderboard');
  expect(leaderboard.detail).to.deep.equal({ game: 'Pkg.Mines.Game', board: 'easy' });
  setTimeout(() => (root.querySelector('[data-action="play-again"]') as HTMLElement).click());
  await oneEvent(card, 'play-again');
});

it('reads the board once per result', async () => {
  const { card, calls } = await mount(result(), minesBoard);
  await new Promise((resolve) => setTimeout(resolve, 50));
  card.requestUpdate();
  await card.updateComplete;
  expect(calls.filter((c) => c.startsWith('getBoard'))).to.deep.equal(['getBoard:Pkg.Mines.Game:easy']);
});

it('draws no ring around the whole overlay when a game focuses it', async () => {
  const { card } = await mount(result(), minesBoard);
  // A key first, so the browser is in keyboard mode and would draw its focus ring if allowed.
  await sendKeys({ press: 'Shift' });
  card.tabIndex = -1;
  card.focus();
  expect(getComputedStyle(card).outlineStyle).to.equal('none');
});

it('draws nothing without a result', async () => {
  const harness = await arcadeHarness({ games: [minesweeper] });
  const card = await fixture<UmbraDesktopArcadeResultElement>(html`<umbradesktop-arcade-result></umbradesktop-arcade-result>`, { parentNode: harness.wrapper });
  expect(card.shadowRoot!.querySelector('.card')).to.equal(null);
});
