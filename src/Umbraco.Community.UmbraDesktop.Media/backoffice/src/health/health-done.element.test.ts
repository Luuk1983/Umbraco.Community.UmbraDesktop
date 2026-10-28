import { expect, fixture, html } from '@open-wc/testing';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import './health-done.element.js';
import type { UmbraDesktopHealthDoneElement } from './health-done.element.js';
import type { UmbraDesktopMediaHealthCleanupState } from './media-health.context.js';
import { OPTIMIZE_APP } from '../shared/optimize-service.js';
import { formatBytes } from '../transfers/transfers-model.js';
import { KEY_NAMES, cleanupState, textOf, tick } from './health.test-helper.js';

/** Done (design §16.3, mock scene 4b): what was freed, Undo, and Optimize images while it runs. */

let removals: Array<() => void> = [];
afterEach(() => {
  for (const remove of removals) remove();
  removals = [];
});

/**
 * The Done screen on a desktop stand-in that records the apps it opens.
 * @param cleanup The Clean up.
 */
async function done(cleanup: UmbraDesktopMediaHealthCleanupState) {
  const opened: Array<[string, unknown]> = [];
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  removals.push(() => wrapper.remove());
  new UmbContextProvider(wrapper, 'UmbraDesktopWindowManagerContext', {
    getHostElement: () => wrapper,
    openApp: (alias: string, options: unknown) => (opened.push([alias, options]), true),
  } as never).hostConnected();
  const element = await fixture<UmbraDesktopHealthDoneElement>(html`<umbradesktop-health-done .cleanup=${cleanup}></umbradesktop-health-done>`, { parentNode: wrapper });
  const events: string[] = [];
  for (const name of ['health-undo', 'health-dismiss']) element.addEventListener(name, () => events.push(name));
  const button = (label: string) => element.shadowRoot!.querySelector<HTMLElement>(`uui-button[label="${label}"]`);
  return { element, opened, events, button, text: () => textOf(element) };
}

describe('the Done screen', () => {
  it('shows what was freed, and the library before and after', async () => {
    const state = cleanupState();
    const { text } = await done(state);
    expect(text()).to.contain(`${formatBytes(540)} freed`);
    expect(text()).to.contain(`Your library went from ${formatBytes(state.beforeBytes)} to ${formatBytes(state.afterBytes)}.`);
  });

  it('offers Undo for the items in the recycle bin', async () => {
    const { text, button, events } = await done(cleanupState());
    expect(text()).to.contain('1 items in the recycle bin');
    button('Undo')!.click();
    await tick();
    expect(events).to.deep.equal(['health-undo']);
  });

  it('shows Optimize images only while it runs, and Show brings its window forward', async () => {
    expect((await done(cleanupState())).text()).to.not.contain('Optimizing');
    const { text, button, opened } = await done(cleanupState({ optimizing: { completed: 38, total: 214, location: 'run1' } }));
    expect(text()).to.contain('Optimizing 214 images');
    expect(text()).to.contain('38 of 214 done');
    button('Show')!.click();
    await tick();
    expect(opened).to.deep.equal([[OPTIMIZE_APP, { location: 'run1', reuse: true }]]);
  });

  it('says what did not go, and why', async () => {
    const { text } = await done(cleanupState({ failed: ['b'], skipped: [{ relativePath: '2/y.png', reason: 'NowOwned' }] }));
    expect(text()).to.contain('1 items could not be moved to the recycle bin.');
    expect(text()).to.contain('1 files were left on disk: 2/y.png (an item owns it now)');
  });

  it('counts while Clean up runs, and goes back to the overview when done', async () => {
    const running = await done(cleanupState({ phase: 'running', done: 1, total: 3 }));
    expect(running.text()).to.contain('Cleaning up your media library');
    expect(running.text()).to.contain('1 of 3');
    const { button, events } = await done(cleanupState());
    button('Back to the overview')!.click();
    await tick();
    expect(events).to.deep.equal(['health-dismiss']);
  });

  it('names no key', async () => {
    expect((await done(cleanupState({ optimizing: { completed: 1, total: 2 } }))).text()).to.not.match(KEY_NAMES);
  });
});
