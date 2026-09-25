import { expect, fixture, html } from '@open-wc/testing';
import './paint.element.js';
import { PAINT_CANVAS_SIZE, PAINT_MAX_IMAGE_EDGE_PX } from './constants.js';
import type { PaintElement } from './paint.element.js';
import type { MediaOpenResult } from '../shared/media-open.js';
import type { MediaSaveRequest } from '../shared/media-save.js';
import type { SaveFolderChoice } from '../shared/save-location.js';

/**
 * Paint as a media library image editor: open an image from the media library, draw on it, save it
 * back; or draw a new picture and choose where it goes the first time it is saved. The media library
 * is faked; a running backoffice is what proves the real one.
 */

/** Everything the element asked of the media library, recorded. */
interface Recorded {
  /** Every save, as asked for. */
  saves: MediaSaveRequest[];
  /** How many times Save asked where. */
  picks: number;
}

/**
 * A mounted Paint over a fake media library whose Open finds `opened`.
 * @param opened What Open finds.
 * @param picked Where Save As is told to put a new picture.
 */
async function paint(
  opened?: MediaOpenResult,
  picked: SaveFolderChoice = { status: 'chosen', folder: 'folder-1' },
): Promise<{ element: PaintElement; recorded: Recorded }> {
  const recorded: Recorded = { saves: [], picks: 0 };
  const element = await fixture<PaintElement>(html`<umbradesktop-paint
    .confirmDiscard=${async () => true}
    .pickSaveFolder=${async () => {
      recorded.picks++;
      return picked;
    }}
    .saveToMedia=${async (request: MediaSaveRequest) => {
      recorded.saves.push(request);
      return { ok: true, unique: request.existing ?? 'picture-1' };
    }}
    .openFromMedia=${async () => opened ?? { status: 'cancelled' }}
  ></umbradesktop-paint>`);
  return { element, recorded };
}

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

/** Click a control by a data attribute, and let what it started (decoding, encoding) finish. */
async function click(element: PaintElement, selector: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLElement>(selector)!.click();
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  }
}

/** Wait for `condition`, since images are decoded and encoded asynchronously. */
async function until(condition: () => boolean): Promise<void> {
  for (let tries = 0; tries < 40 && !condition(); tries++) await new Promise((resolve) => setTimeout(resolve, 25));
}

/**
 * An image in the media library, as the opener returns it: `w` by `h` of solid red.
 * @param type The image's type.
 * @param name Its media item's name.
 * @param extension Its file's extension.
 */
async function redImage(w: number, h: number, type = 'image/png', name = 'Logo', extension = 'png'): Promise<MediaOpenResult> {
  const source = document.createElement('canvas');
  source.width = w;
  source.height = h;
  const context = source.getContext('2d')!;
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, w, h);
  const blob = await new Promise<Blob>((resolve) => source.toBlob((made) => resolve(made!), type));
  return { status: 'opened', unique: 'existing-1', name, blob, extension };
}

