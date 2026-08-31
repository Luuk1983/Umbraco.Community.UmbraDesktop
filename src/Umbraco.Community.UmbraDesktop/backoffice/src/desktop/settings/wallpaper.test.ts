import { expect } from '@open-wc/testing';
import { findBuiltInWallpaper, resolveWallpaper, wallpaperThumbUrl } from './wallpaper';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS, UMBRADESKTOP_DEFAULT_WALLPAPER_ID } from './wallpapers.generated';

const defaultWallpaper = UMBRADESKTOP_BUILTIN_WALLPAPERS.find((w) => w.id === UMBRADESKTOP_DEFAULT_WALLPAPER_ID)!;

it('ships a catalogue containing the default wallpaper', () => {
  expect(UMBRADESKTOP_BUILTIN_WALLPAPERS.length).to.be.greaterThan(0);
  expect(defaultWallpaper).to.not.equal(undefined);
});

it('resolves "none" to no image, so the desktop keeps its gradient', () => {
  expect(resolveWallpaper({ kind: 'none' })).to.deep.equal({ url: null, averageColour: null });
});

it('resolves a built-in wallpaper to its own image and colour', () => {
  expect(resolveWallpaper({ kind: 'builtin', id: defaultWallpaper.id })).to.deep.equal({
    url: defaultWallpaper.url,
    averageColour: defaultWallpaper.averageColour,
  });
});

it('falls back to the default when a built-in id is no longer in the catalogue', () => {
  expect(resolveWallpaper({ kind: 'builtin', id: 'removed-in-an-upgrade' })).to.deep.equal({
    url: defaultWallpaper.url,
    averageColour: defaultWallpaper.averageColour,
  });
});

it('resolves a media wallpaper to the URL the imaging repository returned', () => {
  expect(resolveWallpaper({ kind: 'media', unique: 'a-guid' }, '/media/abc.webp')).to.deep.equal({
    url: '/media/abc.webp',
    averageColour: null,
  });
});

it('falls back to the default when a media item can no longer be resolved', () => {
  expect(resolveWallpaper({ kind: 'media', unique: 'deleted' }, null)).to.deep.equal({
    url: defaultWallpaper.url,
    averageColour: defaultWallpaper.averageColour,
  });
});

it('finds a built-in wallpaper by id', () => {
  expect(findBuiltInWallpaper(defaultWallpaper.id)).to.equal(defaultWallpaper);
});

it('returns undefined for an id that is not in the catalogue', () => {
  expect(findBuiltInWallpaper('nope')).to.equal(undefined);
});

it('uses the small thumbnail for a built-in wallpaper, not the full-size image', () => {
  expect(wallpaperThumbUrl({ kind: 'builtin', id: defaultWallpaper.id })).to.equal(defaultWallpaper.thumbUrl);
});

it('has no thumbnail for "none", so the picker can show a gradient swatch instead', () => {
  expect(wallpaperThumbUrl({ kind: 'none' })).to.equal(null);
});

it('uses the resolved media URL as a media wallpaper thumbnail', () => {
  expect(wallpaperThumbUrl({ kind: 'media', unique: 'a-guid' }, '/media/abc-thumb.webp')).to.equal(
    '/media/abc-thumb.webp',
  );
});
