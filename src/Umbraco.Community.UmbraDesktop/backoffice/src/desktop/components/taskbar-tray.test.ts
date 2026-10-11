import { expect } from '@open-wc/testing';
import './taskbar.element.js';
import type { UmbraDesktopTaskbarElement } from './taskbar.element.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS, measureTray, withTrayItem } from '../theme/themes/mount-themed.js';

/**
 * The system tray as a box of its own (design D16).
 *
 * Before it existed the clock was the whole tray: two themes drew their well on it, one pushed it
 * to the trailing edge, one hung a separator on it. Anything that wanted to sit beside the clock
 * would have landed outside all of that. These cases pin what every theme now builds on: there is a
 * `.tray` directly in the bar with the clock last in it, an item in it is centred on the bar, a tray
 * child that says it has nothing to show is gone, and an empty tray is exactly the clock.
 *
 * Mounted bare rather than through the shared themed helper, because this is the Umbraco theme,
 * which ships no stylesheet at all: the base chrome *is* the theme, and the helper rightly refuses a
 * theme with no sheet for the surface. So the empty-tray case here is the Umbraco theme's, and each
 * of the other four themes' `taskbar.test.ts` checks the tray it draws.
 */

/** The bare taskbar under test, mounted once for the file; see `mount-themed.ts` on why once. */
let taskbar: UmbraDesktopTaskbarElement;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  taskbar = document.createElement('umbradesktop-taskbar') as UmbraDesktopTaskbarElement;
  document.body.appendChild(taskbar);
  await taskbar.updateComplete;
});

after(() => taskbar?.remove());

it('wraps the clock in a tray, clock last', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const tray = taskbar.renderRoot.querySelector('.bar > .tray');
  expect(tray, 'the taskbar should render a tray container').to.not.equal(null);
  expect(
    tray!.lastElementChild?.classList.contains('clock'),
    'the clock is the last thing in the tray, nearest the corner',
  ).to.equal(true);
});

it('draws an empty tray as exactly the clock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const element = taskbar.renderRoot.querySelector('.tray') as HTMLElement;
  expect(element.childElementCount, 'this test is about the empty tray').to.equal(1);
  const { tray, clock } = measureTray(taskbar.shadowRoot!);
  // The Umbraco theme draws nothing on the tray, so it adds nothing at all around the clock.
  expect(tray.width, 'the tray adds no box of its own around the clock').to.be.closeTo(clock.width, 0.5);
  expect(tray.right, 'the clock ends where the tray ends').to.be.closeTo(clock.right, 0.5);
});

it('centres a tray item on the bar, however tall the clock stands', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  withTrayItem(taskbar.shadowRoot!, (item) => {
    const { tray } = measureTray(taskbar.shadowRoot!);
    const box = item.getBoundingClientRect();
    // An icon is shorter than the bar; stretched or top-aligned it would sit high beside the time.
    expect((box.top + box.bottom) / 2, 'the item sits on the tray\'s centre line').to.be.closeTo(
      (tray.top + tray.bottom) / 2,
      0.5,
    );
  });
});

it('hides a tray child that carries hidden, even when its script set its own display', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const tray = taskbar.renderRoot.querySelector('.tray') as HTMLElement | null;
  expect(tray, 'the taskbar should render a tray container').to.not.equal(null);
  const item = document.createElement('span');
  // An inline style is what an item's own script produces by setting 'style.display', and it
  // outranks any normal rule in the tray's stylesheet. Only the '!important' there beats it.
  item.style.display = 'inline-flex';
  item.hidden = true;
  tray!.prepend(item);
  try {
    expect(getComputedStyle(item).display, 'a hidden tray item takes no space').to.equal('none');
  } finally {
    item.remove();
  }
});
