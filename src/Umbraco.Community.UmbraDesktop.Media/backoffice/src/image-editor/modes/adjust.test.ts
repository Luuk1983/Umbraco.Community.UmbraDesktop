import { expect } from '@open-wc/testing';
import { control, defineFakeFilePage, mountEditor, openFixture, settle } from '../image-editor.test-helper.js';
import en from '../../localization/en.js';

/**
 * Adjust: exposure, brightness, contrast and saturation, each zero in the middle, with a live
 * preview; one drag is one undo step; Hold to compare and Split view (design §4.1, §4.2).
 */

defineFakeFilePage();

const words = en.umbraDesktopMedia;

/** The four sliders, in panel order. */
const SLIDERS = ['exposure', 'brightness', 'contrast', 'saturation'] as const;

/** An editor with the fixture open, in Adjust. */
async function adjusting() {
  const { editor, page } = await mountEditor();
  await openFixture(editor, page!);
  editor.setMode('adjust');
  await settle(editor);
  return { editor };
}

/** A slider by its adjustment's name. */
const slider = (editor: HTMLElement, name: string) =>
  editor.shadowRoot!.querySelector(`.panel input[name="${name}"]`) as HTMLInputElement;

/** Move a slider as a drag does: input events while it moves, one change when it is let go. */
async function drag(editor: HTMLElement, name: string, values: number[]): Promise<void> {
  const input = slider(editor, name);
  for (const value of values) {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
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

it('has four labelled sliders from -100 to 100, at 0 to start', async () => {
  const { editor } = await adjusting();
  for (const name of SLIDERS) {
    const input = slider(editor, name);
    expect(input.min, name).to.equal('-100');
    expect(input.max, name).to.equal('100');
    expect(input.value, name).to.equal('0');
    expect(input.labels?.[0]?.textContent, name).to.contain(words[name]);
  }
});

it('previews a drag without a step, and commits one step when it is let go', async () => {
  const { editor } = await adjusting();
  const input = slider(editor, 'exposure');
  for (const value of [10, 20, 30, 40]) {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  await settle(editor);
  expect(editor.state!.adjust.exposure, 'previewed').to.equal(40);
  expect(steps(editor), 'not a step yet').to.equal(0);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle(editor);
  expect(steps(editor)).to.equal(1);
  editor.undo();
  expect(editor.state!.adjust.exposure).to.equal(0);
});

it('puts a slider back to 0 with a double-click, as one step', async () => {
  const { editor } = await adjusting();
  await drag(editor, 'contrast', [25, 50]);
  await settle(editor);
  slider(editor, 'contrast').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  await settle(editor);
  expect(editor.state!.adjust.contrast).to.equal(0);
  expect(steps(editor)).to.equal(2);
  expect(slider(editor, 'contrast').value).to.equal('0');
});

it('moves a slider with the arrow keys, a step per change', async () => {
  const { editor } = await adjusting();
  const input = slider(editor, 'saturation');
  input.focus();
  input.stepUp();
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle(editor);
  expect(editor.state!.adjust.saturation).to.equal(1);
  expect(steps(editor)).to.equal(1);
});

it('shows the original while Hold to compare is held, and adds no step', async () => {
  const { editor } = await adjusting();
  await drag(editor, 'brightness', [60]);
  await settle(editor);
  const hold = control(editor, 'hold-compare');
  hold.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  expect(editor.stage!.compare).to.equal('original');
  hold.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  expect(editor.stage!.compare).to.equal('none');
  hold.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  expect(editor.stage!.compare, 'held from the keyboard').to.equal('original');
  hold.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
  expect(editor.stage!.compare).to.equal('none');
  expect(steps(editor)).to.equal(1);
});

it('splits the picture, with a line that drags and moves with the keys', async () => {
  const { editor } = await adjusting();
  control(editor, 'split-view').click();
  await settle(editor);
  expect(control(editor, 'split-view').getAttribute('aria-pressed')).to.equal('true');
  expect(editor.stage!.compare).to.equal('split');
  const line = editor.shadowRoot!.querySelector('.split-line') as HTMLElement;
  expect(line).to.not.equal(null);
  expect(line.getAttribute('role')).to.equal('slider');
  expect(line.getAttribute('aria-valuenow')).to.equal('50');
  line.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  await settle(editor);
  expect(Number(editor.shadowRoot!.querySelector('.split-line')!.getAttribute('aria-valuenow'))).to.be.greaterThan(50);
  control(editor, 'split-view').click();
  await settle(editor);
  expect(editor.stage!.compare).to.equal('none');
  expect(editor.shadowRoot!.querySelector('.split-line')).to.equal(null);
});

it('shows what each slider is set to', async () => {
  const { editor } = await adjusting();
  await drag(editor, 'exposure', [80]);
  await drag(editor, 'saturation', [-8]);
  await settle(editor);
  const panel = editor.shadowRoot!.querySelector('.panel')!.textContent!;
  expect(panel).to.contain('+0.8');
  expect(panel).to.contain('−8');
});
