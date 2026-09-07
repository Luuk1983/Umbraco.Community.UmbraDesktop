import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './themes/index.js';

/**
 * *A theme may restyle, never remove* — held here for the unsaved-changes marker across **all
 * five** themes, not just the three that mount a window to measure their caption geometry.
 *
 * Rendering every theme's window would be the stronger check, but mounting chrome components is
 * documented in `mount-themed.ts` as slow and intermittently flaky in this runner, and two themes
 * (Umbraco, macOS) have no window test file to hang it on — Umbraco ships no window stylesheet at
 * all, being the base. So the three that already have a mount assert what they paint, and this file
 * covers the whole set by reading what the themes actually declare.
 *
 * It is not a proxy check for those three: hiding the marker and starving it are different failures
 * from painting it invisibly, and this catches the first two in every theme.
 */

/** Declarations that would take the marker away rather than restyle it. */
const REMOVALS = [
  /display\s*:\s*none/,
  /visibility\s*:\s*hidden/,
  /opacity\s*:\s*0(?!\.[1-9])/,
  /content\s*:\s*none/,
  /(width|height)\s*:\s*0(?:px)?\s*[;}]/,
];

/**
 * Every rule block in a stylesheet whose selector mentions the marker.
 * @param cssText The stylesheet's source text.
 * @returns The matching blocks, selector and body together.
 */
function markerRules(cssText: string): string[] {
  return cssText
    .split('}')
    .filter((block) => /(^|[\s,>+~])\.dirty\b/.test(block.split('{')[0] ?? ''))
    .map((block) => `${block}}`);
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`does not let the ${theme.name} theme remove the unsaved-changes marker`, async () => {
    const sheets = await theme.sheets?.();
    for (const rule of markerRules(sheets?.window?.cssText ?? '')) {
      for (const removal of REMOVALS) {
        expect(
          removal.test(rule),
          `the ${theme.name} theme's window stylesheet hides the unsaved marker: ${rule.trim()}`,
        ).to.equal(false);
      }
    }
  });

  it(`does not let the ${theme.name} theme paint the marker into its own caption`, () => {
    // The marker's colour defaults to the caption's text colour, so a theme gets a visible mark for
    // free. A theme that overrides it has to override it to something you can still see.
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      const marker = palette['--umbradesktop-titlebar-dirty-color'];
      if (!marker) continue;
      expect(
        marker.trim().toLowerCase(),
        `${theme.name} (${variant}) paints the unsaved marker in its own caption colour`,
      ).to.not.equal(palette['--umbradesktop-titlebar-background']?.trim().toLowerCase());
      expect(marker.trim().toLowerCase(), `${theme.name} (${variant}) paints the marker in nothing`)
        .to.not.be.oneOf(['transparent', 'rgba(0, 0, 0, 0)', 'none']);
    }
  });

  it(`does not let the ${theme.name} theme size the marker away`, () => {
    for (const variant of ['light', 'dark'] as const) {
      const size = theme.palettes[variant]?.['--umbradesktop-titlebar-dirty-size'];
      if (!size) continue;
      expect(
        parseFloat(size),
        `${theme.name} (${variant}) sizes the unsaved marker to nothing`,
      ).to.be.greaterThan(0);
    }
  });
}
