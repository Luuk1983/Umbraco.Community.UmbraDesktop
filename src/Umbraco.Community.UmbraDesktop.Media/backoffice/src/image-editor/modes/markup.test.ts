import { expect } from '@open-wc/testing';
import { Point } from 'fabric';
import { control, defineFakeFilePage, mountEditor, openFixture, press, settle } from '../image-editor.test-helper.js';
import { markObjectsOf } from '../marks.js';
import en from '../../localization/en.js';

/**
 * Markup: Select, Text, Arrow, Box and Pen; six colours and a line width; each new mark, each move
 * or restyle and each delete is one step; marks stay objects until saved (design §4.1, §4.2).
 */

defineFakeFilePage();

const words = en.umbraDesktopMedia;

/** An editor with the fixture open, in Markup. */
async function marking() {
  const { editor, page } = await mountEditor();
  await openFixture(editor, page!);
  editor.setMode('markup');
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

/**
 * Drag on the canvas as Fabric reports it, in world pixels.
 * @param editor The editor.
 * @param from Where the drag starts.
 * @param to Where it ends.
 */
async function dragOnCanvas(
  editor: Awaited<ReturnType<typeof marking>>['editor'],
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  const canvas = editor.stage!.canvas;
  const event = (type: string) => new PointerEvent(type, { bubbles: true });
  canvas.fire('mouse:down', { e: event('pointerdown'), scenePoint: new Point(from.x, from.y) } as never);
  canvas.fire('mouse:move', { e: event('pointermove'), scenePoint: new Point((from.x + to.x) / 2, (from.y + to.y) / 2) } as never);
  canvas.fire('mouse:move', { e: event('pointermove'), scenePoint: new Point(to.x, to.y) } as never);
  canvas.fire('mouse:up', { e: event('pointerup'), scenePoint: new Point(to.x, to.y) } as never);
  await settle(editor);
}

it('offers the five tools, six colours and a width, all labelled', async () => {
  const { editor } = await marking();
  for (const tool of ['select', 'text', 'arrow', 'box', 'pen']) expect(control(editor, `tool-${tool}`), tool).to.not.equal(null);
  const swatches = editor.shadowRoot!.querySelectorAll('.swatches button');
  expect(swatches).to.have.length(6);
  for (const swatch of swatches) expect(swatch.getAttribute('aria-label')).to.not.equal(null);
  const width = editor.shadowRoot!.querySelector('.panel input[name="width"]') as HTMLInputElement;
  expect(width.labels?.[0]?.textContent).to.contain(words.lineWidth);
});

it('draws a box as one step, in the chosen colour and width', async () => {
  const { editor } = await marking();
  control(editor, 'tool-box').click();
  control(editor, 'colour-green').click();
  await settle(editor);
  await dragOnCanvas(editor, { x: 10, y: 10 }, { x: 50, y: 40 });
  expect(editor.state!.marks).to.have.length(1);
  const box = editor.state!.marks[0];
  expect(box.kind).to.equal('box');
  expect(box.colour).to.equal('#2bc37c');
  expect(box.data).to.deep.equal({ x: 10, y: 10, w: 40, h: 30 });
  expect(steps(editor)).to.equal(1);
  expect(markObjectsOf(editor)).to.have.length(1);
});

it('draws an arrow from where the drag starts to where it ends', async () => {
  const { editor } = await marking();
  control(editor, 'tool-arrow').click();
  await settle(editor);
  await dragOnCanvas(editor, { x: 5, y: 50 }, { x: 70, y: 10 });
  expect(editor.state!.marks[0]).to.deep.include({ kind: 'arrow', data: { from: { x: 5, y: 50 }, to: { x: 70, y: 10 } } });
});

it('draws a freehand line as one step', async () => {
  const { editor } = await marking();
  control(editor, 'tool-pen').click();
  await settle(editor);
  expect(editor.stage!.canvas.isDrawingMode).to.equal(true);
  const { Path } = await import('fabric');
  const path = new Path('M 5 5 L 20 15 L 40 5', { stroke: '#d42054', strokeWidth: 5, fill: '' });
  editor.stage!.canvas.add(path);
  editor.stage!.canvas.fire('path:created', { path } as never);
  await settle(editor);
  expect(editor.state!.marks).to.have.length(1);
  expect(editor.state!.marks[0].kind).to.equal('pen');
  expect(steps(editor)).to.equal(1);
  expect(editor.stage!.canvas.getObjects().includes(path), "Fabric's own path is replaced by the mark's").to.equal(false);
});

it('puts a text mark where it is clicked, as one step', async () => {
  const { editor } = await marking();
  control(editor, 'tool-text').click();
  await settle(editor);
  await dragOnCanvas(editor, { x: 20, y: 20 }, { x: 20, y: 20 });
  expect(editor.state!.marks[0]).to.deep.include({ kind: 'text' });
  expect((editor.state!.marks[0].data as { text: string }).text).to.equal(words.textDefault);
  expect(steps(editor)).to.equal(1);
});

it('moves a selected mark as one step, restyles it as one, and deletes it as one', async () => {
  const { editor } = await marking();
  control(editor, 'tool-box').click();
  await settle(editor);
  await dragOnCanvas(editor, { x: 10, y: 10 }, { x: 50, y: 40 });
  control(editor, 'tool-select').click();
  await settle(editor);
  const object = markObjectsOf(editor)[0];
  editor.stage!.canvas.setActiveObject(object);
  editor.stage!.canvas.fire('selection:created', { selected: [object] } as never);
  await settle(editor);
  expect(control(editor, 'mark-delete').disabled).to.equal(false);

  object.set({ left: object.left + 5 });
  editor.stage!.canvas.fire('object:modified', { target: object } as never);
  await settle(editor);
  expect((editor.state!.marks[0].data as { x: number }).x).to.equal(15);
  expect(steps(editor)).to.equal(2);

  control(editor, 'colour-yellow').click();
  await settle(editor);
  expect(editor.state!.marks[0].colour).to.equal('#f5c142');
  expect(steps(editor)).to.equal(3);

  editor.stage!.canvas.setActiveObject(markObjectsOf(editor)[0]);
  editor.stage!.canvas.fire('selection:created', { selected: [markObjectsOf(editor)[0]] } as never);
  await settle(editor);
  press(editor, 'Delete');
  await settle(editor);
  expect(editor.state!.marks).to.have.length(0);
  expect(steps(editor)).to.equal(4);
});

it('draws Delete and Bring to front disabled with nothing selected', async () => {
  const { editor } = await marking();
  expect(control(editor, 'mark-delete').disabled).to.equal(true);
  expect(control(editor, 'mark-front').disabled).to.equal(true);
});

it('keeps marks in the picture when it is cropped', async () => {
  const { editor } = await marking();
  control(editor, 'tool-box').click();
  await settle(editor);
  await dragOnCanvas(editor, { x: 30, y: 20 }, { x: 50, y: 40 });
  editor.apply({ ...editor.state!, crop: { x: 20, y: 10, w: 50, h: 40 } });
  await settle(editor);
  expect(editor.state!.marks[0].data, 'the document is unchanged').to.deep.equal({ x: 30, y: 20, w: 20, h: 20 });
  const object = markObjectsOf(editor)[0];
  const half = editor.state!.marks[0].width / 2;
  expect({ left: object.left, top: object.top }, 'drawn at its place in the cropped view').to.deep.equal({ left: 10 - half, top: 10 - half });
});

it('keeps marks as objects after a save; only the saved file is flattened', async () => {
  const { editor, page } = await marking();
  control(editor, 'tool-box').click();
  await settle(editor);
  await dragOnCanvas(editor, { x: 10, y: 10 }, { x: 50, y: 40 });
  page.fire('saved', { unique: 'k1', updateDate: 'd2', name: 'Beach', extension: 'png', folder: 'f1', copy: false, bytes: 1 });
  await settle(editor);
  expect(editor.state!.marks).to.have.length(1);
  expect(markObjectsOf(editor)).to.have.length(1);
});

/**
 * Found in a real backoffice: under a theme whose control edges are invisible, the white swatch was
 * white on a white panel, and looked removed. Every swatch draws a ring of its own in the border
 * token, which stays visible on every surface.
 */
it('rings every swatch, so the white one shows on a white panel', async () => {
  const { editor } = await marking();
  editor.style.setProperty('--umbradesktop-app-edge-dark', 'transparent');
  editor.style.setProperty('--umbradesktop-app-border', '#8a8a8a');
  editor.style.setProperty('--umbradesktop-app-surface', '#ffffff');
  editor.style.setProperty('--umbradesktop-app-accent', '#3544b1');
  for (const swatch of editor.shadowRoot!.querySelectorAll<HTMLElement>('.swatches button')) {
    expect(getComputedStyle(swatch).boxShadow, swatch.dataset.command).to.contain('inset');
  }
});
