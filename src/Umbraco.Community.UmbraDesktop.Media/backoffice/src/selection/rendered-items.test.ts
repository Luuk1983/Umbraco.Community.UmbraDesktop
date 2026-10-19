import { expect } from '@open-wc/testing';
import { renderedItems } from './rendered-items.js';

/** The cards and rows core has drawn in a window, found through shadow roots (plan task 3.5). */

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

let hosts: HTMLElement[] = [];
afterEach(() => {
  for (const host of hosts) host.remove();
  hosts = [];
});

/**
 * A stand-in for a window: a grid view and a table view in shadow roots of their own.
 * @returns The root to search from, and the drawn items.
 */
function drawn() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  const outer = host.attachShadow({ mode: 'open' });
  const view = document.createElement('div');
  outer.appendChild(view);
  const grid = view.attachShadow({ mode: 'open' });
  const card = Object.assign(document.createElement('umb-entity-collection-item-card'), { item: { unique: A, entityType: 'media', name: 'Banjo' } });
  (card as HTMLElement).style.cssText = 'display:block;width:100px;height:100px';
  // A card's own shadow root holds a link of its own, which must not be counted twice.
  const inner = card.attachShadow({ mode: 'open' });
  const link = document.createElement('a');
  link.setAttribute('href', `section/media/workspace/media/edit/${A}`);
  inner.appendChild(link);
  grid.appendChild(card);
  const hrefCard = document.createElement('umb-entity-collection-item-card');
  hrefCard.setAttribute('href', `section/media/workspace/media/edit/${B}`);
  grid.appendChild(hrefCard);
  const row = document.createElement('uui-table-row') as unknown as HTMLElement;
  row.setAttribute('data-sortable-id', C);
  outer.appendChild(row);
  return { host, card, hrefCard, row };
}

it('finds core’s grid cards and table rows, each once, with its key and element', () => {
  const { host, card, hrefCard, row } = drawn();
  const found = renderedItems(host);
  expect(found.map((each) => each.unique)).to.deep.equal([A, B, C]);
  expect(found.find((each) => each.unique === A)?.element).to.equal(card);
  expect(found.find((each) => each.unique === B)?.element).to.equal(hrefCard);
  expect(found.find((each) => each.unique === C)?.element).to.equal(row);
});

it('reports where each is drawn', () => {
  const { host } = drawn();
  const rect = renderedItems(host).find((each) => each.unique === A)!.rect;
  expect(rect.width).to.equal(100);
  expect(rect.height).to.equal(100);
});

it('finds nothing in a window core has not drawn yet', () => {
  const empty = document.createElement('div');
  document.body.appendChild(empty);
  hosts.push(empty);
  expect(renderedItems(empty)).to.deep.equal([]);
});
