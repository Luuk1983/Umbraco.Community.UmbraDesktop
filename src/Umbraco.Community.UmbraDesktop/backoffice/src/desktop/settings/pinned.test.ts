import { expect } from '@open-wc/testing';
import { togglePinned } from './pinned';

it('appends an alias that is not pinned, so new pins land at the end of the list', () => {
  expect(togglePinned(['content', 'media'], 'log-viewer')).to.deep.equal(['content', 'media', 'log-viewer']);
});

it('removes an alias that is already pinned', () => {
  expect(togglePinned(['content', 'media'], 'content')).to.deep.equal(['media']);
});

it('pins into an empty list', () => {
  expect(togglePinned([], 'content')).to.deep.equal(['content']);
});

it('unpins the last remaining alias', () => {
  expect(togglePinned(['content'], 'content')).to.deep.equal([]);
});

it('does not mutate the list it is given', () => {
  const before = ['content'];
  togglePinned(before, 'media');
  expect(before).to.deep.equal(['content']);
});

it('preserves pin order when unpinning from the middle', () => {
  expect(togglePinned(['a', 'b', 'c'], 'b')).to.deep.equal(['a', 'c']);
});
