import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS,
  parseSaveSettings,
  saveSettingsStorageKey,
  serializeSaveSettings,
} from './save-settings.js';

/**
 * Which media folder a new Notepad or Paint file is saved into, as pure functions over the stored
 * string, so the fallback for every kind of bad payload is testable without storage.
 */

it('saves new files to the media library root until someone chooses a folder', () => {
  expect(parseSaveSettings(null)).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS);
  expect(UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS.folder).to.equal(null);
});

it('round-trips a chosen folder', () => {
  const settings = { folder: { unique: 'abc', name: 'Notes' } };
  expect(parseSaveSettings(serializeSaveSettings(settings))).to.deep.equal(settings);
});

/**
 * The previous version stored a destination beside the folder. The folder is still what it means,
 * so it is kept; the destination no longer exists and is dropped.
 */
it('keeps the folder from a setting saved by the previous version', () => {
  expect(parseSaveSettings(JSON.stringify({ destination: 'computer', folder: { unique: 'f', name: 'Old' } }))).to.deep.equal({
    folder: { unique: 'f', name: 'Old' },
  });
});

it('falls back to the root for anything it cannot read', () => {
  for (const raw of ['not json', '42', '{"folder":{"unique":7}}', '{"folder":"notes"}']) {
    expect(parseSaveSettings(raw), raw).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS);
  }
});

it('keeps each user’s choice under their own key', () => {
  expect(saveSettingsStorageKey('user-1')).to.not.equal(saveSettingsStorageKey('user-2'));
  expect(saveSettingsStorageKey('user-1')).to.contain('user-1');
});
