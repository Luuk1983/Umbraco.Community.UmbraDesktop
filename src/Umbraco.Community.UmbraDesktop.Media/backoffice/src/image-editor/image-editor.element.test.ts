import { expect } from '@open-wc/testing';
import { control, defineFakeFileMenu, mountEditor, openFixture, opened, press, settle } from './image-editor.test-helper.js';
import type { FakeOpenView } from './image-editor.test-helper.js';
import { ACCEPT, HOVER_WASH } from './constants.js';
import { rotate } from './geometry.js';
import en from '../localization/en.js';

/**
 * The Image Editor's shell: the mode bar, the canvas and panel, the status bar, and the file menu and
 * open view it hands opening and saving to. Design §4, §5 and §14.
 */

defineFakeFileMenu();

const words = en.umbraDesktopMedia;

/** The mode bar's controls, in the order the design puts them (D11): no File, Save and "..." last. */
const BAR = ['undo', 'redo', 'mode-crop', 'mode-adjust', 'mode-markup', 'mode-redact', 'mode-resize', 'save', 'more'];

/** The open view on the canvas, or null. */
const openView = (editor: HTMLElement) => editor.shadowRoot!.querySelector('umbradesktop-media-open-view') as FakeOpenView | null;

/**
 * Every title each editor gave its window through the desktop's `umbradesktop-app-title`, in order.
 * Heard at the document rather than on the editor, because an editor speaks in its first update,
 * before a test could listen on it; and only an event that bubbles out composed is heard there, which
 * is what the window needs too.
 */
const titlesSent = new WeakMap<EventTarget, unknown[]>();
document.addEventListener('umbradesktop-app-title', (event) => {
  const from = event.composedPath()[0];
  titlesSent.set(from, [...(titlesSent.get(from) ?? []), (event as CustomEvent<{ title?: unknown }>).detail?.title]);
});

/** The last title an editor gave its window, or undefined when it never gave one. */
const title = (editor: HTMLElement) => titlesSent.get(editor)?.slice(-1)[0];

describe('with nothing open', () => {
  /**
   * The desktop saves a window's title with the layout and shows it again on a reopened window, and
   * an editor that reopens with no image to open starts empty: so it gives the window its own name
   * back as it starts, rather than leave the last session's file name over an empty canvas.
   */
  it("gives the window the app's own name as it starts, with an empty title", async () => {
    const { editor } = await mountEditor();
    expect(titlesSent.get(editor)).to.deep.equal(['']);
  });

  it('shows Open on the empty canvas, and no menu (D14)', async () => {
    const { editor, menu } = await mountEditor();
    const view = openView(editor);
    expect(view, 'the open view').to.not.equal(null);
    expect(editor.shadowRoot!.querySelector('.canvas')!.contains(view)).to.equal(true);
    expect(view!.heading).to.equal(words.openAnImage);
    expect(view!.accept).to.deep.equal([...ACCEPT]);
    expect(menu!.open).to.equal(false);
  });

  it('draws the modes, undo, redo and Save, disabled, and leaves "..." for Open and Close', async () => {
    const { editor } = await mountEditor();
    for (const command of BAR.slice(0, -1)) {
      expect(control(editor, command), command).to.not.equal(null);
      expect(control(editor, command).disabled, command).to.equal(true);
    }
    expect(control(editor, 'more').disabled).to.equal(false);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain(words.noImage);
  });

  it('draws every mode bar control inside the bar, Save and "..." together at its right', async () => {
    const { editor } = await mountEditor();
    const bar = editor.shadowRoot!.querySelector('.bar')!.getBoundingClientRect();
    for (const command of BAR) {
      const rect = control(editor, command).getBoundingClientRect();
      expect(rect.top, command).to.be.at.least(bar.top);
      expect(rect.bottom, command).to.be.at.most(bar.bottom);
      expect(rect.width, command).to.be.below(bar.width / 2);
    }
    const save = control(editor, 'save').getBoundingClientRect();
    const more = control(editor, 'more').getBoundingClientRect();
    expect(more.left, '"..." right of Save').to.be.at.least(save.right);
    expect(more.left - save.right, 'beside it').to.be.below(16);
    expect(bar.right - more.right, 'in the corner').to.be.below(16);
    expect(control(editor, 'mode-resize').getBoundingClientRect().right).to.be.below(save.left);
  });

  it('orders the mode bar undo, redo, the five modes, Save, "..."', async () => {
    const { editor } = await mountEditor();
    const order = [...editor.shadowRoot!.querySelectorAll<HTMLElement>('.bar [data-command]')].map((node) => node.dataset.command);
    expect(order).to.deep.equal(BAR);
  });

  it('names "..." for a screen reader and says it opens a dialog', async () => {
    const { editor } = await mountEditor();
    const more = control(editor, 'more');
    expect(more.getAttribute('aria-label')).to.equal(words.more);
    expect(more.getAttribute('aria-haspopup')).to.equal('dialog');
    expect(more.getAttribute('aria-expanded')).to.equal('false');
  });
});

