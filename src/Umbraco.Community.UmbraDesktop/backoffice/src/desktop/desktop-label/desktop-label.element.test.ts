import { expect } from '@open-wc/testing';
import './desktop-label.element.js';
import type { UmbraDesktopLabelElement } from './desktop-label.element.js';
import type { DesktopLabelCornerModel, DesktopLabelResponseModel } from '../../api/types.gen';
import { UMBRADESKTOP_DESKTOP_LABEL_INSET } from '../constants';
import { paletteCss } from '../theme/palette-css.js';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../theme/themes/mount-themed.js';

/**
 * The label is chrome, so the rules every chrome component lives by apply: a theme may restyle it
 * but never remove it, and where it lands is measured in a browser rather than trusted from the
 * CSS, because a number derived from another number is only consistent with itself.
 *
 * The desktop is stood in for by a positioned box at a real desktop's size wearing each theme's
 * palette, which is how the palette reaches the label at runtime: custom properties set on the
 * desktop inherit through the label's shadow boundary. The bottom corners are measured against
 * `metrics.taskbarReserve`, the number JavaScript holds for the same space the CSS reserves, so a
 * theme whose two disagree fails here.
 */

const DOMAIN = 'staging.contoso.com';
const INSET = UMBRADESKTOP_DESKTOP_LABEL_INSET;
const CORNERS: DesktopLabelCornerModel[] = ['TopRight', 'TopLeft', 'BottomLeft', 'BottomRight'];

/** A label that is switched on, top right, with no domain line. */
const SHOWN: DesktopLabelResponseModel = { name: 'Contoso Staging', show: true, corner: 'TopRight', showDomain: false };

/** A real desktop's size, so the label's widths and insets mean what they will at runtime. */
const DESK = { w: 1280, h: 800 };

let desk: HTMLElement;
let element: UmbraDesktopLabelElement;

// Mounted once and re-pointed per test, as the themes' own geometry tests do: mounting chrome in
// this runner is intermittently slow, and every assertion here reads only style and layout.
before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  desk = document.createElement('div');
  document.body.appendChild(desk);
  element = document.createElement('umbradesktop-desktop-label');
  element.domain = DOMAIN;
  desk.appendChild(element);
  await element.updateComplete;
});

after(() => desk?.remove());

/**
 * Point the label at a state and a palette, and wait for it to draw.
 * @param label What the server would report.
 * @param palette The theme palette the stand-in desktop wears. Empty for the base Umbraco look.
 */
async function show(label: DesktopLabelResponseModel | null, palette: object = {}): Promise<void> {
  desk.setAttribute(
    'style',
    `position: relative; width: ${DESK.w}px; height: ${DESK.h}px; ${paletteCss(palette)}`,
  );
  element.label = label;
  await element.updateComplete;
}

/** The drawn label, or null when nothing is drawn. */
const drawn = () => element.renderRoot.querySelector('.label') as HTMLElement | null;

