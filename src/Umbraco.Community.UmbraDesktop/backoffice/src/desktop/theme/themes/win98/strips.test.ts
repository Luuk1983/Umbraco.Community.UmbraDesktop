import { expect } from '@open-wc/testing';
import '../../../components/window-path.element.js';
import type { UmbraDesktopWindowPathElement } from '../../../components/window-path.element.js';
import { WIN98_BEVEL_DEPTH } from './metrics.js';
import { mountThemed, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './mount-themed.js';

/**
 * The strips under a Win98 window's titlebar keep their buttons inside the sunken well they are
 * drawn as.
 *
 * The buttons fill a strip's height in every theme, and Win98 draws the strip as a well with a 2px
 * bevel painted inside its own box. A button filling the box painted its face and its raised hover
 * over that bevel, so Preview and the pane header's buttons stood out over the strip's edges. The
 * strip is padded by the bevel's depth instead, on every side a button can reach.
 */

it("keeps Preview inside the path strip's bevel", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const mount = await mountThemed<UmbraDesktopWindowPathElement>('umbradesktop-window-path', 'window');
  mount.element.crumbs = [
    { label: 'Content', href: '/umbraco/section/content', current: false, home: true },
    { label: 'Home', href: undefined, current: true },
  ];
  mount.element.previewable = true;
  await mount.element.updateComplete;
  const bar = mount.root.querySelector('.path-bar')!.getBoundingClientRect();
  const button = mount.root.querySelector('button.path-preview')!.getBoundingClientRect();
  expect(button.top - bar.top, 'clear of the top edge').to.be.at.least(WIN98_BEVEL_DEPTH);
  expect(bar.bottom - button.bottom, 'clear of the bottom edge').to.be.at.least(WIN98_BEVEL_DEPTH);
  expect(bar.right - button.right, 'clear of the right edge').to.be.at.least(WIN98_BEVEL_DEPTH);
  mount.dispose();
});

it("draws Preview at Windows 98's small toolbar button height inside the well, with 16px icons", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // 22px is Explorer's toolbar button with small icons, and 16px is the era's small icon. In a 22px
  // strip the well's bevel left the buttons 18px, the smallest of any theme, with icons cut to 14.
  const mount = await mountThemed<UmbraDesktopWindowPathElement>('umbradesktop-window-path', 'window');
  mount.element.crumbs = [
    { label: 'Content', href: '/umbraco/section/content', current: false, home: true },
    { label: 'Home', href: undefined, current: true },
  ];
  mount.element.previewable = true;
  await mount.element.updateComplete;
  expect(mount.root.querySelector('button.path-preview')!.getBoundingClientRect().height).to.equal(22);
  expect(getComputedStyle(mount.root.querySelector('.path-preview-icon')!).fontSize).to.equal('16px');
  expect(getComputedStyle(mount.root.querySelector('.path-home')!).fontSize).to.equal('16px');
  mount.dispose();
});

it("draws a pane's body as the same sunken well as the window's body beside it", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // The window's content sat in a bevelled well and the pane's beside it did not, so the pane read
  // as pasted onto the frame. Read off the sheet's effect on stand-ins, since mounting a pane needs a
  // whole window.
  const mount = await mountThemed<UmbraDesktopWindowPathElement>('umbradesktop-window-path', 'window');
  const style = (name: string) => {
    const probe = document.createElement('div');
    probe.className = name;
    mount.root.appendChild(probe);
    const { boxShadow, paddingTop, paddingRight, paddingBottom, paddingLeft } = getComputedStyle(probe);
    probe.remove();
    return { boxShadow, padding: [paddingTop, paddingRight, paddingBottom, paddingLeft] };
  };
  const body = style('bodywrap');
  expect(body.boxShadow, 'the window body is a well').to.not.equal('none');
  expect(style('pane-body')).to.deep.equal(body);
  mount.dispose();
});

it("pads the pane header and a floating window's strip clear of the bevel, where their buttons sit", async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Top and bottom by the bevel's depth; the ends by the strips' own padding, which is more. Read
  // off the sheet's effect on a stand-in, since mounting a pane needs a whole window.
  const mount = await mountThemed<UmbraDesktopWindowPathElement>('umbradesktop-window-path', 'window');
  for (const name of ['pane-header', 'attached-strip']) {
    const strip = document.createElement('div');
    strip.className = name;
    mount.root.appendChild(strip);
    const style = getComputedStyle(strip);
    for (const side of ['paddingTop', 'paddingBottom'] as const) {
      expect(parseFloat(style[side]), `${name} ${side}`).to.equal(WIN98_BEVEL_DEPTH);
    }
    strip.remove();
  }
  mount.dispose();
});
