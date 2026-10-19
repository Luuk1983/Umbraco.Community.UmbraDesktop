import { expect } from '@open-wc/testing';
import { pasteIntent } from './paste-intent.js';
import { fingerprint } from './os-image.js';

/** What a paste brings (design §5, plan task 6.3). */

/**
 * A plain PNG of one colour.
 * @param colour The colour.
 * @returns The file, named as Chrome names every pasted picture.
 */
async function png(colour: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const draw = canvas.getContext('2d')!;
  draw.fillStyle = colour;
  draw.fillRect(0, 0, 16, 16);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], 'image.png', { type: 'image/png' });
}

/**
 * A paste's data.
 * @param files Its files.
 * @param text Its text.
 * @returns The data.
 */
function pasted(files: File[], text?: string): DataTransfer {
  const data = new DataTransfer();
  for (const file of files) data.items.add(file);
  if (text) data.setData('text/plain', text);
  return data;
}

describe('what a paste brings', () => {
  it('pastes what we hold when the paste carries only text', async () => {
    expect((await pasteIntent(pasted([], 'hello'), undefined)).kind).to.equal('held');
  });

  it('pastes what we hold when there is nothing at all', async () => {
    expect((await pasteIntent(null, undefined)).kind).to.equal('held');
  });

  it('uploads files from the OS', async () => {
    const file = await png('#d42054');
    const intent = await pasteIntent(pasted([file]), undefined);
    expect(intent.kind).to.equal('files');
    expect(intent.kind === 'files' && intent.files.length).to.equal(1);
  });

  it('knows our own copied picture coming back, and pastes the item instead of uploading it', async () => {
    const file = await png('#d42054');
    expect((await pasteIntent(pasted([file]), await fingerprint(file))).kind).to.equal('ours');
  });

  it('pastes what we hold over a picture on the OS clipboard when ours was copied after it', async () => {
    expect((await pasteIntent(pasted([await png('#3544b1')]), undefined, true)).kind).to.equal('held');
  });

  it('uploads a different picture even while ours is remembered', async () => {
    const ours = await fingerprint(await png('#d42054'));
    expect((await pasteIntent(pasted([await png('#3544b1')]), ours)).kind).to.equal('files');
  });
});
