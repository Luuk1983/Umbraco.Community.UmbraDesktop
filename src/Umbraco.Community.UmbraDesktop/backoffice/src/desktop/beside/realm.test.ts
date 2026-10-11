import { expect } from '@open-wc/testing';
import { publishRealm, realmOf } from './realm';

/**
 * Each backoffice page publishes its own copy of the classes the bridge needs, so the desktop can
 * reach the frame's without evaluating code in it (design §4.4). A plain object stands in for a
 * frame's window.
 */

it('reads back what a page published on its window', () => {
  const frameWindow = {};
  class Token {}
  publishRealm(frameWindow, { UmbModalToken: Token });
  expect(realmOf(frameWindow)?.UmbModalToken).to.equal(Token);
});

it('reads nothing from a page that has published nothing, or that it cannot reach', () => {
  expect(realmOf({})).to.equal(undefined);
  expect(realmOf(null)).to.equal(undefined);
  const crossOrigin = new Proxy(
    {},
    {
      get() {
        throw new DOMException('Blocked a frame from accessing a cross-origin frame.', 'SecurityError');
      },
    },
  );
  expect(realmOf(crossOrigin)).to.equal(undefined);
});
