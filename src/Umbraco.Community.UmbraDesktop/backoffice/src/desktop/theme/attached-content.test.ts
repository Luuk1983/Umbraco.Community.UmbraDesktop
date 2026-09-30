import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './themes/index.js';

/**
 * What every theme owes attached content: it may restyle the chrome that says a pane or a floating
 * window belongs to a document, and it may not remove it.
 *
 * Four surfaces, each the only carrier of its message. The taskbar's group box is the only thing on
 * the bar that says two buttons belong together. The pane header is the only place a pane can be
 * reloaded, popped out or closed. The splitter is the only way to resize a pane. The strip under a
 * floating window's titlebar is the only thing on it saying what it belongs to, and holds the only
 * button that docks it back. A theme that hid any of
 * them would leave something working and unexplained, which is the bug this scan exists to catch.
 *
 * The same removal scan `theme/taskbar-features.test.ts` and `theme/notice.test.ts` run, over the
 * sheets these surfaces live in. Design: `docs/design/2026-09-27-attached-windows-design.md` §6.
 */

/** Declarations that would take a surface away rather than restyle it. */
const REMOVALS = [
  /display\s*:\s*none/,
  /visibility\s*:\s*hidden/,
  /opacity\s*:\s*0(?!\.[1-9])/,
  /(width|height)\s*:\s*0(?:px)?\s*[;}]/,
];

/**
 * Every rule block in a stylesheet, as a selector and its declarations, with comments stripped
 * first for the reason `taskbar-features.test.ts` gives: prose naming a class would otherwise read
 * as a selector.
 * @param cssText The stylesheet's text.
 * @returns One entry per rule.
 */
function rules(cssText: string): Array<{ selector: string; block: string }> {
  return cssText
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}')
    .map((block) => ({ selector: block.split('{')[0] ?? '', block: `${block}}` }));
}

/**
 * Whether a selector targets a class as that class, and not as the prefix of a longer one.
 * @param selector The selector text.
 * @param name The class name, without its dot.
 * @returns True when the selector targets that class.
 */
function mentions(selector: string, name: string): boolean {
  return new RegExp(`\\.${name}(?![\\w-])`).test(selector);
}

/** Which classes live in which sheet. */
const SURFACES: ReadonlyArray<{ sheet: 'taskbar' | 'window'; name: string; what: string }> = [
  { sheet: 'taskbar', name: 'task-group', what: 'the taskbar group box' },
  { sheet: 'window', name: 'pane-header', what: 'the pane header' },
  { sheet: 'window', name: 'pane-button', what: "the pane header's controls" },
  { sheet: 'window', name: 'splitter', what: 'the pane splitter' },
  { sheet: 'window', name: 'attached-strip', what: "a floating window's attached strip" },
  { sheet: 'window', name: 'attached-dock', what: 'the Dock button' },
];

for (const theme of UMBRADESKTOP_THEMES) {
  for (const surface of SURFACES) {
    it(`does not let the ${theme.name} theme hide ${surface.what}`, async () => {
      const sheets = await theme.sheets?.();
      for (const { selector, block } of rules(sheets?.[surface.sheet]?.cssText ?? '')) {
        if (!mentions(selector, surface.name)) continue;
        for (const removal of REMOVALS) {
          expect(removal.test(block), `the ${theme.name} theme hides ${surface.what}: ${block.trim()}`).to.equal(false);
        }
      }
    });
  }
}

/**
 * The strip's hovered crumb and its pressed Preview button draw their text on the hover background,
 * so the two must differ. Windows 98 shipped them identical: navy link text on its navy selection,
 * which its own sheet rescued for the crumbs alone, leaving the Preview button unreadable while
 * pressed. The hover text is a token now, so the check is on the palette and cannot be rescued by a
 * rule that only reaches some of the elements.
 */
for (const theme of UMBRADESKTOP_THEMES) {
  for (const [variant, palette] of Object.entries(theme.palettes)) {
    if (!palette) continue;
    it(`keeps the strip's hover text readable on its hover background in ${theme.name} (${variant})`, () => {
      const values = palette as Record<string, string | undefined>;
      const background = values['--umbradesktop-path-link-hover-background'];
      const text = values['--umbradesktop-path-link-hover-text'] ?? values['--umbradesktop-path-link'];
      if (!background || !text) return;
      expect(text.toLowerCase()).to.not.equal(background.toLowerCase());
    });
  }
}

/**
 * The pressed Preview toggle falls back to the backoffice's own "you are here" colour, which is
 * right for the Umbraco theme and wrong everywhere else: Umbraco's pink would sit in a macOS or a
 * Windows 98 strip like a sticker. So a theme that restyles the path strip at all owes the toggle a
 * fill of its own, and text that reads on it.
 */
for (const theme of UMBRADESKTOP_THEMES) {
  for (const [variant, palette] of Object.entries(theme.palettes)) {
    if (!palette) continue;
    const values = palette as Record<string, string | undefined>;
    if (!values['--umbradesktop-path-background']) continue;
    it(`gives the pressed toggle a readable fill of its own in ${theme.name} (${variant})`, () => {
      const background = values['--umbradesktop-strip-button-on-background'];
      const text = values['--umbradesktop-strip-button-on-text'];
      expect(background, 'an on background').to.be.a('string');
      expect(text, 'an on text colour').to.be.a('string');
      expect(text!.toLowerCase()).to.not.equal(background!.toLowerCase());
    });
  }
}
