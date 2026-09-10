import { expect } from '@open-wc/testing';
import { isBootTraceEnabled } from './trace';

it('traces for a browser that expects to boot into the desktop', () => {
  expect(isBootTraceEnabled('', true)).to.equal(true);
});

it('stays quiet for everyone else', () => {
  // Nobody who does not use the feature should find lines in their console.
  expect(isBootTraceEnabled('', false)).to.equal(false);
  expect(isBootTraceEnabled('?foo=1', false)).to.equal(false);
});

it('traces on request, which is the case that matters when a boot is not happening', () => {
  // With no hint there is no splash and no boot, so the flag is the only way to see how far it got.
  expect(isBootTraceEnabled('?desktop=trace', false)).to.equal(true);
  expect(isBootTraceEnabled('?foo=1&desktop=trace', false)).to.equal(true);
});

it('does not confuse the trace flag with the escape flag', () => {
  // `?desktop=off` skips the boot; it must not also turn on logging, and vice versa.
  expect(isBootTraceEnabled('?desktop=off', false)).to.equal(false);
});
