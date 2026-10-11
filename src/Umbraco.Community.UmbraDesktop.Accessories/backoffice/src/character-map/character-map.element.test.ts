import { expect, fixture, html } from '@open-wc/testing';
import './character-map.element.js';
import type { CharacterMapElement } from './character-map.element.js';

/**
 * Character Map: pick a group, click a character to see its name, double-click or Select to add it
 * to the characters to copy, and Copy. Or search for one by name.
 */

/**
 * A mounted Character Map with a fake clipboard.
 * @param copies Whether copying works.
 * @returns The element and what it copied.
 */
async function charmap(copies = true) {
  const copied: string[] = [];
  const element = await fixture<CharacterMapElement>(html`<umbradesktop-character-map
    .copyText=${async (text: string) => {
      copied.push(text);
      return copies;
    }}
  ></umbradesktop-character-map>`);
  return { element, copied };
}

/** The grid's cells. */
const cells = (element: CharacterMapElement) => [...element.shadowRoot!.querySelectorAll<HTMLElement>('.cell')];

/** A cell by its code point. */
const cell = (element: CharacterMapElement, code: number) =>
  element.shadowRoot!.querySelector<HTMLElement>(`.cell[data-code="${code}"]`)!;

/** A field by name. */
const field = <T extends HTMLElement>(element: CharacterMapElement, name: string) =>
  element.shadowRoot!.querySelector<T>(`[data-field="${name}"]`)!;

/** The status bar's text. */
const status = (element: CharacterMapElement) =>
  (element.shadowRoot!.querySelector('.status')?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Set a field's value as a person would, and let it render. */
async function enter(element: CharacterMapElement, name: string, value: string, type = 'input'): Promise<void> {
  const input = field<HTMLInputElement | HTMLSelectElement>(element, name);
  input.value = value;
  input.dispatchEvent(new Event(type, { bubbles: true }));
  await element.updateComplete;
}

/** Press a button by its action. */
async function press(element: CharacterMapElement, action: string): Promise<void> {
  element.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
  await new Promise((resolve) => setTimeout(resolve));
  await element.updateComplete;
}

/** Click a cell, and let it render. */
async function click(element: CharacterMapElement, code: number, detail = 1): Promise<void> {
  cell(element, code).dispatchEvent(new MouseEvent(detail === 2 ? 'dblclick' : 'click', { bubbles: true, detail }));
  await element.updateComplete;
}

it('opens on the first group, with its first character chosen', async () => {
  const { element } = await charmap();
  expect(Number(cells(element)[0].dataset.code)).to.equal(0x20);
  expect(cells(element).length).to.equal(95);
  expect(status(element)).to.contain('U+0020: Space');
});

it('shows a character’s name and code, and its Windows keystroke, when clicked', async () => {
  const { element } = await charmap();
  await enter(element, 'group', 'latin1', 'change');
  await click(element, 0xe9);
  expect(status(element)).to.contain('U+00E9: Latin Small Letter E With Acute');
  expect(status(element)).to.contain('Alt+0233');
  expect(cell(element, 0xe9).getAttribute('aria-selected')).to.equal('true');
});

it('adds a character to copy on double-click, and with Select', async () => {
  const { element } = await charmap();
  await enter(element, 'group', 'latin1', 'change');
  await click(element, 0xe9, 2);
  await click(element, 0xa9);
  await press(element, 'select');
  expect(field<HTMLInputElement>(element, 'copy').value).to.equal('é©');
});

it('copies the characters to copy', async () => {
  const { element, copied } = await charmap();
  await enter(element, 'copy', '→ ✓');
  await press(element, 'copy');
  expect(copied).to.deep.equal(['→ ✓']);
  expect(status(element)).to.contain('Copied');
});

it('says so when the clipboard refuses', async () => {
  const { element } = await charmap(false);
  await enter(element, 'copy', 'x');
  await press(element, 'copy');
  expect(status(element)).to.contain('Could not copy');
});

it('searches every group by name, and goes back to the group when the search is cleared', async () => {
  const { element } = await charmap();
  await enter(element, 'search', 'euro');
  expect(cells(element).map((each) => Number(each.dataset.code))).to.include(0x20ac);
  expect(cells(element).length).to.be.lessThan(10);
  await enter(element, 'search', '');
  expect(cells(element).length).to.equal(95);
});

it('says so when a search finds nothing', async () => {
  const { element } = await charmap();
  await enter(element, 'search', 'nothing is called this');
  expect(cells(element)).to.have.length(0);
  expect(status(element)).to.contain('No character');
});

/** The grid is one tab stop, and the arrows move through it, as in Windows. */
it('moves the choice with the arrow keys, and Enter adds it', async () => {
  const { element } = await charmap();
  const grid = element.shadowRoot!.querySelector<HTMLElement>('.grid')!;
  const key = async (name: string) => {
    grid.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
    await element.updateComplete;
  };
  await key('ArrowRight');
  await key('ArrowRight');
  expect(status(element)).to.contain('U+0022');
  await key('ArrowLeft');
  await key('Enter');
  expect(field<HTMLInputElement>(element, 'copy').value).to.equal('!');
  await key('ArrowDown');
  const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  expect(status(element)).to.contain(`U+00${(0x21 + columns).toString(16).toUpperCase()}`);
});

it('changes the font the grid is drawn in', async () => {
  const { element } = await charmap();
  await enter(element, 'font', 'monospace', 'change');
  expect(element.shadowRoot!.querySelector<HTMLElement>('.grid')!.style.fontFamily).to.contain('monospace');
});
