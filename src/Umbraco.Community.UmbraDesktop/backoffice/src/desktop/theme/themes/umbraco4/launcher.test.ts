import { expect } from '@open-wc/testing';
import '../../../components/launcher.element.js';
import type { UmbraDesktopLauncherElement } from '../../../components/launcher.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { mountLauncher, stubApp } from '../../../components/launcher.test-helper.js';
import { UMBRADESKTOP_UMBRACO4_THEME } from './index.js';

/**
 * The launcher carries this theme's one genuinely structural idea, so it is the surface most
 * worth pinning down.
 *
 * Umbraco 4's Sections panel held **six** things, which is why it could afford large glossy orbs
 * in a grid. The catalogue holds twenty-five across seven groups, plus whatever an install
 * derives, and an orb grid at that count is eight headings and nine rows of tiles with most of it
 * below the fold. So the theme uses both halves of the v4 backoffice rather than stretching one
 * of them: **Favourites keeps the orb grid**, at the count that panel was designed for, and the
 * **grouped catalogue becomes v4's tree** — a sunken white well of compact rows.
 *
 * That split rests entirely on the base rendering Favourites as `.card.fav`, a sibling of
 * `.cards` rather than a cell inside it. If that ever changes, the two idioms collapse into one
 * and the theme silently loses the thing it was built around — hence the first test below.
 *
 * As in the Win98 tests, the assertions read computed style rather than CSS text: theme sheets
 * are appended after the component's own styles and win at equal specificity, but only if their
 * selectors match what is really rendered, and a selector that matches nothing fails silently in
 * a way that is indistinguishable from a theme that was never adopted.
 *
 * What a browser can check here is the panel, the search row and the footer, all of which render
 * without any of the launcher's contexts. The app tiles need the app catalogue, so whether those
 * still work is a question for a real backoffice.
 */

/** The themed launcher under test, mounted once for the whole file. */
let panel: UmbraDesktopThemedMount<UmbraDesktopLauncherElement>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  panel = await mountThemed<UmbraDesktopLauncherElement>('umbradesktop-launcher', 'launcher');
});

after(() => panel?.dispose());

it('styles the grouped catalogue as a scrolling well, distinctly from the Favourites grid', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // With no catalogue in context the launcher draws its empty state rather than the groups, so the
  // container is built inside the body exactly as #renderGroups emits it, like favCard does below.
  const body = panel.root.querySelector('.body') as HTMLElement;
  expect(body, 'the launcher should render a body').to.not.equal(null);
  const cards = document.createElement('div');
  cards.className = 'cards';
  body.appendChild(cards);

  const style = getComputedStyle(cards);
  // The tree well: white, sunken, and the only thing in the panel that scrolls. The base draws
  // `.cards` as a transparent auto-fill grid of 260px columns with no scrolling of its own.
  expect(style.backgroundColor, 'the grouped catalogue is a white v4 tree well').to.equal(
    'rgb(255, 255, 255)',
  );
  expect(style.overflowY, 'twenty-five apps have to scroll inside the well, not stretch it').to.equal(
    'auto',
  );
  expect(
    style.display,
    'the tree stacks its groups; the base auto-fill grid would put them side by side',
  ).to.equal('flex');
  expect(style.flexDirection).to.equal('column');

  cards.remove();
});

it('keeps Favourites out of the tree, so the orb grid survives', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // The whole split depends on this: Favourites is `.card.fav` inside `.body`, a *sibling* of
  // `.cards`. A refactor that moved it inside would hand it the tree's row rules and quietly
  // delete the orb grid, with nothing else failing.
  const body = panel.root.querySelector('.body') as HTMLElement;
  expect(body, 'the launcher should render a body').to.not.equal(null);
  expect(
    panel.root.querySelector('.cards .card.fav'),
    'Favourites must not be inside .cards, or it inherits the tree row treatment',
  ).to.equal(null);
});

it('draws the search row as a v4 sunken field, not a rounded chip', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const search = panel.root.querySelector('.search') as HTMLElement;
  expect(search, 'the launcher should render a search row').to.not.equal(null);

  const style = getComputedStyle(search);
  expect(style.backgroundColor, 'a v4 text field is white').to.equal('rgb(255, 255, 255)');
  expect(style.borderTopLeftRadius, 'v4 fields are square').to.equal('0px');
  expect(style.boxShadow, 'a v4 field is sunken, with its shadow drawn inside it').to.contain('inset');
});

it('moves its outer margin to the header row, not the search field inside it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Theme sheets are appended after the base styles, so a .search rule that kept its own margin
  // here would beat the base's `.search { margin: 0 }` and reintroduce it inside .hdr, doubling
  // with .hdr's own margin and pushing the row right and down from where the sheet puts it.
  const search = panel.root.querySelector('.search') as HTMLElement;
  expect(search, 'the launcher should render a search row').to.not.equal(null);
  const style = getComputedStyle(search);
  expect(style.marginLeft, 'the header row owns the left margin now, not the field').to.equal('0px');
  expect(style.marginTop, 'the header row owns the top margin now, not the field').to.equal('0px');
});

