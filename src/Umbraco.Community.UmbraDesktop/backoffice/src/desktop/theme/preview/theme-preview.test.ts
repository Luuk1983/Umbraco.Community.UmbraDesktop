import { expect, fixture, html } from '@open-wc/testing';
import type { CSSResultGroup, CSSResultOrNative } from '@umbraco-cms/backoffice/external/lit';
import { UmbraDesktopThemePreviewElement } from './theme-preview.element.js';
import { UMBRADESKTOP_PREVIEW_SCALE, UMBRADESKTOP_PREVIEW_SCENE } from './constants.js';
import { UMBRADESKTOP_THEMES } from '../themes/index.js';
import type { UmbraDesktopTheme } from '../types.js';
import { UMBRADESKTOP_TOKENS } from '../types.js';
import { UMBRADESKTOP_TITLEBAR_HEIGHT } from '../../constants.js';
import { UmbraDesktopDesktopElement } from '../../components/desktop.element.js';
import { UmbraDesktopTaskbarElement } from '../../components/taskbar.element.js';
import { UmbraDesktopLauncherElement } from '../../components/launcher.element.js';
import { UmbraDesktopWindowElement } from '../../components/window.element.js';

/**
 * What the picker's miniature has to get right, measured in a browser rather than asserted against
 * CSS text: a preview that paints the wrong thing looks plausible in source and wrong on screen,
 * which is exactly the failure mode the themes' own geometry tests exist for.
 *
 * The last test here is the one that earns its keep. The preview restates the chrome's own token
 * fallbacks, because the Umbraco identity theme ships an empty palette and a preview painted from
 * palettes alone would render it as nothing at all. That restatement is a second copy of a number,
 * so it is held against the first copy on every run.
 */

/** Render one theme's preview and hand back the element, its scene and the parts under test. */
async function previewOf(theme: UmbraDesktopTheme) {
  const element = await fixture<UmbraDesktopThemePreviewElement>(
    html`<umbradesktop-theme-preview .theme=${theme}></umbradesktop-theme-preview>`,
  );
  await element.updateComplete;
  const root = element.shadowRoot!;
  return {
    element,
    scene: root.querySelector('.scene') as HTMLElement,
    frame: root.querySelector('.frame') as HTMLElement,
    titlebar: root.querySelector('.titlebar') as HTMLElement,
    taskbar: root.querySelector('.taskbar') as HTMLElement,
    leading: root.querySelector('.controls.leading') as HTMLElement | null,
    trailing: root.querySelector('.controls.trailing') as HTMLElement | null,
  };
}

it('renders at the size its constants publish, so a row of previews lays out predictably', async () => {
  const { element } = await previewOf(UMBRADESKTOP_THEMES[0]);
  const box = element.getBoundingClientRect();

  expect(box.width).to.be.closeTo(UMBRADESKTOP_PREVIEW_SCENE.w * UMBRADESKTOP_PREVIEW_SCALE, 0.5);
  expect(box.height).to.be.closeTo(UMBRADESKTOP_PREVIEW_SCENE.h * UMBRADESKTOP_PREVIEW_SCALE, 0.5);
});

it('gives each theme the titlebar height that theme publishes', async () => {
  for (const theme of UMBRADESKTOP_THEMES) {
    const { titlebar } = await previewOf(theme);
    // The scene is drawn at desktop scale and shrunk with a transform, so layout px are the
    // theme's own numbers — `getComputedStyle`, not `getBoundingClientRect`, which would report
    // them already scaled.
    const expected = theme.palettes.light['--umbradesktop-titlebar-height'] ?? `${UMBRADESKTOP_TITLEBAR_HEIGHT}px`;
    expect(getComputedStyle(titlebar).height, `${theme.name} titlebar`).to.equal(expected);
  }
});

it('puts the window controls at the end the theme says they are on', async () => {
  for (const theme of UMBRADESKTOP_THEMES) {
    const { leading, trailing } = await previewOf(theme);

    for (const [side, block, width] of [
      ['leading', leading, theme.metrics.leadingControlsWidth],
      ['trailing', trailing, theme.metrics.trailingControlsWidth],
    ] as const) {
      if (width > 0) {
        expect(block, `${theme.name} ${side} controls`).to.exist;
        expect(getComputedStyle(block!).width, `${theme.name} ${side} controls`).to.equal(`${width}px`);
      } else {
        expect(block, `${theme.name} draws no ${side} controls`).to.equal(null);
      }
    }
  }
});

