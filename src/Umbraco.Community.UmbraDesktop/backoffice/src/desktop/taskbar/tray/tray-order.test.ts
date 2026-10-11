import { expect } from '@open-wc/testing';
import { nextTrayOrder, trayFlexOrder } from './tray-order.js';

/**
 * Order by appearance (design D14): an item joins at the end furthest from the clock when it becomes
 * visible, keeps its place while it stays visible, and rejoins at the far end after hiding.
 */

it('adds a newly visible item at the far end', () => {
  expect(nextTrayOrder(['a'], ['a', 'b'])).to.deep.equal(['a', 'b']);
});

it('keeps places while items stay visible, whatever order they are reported in', () => {
  expect(nextTrayOrder(['a', 'b'], ['b', 'a'])).to.deep.equal(['a', 'b']);
});

it('drops an item that hides, and it rejoins at the far end', () => {
  const hidden = nextTrayOrder(['a', 'b'], ['b']);
  expect(hidden).to.deep.equal(['b']);
  expect(nextTrayOrder(hidden, ['a', 'b'])).to.deep.equal(['b', 'a']);
});

it('keeps registry order among items that arrive together', () => {
  expect(nextTrayOrder([], ['c', 'a', 'b'])).to.deep.equal(['c', 'a', 'b']);
});

it('puts the oldest nearest the clock', () => {
  // The tray is a row ending in the clock; a lower flex order sits further from it.
  expect(trayFlexOrder(['a', 'b'], 'a')).to.be.greaterThan(trayFlexOrder(['a', 'b'], 'b'));
  expect(trayFlexOrder(['a', 'b'], 'a')).to.be.lessThan(0);
});
