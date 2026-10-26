import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import './media-health.element.js';
import type { UmbraDesktopMediaHealthElement } from './media-health.element.js';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthResult, UmbraDesktopMediaHealthState } from './media-health.context.js';
import type { HealthItem, HealthOrphan } from './health.client.js';
import { editPath } from '../manager/open-item.js';

/** The Media Health window (design §3, mock scenes 1 and 2). */

const MB = 1024 * 1024;

const item = (over: Partial<HealthItem> = {}): HealthItem => ({
  key: 'a',
  name: 'Banjo',
  mediaTypeAlias: 'Image',
  extension: 'jpg',
  sizeBytes: 100,
  parentKey: 'f',
  path: '/Products',
  usageCount: 1,
  used: true,
  ...over,
});

const orphan = (relativePath: string, sizeBytes = 10): HealthOrphan => ({ relativePath, url: `/media/${relativePath}`, sizeBytes, lastModifiedUtc: '2026-01-01T00:00:00Z' });

/** A checked library: two unused items, two orphans, one oversized image. */
const result = (): UmbraDesktopMediaHealthResult => {
  const items = [
    item({ key: 'big', name: 'Hero', sizeBytes: 3 * MB }),
    item({ key: 'old', name: 'Old banner', used: false, usageCount: 0, sizeBytes: 500, path: '/Products/2023' }),
    item({ key: 'older', name: 'Older banner', used: false, usageCount: 0, sizeBytes: 900, path: '/', extension: 'pdf' }),
    item({ key: 'face', name: 'Face', sizeBytes: 50, path: '/People' }),
  ];
  return {
    checkedAt: new Date(),
    library: { sizeBytes: 3 * MB + 1450, items: 4, folders: 3 },
    segments: [
      { name: 'Products', sizeBytes: 3 * MB + 500, other: false },
      { name: 'People', sizeBytes: 50, other: false },
      { name: '', sizeBytes: 900, other: true },
    ],
    items,
    unused: [items[2], items[1]],
    orphaned: [orphan('1/x.jpg', 30), orphan('2/y.png', 10)],
    oversized: [items[0]],
  };
};

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const dispose of cleanup) dispose();
  cleanup = [];
});

/**
 * The window on a stand-in context and user, recording what it asks.
 * @param state What the context holds.
 * @param isAdmin Whether the person is an administrator.
 */
async function healthWindow(state: UmbraDesktopMediaHealthState, isAdmin = true) {
  const asked: string[] = [];
  const tasks: Array<{ id: string; state: string }> = [];
  const opened: Array<{ key: string; path: string; name: string }> = [];
  const held = new UmbObjectState<UmbraDesktopMediaHealthState>(state);
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  wrapper.addEventListener('umbradesktop-task', (event) => tasks.push((event as CustomEvent).detail));
  wrapper.addEventListener('umbradesktop-open-attached', (event) => opened.push((event as CustomEvent).detail));
  new UmbContextProvider(wrapper, UMBRADESKTOP_MEDIA_HEALTH_CONTEXT, {
    getHostElement: () => wrapper,
    state: held.asObservable(),
    getState: () => held.getValue(),
    sync: async () => void asked.push('sync'),
    check: async () => void asked.push('check'),
    deleteOrphaned: async (paths: string[]) => {
      asked.push(`delete ${paths.join(',')}`);
      return { deleted: paths.length, skipped: [] };
    },
    trash: async (keys: string[]) => {
      asked.push(`trash ${keys.join(',')}`);
      return { failed: [] };
    },
    resized: () => undefined,
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMB_CURRENT_USER_CONTEXT, {
    getHostElement: () => wrapper,
    currentUser: new UmbObjectState({ isAdmin }).asObservable(),
  } as never).hostConnected();
  cleanup.push(() => wrapper.remove());
  const element = await fixture<UmbraDesktopMediaHealthElement>(html`<umbradesktop-media-health></umbradesktop-media-health>`, { parentNode: wrapper });
  await element.updateComplete;
  const text = () => element.shadowRoot!.textContent!.replace(/\s+/g, ' ');
  const button = (label: string, within = '') =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement & { disabled?: boolean }>(`${within} uui-button`)].find((each) => each.getAttribute('label') === label);
  const press = async (label: string, within = '') => {
    button(label, within)!.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  };
  return { element, held, asked, tasks, opened, text, button, press };
}

