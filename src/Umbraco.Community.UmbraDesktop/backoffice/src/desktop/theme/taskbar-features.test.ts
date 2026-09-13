import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './themes/index.js';

/**
 * What every theme owes the row of fixed taskbar features. Three things, and none of them fails
 * loudly on its own.
 *
 * **It must not hide the row**, which is the removal scan below — the same one
 * `theme/notice.test.ts` runs over the notice surfaces, and the same rule: a theme may restyle,
 * never remove.
 *
 * **It must not strand it.** The row's buttons carry `.task`, the running-window button's own
 * class, which is why a theme styles them without writing a line about them. A theme that scoped
 * one of its `.task` rules under `.running` would still be styling *its* task buttons correctly
 * while quietly leaving the feature row on the base stylesheet's geometry — a Windows 98 taskbar
 * with two flat, unbevelled buttons beside a row of bevelled ones. A bug that looks like a theme
 * working.
 *
 * **And it must tell the two lists apart.** The fixed row and the open windows draw the same icon
 * for the same app, so something has to separate them. In the three themes that keep their labels
 * the label does it, and the base leaves the divider hidden for exactly that reason. A theme that
 * hides labels has taken that away and owes an answer — the macOS dock draws the divider, Windows
 * 11 marks every window button instead — and either counts.
 */

/** Declarations that would take the row away rather than restyle it. */
const REMOVALS = [
  /display\s*:\s*none/,
  /visibility\s*:\s*hidden/,
  /opacity\s*:\s*0(?!\.[1-9])/,
  /(width|height)\s*:\s*0(?:px)?\s*[;}]/,
];

/**
 * Every rule block in a stylesheet, as a selector and its declarations.
 *
 * Comments are stripped first, and that is load-bearing rather than tidiness: splitting on `}`
 * leaves whatever precedes a rule attached to its selector, and these sheets are heavily commented
 * with prose that names the very classes being matched — the Windows 11 accent-bar rule explains
 * itself by talking about `.running`, which read as a selector scoped to it.
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
 * Whether a selector mentions a class, as that class rather than as the prefix of a longer one.
 *
 * The trailing guard carries this. '.task' has to match '.task', '.task.active' and '.task.window'
 * but not '.task-label' or '.task-icon', and a plain word boundary cannot tell those apart because
 * a hyphen is one too. Anything that could continue an identifier — a letter, a digit, '_' or '-' —
 * means a different class; a '.', a space, a comma or a ':' means the name ended.
 *
 * Requiring a separator *before* the dot was the first attempt and was wrong the other way: it
 * cannot see a chained class at all, so '.task.window' read as no mention of 'window' and the
 * Windows 11 theme's running marker looked like a theme that had never answered.
 * @param selector The selector text.
 * @param name The class name, without its dot.
 * @returns True when the selector targets that class.
 */
function mentions(selector: string, name: string): boolean {
  return new RegExp(`\\.${name}(?![\\w-])`).test(selector);
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`does not let the ${theme.name} theme hide the taskbar feature row`, async () => {
    const sheets = await theme.sheets?.();
    for (const { selector, block } of rules(sheets?.taskbar?.cssText ?? '')) {
      if (!mentions(selector, 'features')) continue;
      for (const removal of REMOVALS) {
        expect(removal.test(block), `the ${theme.name} theme hides the feature row: ${block.trim()}`).to.equal(false);
      }
    }
  });

  it(`tells the two lists apart in the ${theme.name} theme, one way or the other`, async () => {
    // Two lists of buttons sit on the launching half of the bar — the fixed row and the open
    // windows — and they draw the *same icon* for the same app. What separates them, in the three
    // themes that keep their labels, is the label itself: a window button carries its window's
    // title and a row button never carries anything. Nothing more is needed there, which is why
    // the base leaves the divider at `display: none`.
    //
    // A theme that hides labels has taken that away and owes an answer. There are two, and both
    // ship: the macOS dock draws the divider, and Windows 11 marks every window button instead,
    // which says the same thing from the other side. This does not care which — it cares that a
    // sheet hiding labels has one of them.
    const sheets = await theme.sheets?.();
    const cssText = sheets?.taskbar?.cssText ?? '';
    const hidesLabels = rules(cssText).some(
      ({ selector, block }) => mentions(selector, 'task-label') && /display\s*:\s*none/.test(block),
    );
    if (!hidesLabels) return;

    const showsDivider = rules(cssText).some(
      ({ selector, block }) => mentions(selector, 'divider') && /display\s*:\s*(?!none)/.test(block),
    );
    const marksWindows = rules(cssText).some(({ selector }) => mentions(selector, 'window'));
    expect(
      showsDivider || marksWindows,
      `the ${theme.name} theme hides task labels, so a pinned button and an open window are the ` +
        `same glyph twice: it has to draw the divider or mark '.task.window'`,
    ).to.equal(true);
  });

  it(`styles the ${theme.name} theme's task buttons wherever they are, not only in the window list`, async () => {
    const sheets = await theme.sheets?.();
    for (const { selector } of rules(sheets?.taskbar?.cssText ?? '')) {
      if (!mentions(selector, 'task')) continue;
      expect(
        /\.running\b/.test(selector),
        `the ${theme.name} theme scopes a task rule to the window list, which strands the feature ` +
          `row on the base geometry: ${selector.trim()}`,
      ).to.equal(false);
    }
  });
}
