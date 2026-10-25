import { expect, fixture, html } from '@open-wc/testing';
import './optimize-where.element.js';
import type { UmbraDesktopOptimizeWhereElement } from './optimize-where.element.js';
import type { Place } from './where-used.js';
import { PLACES_SHOWN, sortByUse } from './where-used.js';

/**
 * Show where (design §16, owner 2026-10-25): one compact header per used image, the images used most
 * first, and under it one line per place with its path, the first few shown and the rest behind
 * "and n more", so one image used on forty pages does not bury the others.
 */

/** Places by image, as the backoffice would answer. */
const PLACES: Record<string, Place[]> = {
  banjo: [
    { kind: 'document', name: 'Banjo', path: ['Home', 'Shop', 'Instruments'] },
    { kind: 'media', name: 'Summer sale', path: ['Banners'] },
    { kind: 'member', name: 'Ravi Motha', path: [] },
  ],
  bowling: Array.from({ length: 8 }, (_, i) => ({ kind: 'document' as const, name: `Page ${i + 1}`, path: ['Home'] })),
};

/**
 * The list, on two images.
 * @returns It.
 */
async function where(): Promise<UmbraDesktopOptimizeWhereElement> {
  const element = await fixture<UmbraDesktopOptimizeWhereElement>(html`<umbradesktop-media-optimize-where></umbradesktop-media-optimize-where>`);
  element.images = sortByUse([
    { unique: 'banjo', name: 'Banjo', count: 3 },
    { unique: 'bowling', name: 'Bowling Ball', count: 8 },
  ]);
  element.places = async (unique) => PLACES[unique];
  for (let i = 0; i < 20; i++) {
    await element.updateComplete;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  return element;
}

/**
 * The lines of one image's list.
 * @param element The list.
 * @param index Which image.
 * @returns Each line's text, spaces collapsed.
 */
const lines = (element: HTMLElement, index: number) =>
  [...element.shadowRoot!.querySelectorAll('.image')[index].querySelectorAll('li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());

describe('Show where', () => {
  it('puts the images used most first, each on one header line', async () => {
    const element = await where();
    const headers = [...element.shadowRoot!.querySelectorAll('.image-head')].map((head) => head.textContent!.replace(/\s+/g, ' ').trim());
    expect(headers).to.deep.equal(['Bowling Ball Used in 8 places', 'Banjo Used in 3 places']);
  });

  it('writes each place on one line with its path, a member by its name', async () => {
    const element = await where();
    expect(lines(element, 1)).to.deep.equal(['Home › Shop › Instruments › Banjo', 'Banners › Summer sale', 'Member · Ravi Motha']);
    expect(element.shadowRoot!.querySelectorAll('.image')[1].querySelector('li b')!.textContent).to.equal('Banjo');
  });

  it('shows the first few places and the rest behind "and n more"', async () => {
    const element = await where();
    expect(lines(element, 0).length).to.equal(PLACES_SHOWN);
    const more = element.shadowRoot!.querySelector('.image [data-action="more"]') as HTMLButtonElement;
    expect(more.textContent!.trim()).to.equal(`and ${8 - PLACES_SHOWN} more`);
    more.click();
    await element.updateComplete;
    expect(lines(element, 0).length).to.equal(8);
    expect(element.shadowRoot!.querySelector('.image [data-action="more"]') === null).to.equal(true);
  });

  it("says so when an image's places cannot be read, without losing the others", async () => {
    const element = await fixture<UmbraDesktopOptimizeWhereElement>(html`<umbradesktop-media-optimize-where></umbradesktop-media-optimize-where>`);
    element.images = [
      { unique: 'banjo', name: 'Banjo', count: 3 },
      { unique: 'gone', name: 'Gone', count: 1 },
    ];
    element.places = async (unique) => (unique === 'gone' ? undefined : PLACES[unique]);
    for (let i = 0; i < 20; i++) {
      await element.updateComplete;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(lines(element, 0).length).to.equal(3);
    expect(element.shadowRoot!.querySelectorAll('.image')[1].textContent).to.include('could not be read');
  });
});
