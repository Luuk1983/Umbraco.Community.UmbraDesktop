import { expect, fixture, html } from '@open-wc/testing';
import './guidelines-dialog.element.js';
import type { UmbraDesktopMediaGuidelinesDialogElement } from './guidelines-dialog.element.js';
import { guidelinesDialogSize } from './guidelines-dialog.element.js';
import type { SheetAnswer, SheetRequest } from './guided-upload.js';
import { DEFAULT_GUIDELINES } from '../guidelines/guidelines.js';
import type { CheckedFile } from '../guidelines/check.js';
import type { UploadFacts } from '../guidelines/image-facts.js';

/**
 * The warning, in a dialog over the Media Manager window the files were dropped on (#179): the
 * guidelines at the top, the files that break one, each with its picture, what it is and why it is
 * listed, all ticked, and the two answers. The dialog's window is the desktop's; this is its content.
 */

/**
 * One listed file.
 * @param name Its name.
 * @param facts What it is.
 * @param kind Its row.
 * @param breaks What it breaks.
 * @returns It, checked.
 */
function listed(name: string, facts: Partial<UploadFacts>, kind: CheckedFile['kind'], breaks: CheckedFile['breaks']): CheckedFile {
  return {
    file: new File([new Uint8Array(13_200_000)], name, { type: 'image/jpeg' }),
    facts: { format: 'jpeg', width: 6000, height: 4000, location: false, animated: false, alphaChannel: false, ...facts },
    kind,
    breaks,
  };
}

/** The mock's four files. */
const FOUR = (): CheckedFile[] => [
  listed('DSC_0412.jpg', { location: true }, 'jpeg', ['size', 'location']),
  listed('DSC_0415.jpg', { location: true }, 'jpeg', ['size', 'location']),
  listed('team-day.png', { format: 'png', width: 3200, height: 2133 }, 'png-photo', ['size', 'format']),
  listed('tattoo-shop.jpg', { width: 1920, height: 1280, location: true }, 'jpeg', ['location']),
];

/**
 * The dialog's content on a request, as the desktop mounts it: its props set before it connects.
 * @param change What differs from the mock's.
 * @returns The element, and what it answered and asked.
 */
async function open(change: Partial<SheetRequest> = {}) {
  const request: SheetRequest = { listed: FOUR(), passing: 2, guidelines: DEFAULT_GUIDELINES, uploadLimit: 0, canOptimize: true, ...change };
  const answers: SheetAnswer[] = [];
  let settings = 0;
  let closes = 0;
  const element = await fixture<UmbraDesktopMediaGuidelinesDialogElement>(
    html`<umbradesktop-media-guidelines-dialog
      .request=${request}
      .folderName=${'Products'}
      .onAnswer=${(answer: SheetAnswer) => answers.push(answer)}
      .onSettings=${() => (settings += 1)}
      @umbradesktop-close-dialog=${() => (closes += 1)}></umbradesktop-media-guidelines-dialog>`,
  );
  return { element, request, answers, settings: () => settings, closes: () => closes };
}

/**
 * The text of something in the dialog, spaces collapsed.
 * @param element The dialog.
 * @param selector What to read.
 * @returns Its text.
 */
const text = (element: HTMLElement, selector: string) => element.shadowRoot!.querySelector(selector)!.textContent!.replace(/\s+/g, ' ').trim();

/**
 * Click something in the dialog.
 * @param element The dialog.
 * @param selector What to click.
 */
async function click(element: UmbraDesktopMediaGuidelinesDialogElement, selector: string): Promise<void> {
  (element.shadowRoot!.querySelector(selector) as HTMLElement).click();
  await element.updateComplete;
}

