import { expect, fixture, html } from '@open-wc/testing';
import { UmbraDesktopSettingsContext } from './settings.context';
import type { UmbraDesktopLocaleSettings, UmbraDesktopWallpaperRef } from './types';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/**
 * What choosing a theme *does*, which is the part of "match the wallpaper to the theme" that is
 * worth testing as behaviour rather than as a pure function.
 *
 * The context is exercised directly on a bare host. It consumes `UMB_CURRENT_USER_CONTEXT` only to
 * learn whose settings to persist, so without one the writes stay in memory and the observable
 * state — the thing the desktop and both pickers actually read — behaves exactly as it does in the
 * backoffice. That is the whole surface these tests care about.
 */

/** Minimal controller host for the context under test. */
class TestHostElement extends UmbLitElement {}
customElements.define('umbradesktop-settings-test-host', TestHostElement);

/**
 * A settings context on a throwaway host.
 * @returns The context, ready to use.
 */
async function contextOnHost(): Promise<UmbraDesktopSettingsContext> {
  const host = await fixture<TestHostElement>(html`<umbradesktop-settings-test-host></umbradesktop-settings-test-host>`);
  return new UmbraDesktopSettingsContext(host);
}

/**
 * The wallpaper reference currently in force.
 *
 * Read by subscribing, because the context publishes through `UmbObjectState` and exposes no
 * getter. The state replays its current value to a new subscriber synchronously, so this returns
 * without waiting.
 * @param context The context to read.
 * @returns The stored wallpaper reference.
 */
function wallpaperOf(context: UmbraDesktopSettingsContext): UmbraDesktopWallpaperRef {
  let ref!: UmbraDesktopWallpaperRef;
  context.settings.subscribe((settings) => (ref = settings.wallpaper)).unsubscribe();
  return ref;
}

/**
 * Whether the wallpaper is currently following the theme.
 * @param context The context to read.
 * @returns The stored preference.
 */
function followsTheme(context: UmbraDesktopSettingsContext): boolean {
  let on!: boolean;
  context.settings.subscribe((settings) => (on = settings.wallpaperFollowsTheme)).unsubscribe();
  return on;
}

it('starts with the wallpaper not following the theme', async () => {
  const context = await contextOnHost();

  expect(followsTheme(context)).to.equal(false);
});

it('leaves the wallpaper alone when changing theme with the toggle off', async () => {
  const context = await contextOnHost();
  const before = wallpaperOf(context);

  context.setTheme('win98');

  expect(wallpaperOf(context)).to.deep.equal(before);
});

it('changes nothing on screen when the toggle goes on', async () => {
  const context = await contextOnHost();

  // Move off the default theme first, so the theme's match and the current wallpaper genuinely
  // differ and "nothing happened" is a real assertion rather than a coincidence.
  context.setTheme('macos');
  const before = wallpaperOf(context);

  context.setWallpaperFollowsTheme(true);

  // Flipping a switch that silently replaces the picture behind you is startling, and the toggle
  // is a statement about what *choosing a theme* will do rather than a command to redecorate now.
  // The wallpaper moves on the next theme click, which is the click that says which one.
  expect(wallpaperOf(context)).to.deep.equal(before);
  expect(followsTheme(context)).to.equal(true);
});

it("applies the theme's wallpaper when the same theme is clicked again", async () => {
  const context = await contextOnHost();
  context.setTheme('macos');
  context.setWallpaperFollowsTheme(true);

  context.setTheme('macos');

  // The deliberate way to apply the match without changing theme, and the reason `setTheme` does
  // not skip an unchanged id.
  expect(wallpaperOf(context)).to.deep.equal({ kind: 'builtin', id: 'first-light' });
});

it('changes the wallpaper with the theme once the toggle is on', async () => {
  const context = await contextOnHost();
  context.setWallpaperFollowsTheme(true);

  context.setTheme('win11');

  expect(wallpaperOf(context)).to.deep.equal({ kind: 'builtin', id: 'cobalt-beacon' });
});

it("clears the image for a theme whose own ground is the wallpaper", async () => {
  const context = await contextOnHost();
  context.setWallpaperFollowsTheme(true);

  context.setTheme('win98');

  // Not "left alone": Windows 98's flat teal is the authentic desktop, so its match has to take
  // an image off rather than leave one sitting there.
  expect(wallpaperOf(context)).to.deep.equal({ kind: 'none' });
});

it('turns the toggle off when a wallpaper is chosen by hand, and keeps that wallpaper', async () => {
  const context = await contextOnHost();
  context.setWallpaperFollowsTheme(true);

  context.setWallpaper({ kind: 'builtin', id: 'ember-glow' });

  expect(followsTheme(context)).to.equal(false);
  expect(wallpaperOf(context)).to.deep.equal({ kind: 'builtin', id: 'ember-glow' });
});

it('stops following the theme once a wallpaper has been chosen by hand', async () => {
  const context = await contextOnHost();
  context.setWallpaperFollowsTheme(true);
  context.setWallpaper({ kind: 'builtin', id: 'ember-glow' });

  context.setTheme('win98');

  expect(wallpaperOf(context)).to.deep.equal({ kind: 'builtin', id: 'ember-glow' });
});

it('leaves the wallpaper where it is when the toggle goes off', async () => {
  const context = await contextOnHost();
  context.setWallpaperFollowsTheme(true);
  context.setTheme('win11');

  context.setWallpaperFollowsTheme(false);

  // Turning it off is not an undo. The wallpaper on screen is the one the user keeps; it just
  // stops moving with the theme from here.
  expect(wallpaperOf(context)).to.deep.equal({ kind: 'builtin', id: 'cobalt-beacon' });
  expect(followsTheme(context)).to.equal(false);
});

it('repaints the wallpaper the desktop reads, not just the stored preference', async () => {
  const context = await contextOnHost();
  context.setWallpaperFollowsTheme(true);

  context.setTheme('win11');

  // The desktop paints from the resolved view rather than from the settings, so a theme change
  // that updated only the preference would persist correctly and change nothing on screen.
  let url: string | null = null;
  context.wallpaper.subscribe((view) => (url = view.background.url)).unsubscribe();
  expect(url).to.contain('cobalt-beacon');
});

/**
 * The locale preference currently in force.
 *
 * Read by subscribing for the same reason `wallpaperOf` is: the context publishes through
 * `UmbObjectState` and exposes no getter, and the state replays its current value synchronously to
 * a new subscriber.
 * @param context The context to read.
 * @returns The stored locale preference.
 */
function localeOf(context: UmbraDesktopSettingsContext): UmbraDesktopLocaleSettings {
  let locale!: UmbraDesktopLocaleSettings;
  context.settings.subscribe((settings) => (locale = settings.locale)).unsubscribe();
  return locale;
}

it('starts on the backoffice culture with an automatic clock', async () => {
  const context = await contextOnHost();

  expect(localeOf(context)).to.deep.equal({ source: 'backoffice', hourCycle: 'auto' });
});

it('changes the format source and the clock override independently', async () => {
  // Two setters rather than one: they are two separate choices on one screen, and a combined setter
  // would make every caller pass the field it is not changing.
  const context = await contextOnHost();

  context.setLocaleSource('browser');
  expect(localeOf(context)).to.deep.equal({ source: 'browser', hourCycle: 'auto' });

  context.setClockHourCycle('h23');
  expect(localeOf(context)).to.deep.equal({ source: 'browser', hourCycle: 'h23' });
});
