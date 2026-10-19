import { expect } from '@open-wc/testing';
import { control, defineFakeFileMenu, mountEditor, openFixture, press, settle } from '../image-editor.test-helper.js';
import { cropFrameOf } from './crop.js';
import en from '../../localization/en.js';

/**
 * Crop: a frame with rule-of-thirds lines and eight handles, its size in real pixels under it, the
 * ratios, rotate and flip, and the focal point drawn with the line about its reset (design §4.1).
 */

defineFakeFileMenu();

const words = en.umbraDesktopMedia;

/** An editor with the 80 × 60 fixture open, in Crop. */
async function cropping() {
  const { editor, menu } = await mountEditor();
  await openFixture(editor, menu!);
  editor.setMode('crop');
  await settle(editor);
  return { editor, menu: menu! };
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

  // 3:2, not 4:3: on this 4:3 picture a 4:3 frame is the whole picture now, which is no crop at all.
  control(editor, 'ratio-3:2').click();
  await settle(editor);
  editor.setMode('adjust');
  await settle(editor);
  expect(steps(editor)).to.equal(3);
  expect(Math.abs(editor.state!.crop!.w / editor.state!.crop!.h - 3 / 2)).to.be.below(0.05);
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
  const { editor, menu } = await mountEditor();
  await openFixture(editor, menu!, 'picture.png', { focalPoint: null });
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

/**
 * The owner, in a real backoffice: switching 4:3 between portrait and landscape made the frame
 * smaller each time (712, 401, 301, 226, 170, 128, 96 px wide), because each change fitted the new
 * shape inside the frame as it was. A ratio or a way round now gives the largest frame of that shape
 * the picture holds, centred, however often it is switched.
 */
it('gives a ratio the largest frame the picture holds, however often it is turned', async () => {
  const { editor } = await cropping();
  control(editor, 'ratio-4:3').click();
  await settle(editor);
  const landscape = { ...editor.cropDraft! };
  expect(landscape).to.deep.equal({ x: 0, y: 0, w: 80, h: 60 });
  for (let i = 0; i < 3; i++) {
    control(editor, 'orientation-portrait').click();
    await settle(editor);
    expect(editor.cropDraft, `portrait ${i}`).to.deep.equal({ x: 18, y: 0, w: 45, h: 60 });
    control(editor, 'orientation-landscape').click();
    await settle(editor);
    expect(editor.cropDraft, `landscape ${i}`).to.deep.equal(landscape);
  }
  control(editor, 'ratio-16:9').click();
  await settle(editor);
  expect(editor.cropDraft, '16:9, centred').to.deep.equal({ x: 0, y: 8, w: 80, h: 45 });
});

/**
 * The owner, in a real backoffice: Apply crop and Reset seemed to do nothing. Apply did crop, but
 * Crop always showed the whole picture with the frame over it, so nothing changed on screen; and
 * Reset only went back to the crop applied, which was the frame already. Decided 2026-10-18: Crop
 * shows the picture as it is, so Apply cuts it on screen and a further crop cuts further in, and Reset
 * brings the whole picture back.
 */
describe('Apply crop and Reset show what they do', () => {
  /** Apply a square crop: the middle 60 × 60 of the 80 × 60 picture. */
  async function squared() {
    const crop = await cropping();
    control(crop.editor, 'ratio-1:1').click();
    await settle(crop.editor);
    control(crop.editor, 'crop-apply').click();
    await settle(crop.editor);
    return crop;
  }

  it('shows only the cropped picture once applied, with the frame round all of it', async () => {
    const { editor } = await squared();
    expect(editor.state!.crop).to.deep.equal({ x: 10, y: 0, w: 60, h: 60 });
    expect(editor.stage!.world, 'the canvas holds the cropped picture').to.deep.equal({ w: 60, h: 60 });
    expect(editor.cropDraft).to.deep.equal({ x: 10, y: 0, w: 60, h: 60 });
    const frame = cropFrameOf(editor)!;
    expect({ x: frame.left, y: frame.top, w: frame.width, h: frame.height }, 'the frame in the canvas').to.deep.equal({ x: 0, y: 0, w: 60, h: 60 });
  });

  it('crops further in from a cropped picture', async () => {
    const { editor } = await squared();
    control(editor, 'ratio-16:9').click();
    await settle(editor);
    expect(editor.cropDraft, 'the largest 16:9 in the square').to.deep.equal({ x: 10, y: 13, w: 60, h: 34 });
    expect(cropFrameOf(editor)!.top, 'in the canvas').to.equal(13);
    control(editor, 'crop-apply').click();
    await settle(editor);
    expect(editor.state!.crop).to.deep.equal({ x: 10, y: 13, w: 60, h: 34 });
    expect(editor.stage!.world).to.deep.equal({ w: 60, h: 34 });
  });

  it('brings the whole picture back with Reset, as one step that Undo takes back', async () => {
    const { editor } = await squared();
    expect(steps(editor)).to.equal(1);
    control(editor, 'crop-reset').click();
    await settle(editor);
    expect(editor.state!.crop).to.equal(null);
    expect(steps(editor)).to.equal(2);
    expect(editor.stage!.world).to.deep.equal({ w: 80, h: 60 });
    expect(editor.cropDraft).to.deep.equal({ x: 0, y: 0, w: 80, h: 60 });
    editor.undo();
    await settle(editor);
    expect(editor.state!.crop).to.deep.equal({ x: 10, y: 0, w: 60, h: 60 });
  });

  it('throws a frame away with Escape, back to the cropped picture, adding no step', async () => {
    const { editor } = await squared();
    control(editor, 'ratio-16:9').click();
    await settle(editor);
    press(editor, 'Escape');
    await settle(editor);
    expect(editor.cropDraft).to.deep.equal({ x: 10, y: 0, w: 60, h: 60 });
    expect(steps(editor)).to.equal(1);
  });

  it('draws the focal point where it falls on the cropped picture', async () => {
    const { editor } = await squared();
    const focal = editor.shadowRoot!.querySelector('.focal') as HTMLElement;
    // The fixture's focal point is at (20, 30) on the picture: (10, 30) once 10 px are cut off the left.
    const screen = editor.stage!.toScreen({ x: 10, y: 30 });
    expect(parseFloat(focal.style.left)).to.be.closeTo(screen.x, 1);
    expect(parseFloat(focal.style.top)).to.be.closeTo(screen.y, 1);
  });
});
