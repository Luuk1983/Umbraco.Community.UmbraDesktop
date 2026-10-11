import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';
import { adoptIconStandIn, mountLauncher } from '../../components/launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from '../../components/launcher.test-helper.js';
import type { UmbraDesktopApp } from '../../types.js';

/**
 * What a tile label does with a word that is wider than the tile, in every theme, in the launcher
 * and in arrange mode.
 *
 * Issue #121: the Entertainment add-on's Minesweeper tile read "Minesweepe" / "r". Chrome's English
 * hyphenation has no break point in that word at the tile's width, so the label fell back to
 * `overflow-wrap: anywhere` and broke it between two letters. A word that will not fit should end
 * in an ellipsis instead, with the full name in the tile's tooltip.
 *
 * Measured rather than read from the CSS, because this exact rule has failed silently before: a
 * declaration that exists is not one that applies. Lines are counted from the rendered position of
 * each character, which is the one thing that tells a word broken across lines from a word that
 * stayed whole.
 *
 * The test page sets no document language, so `hyphens: auto` has no dictionary and cannot break
 * the word either. That is deliberate: it leaves the fallback as the only thing deciding, which is
 * the case under test. Hyphenation itself is the browser's and is not re-tested here.
 *
 * Presence is asserted as a count, never as an element compared with null: a failing assertion on
 * an element inside the launcher hangs the runner while it serialises the element.
 */

/** Mounting a launcher under a theme imports that theme's sheets, which is slow in a busy run. */
const TIMEOUT_MS = 30_000;

/**
 * One word with no break opportunity, longer than a tile or a Start menu row in any theme. The
 * test checks that it really does overflow, so a theme that grows wide enough to fit it fails
 * loudly rather than passing for the wrong reason.
 */
const LONG_WORD = 'Minesweeperchampionshipleaderboardstatisticsoverviewdashboardarchiveexportsettings';

/** The group the apps sit in. */
const GROUPS = [{ alias: 'games', label: 'Games', weight: 10 }];

/**
 * Three apps, so a grid theme's first row is full and the long one sits between two short ones.
 * @returns The apps.
 */
function apps(): UmbraDesktopApp[] {
  const app = (alias: string, name: string, weight: number) =>
    ({ alias, name, icon: 'icon-box', content: { kind: 'iframe', url: '/umbraco' }, chromeProfile: 'bare', group: 'games', weight }) as UmbraDesktopApp;
  return [app('short', 'Logs', 10), app('long', LONG_WORD, 20), app('other', 'Profiling', 30)];
}

/**
 * The number of rendered lines a label's text occupies, read from where each character is drawn.
 * Lines the clamp hides still have positions, so a word broken onto a hidden line counts too.
 * @param label The label element.
 * @returns How many distinct lines its characters sit on.
 */
function renderedLines(label: HTMLElement): number {
  const text = label.firstChild?.nodeType === Node.TEXT_NODE ? label.firstChild : [...label.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
  if (!text) return 0;
  const tops = new Set<number>();
  const range = document.createRange();
  for (let i = 0; i < (text.textContent ?? '').length; i++) {
    range.setStart(text, i);
    range.setEnd(text, i + 1);
    const rect = range.getClientRects()[0];
    if (rect) tops.add(Math.round(rect.top));
  }
  return tops.size;
}

/**
 * Check one long-named tile: the word stays whole on one line, overflows, and is cut with an
 * ellipsis, and the tile says the full name on hover.
 * @param mount The mounted launcher.
 * @param selector The tile to check.
 * @param titled The element that should carry the full name as its tooltip, inside the tile.
 * @param where Which view this is, for the messages.
 */
function expectEllipsis(mount: UmbraDesktopLauncherMount, selector: string, titled: string, where: string): void {
  const tiles = mount.root.querySelectorAll<HTMLElement>(selector);
  expect(tiles.length, `${where}: the long-named tile renders`).to.equal(1);
  const tile = tiles[0];
  const label = tile.querySelector<HTMLElement>('.tlb')!;

  expect(renderedLines(label), `${where}: the word stays whole rather than breaking between two letters`).to.equal(1);
  expect(label.scrollWidth, `${where}: the word is wider than the label, so it has to be cut`).to.be.greaterThan(label.clientWidth);
  expect(getComputedStyle(label).textOverflow, `${where}: the cut ends in an ellipsis`).to.equal('ellipsis');

  const tooltip = titled ? tile.querySelector<HTMLElement>(titled) : tile;
  expect(tooltip?.title, `${where}: hovering the tile shows the full name`).to.equal(LONG_WORD);
}

/**
 * Check that the long name did not change the grid around it: every tile in its card the same
 * width, nothing painted past the card, and no sideways scroll.
 * @param mount The mounted launcher.
 * @param tileSelector The tiles of the card.
 * @param where Which view this is, for the messages.
 */
function expectLayoutUnmoved(mount: UmbraDesktopLauncherMount, tileSelector: string, where: string): void {
  const tiles = [...mount.root.querySelectorAll<HTMLElement>(tileSelector)];
  const widths = tiles.map((tile) => Math.round(tile.getBoundingClientRect().width));
  expect(new Set(widths).size, `${where}: tile widths differ: ${widths.join(', ')}`).to.equal(1);

  const card = tiles[0].closest('.card')!.getBoundingClientRect();
  for (const tile of tiles) {
    const label = tile.querySelector<HTMLElement>('.tlb')!.getBoundingClientRect();
    expect(Math.round(label.right), `${where}: a label paints past its card`).to.be.at.most(Math.ceil(card.right));
  }
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`${theme.name}: a word too long for its tile ends in an ellipsis instead of breaking mid-word`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await mountLauncher({ apps: apps(), groups: GROUPS, theme });
    await adoptIconStandIn(mount);
    try {
      expectEllipsis(mount, '.cards .tile[data-alias="long"]', '.launch', 'launcher');
      expectLayoutUnmoved(mount, '.cards .card[data-group="games"] .tile', 'launcher');

      mount.root.querySelector<HTMLElement>('.ctl.arrange')!.click();
      await mount.settle();
      expectEllipsis(mount, '.cards .tile.arr[data-alias="long"]', '', 'arrange mode');
      expectLayoutUnmoved(mount, '.cards .card[data-group="games"] .tile.arr', 'arrange mode');
    } finally {
      mount.remove();
    }
  });
}
