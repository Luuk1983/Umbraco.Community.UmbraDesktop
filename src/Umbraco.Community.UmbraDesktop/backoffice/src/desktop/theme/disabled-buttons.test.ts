import { expect } from '@open-wc/testing';
import '@umbraco-cms/backoffice/external/uui';
import { UMBRADESKTOP_THEMES } from './themes/index.js';
import { desktopStyleOf } from './palette-css.js';
import { contrastRatio } from './contrast.js';

/**
 * A disabled primary button must look disabled under every theme (Media Health design §16.1): step 1
 * of Media Health had a Review button that was disabled in code and looked pressable on screen. A
 * theme may restyle a state, never hide it, so this is checked as a theme bug rather than fixed in
 * the one app that hit it.
 *
 * What reaches a button inside an app is what inherits: the theme's palette, which rides on the
 * window as custom properties, over the backoffice's own UUI colours. So each theme's palettes are
 * applied, over each of UUI's three colour sets, to a wrapper holding a primary button and the same
 * button disabled, and the two must differ by a visible amount: a fill contrast of at least
 * {@link MIN_FILL_CONTRAST}, or the disabled one faded to {@link MAX_DISABLED_OPACITY} or less. No
 * window chrome is mounted: the themes' window sheets reach only the chrome's own buttons (the
 * notice's), never an app's, and mounting chrome is what makes these files slow.
 *
 * Every theme failed this the first time, and so did the backoffice's colours on their own: UUI
 * 2.0.2's rule that gives a primary button its colour outranks the one that gives a disabled button
 * the disabled colour, so a disabled primary paints exactly the enabled fill. The fix is the
 * desktop's, for every theme at once: {@link desktopStyleOf}.
 */

/** The least fill contrast between a primary button and the same button disabled that reads as two states. */
const MIN_FILL_CONTRAST = 1.5;

/** At or below this opacity, a disabled button reads as disabled whatever its fill. */
const MAX_DISABLED_OPACITY = 0.6;

/**
 * UUI's own colours for the two states, from `@umbraco-ui/uui` 2.0.2's `dist/themes/*.css` with the
 * palette references resolved. The test page loads no UUI stylesheet, so these stand in for the
 * backoffice's light, dark and high-contrast themes.
 */
const BACKOFFICE: Record<string, string> = {
  light:
    '--uui-color-default:#283a97;--uui-color-default-contrast:#fff;--uui-color-disabled:#f7f7f8;--uui-color-disabled-contrast:#c4c4c4;--uui-color-interactive:#1b264f;',
  dark: '--uui-color-default:#316dca;--uui-color-default-contrast:#eeeeef;--uui-color-disabled:#434c56;--uui-color-disabled-contrast:#fcfcfc4d;--uui-color-interactive:#316dca;',
  'high-contrast':
    '--uui-color-default:#1b264f;--uui-color-default-contrast:#fff;--uui-color-disabled:#f7f7f8;--uui-color-disabled-contrast:#c4c4c4;--uui-color-interactive:#1b264f;',
};

/**
 * The fill and opacity a button paints, read from its inner button, where UUI draws it.
 * @param button The `uui-button`.
 * @returns Its background colour and its effective opacity.
 */
function paint(button: HTMLElement): { fill: string; opacity: number } {
  const inner = button.shadowRoot!.querySelector<HTMLElement>('#button')!;
  return { fill: getComputedStyle(inner).backgroundColor, opacity: Number(getComputedStyle(button).opacity) * Number(getComputedStyle(inner).opacity) };
}

describe('a disabled primary button, under every theme', () => {
  for (const theme of UMBRADESKTOP_THEMES) {
    for (const [variant, palette] of Object.entries(theme.palettes)) {
      if (!palette) continue;
      for (const [backoffice, uui] of Object.entries(BACKOFFICE)) {
        it(`${theme.name}, ${variant} palette, backoffice ${backoffice}`, async () => {
          const host = document.createElement('div');
          host.setAttribute('style', uui + desktopStyleOf(palette));
          host.innerHTML = '<uui-button look="primary" label="Clean up"></uui-button><uui-button look="primary" label="Clean up" disabled></uui-button>';
          document.body.appendChild(host);
          try {
            const [enabled, disabled] = [...host.querySelectorAll<HTMLElement & { updateComplete: Promise<unknown> }>('uui-button')];
            await Promise.all([enabled.updateComplete, disabled.updateComplete]);
            const on = paint(enabled);
            const off = paint(disabled);
            const contrast = contrastRatio(on.fill, off.fill) ?? 1;
            expect(contrast >= MIN_FILL_CONTRAST || off.opacity <= MAX_DISABLED_OPACITY, `${on.fill} against ${off.fill}, contrast ${contrast.toFixed(2)}, opacity ${off.opacity}`).to.equal(true);
          } finally {
            host.remove();
          }
        });
      }
    }
  }
});
