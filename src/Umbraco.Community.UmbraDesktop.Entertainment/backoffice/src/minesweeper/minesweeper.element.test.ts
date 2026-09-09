import { expect, fixture, html } from '@open-wc/testing';
import './minesweeper.element.js';
import {
  MINESWEEPER_BEGINNER,
  MINESWEEPER_CELL_SIZE_PX,
  MINESWEEPER_CONTENT_SIZE,
  MINESWEEPER_MIN_CONTENT_SIZE,
  MINESWEEPER_PADDING_PX,
} from './constants.js';
import type { MinesweeperElement } from './minesweeper.element.js';
import type { MinesweeperPlacer } from './rules.js';

/** A placer that mines exactly the cells a case names. Mirrors `rules.test.ts`'s. */
function placeAt(indices: number[]): MinesweeperPlacer {
  return () => indices;
}

/**
 * A wall of mines down the beginner board's middle column, plus one in the far corner to make up
 * the ten.
 *
 * Every case that clicks a cell and then cares what happened next uses this rather than the random
 * placer, and the reason is not only determinism: a random beginner layout can occasionally be
 * cleared by a single click, which would silently turn "clicking a cell reveals it" into a test of
 * the won state. The wall makes a one-click win impossible.
 */
const WALL = [4, 13, 22, 31, 40, 49, 58, 67, 76, 8];
/** A corner with no adjacent mine under {@link WALL}, so a first click there floods and plays on. */
const SAFE_CORNER = 72;
/** One of {@link WALL}'s mines, in the middle of the wall. */
const MINED_CELL = 40;

/**
 * A mounted game.
 *
 * Every case goes through the DOM from here on: these are tests of what a player can do, not of the
 * element's fields, so the rules module's own coverage is not repeated through a second surface.
 * @param placer Optional mine placement, for the cases that need to know where a mine is.
 * @returns The mounted element, after its first render.
 */
async function game(placer?: MinesweeperPlacer): Promise<MinesweeperElement> {
  return await fixture<MinesweeperElement>(
    html`<umbradesktop-minesweeper .placer=${placer}></umbradesktop-minesweeper>`,
  );
}

/** Every cell button, in board order. */
function cells(element: MinesweeperElement): HTMLButtonElement[] {
  return [...(element.shadowRoot?.querySelectorAll<HTMLButtonElement>('.cell') ?? [])];
}

/** One element's text, whitespace collapsed, for asserting on a display. */
function text(element: MinesweeperElement, selector: string): string {
  return (element.shadowRoot?.querySelector(selector)?.textContent ?? '').trim();
}

/** Let the element finish re-rendering after a gesture. */
async function settled(element: MinesweeperElement): Promise<void> {
  await element.updateComplete;
}

it('renders a full board of closed cells and a mine counter showing every mine', async () => {
  const element = await game();
  expect(cells(element).length, 'a cell per square of the beginner board').to.equal(
    MINESWEEPER_BEGINNER.width * MINESWEEPER_BEGINNER.height,
  );
  expect(
    cells(element).every((cell) => cell.dataset.state === 'closed'),
    'nothing open before the first click',
  ).to.equal(true);
  expect(text(element, '.mines'), 'the counter starts at the mine count').to.equal('010');
});

it('reveals a cell when it is clicked', async () => {
  const element = await game(placeAt(WALL));
  cells(element)[SAFE_CORNER].click();
  await settled(element);
  expect(cells(element)[SAFE_CORNER].dataset.state, 'the cell the player clicked').to.equal('open');
});

it('flags a cell on the flag gesture, and unflags it on a second', async () => {
  const element = await game();
  cells(element)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await settled(element);
  expect(cells(element)[0].dataset.state, 'flagged').to.equal('flagged');
  expect(text(element, '.mines'), 'and the counter came down with it').to.equal('009');
  cells(element)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await settled(element);
  expect(cells(element)[0].dataset.state, 'unflagged again').to.equal('closed');
});

