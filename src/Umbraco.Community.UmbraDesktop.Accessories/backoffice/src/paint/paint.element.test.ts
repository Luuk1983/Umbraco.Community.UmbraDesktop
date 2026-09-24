import { expect, fixture, html } from '@open-wc/testing';
import './paint.element.js';
import { PAINT_CANVAS_SIZE } from './constants.js';
import type { PaintElement } from './paint.element.js';
import { fixedSaveSettings } from '../settings/save-settings.source.js';
import type { AccessoriesSaveSettings } from '../settings/save-settings.js';

/** What the element handed the outside world, recorded rather than performed. */
interface Recorded {
  downloads: Array<{ name: string; blob: Blob }>;
  /** Every save to the media library: file name, type, folder, and the item it was asked to overwrite. */
  media: Array<[string, string, string | null, string | undefined]>;
}

/** A mounted Paint whose downloads are recorded and whose discard question answers yes. */
async function paint(
  settings: AccessoriesSaveSettings = { destination: 'computer', folder: null },
): Promise<{ element: PaintElement; recorded: Recorded }> {
  const recorded: Recorded = { downloads: [], media: [] };
  const element = await fixture<PaintElement>(html`<umbradesktop-paint
    .download=${(blob: Blob, name: string) => recorded.downloads.push({ name, blob })}
    .confirmDiscard=${async () => true}
    .saveSettings=${fixedSaveSettings(settings)}
    .saveToMedia=${async (file: File, folder: string | null, existing?: string) => {
      recorded.media.push([file.name, file.type, folder, existing]);
      return { ok: true, unique: 'picture-1' };
    }}
  ></umbradesktop-paint>`);
  return { element, recorded };
}

/** The picture. */
function canvas(element: PaintElement): HTMLCanvasElement {
  return element.shadowRoot!.querySelector('canvas')!;
}

/** One pixel of the picture, as RGBA. */
function pixel(element: PaintElement, x: number, y: number): number[] {
  return [...canvas(element).getContext('2d')!.getImageData(x, y, 1, 1).data];
}

/**
 * A pointer event at a picture coordinate, converted to the client coordinates a real one carries.
 * @param type The event.
 * @param point The picture pixel.
 * @param button Which button: 0 for left, 2 for right.
 */
function pointer(element: PaintElement, type: string, [x, y]: [number, number], button = 0): void {
  const rect = canvas(element).getBoundingClientRect();
  const scale = rect.width / canvas(element).width;
  canvas(element).dispatchEvent(
    new PointerEvent(type, {
      clientX: rect.left + (x + 0.5) * scale,
      clientY: rect.top + (y + 0.5) * scale,
      button,
      buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : 1,
      pointerId: 1,
      bubbles: true,
      composed: true,
    }),
  );
}

/** Drag across the picture through `points`. */
async function drag(element: PaintElement, points: Array<[number, number]>, button = 0): Promise<void> {
  pointer(element, 'pointerdown', points[0], button);
  for (const point of points.slice(1)) pointer(element, 'pointermove', point, button);
  pointer(element, 'pointerup', points[points.length - 1], button);
  await element.updateComplete;
}

/** Click a control by a data attribute. */
async function click(element: PaintElement, selector: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLElement>(selector)!.click();
  await element.updateComplete;
  await new Promise((resolve) => setTimeout(resolve));
}

const WHITE = [255, 255, 255, 255];
const BLACK = [0, 0, 0, 255];
const RED = [255, 0, 0, 255];

it('opens on a blank picture of the declared size', async () => {
  const { element } = await paint();
  expect([canvas(element).width, canvas(element).height]).to.deep.equal([PAINT_CANVAS_SIZE.w, PAINT_CANVAS_SIZE.h]);
  expect(pixel(element, 10, 10)).to.deep.equal(WHITE);
});

it('draws a gapless line in black with the pencil', async () => {
  const { element } = await paint();
  await drag(element, [
    [10, 10],
    [40, 10],
  ]);
  expect(pixel(element, 10, 10)).to.deep.equal(BLACK);
  expect(pixel(element, 25, 10), 'between the two pointer events').to.deep.equal(BLACK);
  expect(pixel(element, 25, 11), 'a pencil is one pixel').to.deep.equal(WHITE);
});

