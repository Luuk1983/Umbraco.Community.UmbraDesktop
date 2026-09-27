import { expect } from '@open-wc/testing';
import '../components/desktop.element.js';
import type { UmbraDesktopDesktopElement } from '../components/desktop.element.js';
import type { UmbraDesktopLabelElement } from './desktop-label.element.js';
import type { DesktopLabelResponseModel } from '../../api/types.gen';
import { contrastRatio } from '../theme/contrast.js';
import { paletteCss } from '../theme/palette-css.js';
import { UMBRADESKTOP_THEMES } from '../theme/themes/index.js';
import { UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from '../theme/themes/mount-themed.js';

/**
 * The label inside a real desktop: where the desktop places it, and whether each theme's ink stands
 * apart from that theme's own desktop behind it.
 *
 * The desktop is mounted once for the file, as the themes' own geometry tests mount their chrome,
 * because mounting it is slow in this runner and every assertion here reads only style and layout.
 */

/** A label that is switched on, top right, with no domain line. */
const SHOWN: DesktopLabelResponseModel = { name: 'Contoso Staging', show: true, corner: 'TopRight', showDomain: false };

let desktop: UmbraDesktopDesktopElement;

/** The desktop's root, which wears the theme's palette at runtime. */
const root = () => desktop.renderRoot.querySelector('.desktop') as HTMLElement;

/** The label element the desktop drew. */
const label = () => root().querySelector('umbradesktop-desktop-label') as UmbraDesktopLabelElement;

before(async function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  // Mounted by hand rather than via `fixture`, for the reason `desktop-chrome.test.ts` gives.
  desktop = document.createElement('umbradesktop-desktop') as UmbraDesktopDesktopElement;
  document.body.appendChild(desktop);
  await desktop.updateComplete;
  // The only way to reach the painted desktop without a current user, as `window-snap.test.ts`
  // does it.
  desktop.reportSettingsLoaded(true);
  await desktop.updateComplete;
});

after(() => desktop?.remove());

/**
 * The label belongs to the wallpaper, not to the windows: it sits behind every window, the way the
 * faint Umbraco logo already does. That comes from where the desktop places it rather than from any
 * stacking order of its own, so this checks exactly that.
 */
it('draws the label on the wallpaper, behind the window surface', function () {
  this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
  const layers = [...root().children];
  const drawn = layers.findIndex((layer) => layer.localName === 'umbradesktop-desktop-label');
  const logo = layers.findIndex((layer) => layer.classList.contains('wallpaper-brand'));
  const surface = layers.findIndex((layer) => layer.classList.contains('surface'));

  expect(drawn, 'the desktop should draw the label').to.not.equal(-1);
  expect(drawn, 'over the wallpaper and its logo').to.be.greaterThan(logo);
  expect(drawn, 'and under the windows').to.be.lessThan(surface);
  expect(getComputedStyle(layers[drawn]).zIndex, 'with no stacking order of its own').to.equal('auto');
});

/**
 * The label has one ink under every theme: white, with a dark halo close around the letters. A
 * theme changes its font and weight, never its colour, because the ground behind the label is
 * whatever wallpaper the user chose, not the theme's own. The default wallpaper is dark under every
 * theme, so an ink picked for a theme's pale desktop, as Umbraco 4's dark one was, vanished for
 * everyone who never switched wallpapers.
 *
 * So the ground is not measured here, because it cannot be known. What is measured is the pair that
 * makes the label readable on any ground: the ink against its own halo, at 3:1, WCAG's ratio for
 * large text. On a dark wallpaper the ink stands out; on a pale one the halo does. The halo's first
 * layer is the tight one around the letters, and it has to be strong enough to carry a pale ground.
 */
describe("the ink and its halo under every theme", () => {
  for (const theme of UMBRADESKTOP_THEMES) {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;

      it(`${theme.name} (${variant}): white, with a halo dark enough to read on a pale wallpaper`, async function () {
        this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
        root().setAttribute('style', paletteCss(palette));
        label().label = SHOWN;
        await label().updateComplete;

        const style = getComputedStyle(label().renderRoot.querySelector('.label')!);
        expect(style.color, 'the same white ink under every theme').to.match(/^rgba?\(255, 255, 255\b/);

        // Chrome reports each layer colour first: "rgba(0, 0, 0, 0.8) 0px 0px 3px, ...".
        const halo = /^rgba?\(([^)]*)\)/.exec(style.textShadow);
        expect(halo, `a halo in ${style.textShadow}`).to.not.equal(null);
        const [r, g, b, a = '1'] = halo![1].split(',').map((part) => part.trim());
        expect(Number(a), 'a halo strong enough to carry a pale ground').to.be.at.least(0.7);
        // The ink's colour without its alpha: how strongly it is drawn is the element test's business,
        // and the helper rightly refuses to guess a luminance for a translucent colour.
        const ink = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/.exec(style.color)!;
        expect(
          contrastRatio(`rgb(${ink[1]}, ${ink[2]}, ${ink[3]})`, `rgb(${r}, ${g}, ${b})`)!,
          'the ink against its halo',
        ).to.be.at.least(3);
      });
    }
  }
});
