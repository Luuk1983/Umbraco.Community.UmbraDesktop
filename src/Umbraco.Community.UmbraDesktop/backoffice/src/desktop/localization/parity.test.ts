import { expect } from '@open-wc/testing';
import en from './en';
import nl from './nl';

/**
 * The one section both files carry. Reaching into it by name rather than iterating keeps the
 * test honest if either file ever grows a second section.
 */
const SECTION = 'umbraDesktop';

function keysOf(set: unknown): string[] {
  const section = (set as Record<string, Record<string, unknown>>)[SECTION];
  expect(section, `the '${SECTION}' section`).to.be.an('object');
  return Object.keys(section).sort();
}

describe('localization parity', () => {
  it('translates every English key into Dutch, and adds none the English set lacks', () => {
    // Both files are hand-maintained, so a key added to one and forgotten in the other renders
    // as its raw token in the backoffice. That is the failure this test exists to catch.
    expect(keysOf(nl)).to.deep.equal(keysOf(en));
  });

  it('leaves no term empty in either language', () => {
    for (const [language, set] of [
      ['en', en],
      ['nl', nl],
    ] as const) {
      const section = (set as Record<string, Record<string, unknown>>)[SECTION];
      for (const [key, value] of Object.entries(section)) {
        if (typeof value !== 'string') continue;
        expect(value.trim(), `${language}.${key}`).to.not.equal('');
      }
    }
  });

  it('keeps the same token placeholders in both languages', () => {
    // A term taking %0% in English but not in Dutch silently drops the value it was meant to show.
    const enSection = (en as Record<string, Record<string, unknown>>)[SECTION];
    const nlSection = (nl as Record<string, Record<string, unknown>>)[SECTION];
    const tokens = (value: unknown) =>
      typeof value === 'string' ? (value.match(/%\d+%/g) ?? []).sort() : [];

    for (const key of Object.keys(enSection)) {
      expect(tokens(nlSection[key]), `tokens in '${key}'`).to.deep.equal(tokens(enSection[key]));
    }
  });
});
