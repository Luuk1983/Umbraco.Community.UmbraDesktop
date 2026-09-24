import { expect } from '@open-wc/testing';
import en from './en.js';
import nl from './nl.js';

/**
 * Both dictionaries are hand-maintained, so a key added to one and forgotten in the other renders as
 * its English fallback in Dutch, or as a raw token where there is no fallback, such as a tile label.
 */
it('translates every English key into Dutch, and adds none the English set lacks', () => {
  expect(Object.keys(nl.umbraDesktopAccessories).sort()).to.deep.equal(
    Object.keys(en.umbraDesktopAccessories).sort(),
  );
});
