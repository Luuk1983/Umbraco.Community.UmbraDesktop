import { expect } from '@open-wc/testing';
import { Point } from 'fabric';
import { control, defineFakeFilePage, mountEditor, openFixture, press, settle } from '../image-editor.test-helper.js';
import { regionObjectsOf } from '../regions.js';
import { REDACT_DEFAULT_STRENGTH, redactionBlock } from '../redact.js';

/**
 * Redact: Pixelate or Blur and a strength; a drag draws a region; each region keeps its own style
 * and strength and stays editable until saved; the saved file holds none of the original pixels
 * under a region (design §4.1).
 */

defineFakeFilePage();

/** An editor with the 80 × 60 fixture open, in Redact. */
async function redacting() {
  const { editor, page } = await mountEditor();
  await openFixture(editor, page!);
  editor.setMode('redact');
  await settle(editor);
  return { editor, page: page! };
}

/** How many steps the history has behind it. */
function steps(editor: { history?: { canUndo: boolean; undo(): void; redo(): void } }): number {
  const history = editor.history!;
  let count = 0;
  while (history.canUndo) {
    history.undo();
    count++;
  }
  for (let i = 0; i < count; i++) history.redo();
  return count;
}

/** Drag on the canvas as Fabric reports it, in world pixels. */
async function dragOnCanvas(editor: Awaited<ReturnType<typeof redacting>>['editor'], from: Point, to: Point): Promise<void> {
  const canvas = editor.stage!.canvas;
  const event = (type: string) => new PointerEvent(type, { bubbles: true });
  canvas.fire('mouse:down', { e: event('pointerdown'), scenePoint: from } as never);
  canvas.fire('mouse:move', { e: event('pointermove'), scenePoint: to } as never);
  canvas.fire('mouse:up', { e: event('pointerup'), scenePoint: to } as never);
  await settle(editor);
}

it('offers Pixelate and Blur, with a strength that starts strong', async () => {
  const { editor } = await redacting();
  expect(control(editor, 'style-pixelate').getAttribute('aria-pressed')).to.equal('true');
  expect(control(editor, 'style-blur').getAttribute('aria-pressed')).to.equal('false');
  const strength = editor.shadowRoot!.querySelector('.panel input[name="strength"]') as HTMLInputElement;
  expect(strength.value).to.equal(String(REDACT_DEFAULT_STRENGTH));
  expect(strength.min).to.equal('1');
  expect(strength.max).to.equal('10');
  expect(strength.labels?.[0]).to.not.equal(undefined);
});

it('draws a region with a drag, as one step, in the style and strength chosen', async () => {
  const { editor } = await redacting();
  control(editor, 'style-blur').click();
  await settle(editor);
  await dragOnCanvas(editor, new Point(10, 10), new Point(40, 30));
  expect(editor.state!.regions).to.have.length(1);
  expect(editor.state!.regions[0]).to.deep.include({ style: 'blur', strength: REDACT_DEFAULT_STRENGTH, rect: { x: 10, y: 10, w: 30, h: 20 } });
  expect(steps(editor)).to.equal(1);
});

it('keeps each region its own style and strength', async () => {
  const { editor } = await redacting();
  await dragOnCanvas(editor, new Point(5, 5), new Point(25, 25));
  editor.stage!.canvas.discardActiveObject();
  editor.stage!.canvas.fire('selection:cleared', {} as never);
  await settle(editor);
  control(editor, 'style-blur').click();
  const strength = editor.shadowRoot!.querySelector('.panel input[name="strength"]') as HTMLInputElement;
  strength.value = '3';
  strength.dispatchEvent(new Event('change', { bubbles: true }));
  await settle(editor);
  await dragOnCanvas(editor, new Point(40, 30), new Point(70, 50));
  const [first, second] = editor.state!.regions;
  expect(first).to.deep.include({ style: 'pixelate', strength: REDACT_DEFAULT_STRENGTH });
  expect(second).to.deep.include({ style: 'blur', strength: 3 });
});

