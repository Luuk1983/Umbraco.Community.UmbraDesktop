import { expect } from '@open-wc/testing';
import { wallpaperLabels } from './wallpaper-labels';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from './wallpapers.generated';

/**
 * The Appearance row says what you are using, and "what you are using" has four answers with
 * different shapes: a shipped image has a name, your own image does not have one here, the gradient
 * is not an image at all, and an id from a version that shipped a wallpaper this one does not still
 * has to say something.
 */

it('names a built-in wallpaper, with its source underneath', () => {
  const first = UMBRADESKTOP_BUILTIN_WALLPAPERS[0];
  const labels = wallpaperLabels({ kind: 'builtin', id: first.id }, UMBRADESKTOP_BUILTIN_WALLPAPERS);

  expect(labels.title).to.equal(first.name);
  expect(labels.titleKey).to.equal(undefined);
  expect(labels.subKey).to.equal('umbraDesktop_wallpaperBuiltIn');
});

it('falls back to a localized title for a built-in that no longer ships', () => {
  // An id stored by a version that had a wallpaper this one dropped. The desktop already falls back
  // to the default image when it paints; the row must not go blank while that happens.
  const labels = wallpaperLabels({ kind: 'builtin', id: 'removed-in-an-upgrade' }, UMBRADESKTOP_BUILTIN_WALLPAPERS);

  expect(labels.title).to.equal(undefined);
  expect(labels.titleKey).to.equal('umbraDesktop_wallpaperBuiltIn');
});

it('describes a Media Library image without inventing a name for it', () => {
  const labels = wallpaperLabels({ kind: 'media', unique: 'abc' }, UMBRADESKTOP_BUILTIN_WALLPAPERS);

  expect(labels.titleKey).to.equal('umbraDesktop_wallpaperOwnImage');
  expect(labels.subKey).to.equal('umbraDesktop_wallpaperFromMedia');
});

it('has nothing to add under the gradient, which is its own whole answer', () => {
  const labels = wallpaperLabels({ kind: 'none' }, UMBRADESKTOP_BUILTIN_WALLPAPERS);

  expect(labels.titleKey).to.equal('umbraDesktop_wallpaperNone');
  expect(labels.subKey).to.equal(undefined);
});
