import { expect } from '@open-wc/testing';
import { isAnimatedGif, refusalFor } from './formats.js';
import { ACCEPT } from './constants.js';

/**
 * What the editor opens. It is a raster editor, so SVG is refused with a reason of its own; an
 * animated GIF opens, with a notice that saving keeps only its first frame. Design §6.
 */

/**
 * A fixture's bytes.
 * @param name The file in `fixtures/`.
 * @returns Its bytes.
 */
async function fixture(name: string): Promise<Uint8Array> {
  const response = await fetch(new URL(`./fixtures/${name}`, import.meta.url));
  return new Uint8Array(await response.arrayBuffer());
}

it('refuses SVG, and anything it cannot open, and opens every accepted extension in any case', () => {
  expect(refusalFor('svg')).to.equal('svg');
  expect(refusalFor('SVG')).to.equal('svg');
  expect(refusalFor('txt')).to.equal('unsupported');
  expect(refusalFor('')).to.equal('unsupported');
  expect(refusalFor('JPG')).to.equal(null);
  for (const extension of ACCEPT) expect(refusalFor(extension), extension).to.equal(null);
});

it('tells an animated GIF from a still one', async () => {
  expect(isAnimatedGif(await fixture('one-frame.gif'))).to.equal(false);
  expect(isAnimatedGif(await fixture('two-frames.gif'))).to.equal(true);
});

it('answers false for anything that is not a GIF, or a GIF cut short', async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  expect(isAnimatedGif(png)).to.equal(false);
  expect(isAnimatedGif(new Uint8Array())).to.equal(false);
  const two = await fixture('two-frames.gif');
  expect(isAnimatedGif(two.slice(0, 20))).to.equal(false);
});