describe('the file menu', () => {
  it("opens from \"...\" on the menu, titled with the editor's name", async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    control(editor, 'more').click();
    await settle(editor);
    expect(menu!.open).to.equal(true);
    expect(menu!.shown[menu!.shown.length - 1].panel).to.equal('menu');
    expect(menu!.label).to.equal(words.imageEditor);
    expect(control(editor, 'more').getAttribute('aria-expanded')).to.equal('true');
  });

  it('gives the mode back when the menu goes away', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.setMode('resize');
    await settle(editor);
    editor.pendingSize = { w: 40, h: 30 };
    control(editor, 'more').click();
    await settle(editor);
    expect(editor.state!.size, 'what the mode had pending is applied first').to.deep.equal({ w: 40, h: 30 });
    expect(editor.menuOpen).to.equal(true);
    menu!.hide();
    await settle(editor);
    expect(editor.menuOpen).to.equal(false);
    expect(control(editor, 'more').getAttribute('aria-expanded')).to.equal('false');
    expect(editor.mode).to.equal('resize');
  });
});

describe('opening', () => {
  it('opens a picture: everything enabled, titled, Open gone from the canvas, the facts in the status bar', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    for (const command of ['mode-crop', 'mode-adjust', 'mode-markup', 'mode-redact', 'mode-resize']) {
      expect(control(editor, command).disabled, command).to.equal(false);
    }
    expect(title(editor)).to.equal('Beach');
    expect(titlesSent.get(editor), 'said once each time the title changed').to.deep.equal(['', 'Beach']);
    expect(menu!.open).to.equal(false);
    expect(openView(editor), 'Open goes once a picture is open').to.equal(null);
    const status = editor.shadowRoot!.querySelector('.status')!;
    expect((status.querySelector('input[name="name"]') as HTMLInputElement).value).to.equal('Beach');
    expect(status.textContent).to.contain('Holidays');
    expect(status.textContent).to.contain('80 × 60 px');
    expect(status.textContent).to.contain('PNG');
    expect(menu!.document).to.include({ unique: 'k1', name: 'Beach', extension: 'png', width: 80, height: 60 });
  });

  it('opens from the open view on the empty canvas as from the menu', async () => {
    const { editor } = await mountEditor();
    openView(editor)!.fire('open', await opened('picture.png'));
    const deadline = performance.now() + 5000;
    while (!editor.picture && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
    await settle(editor);
    expect(title(editor)).to.equal('Beach');
    expect(openView(editor)).to.equal(null);
  });

  it('puts the menu away once a picture opened from it', async () => {
    const { editor, menu } = await mountEditor();
    menu!.show('open');
    await openFixture(editor, menu!);
    expect(menu!.open).to.equal(false);
    expect(editor.menuOpen).to.equal(false);
  });

  it('refuses an SVG with a reason, and changes nothing', async () => {
    const { editor, menu } = await mountEditor();
    menu!.fire('open', await opened('picture.png', { extension: 'svg', name: 'Logo' }));
    await settle(editor);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain(words.refusedSvg.replace('%0%', 'Logo'));
    expect(control(editor, 'mode-crop').disabled).to.equal(true);
    expect(title(editor), 'no title').to.equal('');
  });

  it('opens an animated GIF with a notice that saving keeps the first frame', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'two-frames.gif');
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain(words.animatedGif);
  });

  it('says why when the file cannot be read', async () => {
    const { editor, menu } = await mountEditor();
    menu!.fire('failed', { message: 'Beach could not be opened.' });
    await settle(editor);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain('Beach could not be opened.');
  });
});

