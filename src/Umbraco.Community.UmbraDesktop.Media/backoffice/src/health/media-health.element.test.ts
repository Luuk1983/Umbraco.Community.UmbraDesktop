import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState } from '@umbraco-cms/backoffice/observable-api';
import { UMB_CURRENT_USER_CONTEXT } from '@umbraco-cms/backoffice/current-user';
import './media-health.element.js';
import type { UmbraDesktopMediaHealthElement } from './media-health.element.js';
import { UMBRADESKTOP_MEDIA_HEALTH_CONTEXT } from './media-health.context.js';
import type { UmbraDesktopMediaHealthState } from './media-health.context.js';
import type { HealthKind } from './health-model.js';
import { KEY_NAMES, cleanupState, result, textOf } from './health.test-helper.js';

/**
 * The Media Health window (design §16): one screen at a time, from the context's state, and the
 * check and Clean up reported to the desktop as tasks.
 */

let removals: Array<() => void> = [];
afterEach(() => {
  for (const remove of removals) remove();
  removals = [];
});

/** The state before anything is known. */
const idle = (over: Partial<UmbraDesktopMediaHealthState> = {}): UmbraDesktopMediaHealthState => ({
  phase: { kind: 'idle' },
  result: undefined,
  mediaCount: 3,
  cleanup: undefined,
  ...over,
});

/**
 * The window on a stand-in context and user, recording what it asks.
 * @param state What the context holds.
 * @param isAdmin Whether the person is an administrator.
 * @param refuse Why the context refuses Clean up, when it does.
 */
async function healthWindow(state: UmbraDesktopMediaHealthState, isAdmin = true, refuse?: 'newer' | 'stale') {
  const asked: string[] = [];
  const tasks: Array<Record<string, unknown>> = [];
  const held = new UmbObjectState<UmbraDesktopMediaHealthState>(state);
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  removals.push(() => wrapper.remove());
  wrapper.addEventListener('umbradesktop-task', (event) => tasks.push((event as CustomEvent).detail));
  new UmbContextProvider(wrapper, UMBRADESKTOP_MEDIA_HEALTH_CONTEXT, {
    getHostElement: () => wrapper,
    state: held.asObservable(),
    getState: () => held.getValue(),
    sync: async () => void asked.push('sync'),
    watch: () => {
      asked.push('watch');
      return () => void asked.push('unwatch');
    },
    stop: async () => void asked.push('stop'),
    check: async () => void asked.push('check'),
    cleanUp: async (kinds: ReadonlySet<HealthKind>, options: { title?: string }) => {
      asked.push(`cleanUp ${[...kinds].join(',')} ${options?.title ?? ''}`.trim());
      return refuse ? { refused: refuse } : cleanupState();
    },
    undoCleanup: async () => {
      asked.push('undo');
      return { failed: [] };
    },
    dismissCleanup: () => void asked.push('dismiss'),
    trash: async (keys: string[]) => {
      asked.push(`trash ${keys.join(',')}`);
      return { trashed: [], failed: [] };
    },
    deleteOrphaned: async (paths: string[]) => {
      asked.push(`delete ${paths.join(',')}`);
      return { deleted: paths.length, skipped: [] };
    },
    optimize: (keys: string[], options: { title?: string }) => {
      asked.push(`optimize ${keys.join(',')} ${options?.title ?? ''}`.trim());
      return true;
    },
    showInManager: (entry: { id: string }) => {
      asked.push(`show ${entry.id}`);
      return true;
    },
    thumbnails: async () => new Map<string, string>(),
  } as never).hostConnected();
  new UmbContextProvider(wrapper, UMB_CURRENT_USER_CONTEXT, {
    getHostElement: () => wrapper,
    currentUser: new UmbObjectState({ isAdmin }).asObservable(),
  } as never).hostConnected();
  const element = await fixture<UmbraDesktopMediaHealthElement>(html`<umbradesktop-media-health></umbradesktop-media-health>`, { parentNode: wrapper });
  await element.updateComplete;
  const screen = () => element.shadowRoot!.querySelector('[data-screen]')?.getAttribute('data-screen');
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    await element.updateComplete;
  };
  const set = async (next: UmbraDesktopMediaHealthState) => {
    held.setValue(next);
    await settle();
  };
  return { element, held, asked, tasks, screen, settle, set, text: () => textOf(element) };
}

