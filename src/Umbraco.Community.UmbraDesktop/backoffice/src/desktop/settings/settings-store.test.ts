import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_DEFAULT_PINNED,
  UMBRADESKTOP_DEFAULT_SETTINGS,
  parseSettings,
  serialiseSettings,
  settingsStorageKey,
} from './settings-store';
import type { UmbraDesktopSettings } from './types';

it('scopes the storage key to the user, so two accounts on one machine do not collide', () => {
  expect(settingsStorageKey('abc-123')).to.equal('umbradesktop:settings:abc-123');
  expect(settingsStorageKey('abc-123')).to.not.equal(settingsStorageKey('def-456'));
});

it('defaults to the built-in wallpaper when nothing is stored', () => {
  expect(parseSettings(null)).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
});

it('round-trips settings through serialise and parse', () => {
  const settings: UmbraDesktopSettings = {
    v: 1,
    wallpaper: { kind: 'media', unique: 'a-guid' },
    theme: UMBRADESKTOP_DEFAULT_SETTINGS.theme,
    pinned: ['content'],
    bootIntoDesktop: true,
    taskbarFeatures: { 'ai-chat': false },
    wallpaperFollowsTheme: true,
    locale: { source: 'browser', hourCycle: 'h23' },
  };
  expect(parseSettings(serialiseSettings(settings))).to.deep.equal(settings);
});

it('reads back each wallpaper kind unchanged', () => {
  for (const wallpaper of [
    { kind: 'none' },
    { kind: 'builtin', id: 'golden-valley' },
    { kind: 'media', unique: 'a-guid' },
  ] as const) {
    expect(
      parseSettings(
        serialiseSettings({
          v: 1,
          wallpaper,
          theme: UMBRADESKTOP_DEFAULT_SETTINGS.theme,
          pinned: [],
          bootIntoDesktop: false,
          taskbarFeatures: {},
          wallpaperFollowsTheme: false,
          locale: { source: 'backoffice', hourCycle: 'auto' },
        }),
      )
        .wallpaper,
    ).to.deep.equal(wallpaper);
  }
});

it('falls back to the default when the stored JSON is malformed', () => {
  expect(parseSettings('{ not json')).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
});

it('falls back to the default when the payload is not an object', () => {
  expect(parseSettings('"a string"')).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
  expect(parseSettings('null')).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
});

it('falls back to the default when the payload version is unrecognised', () => {
  expect(parseSettings('{"v":2,"wallpaper":{"kind":"none"}}')).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
});

it('falls back to the default when the wallpaper kind is unknown', () => {
  expect(parseSettings('{"v":1,"wallpaper":{"kind":"video","url":"x"}}')).to.deep.equal(
    UMBRADESKTOP_DEFAULT_SETTINGS,
  );
});

it('falls back to the default when a wallpaper ref is missing its identifier', () => {
  expect(parseSettings('{"v":1,"wallpaper":{"kind":"builtin"}}')).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
  expect(parseSettings('{"v":1,"wallpaper":{"kind":"media"}}')).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
});

it('never returns the shared default instance, so a caller cannot mutate it', () => {
  const parsed = parseSettings(null);
  expect(parsed).to.not.equal(UMBRADESKTOP_DEFAULT_SETTINGS);
  expect(parsed.wallpaper).to.not.equal(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper);
});

it('defaults to the seeded favourites when nothing is stored', () => {
  expect(parseSettings(null).pinned).to.deep.equal(UMBRADESKTOP_DEFAULT_PINNED);
});

it('round-trips a pinned list', () => {
  const settings: UmbraDesktopSettings = {
    v: 1,
    wallpaper: { kind: 'none' },
    theme: UMBRADESKTOP_DEFAULT_SETTINGS.theme,
    pinned: ['media', 'content'],
    bootIntoDesktop: false,
    taskbarFeatures: {},
    wallpaperFollowsTheme: false,
    locale: { source: 'backoffice', hourCycle: 'auto' },
  };
  expect(parseSettings(serialiseSettings(settings))).to.deep.equal(settings);
});

it('keeps an empty pinned list rather than re-seeding it', () => {
  // Unpinning everything is a deliberate choice; the seed applies only when nothing is stored.
  expect(parseSettings('{"v":1,"wallpaper":{"kind":"none"},"pinned":[]}').pinned).to.deep.equal([]);
});

it('falls back to the seeded favourites when the stored pinned list is not an array of strings', () => {
  expect(parseSettings('{"v":1,"wallpaper":{"kind":"none"},"pinned":"content"}').pinned).to.deep.equal(
    UMBRADESKTOP_DEFAULT_PINNED,
  );
  expect(parseSettings('{"v":1,"wallpaper":{"kind":"none"},"pinned":[1,2]}').pinned).to.deep.equal(
    UMBRADESKTOP_DEFAULT_PINNED,
  );
});

