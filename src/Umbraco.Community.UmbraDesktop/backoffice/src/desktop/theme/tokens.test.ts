import { expect } from '@open-wc/testing';
import type { CSSResultGroup, CSSResultOrNative } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopDesktopElement } from '../components/desktop.element.js';
import { UmbraDesktopTaskbarElement } from '../components/taskbar.element.js';
import { UmbraDesktopLauncherElement } from '../components/launcher.element.js';
import { UmbraDesktopWindowElement } from '../components/window.element.js';
import { UMBRADESKTOP_TOKENS } from './types.js';

/**
 * `UMBRADESKTOP_TOKENS` is maintained by hand against CSS spread across four component files, and
 * the two can drift silently in either direction: a name added to the union with no matching CSS
 * is dead weight nobody notices, and a `--umbradesktop-*` custom property added to a component's
 * CSS without a matching entry in the union can never be reached by a theme, palette typo-checking
 * or not. Milestone 3 adds a lot more chrome CSS, so this test makes that drift loud instead of
 * silent: it collects every `--umbradesktop-*` name actually mentioned in the four elements'
 * `static styles` (both `var(--x, …)` reads and the one `--x: …` write) and compares that set,
 * exactly, against `UMBRADESKTOP_TOKENS`. A failure here means the list and the CSS disagree —
 * fix the smaller side, whichever the message says is missing.
 */

/** Flatten a Lit `CSSResultGroup` — possibly a nested array — into a flat list of leaf entries. */
function flattenStyles(styles: CSSResultGroup): CSSResultOrNative[] {
  return Array.isArray(styles) ? styles.flatMap((entry) => flattenStyles(entry)) : [styles];
}

/** Every distinct `--umbradesktop-*` custom property name mentioned anywhere in a set of styles. */
function tokensMentionedIn(styles: CSSResultGroup): Set<string> {
  const cssText = flattenStyles(styles)
    // A component's `static styles` is authored as `CSSResult` (from the `css` tagged template),
    // which is the only variant carrying `cssText`; a native `CSSStyleSheet` has no such property.
    .map((sheet) => ('cssText' in sheet ? sheet.cssText : ''))
    .join('\n');
  const matches = cssText.match(/--umbradesktop-[a-z-]+/g) ?? [];
  return new Set(matches);
}

it('has exactly the tokens the four chrome components read or write, no more and no fewer', () => {
  const mentioned = new Set<string>();
  for (const ctor of [
    UmbraDesktopDesktopElement,
    UmbraDesktopTaskbarElement,
    UmbraDesktopLauncherElement,
    UmbraDesktopWindowElement,
  ]) {
    for (const token of tokensMentionedIn(ctor.styles)) mentioned.add(token);
  }

  const declared = new Set<string>(UMBRADESKTOP_TOKENS);

  const declaredButUnused = [...declared].filter((token) => !mentioned.has(token)).sort();
  const mentionedButUndeclared = [...mentioned].filter((token) => !declared.has(token)).sort();

  expect(
    declaredButUnused,
    'these tokens are declared in UMBRADESKTOP_TOKENS but no component CSS reads or writes them ' +
      '— either the CSS lost its reference, or the entry is dead and should be removed from ' +
      'UMBRADESKTOP_TOKENS',
  ).to.deep.equal([]);

  expect(
    mentionedButUndeclared,
    'these --umbradesktop-* custom properties appear in component CSS but are missing from ' +
      'UMBRADESKTOP_TOKENS — add them there so a theme can actually set them',
  ).to.deep.equal([]);
});
