import { ACCEPT } from './constants.js';

/**
 * What the editor will open, decided from the file rather than the picker: the media service opens
 * any file, and the app says in its own words why it will not edit one (design §6).
 */

/**
 * Why a file will not be opened, or null when it will.
 * @param extension The file's extension, without the dot, in any case.
 * @returns `svg` for a vector image, which a raster editor would flatten into pixels and lose;
 *   `unsupported` for anything else the editor does not edit; null for every extension in {@link ACCEPT}.
 */
export function refusalFor(extension: string): 'svg' | 'unsupported' | null {
  const lower = extension.toLowerCase();
  if (lower === 'svg') return 'svg';
  return ACCEPT.includes(lower) ? null : 'unsupported';
}

/**
 * Whether a GIF holds more than one frame, so the editor can say that saving keeps only the first.
 *
 * Walks the GIF's block structure (its header, logical screen descriptor and optional colour table,
 * then extension and image blocks, each sub-block length-prefixed) counting image descriptors, and
 * stops at the second. Reading the structure rather than searching for the descriptor byte, because
 * `0x2C` turns up inside compressed image data and colour tables all the time. Anything that is not a
 * GIF, or ends early, is not animated: a file the browser cannot decode fails on decode, with its
 * own message, rather than here.
 * @param bytes The file's bytes.
 * @returns True for two or more frames.
 */
export function isAnimatedGif(bytes: Uint8Array): boolean {
  const ascii = String.fromCharCode(...bytes.subarray(0, 6));
  if (ascii !== 'GIF87a' && ascii !== 'GIF89a') return false;
  if (bytes.length < 13) return false;

  /** The size of a colour table a packed byte's top bit says follows, or 0. */
  const tableSize = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);

  /**
   * Skip a run of sub-blocks, each a length byte then that many bytes, ended by a zero length.
   * @param at Where the run starts.
   * @returns Where it ends, or -1 if the file ends first.
   */
  const skipSubBlocks = (at: number): number => {
    let position = at;
    while (position < bytes.length) {
      const length = bytes[position];
      position += 1;
      if (length === 0) return position;
      position += length;
    }
    return -1;
  };

  let position = 13 + tableSize(bytes[10]);
  let frames = 0;
  while (position < bytes.length) {
    const block = bytes[position];
    if (block === 0x3b) return false;
    if (block === 0x21) {
      // An extension: its label, then sub-blocks.
      position = skipSubBlocks(position + 2);
    } else if (block === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      if (position + 10 > bytes.length) return false;
      // The descriptor's 9 bytes, its own colour table, the LZW code size, then the image's sub-blocks.
      position = skipSubBlocks(position + 10 + tableSize(bytes[position + 9]) + 1);
    } else {
      return false;
    }
    if (position < 0) return false;
  }
  return false;
}
