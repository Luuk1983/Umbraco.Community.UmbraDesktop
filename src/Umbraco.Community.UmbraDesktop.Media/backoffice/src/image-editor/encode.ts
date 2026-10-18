/**
 * The formats the editor saves in. **A copy** of Services.Media's `SaveFormat` and `mimeFor`
 * (its `file-menu/formats.ts`, published on its developer page), since nothing is imported from
 * another package.
 */
export type SaveFormat = 'jpeg' | 'png' | 'webp';

/**
 * The MIME type a canvas encodes a format with.
 * @param format The format.
 * @returns Its MIME type.
 */
export function mimeFor(format: SaveFormat): string {
  return `image/${format}`;
}

/**
 * Encode a rendered picture with the canvas's own encoder. Re-encoding drops the file's EXIF, so
 * camera and location data go with it, which the user guide says (design §6).
 * @param canvas The picture, as `renderDocument` drew it.
 * @param format The format.
 * @param quality 1 to 100, for JPEG and WebP; PNG has none.
 * @returns The file's bytes.
 */
export function encodeCanvas(canvas: HTMLCanvasElement, format: SaveFormat, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`The picture could not be encoded as ${format}.`))),
      mimeFor(format),
      format === 'png' ? undefined : quality / 100,
    ),
  );
}
