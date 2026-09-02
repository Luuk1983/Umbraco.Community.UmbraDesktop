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
    pinned: ['content'],
  };
  expect(parseSettings(serialiseSettings(settings))).to.deep.equal(settings);
});

it('reads back each wallpaper kind unchanged', () => {
  for (const wallpaper of [
    { kind: 'none' },
    { kind: 'builtin', id: 'golden-valley' },
    { kind: 'media', unique: 'a-guid' },
  ] as const) {
    expect(parseSettings(serialiseSettings({ v: 1, wallpaper, pinned: [] })).wallpaper).to.deep.equal(wallpaper);
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
  const settings: UmbraDesktopSettings = { v: 1, wallpaper: { kind: 'none' }, pinned: ['media', 'content'] };
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
