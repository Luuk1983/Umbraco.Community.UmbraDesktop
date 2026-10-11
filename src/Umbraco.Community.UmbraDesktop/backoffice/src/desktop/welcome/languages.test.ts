import { expect } from '@open-wc/testing';
import { desktopTranslates, fallbackExplanation, welcomeLanguages } from './languages';

/**
 * The language page's list (design doc D14): every backoffice language, alphabetical by its own
 * name, and a mark on the ones the desktop is not translated into.
 */

/** Names as the backoffice's own `uiCulture_` dictionary gives them. */
const NAMES: Record<string, string> = {
  de: 'Deutsch',
  'de-de': 'Deutsch (Deutschland)',
  en: 'English (UK)',
  'en-us': 'English (US)',
  es: 'Español',
  nl: 'Nederlands',
  'nl-nl': 'Nederlands (Nederland)',
  ja: '日本語',
};

/**
 * The list for some cultures, with the desktop translated into English and Dutch.
 * @param cultures The backoffice's registered cultures, in any case and order.
 * @returns The rows.
 */
function list(cultures: string[]) {
  return welcomeLanguages(cultures, ['en', 'nl'], (culture) => NAMES[culture] ?? culture);
}

it('sorts by each language\'s own name', () => {
  const rows = list(['nl', 'es', 'en', 'de']);

  expect(rows.map((row) => row.name)).to.deep.equal(['Deutsch', 'English (UK)', 'Español', 'Nederlands']);
});

it('lowercases cultures the way the profile stores them', () => {
  const rows = list(['en-US']);

  expect(rows[0].culture).to.equal('en-us');
});

it('lists a culture once, however often it is registered', () => {
  // Every package that ships a dictionary registers its own manifest for the same culture.
  const rows = list(['nl', 'NL', 'nl']);

  expect(rows.length).to.equal(1);
});

it('marks a language the desktop is not translated into', () => {
  const rows = list(['es', 'de-DE']);

  expect(rows.every((row) => row.desktopInEnglish)).to.equal(true);
});

it('does not mark a language the desktop is translated into', () => {
  const rows = list(['nl', 'en']);

  expect(rows.some((row) => row.desktopInEnglish)).to.equal(false);
});

it('counts a regional culture as translated when the desktop has its language', () => {
  // The backoffice falls back from nl-NL to nl, so the desktop's Dutch reaches a nl-NL user.
  const rows = list(['nl-NL', 'en-US']);

  expect(rows.some((row) => row.desktopInEnglish)).to.equal(false);
});

it('answers for one culture the same way the list does', () => {
  expect(desktopTranslates('nl-nl', ['en', 'nl'])).to.equal(true);
  expect(desktopTranslates('ja', ['en', 'nl'])).to.equal(false);
  expect(desktopTranslates('NL', ['EN', 'NL'])).to.equal(true);
});

it('names the language in the explanation, in the language the wizard is in', () => {
  const explanation = fallbackExplanation('es', 'nl', (key, name) => `${key}:${name}`);

  expect(explanation).to.equal('umbraDesktop_welcomeLanguageFallback:Spaans');
});

it('falls back to the code for a culture the browser cannot name', () => {
  const explanation = fallbackExplanation('xx-not-a-tag-at-all-really', 'en', (_, name) => String(name));

  expect(explanation).to.equal('xx-not-a-tag-at-all-really');
});
