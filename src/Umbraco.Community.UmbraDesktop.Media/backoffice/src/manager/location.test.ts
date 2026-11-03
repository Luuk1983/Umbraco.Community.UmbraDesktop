import { expect } from '@open-wc/testing';
import { parseLocation, printLocation } from './location.js';

const KEY = '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0';

describe('a manager window location', () => {
  it('reads nothing as Media, in core’s own view', () => {
    expect(parseLocation(undefined)).to.deep.equal({ place: { kind: 'root' } });
    expect(parseLocation('')).to.deep.equal({ place: { kind: 'root' } });
  });

  it('round-trips the root, a folder and the recycle bin, with and without a view', () => {
    const cases = [
      { place: { kind: 'root' as const } },
      { place: { kind: 'folder' as const, unique: KEY } },
      { place: { kind: 'bin' as const } },
      { place: { kind: 'folder' as const, unique: KEY }, view: 'Umb.CollectionView.Media.Table' },
      { place: { kind: 'root' as const }, view: 'Umb.CollectionView.Media.Grid' },
    ];
    for (const value of cases) expect(parseLocation(printLocation(value.place, value.view))).to.deep.equal(value);
  });

  it('reads anything it cannot use as Media, keeping a usable view', () => {
    expect(parseLocation('folder=not-a-key')).to.deep.equal({ place: { kind: 'root' } });
    expect(parseLocation('garbage')).to.deep.equal({ place: { kind: 'root' } });
    expect(parseLocation('folder=nope&view=Umb.CollectionView.Media.Table')).to.deep.equal({
      place: { kind: 'root' },
      view: 'Umb.CollectionView.Media.Table',
    });
  });

  it('drops a view that is not an extension alias', () => {
    expect(parseLocation(`folder=${KEY}&view=<script>`)).to.deep.equal({ place: { kind: 'folder', unique: KEY } });
  });

  it('carries an item to select once the folder shows, and reads one only when it is a key', () => {
    const SELECT = '11111111-2222-3333-4444-555555555555';
    expect(printLocation({ kind: 'folder', unique: KEY }, undefined, SELECT)).to.equal(`folder=${KEY}&select=${SELECT}`);
    expect(parseLocation(`folder=${KEY}&select=${SELECT}`)).to.deep.equal({ place: { kind: 'folder', unique: KEY }, select: SELECT });
    expect(parseLocation(`folder=${KEY}&select=<script>`)).to.deep.equal({ place: { kind: 'folder', unique: KEY } });
    expect(parseLocation(`folder=root&view=Umb.CollectionView.Media.Table&select=${SELECT}`)).to.deep.equal({
      place: { kind: 'root' },
      view: 'Umb.CollectionView.Media.Table',
      select: SELECT,
    });
  });
});