describe('saving', () => {
  it('saves from the button and from Ctrl+S through the file menu', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    control(editor, 'save').click();
    await settle(editor);
    expect(menu!.saves).to.equal(1);
    const event = press(editor, 's', { ctrl: true });
    await settle(editor);
    expect(menu!.saves).to.equal(2);
    expect(event.defaultPrevented, "the browser's own Save page is not opened").to.equal(true);
  });

  it('shows the menu on Save as, on PNG, for a GIF', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!, 'one-frame.gif');
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    control(editor, 'save').click();
    await settle(editor);
    expect(menu!.open).to.equal(true);
    expect(editor.menuOpen).to.equal(true);
    expect(menu!.shown[menu!.shown.length - 1]).to.deep.equal({ panel: 'saveAs', format: 'png' });
  });

  it('marks itself unsaved on a change, clean on a save, and unsaved again on undo past it', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
    expect(menu!.dirty).to.equal(true);
    menu!.fire('saved', { unique: 'k1', updateDate: 'd2', name: 'Beach', extension: 'png', folder: 'f1', folderName: 'Holidays', copy: false, bytes: 300 });
    await settle(editor);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
    expect(menu!.document?.updateDate).to.equal('d2');
    expect(menu!.document?.bytes).to.equal(300);
    control(editor, 'undo').click();
    await settle(editor);
    expect(editor.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
  });

  it('moves onto a saved copy, so the next save writes to the copy', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    menu!.fire('saved', { unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'webp', folder: 'f9', folderName: 'Other', copy: true, bytes: 90 });
    await settle(editor);
    expect(menu!.document).to.include({ unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'webp', folder: 'f9' });
    expect(title(editor)).to.equal('Beach (copy)');
  });

  /** A copy is a full copy (edit-image design §11.6): it carries the focal point unless reframed. */
  it('keeps the focal point after a copy, and drops it after a copy of a turned picture', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    menu!.fire('saved', { unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'png', folder: 'f1', copy: true, bytes: 90 });
    await settle(editor);
    expect(editor.focalPoint).to.deep.equal({ left: 0.25, top: 0.5 });

    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    menu!.fire('saved', { unique: 'copy2', updateDate: 'c2', name: 'Beach (copy 2)', extension: 'png', folder: 'f1', copy: true, bytes: 90 });
    await settle(editor);
    expect(editor.focalPoint).to.equal(null);
  });

  /**
   * A copy of an image that was gone by then is a plain new item, with no focal point, and the service
   * says so (#137, §11.7); the editor shows what the service says instead of "Saved".
   */
  it('drops the focal point after a plain copy, and shows what the save said', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    menu!.fire('saved', {
      unique: 'copy1', updateDate: 'c1', name: 'Beach (copy)', extension: 'png', folder: 'f1', copy: true, bytes: 90,
      fullCopy: false, notice: 'The original is gone.',
    });
    await settle(editor);
    expect(editor.focalPoint).to.equal(null);
    expect(editor.notice).to.deep.equal({ kind: 'info', text: 'The original is gone.' });
  });

  it('tells the file menu to reset the focal point after a turn, not after a resize', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.apply({ ...editor.state!, size: { w: 40, h: 30 } });
    await settle(editor);
    expect(menu!.resetFocalPoint).to.equal(false);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    expect(menu!.resetFocalPoint).to.equal(true);
  });

  it('hands the file menu an encoder that writes the picture as saved', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    const blob = await menu!.encode!('png', 90);
    const bitmap = await createImageBitmap(blob);
    expect({ w: bitmap.width, h: bitmap.height }).to.deep.equal({ w: 60, h: 80 });
  });
});

