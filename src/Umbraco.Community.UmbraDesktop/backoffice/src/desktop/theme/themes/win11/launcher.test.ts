import { expect } from '@open-wc/testing';
import '../../../components/launcher.element.js';
import type { UmbraDesktopLauncherElement } from '../../../components/launcher.element.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { W11_LAUNCHER_WIDTH } from './metrics.js';

/**
 * Start is a fixed-width card centred on the viewport and floating above the bar — not a corner
 * menu (Win98), not a corner panel (Umbraco 4), and not a full-screen surface (macOS Launchpad).
 * Four themes, four different answers to where the launcher lives, which is a decent sign the
 * contract's geometry tokens were the right shape.
 *
 * The centring is worth understanding before changing it. `docs/theming.md` §5 warns that an
 * absolutely positioned box given `left`, `right` and an inherited `width` silently drops
 * `right` — so rather than a sheet fighting the base rule over all three, the offset is computed
 * in the palette from the width the palette itself declares:
 * `left: calc(50vw - <width>/2)`. One token, no sheet rule, and the two cannot disagree. The
 * first test below is what stops someone "tidying" that into a sheet rule that half-works.
 *
 * Start also has no visible cards — it is one surface with headings on it — so the group cards
 * lose their fill and border through the palette while keeping every affordance they carry.
 */

/** The themed launcher under test, mounted once for the whole file. */
let panel: UmbraDesktopThemedMount<UmbraDesktopLauncherElement>;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  panel = await mountThemed<UmbraDesktopLauncherElement>('umbradesktop-launcher', 'launcher');
});

after(() => panel?.dispose());

it('centres the panel on the viewport from the width it declares', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const host = panel.element.parentElement!;
  const left = host.style.getPropertyValue('--umbradesktop-launcher-left').trim();
  const width = host.style.getPropertyValue('--umbradesktop-launcher-width').trim();

  expect(width, 'the panel is a fixed-width card').to.equal(`${W11_LAUNCHER_WIDTH}px`);
  expect(
    left,
    'the centring offset must be derived from the declared width, so the two cannot drift — and ' +
      'must stay in the palette rather than becoming a sheet rule that over-constrains left/' +
      'right/width (docs/theming.md section 5)',
  ).to.equal(`calc(50vw - ${W11_LAUNCHER_WIDTH / 2}px)`);
});

it('floats the panel clear of the bar rather than sitting it on top', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const host = panel.element.parentElement!;
  const bottom = parseFloat(host.style.getPropertyValue('--umbradesktop-launcher-bottom'));
  const reserve = parseFloat(host.style.getPropertyValue('--umbradesktop-taskbar-reserve'));

  // The default is the bar's own reserve, which sits the panel directly on it. Windows 11 leaves
  // a gap, and that gap is what makes Start read as floating above the bar rather than growing
  // out of it — the difference from the Win98 Start menu, which is deliberately flush.
  expect(bottom, 'Start should clear the taskbar, not rest on it').to.be.greaterThan(reserve);
});

it('renders the panel as one acrylic surface with no visible cards', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const host = getComputedStyle(panel.element);
  expect(
    host.backdropFilter || host.getPropertyValue('-webkit-backdrop-filter'),
    'acrylic: Start blurs the desktop behind it',
  ).to.contain('blur');
  expect(host.borderTopLeftRadius, 'Windows 11 rounds Start at 8px').to.equal('8px');

  const card = panel.root.querySelector('.card') as HTMLElement | null;
  if (card) {
    const style = getComputedStyle(card);
    expect(style.backgroundColor, 'Start has headings on one surface, not boxes').to.equal(
      'rgba(0, 0, 0, 0)',
    );
    expect(style.borderTopWidth, 'and no card borders either').to.equal('0px');
  }
});

it('keeps every footer action rendered and sized to be clicked', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Desktop settings, Log out, Exit — which is close to what Windows 11 puts in Start's own
  // footer anyway. A theme may restyle, never remove: without Desktop settings there is no route
  // back to the theme picker.
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
