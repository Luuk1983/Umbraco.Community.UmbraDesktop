import { expect, fixture, html } from '@open-wc/testing';
import './health-overview.element.js';
import type { UmbraDesktopHealthOverviewElement } from './health-overview.element.js';
import { OVERVIEW_BESIDE_FROM, OVERVIEW_WIDE_FROM, STRIP_EDGE, STRIP_GAP, stripCount } from './health-overview.element.js';
import { cleanupOf } from './health-model.js';
import type { HealthKind } from './health-model.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { KEY_NAMES, result, textOf, tick } from './health.test-helper.js';

/**
 * The overview (design §16.2, reworked in §16.15, mock scene 1): the bar, the three kinds ticked, one
 * Clean up, the folders; cards side by side in a wide window, compact rows in a narrow one.
 */

/** A wide window's width: the window's opening width, where the cards have taken over. */
const WIDE = 960;

/** A narrow window's width: the old default. */
const NARROW = 640;

/**
 * The overview on the test library.
 * @param admin Whether the person is an administrator.
 * @param change What to change in the test library first.
 * @param now The time now.
 * @param width How wide the window is.
 */
async function overview(admin = true, change: (checked: ReturnType<typeof result>) => void = () => {}, now?: Date, width = WIDE) {
  const checked = result();
  change(checked);
  const signed: string[] = [];
  const keyed: string[] = [];
  const sign = async (subjects: Array<{ url: string; key?: string }>, edge: number) => {
    for (const subject of subjects) {
      signed.push(subject.url);
      if (subject.key) keyed.push(subject.key);
    }
    return new Map(subjects.map((subject) => [subject.url, `${subject.url}?width=${edge}&hmac=s`]));
  };
  const element = await fixture<UmbraDesktopHealthOverviewElement>(
    html`<umbradesktop-health-overview style="width:${width}px" .result=${checked} .admin=${admin} .signThumbnails=${sign} .now=${now}></umbradesktop-health-overview>`,
  );
  // The layout follows the measured width a frame late, and the strips the measured cards a frame
  // after that, so a few frames pass before the overview is whole.
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await tick();
    await element.updateComplete;
  }
  const root = element.shadowRoot!;
  const box = (kind: HealthKind) => root.querySelector<HTMLElement & { checked: boolean; disabled: boolean }>(`[data-row=${kind}] uui-checkbox`)!;
  const cleanUp = () => root.querySelector<HTMLElement & { disabled: boolean }>('uui-button.clean-up')!;
  return { element, checked, root, box, cleanUp, signed, keyed, text: () => textOf(element) };
}