describe('keys', () => {
  it('opens the menu straight on Open and on Save as', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    press(editor, 'o', { ctrl: true });
    expect(menu!.shown[menu!.shown.length - 1].panel).to.equal('open');
    menu!.hide();
    press(editor, 'S', { ctrl: true, shift: true });
    expect(menu!.shown[menu!.shown.length - 1].panel).to.equal('saveAs');
  });

  it('undoes and redoes', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    press(editor, 'z', { ctrl: true });
    expect(editor.state!.rotation).to.equal(0);
    press(editor, 'y', { ctrl: true });
    expect(editor.state!.rotation).to.equal(90);
  });

  it('zooms: Ctrl+0 fits, Ctrl+1 is 100%, Ctrl+plus and Ctrl+minus step', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
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
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    const name = editor.shadowRoot!.querySelector('input[name="name"]') as HTMLInputElement;
    press(editor, 'z', { ctrl: true }, name);
    expect(editor.state!.rotation, "the field's own undo").to.equal(90);
    press(editor, 's', { ctrl: true }, name);
    await settle(editor);
    expect(menu!.saves).to.equal(1);
  });
});

describe('the status bar', () => {
  it('renames the item in the name field', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    const name = editor.shadowRoot!.querySelector('input[name="name"]') as HTMLInputElement;
    name.value = 'Sunset';
    name.dispatchEvent(new Event('input'));
    await settle(editor);
    expect(menu!.document?.name).to.equal('Sunset');
    expect(title(editor)).to.equal('Sunset');
    expect(editor.hasAttribute('data-umbradesktop-dirty'), 'a rename is saved like any change').to.equal(true);
  });

  it('shows the size before and after while a resize is pending', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.pendingSize = { w: 40, h: 30 };
    await settle(editor);
    expect(editor.shadowRoot!.querySelector('.status')!.textContent).to.contain('80 × 60 → 40 × 30 px');
  });
});

it('closes its window from the file menu', async () => {
  const { editor, menu } = await mountEditor();
  let asked = 0;
  editor.addEventListener('umbradesktop-close-request', () => asked++);
  menu!.fire('close');
  expect(asked).to.equal(1);
});