describe('the media guidelines warning', () => {
  it('says how many files do not follow the guidelines, and that the others are uploading', async () => {
    const { element } = await open();
    expect(text(element, '.head h2')).to.equal('4 of 6 files do not follow the media guidelines');
    expect(text(element, '.head p')).to.equal('The other 2 are uploading to Products now.');
  });

  it('says nothing is uploading when every file is listed', async () => {
    const { element } = await open({ passing: 0, listed: FOUR().slice(0, 1) });
    expect(text(element, '.head h2')).to.equal('1 file does not follow the media guidelines');
    expect(text(element, '.head p')).to.equal('Nothing has been uploaded yet.');
  });

  it('shows the guidelines under their heading, short, each with the icon its files\' actions carry', async () => {
    const { element } = await open();
    expect(text(element, '.rules h3')).to.equal('Media guidelines');
    const rules = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.rules .rule')];
    expect(rules.map((rule) => rule.textContent!.replace(/\s+/g, ' ').trim())).to.deep.equal(['2560 px', 'PNG photo → WebP', 'No GPS']);
    expect(rules.map((rule) => rule.dataset.break)).to.deep.equal(['size', 'format', 'location']);
    const icon = (selector: string) => element.shadowRoot!.querySelector(selector)!.querySelector('umb-icon')!.getAttribute('name');
    expect(icon('.rule[data-break="location"]')).to.equal(icon('.file .act[data-break="location"]'));
  });

  it('groups the format rules by the format they convert to', async () => {
    const rows = { ...DEFAULT_GUIDELINES.formats.rows, jpeg: 'webp' as const, 'png-transparent': 'jpeg' as const };
    const { element } = await open({ guidelines: { ...DEFAULT_GUIDELINES, formats: { ...DEFAULT_GUIDELINES.formats, rows } } });
    const formats = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.rule[data-break="format"]')].map((rule) => rule.textContent!.trim());
    expect(formats).to.deep.equal(['JPEG, PNG photo → WebP', 'PNG with transparency → JPEG']);
  });

  it('leaves out a guideline that is off', async () => {
    const { element } = await open({ guidelines: { ...DEFAULT_GUIDELINES, location: { on: false } } });
    expect([...element.shadowRoot!.querySelectorAll<HTMLElement>('.rules .rule')].map((rule) => rule.dataset.break)).to.deep.equal(['size', 'format']);
  });

  it('shows the upload limit among them only when a listed file is over it', async () => {
    const without = await open({ uploadLimit: 30_000_000 });
    expect(without.element.shadowRoot!.querySelector('.rule[data-break="upload-limit"]') === null).to.equal(true);
    const resized = listed('huge.jpg', {}, 'jpeg', ['size', 'upload-limit']);
    const only = listed('dense.jpg', { width: 2000, height: 1500 }, 'jpeg', ['upload-limit']);
    const { element } = await open({ uploadLimit: 10_000_000, listed: [resized, only] });
    expect(text(element, '.rule[data-break="upload-limit"]')).to.equal('10 MB');
    const rows = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.file')];
    expect(rows[0].querySelector('small')!.textContent).to.match(/, over 10 MB$/);
    // Resizing already brings it under the limit, so it is not said twice.
    expect(rows[0].querySelector('.act[data-break="upload-limit"]') === null).to.equal(true);
    expect(rows[1].querySelector('.act[data-break="upload-limit"]')!.textContent!.trim()).to.equal('Make it smaller than 10 MB');
  });

  it('says what Optimize will do to each file, in words', async () => {
    const { element } = await open();
    const rows = [...element.shadowRoot!.querySelectorAll<HTMLElement>('.file')];
    expect(rows).to.have.length(4);
    expect(rows[0].querySelector('img')!.src).to.match(/^blob:/);
    expect(rows[0].querySelector('small')!.textContent!.replace(/\s/g, ' ')).to.match(/^JPEG · 6000 × 4000 · 13[.,]2 MB$/);
    const acts = (row: HTMLElement) => [...row.querySelectorAll('.act')].map((act) => act.textContent!.trim());
    expect(acts(rows[0])).to.deep.equal(['Resize to 2560 px', 'Remove GPS']);
    expect(acts(rows[2])).to.deep.equal(['Resize to 2560 px', 'Convert to WebP']);
    expect(acts(rows[3])).to.deep.equal(['Remove GPS']);
  });

  it('says an unticked file uploads as it is', async () => {
    const { element } = await open();
    await click(element, '.file:nth-child(4) [role="checkbox"]');
    const row = element.shadowRoot!.querySelector<HTMLElement>('.file:nth-child(4)')!;
    expect(row.querySelector('.act') === null).to.equal(true);
    expect(row.querySelector('.as-is')!.textContent!.trim()).to.equal('Uploads as it is');
  });

  it('ticks every file, and counts what is ticked', async () => {
    const { element } = await open();
    expect(text(element, '.all .count')).to.equal('4 of 4 selected');
    await click(element, '.file:nth-child(4) [role="checkbox"]');
    expect(text(element, '.all .count')).to.equal('3 of 4 selected');
    expect(element.shadowRoot!.querySelector('[data-action="optimize"]')!.getAttribute('label')).to.equal('Optimize 3');
  });

  it('says what Optimize does', async () => {
    const { element } = await open();
    expect(text(element, '.what')).to.equal('Optimize fixes only what each selected file breaks, and uploads each one as soon as it is done.');
  });

  it('answers Upload as they are, and closes', async () => {
    const { element, answers, closes } = await open();
    await click(element, '[data-action="as-is"]');
    expect(answers).to.deep.equal([{ kind: 'as-is' }]);
    expect(closes()).to.equal(1);
  });

  it('answers Optimize with the ticked files only', async () => {
    const { element, answers, request } = await open();
    await click(element, '.file:nth-child(4) [role="checkbox"]');
    await click(element, '[data-action="optimize"]');
    expect(answers).to.have.length(1);
    const answer = answers[0] as Extract<SheetAnswer, { kind: 'optimize' }>;
    expect(answer.kind).to.equal('optimize');
    expect(answer.ticked).to.deep.equal(request.listed.slice(0, 3));
  });

  it('turns Optimize off with nothing ticked, and Select all ticks them again', async () => {
    const { element } = await open();
    await click(element, '.all [role="checkbox"]');
    expect(text(element, '.all .count')).to.equal('0 of 4 selected');
    expect((element.shadowRoot!.querySelector('[data-action="optimize"]') as HTMLButtonElement).disabled).to.equal(true);
    await click(element, '.all [role="checkbox"]');
    expect(text(element, '.all .count')).to.equal('4 of 4 selected');
  });

  it('answers none on Escape, and answers once', async () => {
    const { element, answers, closes } = await open();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    await click(element, '[data-action="as-is"]');
    expect(answers).to.deep.equal([{ kind: 'none' }]);
    expect(closes()).to.equal(1);
  });

  it('answers none when its dialog is closed without an answer', async () => {
    const { element, answers } = await open();
    element.remove();
    await Promise.resolve();
    expect(answers).to.deep.equal([{ kind: 'none' }]);
  });

  it('opens the guideline settings from its button, which says that is what it does', async () => {
    const { element, settings } = await open();
    expect(text(element, '[data-action="settings"]')).to.equal('Guideline settings');
    expect(element.shadowRoot!.querySelector('[data-action="settings"] umb-icon')!.getAttribute('name')).to.equal('icon-settings');
    await click(element, '[data-action="settings"]');
    expect(settings()).to.equal(1);
  });

  it('offers only Upload as they are when Optimize images is not there, and says why', async () => {
    const { element } = await open({ canOptimize: false });
    expect(element.shadowRoot!.querySelector('[data-action="optimize"]') === null).to.equal(true);
    expect(element.shadowRoot!.querySelector('.all') === null).to.equal(true);
    expect(text(element, '.what')).to.equal('Optimize images is not installed, so these can only be uploaded as they are.');
  });

  it('lets go of the files\' pictures when it closes', async () => {
    const { element } = await open();
    const src = element.shadowRoot!.querySelector<HTMLImageElement>('.file img')!.src;
    element.remove();
    expect(await fetch(src).then(() => true, () => false)).to.equal(false);
  });
});

describe('the size the warning asks for', () => {
  /**
   * A request for some copies of the mock's first file, which gets two actions.
   * @param count How many.
   * @returns The request.
   */
  const many = (count: number): SheetRequest => ({
    listed: Array.from({ length: count }, (_, i) => listed(`DSC_${i}.jpg`, { location: true }, 'jpeg', ['size', 'location'])),
    passing: 0,
    guidelines: DEFAULT_GUIDELINES,
    uploadLimit: 0,
    canOptimize: true,
  });

  it('grows with the files up to six rows, and stays that tall for more', () => {
    const one = guidelinesDialogSize(many(1));
    const six = guidelinesDialogSize(many(6));
    expect(one.w).to.equal(640);
    expect(six.h).to.be.greaterThan(one.h);
    expect(guidelinesDialogSize(many(40))).to.deep.equal(six);
  });

  it('gives a file with three actions a taller row', () => {
    const two = guidelinesDialogSize(many(1));
    const three = guidelinesDialogSize({ ...many(1), listed: [listed('team-day.png', { format: 'png', location: true }, 'png-photo', ['size', 'format', 'location'])] });
    expect(three.h).to.be.greaterThan(two.h);
  });
});
