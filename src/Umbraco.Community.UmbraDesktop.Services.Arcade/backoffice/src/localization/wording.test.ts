import { expect } from '@open-wc/testing';
import en from './en.js';
import nl from './nl.js';

/**
 * The keys whose words are about showing or hiding a player's scores. Design P8: these say
 * "leaderboard", "show" and "hidden", never "private", "public" or "name". Listed rather than
 * guessed, and checked to exist, so renaming one cannot quietly drop it from the test.
 */
const SHOWING_KEYS = [
  'askStanding', 'ask', 'answerShow', 'answerHide', 'hiddenLine', 'showThemLink', 'onlyYou',
  'showScores', 'showScoresHelp', 'fallbackHeadline', 'fallbackText',
] as const;

/**
 * A dictionary value as text. A value may be a function (the plurals), asked here for two.
 * @param value The value.
 * @returns Its text.
 */
const text = (value: unknown): string => (typeof value === 'function' ? String((value as (n: number) => string)(2)) : String(value));

/**
 * Every value of a dictionary, with its key.
 * @param dictionary The area's entries.
 * @returns Key and text pairs.
 */
const entries = (dictionary: Record<string, unknown>) => Object.entries(dictionary).map(([key, value]) => [key, text(value)] as const);

it('never says private or public, in English or in Dutch', () => {
  for (const [key, value] of entries(en.umbraDesktopArcade)) expect(value, key).not.to.match(/\b(private|public|privacy)\b/i);
  for (const [key, value] of entries(nl.umbraDesktopArcade)) expect(value, key).not.to.match(/priv[eé]|privacy|openbaar|publiek/i);
});

it('never says name in the words about showing and hiding scores', () => {
  const english = en.umbraDesktopArcade as Record<string, unknown>;
  const dutch = nl.umbraDesktopArcade as Record<string, unknown>;
  for (const key of SHOWING_KEYS) {
    expect(english, key).to.have.property(key);
    expect(text(english[key]), key).not.to.match(/\bname\b/i);
    expect(text(dutch[key]), key).not.to.match(/\bnaam\b/i);
  }
});
