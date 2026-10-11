import { expect } from '@open-wc/testing';
import '../../../components/taskbar.element.js';
import {
  mountThemed,
  mountThemedDark,
  UMBRADESKTOP_THEME_TEST_TIMEOUT_MS,
} from './mount-themed.js';
import type { UmbraDesktopThemedMount } from './mount-themed.js';
import { measureTray, withTrayItem } from '../mount-themed.js';
import { W11_ACCENT_DARK } from './palette.js';
import { W11_TASK_MARKER_WIDTH } from './metrics.js';

/** A mounted taskbar, which is all any test in this file needs. */
type Bar = UmbraDesktopThemedMount<HTMLElement & { updateComplete: Promise<unknown> }>;

/**
 * The taskbar carries this theme's signature — a **centred** cluster on a **flush, full-width**
 * bar — and both halves of that are what keep it from reading as the macOS dock, which is
 * centred too but floats as a rounded pill above the bottom edge.
 *
 * Centring is the interesting part mechanically. The tray, with the clock at its end, is pinned
 * right while Start and the running windows sit in the middle of the *screen*, not in the middle of
 * the space the tray leaves over — so the cluster comes out of the bar's flex flow and is
 * positioned against the bar instead. That is exactly what the `.cluster` wrapper was added to the
 * chrome for (design §4), and this is the first theme to use it.
 *
 * The buttons are icon-only, following Windows 11's default. That is a sanctioned exception the
 * macOS theme already established: the button keeps its `title`, so the app name is still both
 * the tooltip and the accessible name. It is worth a test rather than a comment, because hiding
 * a label is one edit away from hiding the only accessible name a button has.
 */

/** The themed taskbar under test, mounted once for the whole file. */
let bar: Bar;

/** The same bar under the dark palette, to prove the second palette actually reaches the chrome. */
let dark: Bar;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  bar = await mountThemed('umbradesktop-taskbar', 'taskbar');
  dark = await mountThemedDark('umbradesktop-taskbar', 'taskbar');
});

after(() => {
  bar?.dispose();
  dark?.dispose();
});

it('centres the Start cluster on the bar while the tray stays pinned to the trailing end', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const rendered = bar.root.querySelector('.bar') as HTMLElement;
  const cluster = bar.root.querySelector('.cluster') as HTMLElement;
  const tray = bar.root.querySelector('.tray') as HTMLElement;
  expect(cluster, 'the taskbar should render a cluster').to.not.equal(null);
  expect(tray, 'the taskbar should render a tray').to.not.equal(null);

  const barBox = rendered.getBoundingClientRect();
  const clusterBox = cluster.getBoundingClientRect();
  const trayBox = tray.getBoundingClientRect();

  // Centred on the bar itself, not on the space the tray leaves over: those differ by half the
  // tray's width, which is the difference between a Windows 11 bar and a nearly-centred one.
  expect(
    (clusterBox.left + clusterBox.right) / 2,
    'the cluster should be centred on the bar, not on the space beside the tray',
  ).to.be.closeTo((barBox.left + barBox.right) / 2, 1.5);

  // The tray, not the clock, is what is pushed right (design D16). A push left on the clock would
  // leave the tray, and every item in it, sitting at the leading end with the cluster over it.
  expect(
    barBox.right - trayBox.right,
    'the tray stays pinned to the trailing end while the cluster is centred',
  ).to.be.lessThan(24);
});

it('draws an empty tray as exactly the clock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  expect(bar.root.querySelector('.tray')!.childElementCount, 'this test is about the empty tray').to.equal(1);
  const { tray, clock } = measureTray(bar.root);
  // Zero on every side: the push is a margin, outside the box, and the tray draws nothing itself.
  expect(tray.width - clock.width, 'no padding of its own around the clock').to.be.closeTo(0, 0.5);
  expect(tray.right, 'the clock ends where the tray ends').to.be.closeTo(clock.right, 0.5);
});

