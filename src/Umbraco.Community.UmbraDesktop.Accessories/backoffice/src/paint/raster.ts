/**
 * Paint's pixels, as pure functions over an `ImageData`-shaped buffer.
 *
 * Paint draws by setting pixels itself rather than by asking the canvas to stroke paths, and this
 * module is why. A canvas stroke is antialiased, so a line's edge is a band of in-between colours,
 * and a flood fill that stops at "not the colour I clicked" then leaves a halo of unfilled pixels
 * round every line. MS Paint never antialiased either, which is what made its bucket work, so the
 * same choice here gets the same fill and the same crisp pencil. It also makes every tool testable
 * without a canvas: a stroke is a list of points and a fill is a count.
 */

/** A colour as four bytes, red, green, blue and alpha, the layout `ImageData` stores. */
export type Rgba = readonly [number, number, number, number];

/**
 * The part of `ImageData` this module needs. Structural, so a real `ImageData` from the canvas
 * passes straight in and a test can build one without a canvas at all.
 */
export interface RasterImage {
  /** Width in pixels. */
  readonly width: number;
  /** Height in pixels. */
  readonly height: number;
  /** Row-major RGBA bytes, four per pixel. */
  readonly data: Uint8ClampedArray;
}

/**
 * A picture of white paper.
 * @param width Width in pixels.
 * @param height Height in pixels.
 * @returns The blank picture.
 */
export function blankImage(width: number, height: number): RasterImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4).fill(255) };
}

/**
 * Read a CSS hex colour, three or six digits, as opaque RGBA.
 * @param hex The colour, e.g. `#ff8000`.
 * @returns Its bytes.
 */
export function parseColour(hex: string): Rgba {
  const digits = hex.replace('#', '');
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const value = parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
}

/**
 * The colour of one pixel.
 * @param image The picture.
 * @param x Column.
 * @param y Row.
 * @returns Its bytes.
 */
export function pixelAt(image: RasterImage, x: number, y: number): Rgba {
  const offset = (y * image.width + x) * 4;
  const { data } = image;
  return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
}

/**
 * Set one pixel, if it is inside the picture.
 * @param image The picture, changed in place.
 * @param x Column.
 * @param y Row.
 * @param colour The colour.
 */
function setPixel(image: RasterImage, x: number, y: number, colour: Rgba): void {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.data.set(colour, (y * image.width + x) * 4);
}

/**
 * Every pixel on the straight line between two points, both ends included, each one touching the
 * last.
 *
 * Bresenham's, so it is integers throughout and gapless by construction. Pointer events land tens of
 * pixels apart on a quick drag, and stamping only where they land would draw a dotted line; joining
 * each to the last with this is what makes a stroke a stroke.
 * @param x0 Start column.
 * @param y0 Start row.
 * @param x1 End column.
 * @param y1 End row.
 * @returns The points, in order from start to end.
 */
export function linePoints(x0: number, y0: number, x1: number, y1: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const stepX = x0 < x1 ? 1 : -1;
  const stepY = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    points.push([x, y]);
    if (x === x1 && y === y1) return points;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

/**
 * Paint a square brush centred on a point. Square rather than round because it is what MS Paint's
 * brush and eraser were, and because a round brush at 3px is a square anyway.
 * @param image The picture, changed in place.
 * @param x Centre column.
 * @param y Centre row.
 * @param size The brush's edge in pixels.
 * @param colour The colour.
 */
export function stamp(image: RasterImage, x: number, y: number, size: number, colour: Rgba): void {
  const start = -Math.floor((size - 1) / 2);
  for (let row = start; row < start + size; row++) {
    for (let column = start; column < start + size; column++) setPixel(image, x + column, y + row, colour);
  }
}

/**
 * Fill the region of exactly the clicked colour that the clicked pixel belongs to, four-connected.
 *
 * A scanline fill on an explicit stack rather than a recursive one: a recursive fill over an empty
 * 480 by 300 picture is 144,000 frames deep and overflows the call stack in every browser.
 * @param image The picture, changed in place.
 * @param x Column clicked.
 * @param y Row clicked.
 * @param colour The fill.
 * @returns How many pixels changed. Zero for a click outside the picture or on the fill colour itself.
 */
export function floodFill(image: RasterImage, x: number, y: number, colour: Rgba): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  const target = pixelAt(image, x, y);
  if (target.every((byte, index) => byte === colour[index])) return 0;

  const { width, height, data } = image;
  const matches = (pixel: number): boolean =>
    data[pixel * 4] === target[0] &&
    data[pixel * 4 + 1] === target[1] &&
    data[pixel * 4 + 2] === target[2] &&
    data[pixel * 4 + 3] === target[3];

  let filled = 0;
  const stack: Array<[number, number]> = [[x, y]];
  while (stack.length) {
    const [seedX, seedY] = stack.pop()!;
    let left = seedX;
    const row = seedY * width;
    if (!matches(row + left)) continue;
    while (left > 0 && matches(row + left - 1)) left--;
    let above = false;
    let below = false;
    for (let column = left; column < width && matches(row + column); column++) {
      data.set(colour, (row + column) * 4);
      filled++;
      // Queue one seed per run of matching pixels in the rows either side, not one per pixel.
      if (seedY > 0) {
        const match = matches(row - width + column);
        if (match && !above) stack.push([column, seedY - 1]);
        above = match;
      }
      if (seedY < height - 1) {
        const match = matches(row + width + column);
        if (match && !below) stack.push([column, seedY + 1]);
        below = match;
      }
    }
  }
  return filled;
}

/**
 * The picture at a new size, anchored at the top left, as MS Paint's canvas handles resize it: what
 * fits in both sizes stays exactly where it was, new columns and rows are the fill colour, and
 * whatever falls outside the new size is cropped. The original is left alone, so it can go on the
 * Undo history as it is.
 * @param image The picture.
 * @param width The new width, at least 1.
 * @param height The new height, at least 1.
 * @param fill The colour of any new area: the background colour, in Paint.
 * @returns The resized picture.
 */
export function resizeImage(image: RasterImage, width: number, height: number, fill: Rgba): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set(fill, offset);
  const rowBytes = Math.min(width, image.width) * 4;
  for (let y = 0; y < Math.min(height, image.height); y++) {
    const from = y * image.width * 4;
    data.set(image.data.subarray(from, from + rowBytes), y * width * 4);
  }
  return { width, height, data };
}
