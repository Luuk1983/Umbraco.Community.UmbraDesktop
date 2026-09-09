import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './themes/index.js';

/**
 * *A theme may restyle, never remove*, held for the notice surfaces across all five themes. The
 * general form of `theme/unsaved-marker.test.ts`, which does the same for the `info` marker.
 *
 * Three surfaces, and each fails differently, which is why each is checked rather than one standing
 * in for the others: hiding a banner leaves the editor unwarned, starving a badge leaves a
 * minimized window silent, and painting a severity colour into its own background leaves a marker
 * that is present, sized and invisible.
 */

/** Declarations that would take a surface away rather than restyle it. */
const REMOVALS = [
  /display\s*:\s*none/,
  /visibility\s*:\s*hidden/,
  /opacity\s*:\s*0(?!\.[1-9])/,
  /content\s*:\s*none/,
  /(width|height)\s*:\s*0(?:px)?\s*[;}]/,
];

/** Every rule block in a stylesheet whose selector mentions one of the given class names. */
function rulesFor(cssText: string, selectors: ReadonlyArray<string>): string[] {
  return cssText
    .split('}')
    .filter((block) => {
      const selector = block.split('{')[0] ?? '';
      return selectors.some((name) => new RegExp(`(^|[\\s,>+~])\\.${name}\\b`).test(selector));
    })
    .map((block) => `${block}}`);
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`does not let the ${theme.name} theme remove a notice banner`, async () => {
    const sheets = await theme.sheets?.();
    for (const rule of rulesFor(sheets?.window?.cssText ?? '', ['notice'])) {
      for (const removal of REMOVALS) {
        expect(removal.test(rule), `the ${theme.name} theme hides a notice: ${rule.trim()}`).to.equal(
          false,
        );
      }
    }
  });

  it(`does not let the ${theme.name} theme remove the taskbar badge`, async () => {
    const sheets = await theme.sheets?.();
    for (const rule of rulesFor(sheets?.taskbar?.cssText ?? '', ['notice-badge'])) {
      for (const removal of REMOVALS) {
        expect(
          removal.test(rule),
          `the ${theme.name} theme hides the taskbar badge: ${rule.trim()}`,
        ).to.equal(false);
      }
    }
  });

  it(`does not let the ${theme.name} theme remove a severity from the marker`, async () => {
    const sheets = await theme.sheets?.();
    // `notice-marker`, not `dirty.notice-warning`: `warning` and `error` are now the severity icon
    // in the marker slot rather than a recoloured dirty dot, and `.dirty` is `info` alone again —
    // which `theme/unsaved-marker.test.ts` is the guard for.
    for (const rule of rulesFor(sheets?.window?.cssText ?? '', [
      'notice-marker',
      'dirty\\.notice-warning',
      'dirty\\.notice-error',
    ])) {
      for (const removal of REMOVALS) {
        expect(
          removal.test(rule),
          `the ${theme.name} theme hides a severity marker: ${rule.trim()}`,
        ).to.equal(false);
      }
    }
  });

  it(`gives the ${theme.name} theme an overlay badge if it hides the task label`, async () => {
    // The base draws the badge inline, after the label, at the label's own text size. A theme that
    // hides the label (macOS and Windows 11 both do — they draw icon-only tiles) therefore has
    // nowhere for that glyph to sit, and has to restyle the same element into an overlay on the
    // tile instead. Getting this wrong does not fail anything else: the element is present, sized
    // and coloured, and simply sits behind or beside nothing. Derived from the sheet rather than
    // listed by name, so a sixth theme that hides the label is held to it too.
    const sheets = await theme.sheets?.();
    const taskbar = sheets?.taskbar?.cssText ?? '';
    const hidesLabel = rulesFor(taskbar, ['task-label']).some((rule) =>
      /display\s*:\s*none/.test(rule),
    );
    if (!hidesLabel) return;
    expect(
      rulesFor(taskbar, ['notice-badge']).some((rule) => /position\s*:\s*absolute/.test(rule)),
      `the ${theme.name} theme hides the task label, so its notice badge has to be positioned on ` +
        'the tile — an inline glyph after a hidden label is invisible',
    ).to.equal(true);
  });

  it(`does not let the ${theme.name} theme paint a severity into nothing`, () => {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      for (const token of [
        '--umbradesktop-notice-warning-color',
        '--umbradesktop-notice-error-color',
      ] as const) {
        const colour = palette[token];
        if (!colour) continue;
        expect(
          colour.trim().toLowerCase(),
          `${theme.name} (${variant}) paints ${token} in nothing`,
        ).to.not.be.oneOf(['transparent', 'rgba(0, 0, 0, 0)', 'none']);
        expect(
          colour.trim().toLowerCase(),
          `${theme.name} (${variant}) paints ${token} into its own notice background`,
        ).to.not.equal(palette['--umbradesktop-notice-background']?.trim().toLowerCase());
      }
    }
  });

  it(`does not let the ${theme.name} theme paint the info marker into what it sits on`, () => {
    // `info` is a dot rather than a glyph, and a dot has nothing but its colour: no shape to fall
    // back on, no plate behind it. It also paints on two different grounds — the caption, beside
    // the window title, and a task button, where on an icon-only tile it lands on top of the app
    // icon. The icon is the case that bites, because a task button draws its icon in
    // `taskbar-text` and a dot in that same value is invisible against it: that is exactly what
    // "the dot does not come across" was on the macOS dock, and nothing failed. So all three
    // grounds are checked, not just the two backgrounds.
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      const dot = palette['--umbradesktop-notice-info-color'];
      if (!dot) continue;
      const value = dot.trim().toLowerCase();
      expect(value, `${theme.name} (${variant}) paints the info marker in nothing`).to.not.be.oneOf([
        'transparent',
        'rgba(0, 0, 0, 0)',
        'none',
      ]);
      for (const ground of [
        '--umbradesktop-titlebar-background',
        '--umbradesktop-taskbar-background-opaque',
        '--umbradesktop-taskbar-text',
      ] as const) {
        expect(
          value,
          `${theme.name} (${variant}) paints the info marker in ${ground}, which is one of the ` +
            'things it has to be seen against',
        ).to.not.equal(palette[ground]?.trim().toLowerCase());
      }
    }
  });

  it(`does not let the ${theme.name} theme size the badge or the severity marker away`, () => {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      for (const token of [
        '--umbradesktop-notice-badge-size',
        '--umbradesktop-notice-marker-size',
      ] as const) {
        const size = palette[token];
        if (!size) continue;
        expect(parseFloat(size), `${theme.name} (${variant}) sizes ${token} to nothing`).to.be.greaterThan(0);
      }
    }
  });
}
