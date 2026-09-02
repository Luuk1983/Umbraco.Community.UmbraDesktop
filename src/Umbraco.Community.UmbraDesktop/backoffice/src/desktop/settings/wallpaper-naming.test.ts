import { expect } from '@open-wc/testing';
import { isWallpaperSource, wallpaperNameFromSlug, wallpaperSlugFromFile } from '../../../scripts/wallpaper-naming.mjs';

it('derives a slug from a source filename', () => {
  expect(wallpaperSlugFromFile('aurora-flow.png')).to.equal('aurora-flow');
});

it('lowercases and hyphenates a slug so filenames need not be exact', () => {
  expect(wallpaperSlugFromFile('Golden Valley.PNG')).to.equal('golden-valley');
});

it('collapses runs of separators and trims them from the ends', () => {
  expect(wallpaperSlugFromFile('_retro__swoosh -.png')).to.equal('retro-swoosh');
});

it('title-cases a slug into a display name', () => {
  expect(wallpaperNameFromSlug('aurora-flow')).to.equal('Aurora Flow');
});

it('title-cases every word of a multi-hyphen slug', () => {
  expect(wallpaperNameFromSlug('deep-space-nine')).to.equal('Deep Space Nine');
});

it('accepts the image extensions the build can decode', () => {
  expect(isWallpaperSource('aurora-flow.png')).to.equal(true);
  expect(isWallpaperSource('golden-valley.jpg')).to.equal(true);
  expect(isWallpaperSource('dusk-horizon.JPEG')).to.equal(true);
  expect(isWallpaperSource('ember-glow.webp')).to.equal(true);
});

it('ignores files that are not images', () => {
  expect(isWallpaperSource('README.md')).to.equal(false);
  expect(isWallpaperSource('.DS_Store')).to.equal(false);
  expect(isWallpaperSource('notes.txt')).to.equal(false);
});

it('ignores an already-generated thumbnail so it is never treated as a source', () => {
  expect(isWallpaperSource('aurora-flow.thumb.avif')).to.equal(false);
});
