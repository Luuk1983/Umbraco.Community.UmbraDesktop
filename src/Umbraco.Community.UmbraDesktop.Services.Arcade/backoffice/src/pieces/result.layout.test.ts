import { expect, fixture, html, waitUntil } from '@open-wc/testing';
import type { ArcadeBoard } from '../api/arcade-api.js';
import type { ArcadeGameResult } from '../context/arcade.context.js';
import { arcadeHarness } from '../shared/harness.test-helper.js';
import { ARCADE_CARD_WIDTH_PX, ARCADE_COMPACT_BELOW_PX, ARCADE_COMPACT_CARD_WIDTH_PX, ARCADE_PIECE_MARGIN_PX } from './constants.js';
import './result.element.js';
import type { UmbraDesktopArcadeResultElement } from './result.element.js';

/** The one game the layout is measured with. */
const game = { alias: 'Pkg.Mines.Game', app: 'Pkg.Mines', label: 'Minesweeper', icon: 'icon-bomb', weight: 0, leaderboards: [{ alias: 'easy', label: 'Beginner', better: 'lower' as const, format: 'time' as const }] };
/** The player: 2nd with 38.1 seconds. */
const viewer = { rank: 2, userKey: 'k', displayName: 'Ada', value: 38_100, achievedAtUtc: '2026-10-03T09:00:00Z', isViewer: true };
/** A two-player board: Grace leads, the viewer is right behind. */
const board: ArcadeBoard = { played: true, top: [{ ...viewer, rank: 1, userKey: 'g', displayName: 'Grace', value: 30_000, isViewer: false }, viewer], viewer, viewerIsPublic: true, canModerate: false, players: 2, above: { ...viewer, rank: 1, userKey: 'g', displayName: 'Grace', value: 30_000, isViewer: false } };
/** The viewer's new best at 2nd, shown and already answered, so the card asks nothing. */
const result: ArcadeGameResult = { status: 'accepted', isPersonalBest: true, previousBest: null, rank: 2, isPublic: true, askedAboutPublic: true, displayName: 'Ada', passed: null, game: 'Pkg.Mines.Game', board: 'easy', value: 38_100, rankText: '2nd' };

/**
 * The same result for a player whose scores are hidden and whose run was not a best: the tallest
 * compact card, with the "would be" line, the chase line and the quiet line all drawn.
 */
const hiddenResult: ArcadeGameResult = { ...result, isPublic: false, isPersonalBest: false, previousBest: 36_400, value: 40_200 };

/**
 * The card in a box `width` wide and `height` high, optionally forced compact; resolves once the
 * board has loaded.
 */
async function inBox(width: number, compact = false, height = 360, given: ArcadeGameResult = result) {
  const { wrapper } = await arcadeHarness({ games: [game], board: given.isPublic ? board : { ...board, viewerIsPublic: false } });
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${width}px;height:${height}px"></div>`, { parentNode: wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  // English digits whatever the machine's language, so the widths measured are the same everywhere.
  card.lang = 'en';
  card.result = given;
  card.compact = compact;
  box.append(card);
  await waitUntil(() => card.shadowRoot?.querySelector('.short li'), 'board loaded');
  const shown = (selector: string) => getComputedStyle(card.shadowRoot!.querySelector(selector)!).display !== 'none';
  return { card, shown };
}

it(`draws the full form in a box ${ARCADE_COMPACT_BELOW_PX}px or wider`, async () => {
  const { shown } = await inBox(ARCADE_COMPACT_BELOW_PX);
  expect(shown('.short'), 'short board').to.equal(true);
  expect(shown('.compact-only'), 'compact parts').to.equal(false);
});

it('draws the compact form in a narrower box: no board, the chase line instead', async () => {
  const { shown } = await inBox(ARCADE_COMPACT_BELOW_PX - 1);
  expect(shown('.short'), 'short board').to.equal(false);
  expect(shown('.compact-only'), 'compact parts').to.equal(true);
});

it('draws the compact form in a wide box when forced', async () => {
  const { shown } = await inBox(ARCADE_COMPACT_BELOW_PX + 200, true);
  expect(shown('.short'), 'short board').to.equal(false);
});

it('keeps the card inside the box it is given', async () => {
  for (const width of [ARCADE_COMPACT_BELOW_PX - 20, ARCADE_COMPACT_BELOW_PX, 600]) {
    const { card } = await inBox(width);
    const box = card.getBoundingClientRect();
    const drawn = card.shadowRoot!.querySelector('.card')!.getBoundingClientRect();
    expect(drawn.left, `left at ${width}`).to.be.at.least(box.left);
    expect(drawn.right, `right at ${width}`).to.be.at.most(box.right);
  }
  // A game that gives the card less height than its state wants (a hidden player's compact card wants
  // about 240px) must still keep it inside the box top to bottom, scrolling rather than spilling.
  const { card } = await inBox(258, false, 200, hiddenResult);
  await waitUntil(() => card.shadowRoot!.querySelector('.quiet'), 'quiet line');
  const short = card.shadowRoot!.querySelector('.card')!;
  // The card rises 16px into place; measure where it settles, not where it starts.
  await Promise.all(short.getAnimations().map((a) => a.finished));
  const box = card.getBoundingClientRect();
  const drawn = short.getBoundingClientRect();
  expect(drawn.top, 'top in a short box').to.be.at.least(box.top);
  expect(drawn.bottom, 'bottom in a short box').to.be.at.most(box.bottom);
});

