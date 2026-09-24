import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS,
  parseSaveSettings,
  saveSettingsStorageKey,
  serializeSaveSettings,
} from './save-settings.js';

/**
 * Where Notepad and Paint save by default, as pure functions over the stored string, so the fallback
 * for every kind of bad payload is testable without storage.
 */

it('saves to this computer until someone chooses otherwise', () => {
  expect(parseSaveSettings(null)).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS);
  expect(UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS.destination).to.equal('computer');
});

it('round-trips a media library choice with its folder', () => {
  const settings = { destination: 'media', folder: { unique: 'abc', name: 'Notes' } } as const;
  expect(parseSaveSettings(serializeSaveSettings(settings))).to.deep.equal(settings);
});

it('treats a missing folder as the media library root', () => {
  expect(parseSaveSettings(JSON.stringify({ destination: 'media' }))).to.deep.equal({
    destination: 'media',
    folder: null,
  });
});

/**
 * A payload this version cannot read falls back to the default rather than throwing: a settings
 * store that throws takes Notepad's Save button down with it, and saving to the computer is the one
 * destination that always works.
 */
it('falls back to the default for anything it cannot read', () => {
  for (const raw of ['not json', '42', '{"destination":"cloud"}', '{"destination":"media","folder":{"unique":7}}']) {
    const parsed = parseSaveSettings(raw);
    if (raw.includes('"media"')) expect(parsed, raw).to.deep.equal({ destination: 'media', folder: null });
    else expect(parsed, raw).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SAVE_SETTINGS);
  }
});

it('keeps each user’s choice under their own key', () => {
  expect(saveSettingsStorageKey('user-1')).to.not.equal(saveSettingsStorageKey('user-2'));
  expect(saveSettingsStorageKey('user-1')).to.contain('user-1');
});
