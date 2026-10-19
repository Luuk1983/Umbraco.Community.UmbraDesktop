import { expect } from '@open-wc/testing';
import { decodePicture } from './decode.js';
import { renderDocument } from './render.js';
import { initialState } from './state.js';

/**
 * Review Focus 5: a phone photo carries its orientation in EXIF rather than in its pixels. The
 * browser applies it when it decodes, so the picture is upright in the editor and saved upright,
 * with its sides swapped (design §6, Metadata).
 */

/** A 4 × 2 JPEG stored on its side with EXIF orientation 6: upright it is 2 × 4. */
async function sideways(): Promise<Blob> {
  const response = await fetch(new URL('./fixtures/exif-orientation-6.jpg', import.meta.url));
  return response.blob();
}

it('decodes a phone photo upright, with its sides swapped', async () => {
  const picture = await decodePicture(await sideways());
  expect({ w: picture.width, h: picture.height }).to.deep.equal({ w: 2, h: 4 });
});

it('saves it upright when nothing was changed', async () => {
  const picture = await decodePicture(await sideways());
  const canvas = renderDocument(picture, initialState({ w: picture.width, h: picture.height }));
  expect({ w: canvas.width, h: canvas.height }).to.deep.equal({ w: 2, h: 4 });
});
