import { expect } from '@open-wc/testing';
import { isNewcomer } from './detection';

/**
 * Who sees the welcome wizard: the table in the design doc, §5, one row per test.
 *
 * New means the account answered and holds no desktop settings, and this browser holds none either.
 * Everything else is somebody who has used the desktop, or somebody whose account the wizard could
 * not mark as finished, which would bring it back on every load.
 */

it('does not welcome an account that has settings, whatever this browser holds', () => {
  expect(isNewcomer({ account: 'present', source: 'server' })).to.equal(false);
});

it('does not welcome an empty account when this browser has settings, because migration is about to move them', () => {
  expect(isNewcomer({ account: 'empty', source: 'cache' })).to.equal(false);
});

it('welcomes an empty account with nothing in this browser', () => {
  expect(isNewcomer({ account: 'empty', source: 'defaults' })).to.equal(true);
});

it('does not welcome anybody whose account cannot be reached, with a cache', () => {
  expect(isNewcomer({ account: 'unreachable', source: 'cache' })).to.equal(false);
});

it('does not welcome anybody whose account cannot be reached, without a cache', () => {
  expect(isNewcomer({ account: 'unreachable', source: 'defaults' })).to.equal(false);
});