it('moves, resizes, restyles and deletes a selected region, one step each', async () => {
  const { editor } = await redacting();
  await dragOnCanvas(editor, new Point(10, 10), new Point(40, 30));
  const object = regionObjectsOf(editor)[0];
  editor.stage!.canvas.setActiveObject(object);
  editor.stage!.canvas.fire('selection:created', { selected: [object] } as never);
  await settle(editor);
  expect(control(editor, 'region-delete').disabled).to.equal(false);

  object.set({ left: object.left + 5 });
  editor.stage!.canvas.fire('object:modified', { target: object } as never);
  await settle(editor);
  expect(editor.state!.regions[0].rect.x).to.equal(15);

  const resized = regionObjectsOf(editor)[0];
  resized.set({ scaleX: resized.scaleX * 2 });
  editor.stage!.canvas.fire('object:modified', { target: resized } as never);
  await settle(editor);
  expect(editor.state!.regions[0].rect.w).to.equal(60);

  control(editor, 'style-blur').click();
  await settle(editor);
  expect(editor.state!.regions[0].style).to.equal('blur');

  press(editor, 'Delete');
  await settle(editor);
  expect(editor.state!.regions).to.have.length(0);
  expect(steps(editor)).to.equal(5);
});

it('draws a region redacted on the canvas as soon as it is drawn', async () => {
  const { editor } = await redacting();
  await dragOnCanvas(editor, new Point(0, 0), new Point(48, 32));
  const object = regionObjectsOf(editor)[0];
  const pixels = object.getElement() as HTMLCanvasElement;
  expect(pixels.tagName).to.equal('CANVAS');
  // The fixture has a sharp yellow rectangle from (10, 10); pixelated, the region holds only flat
  // blocks, so the first block is one colour throughout.
  const context = pixels.getContext('2d')!;
  const block = Math.max(1, Math.floor(redactionBlock({ w: 80, h: 60 }, REDACT_DEFAULT_STRENGTH) * (pixels.width / 48)));
  const data = context.getImageData(0, 0, block, block).data;
  for (let i = 4; i < data.length; i += 4) expect([...data.slice(i, i + 3)]).to.deep.equal([...data.slice(0, 3)]);
});

it('saves none of the original pixels under a region', async () => {
  const { editor, page } = await redacting();
  await dragOnCanvas(editor, new Point(0, 0), new Point(48, 32));
  const bitmap = await createImageBitmap(await page.encode!('png', 90));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const block = redactionBlock({ w: 80, h: 60 }, REDACT_DEFAULT_STRENGTH);
  // Every block under the region is one colour: the yellow rectangle's sharp edge at (10, 10) is gone.
  for (let by = 0; by + block <= 32; by += block) {
    for (let bx = 0; bx + block <= 48; bx += block) {
      const data = context.getImageData(bx, by, block, block).data;
      for (let i = 4; i < data.length; i += 4) {
        expect([...data.slice(i, i + 3)], `block ${bx},${by}`).to.deep.equal([...data.slice(0, 3)]);
      }
    }
  }
  // Outside the region the picture is untouched.
  expect([...context.getImageData(70, 50, 1, 1).data.slice(0, 3)]).to.deep.equal([0x35, 0x44, 0xb1]);
});

it('draws a region from a real drag of the pointer over the canvas', async () => {
  const { editor } = await redacting();
  const stage = editor.stage!;
  const upper = stage.canvas.upperCanvasEl;
  const box = upper.getBoundingClientRect();
  const at = (world: { x: number; y: number }) => {
    const screen = stage.toScreen(world);
    return { clientX: box.left + screen.x, clientY: box.top + screen.y };
  };
  const pointer = (type: string, target: EventTarget, world: { x: number; y: number }) =>
    target.dispatchEvent(
      new PointerEvent(type, { ...at(world), bubbles: true, cancelable: true, composed: true, pointerId: 1, isPrimary: true, button: 0, buttons: 1, pointerType: 'mouse' }),
    );
  pointer('pointerdown', upper, { x: 20, y: 15 });
  pointer('pointermove', upper, { x: 40, y: 30 });
  pointer('pointermove', upper, { x: 60, y: 45 });
  pointer('pointerup', upper, { x: 60, y: 45 });
  await settle(editor);
  expect(editor.state!.regions).to.have.length(1);
  const rect = editor.state!.regions[0].rect;
  expect(rect.x).to.be.closeTo(20, 1);
  expect(rect.y).to.be.closeTo(15, 1);
  expect(rect.w).to.be.closeTo(40, 1);
  expect(rect.h).to.be.closeTo(30, 1);
});