describe('the desktop label', () => {
  it('draws nothing before the label has loaded', async () => {
    await show(null);
    expect(drawn()).to.equal(null);
  });

  it('draws nothing while it is switched off', async () => {
    await show({ ...SHOWN, show: false });
    expect(drawn()).to.equal(null);
  });

  it('draws the name when it is switched on', async () => {
    await show(SHOWN);
    expect(drawn()?.querySelector('.name')?.textContent).to.equal('Contoso Staging');
    expect(drawn()?.querySelector('.domain')).to.equal(null);
  });

  it('puts the domain under the name when that is switched on', async () => {
    await show({ ...SHOWN, showDomain: true });
    expect(drawn()?.querySelector('.domain')?.textContent).to.equal(DOMAIN);
  });

  it('draws the domain in place of a missing name', async () => {
    await show({ ...SHOWN, name: null });
    expect(drawn()?.querySelector('.name')?.textContent).to.equal(DOMAIN);
  });

  it('never takes a click', async () => {
    await show(SHOWN);
    expect(getComputedStyle(element).pointerEvents).to.equal('none');
    expect(getComputedStyle(drawn()!).pointerEvents).to.equal('none');
  });

  it('cuts a long name off rather than wrapping it', async () => {
    await show({ ...SHOWN, name: 'Contoso Corporate Intranet - Acceptance Environment for the Northern Region' });
    const name = drawn()!.querySelector('.name') as HTMLElement;
    const style = getComputedStyle(name);
    expect(style.textOverflow).to.equal('ellipsis');
    expect(name.scrollWidth, 'the name should overflow its box, and be cut off').to.be.greaterThan(name.clientWidth);
    // One line, and no more than about half the desktop, so a long name cannot reach the middle.
    // Measured inside the padding, which is room for the halo rather than more text.
    const textHeight = name.getBoundingClientRect().height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    expect(textHeight).to.be.lessThan(parseFloat(style.fontSize) * 1.5);
    expect(drawn()!.getBoundingClientRect().width).to.be.at.most(DESK.w * 0.5);
  });

  it('leaves room for the whole halo, so the edge of a text box never cuts it off', async () => {
    await show({ ...SHOWN, showDomain: true });
    // The name and the domain clip their overflow, which is what lets a long name end in an
    // ellipsis. A clip is at the padding edge, so without padding the soft outer halo stopped dead
    // at the edge of each line, which showed as a hard shadow edge on a plain ground.
    const layers = getComputedStyle(drawn()!)
      .textShadow.split(/,(?![^(]*\))/)
      .map((layer) => layer.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(parseFloat));
    const reach = {
      top: Math.max(...layers.map(([, y, blur]) => blur - y)),
      right: Math.max(...layers.map(([x, , blur]) => blur + x)),
      bottom: Math.max(...layers.map(([, y, blur]) => blur + y)),
      left: Math.max(...layers.map(([x, , blur]) => blur - x)),
    };
    expect(reach.bottom, 'the halo has some reach').to.be.greaterThan(0);

    for (const part of ['.name', '.domain']) {
      const style = getComputedStyle(drawn()!.querySelector(part)!);
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        expect(parseFloat(style.getPropertyValue(`padding-${side}`)), `${part} ${side}`).to.be.at.least(reach[side]);
      }
    }
  });

  it('keeps the letters where they were when it makes that room', async () => {
    await show({ ...SHOWN, corner: 'TopLeft' });
    const label = drawn()!.getBoundingClientRect();
    const name = drawn()!.querySelector('.name') as HTMLElement;
    const box = name.getBoundingClientRect();
    const style = getComputedStyle(name);
    // The padding is taken back with a margin, so the text starts at the label's own edge, and the
    // corner measurements below still describe where the letters are.
    expect(box.left + parseFloat(style.paddingLeft), 'text starts at the left edge').to.be.closeTo(label.left, 0.5);
    expect(box.top + parseFloat(style.paddingTop), 'text starts at the top edge').to.be.closeTo(label.top, 0.5);
  });
});

describe('where each theme draws it', () => {
  for (const theme of UMBRADESKTOP_THEMES) {
    for (const corner of CORNERS) {
      it(`${theme.name}: ${corner} sits ${INSET}px in and clear of the taskbar`, async function () {
        this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
        await show({ ...SHOWN, corner }, theme.palettes.light);

        const box = drawn()!.getBoundingClientRect();
        const frame = desk.getBoundingClientRect();

        if (corner.startsWith('Top')) {
          expect(box.top - frame.top, 'from the top').to.be.closeTo(INSET, 1);
        } else {
          expect(frame.bottom - box.bottom, 'from the bottom, above the taskbar reserve').to.be.closeTo(
            theme.metrics.taskbarReserve + INSET,
            1,
          );
        }

        if (corner.endsWith('Left')) {
          expect(box.left - frame.left, 'from the left').to.be.closeTo(INSET, 1);
        } else {
          expect(frame.right - box.right, 'from the right').to.be.closeTo(INSET, 1);
        }
      });
    }

    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;

      it(`${theme.name} (${variant}): draws it strongly enough to stand out`, async function () {
        this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
        await show(SHOWN, palette);

        const label = drawn()!;
        const style = getComputedStyle(label);
        // A theme may restyle the label, never remove it: not by hiding it, and not by fading it to
        // a classic watermark's 30%, which disappeared over the white of a light photo in the mock.
        expect(style.display).to.not.equal('none');
        expect(style.visibility).to.equal('visible');
        // Faded in the ink, never as a whole. An element opacity fades the halo with the letters,
        // and the halo is what carries the label on a pale wallpaper: at 60% overall it left the
        // label faint on Umbraco 4's own grey.
        expect(style.opacity, 'the label as a whole is never faded').to.equal('1');
        const ink = /^rgba?\(([^)]*)\)/.exec(style.color)![1].split(',').map((part) => Number(part));
        expect(ink[3] ?? 1, 'the ink is strong enough to stand out').to.be.at.least(0.5);
        expect(parseFloat(style.fontSize)).to.be.at.least(28);
      });
    }
  }
});
