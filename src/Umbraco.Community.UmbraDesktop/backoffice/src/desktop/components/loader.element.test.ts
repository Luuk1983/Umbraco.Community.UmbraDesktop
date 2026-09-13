import { expect, fixture, html } from '@open-wc/testing';
import './loader.element.js';
import type { UmbraDesktopLoaderElement } from './loader.element.js';
import {
  UMBRADESKTOP_MARK_PATH,
  UMBRADESKTOP_RING_DASHARRAY,
  UMBRADESKTOP_WINDOW_RING_SIZE,
  ringMarkSize,
} from '../loader-ring.js';

/**
 * The loader is the boot splash's mark and ring, shrunk to sit in a window body. Everything it
 * asserts is about staying that: the same mark, the same arc, and a box that leaves the window it
 * covers still looking like a window.
 *
 * The animation itself is not asserted — a keyframe either runs or the browser is broken — but its
 * reduced-motion behaviour is, because that one has a wrong answer that looks fine in a screenshot.
 */

/** Mount a loader and hand back its shadow root, which is where everything under test lives. */
async function mountLoader(): Promise<ShadowRoot> {
  const el = await fixture<UmbraDesktopLoaderElement>(html`<umbradesktop-loader></umbradesktop-loader>`);
  return el.shadowRoot!;
}

it('draws the Umbraco mark, not a generic spinner', async () => {
  const root = await mountLoader();

  // Compared against the shared constant rather than a snippet of the path, so the mark cannot be
  // swapped for a lookalike while the test keeps passing on a matching first curve.
  expect(root.querySelector('path')?.getAttribute('d'), 'the mark should be the shared Umbraco path').to.equal(
    UMBRADESKTOP_MARK_PATH,
  );
});

it('draws a full track under a partial arc', async () => {
  const root = await mountLoader();

  // Both circles, or the ring reads as a fragment with nothing behind it — which is the shape that
  // says "stalled" rather than "working", and the reason the splash draws two.
  expect(root.querySelector('.track'), 'the full ring should sit behind the arc').to.not.be.null;
  expect(root.querySelector('.arc')?.getAttribute('stroke-dasharray'), 'the arc should be the derived quarter').to.equal(
    UMBRADESKTOP_RING_DASHARRAY,
  );
});

it('sizes itself from the one window constant', async () => {
  const el = await fixture<UmbraDesktopLoaderElement>(html`<umbradesktop-loader></umbradesktop-loader>`);

  const box = el.getBoundingClientRect();
  expect(box.width, 'the loader should be exactly the size the constant names').to.be.closeTo(
    UMBRADESKTOP_WINDOW_RING_SIZE,
    0.5,
  );
  expect(box.height, 'and square, since the ring is a circle').to.be.closeTo(UMBRADESKTOP_WINDOW_RING_SIZE, 0.5);
});

it('renders the mark at the derived size rather than a typed one', async () => {
  const el = await fixture<UmbraDesktopLoaderElement>(html`<umbradesktop-loader></umbradesktop-loader>`);

  const mark = el.shadowRoot!.querySelector('.mark') as SVGElement;
  expect(mark.getBoundingClientRect().width, 'the mark should be the ratio of the box, measured').to.be.closeTo(
    ringMarkSize(UMBRADESKTOP_WINDOW_RING_SIZE),
    0.5,
  );
});

it('keeps the ring and hides only the arc under reduced motion', async () => {
  const el = await fixture<UmbraDesktopLoaderElement>(html`<umbradesktop-loader></umbradesktop-loader>`);
  const cssText = (el.constructor as typeof UmbraDesktopLoaderElement).styles.toString();

  // Asserted against the CSS rather than by emulating the preference, which web-test-runner cannot
  // do without a Chrome DevTools Protocol hop this suite does not take elsewhere. The wrong answer
  // it guards is a stopped arc: a frozen quarter-circle reads as progress that has died, where the
  // whole track reads as an ornament and says nothing.
  expect(cssText, 'reduced motion should be handled at all').to.contain('prefers-reduced-motion');
  const reduced = cssText.slice(cssText.indexOf('prefers-reduced-motion'));
  expect(reduced, 'the arc is what goes').to.contain('.arc');
  expect(reduced, 'the track is not what goes').to.not.contain('.track');
});

it('takes its colour from the theme token', async () => {
  const el = await fixture<UmbraDesktopLoaderElement>(html`<umbradesktop-loader></umbradesktop-loader>`);
  const cssText = (el.constructor as typeof UmbraDesktopLoaderElement).styles.toString();

  // The token is the whole of a theme's say over this element, so a hardcoded colour slipping in
  // would leave one theme with an invisible loader and no way to fix it from a palette.
  expect(cssText, 'the loader colour should be themeable').to.contain('--umbradesktop-window-loader-color');
});
