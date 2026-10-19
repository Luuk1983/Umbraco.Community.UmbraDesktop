import { expect } from '@open-wc/testing';
import { UMBRADESKTOP_OPEN_ITEM_KEY, editPath, markOpenItem, openKeyFrom } from './open-item.js';

/**
 * Which item a manager window has open beside it, and the pink border on its card (#144, design §8,
 * plan task 2.4).
 */

const KEY = '11111111-2222-3333-4444-555555555555';
const OTHER = '66666666-7777-8888-9999-000000000000';

describe('the open key', () => {
  it('is read off the edit page of the item open beside the window', () => {
    expect(openKeyFrom({ [UMBRADESKTOP_OPEN_ITEM_KEY]: editPath(KEY) })).to.equal(KEY);
  });

  it('is read the same when core has added the workspace view to the page', () => {
    expect(openKeyFrom({ [UMBRADESKTOP_OPEN_ITEM_KEY]: `${editPath(KEY)}/view/media` })).to.equal(KEY);
  });

  it('is nothing while a new item is being created, which has no card yet', () => {
    expect(openKeyFrom({ [UMBRADESKTOP_OPEN_ITEM_KEY]: `/umbraco/section/media/workspace/media/create/parent/media-root/null/${OTHER}` })).to.equal(undefined);
  });

  it('is nothing when nothing is open, or something under another key', () => {
    expect(openKeyFrom({})).to.equal(undefined);
    expect(openKeyFrom(undefined)).to.equal(undefined);
    expect(openKeyFrom({ other: editPath(KEY) })).to.equal(undefined);
  });

  it('is the media workspace on the Media section path, as core links it', () => {
    expect(editPath(KEY)).to.equal(`/umbraco/section/media/workspace/media/edit/${KEY}`);
  });
});

describe('the border', () => {
  /** Hosts made by a case, removed after it. */
  let hosts: HTMLElement[] = [];
  afterEach(() => {
    for (const host of hosts) host.remove();
    hosts = [];
  });

  /**
   * A stand-in for a manager window's collection: a grid view and a table view, each in a shadow
   * root of its own a few levels down, as core renders them.
   * @returns The root to mark from, the cards and the rows.
   */
  function collection() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    hosts.push(host);
    const outer = host.attachShadow({ mode: 'open' });
    const gridView = document.createElement('div');
    outer.appendChild(gridView);
    const grid = gridView.attachShadow({ mode: 'open' });
    const card = (key: string) => {
      const el = document.createElement('umb-entity-collection-item-card') as HTMLElement;
      el.setAttribute('href', `section/media/workspace/media/edit/${key}`);
      el.style.display = 'block';
      el.attachShadow({ mode: 'open' }).appendChild(document.createElement('span'));
      grid.appendChild(el);
      return el;
    };
    const tableView = document.createElement('div');
    outer.appendChild(tableView);
    const table = tableView.attachShadow({ mode: 'open' });
    const row = (key: string) => {
      const el = document.createElement('uui-table-row') as unknown as HTMLElement;
      el.setAttribute('data-sortable-id', key);
      el.style.display = 'block';
      table.appendChild(el);
      return el;
    };
    return { host, cards: [card(KEY), card(OTHER)], rows: [row(KEY), row(OTHER)], grid, table };
  }

  const outlined = (el: Element) => getComputedStyle(el).outlineStyle !== 'none';

  it('rings the open card and the open row, and nothing else', () => {
    const { host, cards, rows } = collection();
    markOpenItem(host, KEY);
    expect(cards.map(outlined)).to.deep.equal([true, false]);
    expect(rows.map(outlined)).to.deep.equal([true, false]);
  });

  it('moves with the key', () => {
    const { host, cards } = collection();
    markOpenItem(host, KEY);
    markOpenItem(host, OTHER);
    expect(cards.map(outlined)).to.deep.equal([false, true]);
  });

  it('goes when nothing is open', () => {
    const { host, cards } = collection();
    markOpenItem(host, KEY);
    markOpenItem(host, undefined);
    expect(cards.map(outlined)).to.deep.equal([false, false]);
  });

  it('is not moved by selecting another card', () => {
    const { host, cards } = collection();
    markOpenItem(host, KEY);
    cards[1].setAttribute('selected', '');
    expect(cards.map(outlined)).to.deep.equal([true, false]);
  });

  it('writes its rule only where cards or rows are, not into the cards themselves', () => {
    const { host, cards, grid, table } = collection();
    markOpenItem(host, KEY);
    expect(!!grid.getElementById('umbradesktop-media-open-item')).to.equal(true);
    expect(!!table.getElementById('umbradesktop-media-open-item')).to.equal(true);
    expect(!!cards[0].shadowRoot!.getElementById('umbradesktop-media-open-item')).to.equal(false);
    expect(!!host.shadowRoot!.getElementById('umbradesktop-media-open-item')).to.equal(false);
  });

  it('says whether it found any to mark', () => {
    const { host } = collection();
    expect(markOpenItem(host, KEY)).to.equal(true);
    const empty = document.createElement('div');
    document.body.appendChild(empty);
    hosts.push(empty);
    expect(markOpenItem(empty, KEY)).to.equal(false);
  });
});
