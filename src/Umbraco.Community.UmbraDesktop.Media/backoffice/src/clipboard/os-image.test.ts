import { expect } from '@open-wc/testing';
import { fingerprint, samePicture, toPng, writeImage } from './os-image.js';

/** A copied picture on the OS clipboard (design §5, plan task 6.2). */

/**
 * A small picture: left half one colour, right half another.
 * @param type Its format.
 * @param left The left colour.
 * @param right The right colour.
 * @returns The picture.
 */
async function picture(type: string, left = '#d42054', right = '#3544b1'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 20;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = left;
  draw.fillRect(0, 0, 20, 20);
  draw.fillStyle = right;
  draw.fillRect(20, 0, 20, 20);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), type, 0.95));
}

describe('a picture for the OS clipboard', () => {
  it('converts a JPEG to PNG at the same size, since the clipboard takes PNG only', async () => {
    const jpeg = await picture('image/jpeg');
    const png = await toPng(jpeg);
    const bitmap = await createImageBitmap(png);
    expect([jpeg.type, png.type, bitmap.width, bitmap.height]).to.deep.equal(['image/jpeg', 'image/png', 40, 20]);
  });

  it('knows its own picture again after the browser re-encodes it', async () => {
    const png = await toPng(await picture('image/jpeg'));
    const again = await toPng(await picture('image/webp'));
    expect(samePicture(await fingerprint(png), await fingerprint(again))).to.equal(true);
  });

  it('tells a different picture apart', async () => {
    const ours = await fingerprint(await picture('image/png'));
    const other = await fingerprint(await picture('image/png', '#3544b1', '#d42054'));
    expect(samePicture(ours, other)).to.equal(false);
  });

  it('writes it as one PNG item, handing the clipboard a promise so the write starts at once', async () => {
    const written: ClipboardItem[] = [];
    await writeImage(toPng(await picture('image/jpeg')), { write: async (items) => void written.push(...items) });
    expect(written.length).to.equal(1);
    expect(written[0].types).to.deep.equal(['image/png']);
    expect((await written[0].getType('image/png')).type).to.equal('image/png');
  });
});
