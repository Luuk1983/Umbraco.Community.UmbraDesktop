import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_THEMES } from './index.js';
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

/** Two apps whose names start with the query, so the Apps section has rows of different lengths. */
const APPS = [stubApp('Home page builder'), stubApp('Homes')];

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

/** One full source and one folded one, so the view has two sections and an Also in line. */
const SOURCES: UmbraDesktopSearchSource[] = [
  { alias: 'docs', label: 'Documents', weight: 10, prominence: 'full', search: async () => ({ items: [doc('Home'), doc('Homeward')], total: 2 }) },
  { alias: 'types', label: 'Data Types', weight: 0, prominence: 'folded', search: async () => ({ items: [], total: 3 }) },
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
  for (let i = 0; i < 50 && !mount.root.querySelector('.search-results:not(.pending) .also-in'); i++) await mount.settle();
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

  it(`${theme.name}: the sections and the Also in line share one column`, async function () {
    this.timeout(TIMEOUT_MS);
    const mount = await searched(theme);
    try {
      const blocks = [...mount.root.querySelectorAll<HTMLElement>('.search-results > .result-group, .search-results > .also-in')];
      expect(blocks.length, 'Apps, Documents and Also in are drawn').to.equal(3);
      const edges = blocks.map((block) => {
        const rect = block.getBoundingClientRect();
        return [Math.round(rect.left), Math.round(rect.width)];
      });
      for (const edge of edges) expect(edge, 'left edge and width').to.deep.equal(edges[0]);
    } finally {
      mount.remove();
    }
  });
}
