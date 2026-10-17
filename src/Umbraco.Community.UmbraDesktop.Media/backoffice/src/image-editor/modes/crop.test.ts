import { expect } from '@open-wc/testing';
import { control, defineFakeFilePage, mountEditor, openFixture, press, settle } from '../image-editor.test-helper.js';
import { cropFrameOf } from './crop.js';
import en from '../../localization/en.js';

/**
 * Crop: a frame with rule-of-thirds lines and eight handles, its size in real pixels under it, the
 * ratios, rotate and flip, and the focal point drawn with the line about its reset (design §4.1).
 */

defineFakeFilePage();

const words = en.umbraDesktopMedia;

/** An editor with the 80 × 60 fixture open, in Crop. */
async function cropping() {
  const { editor, page } = await mountEditor();
  await openFixture(editor, page!);
  editor.setMode('crop');
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

it('starts with the frame round the whole picture, with eight handles and no turn handle', async () => {
  const { editor } = await cropping();
  expect(editor.cropDraft).to.deep.equal({ x: 0, y: 0, w: 80, h: 60 });
  const frame = cropFrameOf(editor)!;
  expect(frame).to.not.equal(undefined);
  const visible = Object.entries(frame.controls).filter(([name]) => frame.isControlVisible(name)).map(([name]) => name);
  expect(visible.sort()).to.deep.equal(['bl', 'br', 'mb', 'ml', 'mr', 'mt', 'tl', 'tr']);
});

it('holds the frame to each ratio, either way round', async () => {
  const { editor } = await cropping();
  for (const [ratio, value] of [
    ['1:1', 1],
    ['4:3', 4 / 3],
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
    ['original', 80 / 60],
  ] as const) {
    control(editor, `ratio-${ratio}`).click();
    await settle(editor);
    const draft = editor.cropDraft!;
    expect(Math.abs(draft.w / draft.h - value), ratio).to.be.below(0.05);
    expect(control(editor, `ratio-${ratio}`).getAttribute('aria-pressed')).to.equal('true');
  }
  control(editor, 'orientation-portrait').click();
  await settle(editor);
  expect(editor.cropDraft!.h).to.be.greaterThan(editor.cropDraft!.w);
  control(editor, 'ratio-free').click();
  await settle(editor);
  expect(control(editor, 'ratio-free').getAttribute('aria-pressed')).to.equal('true');
});

it('keeps a dragged frame inside the picture and at its ratio', async () => {
  const { editor } = await cropping();
  control(editor, 'ratio-1:1').click();
  await settle(editor);
  const frame = cropFrameOf(editor)!;
  frame.set({ left: 50, top: 30, scaleX: 1, scaleY: 1, width: 70, height: 20 });
  frame.canvas!.fire('object:modified', { target: frame } as never);
  await settle(editor);
  const draft = editor.cropDraft!;
  expect(draft.w).to.equal(draft.h);
  expect(draft.x + draft.w).to.be.at.most(80);
  expect(draft.y + draft.h).to.be.at.most(60);
});

it('shows the frame size in real pixels under it', async () => {
  const { editor } = await cropping();
  control(editor, 'ratio-1:1').click();
  await settle(editor);
  const label = editor.shadowRoot!.querySelector('.crop-size')!;
  expect(label.textContent?.trim()).to.equal(`${editor.cropDraft!.w} × ${editor.cropDraft!.h} px`);
});

it('turns and flips at once, one step each', async () => {
  const { editor } = await cropping();
  control(editor, 'rotate-right').click();
  await settle(editor);
  expect(editor.state!.rotation).to.equal(90);
  expect(editor.cropDraft, 'the frame turns with the picture').to.deep.equal({ x: 0, y: 0, w: 60, h: 80 });
  control(editor, 'rotate-left').click();
  control(editor, 'flip-h').click();
  control(editor, 'flip-v').click();
  await settle(editor);
  expect(editor.state!.flipH).to.equal(true);
  expect(editor.state!.flipV).to.equal(true);
  expect(steps(editor)).to.equal(4);
});

it('applies the frame as one step from Apply crop, from Enter, and on leaving the mode', async () => {
  const { editor } = await cropping();
  control(editor, 'ratio-1:1').click();
  await settle(editor);
  expect(steps(editor), 'a frame is not a step until applied').to.equal(0);
  control(editor, 'crop-apply').click();
  await settle(editor);
  expect(editor.state!.crop).to.deep.equal(editor.cropDraft);
  expect(steps(editor)).to.equal(1);

  control(editor, 'ratio-16:9').click();
  await settle(editor);
  press(editor, 'Enter');
  await settle(editor);
  expect(steps(editor)).to.equal(2);

  control(editor, 'ratio-4:3').click();
  await settle(editor);
  editor.setMode('adjust');
  await settle(editor);
  expect(steps(editor)).to.equal(3);
  expect(Math.abs(editor.state!.crop!.w / editor.state!.crop!.h - 4 / 3)).to.be.below(0.05);
});

it('throws the frame away with Escape and with Reset, adding no step', async () => {
  const { editor } = await cropping();
  control(editor, 'ratio-1:1').click();
  await settle(editor);
  press(editor, 'Escape');
  await settle(editor);
  expect(editor.cropDraft).to.deep.equal({ x: 0, y: 0, w: 80, h: 60 });
  control(editor, 'ratio-1:1').click();
  await settle(editor);
  control(editor, 'crop-reset').click();
  await settle(editor);
  expect(editor.cropDraft).to.deep.equal({ x: 0, y: 0, w: 80, h: 60 });
  expect(steps(editor)).to.equal(0);
});

it('draws the focal point where the item has it, and says a crop resets it', async () => {
  const { editor } = await cropping();
  const focal = editor.shadowRoot!.querySelector('.focal') as HTMLElement;
  expect(focal).to.not.equal(null);
  const screen = editor.stage!.toScreen({ x: 0.25 * 80, y: 0.5 * 60 });
  expect(parseFloat(focal.style.left)).to.be.closeTo(screen.x, 1);
  expect(parseFloat(focal.style.top)).to.be.closeTo(screen.y, 1);
  expect(editor.shadowRoot!.querySelector('.panel')!.textContent).to.contain(words.focalNote);
});

it('draws no focal point for an item without one', async () => {
  const { editor, page } = await mountEditor();
  await openFixture(editor, page!, 'picture.png', { focalPoint: null });
  editor.setMode('crop');
  await settle(editor);
  expect(editor.shadowRoot!.querySelector('.focal')).to.equal(null);
});

it('gives every control a name and a place in the tab order', async () => {
  const { editor } = await cropping();
  const buttons = [...editor.shadowRoot!.querySelectorAll<HTMLButtonElement>('.panel button')];
  expect(buttons.length).to.be.at.least(14);
  for (const button of buttons) {
    expect(button.tabIndex, button.dataset.command).to.equal(0);
    expect((button.getAttribute('aria-label') ?? button.textContent ?? '').trim(), button.dataset.command).to.not.equal('');
  }
});

it('keeps the frame size on the canvas when the frame runs past its edge', async () => {
  const { editor } = await cropping();
  editor.setZoom(8);
  editor.stage!.panBy(0, 200);
  await settle(editor);
  const canvas = editor.shadowRoot!.querySelector('.canvas')!.getBoundingClientRect();
  const label = editor.shadowRoot!.querySelector('.crop-size')!.getBoundingClientRect();
  expect(label.bottom).to.be.at.most(canvas.bottom);
  expect(label.top).to.be.at.least(canvas.top);
  expect(label.left).to.be.at.least(canvas.left);
  expect(label.right).to.be.at.most(canvas.right);
});

/** Found in a real backoffice: the picture outside the frame was drawn as bright as inside it. */
it('shades the picture outside the frame', async () => {
  const { editor } = await cropping();
  const stage = editor.stage!;
  const sample = () => {
    stage.canvas.renderAll();
    // Clear of the frame's handles, which sit on its corners and the middles of its sides.
    const point = stage.toScreen({ x: 25, y: 4 });
    const ratio = stage.canvas.getRetinaScaling();
    const context = stage.canvas.getContext();
    return [...context.getImageData(Math.round(point.x * ratio), Math.round(point.y * ratio), 1, 1).data];
  };
  const open = sample();
  control(editor, 'ratio-16:9').click();
  await settle(editor);
  const shaded = sample();
  expect(shaded[0] + shaded[1] + shaded[2], `${open} → ${shaded}`).to.be.lessThan((open[0] + open[1] + open[2]) * 0.8);
});
