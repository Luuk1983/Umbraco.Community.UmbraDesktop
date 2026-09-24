import { expect, fixture, html } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import './calculator/calculator.element.js';
import './clock/clock.element.js';
import './notepad/notepad.element.js';
import './paint/paint.element.js';

/**
 * Every app, measured in a real browser at both sizes its manifest declares, under every theme id
 * and under none: its content must fit the box the host will give it.
 *
 * This is the repository's "derive numbers, then measure them" rule as a test. Each `constants.ts`
 * derives its sizes, which only proves the sum agrees with itself; this is the check against the
 * rendered page. It earned its place on the first run: Clock's SVG face sized itself from its width
 * and overflowed its minimum box by 40px, under every theme, with every other test green.
 *
 * The theme ids are stamped as attributes only, with no palette behind them, so what this measures
 * is each app's own per-theme branches. That is exactly the part `docs/desktop-apps.md` §8 warns can
 * change an app's size under one theme alone. The palettes themselves are the host's, and every
 * accessory reads them only for colours, radii and bevels drawn as shadows, none of which take
 * layout.
 */

/** Each app's tag, by its manifest `name`. */
const TAGS: Record<string, string> = {
  Notepad: 'umbradesktop-notepad',
  Paint: 'umbradesktop-paint',
  Calculator: 'umbradesktop-calculator',
  Clock: 'umbradesktop-clock',
};

/** The published theme ids (`docs/desktop-apps.md` §5), plus no theme at all. */
const THEMES = [undefined, 'umbraco', 'umbraco4', 'macos', 'win11', 'win98'];

/** A registered app, as far as this test reads it. */
interface App {
  name: string;
  meta: Record<'defaultSize' | 'minSize', { w: number; h: number }>;
}

const apps = manifests.filter((manifest) => manifest.type === 'umbraDesktopApp') as unknown as App[];

for (const app of apps) {
  for (const which of ['defaultSize', 'minSize'] as const) {
    for (const theme of THEMES) {
      it(`${app.name} fits its ${which} under ${theme ?? 'no theme'}`, async () => {
        const { w, h } = app.meta[which];
        // The window body the host would give it: exactly the content box, laid out as a column the
        // app's own :host fills.
        const body = await fixture<HTMLDivElement>(
          html`<div style="display: flex; flex-direction: column; width: ${w}px; height: ${h}px; overflow: hidden"></div>`,
        );
        const element = document.createElement(TAGS[app.name]) as HTMLElement & { updateComplete: Promise<unknown> };
        if (theme) element.setAttribute('data-umbradesktop-theme', theme);
        element.style.flex = '1';
        body.appendChild(element);
        await element.updateComplete;
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(element.scrollWidth, 'rendered width').to.be.at.most(w);
        expect(element.scrollHeight, 'rendered height').to.be.at.most(h);
      });
    }
  }
}