/**
 * Build a Favourites card inside the mounted root, so the orb rules have the DOM they target.
 *
 * The launcher renders app tiles only with the app catalogue in context, which no browser test
 * has, so the structure is reproduced here exactly as `#tile` and `#grid` emit it:
 * `.card.fav > .grid > .tile > .launch > umb-icon[name]`. If that markup ever changes, these
 * tests keep passing against a shape the launcher no longer renders, which is the one failure
 * mode worth naming out loud.
 * @param names The icon names to place, in grid order.
 * @returns The card, so a test can remove it, and the orb elements in the order given.
 */
function favCard(names: ReadonlyArray<string>): { card: HTMLElement; orbs: HTMLElement[] } {
  const card = document.createElement('div');
  card.className = 'card fav';
  const grid = document.createElement('div');
  grid.className = 'grid';
  card.appendChild(grid);

  const orbs = names.map((name) => {
    const tile = document.createElement('div');
    tile.className = 'tile';
    const launch = document.createElement('button');
    launch.className = 'launch';
    const icon = document.createElement('umb-icon');
    icon.setAttribute('name', name);
    launch.appendChild(icon);
    tile.appendChild(launch);
    grid.appendChild(tile);
    return icon;
  });

  panel.root.appendChild(card);
  return { card, orbs };
}

it('colours a Favourites orb by which app it is, not by where it sits', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Content leads one grid and sits second in another. Hues rotated by position give those two
  // orbs different fills; hues keyed by the app give them the same one.
  const first = favCard(['icon-documents', 'icon-picture']);
  const second = favCard(['icon-picture', 'icon-documents']);

  const leading = getComputedStyle(first.orbs[0]).backgroundImage;
  const trailing = getComputedStyle(second.orbs[1]).backgroundImage;

  expect(leading, 'a Favourites orb should carry a gradient fill at all').to.contain('gradient');
  expect(trailing, 'Content keeps its colour wherever it lands in the grid').to.equal(leading);

  first.card.remove();
  second.card.remove();
});

it('gives two different apps two different Favourites orbs', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Positions 1 and 7 both fall through the 6n+2..6n rotation to the same base fill, so a
  // position-keyed panel cannot tell Content from Media here. An identity-keyed one can.
  const filler = ['icon-user', 'icon-settings', 'icon-code', 'icon-box', 'icon-globe'];
  const { card, orbs } = favCard(['icon-documents', ...filler, 'icon-picture']);

  expect(
    getComputedStyle(orbs[6]).backgroundImage,
    'Media and Content are different apps and should not share a colour',
  ).to.not.equal(getComputedStyle(orbs[0]).backgroundImage);

  card.remove();
});

it('keeps the panel multicoloured across the glyphs the catalogue really uses', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // What made v4's Sections panel recognisable was that it was multicoloured, and with hues
  // keyed by app that property now rests on the map covering the catalogue rather than on the
  // grid being long enough. Each glyph is mounted alone, in position one, so position cannot
  // contribute any variety: whatever spread survives here is identity's alone.
  const glyphs = [
    'icon-documents',
    'icon-picture',
    'icon-users',
    'icon-settings',
    'icon-code',
    'icon-box',
    'icon-search',
    'icon-diploma',
  ];
  const cards = glyphs.map((glyph) => favCard([glyph]));

  const hues = new Set(cards.map((c) => getComputedStyle(c.orbs[0]).backgroundImage));
  expect(hues.size, 'a one-colour Favourites panel is not the v4 Sections panel').to.be.greaterThan(
    3,
  );

  for (const c of cards) c.card.remove();
});

it('keeps every footer action rendered and sized to be clicked', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Desktop settings, Log out, Exit. A theme may restyle, never remove: a user who lands in
  // Umbraco 4 and cannot reach Desktop settings has no way back to the theme picker.
  const actions = [...panel.root.querySelectorAll<HTMLElement>('.actions .fbtn')];

  expect(actions.length, 'the footer should still offer settings, log out and exit').to.equal(3);
  for (const action of actions) {
    expect(action.offsetWidth, 'a restyled action button still has to be a target').to.be.greaterThan(0);
    expect(action.offsetHeight, 'a restyled action button still has to be a target').to.be.greaterThan(0);
    expect(
      getComputedStyle(action).visibility,
      'a restyled action button still has to be visible',
    ).to.equal('visible');
  }
});

it('starts an arrange row icon where the tree row icon starts', async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Arrange mode draws each tile as a tree row inside a dashed edge and an inset, and its leading
  // padding is derived from the tree's indent less those two. This measures that the derivation
  // lands: the same app's icon, in the same group, starts at the same distance from the well's edge
  // in both modes, so switching into arrange mode does not shift the list sideways.
  const mount = await mountLauncher({
    apps: [stubApp('content', 'editing', 10)],
    groups: [{ alias: 'editing', label: 'Editing', weight: 10 }],
    theme: UMBRADESKTOP_UMBRACO4_THEME,
  });
  try {
    const iconOffset = () => {
      const well = mount.root.querySelector('.cards')!.getBoundingClientRect();
      const icon = mount.root.querySelector('.cards .tile[data-alias="content"] umb-icon')!.getBoundingClientRect();
      return icon.left - well.left;
    };
    const tree = iconOffset();
    (mount.root.querySelector('.ctl.arrange') as HTMLElement).click();
    await mount.settle();
    expect(iconOffset()).to.be.closeTo(tree, 0.5);
  } finally {
    mount.remove();
  }
});
