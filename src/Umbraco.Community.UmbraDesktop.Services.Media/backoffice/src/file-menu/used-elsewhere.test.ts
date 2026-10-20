import { expect, fixture, html } from '@open-wc/testing';
import './file-menu.element.js';
import type { UmbraDesktopMediaFileMenuElement } from './file-menu.element.js';
import type { FileMenuDeps } from './deps.js';
import type { FileMenuDocument } from './types.js';
import en from '../localization/en.js';

/**
 * Saving over a file used elsewhere asks first, once per opened file (#137, edit-image design §5).
 * The media library keeps one copy of a file that pages, members and other media point at, so a save
 * over it changes it in every one of them. The question lives here, in the file menu's save, because
 * all three ways of saving over a file come through it: the app's own Save, the menu's Save, and
 * Replace in Save as.
 */

const words = en.umbraDesktopServicesMedia;

/** A document to show. */
const DOC: FileMenuDocument = {
  unique: 'k1',
  name: 'Beach',
  folder: 'f1',
  folderName: 'Holidays',
  updateDate: '2026-10-17T10:00:00Z',
  extension: 'jpg',
  width: 1600,
  height: 1200,
  bytes: 2_000_000,
};

/** What the fakes saw. */
interface Seen {
  /** Every save request, by whether it named an item to overwrite. */
  saves: Array<{ existing?: string }>;
  /** Every question asked, as the name and count it was asked with. */
  asked: Array<[string, number]>;
  /** Every item whose references were counted. */
  counted: string[];
  /** The item each question was about, so it can list where that item is used. */
  about: string[];
}

/**
 * A file menu with fake deps.
 * @param options How many places each item is used in, and how the question is answered.
 * @param options.references The count by item; a missing item counts nothing, and `'fail'` fails.
 * @param options.answers What each question answers in turn; yes when they run out.
 * @returns The element and what the fakes saw.
 */
async function menu(options: { references?: Record<string, number> | 'fail'; answers?: boolean[] } = {}) {
  const seen: Seen = { saves: [], asked: [], counted: [], about: [] };
  const answers = [...(options.answers ?? [])];
  const deps: FileMenuDeps = {
    context: {
      open: async () => ({ status: 'cancelled' }),
      recent: async () => [],
      forgetRecent: () => undefined,
      save: async (request) => {
        seen.saves.push({ existing: request.existing });
        return { ok: true, unique: request.existing ?? 'copy1', updateDate: 'd2' };
      },
      pickSaveFolder: async () => ({ status: 'cancelled' }),
      confirmOverwrite: async () => true,
    },
    thumbnails: async () => new Map(),
    confirmDiscard: async () => true,
    references: async (unique) => {
      seen.counted.push(unique);
      if (options.references === 'fail') throw new Error('No answer.');
      return options.references?.[unique] ?? 0;
    },
    confirmUsedElsewhere: async (name, count, unique) => {
      seen.asked.push([name, count]);
      seen.about.push(unique);
      return answers.shift() ?? true;
    },
  };
  const element = await fixture<UmbraDesktopMediaFileMenuElement>(
    html`<umbradesktop-media-file-menu
      style="position: relative; width: 1100px; height: 700px"
      .deps=${deps}
      .document=${DOC}
      .dirty=${true}
      .encode=${async () => new Blob([new Uint8Array(100)])}></umbradesktop-media-file-menu>`,
  );
  await settle(element);
  return { element, seen };
}

/**
 * Let a lookup or a save finish and render.
 * @param element The menu.
 */
async function settle(element: UmbraDesktopMediaFileMenuElement): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await element.updateComplete;
  }
}

/** A command of the menu. */
const command = (element: HTMLElement, name: string) =>
  element.shadowRoot!.querySelector(`button[data-command="${name}"]`) as HTMLButtonElement;

/** A button in a panel's footer, by what it does. */
const action = (element: HTMLElement, name: string) =>
  element.shadowRoot!.querySelector(`button[data-action="${name}"]`) as HTMLButtonElement;

/** Info's facts, as label and value pairs. */
const facts = (element: HTMLElement) =>
  [...element.shadowRoot!.querySelectorAll('.info dt')].map((dt) => [dt.textContent!.trim(), dt.nextElementSibling!.textContent!.trim()]);

