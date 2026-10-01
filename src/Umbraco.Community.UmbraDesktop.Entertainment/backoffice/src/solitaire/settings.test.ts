import { expect } from '@open-wc/testing';
import { DEFAULT_SETTINGS, SETTINGS_KEY, readSettings, writeSettings } from './settings.js';
import { MemoryStorage } from './memory-storage.test-helper.js';

describe('solitaire settings', () => {
  it('reads the defaults when nothing is stored', () => {
    expect(readSettings(() => new MemoryStorage())).to.deep.equal(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.drawCount).to.equal(1);
  });

  it('round-trips what was written', () => {
    const storage = new MemoryStorage();
    writeSettings({ drawCount: 3, back: 'x', faces: 'y' }, () => storage);
    expect(readSettings(() => storage)).to.deep.equal({ drawCount: 3, back: 'x', faces: 'y' });
  });

  it('repairs a bad value field by field', () => {
    const storage = new MemoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({ drawCount: 2, back: 7 }));
    expect(readSettings(() => storage)).to.deep.equal(DEFAULT_SETTINGS);
    storage.setItem(SETTINGS_KEY, '{not json');
    expect(readSettings(() => storage)).to.deep.equal(DEFAULT_SETTINGS);
  });

  it('survives storage that throws', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    expect(readSettings(blocked)).to.deep.equal(DEFAULT_SETTINGS);
    writeSettings(DEFAULT_SETTINGS, blocked);
  });
});
