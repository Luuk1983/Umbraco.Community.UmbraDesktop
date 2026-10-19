import { expect } from '@open-wc/testing';
import { guardRoutes, markActive } from './route-guard.js';
import type { UmbraDesktopMediaRouteTaker } from './route-guard.js';

/**
 * Core's dialogs in a manager window navigate by pushing on the desktop page's history, which no link
 * rule can catch: Create from a card's menu does. The guard cancels a push to a media page and hands it
 * to the manager window the person was working in (#144, design §8: nothing navigates the desktop).
 */

/** Undo for every guard a case starts. */
let stops: Array<() => void> = [];
afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

/**
 * A stand-in manager window that records the routes it is handed.
 * @param takes Whether it takes the routes it is handed.
 * @returns The window and what it was handed.
 */
function taker(takes = true): { element: UmbraDesktopMediaRouteTaker; taken: string[] } {
  const taken: string[] = [];
  const element = Object.assign(document.createElement('div'), {
    takeRoute: (url: string) => {
      taken.push(url);
      return takes;
    },
  });
  return { element, taken };
}

/**
 * Announce a push the way the backoffice's router does, before it changes the address.
 * @param url The address being pushed.
 * @returns Whether the push may go ahead.
 */
function push(url: string): boolean {
  return window.dispatchEvent(new CustomEvent('willchangestate', { cancelable: true, detail: { url, eventName: 'pushstate' } }));
}

const CREATE = 'section/media/workspace/media/create/parent/media/b001a4cb-5f33-4957-917d-597ca0ea05a4/cc07b313-0843-4aa8-bbda-871c8da728c8';

it('cancels a push to a media page and hands it to the window last worked in', () => {
  const one = taker();
  stops.push(guardRoutes(one.element));
  markActive(one.element);
  expect(push(CREATE)).to.equal(false);
  expect(one.taken).to.deep.equal([CREATE]);
});

it('hands it to the window last pressed in, of two', () => {
  const one = taker();
  const two = taker();
  stops.push(guardRoutes(one.element), guardRoutes(two.element));
  markActive(one.element);
  markActive(two.element);
  push(CREATE);
  expect(one.taken).to.deep.equal([]);
  expect(two.taken).to.deep.equal([CREATE]);
});

it('lets the push go ahead when the window does not take it', () => {
  const one = taker(false);
  stops.push(guardRoutes(one.element));
  markActive(one.element);
  expect(push('section/settings')).to.equal(true);
});

it('does nothing when no window has been worked in', () => {
  const one = taker();
  stops.push(guardRoutes(one.element));
  expect(push(CREATE)).to.equal(true);
  expect(one.taken).to.deep.equal([]);
});

it('stops listening once its windows have gone', () => {
  const one = taker();
  const stop = guardRoutes(one.element);
  markActive(one.element);
  stop();
  expect(push(CREATE)).to.equal(true);
  expect(one.taken).to.deep.equal([]);
});