/** The status line's message. */
function notice(element: PaintElement): string {
  return (element.shadowRoot!.querySelector('.notice')?.textContent ?? '').trim();
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

it('starts a new picture, at the default size', async () => {
  const { element } = await paint();
  await drag(element, [[5, 5]]);
  await click(element, '[data-action="new"]');
  expect(pixel(element, 5, 5)).to.deep.equal(WHITE);
  expect([canvas(element).width, canvas(element).height]).to.deep.equal([PAINT_CANVAS_SIZE.w, PAINT_CANVAS_SIZE.h]);
});


/** There is one place a picture goes now: the media library. */
it('has no way to save to this computer', async () => {
  const { element } = await paint();
  expect(element.shadowRoot!.querySelector('[data-action="save-other"]')).to.equal(null);
});

it('asks where a new picture goes, saves it there as a PNG, and overwrites it next time without asking', async () => {
  const { element, recorded } = await paint();
  const name = element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!;
  name.value = 'Sketch';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  await click(element, '[data-action="save"]');
  await until(() => recorded.saves.length === 1);
  await drag(element, [[5, 5]]);
  await click(element, '[data-action="save"]');
  await until(() => recorded.saves.length === 2);
  expect(recorded.saves.map((save) => [save.name, save.file.name, save.file.type, save.folder, save.existing])).to.deep.equal([
    ['Sketch', 'Sketch.png', 'image/png', 'folder-1', undefined],
    ['Sketch', 'Sketch.png', 'image/png', 'folder-1', 'picture-1'],
  ]);
  expect(recorded.picks).to.equal(1);
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(false);
});

it('saves nothing when asking where is cancelled', async () => {
  const { element, recorded } = await paint(undefined, { status: 'cancelled' });
  await drag(element, [[5, 5]]);
  await click(element, '[data-action="save"]');
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(recorded.saves).to.have.length(0);
  expect(element.hasAttribute('data-umbradesktop-dirty')).to.equal(true);
});

it('saves an opened image back without asking where', async () => {
  const { element, recorded } = await paint(await redImage(30, 20));
  await click(element, '[data-action="open"]');
  await until(() => canvas(element).width === 30);
  await drag(element, [[5, 5]]);
  await click(element, '[data-action="save"]');
  await until(() => recorded.saves.length === 1);
  expect(recorded.picks).to.equal(0);
});

it('starts a new media item for a new picture', async () => {
  const { element, recorded } = await paint();
  await click(element, '[data-action="save"]');
  await until(() => recorded.saves.length === 1);
  await click(element, '[data-action="new"]');
  await click(element, '[data-action="save"]');
  await until(() => recorded.saves.length === 2);
  expect(recorded.saves[1].existing).to.equal(undefined);
});

describe('opening an image from the media library', () => {
  it('opens it at its own size, named after its media item', async () => {
    const { element } = await paint(await redImage(30, 20));
    await click(element, '[data-action="open"]');
    await until(() => canvas(element).width === 30);
    expect([canvas(element).width, canvas(element).height]).to.deep.equal([30, 20]);
    expect(pixel(element, 29, 19)).to.deep.equal(RED);
    expect(element.shadowRoot!.querySelector<HTMLInputElement>('[data-field="name"]')!.value).to.equal('Logo');
    expect(element.shadowRoot!.querySelector('.dimensions')?.textContent).to.contain('30').and.contain('20');
  });

  it('draws on the opened image and saves it back over its own media item', async () => {
    const { element, recorded } = await paint(await redImage(30, 20));
    await click(element, '[data-action="open"]');
    await until(() => canvas(element).width === 30);
    await drag(element, [[2, 2]]);
    expect(pixel(element, 2, 2)).to.deep.equal(BLACK);
    await click(element, '[data-action="save"]');
    await until(() => recorded.saves.length === 1);
    const [save] = recorded.saves;
    expect([save.existing, save.name, save.file.name, save.file.type]).to.deep.equal(['existing-1', 'Logo', 'Logo.png', 'image/png']);
  });

  /** A photograph stays a JPEG, so saving it back does not swap its format or balloon its size. */
  it('saves a JPEG back as a JPEG', async () => {
    const { element, recorded } = await paint(await redImage(12, 12, 'image/jpeg', 'Photo', 'jpg'));
    await click(element, '[data-action="open"]');
    await until(() => canvas(element).width === 12);
    await click(element, '[data-action="save"]');
    await until(() => recorded.saves.length === 1);
    expect([recorded.saves[0].file.name, recorded.saves[0].file.type]).to.deep.equal(['Photo.jpg', 'image/jpeg']);
  });

  it('refuses an SVG, which it could only flatten, and says so', async () => {
    const svg: MediaOpenResult = {
      status: 'opened',
      unique: 'svg-1',
      name: 'Icon',
      blob: new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }),
      extension: 'svg',
    };
    const { element } = await paint(svg);
    await click(element, '[data-action="open"]');
    expect(notice(element)).to.contain('Icon');
    expect(canvas(element).width).to.equal(PAINT_CANVAS_SIZE.w);
  });

  it('refuses an image too large to edit, and says so', async () => {
    const { element } = await paint(await redImage(PAINT_MAX_IMAGE_EDGE_PX + 1, 1, 'image/png', 'Poster'));
    await click(element, '[data-action="open"]');
    await until(() => notice(element) !== '');
    expect(notice(element)).to.contain('Poster');
    expect(canvas(element).width).to.equal(PAINT_CANVAS_SIZE.w);
  });

  it('takes an opened image’s first stroke back with Undo', async () => {
    const { element } = await paint(await redImage(30, 20));
    await click(element, '[data-action="open"]');
    await until(() => canvas(element).width === 30);
    await drag(element, [[2, 2]]);
    await click(element, '[data-action="undo"]');
    expect(pixel(element, 2, 2)).to.deep.equal(RED);
  });
});

/**
 * The picture can be made bigger or smaller by dragging the handles on its right edge, its bottom
 * edge and its corner, as in MS Paint. It grows into the background colour and shrinks by cropping,
 * anchored at the top left, and a resize is one step Undo takes back, size and all.
 */
