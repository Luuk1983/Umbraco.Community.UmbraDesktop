import { expect, fixture, html } from '@open-wc/testing';
import './accessories-settings.element.js';
import { fixedSettings } from './settings.source.js';
import type { AccessoriesMediaFolder } from './settings.js';
import type { UmbraDesktopAccessoriesSettingsElement } from './accessories-settings.element.js';

/**
 * The Accessories category of Desktop settings: which media folder new Notepad and Paint files are
 * saved into. Driven through the settings source rather than storage.
 */

/**
 * The screen, over a source the test can read back, with a folder picker that answers `picked`.
 * @param picked What the folder picker returns.
 */
async function screen(picked?: AccessoriesMediaFolder) {
  const source = fixedSettings();
  const element = await fixture<UmbraDesktopAccessoriesSettingsElement>(html`<umbradesktop-accessories-settings
    .source=${source}
    .pickFolder=${async () => picked}
  ></umbradesktop-accessories-settings>`);
  const root = element.shadowRoot!;
  return {
    source,
    element,
    click: async (action: string) => {
      root.querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
      await new Promise((resolve) => setTimeout(resolve));
      await element.updateComplete;
    },
    has: (selector: string) => !!root.querySelector(selector),
    text: (selector: string) => (root.querySelector(selector)?.textContent ?? '').trim(),
  };
}

it('starts at the media library root, with nothing to go back to', async () => {
  const view = await screen();
  expect(view.text('.folder-name')).to.equal('Media library root');
  expect(view.has('[data-action="use-root"]')).to.equal(false);
});

it('saves into the folder chosen, and shows it by name', async () => {
  const view = await screen({ unique: 'f-1', name: 'Notes' });
  await view.click('pick-folder');
  expect(view.source.value.folder).to.deep.equal({ unique: 'f-1', name: 'Notes' });
  expect(view.text('.folder-name')).to.equal('Notes');
});

it('leaves the folder alone when the picker is cancelled', async () => {
  const view = await screen(undefined);
  await view.click('pick-folder');
  expect(view.source.value.folder).to.equal(null);
});

it('goes back to the root on request', async () => {
  const view = await screen({ unique: 'f-1', name: 'Notes' });
  await view.click('pick-folder');
  await view.click('use-root');
  expect(view.source.value.folder).to.equal(null);
});

/** There is no longer a choice of where to save: the media library is the only place. */
it('offers no choice of destination', async () => {
  const view = await screen();
  expect(view.has('[data-setting="destination"]')).to.equal(false);
});

/**
 * The screen saver is set in its own window in the launcher's Accessories group, and only there:
 * two places for one setting was one too many.
 */
it('leaves the screen saver to its own window', async () => {
  const view = await screen();
  expect(view.has('umbradesktop-screensaver-panel')).to.equal(false);
});
