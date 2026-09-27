import { expect } from '@open-wc/testing';
import type { UmbraDesktopApp } from '../types';
import { pinKeysFor, resolvePinned, togglePinnedApp } from './pinned';

/**
 * A stand-in app for the toggle cases, which read nothing but its alias.
 * @param alias The app alias.
 * @returns The app.
 */
const plain = (alias: string): UmbraDesktopApp => ({
  alias,
  name: alias,
  icon: 'icon-document',
  content: { kind: 'iframe', url: '' },
  chromeProfile: 'full-section',
});

it('appends an app that is not pinned, so new pins land at the end of the list', () => {
  expect(togglePinnedApp(['content', 'media'], plain('log-viewer'))).to.deep.equal(['content', 'media', 'log-viewer']);
});

it('removes an app that is already pinned', () => {
  expect(togglePinnedApp(['content', 'media'], plain('content'))).to.deep.equal(['media']);
});

it('pins into an empty list', () => {
  expect(togglePinnedApp([], plain('content'))).to.deep.equal(['content']);
});

it('unpins the last remaining app', () => {
  expect(togglePinnedApp(['content'], plain('content'))).to.deep.equal([]);
});

it('does not mutate the list it is given', () => {
  const before = ['content'];
  togglePinnedApp(before, plain('media'));
  expect(before).to.deep.equal(['content']);
});

it('preserves pin order when unpinning from the middle', () => {
  expect(togglePinnedApp(['a', 'b', 'c'], plain('b'))).to.deep.equal(['a', 'c']);
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

describe('a pin that follows its section', () => {
  /**
   * An app, optionally the section-root app of a section.
   * @param alias The app alias.
   * @param coversSection The section it opens as its root, if any.
   * @returns A stand-in app.
   */
  const app = (alias: string, coversSection?: string): UmbraDesktopApp => ({
    alias,
    name: alias,
    icon: 'icon-document',
    content: { kind: 'iframe', url: '' },
    chromeProfile: 'full-section',
    ...(coversSection ? { coversSection } : {}),
  });

  it('resolves a pin on the fallback tile to the app that now covers the section', () => {
    expect(resolvePinned([app('Pkg.App', 'Pkg.Section')], ['section:Pkg.Section']).map((a) => a.alias)).to.deep.equal([
      'Pkg.App',
    ]);
  });

  it('shows the app once when both of its pins are stored', () => {
    const resolved = resolvePinned([app('Pkg.App', 'Pkg.Section')], ['section:Pkg.Section', 'Pkg.App']);
    expect(resolved.map((a) => a.alias)).to.deep.equal(['Pkg.App']);
  });

  it('knows every stored pin that stands for an app', () => {
    expect(pinKeysFor(app('Pkg.App', 'Pkg.Section'), ['content', 'section:Pkg.Section', 'Pkg.App'])).to.deep.equal([
      'section:Pkg.Section',
      'Pkg.App',
    ]);
  });

  it('unpins every key for the app, so it does not come straight back', () => {
    expect(togglePinnedApp(['content', 'section:Pkg.Section', 'Pkg.App'], app('Pkg.App', 'Pkg.Section'))).to.deep.equal([
      'content',
    ]);
  });

  it('pins an app under its own alias', () => {
    expect(togglePinnedApp(['content'], app('Pkg.App', 'Pkg.Section'))).to.deep.equal(['content', 'Pkg.App']);
  });
});
