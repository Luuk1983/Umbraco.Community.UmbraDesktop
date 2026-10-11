import { expect } from '@open-wc/testing';
import { backImageFor } from './extensions.js';
import { BACK_BASE_URL, backManifests, THEME_BACK_ALIAS } from './backs.js';

describe('solitaire extensions', () => {
  it('uses a plain image under every theme', () => {
    expect(backImageFor('/x.avif', 'win98')).to.equal('/x.avif');
    expect(backImageFor('/x.avif', undefined)).to.equal('/x.avif');
  });

  it('picks the theme image, and the fallback for a theme it does not know', () => {
    const image = { byTheme: { win98: '/98.svg' }, fallback: '/default.avif' };
    expect(backImageFor(image, 'win98')).to.equal('/98.svg');
    expect(backImageFor(image, 'a-sixth-theme')).to.equal('/default.avif');
    expect(backImageFor(image, undefined)).to.equal('/default.avif');
  });

  it('keeps the five per-theme backs as Match theme images only', () => {
    const theme = backManifests[0].meta.image;
    for (const id of ['umbraco', 'umbraco4', 'macos', 'win11', 'win98']) {
      expect(backImageFor(theme, id).startsWith(BACK_BASE_URL), id).to.equal(true);
    }
    expect(backImageFor(theme, 'win98').endsWith('win98.svg')).to.equal(true);
    expect(backManifests.some((m) => /\.(umbraco4?|macos|win11|win98)$/.test(m.alias))).to.equal(false);
  });

  it('draws the original backs the same under every theme', () => {
    for (const m of backManifests.slice(1)) {
      expect(typeof m.meta.image, m.alias).to.equal('string');
      expect((m.meta.image as string).startsWith(BACK_BASE_URL)).to.equal(true);
    }
  });

  it('registers Match theme first, then only the original backs', () => {
    expect(backManifests[0].alias).to.equal(THEME_BACK_ALIAS);
    expect(backManifests.length).to.equal(5);
    expect(backManifests.slice(1).map((m) => m.alias.split('.').pop())).to.deep.equal(['Rabbit', 'Codegarden', 'CodeCabin', 'DutchUmbracoAlliance']);
    const weights = backManifests.map((m) => m.weight ?? 0);
    expect([...weights].sort((a, b) => b - a)).to.deep.equal(weights);
    expect(new Set(weights).size).to.equal(weights.length);
  });
});
