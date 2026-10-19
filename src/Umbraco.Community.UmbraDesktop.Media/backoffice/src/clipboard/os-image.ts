/**
 * A copied picture on the OS clipboard (design §5, plan task 6.2), so it pastes into an email or a
 * chat. The browser's clipboard takes PNG only, so any other picture is converted through a canvas;
 * the media item itself is never touched.
 *
 * When the picture comes back in a paste, the manager pastes a copy of the item rather than uploading
 * a new one, so it has to know the picture again. Not by its bytes: the browser and the OS may encode
 * the PNG again on the way. By a fingerprint instead: its size and a small grid of average colours,
 * which survive re-encoding and still tell two pictures apart.
 */

/** A picture's fingerprint. */
export interface UmbraDesktopImagePrint {
  /** Its width in pixels. */
  width: number;
  /** Its height in pixels. */
  height: number;
  /** The average red, green and blue of each cell of a {@link GRID} by {@link GRID} grid. */
  cells: number[];
}

/** Where a picture is written: the browser's clipboard, or a stand-in in a test. */
export interface UmbraDesktopImageClipboard {
  /**
   * Write items.
   * @param items The items.
   */
  write(items: ClipboardItem[]): Promise<void>;
}

/** The grid's side: fine enough to tell pictures apart, coarse enough to forgive re-encoding. */
const GRID = 4;

/** How far a colour may drift between two encodings of the same picture, out of 255. */
const TOLERANCE = 12;

/**
 * A picture as PNG.
 * @param blob The picture, in any format the browser can draw.
 * @returns It as PNG; a PNG is returned as it was.
 */
export async function toPng(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('No PNG'))), 'image/png'));
  } finally {
    bitmap.close();
  }
}

/**
 * A picture's fingerprint.
 * @param blob The picture.
 * @returns Its fingerprint.
 */
export async function fingerprint(blob: Blob): Promise<UmbraDesktopImagePrint> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = GRID;
    canvas.height = GRID;
    const draw = canvas.getContext('2d', { willReadFrequently: true })!;
    draw.imageSmoothingQuality = 'high';
    draw.drawImage(bitmap, 0, 0, GRID, GRID);
    const pixels = draw.getImageData(0, 0, GRID, GRID).data;
    const cells: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) cells.push(pixels[index], pixels[index + 1], pixels[index + 2]);
    return { width: bitmap.width, height: bitmap.height, cells };
  } finally {
    bitmap.close();
  }
}

/**
 * Whether two fingerprints are of the same picture.
 * @param a One.
 * @param b The other.
 * @returns True when the sizes match and every cell's colour is close.
 */
export function samePicture(a: UmbraDesktopImagePrint, b: UmbraDesktopImagePrint): boolean {
  if (a.width !== b.width || a.height !== b.height || a.cells.length !== b.cells.length) return false;
  return a.cells.every((value, index) => Math.abs(value - b.cells[index]) <= TOLERANCE);
}

/**
 * Put a picture on the OS clipboard. The PNG is handed over as a promise, so the write starts at once,
 * inside the key press or click that asked for it, while the picture is still being fetched.
 * @param png The picture as PNG, or a promise of it.
 * @param clipboard Where to write; the browser's clipboard unless a test hands in its own.
 */
export async function writeImage(png: Blob | Promise<Blob>, clipboard: UmbraDesktopImageClipboard = navigator.clipboard): Promise<void> {
  await clipboard.write([new ClipboardItem({ 'image/png': png })]);
}
