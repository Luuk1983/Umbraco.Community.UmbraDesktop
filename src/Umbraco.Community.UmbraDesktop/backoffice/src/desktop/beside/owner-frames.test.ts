import { expect } from '@open-wc/testing';
import { announceWindowFrame, currentWindowFrame, forgetWindowFrame, watchWindowFrame } from './owner-frames';

/**
 * Where a view beside the editor finds its owner's frame (design §4.5): the owner announces its
 * frame on every load, and the view's host follows the announcements so it can remount against a
 * reloaded page. Plain objects stand in for frames; only their identity matters here.
 */

/** A frame stand-in. */
const frame = () => ({}) as HTMLIFrameElement;

afterEach(() => {
  forgetWindowFrame('w1');
  forgetWindowFrame('w2');
});

it('hands a watcher the frame already loaded, straight away', () => {
  const first = frame();
  announceWindowFrame('w1', first);
  const seen: Array<HTMLIFrameElement | undefined> = [];
  const stop = watchWindowFrame('w1', (f) => seen.push(f));
  expect(seen).to.deep.equal([first]);
  stop();
});

it('hands it every later load, which is a reload of the owner', () => {
  const seen: Array<HTMLIFrameElement | undefined> = [];
  const stop = watchWindowFrame('w1', (f) => seen.push(f));
  const first = frame();
  const reloaded = frame();
  announceWindowFrame('w1', first);
  announceWindowFrame('w1', reloaded);
  expect(seen).to.deep.equal([first, reloaded]);
  stop();
});

it('says when the frame has gone, and only to the watchers of that window', () => {
  const seen: Array<HTMLIFrameElement | undefined> = [];
  const others: Array<HTMLIFrameElement | undefined> = [];
  const stop = watchWindowFrame('w1', (f) => seen.push(f));
  const stopOther = watchWindowFrame('w2', (f) => others.push(f));
  announceWindowFrame('w1', frame());
  forgetWindowFrame('w1');
  expect(seen.length).to.equal(2);
  expect(seen[1]).to.equal(undefined);
  expect(others).to.deep.equal([]);
  stop();
  stopOther();
});

it('stops telling a watcher that stopped', () => {
  const seen: Array<HTMLIFrameElement | undefined> = [];
  const stop = watchWindowFrame('w1', (f) => seen.push(f));
  stop();
  announceWindowFrame('w1', frame());
  expect(seen).to.deep.equal([]);
});

it('says which frame a window has loaded now, and nothing once it has gone', () => {
  const first = frame();
  expect(currentWindowFrame('w1')).to.equal(undefined);
  announceWindowFrame('w1', first);
  expect(currentWindowFrame('w1')).to.equal(first);
  forgetWindowFrame('w1');
  expect(currentWindowFrame('w1')).to.equal(undefined);
});
