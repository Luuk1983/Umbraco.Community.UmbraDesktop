import { expect, fixture, html } from '@open-wc/testing';
import './guidelines-panel.element.js';
import type { UmbraDesktopMediaGuidelinesPanelElement } from './guidelines-panel.element.js';
import { DEFAULT_GUIDELINES } from './guidelines.js';
import type { MediaGuidelines } from './guidelines.js';
import type { MediaGuidelinesApi } from './guidelines-api.js';

/**
 * The media guidelines' box in Desktop settings, under Add-ons, in the Media row (#179): three
 * switches with their settings, editable with the Settings section and read only without it.
 */

/**
 * The box over a stand-in server.
 * @param options What the server holds and answers, and whether the user may edit.
 * @param options.stored What reading answers; undefined for a failed read.
 * @param options.canEdit Whether the user has the Settings section.
 * @param options.writes Whether a write succeeds.
 * @returns The box and what was written.
 */
async function open(options: { stored?: MediaGuidelines; canEdit?: boolean; writes?: boolean } = {}) {
  const written: MediaGuidelines[] = [];
  const api: MediaGuidelinesApi = {
    read: async () => ('stored' in options ? options.stored : DEFAULT_GUIDELINES),
    write: async (guidelines) => (written.push(guidelines), options.writes ?? true),
  };
  const element = await fixture<UmbraDesktopMediaGuidelinesPanelElement>(
    html`<umbradesktop-media-guidelines-panel .api=${api} .canEdit=${options.canEdit ?? true} .writeDelay=${0}></umbradesktop-media-guidelines-panel>`,
  );
  for (let i = 0; i < 50 && !element.shadowRoot!.querySelector('[data-switch]'); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  await element.updateComplete;
  return { element, written };
}

/**
 * Something in the box.
 * @param element The box.
 * @param selector What.
 * @returns It.
 */
const $ = <T extends HTMLElement = HTMLElement>(element: HTMLElement, selector: string) => element.shadowRoot!.querySelector(selector) as T;

/**
 * Change a control as the person would: its value, then its change event.
 * @param control The control.
 * @param change What to set on it.
 */
async function change(control: HTMLElement, change: Record<string, unknown>): Promise<void> {
  Object.assign(control, change);
  control.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('the media guidelines settings', () => {
  it('says which uploads are checked', async () => {
    const { element } = await open();
    expect($(element, '.about').textContent).to.contain('dropped or pasted into a Media Manager window');
    expect($(element, '.about').textContent).to.contain('not checked');
  });

  it('shows the stored guidelines: three switches, the longest side, a row per kind and the quality', async () => {
    const { element } = await open();
    expect([...element.shadowRoot!.querySelectorAll('[data-switch]')].map((each) => [each.getAttribute('data-switch'), each.hasAttribute('checked')])).to.deep.equal([
      ['maxSize', true],
      ['formats', true],
      ['location', true],
    ]);
    expect(($(element, '[name="longestSide"]') as HTMLInputElement).value).to.equal('2560');
    expect([...element.shadowRoot!.querySelectorAll<HTMLElement>('[data-kind]')].map((row) => row.dataset.kind)).to.deep.equal(['jpeg', 'png-photo', 'png-transparent', 'webp', 'gif']);
    expect(($(element, '[data-kind="png-photo"] uui-select') as HTMLElement & { value: string }).value).to.equal('webp');
    expect(($(element, '[name="quality"]') as HTMLInputElement).value).to.equal('80');
  });

  it('stores every guideline with the one changed, at once, for the whole site', async () => {
    const { element, written } = await open();
    await change($(element, '[data-switch="location"]'), { checked: false });
    expect(written).to.have.length(1);
    expect(written[0]).to.deep.equal({ ...DEFAULT_GUIDELINES, location: { on: false } });
    await change($(element, '[data-kind="gif"] uui-select'), { value: 'webp' });
    expect(written[1].formats.rows.gif).to.equal('webp');
    expect(written[1].location.on).to.equal(false);
    await element.updateComplete;
    expect($(element, '.status').textContent!.trim()).to.equal('Saved for everyone on this site.');
  });

  it('refuses a longest side or quality it could not use, keeping what was there', async () => {
    const { element, written } = await open();
    await change($(element, '[name="longestSide"]'), { value: '0' });
    await change($(element, '[name="quality"]'), { value: '400' });
    expect(written).to.deep.equal([]);
    await element.updateComplete;
    expect(($(element, '[name="longestSide"]') as HTMLInputElement).value).to.equal('2560');
  });

  it('keeps a switch\'s settings in view while it is off, greyed', async () => {
    const off = { ...DEFAULT_GUIDELINES, maxSize: { on: false, longestSide: 1920 } };
    const { element } = await open({ stored: off });
    const side = $(element, '[name="longestSide"]') as HTMLInputElement;
    expect(side.value).to.equal('1920');
    expect(side.hasAttribute('disabled')).to.equal(true);
  });

  it('shows the guidelines read only without the Settings section, and says why', async () => {
    const { element, written } = await open({ canEdit: false });
    expect($(element, '.read-only').textContent).to.contain('Only users with the Settings section can change these.');
    expect([...element.shadowRoot!.querySelectorAll('[data-switch], uui-select, uui-input')].every((control) => control.hasAttribute('disabled'))).to.equal(true);
    await change($(element, '[data-switch="location"]'), { checked: false });
    expect(written).to.deep.equal([]);
  });

  it('says so when they could not be read, and shows the defaults', async () => {
    const { element } = await open({ stored: undefined });
    expect($(element, '.status').textContent!.trim()).to.equal('The guidelines could not be read, so this shows the defaults.');
    expect($(element, '[data-switch="maxSize"]').hasAttribute('checked')).to.equal(true);
  });

  it('says so when a change could not be saved', async () => {
    const { element } = await open({ writes: false });
    await change($(element, '[data-switch="formats"]'), { checked: false });
    await element.updateComplete;
    expect($(element, '.status').textContent!.trim()).to.contain('could not be saved');
  });
});
