import { expect } from '@open-wc/testing';
import type { UmbraDesktopApp } from '../types';
import { pinAppBefore, pinKeysFor, resolveAppAlias, resolvePinned, withoutApp } from './pinned';

/**
 * A stand-in app for the cases that read nothing but its alias.
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
    expect(withoutApp(['content', 'section:Pkg.Section', 'Pkg.App'], app('Pkg.App', 'Pkg.Section'))).to.deep.equal([
      'content',
    ]);
  });

  it('pins an app under its own alias', () => {
    expect(pinAppBefore(['content'], app('Pkg.App', 'Pkg.Section'))).to.deep.equal(['content', 'Pkg.App']);
  });
});

describe('resolving one stored alias', () => {
  const content = plain('content');
  const pkg = { ...plain('pkg-app'), coversSection: 'Pkg.Section' };

  it('finds an app by its own alias', () => {
    expect(resolveAppAlias([content, pkg], 'content')).to.equal(content);
  });

  it("follows a section's fallback alias to the app that now covers the section", () => {
    expect(resolveAppAlias([content, pkg], 'section:Pkg.Section')).to.equal(pkg);
  });

  it('finds nothing for an alias no app answers to', () => {
    expect(resolveAppAlias([content], 'gone')).to.equal(undefined);
  });
});

describe('placing a pin', () => {
  const a = plain('a');
  const b = plain('b');
  const c = plain('c');

  it('appends when no position is given', () => {
    expect(pinAppBefore(['a', 'b'], c)).to.deep.equal(['a', 'b', 'c']);
  });

  it('inserts before the app it is dropped on', () => {
    expect(pinAppBefore(['a', 'b'], c, b)).to.deep.equal(['a', 'c', 'b']);
  });

  it('moves an app that is already pinned rather than pinning it twice', () => {
    expect(pinAppBefore(['a', 'b', 'c'], c, a)).to.deep.equal(['c', 'a', 'b']);
  });

  it('appends when the app it is dropped before is itself', () => {
    expect(pinAppBefore(['a', 'b'], a, a)).to.deep.equal(['b', 'a']);
  });

  it('finds the position through a fallback alias', () => {
    const pkg = { ...plain('pkg-app'), coversSection: 'Pkg.Section' };
    expect(pinAppBefore(['section:Pkg.Section'], a, pkg)).to.deep.equal(['a', 'section:Pkg.Section']);
  });

  it('removes every key that stands for an app', () => {
    const pkg = { ...plain('pkg-app'), coversSection: 'Pkg.Section' };
    expect(withoutApp(['section:Pkg.Section', 'a', 'pkg-app'], pkg)).to.deep.equal(['a']);
  });
});
