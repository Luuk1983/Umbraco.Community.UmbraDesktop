import { expect } from '@open-wc/testing';
import { linkIntent } from './link-rule.js';

const KEY = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';
const TYPE = 'cc07b313-0843-4aa8-bbda-871c8da728c8';
const VIEWS = [
  { alias: 'Umb.CollectionView.Media.Grid', pathName: 'grid' },
  { alias: 'Umb.CollectionView.Media.Table', pathName: 'table' },
];

/**
 * What a click on a link inside a manager window means. Core renders these links for the Media
 * section, where following them is right; inside a desktop window following one would navigate the
 * whole backoffice away from the desktop, so every one is read here and acted on in the window.
 */
describe('what a link inside a manager window means', () => {
  it('reads an edit link as an item, absolute or relative to the backoffice', () => {
    expect(linkIntent(`/umbraco/section/media/workspace/media/edit/${KEY}`, VIEWS)).to.deep.equal({ kind: 'item', unique: KEY });
    expect(linkIntent(`section/media/workspace/media/edit/${KEY}`, VIEWS)).to.deep.equal({ kind: 'item', unique: KEY });
    expect(linkIntent(`${location.origin}/umbraco/section/media/workspace/media/edit/${KEY}/view/info`, VIEWS)).to.deep.equal({
      kind: 'item',
      unique: KEY,
    });
  });

  /** Core's tree builds its links from the section it is in, which on the desktop is the desktop's. */
  it('reads an edit link under any section, as the tree writes them on the desktop', () => {
    expect(linkIntent(`section/umbradesktop/workspace/media/edit/${KEY}`, VIEWS)).to.deep.equal({ kind: 'item', unique: KEY });
  });

  it('reads the Media root and the recycle bin as places', () => {
    expect(linkIntent('section/umbradesktop/workspace/media-root/edit/null', VIEWS)).to.deep.equal({ kind: 'place', place: { kind: 'root' } });
    expect(linkIntent('/umbraco/section/media/workspace/media-recycle-bin-root/edit/null', VIEWS)).to.deep.equal({
      kind: 'place',
      place: { kind: 'bin' },
    });
  });

  it('reads a create link with its parent and media type', () => {
    const inFolder = `/umbraco/section/media/workspace/media/create/parent/media/${KEY}/${TYPE}`;
    expect(linkIntent(inFolder, VIEWS)).to.deep.equal({ kind: 'create', parent: KEY, mediaType: TYPE, path: inFolder });
    const atRoot = `/umbraco/section/media/workspace/media/create/parent/media-root/null/${TYPE}`;
    expect(linkIntent(atRoot, VIEWS)).to.deep.equal({ kind: 'create', parent: null, mediaType: TYPE, path: atRoot });
  });

  it('reads a link ending in a collection view’s path as that view', () => {
    expect(linkIntent('/umbraco/section/umbradesktop/table', VIEWS)).to.deep.equal({ kind: 'view', alias: 'Umb.CollectionView.Media.Table' });
    expect(linkIntent('/umbraco/section/umbradesktop/grid/', VIEWS)).to.deep.equal({ kind: 'view', alias: 'Umb.CollectionView.Media.Grid' });
  });

  it('reads any other backoffice link as a section link, to be stopped', () => {
    expect(linkIntent('/umbraco/section/content', VIEWS)).to.deep.equal({ kind: 'section' });
    expect(linkIntent('/umbraco/section/media/workspace/media/edit/not-a-key', VIEWS)).to.deep.equal({ kind: 'section' });
  });

  it('leaves a link off the backoffice alone', () => {
    expect(linkIntent('https://example.com/file.pdf', VIEWS)).to.deep.equal({ kind: 'other' });
    expect(linkIntent('/media/abc/photo.jpg', VIEWS)).to.deep.equal({ kind: 'other' });
  });
});