/** One card state the games' boxes must hold whole: what the Arcade answered, and what the board reads. */
interface CardState {
  /** What the test calls it. */
  name: string;
  /** What `submit` handed back. */
  result: ArcadeGameResult;
  /** What `getBoard` answers. */
  board: ArcadeBoard;
  /** Answer the first-time question and have the save refused, so the error line shows. */
  failSave?: boolean;
  /** A part of the card that must be drawn, so the test measures the state it names. */
  expect: string;
}

/**
 * A twelve-player board with the viewer at `rank`, Grace leading and Hugo right above, so the full
 * card's short board draws its tallest shape (leader, gap, the player above, the viewer) whenever the
 * viewer is below third.
 * @param rank The viewer's rank.
 * @param value The viewer's score.
 * @param shown Whether the viewer's scores are shown.
 * @returns The board.
 */
function twelve(rank: number, value: number, shown = true): ArcadeBoard {
  const me = { ...viewer, rank, value };
  const grace = { ...viewer, rank: 1, userKey: 'g', displayName: 'Grace Hopper-Lovelace', value: 30_000, isViewer: false };
  const hugo = { ...viewer, rank: rank - 1, userKey: 'h', displayName: 'Hugo van der Berg', value: value - 900, isViewer: false };
  const top = rank === 1 ? [me, { ...grace, rank: 2, value: value + 900 }] : [grace, hugo, me];
  return { played: true, top, viewer: me, viewerIsPublic: shown, canModerate: false, players: 12, above: rank > 1 ? hugo : null };
}

/**
 * The compact card's states, tallest first by eye: Minesweeper's whole game area must hold every one.
 * A new best with someone to chase; the first-time question (its two answers stacked); a hidden
 * player's run with the "would be" line, the chase line and the quiet line; and the question again
 * with the failed-save line under it.
 */
const compactStates: CardState[] = [
  { name: 'new best with chase', result: { ...result, rank: 5, rankText: '5th' }, board: twelve(5, 38_100), expect: '.chase' },
  { name: 'first-time question', result: { ...result, askedAboutPublic: false, isPublic: false, rank: 5, rankText: '5th' }, board: twelve(5, 38_100, false), expect: '[data-answer="hide"]' },
  { name: 'hidden with quiet line', result: { ...hiddenResult, rank: 5, rankText: '5th' }, board: twelve(5, 36_400, false), expect: '.quiet' },
  { name: 'failed-save error', result: { ...result, askedAboutPublic: false, isPublic: false, rank: 5, rankText: '5th' }, board: twelve(5, 38_100, false), failSave: true, expect: '.error' },
];

/**
 * The full card's states: Snake's whole game area must hold every one. A new best below third (the
 * short board with its gap); first place, past the old leader; a run that was not a best; a hidden
 * player's run with its quiet line; and the two question states, since a first game of Snake asks too.
 */
const fullStates: CardState[] = [
  { name: 'new best', result: { ...result, rank: 5, rankText: '5th' }, board: twelve(5, 38_100), expect: '.short .gap' },
  { name: 'first place with passed', result: { ...result, rank: 1, rankText: '1st', passed: { displayName: 'Grace Hopper-Lovelace', value: 30_900 } }, board: twelve(1, 30_000), expect: '.ribbon .crown' },
  { name: 'not a best', result: { ...result, isPersonalBest: false, previousBest: 35_420, value: 61_230, rank: 5, rankText: '5th' }, board: twelve(5, 35_420), expect: '.short .gap' },
  { name: 'hidden with quiet line', result: { ...hiddenResult, rank: 5, rankText: '5th' }, board: twelve(5, 36_400, false), expect: '.quiet' },
  compactStates[1],
  compactStates[3],
];

/** The two type set-ups the games' boxes are checked under: the Umbraco theme's, and Umbraco 4's, whose Verdana was the widest. */
const typesettings = [
  { theme: 'umbraco', font: 'Lato, "Helvetica Neue", Helvetica, Arial, sans-serif' },
  { theme: 'umbraco4', font: 'Verdana, Geneva, Tahoma, "DejaVu Sans", sans-serif' },
];

/**
 * Draw one state of the real card in a box the size of a game's whole content and settle it.
 * @param state The state.
 * @param width The box's width.
 * @param height The box's height.
 * @param typesetting The theme stamp and the app font the theme publishes.
 * @returns The drawn card part, settled.
 */
