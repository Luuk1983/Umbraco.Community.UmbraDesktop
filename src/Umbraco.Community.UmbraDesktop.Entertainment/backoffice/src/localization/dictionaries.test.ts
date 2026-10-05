import { expect } from '@open-wc/testing';
import en from './en.js';
import nl from './nl.js';

/**
 * The two dictionaries this package ships, checked against each other and against what the
 * Solitaire elements ask for.
 *
 * A missing key does not fail anywhere else: every element passes an English fallback to
 * `termOrDefault`, so a Dutch backoffice would quietly show English for a key nobody translated.
 * These cases make that a test failure instead.
 */

/** The keys of one culture's area. */
const keys = (dictionary: { umbraDesktopEntertainment: Record<string, unknown> }) =>
  Object.keys(dictionary.umbraDesktopEntertainment).sort();

/**
 * Every key the Solitaire game and its settings modal read, written out rather than scraped from
 * the element sources, which a browser test cannot read. Adding a string to either element means
 * adding it here, which is the point: the list is the checklist for both dictionaries.
 */
const SOLITAIRE_KEYS = [
  'solitaire', 'solitaireNewGame', 'solitaireSettings', 'solitaireScore', 'solitaireTime', 'solitaireMoves',
  'solitaireTable', 'solitaireAutoFinish', 'solitaireWon', 'solitairePlayAgain', 'solitaireSettingsTitle',
  'solitaireGame', 'solitaireDrawOne', 'solitaireDrawThree', 'solitaireDrawNextGame', 'solitaireCardBack',
  'solitaireCardFaces', 'solitaireDone', 'solitaireClose', 'solitaireBackTheme',
  'solitaireBackRabbit', 'solitaireBackCodegarden', 'solitaireBackCodeCabin', 'solitaireBackDutchUmbracoAlliance',
  'solitaireFacesClassic', 'solitaireCardName', 'solitaireFaceDown', 'solitaireRank1', 'solitaireRank11',
  'solitaireRank12', 'solitaireRank13', 'solitaireSuitS', 'solitaireSuitH', 'solitaireSuitD', 'solitaireSuitC',
  'solitaireRule', 'solitaireBonus', 'solitaireLeaderboard', 'solitaireShowLeaderboard',
];

describe('entertainment dictionaries', () => {
  it('translate exactly the same keys in English and Dutch', () => {
    expect(keys(nl)).to.deep.equal(keys(en));
  });

  it('hold every string Solitaire asks for, in both cultures', () => {
    for (const key of SOLITAIRE_KEYS) {
      expect(en.umbraDesktopEntertainment, `en: ${key}`).to.have.property(key);
      expect(nl.umbraDesktopEntertainment, `nl: ${key}`).to.have.property(key);
    }
  });

  /** The card name takes the rank and suit as arguments; a lost placeholder would drop one of them. */
  it('keep both placeholders in the card name', () => {
    for (const dictionary of [en, nl]) {
      const name = String(dictionary.umbraDesktopEntertainment.solitaireCardName);
      expect(name).to.include('{0}');
      expect(name).to.include('{1}');
    }
  });

  /** The bonus line on the Arcade card takes the number as its one argument. */
  it('keep the placeholder in the time bonus line', () => {
    for (const dictionary of [en, nl]) {
      expect(String(dictionary.umbraDesktopEntertainment.solitaireBonus)).to.include('{0}');
    }
  });
});