describe('the Media Health window', () => {
  it('asks the server once whether a check exists, and invites one until it does', async () => {
    const { asked, screen, element, settle } = await healthWindow(idle());
    expect(asked.filter((each) => each !== 'watch')).to.deep.equal(['sync']);
    expect(screen()).to.equal('start');
    element.shadowRoot!.querySelector('umbradesktop-health-start')!.dispatchEvent(new CustomEvent('health-check', { bubbles: true, composed: true }));
    await settle();
    expect(asked.filter((each) => each !== 'watch')).to.deep.equal(['sync', 'check']);
  });

  it('shows the overview once there is a result, and Checking while a check runs', async () => {
    const { screen, set } = await healthWindow(idle({ result: result() }));
    expect(screen()).to.equal('overview');
    await set(idle({ phase: { kind: 'running', step: 'usage', scanned: 1, total: 2 }, result: result() }));
    expect(screen()).to.equal('start');
  });

  it('declares the four health colours once, for every screen and every theme to read', async () => {
    const { element } = await healthWindow(idle({ result: result() }));
    // The test page has no backoffice theme, so stand in UUI's colours the way a theme sets them.
    for (const name of ['danger', 'warning', 'positive', 'interactive']) element.parentElement!.style.setProperty(`--uui-color-${name}`, 'rgb(1, 2, 3)');
    const style = getComputedStyle(element);
    for (const kind of ['unused', 'orphaned', 'oversized', 'fine']) expect(style.getPropertyValue(`--umbradesktop-health-${kind}`).trim(), kind).to.not.equal('');
  });

  it('asks once before Clean up, over the overview, and runs it with the ticked rows', async () => {
    const { element, asked, settle } = await healthWindow(idle({ result: result() }));
    const overview = element.shadowRoot!.querySelector('umbradesktop-health-overview')!;
    overview.dispatchEvent(new CustomEvent('health-cleanup', { detail: { kinds: ['unused', 'orphaned'] }, bubbles: true, composed: true }));
    await settle();
    const sheet = element.shadowRoot!.querySelector('umbradesktop-health-cleanup-sheet')!;
    expect(sheet).to.not.equal(null);
    expect(element.shadowRoot!.querySelector('umbradesktop-health-overview')).to.not.equal(null);
    sheet.dispatchEvent(new CustomEvent('health-cleanup-cancel', { bubbles: true, composed: true }));
    await settle();
    expect(element.shadowRoot!.querySelector('umbradesktop-health-cleanup-sheet')).to.equal(null);
    expect(asked.filter((each) => each !== 'watch')).to.deep.equal(['sync']);
    overview.dispatchEvent(new CustomEvent('health-cleanup', { detail: { kinds: ['unused', 'orphaned'] }, bubbles: true, composed: true }));
    await settle();
    element.shadowRoot!.querySelector('umbradesktop-health-cleanup-sheet')!.dispatchEvent(new CustomEvent('health-cleanup-confirm', { bubbles: true, composed: true }));
    await settle();
    expect(asked.filter((each) => each !== 'watch')).to.deep.equal(['sync', 'cleanUp unused,orphaned Oversized images']);
  });

  it('never sends orphaned files from someone who is not an administrator', async () => {
    const { element, asked, settle } = await healthWindow(idle({ result: result() }), false);
    element.shadowRoot!.querySelector('umbradesktop-health-overview')!.dispatchEvent(new CustomEvent('health-cleanup', { detail: { kinds: ['unused', 'orphaned'] }, bubbles: true, composed: true }));
    await settle();
    element.shadowRoot!.querySelector('umbradesktop-health-cleanup-sheet')!.dispatchEvent(new CustomEvent('health-cleanup-confirm', { bubbles: true, composed: true }));
    await settle();
    expect(asked.filter((each) => each !== 'watch')).to.deep.equal(['sync', 'cleanUp unused Oversized images']);
  });

  it('shows Done after Clean up, with Undo and the way back', async () => {
    const { element, asked, screen, settle } = await healthWindow(idle({ result: result(), cleanup: cleanupState() }));
    expect(screen()).to.equal('done');
    const done = element.shadowRoot!.querySelector('umbradesktop-health-done')!;
    done.dispatchEvent(new CustomEvent('health-undo', { bubbles: true, composed: true }));
    await settle();
    done.dispatchEvent(new CustomEvent('health-dismiss', { bubbles: true, composed: true }));
    await settle();
    expect(asked.filter((each) => each !== 'watch')).to.deep.equal(['sync', 'undo', 'dismiss']);
  });

  it('reports the check to the desktop with the server’s count, activity when it has none, and done after', async () => {
    const { tasks, set } = await healthWindow(idle({ phase: { kind: 'running', step: 'usage', scanned: 412, total: 1284 } }));
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'running', completed: 412, total: 1284 });
    await set(idle({ phase: { kind: 'running', step: 'disk', scanned: 0, total: 0 } }));
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'running' });
    expect(tasks[tasks.length - 1]).to.not.have.property('total');
    await set(idle({ result: result() }));
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'done' });
    await set(idle({ phase: { kind: 'failed', message: 'Boom' }, result: result() }));
    expect(tasks[tasks.length - 1]).to.deep.include({ id: 'check', state: 'failed' });
  });

  it('reports Clean up as a second task: its count while it runs, failed when anything did not go', async () => {
    const { tasks, set } = await healthWindow(idle({ result: result(), cleanup: cleanupState({ phase: 'running', done: 1, total: 3 }) }));
    expect(tasks.find((task) => task.id === 'cleanup')).to.deep.include({ state: 'running', completed: 1, total: 3 });
    await set(idle({ result: result(), cleanup: cleanupState({ failed: ['b'] }) }));
    expect(tasks.filter((task) => task.id === 'cleanup').pop()).to.deep.include({ state: 'failed', failed: 1 });
    await set(idle({ result: result() }));
    expect(tasks.filter((task) => task.id === 'cleanup').pop()).to.deep.include({ state: 'done' });
  });

  it('watches the server while it is open, and stops when it closes', async () => {
    const { element, asked } = await healthWindow(idle({ result: result() }));
    expect(asked).to.include('watch');
    element.remove();
    expect(asked).to.include('unwatch');
  });

  it('asks the context to stop the check from the Checking screen', async () => {
    const { element, asked } = await healthWindow(idle({ phase: { kind: 'running', step: 'usage', scanned: 1, total: 3 } }));
    element.shadowRoot!.querySelector('umbradesktop-health-start')!.dispatchEvent(new CustomEvent('health-stop', { bubbles: true, composed: true }));
    expect(asked).to.include('stop');
  });

  it('says why when Clean up is refused because a newer check came in', async () => {
    const { element, asked, settle } = await healthWindow(idle({ result: result() }), true, 'newer');
    const overview = element.shadowRoot!.querySelector('umbradesktop-health-overview')!;
    overview.dispatchEvent(new CustomEvent('health-cleanup', { detail: { kinds: ['unused'] }, bubbles: true, composed: true }));
    await settle();
    element.shadowRoot!.querySelector('umbradesktop-health-cleanup-sheet')!.dispatchEvent(new CustomEvent('health-cleanup-confirm', { bubbles: true, composed: true }));
    await settle();
    expect(asked.some((each) => each.startsWith('cleanUp'))).to.equal(true);
    const notice = element.shadowRoot!.querySelector('umbradesktop-notice[name=refused]')!;
    expect(notice.getAttribute('heading')).to.equal('A newer check came in');
    expect(notice.getAttribute('body')).to.equal('Look it over before you clean up.');
  });

  it('warns on a check older than a day with the desktop\'s notice, and adds no second Check again', async () => {
    const day = 24 * 60 * 60 * 1000;
    const old = result();
    old.checkedAt = new Date(Date.now() - 2 * day);
    const { element } = await healthWindow(idle({ result: old }));
    // Attributes, as an app sets them on the desktop's element by its tag name alone.
    const notice = element.shadowRoot!.querySelector('umbradesktop-notice[name=stale]')!;
    expect(notice, 'the desktop notice, as the window banners use').to.not.equal(null);
    expect(notice.getAttribute('severity')).to.equal('warning');
    expect(notice.getAttribute('heading')).to.equal('This check is more than a day old');
    expect(notice.getAttribute('body')).to.contain('Check again');
    expect(element.shadowRoot!.querySelectorAll('uui-button[label="Check again"]').length, 'no second Check again in the window').to.equal(0);
  });

  it('shows no notice on a check from today', async () => {
    const { element } = await healthWindow(idle({ result: result() }));
    expect(element.shadowRoot!.querySelector('umbradesktop-notice')).to.equal(null);
  });

  it('says a check failed in an error notice', async () => {
    const { element } = await healthWindow(idle({ phase: { kind: 'failed', message: 'Boom' }, result: result() }));
    const notice = element.shadowRoot!.querySelector('umbradesktop-notice[name=failed]')!;
    expect(notice.getAttribute('severity')).to.equal('error');
    expect(notice.getAttribute('heading')).to.equal('The check did not finish');
    expect(notice.getAttribute('body')).to.equal('Boom');
  });

  describe('the grid and the preview (design §16.4, §16.5)', () => {
    /**
     * Fire an event from inside the window, as a screen would.
     * @param element The window.
     * @param from The screen's tag.
     * @param name The event.
     * @param detail What it carries.
     */
    const fire = (element: HTMLElement, from: string, name: string, detail?: unknown) =>
      element.shadowRoot!.querySelector(from)!.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));

    it('opens the grid on the row asked for, and goes back to the overview from Back', async () => {
      const { element, screen, settle } = await healthWindow(idle({ result: result() }));
      fire(element, 'umbradesktop-health-overview', 'health-open-grid', { kind: 'orphaned' });
      await settle();
      expect(screen()).to.equal('grid');
      const grid = element.shadowRoot!.querySelector<HTMLElement & { chip: string; folderKey?: string | null }>('umbradesktop-health-grid')!;
      expect(grid.chip).to.equal('orphaned');
      fire(element, 'umbradesktop-health-grid', 'health-close-grid');
      await settle();
      expect(screen()).to.equal('overview');
    });

    it('opens a folder on its first kind with anything in it', async () => {
      const { element, settle } = await healthWindow(idle({ result: result() }));
      fire(element, 'umbradesktop-health-overview', 'health-open-grid', { folderKey: 'p' });
      await settle();
      const grid = element.shadowRoot!.querySelector<HTMLElement & { chip: string; folderKey?: string | null }>('umbradesktop-health-grid')!;
      expect([grid.chip, grid.folderKey]).to.deep.equal(['unused', 'p']);
    });

    it('moves items to the bin, opens images in Optimize images, and shows an item in the Media Manager', async () => {
      const { element, asked, settle } = await healthWindow(idle({ result: result() }));
      fire(element, 'umbradesktop-health-overview', 'health-open-grid', { kind: 'unused' });
      await settle();
      fire(element, 'umbradesktop-health-grid', 'health-trash', { ids: ['old', 'persona'] });
      fire(element, 'umbradesktop-health-grid', 'health-optimize', { ids: ['big'] });
      fire(element, 'umbradesktop-health-grid', 'health-preview', { id: 'old', ids: ['old'] });
      await settle();
      fire(element, 'umbradesktop-health-preview', 'health-show-in-manager', { entry: { id: 'old' } });
      await settle();
      expect(asked.filter((each) => !['watch', 'sync'].includes(each))).to.deep.equal(['trash old,persona', 'optimize big Oversized images', 'show old']);
    });

    it('asks before deleting orphaned files, in the Clean up sheet’s words, and deletes only on yes', async () => {
      const { element, asked, settle, text } = await healthWindow(idle({ result: result() }));
      fire(element, 'umbradesktop-health-overview', 'health-open-grid', { kind: 'orphaned' });
      await settle();
      fire(element, 'umbradesktop-health-grid', 'health-delete', { ids: ['orphan:1/x.jpg'] });
      await settle();
      expect(text()).to.contain('Delete 30 B for good?');
      expect(text()).to.contain('1 orphaned files are deleted for good');
      fire(element, 'umbradesktop-health-cleanup-sheet', 'health-cleanup-cancel');
      await settle();
      expect(element.shadowRoot!.querySelector('umbradesktop-health-cleanup-sheet')).to.equal(null);
      fire(element, 'umbradesktop-health-grid', 'health-delete', { ids: ['orphan:1/x.jpg'] });
      await settle();
      fire(element, 'umbradesktop-health-cleanup-sheet', 'health-cleanup-confirm');
      await settle();
      expect(asked.filter((each) => each.startsWith('delete'))).to.deep.equal(['delete 1/x.jpg']);
    });

    it('previews over the grid in the grid’s order, and closes back to it', async () => {
      const { element, settle } = await healthWindow(idle({ result: result() }));
      fire(element, 'umbradesktop-health-overview', 'health-open-grid', { kind: 'unused' });
      await settle();
      fire(element, 'umbradesktop-health-grid', 'health-preview', { id: 'persona', ids: ['old', 'persona'] });
      await settle();
      const preview = element.shadowRoot!.querySelector<HTMLElement & { current: string; entries: Array<{ id: string }> }>('umbradesktop-health-preview')!;
      expect(preview.current).to.equal('persona');
      expect(preview.entries.map((each) => each.id)).to.deep.equal(['old', 'persona']);
      expect(element.shadowRoot!.querySelector('umbradesktop-health-grid'), 'the grid stays under it').to.not.equal(null);
      fire(element, 'umbradesktop-health-preview', 'health-preview-close');
      await settle();
      expect(element.shadowRoot!.querySelector('umbradesktop-health-preview')).to.equal(null);
    });

    it('leaves the grid for Checking when a check starts', async () => {
      const { element, screen, set, settle } = await healthWindow(idle({ result: result() }));
      fire(element, 'umbradesktop-health-overview', 'health-open-grid', { kind: 'unused' });
      await settle();
      await set(idle({ phase: { kind: 'running', step: 'usage', scanned: 0, total: 0 }, result: result() }));
      expect(screen()).to.equal('start');
    });
  });

  it('names no key on any screen', async () => {
    const { text, set } = await healthWindow(idle());
    expect(text()).to.not.match(KEY_NAMES);
    await set(idle({ result: result() }));
    expect(text()).to.not.match(KEY_NAMES);
    await set(idle({ result: result(), cleanup: cleanupState() }));
    expect(text()).to.not.match(KEY_NAMES);
  });
});
