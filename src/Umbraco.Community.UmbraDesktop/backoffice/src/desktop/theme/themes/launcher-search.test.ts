import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';
import { UMBRADESKTOP_WIN98_THEME } from './win98/index.js';
import { UMBRADESKTOP_UMBRACO4_THEME } from './umbraco4/index.js';
import { adoptIconStandIn, mountLauncher, stubApp } from '../../components/launcher.test-helper.js';
import type { UmbraDesktopLauncherMount } from '../../components/launcher.test-helper.js';
import type { UmbraDesktopSearchItem, UmbraDesktopSearchSource } from '../../search/types.js';

/**
 * The launcher's search results under every theme. Both cases were found in a real backoffice, not
 * by the component tests, because each one only shows once a theme's own sheet is adopted: Windows
 * 98 pairs its navy selection fill with white text only under `:hover`, and macOS centres whatever
 * sits in `.body`, which is right for its group cards and wrong for a list.
 */

/** Mounting a launcher under a theme imports that theme's sheets, which is slow in a busy run. */
const TIMEOUT_MS = 30_000;

/** Eight apps matching the query, more than any cap the Apps section once had, of different lengths. */
const APPS = ['Home page builder', 'Homes', 'Home 3', 'Home 4', 'Home 5', 'Home 6', 'Home 7', 'Home 8'].map((name) => stubApp(name));

/**
 * A document result.
 * @param name Its name.
 * @returns The item.
 */
const doc = (name: string): UmbraDesktopSearchItem => ({
  key: `document:${name}`,
  name,
  icon: 'icon-document',
  detail: 'Home › A rather longer location line than any name here',
  open: { kind: 'entity', entityType: 'document', unique: name, href: `section/content/workspace/document/edit/${name}` },
});

/** Two full sources and one compact one, so the view has four bands, Documents with two results. */
const SOURCES: UmbraDesktopSearchSource[] = [
  { alias: 'docs', label: 'Documents', weight: 10, prominence: 'full', search: async () => ({ items: [doc('Home'), doc('Homeward')], total: 2 }) },
  { alias: 'media', label: 'Media', weight: 5, prominence: 'full', search: async () => ({ items: [doc('Home photo')], total: 1 }) },
  { alias: 'types', label: 'Data Types', weight: 0, prominence: 'compact', search: async () => ({ items: [doc('Homepage type')], total: 1 }) },
];

/**
 * Mount a themed launcher and search, waiting for the sources' answer to be drawn.
 * @param theme The theme.
 * @returns The mount.
 */
async function searched(theme: (typeof UMBRADESKTOP_THEMES)[number]): Promise<UmbraDesktopLauncherMount> {
  const mount = await mountLauncher({ apps: APPS, groups: [], theme, searchSources: SOURCES, searchDebounceMs: 0 });
  await adoptIconStandIn(mount);
  const input = mount.root.querySelector<HTMLInputElement>('.search-input')!;
  input.value = 'hom';
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  for (let i = 0; i < 50 && !mount.root.querySelector('.search-results:not(.pending) [data-source="types"]'); i++) await mount.settle();
  return mount;
}

/**
 * A computed colour as channels.
 * @param color A computed `rgb()` or `rgba()` value.
 * @returns Red, green and blue (0 to 255) and alpha (0 to 1).
 */
function channels(color: string): [number, number, number, number] {
  const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number);
  return [r, g, b, color === 'transparent' ? 0 : a];
}

/**
 * A colour's relative luminance, as WCAG defines it.
 * @param rgb Red, green and blue, 0 to 255.
 * @returns The luminance, 0 to 1.
 */
function luminance([r, g, b]: ReadonlyArray<number>): number {
  const [lr, lg, lb] = [r, g, b].map((n) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * What an element's text is really drawn on: its own background composited over its ancestors',
 * through the shadow root to the host, since a hover tint is usually translucent. Over white when
 * nothing is opaque, which is where a test page ends.
 * @param element The element.
 * @returns Red, green and blue.
 */
function backgroundOf(element: Element): [number, number, number] {
  const layers: Array<[number, number, number, number]> = [];
  for (let node: Element | null = element; node; node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null)) {
    const layer = channels(getComputedStyle(node).backgroundColor);
    if (layer[3] > 0) layers.push(layer);
    if (layer[3] >= 1) break;
  }
  let base: [number, number, number] = [255, 255, 255];
  for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
  return base;
}

for (const theme of UMBRADESKTOP_THEMES) {
  it(`${theme.name}: the result Enter opens is marked, and its name stays readable`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await searched(theme);
    try {
      const first = mount.root.querySelector<HTMLElement>('.result.first')!;
      expect(!!first, 'the first result is marked').to.equal(true);
      const name = first.querySelector('.row-name')!;
      const [a, b] = [luminance(channels(getComputedStyle(name).color)), luminance(backgroundOf(first))].sort((x, y) => y - x);
      expect((a + 0.05) / (b + 0.05), 'contrast of the name against what it is drawn on').to.be.at.least(4.5);
    } finally {
      mount.remove();
    }
  });

  it(`${theme.name}: the categories stack, and their results sit side by side where the panel is wide`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await searched(theme);
    try {
      // One band per category, top to bottom, each the full width of the results.
      const groups = [...mount.root.querySelectorAll<HTMLElement>('.search-results > .result-group')];
      expect(groups.map((g) => g.dataset.source)).to.deep.equal(['apps', 'docs', 'media', 'types']);
      const boxes = groups.map((g) => g.getBoundingClientRect());
      for (const box of boxes) expect([Math.round(box.left), Math.round(box.width)], 'every band spans the results').to.deep.equal([Math.round(boxes[0].left), Math.round(boxes[0].width)]);
      for (let i = 1; i < boxes.length; i++) expect(boxes[i].top, 'each band below the one before').to.be.at.least(boxes[i - 1].bottom - 1);

      // Within a band the results flow across. The retro Start menus are one narrow column, as their
      // own launcher is; every other theme's panel is wide enough for at least two.
      const narrow = theme === UMBRADESKTOP_WIN98_THEME || theme === UMBRADESKTOP_UMBRACO4_THEME;
      const tops = (source: string) => [...mount.root.querySelectorAll<HTMLElement>(`[data-source="${source}"] .result`)].map((r) => Math.round(r.getBoundingClientRect().top));
      const apps = tops('apps');
      expect(apps.length, 'every matching app').to.equal(APPS.length);
      for (const [label, [first, second]] of [['apps', apps], ['documents', tops('docs')]] as const) {
        expect(narrow ? first < second : first === second, `${label} beside one another`).to.equal(true);
      }
    } finally {
      mount.remove();
    }
  });
}
