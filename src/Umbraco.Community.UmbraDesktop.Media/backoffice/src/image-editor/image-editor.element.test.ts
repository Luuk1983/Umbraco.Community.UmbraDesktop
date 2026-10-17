import { expect } from '@open-wc/testing';
import { control, defineFakeFilePage, mountEditor, openFixture, opened, press, settle } from './image-editor.test-helper.js';
import { rotate } from './geometry.js';
import en from '../localization/en.js';

/**
 * The Image Editor's shell: the mode bar, the canvas and panel, the status bar, and the File page it
 * hands opening and saving to. Design §4 and §5; plan Task 15.
 */

defineFakeFilePage();

const words = en.umbraDesktopMedia;

/** The mode bar's controls, in the order the design puts them. */
const BAR = ['file', 'undo', 'redo', 'mode-crop', 'mode-adjust', 'mode-markup', 'mode-redact', 'mode-resize', 'save'];

describe('with nothing open', () => {
  it('starts on the File page, on Open', async () => {
    const { page } = await mountEditor();
    expect(page!.open).to.equal(true);
    expect(page!.shown[0].page).to.equal('open');
  });

  it('draws the modes, undo, redo and Save, disabled', async () => {
    const { editor } = await mountEditor();
    for (const command of BAR.slice(1)) {
      expect(control(editor, command), command).to.not.equal(null);
      expect(control(editor, command).disabled, command).to.equal(true);
    }
    expect(control(editor, 'file').disabled).to.equal(false);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain(words.noImage);
  });

  it('draws every mode bar control inside the bar, File first at its left', async () => {
    const { editor } = await mountEditor();
    const bar = editor.shadowRoot!.querySelector('.bar')!.getBoundingClientRect();
    for (const command of BAR) {
      const rect = control(editor, command).getBoundingClientRect();
      expect(rect.top, command).to.be.at.least(bar.top);
      expect(rect.bottom, command).to.be.at.most(bar.bottom);
      expect(rect.width, command).to.be.below(bar.width / 2);
    }
    expect(control(editor, 'file').getBoundingClientRect().left).to.be.below(control(editor, 'undo').getBoundingClientRect().left);
  });

  it('orders the mode bar File, undo, redo, the five modes, Save', async () => {
    const { editor } = await mountEditor();
    const order = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.bar [data-command]')].map((node) => node.dataset.command);
    expect(order).to.deep.equal(BAR);
  });
});

describe('opening', () => {
  it('opens a picture: everything enabled, titled, the File page hidden, the facts in the status bar', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    for (const command of ['mode-crop', 'mode-adjust', 'mode-markup', 'mode-redact', 'mode-resize']) {
      expect(control(editor, command).disabled, command).to.equal(false);
    }
    expect(editor.getAttribute('data-umbradesktop-title')).to.equal('Beach');
    expect(page!.open).to.equal(false);
    const status = editor.shadowRoot!.querySelector('.status')!;
    expect((status.querySelector('input[name="name"]') as HTMLInputElement).value).to.equal('Beach');
    expect(status.textContent).to.contain('Holidays');
    expect(status.textContent).to.contain('80 × 60 px');
    expect(status.textContent).to.contain('PNG');
    expect(page!.document).to.include({ unique: 'k1', name: 'Beach', extension: 'png', width: 80, height: 60 });
  });

  it('refuses an SVG with a reason, and changes nothing', async () => {
    const { editor, page } = await mountEditor();
    page!.fire('open', await opened('picture.png', { extension: 'svg', name: 'Logo' }));
    await settle(editor);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain(words.refusedSvg.replace('%0%', 'Logo'));
    expect(control(editor, 'mode-crop').disabled).to.equal(true);
    expect(editor.hasAttribute('data-umbradesktop-title')).to.equal(false);
  });

  it('opens an animated GIF with a notice that saving keeps the first frame', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!, 'two-frames.gif');
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain(words.animatedGif);
  });

  it('says why when the file cannot be read', async () => {
    const { editor, page } = await mountEditor();
    page!.fire('failed', { message: 'Beach could not be opened.' });
    await settle(editor);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain('Beach could not be opened.');
  });
});

describe('saving', () => {
  it('saves from the button and from Ctrl+S through the File page', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    control(editor, 'save').click();
    await settle(editor);
    expect(page!.saves).to.equal(1);
    const event = press(editor, 's', { ctrl: true });
    await settle(editor);
    expect(page!.saves).to.equal(2);
    expect(event.defaultPrevented, "the browser's own Save page is not opened").to.equal(true);
  });

  it('shows Save as on PNG for a GIF', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!, 'one-frame.gif');
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    control(editor, 'save').click();
    await settle(editor);
    expect(page!.open).to.equal(true);
    expect(page!.shown[page!.shown.length - 1]).to.deep.equal({ page: 'saveAs', format: 'png' });
  });

  it('marks itself unsaved on a change, clean on a save, and unsaved again on undo past it', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
    expect(page!.dirty).to.equal(true);
    page!.fire('saved', { unique: 'k1', updateDate: 'd2', name: 'Beach', extension: 'png', folder: 'f1', folderName: 'Holidays', copy: false, bytes: 300 });
    await settle(editor);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
    expect(page!.document?.updateDate).to.equal('d2');
    expect(page!.document?.bytes).to.equal(300);
    control(editor, 'undo').click();
    await settle(editor);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
  });

  it('moves onto a saved copy, so the next save writes to the copy', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    page!.fire('saved', { unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'webp', folder: 'f9', folderName: 'Other', copy: true, bytes: 90 });
    await settle(editor);
    expect(page!.document).to.include({ unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'webp', folder: 'f9' });
    expect(editor.getAttribute('data-umbradesktop-title')).to.equal('Beach (copy)');
  });

  it('tells the File page to reset the focal point after a turn, not after a resize', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.apply({ ...editor.state!, size: { w: 40, h: 30 } });
    await settle(editor);
    expect(page!.resetFocalPoint).to.equal(false);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    expect(page!.resetFocalPoint).to.equal(true);
  });

  it('hands the File page an encoder that writes the picture as saved', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.apply(rotate(editor.state!, 'right'));
    const blob = await page!.encode!('png', 90);
    const bitmap = await createImageBitmap(blob);
    expect({ w: bitmap.width, h: bitmap.height }).to.deep.equal({ w: 60, h: 80 });
  });
});