it('keeps the clock at the corner and puts a tray item beside it', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const before = measureTray(bar.root).clock.right;
  withTrayItem(bar.root, (item) => {
    const { clock } = measureTray(bar.root);
    const box = item.getBoundingClientRect();
    expect(clock.right, 'an item grows the tray towards the cluster, never the clock off its corner').to.be.closeTo(
      before,
      0.5,
    );
    expect(box.right, 'the item comes before the clock').to.be.at.most(clock.left + 0.5);
  });
});

it('keeps the bar flush and full width, unlike the floating macOS dock', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const rendered = bar.root.querySelector('.bar') as HTMLElement;
  const style = getComputedStyle(rendered);

  expect(style.borderTopLeftRadius, 'a Windows 11 bar is square, not a rounded pill').to.equal('0px');
  expect(style.marginBottom, 'and flush with the bottom edge, with nothing under it').to.equal('0px');
  expect(
    style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
    'acrylic: the bar blurs whatever is behind it',
  ).to.contain('blur');
});

it('shows icons without labels, keeping the app name as the accessible name', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Windows 11's default is icon-only. Hiding the visible label is only safe because the button
  // carries a title, which is then its accessible name as well as its tooltip — the same
  // sanctioned exception the macOS dock takes.
  //
  // Asserted against the sheet rather than a rendered button: the taskbar draws task buttons from
  // the window manager, which never resolves outside a desktop, so a mount has none to measure.
  // The conditional below still runs the stronger check if one ever is rendered here.
  const sheets = [...bar.root.adoptedStyleSheets];
  const sheet = sheets[sheets.length - 1];
  const text = [...sheet.cssRules].map((r) => r.cssText).join('\n');
  expect(text, 'the theme should hide the label rather than the component removing it').to.contain(
    '.task-label',
  );
  expect(text, 'and hide it by display, so the name stays in the accessibility tree').to.contain(
    'display: none',
  );

  const label = bar.root.querySelector('.task-label') as HTMLElement | null;
  if (label) {
    expect(getComputedStyle(label).display, 'the label is hidden, not removed').to.equal('none');
    const task = label.closest('.task') as HTMLElement;
    expect(
      task.getAttribute('title'),
      'a task button with no visible label must still carry its name as a title',
    )
      .to.be.a('string')
      .and.to.have.length.greaterThan(0);
  }
});

it('narrows the active marker to an accent pill instead of the base full-width underline', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const task = bar.root.querySelector('.task') as HTMLElement | null;
  // The bar renders no task buttons without a window manager, so assert on the rule rather than a
  // rendered box when there is nothing to measure. The width still has to come from the constant.
  const sheets = [...bar.root.adoptedStyleSheets];
  const sheet = sheets[sheets.length - 1];
  const text = [...sheet.cssRules].map((r) => r.cssText).join('\n');

  expect(text, 'the base draws the marker as a full-width inset shadow; this theme replaces it').to.contain(
    '.task.active',
  );
  expect(
    text.includes(`${W11_TASK_MARKER_WIDTH}px`),
    'the accent pill should take its width from W11_TASK_MARKER_WIDTH',
  ).to.equal(true);
  if (task) {
    expect(getComputedStyle(task).position, 'the pill is positioned against its own button').to.equal(
      'relative',
    );
  }
});

it('applies the dark palette to the chrome, not just to the light one it spreads', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const light = getComputedStyle(bar.root.querySelector('.bar') as HTMLElement);
  const night = getComputedStyle(dark.root.querySelector('.bar') as HTMLElement);

  // A dark palette is a spread of the light one with overrides, so a misspelled token in the
  // override is simply absent and the surface keeps its light value with nothing failing.
  expect(
    night.backgroundColor,
    'the dark bar should not paint the light bar colour',
  ).to.not.equal(light.backgroundColor);
  expect(
    dark.element.parentElement!.style.getPropertyValue('--umbradesktop-task-active-marker').trim(),
    'the dark marker uses a lighter accent; the default is too dim to read on a near-black bar',
  ).to.equal(W11_ACCENT_DARK);
});
