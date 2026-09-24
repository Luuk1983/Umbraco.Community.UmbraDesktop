import { expect, fixture, html } from '@open-wc/testing';
import './accessories-settings.element.js';
import { fixedSaveSettings } from './save-settings.source.js';
import type { AccessoriesMediaFolder } from './save-settings.js';
import type { UmbraDesktopAccessoriesSettingsElement } from './accessories-settings.element.js';

/**
 * The Accessories category of Desktop settings: where Notepad and Paint save.
 *
 * Driven through the settings source rather than storage, so each case says what the screen does to
 * the setting and nothing about where the setting is kept.
 */

/**
 * The screen, over a source the test can read back, with a folder picker that answers `picked`.
 * @param picked What the folder picker returns.
 */
async function screen(picked?: AccessoriesMediaFolder) {
  const source = fixedSaveSettings();
  const element = await fixture<UmbraDesktopAccessoriesSettingsElement>(html`<umbradesktop-accessories-settings
    .source=${source}
    .pickFolder=${async () => picked}
  ></umbradesktop-accessories-settings>`);
  const root = element.shadowRoot!;
  return {
    source,
    element,
    choose: async (destination: string) => {
      const group = root.querySelector<HTMLElement & { value: string }>('[data-setting="destination"]')!;
      group.value = destination;
      group.dispatchEvent(new Event('change', { bubbles: true }));
      await element.updateComplete;
    },
    click: async (action: string) => {
      root.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
      await new Promise((resolve) => setTimeout(resolve));
      await element.updateComplete;
    },
    has: (selector: string) => !!root.querySelector(selector),
    text: (selector: string) => (root.querySelector(selector)?.textContent ?? '').trim(),
  };
}

it('starts on saving to this computer', async () => {
  const view = await screen();
  expect(view.source.value.destination).to.equal('computer');
  expect(view.has('[data-action="pick-folder"]'), 'no folder to choose for a download').to.equal(false);
});

it('switches Save to the media library, at its root until a folder is chosen', async () => {
  const view = await screen();
  await view.choose('media');
  expect(view.source.value).to.deep.equal({ destination: 'media', folder: null });
  expect(view.text('.folder-name')).to.equal('Media library root');
});

it('saves into the folder chosen, and shows it by name', async () => {
  const view = await screen({ unique: 'f-1', name: 'Notes' });
  await view.choose('media');
  await view.click('pick-folder');
  expect(view.source.value.folder).to.deep.equal({ unique: 'f-1', name: 'Notes' });
  expect(view.text('.folder-name')).to.equal('Notes');
});

it('leaves the folder alone when the picker is cancelled', async () => {
  const view = await screen(undefined);
  await view.choose('media');
  await view.click('pick-folder');
  expect(view.source.value.folder).to.equal(null);
});

it('goes back to the root on request', async () => {
  const view = await screen({ unique: 'f-1', name: 'Notes' });
  await view.choose('media');
  await view.click('pick-folder');
  await view.click('use-root');
  expect(view.source.value.folder).to.equal(null);
});

/** Switching back to this computer keeps the folder, so switching again does not lose it. */
it('remembers the folder across a switch back to this computer', async () => {
  const view = await screen({ unique: 'f-1', name: 'Notes' });
  await view.choose('media');
  await view.click('pick-folder');
  await view.choose('computer');
  expect(view.source.value).to.deep.equal({ destination: 'computer', folder: { unique: 'f-1', name: 'Notes' } });
});
