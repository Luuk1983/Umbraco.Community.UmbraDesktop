import { expect } from '@open-wc/testing';
import { previewWallpaper, themeWallpaper } from './theme-wallpaper';
import { UMBRADESKTOP_THEMES } from './themes/index';
import type { UmbraDesktopTheme } from './types';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from '../settings/wallpapers.generated';

/**
 * A catalogue small enough to reason about, covering the three cases the rule has to tell apart:
 * a theme that names an image, one whose own ground is the point, and one that says nothing.
 */
const FIXTURE: ReadonlyArray<UmbraDesktopTheme> = [
  { wallpaper: { kind: 'builtin', id: 'golden-valley' } } as UmbraDesktopTheme,
  { wallpaper: { kind: 'none' } } as UmbraDesktopTheme,
  {} as UmbraDesktopTheme,
].map((theme, index) => ({ ...theme, id: ['names-an-image', 'names-none', 'says-nothing'][index] }) as UmbraDesktopTheme);

it('gives back the image a theme names', () => {
  expect(themeWallpaper('names-an-image', FIXTURE)).to.deep.equal({ kind: 'builtin', id: 'golden-valley' });
});

it("gives back 'none' for a theme whose own ground is the point", () => {
  // Distinct from declaring nothing: Windows 98's flat teal *is* its matching wallpaper, so this
  // has to clear an image rather than leave one in place.
  expect(themeWallpaper('names-none', FIXTURE)).to.deep.equal({ kind: 'none' });
});

it('leaves the wallpaper alone for a theme that declares nothing', () => {
  expect(themeWallpaper('says-nothing', FIXTURE)).to.equal(undefined);
});

it('leaves the wallpaper alone for an id no catalogue entry matches', () => {
  // A theme dropped in an upgrade. The desktop falls back to Umbraco chrome, but silently
  // replacing the user's wallpaper on top of that would be a second surprise for one cause.
  expect(themeWallpaper('dropped-in-an-upgrade', FIXTURE)).to.equal(undefined);
});

it('has every shipped theme declare a match', () => {
  // The acceptance criterion, held as a test: a new theme that forgets the field does nothing at
  // all under a toggle the user has turned on, and nothing is the one failure nobody reports.
  for (const theme of UMBRADESKTOP_THEMES) {
    expect(theme.wallpaper, `theme '${theme.id}' declares no wallpaper`).to.not.equal(undefined);
  }
});

it('has every declared image still in the catalogue', () => {
  // Catches the rename that orphans a theme: the slug is a persisted id, so a wallpaper renamed
  // without its themes updated would silently fall back to the default image.
  for (const theme of UMBRADESKTOP_THEMES) {
    const ref = theme.wallpaper;
    if (ref?.kind !== 'builtin') continue;
    const found = UMBRADESKTOP_BUILTIN_WALLPAPERS.some((wallpaper) => wallpaper.id === ref.id);
    expect(found, `theme '${theme.id}' names missing wallpaper '${ref.id}'`).to.equal(true);
  }
});

it('never lets a theme name a Media Library image', () => {
  // `media` refs point at one site's content. A theme ships in the package and cannot know what is
  // in anybody's Media Library, so the kind is meaningless here.
  for (const theme of UMBRADESKTOP_THEMES) {
    expect(theme.wallpaper?.kind, `theme '${theme.id}'`).to.not.equal('media');
  }
});

/** Stands in for whatever the user is looking at now. */
const CURRENT = { url: '/current.thumb.avif', averageColour: '#123456' };

it('previews the current wallpaper under every theme while the toggle is off', () => {
  // Off, nothing a theme declares matters: clicking any of them leaves the wallpaper alone, so a
  // preview showing that theme's own wallpaper would be advertising something that will not happen.
  for (const theme of UMBRADESKTOP_THEMES) {
    expect(previewWallpaper(theme, CURRENT, false), `theme '${theme.id}'`).to.deep.equal(CURRENT);
  }
});

it("previews each theme's own wallpaper while the toggle is on", () => {
  const macos = UMBRADESKTOP_THEMES.find((theme) => theme.id === 'macos')!;

  const preview = previewWallpaper(macos, CURRENT, true);

  expect(preview.url).to.contain('first-light');
  expect(preview.averageColour).to.equal('#873eab');
});

it('previews a thumbnail rather than the full-size image', () => {
  const win11 = UMBRADESKTOP_THEMES.find((theme) => theme.id === 'win11')!;

  // Five previews paint at once and each is a few hundred pixels wide. The thumbnails are roughly
  // a fifth of the bytes, and nothing at this size can tell the difference.
  expect(previewWallpaper(win11, CURRENT, true).url).to.contain('.thumb.avif');
});

it("previews a 'none' theme as its own ground, not as the current wallpaper", () => {
  const win98 = UMBRADESKTOP_THEMES.find((theme) => theme.id === 'win98')!;

  // Windows 98's match clears the image, so its preview has to show bare teal — otherwise the one
  // theme whose wallpaper is "nothing" is the one theme whose preview lies about what it will do.
  expect(previewWallpaper(win98, CURRENT, true)).to.deep.equal({ url: null, averageColour: null });
});

it('previews the current wallpaper for a theme that declares nothing, even with the toggle on', () => {
  const silent = { id: 'says-nothing' } as UmbraDesktopTheme;

  // Clicking it would leave the wallpaper alone, so the honest preview is the wallpaper you have.
  expect(previewWallpaper(silent, CURRENT, true)).to.deep.equal(CURRENT);
});