it('paints in the colour picked from the palette', async () => {
  const { element } = await paint();
  await click(element, '[data-colour="#ff0000"]');
  await drag(element, [[5, 5]]);
  expect(pixel(element, 5, 5)).to.deep.equal(RED);
});

/** Left button paints the foreground and right button the background, as MS Paint always has. */
it('paints the background colour with the right button', async () => {
  const { element } = await paint();
  await drag(element, [[5, 5]]);
  await drag(element, [[5, 5]], 2);
  expect(pixel(element, 5, 5), 'the background is white').to.deep.equal(WHITE);
});

it('fills an area with the bucket', async () => {
  const { element } = await paint();
  await click(element, '[data-colour="#ff0000"]');
  await click(element, '[data-tool="fill"]');
  await drag(element, [[100, 100]]);
  expect(pixel(element, 0, 0)).to.deep.equal(RED);
  expect(pixel(element, PAINT_CANVAS_SIZE.w - 1, PAINT_CANVAS_SIZE.h - 1)).to.deep.equal(RED);
});

it('rubs out to the background colour with the eraser', async () => {
  const { element } = await paint();
  await click(element, '[data-tool="brush"]');
  await drag(element, [[20, 20]]);
  expect(pixel(element, 20, 20)).to.deep.equal(BLACK);
  await click(element, '[data-tool="eraser"]');
  await drag(element, [[20, 20]]);
  expect(pixel(element, 20, 20)).to.deep.equal(WHITE);
});

it('takes a stroke back with Undo, and with Ctrl+Z', async () => {
  const { element } = await paint();
  await drag(element, [[5, 5]]);
  await drag(element, [[9, 9]]);
  await click(element, '[data-action="undo"]');
  expect(pixel(element, 9, 9), 'the last stroke is gone').to.deep.equal(WHITE);
  expect(pixel(element, 5, 5), 'the one before stays').to.deep.equal(BLACK);
  const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
  element.dispatchEvent(event);
  await element.updateComplete;
  expect(pixel(element, 5, 5)).to.deep.equal(WHITE);
  expect(event.defaultPrevented).to.equal(true);
});

it('starts a new picture', async () => {
  const { element } = await paint();
  await drag(element, [[5, 5]]);
  await click(element, '[data-action="new"]');
  expect(pixel(element, 5, 5)).to.deep.equal(WHITE);
});

it('saves the picture as a PNG', async () => {
  const { element, recorded } = await paint();
  await click(element, '[data-action="save"]');
  // toBlob is asynchronous, so give it a moment.
  for (let tries = 0; tries < 20 && !recorded.downloads.length; tries++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  expect(recorded.downloads.length).to.equal(1);
  expect(recorded.downloads[0].name).to.match(/\.png$/);
  expect(recorded.downloads[0].blob.type).to.equal('image/png');
});

/** Wait for `condition`, since a PNG is encoded asynchronously before it can be saved anywhere. */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 40 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
}

it('saves a PNG to the media library when Desktop settings say so, overwriting it next time', async () => {
  const { element, recorded } = await paint({ destination: 'media', folder: { unique: 'folder-1', name: 'Pictures' } });
  await click(element, '[data-action="save"]');
  await until(() => recorded.media.length === 1);
  await drag(element, [[5, 5]]);
  await click(element, '[data-action="save"]');
  await until(() => recorded.media.length === 2);
  expect(recorded.media).to.deep.equal([
    ['Untitled.png', 'image/png', 'folder-1', undefined],
    ['Untitled.png', 'image/png', 'folder-1', 'picture-1'],
  ]);
  expect(recorded.downloads).to.deep.equal([]);
});

it('offers the other destination on its own button', async () => {
  const { element, recorded } = await paint();
  await click(element, '[data-action="save-other"]');
  await until(() => recorded.media.length === 1);
  expect(recorded.media.length, 'Save downloads, so the second button saves to media').to.equal(1);
});

it('starts a new media item for a new picture', async () => {
  const { element, recorded } = await paint({ destination: 'media', folder: null });
  await click(element, '[data-action="save"]');
  await until(() => recorded.media.length === 1);
  await click(element, '[data-action="new"]');
  await click(element, '[data-action="save"]');
  await until(() => recorded.media.length === 2);
  expect(recorded.media[1][3]).to.equal(undefined);
});
