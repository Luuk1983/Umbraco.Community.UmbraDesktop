import { expect } from '@open-wc/testing';
import { parseLayout, restoredUrl, serialiseLayout, snapshotLayout } from './layout.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';

/**
 * The saved window layout, as pure functions: what is kept of an open window, how it survives a
 * round trip through storage, and how carefully a stored value is read back. Stored data outlives
 * the code that wrote it and can be edited by hand in the database, so every field is checked on
 * the way in and a bad entry is dropped rather than trusted.
 */

const CONTENT: UmbraDesktopApp = {
  alias: 'content',
  name: 'Content',
  icon: 'icon-document',
  content: { kind: 'iframe', url: '/umbraco/section/content' },
  chromeProfile: 'full-section',
};

const GAME: UmbraDesktopApp = {
  alias: 'game',
  name: 'Game',
  icon: 'icon-game',
  content: { kind: 'element', element: HTMLElement },
  chromeProfile: 'bare',
};

/** An open window, with just the fields a case sets. */
function win(over: Partial<UmbraDesktopWindow> = {}): UmbraDesktopWindow {
  return {
    id: 'w1',
    app: CONTENT,
    rect: { x: 10, y: 20, w: 800, h: 600 },
    z: 1,
    active: false,
    state: 'normal',
    ...over,
  };
}

describe('taking a snapshot', () => {
  it('keeps each window’s app, rectangle, state, stacking and focus', () => {
    const layout = snapshotLayout([
      win({ id: 'a', z: 1 }),
      win({ id: 'b', app: GAME, rect: { x: 5, y: 5, w: 300, h: 200 }, z: 2, active: true, state: 'maximized' }),
    ]);
    expect(layout).to.deep.equal({
      version: 1,
      windows: [
        { app: 'content', rect: { x: 10, y: 20, w: 800, h: 600 }, state: 'normal', z: 1, active: false },
        { app: 'game', rect: { x: 5, y: 5, w: 300, h: 200 }, state: 'maximized', z: 2, active: true },
      ],
    });
  });

  it('keeps a snapped window’s half and the size it goes back to', () => {
    const [saved] = snapshotLayout([
      win({ snapped: 'left', restoreRect: { x: 1, y: 2, w: 3, h: 4 } }),
    ]).windows;
    expect(saved.snapped).to.equal('left');
    expect(saved.restoreRect).to.deep.equal({ x: 1, y: 2, w: 3, h: 4 });
  });

  it('keeps the page a backoffice window was showing, and none for an app', () => {
    const layout = snapshotLayout([
      win({ location: '/umbraco/section/content/workspace/document/edit/abc' }),
      win({ id: 'g', app: GAME, location: '/should/not/matter' }),
    ]);
    expect(layout.windows[0].location).to.equal('/umbraco/section/content/workspace/document/edit/abc');
    expect(layout.windows[1].location).to.equal(undefined);
  });

  /** Attached windows and panes are left for a later version: their owner ids do not survive a reload. */
  it('leaves out floating attached windows', () => {
    const layout = snapshotLayout([win({ id: 'owner' }), win({ id: 'preview', owner: 'owner' })]);
    expect(layout.windows.length).to.equal(1);
  });
});

describe('reading a stored layout', () => {
  it('reads back what it wrote', () => {
    const layout = snapshotLayout([win({ active: true, location: '/umbraco/section/content' })]);
    expect(parseLayout(serialiseLayout(layout))).to.deep.equal(layout);
  });

  it('reads nothing, junk or another version as an empty layout', () => {
    for (const raw of [null, undefined, '', 'not json', '42', '{"version":2,"windows":[]}', '{"windows":"no"}']) {
      expect(parseLayout(raw), String(raw)).to.deep.equal({ version: 1, windows: [] });
    }
  });

  it('drops an entry it cannot trust and keeps the rest', () => {
    const good = { app: 'content', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 1, active: false };
    const raw = JSON.stringify({
      version: 1,
      windows: [
        good,
        { ...good, app: '' },
        { ...good, rect: { x: 0, y: 0, w: -5, h: 100 } },
        { ...good, rect: { x: 'a', y: 0, w: 100, h: 100 } },
        { ...good, state: 'exploded' },
        { ...good, z: 'top' },
        { ...good, snapped: 'up' },
        'not a window',
      ],
    });
    expect(parseLayout(raw).windows).to.deep.equal([good]);
  });

  it('drops a stored page that is not a plain path on this site', () => {
    const base = { app: 'content', rect: { x: 0, y: 0, w: 100, h: 100 }, state: 'normal', z: 1, active: false };
    for (const location of ['https://evil.example/umbraco', '//evil.example/x', 'javascript:alert(1)', 'relative/path', 42]) {
      const [saved] = parseLayout(JSON.stringify({ version: 1, windows: [{ ...base, location }] })).windows;
      expect(saved.location, String(location)).to.equal(undefined);
    }
  });
});

describe('the address a restored backoffice window opens at', () => {
  it('is the stored page when it is under the backoffice', () => {
    expect(restoredUrl(CONTENT, '/umbraco/section/content/workspace/document/edit/abc?culture=en#x')).to.equal(
      '/umbraco/section/content/workspace/document/edit/abc?culture=en#x',
    );
  });

  it('is the app’s own address when nothing was stored, or when the stored page leaves the backoffice', () => {
    expect(restoredUrl(CONTENT, undefined)).to.equal('/umbraco/section/content');
    expect(restoredUrl(CONTENT, '/somewhere-else')).to.equal('/umbraco/section/content');
  });

  it('is nothing for an app, which has no address', () => {
    expect(restoredUrl(GAME, '/umbraco/section/content')).to.equal(undefined);
  });
});
