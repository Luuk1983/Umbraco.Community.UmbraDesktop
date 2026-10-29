import { expect, fixture, html } from '@open-wc/testing';
import './health-keep-sheet.element.js';
import type { UmbraDesktopHealthKeepSheetElement } from './health-keep-sheet.element.js';
import { KEEP_NOTE_MAX } from './health.client.js';
import { KEY_NAMES, textOf, tick } from './health.test-helper.js';

/**
 * Keep… asks two things, both with defaults so it stays one click (design §16.6, mock scene 8): why,
 * which may stay empty, and for how long, a year unless changed.
 */

/**
 * The sheet for some rows.
 * @param count How many are kept.
 * @param name The one row's name, when there is one.
 */
async function sheet(count: number, name?: string) {
  const element = await fixture<UmbraDesktopHealthKeepSheetElement>(html`<umbradesktop-health-keep-sheet .count=${count} .name=${name}></umbradesktop-health-keep-sheet>`);
  const answers: Array<{ name: string; detail: unknown }> = [];
  for (const each of ['health-keep-confirm', 'health-keep-cancel']) element.addEventListener(each, (event) => answers.push({ name: each, detail: (event as CustomEvent).detail }));
  const root = element.shadowRoot!;
  const press = async (label: string) => {
    root.querySelector<HTMLElement>(`uui-button[label="${label}"]`)!.click();
    await tick();
  };
  return { element, root, answers, press, text: () => textOf(element) };
}

describe('the Keep sheet', () => {
  it('asks to keep the one row by its name, or so many items', async () => {
    expect((await sheet(1, 'banner-01.png')).text()).to.contain('Keep banner-01.png?');
    expect((await sheet(12)).text()).to.contain('Keep 12 items?');
  });

  it('keeps for a year with no note on one click', async () => {
    const { press, answers } = await sheet(1, 'x');
    await press('Keep');
    expect(answers).to.deep.equal([{ name: 'health-keep-confirm', detail: { note: '', duration: 'Year' } }]);
  });

  it('takes a note up to the server’s length, and a duration of three months or always', async () => {
    const { root, press, answers, element } = await sheet(2);
    const note = root.querySelector<HTMLElement & { value: string; maxlength: number }>('uui-textarea')!;
    expect(note.maxlength).to.equal(KEEP_NOTE_MAX);
    note.value = 'Linked from the newsletter';
    note.dispatchEvent(new Event('input'));
    root.querySelector<HTMLElement>('uui-radio[value="ThreeMonths"]')!.click();
    await element.updateComplete;
    await press('Keep');
    expect(answers[0].detail).to.deep.equal({ note: 'Linked from the newsletter', duration: 'ThreeMonths' });
  });

  it('says what happens when the time is up, and what Always means', async () => {
    const { text, root, element } = await sheet(1, 'x');
    expect(text()).to.contain('comes back to its list');
    root.querySelector<HTMLElement>('uui-radio[value="Always"]')!.click();
    await element.updateComplete;
    expect(text()).to.contain('until someone stops keeping');
  });

  it('cancels from Cancel and from the backdrop', async () => {
    const { press, answers, root } = await sheet(1, 'x');
    await press('Cancel');
    root.querySelector<HTMLElement>('.backdrop')!.click();
    expect(answers.map((each) => each.name)).to.deep.equal(['health-keep-cancel', 'health-keep-cancel']);
  });

  it('names no key', async () => {
    expect((await sheet(1, 'x')).text()).to.not.match(KEY_NAMES);
  });
});
