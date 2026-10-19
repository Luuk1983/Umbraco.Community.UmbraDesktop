import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';
import './transfers.element.js';
import type { UmbraDesktopMediaTransfersElement } from './transfers.element.js';
import type { UmbraDesktopTransfer } from './transfers-model.js';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';

/** The Transfers window (design §7, plan task 7.6). */

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * A copy of three items to Design, running.
 * @param over What differs.
 * @returns The transfer.
 */
const copy = (over: Partial<UmbraDesktopTransfer> = {}): UmbraDesktopTransfer => ({
  id: 'copy',
  kind: 'copy',
  target: 'design',
  targetName: 'Design',
  startedAt: Date.now(),
  state: 'running',
  canPause: true,
  rows: [
    { key: 'a', name: 'Banjo', status: 'done' },
    { key: 'b', name: 'Clip', status: 'running' },
    { key: 'c', name: 'Drum', status: 'waiting' },
  ],
  samples: [],
  ...over,
});

/**
 * The window on a stand-in desktop context, recording what it is asked.
 * @param transfers What the context holds.
 * @returns The window, the context's list and what it was asked.
 */
async function transfersWindow(transfers: UmbraDesktopTransfer[]) {
  const asked: string[] = [];
  const tasks: Array<{ id: string; state: string; completed?: number; total?: number; failed?: number }> = [];
  const state = new UmbArrayState<UmbraDesktopTransfer>(transfers, (each) => each.id);
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  wrapper.addEventListener('umbradesktop-task', (event) => tasks.push((event as CustomEvent).detail));
  new UmbContextProvider(wrapper, UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, {
    getHostElement: () => wrapper,
    transfers: state.asObservable(),
    pauseTransfer: (id: string) => asked.push(`pause ${id}`),
    resumeTransfer: (id: string) => asked.push(`resume ${id}`),
    cancelTransfer: (id: string) => asked.push(`cancel ${id}`),
    retryTransfer: async (id: string, keys?: string[]) => void asked.push(`retry ${id}${keys ? ' ' + keys.join(',') : ''}`),
    clearFinishedTransfers: () => asked.push('clear'),
  } as never).hostConnected();
  cleanup.push(() => wrapper.remove());
  const element = await fixture<UmbraDesktopMediaTransfersElement>(html`<umbradesktop-media-transfers></umbradesktop-media-transfers>`, { parentNode: wrapper });
  await element.updateComplete;
  const button = (label: string) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement & { disabled?: boolean }>('uui-button')].find((each) => each.getAttribute('label') === label);
  return { element, state, asked, tasks, button };
}

describe('the Transfers window', () => {
  it('shows a section per transfer, with its title, its bar and a row per item', async () => {
    const { element } = await transfersWindow([copy(), copy({ id: 'move', kind: 'move' })]);
    const sections = element.shadowRoot!.querySelectorAll('.transfer');
    expect(sections.length).to.equal(2);
    expect(sections[0].querySelector('.title')?.textContent).to.contain('umbraDesktopMedia_transferCopying');
    expect(sections[0].querySelectorAll('.row').length).to.equal(3);
    expect((sections[0].querySelector('.bar > span') as HTMLElement).style.width).to.equal('33.3333%');
  });

  it('reports what runs as tasks, so its window shows progress and asks before closing', async () => {
    const { tasks, state } = await transfersWindow([copy()]);
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'copy', state: 'running', completed: 1, total: 3 });
    state.setValue([copy({ state: 'finished', rows: [{ key: 'a', name: 'Banjo', status: 'failed', reason: 'Too big' }] })]);
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'copy', state: 'failed', failed: 1 });
  });

  it('pauses and resumes a transfer', async () => {
    const { element, asked, button, state } = await transfersWindow([copy()]);
    button('umbraDesktopMedia_transferPause')!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    state.setValue([copy({ state: 'paused' })]);
    await element.updateComplete;
    button('umbraDesktopMedia_transferResume')!.click();
    // uui's button clicks once it has updated.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(asked).to.deep.equal(['pause copy', 'resume copy']);
  });

  it('greys Pause for an upload, which core cannot pause', async () => {
    const { button } = await transfersWindow([copy({ kind: 'upload', canPause: false })]);
    expect(button('umbraDesktopMedia_transferPause')?.disabled).to.equal(true);
  });

  it('asks before cancelling, and cancels on yes only', async () => {
    const { element, asked, button } = await transfersWindow([copy()]);
    element.confirmCancel = async () => false;
    button('umbraDesktopMedia_transferCancel')!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    element.confirmCancel = async () => true;
    button('umbraDesktopMedia_transferCancel')!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(asked).to.deep.equal(['cancel copy']);
  });

  it('folds a finished transfer to its failures, each with Retry, and Retry failed for them all', async () => {
    const { element, asked, button } = await transfersWindow([
      copy({
        state: 'finished',
        rows: [
          { key: 'a', name: 'Banjo', status: 'done' },
          { key: 'b', name: 'Clip', status: 'failed', reason: 'Too big' },
        ],
      }),
    ]);
    const rows = element.shadowRoot!.querySelectorAll('.row');
    expect(rows.length).to.equal(2);
    expect(rows[0].textContent).to.contain('Too big');
    (rows[0].querySelector('uui-button') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    button('umbraDesktopMedia_transferRetryFailed')!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(asked).to.deep.equal(['retry copy b', 'retry copy']);
  });

  it('forgets the finished transfers when it closes', async () => {
    const { element, asked } = await transfersWindow([copy({ state: 'finished' })]);
    element.remove();
    expect(asked).to.include('clear');
  });
});
