import { expect } from '@open-wc/testing';
import { formatScore } from './format.js';

it('shows points as a whole number', () => {
  expect(formatScore('points', 1250, 'en-US')).to.equal('1,250');
});

it('shows a time under a minute as seconds to one decimal', () => {
  expect(formatScore('time', 9_430, 'en-US')).to.equal('9.4');
});

it('shows a time of a minute or more as m:ss', () => {
  expect(formatScore('time', 102_900, 'en-US')).to.equal('1:42');
});

it('follows the locale for the decimal mark', () => {
  expect(formatScore('time', 9_430, 'nl-NL')).to.equal('9,4');
});