it('recovers each field independently, so one bad field does not discard the other', () => {
  const parsed = parseSettings('{"v":1,"wallpaper":{"kind":"video"},"pinned":["media"]}');
  expect(parsed.pinned).to.deep.equal(['media']);
  expect(parsed.wallpaper).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper);
});

it('never returns the shared default pinned array, so a caller cannot mutate it', () => {
  expect(parseSettings(null).pinned).to.not.equal(UMBRADESKTOP_DEFAULT_PINNED);
});

it('defaults the theme when a stored payload predates theming', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: ['content'] }));
  expect(settings.theme).to.equal(UMBRADESKTOP_DEFAULT_SETTINGS.theme);
  // The pre-theming fields survive untouched — the point of recovering fields independently.
  expect(settings.wallpaper).to.deep.equal({ kind: 'none' });
  expect(settings.pinned).to.deep.equal(['content']);
});

it('keeps a stored theme id', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: [], theme: 'macos' }));
  expect(settings.theme).to.equal('macos');
});

it('discards a malformed theme id without costing the user their wallpaper or pins', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: ['media'], theme: 42 }));
  expect(settings.theme).to.equal(UMBRADESKTOP_DEFAULT_SETTINGS.theme);
  expect(settings.wallpaper).to.deep.equal({ kind: 'none' });
  expect(settings.pinned).to.deep.equal(['media']);
});

it('round-trips a theme through serialise and parse', () => {
  const settings = { ...UMBRADESKTOP_DEFAULT_SETTINGS, theme: 'macos' };
  expect(parseSettings(serialiseSettings(settings)).theme).to.equal('macos');
});

it('keeps a stored theme even when the wallpaper beside it is unreadable', () => {
  // The converse of the case above, and the half that is easy to lose: field recovery has to run
  // both ways, or choosing a theme could be undone by an unrelated wallpaper written by a build
  // that understood a shape this one does not.
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'holograph' }, pinned: [], theme: 'macos' }));
  expect(settings.theme).to.equal('macos');
  expect(settings.wallpaper).to.deep.equal(UMBRADESKTOP_DEFAULT_SETTINGS.wallpaper);
});

it('rejects an empty theme id, so corruption takes the default rather than an unmatchable value', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: [], theme: '' }));
  expect(settings.theme).to.equal(UMBRADESKTOP_DEFAULT_SETTINGS.theme);
});

it('defaults the boot preference off when nothing is stored', () => {
  expect(parseSettings(null).bootIntoDesktop).to.equal(false);
});

it('keeps a stored boot preference', () => {
  expect(parseSettings(JSON.stringify({ v: 1, bootIntoDesktop: true })).bootIntoDesktop).to.equal(true);
});

it('defaults the boot preference when a stored payload predates it', () => {
  const settings = parseSettings(
    JSON.stringify({ v: 1, wallpaper: { kind: 'builtin', id: 'golden-valley' }, pinned: ['content'], theme: 'win98' }),
  );
  expect(settings.bootIntoDesktop).to.equal(false);
  // Why the payload version stays at 1: everything chosen before this field existed survives.
  expect(settings.wallpaper).to.deep.equal({ kind: 'builtin', id: 'golden-valley' });
  expect(settings.pinned).to.deep.equal(['content']);
  expect(settings.theme).to.equal('win98');
});

it('ignores a boot preference that is not a boolean', () => {
  expect(parseSettings(JSON.stringify({ v: 1, bootIntoDesktop: 'yes' })).bootIntoDesktop).to.equal(false);
  expect(parseSettings(JSON.stringify({ v: 1, bootIntoDesktop: 1 })).bootIntoDesktop).to.equal(false);
});

it('defaults the taskbar features to an empty map, so every feature takes its own default', () => {
  // Empty rather than pre-filled with every shipped feature's default. A payload that names each
  // feature would freeze the shell's defaults into storage on first boot, and a feature added in a
  // later release would then be indistinguishable from one the user had switched off.
  expect(parseSettings(null).taskbarFeatures).to.deep.equal({});
});

it('keeps a stored taskbar feature choice', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, taskbarFeatures: { 'ai-chat': false } }));
  expect(settings.taskbarFeatures).to.deep.equal({ 'ai-chat': false });
});

it('keeps a feature id it has never heard of, so downgrading does not discard an upgrade', () => {
  // The map is read against the registry, which drops anything it cannot match. Discarding it here
  // instead would mean running an older build once silently resets the newer build's features.
  const settings = parseSettings(JSON.stringify({ v: 1, taskbarFeatures: { 'from-the-future': true } }));
  expect(settings.taskbarFeatures).to.deep.equal({ 'from-the-future': true });
});

