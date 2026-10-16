import { expect } from '@open-wc/testing';
import { chaseText, fill, ordinalCategory, rankText, ruleText, say, scoreText, unitText } from './phrases.js';

/** A localizer with no dictionary, so every phrase falls back to its English, as when the dictionary fails to load. */
const english = { termOrDefault: (_key: string, fallback: string) => fallback, lang: () => 'en-US', string: (text: string) => text } as never;

it('fills numbered placeholders and leaves unknown ones', () => {
  expect(fill('{0} behind {1}', ['3.0 sec', 'Bram'])).to.equal('3.0 sec behind Bram');
  expect(fill('{0} and {2}', ['a'])).to.equal('a and {2}');
});

it('says the English with its placeholders filled when the dictionary has no entry', () => {
  expect(say(english, 'chase', '{0} behind {1}', '3.0 sec', 'Bram')).to.equal('3.0 sec behind Bram');
});

it('words English ranks as ordinals', () => {
  const ranks = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map((rank) => rankText(english, rank));
  expect(ranks).to.deep.equal(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st']);
});

it('words ranks by the English rules when a language has no Arcade dictionary, so German gets no "2th"', () => {
  /** A German backoffice, with nothing of the Arcade's in its dictionary. */
  const german = { termOrDefault: (_key: string, fallback: string) => fallback, lang: () => 'de-DE', string: (text: string) => text } as never;
  expect([1, 2, 3, 4].map((rank) => rankText(german, rank))).to.deep.equal(['1st', '2nd', '3rd', '4th']);
});

it('puts every Dutch rank in one ordinal category, which nl.ts words as "{0}e"', () => {
  expect([1, 2, 3, 8].map((rank) => ordinalCategory(rank, 'nl-NL'))).to.deep.equal(['other', 'other', 'other', 'other']);
});

it('derives the rule from a board, and lets a game say its own', () => {
  expect(ruleText(english, { better: 'lower', format: 'time' })).to.equal('Fastest time wins');
  expect(ruleText(english, { better: 'higher', format: 'points' })).to.equal('Highest score wins');
  expect(ruleText(english, { better: 'lower', format: 'points' })).to.equal('Lowest score wins');
  expect(ruleText(english, { better: 'higher', format: 'time' })).to.equal('Longest time wins');
  expect(ruleText(english, { better: 'higher', format: 'points' }, 'Highest score wins, time bonus included')).to.equal('Highest score wins, time bonus included');
});

it('gives seconds a unit, m:ss none, and points their word', () => {
  expect(unitText(english, 'time', 38_100)).to.equal('sec');
  expect(unitText(english, 'time', 61_000)).to.equal('');
  expect(unitText(english, 'points', 480)).to.equal('points');
  expect(scoreText(english, 'time', 3_000)).to.equal('3.0 sec');
  expect(scoreText(english, 'points', 1_520)).to.equal('1,520 points');
});

it('names the person to chase and by how much', () => {
  expect(chaseText(english, 'time', 38_100, { displayName: 'Bram', value: 35_100 })).to.equal('3.0 sec behind Bram');
  expect(chaseText(english, 'points', 310, { displayName: 'Bram', value: 450 })).to.equal('140 points behind Bram');
});
