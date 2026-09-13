import { expect } from '@open-wc/testing';
import type { CSSResultGroup, CSSResultOrNative } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopDesktopElement } from '../components/desktop.element.js';
import { UmbraDesktopTaskbarElement } from '../components/taskbar.element.js';
import { UmbraDesktopLauncherElement } from '../components/launcher.element.js';
import { UmbraDesktopWindowElement } from '../components/window.element.js';
import { UmbraDesktopWindowNoticesElement } from '../components/window-notices.element.js';
import { UmbraDesktopWindowPathElement } from '../components/window-path.element.js';
import { UmbraDesktopLoaderElement } from '../components/loader.element.js';
import { UMBRADESKTOP_TOKENS } from './types.js';
import { UMBRADESKTOP_THEMES } from './themes/index.js';

/**
 * `UMBRADESKTOP_TOKENS` is maintained by hand against CSS spread across five component files, and
 * the two can drift silently in either direction: a name added to the union with no matching CSS
 * is dead weight nobody notices, and a `--umbradesktop-*` custom property added to a component's
 * CSS without a matching entry in the union can never be reached by a theme, palette typo-checking
 * or not. Milestone 3 adds a lot more chrome CSS, so this test makes that drift loud instead of
 * silent: it collects every `--umbradesktop-*` name actually mentioned in the scanned elements'
 * `static styles` (both `var(--x, …)` reads and the one `--x: …` write) and compares that set,
 * exactly, against `UMBRADESKTOP_TOKENS`. A failure here means the list and the CSS disagree —
 * fix the smaller side, whichever the message says is missing.
 *
 * The notice element is in this list for the same reason the first four are: it owns the
 * `--umbradesktop-notice-*` group, and a token declared in `UMBRADESKTOP_TOKENS` whose only reader
 * is a component this test does not scan reads as dead weight and fails here. The path element
 * joined it on the same terms, owning `--umbradesktop-path-*`, and the loader element on the same
 * terms again, owning `--umbradesktop-window-loader-color`. That is the standing rule rather than a
 * growing list: any new chrome component with tokens of its own belongs here the day it is written,
 * or its whole group fails this test as unused.
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

it('has exactly the tokens the five chrome components read or write, no more and no fewer', () => {
  const mentioned = new Set<string>();
  for (const ctor of [
    UmbraDesktopDesktopElement,
    UmbraDesktopTaskbarElement,
    UmbraDesktopLauncherElement,
    UmbraDesktopWindowElement,
    UmbraDesktopWindowNoticesElement,
    UmbraDesktopWindowPathElement,
    UmbraDesktopLoaderElement,
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

it('pins the loader colour wherever it pins the window background', () => {
  // The loading overlay paints `--umbradesktop-window-background` and the mark on it falls back to
  // `--uui-color-text`. Those two come from different systems: the first from the theme's palette,
  // the second from the backoffice's own light/dark setting. They agree only for a theme that lets
  // both follow the backoffice — which the base Umbraco theme does, by setting neither.
  //
  // A palette that pins the ground and leaves the ink free has bought a contrast bug. Windows 98 is
  // grey because 1998 was grey, not because the room is bright, so its palette is light-only and
  // the face stays grey under the backoffice's dark setting — while the mark goes white and lands
  // at 1.82:1. Seen on Windows 98; Umbraco 4 had it identically and nobody had looked, and it is
  // the worse of the two at 1.07:1, since v4's panel is near-white rather than mid-grey.
  //
  // So the rule is about the pair, not about the variant: pin one, pin the other, in the same
  // palette. macOS and Windows 11 pin the ground per variant and are correct today only because
  // their variants happen to follow the backoffice — stating the pairing makes that a decision
  // rather than a coincidence that survives until someone adds a third variant. The rest of the
  // chrome already works this way: these palettes set `--umbradesktop-path-text`,
  // `--umbradesktop-titlebar-text` and `--umbradesktop-launcher-text` for exactly this reason, and
  // the loader token only missed the sweep by arriving later.
  const offenders: string[] = [];

  for (const theme of UMBRADESKTOP_THEMES) {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette?.['--umbradesktop-window-background']) continue;
      if (!palette['--umbradesktop-window-loader-color']) offenders.push(`${theme.id}.${variant}`);
    }
  }

  expect(
    offenders,
    'these palettes pin "--umbradesktop-window-background", which is the ground the loading ' +
      'overlay paints, but leave the mark on it falling back to the backoffice\'s own text colour ' +
      '— set "--umbradesktop-window-loader-color" in the same palette, beside the text tokens it ' +
      'already sets',
  ).to.deep.equal([]);
});

it('has no palette value containing a semicolon', () => {
  // `paletteCss` joins palette entries as `token:value;` into one `style` attribute string. A
  // value containing a `;` would close that declaration early, turning the rest of the value into
  // a bogus extra declaration and silently truncating everything after it. Values here are
  // developer-authored in-repo theme files, not user input, so this isn't an escaping concern —
  // it's a lint against a mistake shipping unnoticed in a theme's palette.
  const offenders: string[] = [];

  for (const theme of UMBRADESKTOP_THEMES) {
    for (const variant of ['light', 'dark'] as const) {
      const palette = theme.palettes[variant];
      if (!palette) continue;
      for (const [token, value] of Object.entries(palette)) {
        if (value?.includes(';')) offenders.push(`${theme.id}.${variant}.${token} = "${value}"`);
      }
    }
  }

  expect(
    offenders,
    'these theme palette values contain a ";" — paletteCss joins entries as "token:value;" into ' +
      'one style attribute string, so a semicolon inside a value would close the declaration early ' +
      'and silently truncate the rest of the palette',
  ).to.deep.equal([]);
});
