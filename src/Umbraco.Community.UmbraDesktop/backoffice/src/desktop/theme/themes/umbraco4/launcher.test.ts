import { expect } from '@open-wc/testing';
import '../../../components/launcher.element.js';
import type { UmbraDesktopLauncherElement } from '../../../components/launcher.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';

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
 * without any of the launcher's contexts. The app tiles and their pin toggles need the app
 * catalogue, so whether those still work is a question for a real backoffice.
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
  const cards = panel.root.querySelector('.cards') as HTMLElement;
  expect(cards, 'the launcher should render a cards container').to.not.equal(null);

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
