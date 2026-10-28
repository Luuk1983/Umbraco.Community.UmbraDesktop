import { expect } from '@open-wc/testing';
import '../components/window-path.element.js';
import type { UmbraDesktopWindowPathElement } from '../components/window-path.element.js';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { mountThemedWith, UMBRADESKTOP_THEME_TEST_TIMEOUT_MS } from './themes/mount-themed.js';
import { UMBRACO_TEST_BACKOFFICE_TOKENS } from './themes/umbraco/mount-themed.js';

/**
 * Every theme's path strip leaves an even number of pixels for what it shows.
 *
 * The strip's height less its bottom line and any bevel padding is the box its icons and words are
 * centred in. When that box was odd, the Umbraco theme's 28px strip with its 1px line leaving 27, the
 * centre fell on a half pixel: an 18px icon started on it and was drawn rounded down, the words were
 * snapped the other way, and on the drawn pixels the words sat up to a pixel above the icons. Windows
 * 98's even 22px had them level. Even heights fix it for every theme without moving any word by hand,
 * and this holds each theme to it, in each of its palettes. The pane header and a floating window's
 * strip are drawn at the same height from the same tokens, so the path strip stands for all three.
 */
for (const theme of UMBRADESKTOP_THEMES) {
  for (const variant of ['light', 'dark'] as const) {
    const palette = theme.palettes[variant];
    if (!palette) continue;
    it(`gives the ${theme.name} theme's ${variant} path strip an even height inside its line and bevel`, async function () {
      this.timeout(UMBRADESKTOP_THEME_TEST_TIMEOUT_MS);
      const mount = await mountThemedWith<UmbraDesktopWindowPathElement>(
        theme,
        palette,
        'umbradesktop-window-path',
        'window',
        UMBRACO_TEST_BACKOFFICE_TOKENS,
      );
      mount.element.crumbs = [{ label: 'Content', href: '/umbraco/section/content', current: false, home: true }];
      await mount.element.updateComplete;
      const bar = mount.root.querySelector('.path-bar')!;
      const style = getComputedStyle(bar);
      // clientHeight leaves the border out and keeps the padding in, so the padding comes off here.
      const inside = bar.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      expect(inside % 2, `${inside}px inside the strip`).to.equal(0);
      mount.dispose();
    });
  }
}