describe('resizing the picture', () => {
  /**
   * Drag a resize handle by `dx`, `dy` screen pixels.
   * @param element The Paint.
   * @param which Which handle: `right`, `bottom` or `corner`.
   * @param dx How far across.
   * @param dy How far down.
   */
  async function resizeBy(element: PaintElement, which: string, dx: number, dy: number): Promise<void> {
    const handle = element.shadowRoot!.querySelector<HTMLElement>(`[data-resize="${which}"]`)!;
    const box = handle.getBoundingClientRect();
    const start = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const send = (type: string, x: number, y: number) =>
      handle.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1, pointerId: 1, bubbles: true, composed: true }),
      );
    send('pointerdown', start.x, start.y);
    send('pointermove', start.x + dx, start.y + dy);
    await element.updateComplete;
    send('pointerup', start.x + dx, start.y + dy);
    for (let i = 0; i < 3; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      await element.updateComplete;
    }
  }

  const size = (element: PaintElement) => [canvas(element).width, canvas(element).height];

  it('grows from the corner, keeping what was drawn and filling the rest with the background colour', async () => {
    const { element } = await paint();
    await drag(element, [[5, 5]]);
    element.shadowRoot!.querySelector('[data-colour="#ff0000"]')!.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true }),
    );
    await element.updateComplete;
    await resizeBy(element, 'corner', 40, 20);
    expect(size(element)).to.deep.equal([PAINT_CANVAS_SIZE.w + 40, PAINT_CANVAS_SIZE.h + 20]);
    expect(pixel(element, 5, 5), 'the drawing stays where it was').to.deep.equal(BLACK);
    expect(pixel(element, 10, 10), 'the old paper stays white').to.deep.equal(WHITE);
    expect(pixel(element, PAINT_CANVAS_SIZE.w + 30, 10), 'the new area is the background colour').to.deep.equal(RED);
    expect(pixel(element, 10, PAINT_CANVAS_SIZE.h + 10)).to.deep.equal(RED);
    expect(element.dirty, 'a resize is unsaved work').to.equal(true);
  });

  it('changes only the width from the right edge, and only the height from the bottom', async () => {
    const { element } = await paint();
    await resizeBy(element, 'right', 30, 50);
    expect(size(element)).to.deep.equal([PAINT_CANVAS_SIZE.w + 30, PAINT_CANVAS_SIZE.h]);
    await resizeBy(element, 'bottom', 50, 25);
    expect(size(element)).to.deep.equal([PAINT_CANVAS_SIZE.w + 30, PAINT_CANVAS_SIZE.h + 25]);
  });

  it('crops when made smaller', async () => {
    const { element } = await paint();
    await drag(element, [[5, 5]]);
    await resizeBy(element, 'corner', -PAINT_CANVAS_SIZE.w + 20, -PAINT_CANVAS_SIZE.h + 10);
    expect(size(element)).to.deep.equal([20, 10]);
    expect(pixel(element, 5, 5)).to.deep.equal(BLACK);
  });

  it('never goes below one pixel', async () => {
    const { element } = await paint();
    await resizeBy(element, 'corner', -5000, -5000);
    expect(size(element)).to.deep.equal([1, 1]);
  });

  it('takes a resize back with Undo, size and pixels', async () => {
    const { element } = await paint();
    await drag(element, [[5, 5]]);
    await resizeBy(element, 'corner', -PAINT_CANVAS_SIZE.w + 20, -PAINT_CANVAS_SIZE.h + 10);
    await click(element, '[data-action="undo"]');
    expect(size(element)).to.deep.equal([PAINT_CANVAS_SIZE.w, PAINT_CANVAS_SIZE.h]);
    expect(pixel(element, 5, 5)).to.deep.equal(BLACK);
    expect(pixel(element, 100, 100), 'what the crop cut off is back').to.deep.equal(WHITE);
  });

  /** The handles are buttons, so the keyboard can resize too: a pixel a press, ten with Shift. */
  it('resizes with the arrow keys on a handle', async () => {
    const { element } = await paint();
    const corner = element.shadowRoot!.querySelector<HTMLElement>('[data-resize="corner"]')!;
    const press = async (key: string, shiftKey = false) => {
      corner.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, composed: true, cancelable: true }));
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve));
        await element.updateComplete;
      }
    };
    await press('ArrowRight');
    await press('ArrowDown', true);
    expect(size(element)).to.deep.equal([PAINT_CANVAS_SIZE.w + 1, PAINT_CANVAS_SIZE.h + 10]);
  });
});

/**
 * The area round the picture is never the picture's own white, so the edge of what can be drawn on
 * is always visible. Most themes' sunken surface is already a grey; Windows 98's and Umbraco 4's is
 * white, the same as new paper, and the picture vanished into it. Those two get a ground of their
 * own: Windows 98 the dark grey MS Paint put behind the picture, Umbraco 4 its own border colour
 * mixed into its white.
 */
describe('the area round the picture', () => {
  /** The well's colour under a theme, with that theme's two app tokens set as the desktop sets them. */
  async function wellUnder(theme: string, sunken: string, border: string): Promise<string> {
    const { element } = await paint();
    element.setAttribute('data-umbradesktop-theme', theme);
    element.style.setProperty('--umbradesktop-app-surface-sunken', sunken);
    element.style.setProperty('--umbradesktop-app-border', border);
    await element.updateComplete;
    return getComputedStyle(element.shadowRoot!.querySelector('.well')!).backgroundColor;
  }

  it('is MS Paint’s dark grey under Windows 98', async () => {
    expect(await wellUnder('win98', '#ffffff', '#000000')).to.equal('rgb(128, 128, 128)');
  });

  it('is a grey from the theme’s own colours under Umbraco 4, not the paper’s white', async () => {
    const colour = await wellUnder('umbraco4', '#ffffff', '#8f8a80');
    expect(colour).to.not.equal('rgb(255, 255, 255)');
    expect(colour).to.not.equal('rgba(0, 0, 0, 0)');
  });

  it('is left to the theme under the others', async () => {
    expect(await wellUnder('win11', '#e6e6e6', '#797979')).to.equal('rgb(230, 230, 230)');
  });
});
