import { expect, fixture, html } from '@open-wc/testing';
import './disk-cleanup.element.js';
import type { DiskCleanupElement } from './disk-cleanup.element.js';
import type { RecycleBinCount, RecycleBinEmptyResult, RecycleBinId, RecycleBins } from './recycle-bins.js';

/**
 * Disk Cleanup: empties the content and media recycle bins, one or both, and never without asking.
 * The bins are faked; `recycle-bins.ts` is the real server, proved against a running Umbraco.
 */

/** A fake pair of bins, which empties what it is told to and remembers being told. */
class FakeBins implements RecycleBins {
  emptied: RecycleBinId[] = [];
  counts: Record<RecycleBinId, RecycleBinCount>;
  results: Partial<Record<RecycleBinId, RecycleBinEmptyResult>> = {};

  constructor(content: RecycleBinCount = { status: 'ok', total: 3 }, media: RecycleBinCount = { status: 'ok', total: 5 }) {
    this.counts = { content, media };
  }

  async count(bin: RecycleBinId) {
    return this.counts[bin];
  }

  async empty(bin: RecycleBinId) {
    this.emptied.push(bin);
    const result = this.results[bin] ?? { status: 'emptied' };
    if (result.status === 'emptied') this.counts[bin] = { status: 'ok', total: 0 };
    return result;
  }
}

/**
 * A mounted Disk Cleanup.
 * @param bins The bins.
 * @param answer What the confirmation answers.
 */
async function cleanup(bins = new FakeBins(), answer = true) {
  const asked: Array<Partial<Record<RecycleBinId, number>>> = [];
  const element = await fixture<DiskCleanupElement>(html`<umbradesktop-disk-cleanup
    .bins=${bins}
    .confirmCleanup=${async (counts: Partial<Record<RecycleBinId, number>>) => {
      asked.push(counts);
      return answer;
    }}
  ></umbradesktop-disk-cleanup>`);
  await settle(element);
  return { element, bins, asked };
}

/** Let the counts arrive and render. */
async function settle(element: DiskCleanupElement): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve));
    await element.updateComplete;
  }
}

/** A bin's row. */
const row = (element: DiskCleanupElement, bin: RecycleBinId) =>
  element.shadowRoot!.querySelector<HTMLElement>(`[data-bin="${bin}"]`)!;

/** A bin's checkbox. */
const box = (element: DiskCleanupElement, bin: RecycleBinId) => row(element, bin).querySelector<HTMLInputElement>('input')!;

/** Tick or untick a bin. */
async function tick(element: DiskCleanupElement, bin: RecycleBinId): Promise<void> {
  box(element, bin).click();
  await element.updateComplete;
}

/** The Clean up button. */
const cleanButton = (element: DiskCleanupElement) =>
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="clean"]')!;

/** Press Clean up and let it finish. */
async function clean(element: DiskCleanupElement): Promise<void> {
  cleanButton(element).click();
  await settle(element);
}

/** The status line. */
const status = (element: DiskCleanupElement) => (element.shadowRoot!.querySelector('.status')?.textContent ?? '').trim();

it('shows what is in each bin', async () => {
  const { element } = await cleanup();
  expect(row(element, 'content').textContent).to.contain('3 items');
  expect(row(element, 'media').textContent).to.contain('5 items');
});

/** Nothing is ticked to begin with: deleting starts with a choice, not with a default. */
it('starts with nothing ticked, and Clean up unavailable', async () => {
  const { element } = await cleanup();
  expect([box(element, 'content').checked, box(element, 'media').checked]).to.deep.equal([false, false]);
  expect(cleanButton(element).disabled).to.equal(true);
});

it('asks first, naming what it is about to delete', async () => {
  const { element, bins, asked } = await cleanup(new FakeBins(), false);
  await tick(element, 'content');
  await tick(element, 'media');
  await clean(element);
  expect(asked).to.deep.equal([{ content: 3, media: 5 }]);
  expect(bins.emptied, 'declined, so nothing').to.deep.equal([]);
});

it('empties both bins at once when both are ticked and the answer is yes', async () => {
  const { element, bins } = await cleanup();
  await tick(element, 'content');
  await tick(element, 'media');
  await clean(element);
  expect(bins.emptied).to.deep.equal(['content', 'media']);
  expect(row(element, 'content').textContent).to.contain('Empty');
  expect(row(element, 'media').textContent).to.contain('Empty');
});

it('empties only what is ticked', async () => {
  const { element, bins, asked } = await cleanup();
  await tick(element, 'media');
  await clean(element);
  expect(asked).to.deep.equal([{ media: 5 }]);
  expect(bins.emptied).to.deep.equal(['media']);
});

/** Somebody may have added to a bin since the window opened; the question names what is there now. */
it('counts again before asking', async () => {
  const bins = new FakeBins();
  const { element, asked } = await cleanup(bins, false);
  await tick(element, 'content');
  bins.counts.content = { status: 'ok', total: 7 };
  await clean(element);
  expect(asked).to.deep.equal([{ content: 7 }]);
});

it('cannot tick an empty bin', async () => {
  const { element } = await cleanup(new FakeBins({ status: 'ok', total: 0 }));
  expect(box(element, 'content').disabled).to.equal(true);
  expect(row(element, 'content').textContent).to.contain('Empty');
});

/** The server decides who may empty a bin, as it does in the Content and Media sections. */
it('cannot tick a bin the user may not empty, and says why', async () => {
  const { element } = await cleanup(new FakeBins({ status: 'denied' }));
  expect(box(element, 'content').disabled).to.equal(true);
  expect(row(element, 'content').textContent).to.contain('access');
  expect(box(element, 'media').disabled).to.equal(false);
});

it('says so when a bin could not be emptied, and empties the other anyway', async () => {
  const bins = new FakeBins();
  bins.results.content = { status: 'failed' };
  const { element } = await cleanup(bins);
  await tick(element, 'content');
  await tick(element, 'media');
  await clean(element);
  expect(bins.emptied).to.deep.equal(['content', 'media']);
  expect(status(element)).to.contain('content recycle bin could not be emptied');
  expect(row(element, 'media').textContent).to.contain('Empty');
});

it('counts again on Refresh', async () => {
  const bins = new FakeBins();
  const { element } = await cleanup(bins);
  bins.counts.media = { status: 'ok', total: 1 };
  element.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click();
  await settle(element);
  expect(row(element, 'media').textContent).to.contain('1 item');
  expect(row(element, 'media').textContent).to.not.contain('1 items');
});
