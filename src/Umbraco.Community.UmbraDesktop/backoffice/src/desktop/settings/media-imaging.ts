import type { UmbImagingResizeModel } from '@umbraco-cms/backoffice/imaging';
import { ImageCropModeModel } from '@umbraco-cms/backoffice/external/backend-api';

/**
 * What the desktop asks Umbraco's imaging endpoint for when a wallpaper comes from the Media
 * Library. Kept apart from the settings context so the request can be asserted on without a
 * controller host, and apart from `wallpaper.ts` so that module stays free of Media Library
 * concerns.
 */

/**
 * Longest edge of a Media Library wallpaper. This is what keeps a consumer's 12MB upload from
 * ever reaching the browser at full size; 2560 covers a 27" display without upscaling anything
 * smaller.
 */
export const UMBRADESKTOP_MEDIA_WALLPAPER_SIZE = 2560;

/** Longest edge of a Media Library wallpaper's thumbnail, as shown in the settings dialog. */
export const UMBRADESKTOP_MEDIA_THUMB_SIZE = 480;

/**
 * The resize request for a wallpaper, bounded to a square box of `size`.
 *
 * Two things here are load-bearing, and both were bugs:
 *
 * 1. **Both edges are given.** The endpoint's `height` parameter defaults to 200 when it is
 *    omitted, and `Max` fits the image inside `width` x `height`, so asking for width alone
 *    returned a wallpaper 200 pixels tall. Passing the same number for both bounds the longest
 *    edge whichever way round the image is.
 * 2. **No `format` is requested.** Umbraco 17 signs image URLs with an HMAC, and ImageSharp's
 *    middleware sits in front of the whole pipeline. `format` is one of its own processing
 *    commands, so a request carrying one without a valid `hmac` token is rejected with an empty
 *    400 before it reaches the management API at all — and an empty body gives the backoffice
 *    nothing to read, so it reports "A fatal server error occurred". Umbraco picks the output
 *    format itself: a source it cannot re-encode becomes WebP, and a JPEG or PNG stays as it is,
 *    which is what a wallpaper wants anyway.
 * @param size The longest edge to allow, in pixels.
 * @returns The imaging model to hand to `UmbImagingRepository.requestResizedItems`.
 */
export function mediaImagingRequest(size: number): UmbImagingResizeModel {
  // `Max` never upscales, so a small upload stays small rather than being blown up and blurred.
  return { width: size, height: size, mode: ImageCropModeModel.MAX };
}
