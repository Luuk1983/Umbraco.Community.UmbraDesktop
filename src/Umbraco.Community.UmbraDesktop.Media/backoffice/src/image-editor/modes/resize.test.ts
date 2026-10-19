import { expect } from '@open-wc/testing';
import { control, defineFakeFileMenu, mountEditor, openFixture, settle } from '../image-editor.test-helper.js';

/**
 * Resize: width and height in pixels or percent, linked by default; the common widths only shrink;
 * enlarging is allowed by typing; Apply size or another mode applies it as one step (design §4.1).
 */

defineFakeFileMenu();

/** An editor with the 80 × 60 fixture open, in Resize. */
async function resizing() {
  const { editor, menu } = await mountEditor();
  await openFixture(editor, menu!);
  editor.setMode('resize');
  await settle(editor);
  return { editor };
}

/** A field of the panel by name. */
const field = (editor: HTMLElement, name: string) =>
  editor.shadowRoot!.querySelector(`.panel input[name="${name}"]`) as HTMLInputElement;

/** Type into a field. */
async function type(editor: Awaited<ReturnType<typeof resizing>>['editor'], name: string, value: string): Promise<void> {
  const input = field(editor, name);
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await settle(editor);
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

it('starts at the picture size, linked, in pixels', async () => {
  const { editor } = await resizing();
  expect(field(editor, 'width').value).to.equal('80');
  expect(field(editor, 'height').value).to.equal('60');
  expect(control(editor, 'link').getAttribute('aria-pressed')).to.equal('true');
  expect(control(editor, 'units-pixels').getAttribute('aria-pressed')).to.equal('true');
  expect(field(editor, 'width').labels?.[0]).to.not.equal(undefined);
});

it('keeps the proportions while linked, and lets go of them when unlinked', async () => {
  const { editor } = await resizing();
  await type(editor, 'width', '40');
  expect(editor.pendingSize).to.deep.equal({ w: 40, h: 30 });
  expect(field(editor, 'height').value).to.equal('30');
  control(editor, 'link').click();
  await settle(editor);
  await type(editor, 'height', '50');
  expect(editor.pendingSize).to.deep.equal({ w: 40, h: 50 });
});

it('works in percent as well as pixels', async () => {
  const { editor } = await resizing();
  control(editor, 'units-percent').click();
  await settle(editor);
  expect(field(editor, 'width').value).to.equal('100');
  await type(editor, 'width', '50');
  expect(editor.pendingSize).to.deep.equal({ w: 40, h: 30 });
  expect(field(editor, 'height').value).to.equal('50');
});

it('offers only the common widths that shrink the picture, and draws the others disabled', async () => {
  const { editor } = await resizing();
  for (const key of ['2560', '1920', '1280', '800']) {
    expect(control(editor, `preset-${key}`), key).to.not.equal(null);
    expect(control(editor, `preset-${key}`).disabled, `${key} enlarges an 80px picture`).to.equal(true);
  }
  expect(control(editor, 'preset-half').disabled).to.equal(false);
  control(editor, 'preset-half').click();
  await settle(editor);
  expect(editor.pendingSize).to.deep.equal({ w: 40, h: 30 });
});

it('enlarges when a bigger size is typed', async () => {
  const { editor } = await resizing();
  await type(editor, 'width', '160');
  expect(editor.pendingSize).to.deep.equal({ w: 160, h: 120 });
});

it('applies the size as one step, from Apply size and on leaving the mode', async () => {
  const { editor } = await resizing();
  await type(editor, 'width', '40');
  expect(steps(editor), 'pending, not a step').to.equal(0);
  control(editor, 'resize-apply').click();
  await settle(editor);
  expect(editor.state!.size).to.deep.equal({ w: 40, h: 30 });
  expect(editor.pendingSize).to.equal(null);
  expect(steps(editor)).to.equal(1);

  await type(editor, 'width', '20');
  editor.setMode('crop');
  await settle(editor);
  expect(editor.state!.size).to.deep.equal({ w: 20, h: 15 });
  expect(steps(editor)).to.equal(2);
});

it('throws a pending size away with Reset', async () => {
  const { editor } = await resizing();
  await type(editor, 'width', '40');
  control(editor, 'resize-reset').click();
  await settle(editor);
  expect(editor.pendingSize).to.equal(null);
  expect(field(editor, 'width').value).to.equal('80');
  expect(steps(editor)).to.equal(0);
});

it('shows before and after in the status bar while a size is pending', async () => {
  const { editor } = await resizing();
  await type(editor, 'width', '40');
  expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain('80 × 60 → 40 × 30 px');
});

it('applies a typed size with Enter in the field', async () => {
  const { editor } = await resizing();
  await type(editor, 'width', '40');
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true, cancelable: true });
  field(editor, 'width').dispatchEvent(event);
  await settle(editor);
  expect(editor.state!.size).to.deep.equal({ w: 40, h: 30 });
});