describe('keys, from the review', () => {
  it('never overwrites the original from Ctrl+S while the menu is showing', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    editor.showMenu('saveAs');
    await settle(editor);
    const event = press(editor, 's', { ctrl: true });
    await settle(editor);
    expect(menu!.saves, "Save as's own button decides what it writes").to.equal(0);
    expect(event.defaultPrevented, "and the browser's own Save page does not open").to.equal(true);
  });

  it('leaves Enter and Space to the button they land on', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
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
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
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

describe('the look (D11, D13)', () => {
  /**
   * Distinct colours for the tokens, so each can be told apart in a computed style.
   * @param editor The editor.
   */
  function paint(editor: HTMLElement): void {
    editor.style.setProperty('--umbradesktop-app-accent', 'rgb(40, 58, 151)');
    editor.style.setProperty('--umbradesktop-app-accent-text', 'rgb(255, 255, 255)');
    editor.style.setProperty('--umbradesktop-app-action', 'rgb(11, 136, 68)');
    editor.style.setProperty('--umbradesktop-app-action-text', 'rgb(250, 250, 250)');
    editor.style.setProperty('--umbradesktop-app-current', 'rgb(245, 193, 188)');
    editor.style.setProperty('--umbradesktop-app-surface', 'rgb(255, 255, 254)');
  }

  it("draws Save as the main action, never in the selection's colour", async () => {
    const { editor, menu } = await mountEditor();
    paint(editor);
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    const style = getComputedStyle(control(editor, 'save'));
    expect(style.backgroundColor).to.equal('rgb(11, 136, 68)');
    expect(style.color).to.equal('rgb(250, 250, 250)');
    expect(control(editor, 'save').textContent!.trim()).to.equal(words.save);
  });

  it('marks the mode in use with a line under it, not a fill, its icon over its name', async () => {
    const { editor, menu } = await mountEditor();
    paint(editor);
    await openFixture(editor, menu!);
    const tab = control(editor, 'mode-crop');
    expect(tab.getAttribute('aria-pressed')).to.equal('true');
    const style = getComputedStyle(tab);
    expect(style.backgroundColor, 'no fill').to.equal('rgba(0, 0, 0, 0)');
    expect(style.boxShadow, 'the line').to.contain('rgb(245, 193, 188)');
    expect(getComputedStyle(control(editor, 'mode-adjust')).boxShadow, 'only under the one in use').to.not.contain('rgb(245, 193, 188)');
    const icon = tab.querySelector('umb-icon')!.getBoundingClientRect();
    const label = tab.querySelector('span')!.getBoundingClientRect();
    expect(icon.bottom, 'icon over the name').to.be.at.most(label.top + 1);
  });

  /**
   * The owner, on the first build of the tab look: the hover was barely visible, the bar's raised
   * ground going one step lighter. The sunken ground was tried next and was no better under the
   * Umbraco theme, whose surfaces are a hair apart. Under the pointer a button now takes a wash of the
   * text colour, which shows on any ground in any theme, and Save darkens. No line under a hovered
   * tab: one in the border colour was tried, and under the Umbraco theme it was darker than the pale
   * line under the tab in use, so the hovered tab looked the more selected of the two.
   */
  it('shows clearly which button is under the pointer', async () => {
    const { sendMouse, setViewport } = await import('@web/test-runner-commands');
    // Wide enough for the whole editor, so the pointer can reach Save and "..." at its right.
    await setViewport({ width: 1300, height: 900 });
    const { editor, menu } = await mountEditor();
    paint(editor);
    editor.style.setProperty('--umbradesktop-app-text', 'rgb(20, 20, 30)');
    editor.style.setProperty('--umbradesktop-app-border', 'rgb(120, 120, 128)');
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    // What the wash computes to, from a probe given the same mix of the same text colour.
    const probe = document.createElement('div');
    probe.style.background = `color-mix(in srgb, rgb(20, 20, 30) ${HOVER_WASH}%, transparent)`;
    document.body.append(probe);
    const wash = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const hover = async (command: string) => {
      const box = control(editor, command).getBoundingClientRect();
      await sendMouse({ type: 'move', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
      return getComputedStyle(control(editor, command));
    };
    expect(HOVER_WASH, 'enough to see').to.be.at.least(8);
    expect((await hover('undo')).backgroundColor, 'undo').to.equal(wash);
    expect((await hover('more')).backgroundColor, '"..."').to.equal(wash);
    const tab = await hover('mode-adjust');
    expect(tab.backgroundColor, 'a tab').to.equal(wash);
    expect(tab.boxShadow, 'no line that could pass for the one in use').to.equal('none');
    expect((await hover('mode-crop')).boxShadow, 'the tab in use keeps its own line').to.contain('rgb(245, 193, 188)');
    expect((await hover('save')).filter, 'Save darkens').to.contain('brightness');
    await sendMouse({ type: 'move', position: [0, 0] });
  });

  /**
   * The owner, on the first build of the tab look: the tabs were squashed, the icon almost touching
   * the top of the bar. Umbraco's own header tabs leave room above the icon and below the name.
   */
  it('gives a tab room above its icon and below its name', async () => {
    const { editor, menu } = await mountEditor();
    await openFixture(editor, menu!);
    const tab = control(editor, 'mode-crop').getBoundingClientRect();
    const icon = control(editor, 'mode-crop').querySelector('umb-icon')!.getBoundingClientRect();
    const label = control(editor, 'mode-crop').querySelector('span')!.getBoundingClientRect();
    expect(icon.top - tab.top, 'room above the icon').to.be.at.least(10);
    expect(tab.bottom - label.bottom, 'room below the name, over the line').to.be.at.least(8);
  });

  /**
   * Found in a real backoffice: hovering the pressed mode or Save painted the hover's light ground
   * under their light text, so they vanished under the pointer.
   */
  it('keeps Save and the mode in use as they are under the pointer', async () => {
    const { sendMouse, setViewport } = await import('@web/test-runner-commands');
    // Wide enough for the whole editor: Save is past the default 800px, where the pointer cannot go.
    await setViewport({ width: 1300, height: 900 });
    const { editor, menu } = await mountEditor();
    paint(editor);
    await openFixture(editor, menu!);
    editor.apply(rotate(editor.state!, 'right'));
    await settle(editor);
    const checks: Array<[string, 'backgroundColor' | 'boxShadow', string]> = [
      ['save', 'backgroundColor', 'rgb(11, 136, 68)'],
      ['mode-crop', 'boxShadow', 'rgb(245, 193, 188)'],
    ];
    for (const [command, property, value] of checks) {
      const button = control(editor, command);
      const box = button.getBoundingClientRect();
      await sendMouse({ type: 'move', position: [Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2)] });
      expect(getComputedStyle(button)[property], command).to.contain(value);
    }
    await sendMouse({ type: 'move', position: [0, 0] });
  });
});
