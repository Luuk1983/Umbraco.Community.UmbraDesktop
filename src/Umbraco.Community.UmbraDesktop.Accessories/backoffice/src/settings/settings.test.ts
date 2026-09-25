import { expect } from '@open-wc/testing';
import {
  UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS,
  UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES,
  parseSettings,
  serializeSettings,
  settingsStorageKey,
} from './settings.js';

/**
 * The Accessories package's settings, as pure functions over the stored string, so the fallback for
 * every kind of bad payload is testable without storage. One setting today: the screensaver.
 */

const DEFAULT_SCREENSAVER = UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS.screensaver;

it('has the defaults when nothing is stored', () => {
  expect(parseSettings(null)).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS);
});

/**
 * Off until somebody turns it on. Something that covers the whole backoffice without being asked
 * would read as a fault the first time it happened after an upgrade.
 */
it('has the screensaver off until someone turns it on', () => {
  expect(DEFAULT_SCREENSAVER.enabled).to.equal(false);
  expect(DEFAULT_SCREENSAVER.saver).to.equal('starfield');
  expect(UMBRADESKTOP_SCREENSAVER_WAIT_CHOICES).to.include(DEFAULT_SCREENSAVER.waitMinutes);
});

it('round-trips a chosen screensaver', () => {
  const settings = {
    screensaver: { enabled: true, saver: 'mystify', waitMinutes: 5 },
  } as const;
  expect(parseSettings(serializeSettings(settings))).to.deep.equal(settings);
});

/**
 * Earlier versions stored a save folder, and one before that a destination. Notepad and Paint now ask
 * where on the first save, so both are ignored, and the screensaver stored beside them is kept.
 */
it('ignores the save folder an earlier version stored, and keeps the screensaver beside it', () => {
  const screensaver = { enabled: true, saver: 'flying', waitMinutes: 2 };
  expect(
    parseSettings(JSON.stringify({ destination: 'computer', folder: { unique: 'f', name: 'Old' }, screensaver })),
  ).to.deep.equal({ screensaver });
});

it('falls back field by field for anything it cannot read', () => {
  for (const raw of ['not json', '42', '{"screensaver":7}', '{"screensaver":"on"}']) {
    expect(parseSettings(raw), raw).to.deep.equal(UMBRADESKTOP_ACCESSORIES_DEFAULT_SETTINGS);
  }
  expect(
    parseSettings(JSON.stringify({ screensaver: { enabled: 'yes', saver: 'pipes', waitMinutes: 7 } })).screensaver,
    'an unknown saver and a wait that is not on offer fall back, a real boolean is required',
  ).to.deep.equal(DEFAULT_SCREENSAVER);
  expect(
    parseSettings(JSON.stringify({ screensaver: { enabled: true } })).screensaver,
    'a partial screensaver keeps what it has',
  ).to.deep.equal({ ...DEFAULT_SCREENSAVER, enabled: true });
});

it('keeps each user’s choice under their own key', () => {
  expect(settingsStorageKey('user-1')).to.not.equal(settingsStorageKey('user-2'));
  expect(settingsStorageKey('user-1')).to.contain('user-1');
});
