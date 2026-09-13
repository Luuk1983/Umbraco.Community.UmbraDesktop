import { expect } from '@open-wc/testing';
import type { UmbraDesktopApp } from '../types';
import { resolvePinned, togglePinned } from './pinned';

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

describe('resolving pins against the apps a user may launch', () => {
  /**
   * One function behind both surfaces that draw the pinned list. The launcher's Pinned hero and the
   * taskbar's fixed row have to agree about order and about what a pin resolves to, and the only
   * way two lists cannot disagree is by being one list.
   * @param alias The app alias.
   * @returns A stand-in app; only the alias is read here.
   */
  const app = (alias: string): UmbraDesktopApp => ({
    alias,
    name: alias,
    icon: 'icon-document',
    content: { kind: 'iframe', url: '' },
    chromeProfile: 'full-section',
  });

  it('returns the apps in pin order, not in catalogue order', () => {
    const apps = [app('content'), app('media'), app('log-viewer')];
    expect(resolvePinned(apps, ['log-viewer', 'content']).map((a) => a.alias)).to.deep.equal([
      'log-viewer',
      'content',
    ]);
  });

  it('drops an alias with no app behind it', () => {
    // The catalogue resolves entries against the user's permitted sections before anything sees
    // them, so a pin the user may no longer reach simply is not in the list — which is also how a
    // pin for an uninstalled package disappears without needing to be cleaned up.
    expect(resolvePinned([app('content')], ['content', 'commerce']).map((a) => a.alias)).to.deep.equal(['content']);
  });

  it('returns nothing for an empty pin list', () => {
    expect(resolvePinned([app('content')], [])).to.deep.equal([]);
  });
});