async function drawState(state: CardState, width: number, height: number, typesetting: (typeof typesettings)[number]) {
  const { wrapper } = await arcadeHarness({ games: [game], board: state.board, theme: typesetting.theme, failWrites: state.failSave });
  wrapper.style.setProperty('--umbradesktop-app-font', typesetting.font);
  wrapper.style.fontSize = '14px';
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:${width}px;height:${height}px"></div>`, { parentNode: wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  card.lang = 'en';
  card.result = state.result;
  box.append(card);
  await waitUntil(() => card.getAttribute('data-umbradesktop-theme') === typesetting.theme && card.shadowRoot?.querySelector('.card'), 'themed');
  // Every state waits for the board: an answered card draws its short board from it, the question
  // states the would-be rank "of 12" once the count is in.
  await waitUntil(() => card.shadowRoot!.querySelector('.short li') || card.shadowRoot!.textContent!.includes('of 12'), 'board loaded');
  if (state.failSave) {
    card.shadowRoot!.querySelector<HTMLElement>('[data-answer="show"]')!.click();
  }
  await waitUntil(() => card.shadowRoot!.querySelector(state.expect), `${state.name}: ${state.expect} drawn`);
  const drawn = card.shadowRoot!.querySelector<HTMLElement>('.card')!;
  await Promise.all(drawn.getAnimations({ subtree: true }).map((a) => a.finished));
  return drawn;
}

for (const typesetting of typesettings) {
  for (const [form, width, height, states] of [
    ['compact', 274, 316, compactStates],
    ['full', 312, 354, fullStates],
  ] as const) {
    for (const state of states) {
      it(`holds the ${form} card's "${state.name}" whole in a ${width}x${height} game area under ${typesetting.theme}`, async () => {
        const drawn = await drawState(state, width, height, typesetting);
        // The form by the card's width, which every state has; the question states draw no compact-only part.
        const drawnWidth = drawn.getBoundingClientRect().width;
        expect(drawnWidth, `${form} form`).to.equal(form === 'compact' ? ARCADE_COMPACT_CARD_WIDTH_PX : ARCADE_CARD_WIDTH_PX);
        // The height the card wants, and the box it needs with the piece margin above and below: what
        // the developer guide's advice on the box quotes.
        console.log(`card height ${typesetting.theme} ${form} "${state.name}": ${drawn.scrollHeight}px, box ${drawn.scrollHeight + 2 * ARCADE_PIECE_MARGIN_PX}px`);
        expect(drawn.scrollHeight <= drawn.clientHeight, `no scroll (${drawn.scrollHeight} in ${drawn.clientHeight})`).to.equal(true);
      });
    }
  }
}

/**
 * Minesweeper's old well under Umbraco 4, where the card used to sit: 258px square, the theme's
 * Verdana as the app font, and a shown player's run that was not a best (the "Your best 35.4 · 3rd of
 * 12" line, the chase line, Leaderboard and Play again). Verdana's width wrapped three of those lines
 * and the card scrolled by 5px in the real window; the theme's body font in `look.ts` is what fixes it.
 * The card now covers the whole game (the cases above); this tighter square stays as the guard on that font.
 */
it('fits the compact card in a 258px square under Umbraco 4 without scrolling', async () => {
  const later: ArcadeGameResult = { ...result, isPersonalBest: false, previousBest: 35_420, value: 61_230, rank: 3, rankText: '3rd' };
  const { wrapper } = await arcadeHarness({ games: [game], board: { ...board, players: 12 }, theme: 'umbraco4' });
  wrapper.style.setProperty('--umbradesktop-app-font', 'Verdana, Geneva, Tahoma, "DejaVu Sans", sans-serif');
  wrapper.style.fontSize = '14px';
  const box = await fixture<HTMLDivElement>(html`<div style="position:relative;width:258px;height:258px"></div>`, { parentNode: wrapper });
  const card = document.createElement('umbradesktop-arcade-result') as UmbraDesktopArcadeResultElement;
  card.lang = 'en';
  card.outcome = 'won';
  card.result = later;
  box.append(card);
  await waitUntil(() => card.getAttribute('data-umbradesktop-theme') === 'umbraco4' && card.shadowRoot?.querySelector('.chase'), 'themed, board loaded');
  const drawn = card.shadowRoot!.querySelector<HTMLElement>('.card')!;
  await Promise.all(drawn.getAnimations().map((a) => a.finished));
  expect(drawn.scrollHeight <= drawn.clientHeight, `no scroll (${drawn.scrollHeight} in ${drawn.clientHeight})`).to.equal(true);
  const acts = drawn.querySelector<HTMLElement>('.acts')!;
  for (const action of acts.querySelectorAll('button')) {
    expect(action.getBoundingClientRect().height < 40, `${action.textContent!.trim()} on one line`).to.equal(true);
  }
});