it('does nothing when a flagged cell is clicked', async () => {
  const element = await game();
  cells(element)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await settled(element);
  cells(element)[0].click();
  await settled(element);
  expect(cells(element)[0].dataset.state, 'the flag protected it from the click').to.equal('flagged');
});

it('ends the game when a mine is clicked, and shows the board with it', async () => {
  const element = await game(placeAt(WALL));
  cells(element)[SAFE_CORNER].click();
  await settled(element);
  cells(element)[MINED_CELL].click();
  await settled(element);
  expect(cells(element)[MINED_CELL].textContent?.trim(), 'the mine is showing').to.not.equal('');
  expect(
    cells(element).every((cell) => cell.dataset.state !== 'closed'),
    'and so is every other cell',
  ).to.equal(true);
  expect(text(element, '.outcome'), 'with something said about it').to.not.equal('');
});

it('resets to a fresh board on the new-game affordance', async () => {
  const element = await game(placeAt(WALL));
  cells(element)[SAFE_CORNER].click();
  cells(element)[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  await settled(element);
  element.shadowRoot?.querySelector<HTMLButtonElement>('.new-game')?.click();
  await settled(element);
  expect(
    cells(element).every((cell) => cell.dataset.state === 'closed'),
    'nothing open and nothing flagged',
  ).to.equal(true);
  expect(text(element, '.mines'), 'and the counter is back where it started').to.equal('010');
  expect(text(element, '.clock'), 'as is the clock').to.equal('000');
});

it('renders with no theme attribute at all, since there is none until the desktop resolves one', async () => {
  const element = await game();
  expect(element.hasAttribute('data-umbradesktop-theme'), 'no theme yet').to.equal(false);
  const cell = cells(element)[0];
  expect(getComputedStyle(cell).display, 'the grid is painted anyway').to.not.equal('none');
  expect(getComputedStyle(cell).backgroundImage, 'a surface token, not a dropped gradient').to.equal('none');
  expect(getComputedStyle(cell).width, 'and sized from its own constants').to.equal(
    `${MINESWEEPER_CELL_SIZE_PX}px`,
  );
});

it('renders under an unrecognised theme id exactly as it does with none', async () => {
  const element = await game();
  const plain = getComputedStyle(cells(element)[0]).boxShadow;
  element.setAttribute('data-umbradesktop-theme', 'gnome-someday');
  await settled(element);
  expect(getComputedStyle(cells(element)[0]).boxShadow, 'the unbranched rules are the base case').to.equal(
    plain,
  );
});

it('draws two-tone bevels under the Windows 98 theme, read from CSS rather than the constructor', async () => {
  const element = await game();
  const plain = getComputedStyle(cells(element)[0]).boxShadow;
  element.setAttribute('data-umbradesktop-theme', 'win98');
  await settled(element);
  const bevelled = getComputedStyle(cells(element)[0]).boxShadow;
  expect(bevelled, 'the one deliberate per-theme branch took effect').to.not.equal(plain);
  expect(bevelled, 'and it is a real bevel, not one shadow').to.contain('inset');
});

/**
 * Open against closed, which is the only thing a Minesweeper board actually has to say.
 *
 * This shipped broken and was reported as "the game is unplayable": under the Umbraco and
 * Umbraco 4 themes a closed cell and an opened one rendered in the same colour. The cause was not
 * a mistake in either palette but a wrong assumption in this app, which drew the two states as
 * `surface-raised` against `surface-sunken` and took it on trust that a theme would put them far
 * enough apart to see. Nothing in the contract promises that, and `docs/desktop-apps.md` §4 is
 * explicit about which pairs *are* promised: text on the three surfaces, and `border` against all
 * three at 3:1. The gap between two surfaces is not on the list — Umbraco's own surface family
 * spans 1.07:1 at its widest — so an app that leans on it is relying on a number no theme ever
 * agreed to supply.
 *
 * So the cases below are not the five shipped themes. They are the **worst palette the contract
 * still allows**: all three surfaces exactly one colour, and `border` at exactly the 3:1 it
 * guarantees and not a shade more. A test against copies of the five real palettes would pass on
 * stale numbers the day a theme changed one, and would say nothing at all about the sixth theme.
 * This one cannot go stale, because there is nothing in it to drift from.
 */

/** One theme's app tokens, as the desktop publishes them on the element. */
type AppTokens = Readonly<Record<string, string>>;

/**
 * The flattest light theme the app token contract permits: one surface for all three roles.
 *
 * `#a3a3a3` is not a colour any theme ships. It is the exact 3:1 against white, so it is the
 * *weakest* boundary colour a conforming theme could publish, and a case built on it proves the
 * board works under every theme that clears the bar rather than only under the ones that clear it
 * comfortably. The edges are set to nothing for the same reason: `edge-width` is documented as
 * legitimately `0px` and `edge-light` as legitimately `transparent`, so a bevel is not something
 * this app may count on either.
 */
const FLATTEST_LIGHT_THEME: AppTokens = {
  '--umbradesktop-app-surface': '#ffffff',
  '--umbradesktop-app-surface-raised': '#ffffff',
  '--umbradesktop-app-surface-sunken': '#ffffff',
  '--umbradesktop-app-border': '#a3a3a3',
  '--umbradesktop-app-edge-light': 'transparent',
  '--umbradesktop-app-edge-dark': '#ffffff',
  '--umbradesktop-app-edge-width': '0px',
  '--umbradesktop-app-text': '#000000',
};

/**
 * The same, inverted: the flattest dark theme, where `#595959` is the exact 3:1 against black.
 *
 * Present as its own case rather than folded into the one above because the answer has to hold in
 * both directions and the arithmetic is not symmetric — sRGB's transfer curve compresses the dark
 * end, so the same mix buys a smaller ratio here. It is also the half that says what "grey closed,
 * white open" means on a dark theme: not grey and not white, but the closed cell moved *away* from
 * the well rather than toward black, which is the direction assertion below.
 */
const FLATTEST_DARK_THEME: AppTokens = {
  '--umbradesktop-app-surface': '#000000',
  '--umbradesktop-app-surface-raised': '#000000',
  '--umbradesktop-app-surface-sunken': '#000000',
  '--umbradesktop-app-border': '#595959',
  '--umbradesktop-app-edge-light': 'transparent',
  '--umbradesktop-app-edge-dark': '#000000',
  '--umbradesktop-app-edge-width': '0px',
  '--umbradesktop-app-text': '#ffffff',
};

/**
 * Rasterise a CSS colour to the 8-bit channels a screen would show.
 *
 * Through a canvas rather than by parsing the string, and that is not belt and braces. A cell's
 * ground is a `color-mix()`, and Chrome reports one back from `getComputedStyle` as
 * `color(srgb 0.77 0.77 0.77)` while a plain token resolves to `rgb(255, 255, 255)`. Comparing
 * those two as text, or with one regex that happens to fit both, is how a measurement quietly
 * starts reading the wrong numbers. Painting each one and reading the pixel compares what a player
 * sees, in the only units they see it in.
 * @param colour Any CSS colour, in any notation the browser accepts.
 * @returns The `[r, g, b]` channels in 0-255.
 */
function paint(colour: string): [number, number, number] {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  expect(context, 'a 2d canvas context, which every browser this runs in has').to.not.equal(null);
  context!.fillStyle = colour;
  context!.fillRect(0, 0, 1, 1);
  const [r, g, b] = context!.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/**
 * Relative luminance per WCAG 2.1, mirroring the desktop's own `app-tokens.test.ts`.
 * @param rgb The `[r, g, b]` channels in 0-255.
 * @returns Relative luminance in 0-1.
 */
function luminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * The WCAG contrast ratio between two painted colours.
 * @param a One colour.
 * @param b The other.
 * @returns The ratio, from 1 (identical) to 21 (black on white).
 */
function contrast(a: string, b: string): number {
  const pair = [luminance(paint(a)), luminance(paint(b))];
  return (Math.max(...pair) + 0.05) / (Math.min(...pair) + 0.05);
}

/**
 * The smallest fill step between an open cell and a closed one that counts as telling them apart.
 *
 * Measured rather than chosen. What shipped and was reported unplayable was **1.03:1** under both
 * Umbraco themes. What shipped and nobody has ever remarked on is 1.28:1 under macOS and 1.30:1
 * under Windows 11, and 1.84:1 under Windows 98, which is the original and the reference for what
 * this is supposed to look like. The floor sits below all of those and well above the bug, because
 * the number that has to hold is the one the *flattest permitted* theme produces — 1.16:1 on the
 * dark case above, where sRGB's curve gives the least for the same mix — and a floor a real theme
 * could not fail would not be testing anything.
 *
 * Deliberately not 3:1. WCAG 1.4.11 asks that of a control's *boundary*, which on this board is
 * the grid ruling and is drawn in the one token that guarantees it. A fill step of 3:1 between two
 * neighbouring cells would be a board of two violently different greys, which is not what any of
 * the five themes looks like and not what the original did either.
 */
const CELL_STATE_FILL_STEP = 1.15;

for (const [variant, tokens] of [
  ['a light theme with one surface for all three roles', FLATTEST_LIGHT_THEME],
  ['a dark theme with one surface for all three roles', FLATTEST_DARK_THEME],
] as const) {
  it(`tells an open cell from a closed one under ${variant}`, async () => {
    const element = await game(placeAt(WALL));
    element.setAttribute(
      'style',
      Object.entries(tokens)
        .map(([token, value]) => `${token}: ${value}`)
        .join('; '),
    );
    await settled(element);
    cells(element)[SAFE_CORNER].click();
    await settled(element);

    const open = cells(element).find((cell) => cell.dataset.state === 'open');
    const closed = cells(element).find((cell) => cell.dataset.state === 'closed');
    expect(open, 'the click should have opened at least one cell').to.not.equal(undefined);
    expect(closed, 'and the wall should have left at least one closed').to.not.equal(undefined);

    const openFill = getComputedStyle(open!).backgroundColor;
    const closedFill = getComputedStyle(closed!).backgroundColor;

    expect(
      contrast(openFill, closedFill),
      `an opened cell and a closed one are ${openFill} and ${closedFill} here, which is the whole ` +
        'state of the game and has to be visible under any theme that meets the contract, not only ' +
        'under one that happens to put its raised and sunken surfaces far apart',
    ).to.be.at.least(CELL_STATE_FILL_STEP);

    // Which of the two is the darker one is not a matter of taste. Windows 98 is the original and
    // the reference: a closed cell is grey material and an opened one is the white field beneath
    // it. `border` is the only token whose direction is fixed by the contract — it must clear 3:1
    // against every surface, so it is necessarily darker than a light theme's ground and lighter
    // than a dark theme's — which makes "toward border" the one way to say "the material side"
    // that also inverts correctly on a dark theme, where the closed cell has to come *up* off the
    // field rather than down into it.
    const ground = luminance(paint(openFill));
    const material = luminance(paint(getComputedStyle(element).getPropertyValue('--umbradesktop-app-border')));
    expect(
      Math.sign(luminance(paint(closedFill)) - ground),
      'a closed cell must sit on the same side of the open field as the theme\'s own boundary ' +
        'colour: grey material over a white hole on a light theme, and the other way up on a dark ' +
        'one. macOS and Windows 11 shipped it inverted — a white closed cell on a grey field — ' +
        'because `surface-raised` is a control face and both of those themes make a control face ' +
        'white, which is right for a button and backwards for a tile you have not lifted yet',
    ).to.equal(Math.sign(material - ground));
  });
}

/**
 * The board's geometry against the window it is given, which is where three reported bugs met.
 *
 * `meta.defaultSize` and `meta.minSize` are the app's **content** size: the host adds the chrome,
 * because the host is the only party that knows what a titlebar, a frame ring and a sunken well
 * cost under the theme in force. So what this app declares has to be exactly the box it occupies —
 * no titlebar allowance guessed at, no slack for a bevel width it cannot read — and the board has
 * to sit sensibly in a box that is *bigger* than that, because a maximized window is.
 *
 * The box is mounted as a `grid` rather than left to the fixture's own width, because that is how
 * the real window hands the app its body: a stretched flex item of an exact size. A test that let
 * the element size itself would measure the element's intrinsic layout and prove nothing about
 * either case.
 */

/**
 * Mount the game in a box of an exact size, the way a window body hands it one.
 *
 * Appended by hand rather than through `fixture`, and that is not a style preference: `fixture`
 * awaits `elementUpdated` on whatever it was given, and for a plain `<div>` that means a
 * `nextFrame()` the runner's backgrounded page never delivers. Every case below hung for the full
 * Mocha timeout before this was a hand-rolled mount. {@link game} above gets away with `fixture`
 * because its root is a Lit element, so the wait is an `updateComplete` instead.
 * @param size The content box to give it, in px.
 * @param style Extra inline style for the box, for the case that sets an app token on it.
 * @param theme The theme id to stamp on the element, as the desktop stamps one, or undefined for
 * the moment before a theme has resolved.
 * @returns The box, the game inside it after its first render, and a teardown.
 */
async function boxed(size: { w: number; h: number }, style = '', theme?: string) {
  const host = document.createElement('div');
  // `grid` so the element is stretched to the box on both axes, which is what the window's own
  // flex body does to it. Left to its own devices the element would size to its content and every
  // measurement below would be of the element rather than of the fit.
  host.setAttribute('style', `display: grid; width: ${size.w}px; height: ${size.h}px; ${style}`);
  document.body.appendChild(host);
  const element = document.createElement('umbradesktop-minesweeper') as MinesweeperElement;
  if (theme !== undefined) element.setAttribute('data-umbradesktop-theme', theme);
  host.appendChild(element);
  await element.updateComplete;
  return { host, element, dispose: () => host.remove() };
}

/**
 * The one box holding everything the game draws, which is the box that gets centred.
 * @param element The mounted game.
 * @returns Its rectangle.
 */
function board(element: MinesweeperElement): DOMRect {
  const node = element.shadowRoot?.querySelector('.board') ?? null;
  expect(
    node,
    'the game should wrap its own content in one box, so that box can be centred in a window ' +
      'larger than it — a maximized window otherwise leaves the board glued to the top-left ' +
      'corner with an empty expanse beside it',
  ).to.not.equal(null);
  return (node as HTMLElement).getBoundingClientRect();
}

/**
 * Assert every edge of the board is inside the box it was given.
 * @param host The box the game was mounted in.
 * @param element The mounted game.
 * @param why What the caller was doing when it should have fitted.
 */
function expectFullyVisible(host: HTMLElement, element: MinesweeperElement, why: string): void {
  const box = host.getBoundingClientRect();
  const rect = board(element);
  for (const [side, overflow] of [
    ['left', box.left - rect.left],
    ['top', box.top - rect.top],
    ['right', rect.right - box.right],
    ['bottom', rect.bottom - box.bottom],
  ] as const) {
    expect(
      overflow,
      `${why}: the board runs ${overflow}px past the ${side} edge of the window body, and the ` +
        'window clips it. Centring content that does not fit hides it at both ends instead of one',
    ).to.be.at.most(0);
  }
}

/**
 * Every theme id the desktop can stamp on this element, plus the moment before it has stamped one.
 *
 * Hardcoded, because there is nothing to import: the host's npm package is private and its NuGet
 * package ships JavaScript, so the five ids are published as prose in `docs/desktop-apps.md` §7 and
 * an app reads them from there. A sixth theme would not appear here, which is the honest limit of
 * this list — but it also could not break the assertion below, since the one rule that keys off an
 * id is a refinement on top of rules that hold for every theme.
 */
const THEME_IDS = [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98'] as const;

for (const theme of THEME_IDS) {
  const under = theme === undefined ? 'before a theme resolves' : `under the ${theme} theme`;

  it(`occupies exactly the content size its manifest asks the host for, ${under}`, async () => {
    const { host, element, dispose } = await boxed(MINESWEEPER_CONTENT_SIZE, '', theme);
    try {
      expectFullyVisible(host, element, 'at the size it declares');
      const rect = board(element);

      // Exact, in both directions, **under every theme**, and that last part is the case this went
      // green without. `meta.defaultSize` is one number for all five themes, so a rule that keys
      // off a theme id and changes a term of it makes the app the wrong size under exactly one
      // theme: `:host([data-umbradesktop-theme='win98']) .grid { gap: 0 }` dropped eight pixels
      // from each axis, and Windows 98 opened a window with a dead band inside the frame. Too small
      // a declaration clips the board instead — the earlier report, where the outcome line was
      // never counted and the last row of cells landed on that theme's bottom bevel.
      expect(
        rect.width,
        "the width the manifest declares should be the board plus this app's own padding, exactly: " +
          'every term in that sum is in constants.ts and every one of them is this app\'s to know',
      ).to.equal(MINESWEEPER_CONTENT_SIZE.w - 2 * MINESWEEPER_PADDING_PX);
      expect(
        rect.height,
        'and the same on the axis that broke: status row, board and five paddings. No titlebar, ' +
          'because the host adds its own chrome, and no outcome row, because the outcome is drawn ' +
          'over the board rather than under it',
      ).to.equal(MINESWEEPER_CONTENT_SIZE.h - 2 * MINESWEEPER_PADDING_PX);
    } finally {
      dispose();
    }
  });
}

/**
 * The outcome banner is drawn over the board, so it must not change the board's size when it
 * appears.
 *
 * It was a row with a fixed height and a margin above it, both counted into the size the manifest
 * declares, which meant every window this game ever opened in carried 32px of empty space for a
 * line that says nothing until the last click. That was reported as too much space by default, on
 * the theme whose frame is tightest around it. Measured rather than asserted about the CSS, because
 * `position: absolute` is only half of it: a banner with a margin, or one that stretched its
 * containing block, would still cost the layout it is supposed not to.
 */
it('says how the game ended without taking any of the window to do it', async () => {
  const element = await game(placeAt(WALL));
  const before = element.shadowRoot?.querySelector('.board')?.getBoundingClientRect();

  cells(element)[SAFE_CORNER].click();
  await settled(element);
  cells(element)[MINED_CELL].click();
  await settled(element);

  expect(text(element, '.outcome'), 'the game says what happened').to.not.equal('');
  const after = element.shadowRoot?.querySelector('.board')?.getBoundingClientRect();
  expect(after?.width, 'and the board is the same width it was').to.equal(before?.width);
  expect(after?.height, 'and the same height, so the window it asked for is still the right one').to.equal(
    before?.height,
  );
});

/**
 * A banner that spans a row of cells must not intercept their clicks.
 *
 * The whole point of drawing it out of flow is that it is there for the entire game rather than
 * only at the end of one, so for all but a few seconds it is an invisible empty box lying across
 * the middle of the board. Without `pointer-events: none` it would swallow every click aimed at the
 * row underneath, which is a game that stops working in its own middle and no test of the rules
 * would notice.
 */
it('lets a click through the invisible banner to the cell underneath', async () => {
  const element = await game(placeAt(WALL));
  const middle = cells(element)[Math.floor(MINESWEEPER_BEGINNER.width * MINESWEEPER_BEGINNER.height / 2)];
  const rect = middle.getBoundingClientRect();
  const hit = element.shadowRoot?.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

  expect(hit, 'the cell in the middle of the board is what the pointer finds there').to.equal(middle);
});

it('centres the board in a window larger than it needs', async () => {
  const { host, element, dispose } = await boxed({
    w: MINESWEEPER_CONTENT_SIZE.w + 300,
    h: MINESWEEPER_CONTENT_SIZE.h + 200,
  });
  try {
    const box = host.getBoundingClientRect();
    const rect = board(element);

    expect(
      (rect.left + rect.right) / 2 - (box.left + box.right) / 2,
      'a maximized window is much wider than the board, and a 9x9 grid does not reflow, so the ' +
        'board centres itself at its natural size rather than sitting in the top-left corner',
    ).to.be.closeTo(0, 1);
    expect((rect.top + rect.bottom) / 2 - (box.top + box.bottom) / 2, 'vertically too').to.be.closeTo(0, 1);
  } finally {
    dispose();
  }
});

/**
 * The board's size must not depend on `--umbradesktop-app-edge-width`, which is the theme's to set
 * and cannot be read from a manifest.
 *
 * This is what killed the app's `EDGE_SLACK_PX`: a well drawn with a `border` grew by twice
 * whatever the theme published, so the size the manifest declared was right under the themes whose
 * controls are flat and two to four pixels short under the ones whose controls are bevelled — and
 * the only fix available from inside the app was to over-declare by the widest bevel it knew of and
 * hope no theme ever wanted a wider one. Drawing that edge as a spread shadow costs no layout, so
 * the declared size is exact under any value a theme picks, including one no shipped theme uses.
 */
it('declares a size that does not depend on the theme edge width it cannot read', async () => {
  const { host, element, dispose } = await boxed(MINESWEEPER_MIN_CONTENT_SIZE, '--umbradesktop-app-edge-width: 6px;');
  try {
    expectFullyVisible(host, element, 'under a theme with a 6px bevel');
  } finally {
    dispose();
  }
});

it('keeps the whole board visible at its declared minimum', async () => {
  const { host, element, dispose } = await boxed(MINESWEEPER_MIN_CONTENT_SIZE);
  try {
    expectFullyVisible(host, element, 'at the smallest window the user can drag to');
  } finally {
    dispose();
  }
});

/**
 * Two games at once share nothing, which is what makes `allowMultiple` safe to turn on.
 *
 * Everything mutable lives in the element's own reactive fields: the board, the elapsed count and
 * the clock handle. The module-level constants beside them are frozen data — glyphs, the digit
 * colours, the display width — and `rules.ts` is pure, taking a board and returning a new one. So
 * this is a real assertion rather than a formality: a board cached in a module variable, or a clock
 * handle kept there, would show up here as one window's click landing on the other's grid.
 */
it('keeps two open games entirely separate', async () => {
  const first = await game(placeAt(WALL));
  const second = await game(placeAt(WALL));

  cells(first)[SAFE_CORNER].click();
  await settled(first);
  await settled(second);

  expect(cells(first)[SAFE_CORNER].dataset.state, 'the clicked board opened its cell').to.equal('open');
  expect(
    cells(second).every((cell) => cell.dataset.state === 'closed'),
    'and the other board is untouched: nothing about a game lives at module scope, which is why ' +
      'two windows are allowed',
  ).to.equal(true);
  expect(text(second, '.clock'), "nor is the second game's clock running on the first's click").to.equal('000');
});

it('cancels its clock when the window closes', async () => {
  const started: number[] = [];
  const cleared: number[] = [];
  const nativeSet = window.setInterval;
  const nativeClear = window.clearInterval;
  window.setInterval = ((...args: Parameters<typeof window.setInterval>) => {
    const handle = nativeSet.apply(window, args);
    started.push(handle);
    return handle;
  }) as typeof window.setInterval;
  window.clearInterval = ((handle?: number) => {
    if (handle !== undefined) cleared.push(handle);
    return nativeClear.call(window, handle);
  }) as typeof window.clearInterval;
  try {
    const element = await game(placeAt(WALL));
    cells(element)[SAFE_CORNER].click();
    await settled(element);
    expect(started.length, 'the first click started the clock').to.be.greaterThan(0);
    element.remove();
    expect(cleared, 'and closing the window stopped it').to.include(started[started.length - 1]);
  } finally {
    window.setInterval = nativeSet;
    window.clearInterval = nativeClear;
  }
});