describe('keys', () => {
  it('opens File on Open and on Save as', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    press(editor, 'o', { ctrl: true });
    expect(page!.shown[page!.shown.length - 1].page).to.equal('open');
    page!.hide();
    press(editor, 'S', { ctrl: true, shift: true });
    expect(page!.shown[page!.shown.length - 1].page).to.equal('saveAs');
  });

  it('undoes and redoes', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.apply(rotate(editor.state!, 'right'));
    press(editor, 'z', { ctrl: true });
    expect(editor.state!.rotation).to.equal(0);
    press(editor, 'y', { ctrl: true });
    expect(editor.state!.rotation).to.equal(90);
  });

  it('zooms: Ctrl+0 fits, Ctrl+1 is 100%, Ctrl+plus and Ctrl+minus step', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    press(editor, '1', { ctrl: true });
    await settle(editor);
    expect(editor.zoom).to.equal(1);
    press(editor, '=', { ctrl: true });
    await settle(editor);
    expect(editor.zoom).to.be.greaterThan(1);
    press(editor, '-', { ctrl: true });
    press(editor, '-', { ctrl: true });
    await settle(editor);
    expect(editor.zoom).to.be.lessThan(1);
    press(editor, '0', { ctrl: true });
    await settle(editor);
    expect(editor.zoom, 'an 80 × 60 picture fits at 100%').to.equal(1);
    expect(control(editor, 'zoom-value').textContent?.trim()).to.equal('100%');
  });

  it('leaves keys to a text field, except Ctrl+S', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    const name = editor.shadowRoot!.querySelector('input[name="name"]') as HTMLInputElement;
    press(editor, 'z', { ctrl: true }, name);
    expect(editor.state!.rotation, "the field's own undo").to.equal(90);
    press(editor, 's', { ctrl: true }, name);
    await settle(editor);
    expect(page!.saves).to.equal(1);
  });
});

describe('the status bar', () => {
  it('renames the item in the name field', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    const name = editor.shadowRoot!.querySelector('input[name="name"]') as HTMLInputElement;
    name.value = 'Sunset';
    name.dispatchEvent(new Event('input'));
    await settle(editor);
    expect(page!.document?.name).to.equal('Sunset');
    expect(editor.getAttribute('data-umbradesktop-title')).to.equal('Sunset');
    expect(editor.hasAttribute('data-umbradesktop-dirty'), 'a rename is saved like any change').to.equal(true);
  });

  it('shows the size before and after while a resize is pending', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.pendingSize = { w: 40, h: 30 };
    await settle(editor);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain('80 × 60 → 40 × 30 px');
  });
});

it('closes its window from the File page', async () => {
  const { editor, page } = await mountEditor();
  let asked = 0;
  editor.addEventListener('umbradesktop-close-request', () => asked++);
  page!.fire('close');
  expect(asked).to.equal(1);
});

describe('keys, from the review', () => {
  it('never overwrites the original from Ctrl+S while Save as is showing', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.apply(rotate(editor.state!, 'right'));
    editor.showFile('saveAs');
    await settle(editor);
    const event = press(editor, 's', { ctrl: true });
    await settle(editor);
    expect(page!.saves, "the page's own button decides what Save as writes").to.equal(0);
    expect(event.defaultPrevented, "and the browser's own Save page does not open").to.equal(true);
  });

  it('leaves Enter and Space to the button they land on', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.setMode('crop');
    await settle(editor);
    const ratio = control(editor, 'ratio-1:1');
    const enter = press(editor, 'Enter', {}, ratio);
    const space = press(editor, ' ', {}, ratio);
    expect(enter.defaultPrevented, 'Enter presses the button').to.equal(false);
    expect(space.defaultPrevented, 'Space presses the button').to.equal(false);
    expect(editor.stage!.panning).to.equal(false);
  });

  it('keeps undo on Ctrl+Z after a slider was used', async () => {
    const { editor, page } = await mountEditor();
    await openFixture(editor, page!);
    editor.setMode('adjust');
    await settle(editor);
    const slider = editor.shadowRoot!.querySelector('.panel input[name="exposure"]') as HTMLInputElement;
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await settle(editor);
    press(editor, 'z', { ctrl: true }, slider);
    expect(editor.state!.adjust.exposure).to.equal(0);
  });
});