it('ignores a taskbar feature map that is not an object of booleans', () => {
  expect(parseSettings(JSON.stringify({ v: 1, taskbarFeatures: ['ai-chat'] })).taskbarFeatures).to.deep.equal({});
  expect(parseSettings(JSON.stringify({ v: 1, taskbarFeatures: { 'ai-chat': 'off' } })).taskbarFeatures).to.deep.equal(
    {},
  );
  expect(parseSettings(JSON.stringify({ v: 1, taskbarFeatures: null })).taskbarFeatures).to.deep.equal({});
});

it('defaults the taskbar features when a stored payload predates them, keeping everything else', () => {
  const settings = parseSettings(
    JSON.stringify({ v: 1, wallpaper: { kind: 'none' }, pinned: ['content'], theme: 'win98', bootIntoDesktop: true }),
  );
  expect(settings.taskbarFeatures).to.deep.equal({});
  expect(settings.pinned).to.deep.equal(['content']);
  expect(settings.theme).to.equal('win98');
  expect(settings.bootIntoDesktop).to.equal(true);
});

it('defaults the wallpaper-follows-theme preference off when nothing is stored', () => {
  // Off by default because turning it on replaces a wallpaper the user may have chosen, and a
  // setting that redecorates somebody's desktop on upgrade is not one that should arrive switched on.
  expect(parseSettings(null).wallpaperFollowsTheme).to.equal(false);
});

it('keeps a stored wallpaper-follows-theme preference', () => {
  expect(parseSettings(JSON.stringify({ v: 1, wallpaperFollowsTheme: true })).wallpaperFollowsTheme).to.equal(true);
});

it('defaults wallpaper-follows-theme when a stored payload predates it', () => {
  const settings = parseSettings(
    JSON.stringify({
      v: 1,
      wallpaper: { kind: 'builtin', id: 'golden-valley' },
      pinned: ['content'],
      theme: 'win98',
      bootIntoDesktop: true,
    }),
  );
  expect(settings.wallpaperFollowsTheme).to.equal(false);
  // Again the reason the payload version stays at 1: a payload written before this field existed
  // reads back with everything its author actually chose still intact.
  expect(settings.wallpaper).to.deep.equal({ kind: 'builtin', id: 'golden-valley' });
  expect(settings.pinned).to.deep.equal(['content']);
  expect(settings.theme).to.equal('win98');
  expect(settings.bootIntoDesktop).to.equal(true);
});

it('never returns the shared default feature map, so a caller cannot mutate it', () => {
  const first = parseSettings(null);
  first.taskbarFeatures['ai-chat'] = false;
  expect(parseSettings(null).taskbarFeatures).to.deep.equal({});
});

it('ignores a wallpaper-follows-theme preference that is not a boolean', () => {
  expect(parseSettings(JSON.stringify({ v: 1, wallpaperFollowsTheme: 'yes' })).wallpaperFollowsTheme).to.equal(false);
  expect(parseSettings(JSON.stringify({ v: 1, wallpaperFollowsTheme: 1 })).wallpaperFollowsTheme).to.equal(false);
});

it('defaults locale to the backoffice culture on an automatic clock', () => {
  // The backoffice rather than the browser, because Umbraco itself formats every date it renders
  // with the backoffice culture. A taskbar reading the browser was the one thing on screen
  // answering to nobody.
  expect(parseSettings(null).locale).to.deep.equal({ source: 'backoffice', hourCycle: 'auto' });
});

it('takes the locale default from a payload written before the field existed', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, theme: 'macos' }));
  expect(settings.theme).to.equal('macos');
  expect(settings.locale).to.deep.equal({ source: 'backoffice', hourCycle: 'auto' });
});

it('reads a stored locale back', () => {
  const settings = parseSettings(JSON.stringify({ v: 1, locale: { source: 'browser', hourCycle: 'h23' } }));
  expect(settings.locale).to.deep.equal({ source: 'browser', hourCycle: 'h23' });
});

it('recovers each locale field on its own', () => {
  // A value written by a later build must not also cost the user the other field, the way the
  // wallpaper and the theme recover separately at the top level.
  const settings = parseSettings(JSON.stringify({ v: 1, locale: { source: 'nonsense', hourCycle: 'h12' } }));
  expect(settings.locale).to.deep.equal({ source: 'backoffice', hourCycle: 'h12' });
});

it('takes both locale defaults when the field is not an object', () => {
  expect(parseSettings(JSON.stringify({ v: 1, locale: 'h23' })).locale).to.deep.equal({
    source: 'backoffice',
    hourCycle: 'auto',
  });
});

it('never returns the shared default locale, so a caller cannot mutate it', () => {
  const first = parseSettings(null);
  first.locale.hourCycle = 'h12';
  expect(parseSettings(null).locale.hourCycle).to.equal('auto');
});
