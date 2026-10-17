import { expect } from '@open-wc/testing';
import en from './en.js';
import nl from './nl.js';

/**
 * Both dictionaries are hand-maintained, so a key added to one and forgotten in the other renders as
 * its English fallback in Dutch.
 */
it('translates every English key into Dutch, and adds none the English set lacks', () => {
  expect(Object.keys(nl.umbraDesktopServicesMedia).sort()).to.deep.equal(Object.keys(en.umbraDesktopServicesMedia).sort());
});

/** The overwrite question moved here from Accessories with its words unchanged. */
it('asks the overwrite question in the words Notepad and Paint always used', () => {
  const { overwriteHeadline, overwriteQuestion, overwriteConfirm } = en.umbraDesktopServicesMedia;
  expect({ overwriteHeadline, overwriteQuestion, overwriteConfirm }).to.deep.equal({
    overwriteHeadline: 'Overwrite %0%?',
    overwriteQuestion: '%0% was changed in the media library after you opened it. Overwrite it with your version?',
    overwriteConfirm: 'Overwrite',
  });
});
