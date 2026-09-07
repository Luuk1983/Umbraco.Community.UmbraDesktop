import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_MEDIA_THUMB_SIZE,
  UMBRADESKTOP_MEDIA_WALLPAPER_SIZE,
  mediaImagingRequest,
} from './media-imaging';
import { ImageCropModeModel } from '@umbraco-cms/backoffice/external/backend-api';

it('bounds both edges, because Umbraco defaults a missing height to 200', () => {
  // Sending width alone is not "unconstrained height": the resize endpoint's `height` parameter
  // defaults to 200, and `Max` fits the image inside width x height, so a 4K upload came back
  // 200px tall. See https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/issues/19.
  expect(mediaImagingRequest(1234)).to.deep.equal({
    width: 1234,
    height: 1234,
    mode: ImageCropModeModel.MAX,
  });
});

it('sends no format command, because that is what Umbraco 17 rejects the whole request for', () => {
  // Umbraco 17 signs image URLs with an HMAC, and ImageSharp's middleware sits in front of the
  // entire pipeline. `format` is one of its own processing commands, so a request carrying one
  // without a valid `hmac` token is short-circuited with an empty 400 before it ever reaches the
  // management API. Empty body means the backoffice cannot read a ProblemDetails out of it and
  // reports "A fatal server error occurred" instead.
  expect(Object.keys(mediaImagingRequest(UMBRADESKTOP_MEDIA_WALLPAPER_SIZE))).to.not.contain('format');
});

it('asks for a smaller box for the thumbnail than for the wallpaper itself', () => {
  expect(UMBRADESKTOP_MEDIA_THUMB_SIZE).to.be.lessThan(UMBRADESKTOP_MEDIA_WALLPAPER_SIZE);
});

it('never upscales, so a small upload stays the size it was uploaded at', () => {
  expect(mediaImagingRequest(UMBRADESKTOP_MEDIA_THUMB_SIZE).mode).to.equal(ImageCropModeModel.MAX);
});
