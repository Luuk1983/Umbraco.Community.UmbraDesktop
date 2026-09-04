import { expect } from '@open-wc/testing';
import '../../../components/launcher.element.js';
import type { UmbraDesktopLauncherElement } from '../../../components/launcher.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { WIN98_FRAME_BORDER } from './metrics.js';

/**
 * The launcher is the surface this theme restructures most — a card grid becoming a single column
 * of menu rows — and the surface where getting it wrong matters most, because it is the only route
 * back to the theme picker. Two things are worth holding onto in a test.
 *
 * The first is that the sheet's rules actually *win*. Theme sheets are appended after each
 * component's own styles and so beat them at equal specificity, but only if their selectors match
 * what the component really renders; a selector that does not match fails silently, which is
 * indistinguishable from a theme that was never adopted. Asserting on computed style rather than
 * on the CSS text is what tells those two apart.
 *
 * The second is that nothing was removed on the way. What a browser can check here is the footer,
 * which renders without any of the launcher's contexts; the app tiles and their pin toggles need
 * the app catalogue, so whether *those* still work is a question for a real backoffice.
 */

/** The themed launcher under test, mounted once for the whole file. */
let panel: UmbraDesktopThemedMount<UmbraDesktopLauncherElement>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  panel = await mountThemed<UmbraDesktopLauncherElement>('umbradesktop-launcher', 'launcher');
});

after(() => panel?.dispose());

it('wins over the launcher\'s own styles on the surfaces it restyles', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const host = getComputedStyle(panel.element);
  const search = panel.root.querySelector('.search') as HTMLElement;
  const footer = panel.root.querySelector('.footer') as HTMLElement;
  expect(search, 'the launcher should render a search row').to.not.equal(null);
  expect(footer, 'the launcher should render a footer').to.not.equal(null);

  // The panel: button-face grey through the palette, and the padding that leaves its raised bevel
  // somewhere to paint. The base rule pads the host by nothing at all.
  expect(host.backgroundColor, 'the palette should reach the panel through the shadow boundary').to.equal(
    'rgb(192, 192, 192)',
  );
  expect(host.paddingTop, 'the panel needs a ring for its bevel to paint into').to.equal(
    `${WIN98_FRAME_BORDER}px`,
  );

  // The search row: a white well with a sunken double bevel, where the base draws a grey chip with
  // a border and no shadow at all.
  const searchStyle = getComputedStyle(search);
  expect(searchStyle.backgroundColor, 'a Win98 text field is white').to.equal('rgb(255, 255, 255)');
  expect(
    (searchStyle.boxShadow.match(/inset/g) ?? []).length,
    'a sunken Win98 edge is four layered inset shadows — an outer pair and an inner pair',
  ).to.equal(4);

  // The footer: a groove, where the base draws a filled bar with a plain top border.
  const footerStyle = getComputedStyle(footer);
  expect(footerStyle.borderTopStyle).to.equal('solid');
  expect(footerStyle.borderTopColor, 'the shadow half of the groove').to.equal('rgb(128, 128, 128)');
  expect(footerStyle.boxShadow, 'the highlight half of the groove, drawn inside it').to.contain('inset');
});

it('keeps every footer action rendered and sized to be clicked', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Desktop settings, Log out, Exit. A theme may restyle, never remove: a user who lands in Win98
  // and cannot reach Desktop settings has no way back to the theme picker.
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
