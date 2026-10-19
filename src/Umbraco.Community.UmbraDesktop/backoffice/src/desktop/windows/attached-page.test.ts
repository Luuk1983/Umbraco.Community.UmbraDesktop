import { expect } from '@open-wc/testing';
import { attachedPageAlias, attachedPaths, createAttachedPageApp, readAttachedRequest } from './attached-page.js';
import type { UmbraDesktopApp, UmbraDesktopWindow } from '../types.js';

/**
 * The pure half of an app opening a backoffice page beside its own window (#144, plan task 2.3):
 * reading the app's request, building the page, and telling the app what is open.
 */

const EDIT = '/umbraco/section/media/workspace/media/edit/2b1c2f0e-0a5f-4a0f-9a9a-0d6f3f6a7c11';

describe('reading a request', () => {
  it('reads a page under the backoffice sections', () => {
    expect(readAttachedRequest({ key: 'item', path: EDIT, name: 'Cat', icon: 'icon-picture' })).to.deep.equal({
      key: 'item',
      path: EDIT,
      name: 'Cat',
      icon: 'icon-picture',
      floating: false,
    });
  });

  it('reads the base-relative form core writes', () => {
    expect(readAttachedRequest({ key: 'item', path: EDIT.slice('/umbraco/'.length), name: 'Cat', icon: 'icon-picture' })?.path).to.equal(EDIT);
  });

  it('carries Shift as floating', () => {
    expect(readAttachedRequest({ key: 'item', path: EDIT, name: 'Cat', icon: 'icon-picture', floating: true })?.floating).to.equal(true);
  });

  it('refuses a path off the backoffice', () => {
    expect(readAttachedRequest({ key: 'item', path: 'https://example.com/umbraco/section/media', name: 'x', icon: 'y' })).to.equal(undefined);
    expect(readAttachedRequest({ key: 'item', path: '/somewhere/else', name: 'x', icon: 'y' })).to.equal(undefined);
    expect(readAttachedRequest({ key: 'item', path: '/umbraco/section/../../etc', name: 'x', icon: 'y' })).to.equal(undefined);
  });

  it('refuses a request without a key or a path', () => {
    expect(readAttachedRequest({ path: EDIT, name: 'x', icon: 'y' })).to.equal(undefined);
    expect(readAttachedRequest({ key: '', path: EDIT })).to.equal(undefined);
    expect(readAttachedRequest(undefined)).to.equal(undefined);
  });

  it('falls back to a plain name and icon when the app gives none', () => {
    const request = readAttachedRequest({ key: 'item', path: EDIT });
    expect(request?.name).to.equal('');
    expect(request?.icon).to.equal('icon-document');
  });
});

describe('the page', () => {
  it('is a workspace-only frame on the path, under an alias of the window and key', () => {
    const app = createAttachedPageApp('w1', { key: 'item', path: EDIT, name: 'Cat', icon: 'icon-picture', floating: false });
    expect(app.alias).to.equal(attachedPageAlias('w1', 'item'));
    expect(app.alias).to.equal('umbradesktop-attached:w1:item');
    expect(app.content).to.deep.equal({ kind: 'iframe', url: EDIT });
    expect(app.chromeProfile).to.equal('workspace-only');
    expect(app).to.deep.include({ name: 'Cat', icon: 'icon-picture' });
    expect(app.defaultSize).to.deep.equal({ w: 720, h: 780 });
    expect(app.minSize).to.deep.equal({ w: 560, h: 480 });
  });
});

describe('what is open', () => {
  const page = (url: string, key: string): UmbraDesktopApp => createAttachedPageApp('owner', { key, path: url, name: '', icon: '', floating: false });

  it("reports each open key's page, from a pane and from a floating window", () => {
    const windows = [
      {
        id: 'owner',
        panes: [
          { id: 'p1', app: page(EDIT, 'item'), side: 'right', width: 700, location: `${EDIT}/view/media` },
        ],
      },
      { id: 'f1', owner: 'owner', app: page('/umbraco/section/media/workspace/media/edit/b', 'other'), location: '/umbraco/section/media/workspace/media/edit/c' },
      { id: 'f2', owner: 'someone-else', app: page('/umbraco/section/media/workspace/media/edit/d', 'item') },
    ] as unknown as UmbraDesktopWindow[];
    expect(attachedPaths(windows, 'owner')).to.deep.equal({
      item: `${EDIT}/view/media`,
      other: '/umbraco/section/media/workspace/media/edit/c',
    });
  });

  it("uses the page's own url before its frame has reported", () => {
    const windows = [{ id: 'owner', panes: [{ id: 'p1', app: page(EDIT, 'item'), side: 'right', width: 700 }] }] as unknown as UmbraDesktopWindow[];
    expect(attachedPaths(windows, 'owner')).to.deep.equal({ item: EDIT });
  });

  it('ignores attached content that is not a page of this window', () => {
    const preview = { alias: 'umbradesktop.preview', name: '', icon: '', content: { kind: 'element', element: HTMLElement }, chromeProfile: 'bare' };
    const windows = [{ id: 'owner', panes: [{ id: 'p1', app: preview, side: 'right', width: 700 }] }] as unknown as UmbraDesktopWindow[];
    expect(attachedPaths(windows, 'owner')).to.deep.equal({});
  });
});
