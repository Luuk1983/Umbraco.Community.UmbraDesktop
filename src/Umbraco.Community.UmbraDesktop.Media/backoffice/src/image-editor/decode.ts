/**
 * Decode an opened file into a picture, upright.
 *
 * `imageOrientation: 'from-image'` has the browser apply the file's EXIF orientation, so a phone
 * photo stored on its side is upright in the editor and saved upright, with its sides swapped
 * (design §6, Metadata; Review Focus 5). It is the default in current browsers; it is named so a
 * browser that changes its default cannot turn every portrait photo on its side.
 * @param blob The file.
 * @returns The picture. It throws for a file the browser cannot decode, which the editor reports.
 */
export function decodePicture(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}