describe('saving over a file used elsewhere', () => {
  it("asks first on the app's Save, with the name and the count, and saves on a yes", async () => {
    const { element, seen } = await menu({ references: { k1: 4 } });
    const outcome = await element.save();
    expect(seen.asked).to.deep.equal([['Beach', 4]]);
    expect(outcome.status).to.equal('saved');
    expect(seen.saves.length).to.equal(1);
  });

  it('asks only once for the file it has open', async () => {
    const { element, seen } = await menu({ references: { k1: 4 } });
    await element.save();
    await element.save();
    expect(seen.asked.length).to.equal(1);
    expect(seen.saves.length).to.equal(2);
  });

  it('saves nothing on a no, as the overwrite question does, and asks again next time', async () => {
    const { element, seen } = await menu({ references: { k1: 4 }, answers: [false] });
    expect((await element.save()).status).to.equal('cancelled');
    expect(seen.saves.length).to.equal(0);
    await element.save();
    expect(seen.asked.length).to.equal(2);
    expect(seen.saves.length).to.equal(1);
  });

  /** The question lists the places, with core's own references list, as core's trash question does. */
  it('names the item, so the question can list where it is used', async () => {
    const { element, seen } = await menu({ references: { k1: 4 } });
    await element.save();
    expect(seen.about).to.deep.equal(['k1']);
  });

  it("asks on the menu's Save", async () => {
    const { element, seen } = await menu({ references: { k1: 2 } });
    element.show();
    await element.updateComplete;
    command(element, 'save').click();
    await settle(element);
    expect(seen.asked).to.deep.equal([['Beach', 2]]);
    expect(seen.saves.length).to.equal(1);
  });

  it("asks on Save as's Replace", async () => {
    const { element, seen } = await menu({ references: { k1: 2 } });
    element.show('saveAs');
    await settle(element);
    action(element, 'save').click();
    await settle(element);
    expect(seen.asked).to.deep.equal([['Beach', 2]]);
    expect(seen.saves).to.deep.equal([{ existing: 'k1' }]);
  });

  it('never asks about a copy, which changes nothing else', async () => {
    const { element, seen } = await menu({ references: { k1: 2 } });
    element.show('saveAs');
    await settle(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('button[data-mode="copy"]')!.click();
    await settle(element);
    action(element, 'save').click();
    await settle(element);
    expect(seen.asked).to.deep.equal([]);
    expect(seen.saves).to.deep.equal([{ existing: undefined }]);
  });

  it('does not ask about a file used nowhere else, or when the count could not be read', async () => {
    const unused = await menu({ references: { k1: 0 } });
    await unused.element.save();
    expect(unused.seen.asked).to.deep.equal([]);
    const failing = await menu({ references: 'fail' });
    await failing.element.save();
    expect(failing.seen.asked).to.deep.equal([]);
    expect(failing.seen.saves.length).to.equal(1);
  });

  it('counts when the file is opened, and asks again for the next file opened', async () => {
    const { element, seen } = await menu({ references: { k1: 4, k2: 1 } });
    expect(seen.counted).to.deep.equal(['k1']);
    await element.save();
    element.document = { ...DOC, unique: 'k2', name: 'Dunes' };
    await settle(element);
    expect(seen.counted).to.deep.equal(['k1', 'k2']);
    await element.save();
    expect(seen.asked).to.deep.equal([
      ['Beach', 4],
      ['Dunes', 1],
    ]);
  });
});

describe("Info's Used in", () => {
  it('says how many places use the file', async () => {
    const { element } = await menu({ references: { k1: 4 } });
    element.show('info');
    await settle(element);
    expect(facts(element)).to.deep.include([words.infoUsedIn, words.infoUsedInMany.replace('%0%', '4')]);
  });

  it('says one place, and says when it is used nowhere', async () => {
    const one = await menu({ references: { k1: 1 } });
    one.element.show('info');
    await settle(one.element);
    expect(facts(one.element)).to.deep.include([words.infoUsedIn, words.infoUsedInOne]);
    const none = await menu({ references: { k1: 0 } });
    none.element.show('info');
    await settle(none.element);
    expect(facts(none.element)).to.deep.include([words.infoUsedIn, words.infoUsedInNone]);
  });

  it('leaves the row out when the count could not be read', async () => {
    const { element } = await menu({ references: 'fail' });
    element.show('info');
    await settle(element);
    expect(facts(element).map(([label]) => label)).to.not.include(words.infoUsedIn);
  });
});