describe('the Media Health window', () => {
  it('asks the server once whether a check exists, and shows No check yet with Check until one does', async () => {
    const { asked, text, button, press } = await healthWindow({ phase: { kind: 'idle' }, result: undefined });
    expect(asked).to.deep.equal(['sync']);
    expect(text()).to.contain('No check yet');
    expect(button('Check')).to.not.equal(undefined);
    await press('Check');
    expect(asked).to.deep.equal(['sync', 'check']);
  });

  it('shows the library line, the bar, the three rows and when it was checked, after a check', async () => {
    const { element, text } = await healthWindow({ phase: { kind: 'idle' }, result: result() });
    expect(text()).to.contain('3 MB');
    expect(text()).to.contain('4 items in 3 folders');
    const legend = [...element.shadowRoot!.querySelectorAll('.legend span')].map((each) => each.textContent!.trim());
    expect(legend[0]).to.contain('Products');
    expect(legend[2]).to.contain('Other');
    expect(element.shadowRoot!.querySelectorAll('.segs span').length).to.equal(3);
    const rows = [...element.shadowRoot!.querySelectorAll('.row')].map((each) => each.textContent!.replace(/\s+/g, ' '));
    expect(rows.length).to.equal(3);
    expect(rows[0]).to.contain('Unused media');
    expect(rows[1]).to.contain('Orphaned files');
    expect(rows[2]).to.contain('Oversized images');
    expect(text()).to.contain('Checked today');
    expect(text()).to.contain('no page is placed');
  });

  it('shows the check running, and reports it to the desktop as a task until it ends', async () => {
    const { element, held, tasks, text, button } = await healthWindow({ phase: { kind: 'running', step: 'usage', scanned: 412, total: 1284 }, result: undefined });
    expect(text()).to.contain('Checking the library');
    expect(text()).to.contain('Finding what is used');
    expect(text()).to.match(/412 of 1[,.]284 items/);
    expect(button('Check')).to.equal(undefined);
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'running', completed: 412, total: 1284 });
    held.setValue({ phase: { kind: 'running', step: 'disk', scanned: 0, total: 0 }, result: undefined });
    await element.updateComplete;
    expect(text()).to.contain('Scanning the media folder');
    expect(tasks[tasks.length - 1]).to.not.have.property('total');
    held.setValue({ phase: { kind: 'idle' }, result: result() });
    await element.updateComplete;
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'done' });
    held.setValue({ phase: { kind: 'failed', message: 'Boom' }, result: result() });
    await element.updateComplete;
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'failed' });
    expect(text()).to.contain('Boom');
  });

  it('lists a category largest first, with name, folder and size, and opens an item beside the window', async () => {
    const { element, opened, press, text } = await healthWindow({ phase: { kind: 'idle' }, result: result() });
    await press('View', '[data-row=unused]');
    const rows = [...element.shadowRoot!.querySelectorAll('.item')].map((each) => each.textContent!.replace(/\s+/g, ' '));
    expect(rows.length).to.equal(2);
    expect(rows[0]).to.contain('Older banner');
    expect(rows[0]).to.contain('900 B');
    expect(rows[1]).to.contain('Old banner');
    expect(rows[1]).to.contain('Products/2023');
    (element.shadowRoot!.querySelector('.item .name') as HTMLElement).click();
    expect(opened[0]).to.deep.include({ key: 'item', path: editPath('older'), name: 'Older banner' });
    await press('Back');
    expect(text()).to.contain('no page is placed');
  });

  it('offers Edit image on an image only, and trashes an unused item through the Manager after asking', async () => {
    const { element, asked, press } = await healthWindow({ phase: { kind: 'idle' }, result: result() });
    element.confirmTrash = async () => true;
    await press('View', '[data-row=unused]');
    const rows = [...element.shadowRoot!.querySelectorAll('.item')];
    expect(rows[0].querySelector('uui-button[label="Edit image"]')).to.equal(null);
    expect(rows[1].querySelector('uui-button[label="Edit image"]')).to.not.equal(null);
    (rows[1].querySelector('uui-button[label="actions_trash"]') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(asked).to.deep.equal(['sync', 'trash old']);
  });

  it('greys Delete and Review: Delete for everyone but an administrator, with the reason, and Review until it is built', async () => {
    const admin = await healthWindow({ phase: { kind: 'idle' }, result: result() });
    expect(admin.button('Delete...')?.disabled).to.equal(false);
    expect(admin.button('Review...')?.disabled).to.equal(true);
    expect(admin.button('Review...')?.getAttribute('title')).to.equal('Coming later');
    const editor = await healthWindow({ phase: { kind: 'idle' }, result: result() }, false);
    expect(editor.button('Delete...')?.disabled).to.equal(true);
    expect(editor.button('Delete...')?.getAttribute('title')).to.equal('Only an administrator can delete files from disk.');
  });

  it('deletes every orphaned file through the server after asking', async () => {
    const { element, asked, press } = await healthWindow({ phase: { kind: 'idle' }, result: result() });
    element.confirmDelete = async () => false;
    await press('Delete...');
    element.confirmDelete = async () => true;
    await press('Delete...');
    expect(asked).to.deep.equal(['sync', 'delete 1/x.jpg,2/y.png']);
  });

  it('lists the orphaned files with a Delete each, for an administrator', async () => {
    const { element, asked, press } = await healthWindow({ phase: { kind: 'idle' }, result: result() });
    element.confirmDelete = async () => true;
    await press('View', '[data-row=orphaned]');
    const rows = [...element.shadowRoot!.querySelectorAll('.item')];
    expect(rows.length).to.equal(2);
    expect(rows[0].textContent).to.contain('1/x.jpg');
    (rows[1].querySelector('uui-button[label="Delete"]') as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(asked).to.deep.equal(['sync', 'delete 2/y.png']);
  });
});