describe('the Media Health overview', () => {
  it('shows the library, when it was checked, and Check again as a real button', async () => {
    const { root, text } = await overview();
    expect(text()).to.contain('Media library · 4 items');
    expect(text()).to.contain('Checked today');
    const again = root.querySelector('[label="Check again"]')!;
    expect(again.tagName.toLowerCase()).to.equal('uui-button');
  });

  it('cuts the bar by health in the rows’ colours, what can be freed on the right, and says so under it', async () => {
    const { root, checked, text } = await overview();
    const segments = [...root.querySelectorAll<HTMLElement>('.bar > span')].map((each) => each.dataset.kind);
    expect(segments, 'what Clean up empties sits at the end, as if it were poured out').to.deep.equal(['fine', 'oversized', 'orphaned', 'unused']);
    const line = [...root.querySelector('.bar-line')!.children].map((each) => textOf(each));
    expect(line[0], 'each figure under its own part of the bar').to.contain('in use');
    expect(line[1]).to.contain('can be freed');
    expect(text()).to.contain(`${formatBytes(checked.bar.freeable)} can be freed`);
    expect(text()).to.contain(`${formatBytes(checked.bar.fine)} in use`);
    expect(text(), 'just in use: the rest of the bar is what is not fine').to.not.contain('in use and fine');
  });

  it('ticks the three rows, and Clean up says what the ticked rows free', async () => {
    const { box, cleanUp, checked } = await overview();
    const all = new Set<HealthKind>(['unused', 'orphaned', 'oversized']);
    expect(['unused', 'orphaned', 'oversized'].map((kind) => box(kind as HealthKind).checked)).to.deep.equal([true, true, true]);
    expect(cleanUp().getAttribute('label')).to.equal(`Clean up about ${formatBytes(cleanupOf(checked.lists, all, true).bytes)}`);
  });

  it('lowers Clean up by exactly the unused row when it is unticked', async () => {
    const { element, box, cleanUp, checked } = await overview();
    const all = cleanupOf(checked.lists, new Set<HealthKind>(['unused', 'orphaned', 'oversized']), true).bytes;
    const without = cleanupOf(checked.lists, new Set<HealthKind>(['orphaned', 'oversized']), true).bytes;
    box('unused').click();
    await tick();
    await element.updateComplete;
    expect(all - without).to.equal(500);
    expect(cleanUp().getAttribute('label')).to.equal(`Clean up about ${formatBytes(without)}`);
  });

  it('asks for Clean up with the ticked rows', async () => {
    const { element, box, cleanUp } = await overview();
    const asked: HealthKind[][] = [];
    element.addEventListener('health-cleanup', (event) => asked.push((event as CustomEvent<{ kinds: HealthKind[] }>).detail.kinds));
    box('oversized').click();
    await tick();
    await element.updateComplete;
    cleanUp().click();
    await tick();
    expect(asked).to.deep.equal([['unused', 'orphaned']]);
  });

  it('disables Clean up, visibly, when nothing is ticked', async () => {
    const { element, box, cleanUp } = await overview();
    for (const kind of ['unused', 'orphaned', 'oversized'] as const) box(kind).click();
    await tick();
    await element.updateComplete;
    expect(cleanUp().disabled).to.equal(true);
    expect(cleanUp().getAttribute('label')).to.equal('Clean up');
  });

  it('unticks and disables the orphaned row for someone who is not an administrator, and says why', async () => {
    const { root, box } = await overview(false);
    expect(box('orphaned').checked).to.equal(false);
    expect(box('orphaned').disabled).to.equal(true);
    expect(textOf(root.querySelector('[data-row=orphaned]')!)).to.contain('Only an administrator can delete files.');
  });

  it('says a row has no known size rather than 0 B, and a part-known size as at least', async () => {
    const part = await overview();
    expect(textOf(part.root.querySelector('[data-row=unused] .size b')!).trim()).to.equal(`at least ${formatBytes(500)}`);
    expect(textOf(part.root.querySelector('[data-row=unused] .size small')!).trim(), 'how many it could not count').to.equal('1 of unknown size');
    const none = await overview(true, (checked) => (checked.lists.unused = checked.lists.unused.filter((each) => each.sizeBytes === null)));
    expect(textOf(none.root.querySelector('[data-row=unused] .size b')!).trim()).to.equal('Size unknown');
    expect(none.root.querySelector('[data-row=unused] .size small'), 'the row line already counts them').to.equal(null);
  });

  it('disables Clean up on a check older than a day, and leaves the warning to the window', async () => {
    const day = 24 * 60 * 60 * 1000;
    const { root, cleanUp } = await overview(true, (checked) => (checked.checkedAt = new Date(Date.now() - 5 * day)));
    expect(cleanUp().disabled).to.equal(true);
    expect(root.querySelectorAll('uui-button[label="Check again"]').length, 'one Check again, at the top').to.equal(1);
  });

  it('leaves Clean up on for a check from today', async () => {
    const { cleanUp } = await overview();
    expect(cleanUp().disabled).to.equal(false);
  });

  it('fits as many thumbnails as the width takes, the last place going to "+n" when more are left', () => {
    const step = STRIP_EDGE + STRIP_GAP;
    expect(stripCount(10 * step - STRIP_GAP, 28), 'ten places: nine pictures and +19').to.deep.equal({ shown: 9, more: 19 });
    expect(stripCount(10 * step - STRIP_GAP, 10), 'ten places, ten pictures: no +n').to.deep.equal({ shown: 10, more: 0 });
    expect(stripCount(10 * step - STRIP_GAP - 1, 28), 'a pixel short of ten places').to.deep.equal({ shown: 8, more: 20 });
    expect(stripCount(0, 3), 'before it is measured, still one place').to.deep.equal({ shown: 0, more: 3 });
  });

  it('gives every strip as many places as the narrowest row has, so the strips also end together', async () => {
    const { root } = await overview(true, (checked) => {
      // Sizes of different widths beside the two strips: "at least 500 B" over a note, and a plain size.
      const sizeless = checked.lists.unused.find((each) => each.sizeBytes === null)!;
      checked.lists.unused = [checked.lists.unused.find((each) => each.sizeBytes !== null)!, ...Array.from({ length: 39 }, () => sizeless)];
      checked.lists.orphaned = Array.from({ length: 40 }, () => checked.lists.orphaned[0]);
    });
    const tiles = [...root.querySelectorAll('[data-row=unused] .strip, [data-row=orphaned] .strip')].map((strip) => strip.children.length);
    expect(tiles[0], `places per row: ${tiles.join(', ')}`).to.equal(tiles[1]);
    expect(tiles[0]).to.be.greaterThan(3);
  });

  it('lays the three kinds out as cards side by side in a wide window, Clean up under them and Where the space goes a section of its own below', async () => {
    const { root, element, cleanUp } = await overview();
    expect(element.hasAttribute('wide')).to.equal(true);
    expect(element.hasAttribute('beside')).to.equal(false);
    const cards = [...root.querySelectorAll<HTMLElement>('.row')].map((each) => each.getBoundingClientRect());
    expect(new Set(cards.map((each) => Math.round(each.top))).size, 'one line of cards').to.equal(1);
    const space = root.querySelector('.space')!;
    expect(space.tagName.toLowerCase(), "a box of its own, with UUI's headline").to.equal('uui-box');
    expect(space.getAttribute('headline')).to.equal('Storage by folder');
    expect(cleanUp().getBoundingClientRect().bottom, 'Clean up goes with the kinds, above the folders').to.be.at.most(space.getBoundingClientRect().top);
    const strips = [...root.querySelectorAll<HTMLElement>('.row .strip')];
    expect(strips.length, 'each card has its thumbnails').to.equal(3);
    const line = root.querySelector('[data-row=unused] .text small')!.getBoundingClientRect();
    expect(strips[0].getBoundingClientRect().top).to.be.at.least(line.bottom);
  });

  it('turns them into compact rows without thumbnails in a narrow window, with the folders under them', async () => {
    const { root, element, signed } = await overview(true, () => {}, undefined, NARROW);
    expect(element.hasAttribute('wide')).to.equal(false);
    expect(root.querySelectorAll('.strip').length).to.equal(0);
    expect(signed, 'no thumbnail is asked for that is not drawn').to.deep.equal([]);
    const rows = [...root.querySelectorAll<HTMLElement>('.row')].map((each) => each.getBoundingClientRect());
    expect(rows[1].top).to.be.at.least(rows[0].bottom);
    const space = root.querySelector('.space')!.getBoundingClientRect();
    expect(space.top).to.be.at.least(rows[2].bottom);
  });

  it('switches at the width where the cards take over', async () => {
    expect((await overview(true, () => {}, undefined, OVERVIEW_WIDE_FROM)).element.hasAttribute('wide')).to.equal(true);
    expect((await overview(true, () => {}, undefined, OVERVIEW_WIDE_FROM - 1)).element.hasAttribute('wide')).to.equal(false);
  });

  it('puts Where the space goes beside the cards only in a very wide window', async () => {
    const { root, element } = await overview(true, () => {}, undefined, OVERVIEW_BESIDE_FROM);
    expect(element.hasAttribute('beside')).to.equal(true);
    const cards = [...root.querySelectorAll<HTMLElement>('.row')].map((each) => each.getBoundingClientRect());
    expect(root.querySelector('.space')!.getBoundingClientRect().left).to.be.at.least(Math.max(...cards.map((each) => each.right)));
    expect((await overview(true, () => {}, undefined, OVERVIEW_BESIDE_FROM - 1)).element.hasAttribute('beside')).to.equal(false);
  });

  it('draws an icon, not a broken picture, for an item without a file', async () => {
    const { root } = await overview();
    const strip = root.querySelector('[data-row=unused] .strip')!;
    expect(strip.querySelectorAll('img').length).to.equal(1);
    expect(strip.querySelectorAll('uui-icon').length).to.equal(1);
  });

  it('shows thumbnails only once the server has signed them, and asks only for pictures', async () => {
    const { root, signed, keyed } = await overview();
    expect(signed).to.include('/media/o/old.jpg');
    expect(keyed, 'an item is asked for by its key, for core to sign').to.include('old');
    expect(signed, 'an orphaned file by its URL alone').to.include('/media/1/x.jpg');
    expect(signed, 'a PDF is drawn as an icon, not asked for').to.not.include('/media/n/notes.pdf');
    expect(root.querySelector('[data-row=unused] .strip img')!.getAttribute('src')).to.match(/^\/media\/o\/old\.jpg\?width=\d+&hmac=s$/);
  });

  it('shows where the space goes by top-level folder, the root last when it is smallest', async () => {
    const { root } = await overview();
    const names = [...root.querySelectorAll('.space .folder .name')].map((each) => each.textContent!.trim());
    expect(names).to.deep.equal(['Products', 'At the root', 'People']);
  });

  describe('opening the list and the folders (design §16.15)', () => {
    /**
     * Every grid the overview asks for.
     * @param element The overview.
     */
    const opened = (element: HTMLElement) => {
      const asked: unknown[] = [];
      element.addEventListener('health-open-grid', (event) => asked.push((event as CustomEvent).detail));
      return asked;
    };

    it('opens a row’s list from its See all, and greys out an empty row’s', async () => {
      const { element, root } = await overview(true, (checked) => (checked.lists.oversized = []));
      const asked = opened(element);
      const seeAll = (kind: HealthKind) => root.querySelector<HTMLElement & { disabled: boolean }>(`[data-row=${kind}] uui-button.see-all`)!;
      seeAll('orphaned').click();
      await tick();
      expect(asked).to.deep.equal([{ kind: 'orphaned' }]);
      expect(seeAll('oversized').disabled).to.equal(true);
    });

    it('opens a row’s list from its strip of thumbnails too', async () => {
      const { element, root } = await overview();
      const asked = opened(element);
      root.querySelector<HTMLElement>('[data-row=unused] .strip')!.click();
      expect(asked).to.deep.equal([{ kind: 'unused' }]);
    });

    it('opens a folder’s breakdown from Where the space goes, the root as the library, and the top from Browse all folders', async () => {
      const { element, root } = await overview();
      const asked: unknown[] = [];
      element.addEventListener('health-open-folder', (event) => asked.push((event as CustomEvent).detail));
      const lists = opened(element);
      const folders = [...root.querySelectorAll<HTMLElement>('.space button.folder')];
      folders[0].click();
      folders[1].click();
      root.querySelector<HTMLElement>('.space uui-button.all-folders')!.click();
      await tick();
      expect(asked).to.deep.equal([{ folderKey: 'f' }, { folderKey: null }, { folderKey: null }]);
      expect(lists, 'a folder opens its breakdown, not the cleanup list').to.deep.equal([]);
    });
  });

  it('says how many are kept beside a row’s line (design §16.6)', async () => {
    const { element } = await overview(true, (checked) => (checked.keptCount = { unused: 12, orphaned: 0, oversized: 0 }));
    const unused = element.shadowRoot!.querySelector('[data-row="unused"]')!;
    expect(textOf(unused)).to.contain('12 kept');
    expect(textOf(element.shadowRoot!.querySelector('[data-row="orphaned"]')!)).to.not.contain('kept');
  });

  it('names no key', async () => {
    expect((await overview()).text()).to.not.match(KEY_NAMES);
  });
});