it('renders no two shipped themes alike', async () => {
  const signatures = new Map<string, string>();

  for (const theme of UMBRADESKTOP_THEMES) {
    const { scene, frame, titlebar, taskbar } = await previewOf(theme);
    const signature = JSON.stringify([
      getComputedStyle(scene).backgroundColor,
      getComputedStyle(frame).borderRadius,
      getComputedStyle(titlebar).backgroundColor,
      getComputedStyle(titlebar).height,
      getComputedStyle(taskbar).backgroundColor,
      getComputedStyle(taskbar).borderRadius,
    ]);

    const twin = signatures.get(signature);
    expect(twin, `${theme.name} and ${twin} render an identical preview`).to.equal(undefined);
    signatures.set(signature, theme.name);
  }
});

it("adopts a theme's own preview stylesheet, so a signature no token carries still shows", async () => {
  // macOS is the theme that has one: its traffic lights are colours it sets on controls rather than
  // on tokens, so without its sheet the preview draws three grey dots where everyone looks for red,
  // amber and green. Awaiting `updateComplete` is enough because the element holds that promise
  // open until the sheet is adopted — see its `getUpdateComplete`.
  const macos = UMBRADESKTOP_THEMES.find((theme) => theme.id === 'macos')!;
  const { element } = await previewOf(macos);
  const lights = element.shadowRoot!.querySelectorAll('.controls.leading i');

  expect([...lights].map((light) => getComputedStyle(light).backgroundColor)).to.deep.equal([
    'rgb(255, 95, 87)',
    'rgb(254, 188, 46)',
    'rgb(40, 200, 64)',
  ]);
});

/** Flatten a Lit `CSSResultGroup` — possibly a nested array — into a flat list of leaf entries. */
function flattenStyles(styles: CSSResultGroup): CSSResultOrNative[] {
  return Array.isArray(styles) ? styles.flatMap((entry) => flattenStyles(entry)) : [styles];
}

/**
 * Every `var(--umbradesktop-*, fallback)` read in a set of styles, as token to the set of fallbacks
 * written for it.
 *
 * Parsed by walking parentheses rather than with one regex, because a fallback is routinely another
 * `var()` — `var(--umbradesktop-window-radius, var(--uui-border-radius, 3px))` — and a
 * non-greedy match would stop at the first `)` and compare half a value.
 * @param styles The `static styles` of a component.
 * @returns Each token read, with the fallbacks written for it, whitespace normalised.
 */
function fallbacksIn(styles: CSSResultGroup): Map<string, Set<string>> {
  const cssText = flattenStyles(styles)
    .map((sheet) => ('cssText' in sheet ? sheet.cssText : ''))
    .join('\n');

  const found = new Map<string, Set<string>>();
  const opener = /var\(\s*(--umbradesktop-[a-z-]+)\s*,/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(cssText))) {
    let depth = 1;
    let index = match.index + match[0].length;
    while (index < cssText.length && depth > 0) {
      if (cssText[index] === '(') depth += 1;
      if (cssText[index] === ')') depth -= 1;
      index += 1;
    }
    const fallback = cssText.slice(match.index + match[0].length, index - 1).trim();
    const normalised = fallback.replace(/\s+/g, ' ');
    if (!found.has(match[1])) found.set(match[1], new Set());
    found.get(match[1])!.add(normalised);
  }

  return found;
}

it('falls back to exactly what the chrome falls back to, so the Umbraco theme previews as itself', () => {
  const chrome = new Map<string, Set<string>>();
  for (const ctor of [
    UmbraDesktopDesktopElement,
    UmbraDesktopTaskbarElement,
    UmbraDesktopLauncherElement,
    UmbraDesktopWindowElement,
  ]) {
    for (const [token, fallbacks] of fallbacksIn(ctor.styles)) {
      if (!chrome.has(token)) chrome.set(token, new Set());
      for (const fallback of fallbacks) chrome.get(token)!.add(fallback);
    }
  }

  const drifted: string[] = [];
  for (const [token, fallbacks] of fallbacksIn(UmbraDesktopThemePreviewElement.styles)) {
    // Only what a *theme* can set. The preview also reads `--umbradesktop-preview-scale`, which is
    // the element's own knob for how big to draw rather than part of the theme contract — no chrome
    // component reads it, and `UmbraDesktopToken` being a closed union means a palette cannot set
    // it either.
    if (!(UMBRADESKTOP_TOKENS as ReadonlyArray<string>).includes(token)) continue;
    for (const fallback of fallbacks) {
      if (!chrome.get(token)?.has(fallback)) {
        drifted.push(`${token}: preview has "${fallback}", chrome has ${[...(chrome.get(token) ?? [])].join(' | ')}`);
      }
    }
  }

  expect(
    drifted,
    'the preview restates the chrome\'s token fallbacks so that the Umbraco theme — whose palette ' +
      'is empty on purpose — previews as itself. These no longer match what the chrome actually ' +
      'falls back to, so that theme now previews as something it is not',
  ).to.deep.equal([]);
});
