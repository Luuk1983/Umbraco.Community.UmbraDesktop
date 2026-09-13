import { expect } from '@open-wc/testing';
import './backoffice-theme-picker-modal.element.js';
import type { UmbraDesktopBackofficeThemePickerModalElement } from './backoffice-theme-picker-modal.element.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbArrayState, UmbStringState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The picker onto the backoffice's *own* light/dark/high-contrast setting — the one the current-user
 * modal also sets. What matters here is that it shows whatever the registry holds rather than three
 * names we typed, marks the one in force, and writes through the desktop's theme context, which is
 * the single value both front ends read.
 */

/** The three core registers, as this picker receives them. */
const CORE = [
  { alias: 'umb-light-theme', name: 'Light' },
  { alias: 'umb-dark-theme', name: 'Dark (Experimental)' },
  { alias: 'umb-high-contrast-theme', name: 'High contrast (Experimental)' },
];

let wrapper: HTMLElement;
let picker: UmbraDesktopBackofficeThemePickerModalElement;
let themes: UmbArrayState<{ alias: string; name: string }>;
let alias: UmbStringState<string>;
let applied: string[];

/**
 * Mount the picker under a stub theme context.
 *
 * Mounted by hand rather than with `fixture()`, for the reason the theme picker's own tests give:
 * `fixture()` waits on the whole rendered tree, and `umb-body-layout` and `uui-button` are not
 * registered in a bare test page, so it never settles.
 * @param current The alias the picker is opened on.
 */
async function mountPicker(current: string) {
  applied = [];
  themes = new UmbArrayState(CORE, (theme) => theme.alias);
  alias = new UmbStringState(current);

  wrapper = document.createElement('div');
  document.body.append(wrapper);
  // A stub carrying the two observables and the one method the picker reads: a real consumer's
  // whole world, as the taskbar's tests put it. The real context resolves the registry and core's
  // own theme context, neither of which exists in a bare test page.
  new UmbContextProvider(wrapper, UMBRADESKTOP_THEME_CONTEXT, {
    backofficeThemes: themes.asObservable(),
    backofficeTheme: alias.asObservable(),
    setBackofficeTheme: (next: string) => {
      applied.push(next);
      alias.setValue(next);
    },
    getHostElement: () => wrapper,
  } as never).hostConnected();

  picker = document.createElement(
    'umbradesktop-backoffice-theme-picker-modal',
  ) as UmbraDesktopBackofficeThemePickerModalElement;
  picker.data = { current };
  wrapper.append(picker);
  await picker.updateComplete;
}

/** Every row the picker drew, in order. */
const rows = () => [...picker.shadowRoot!.querySelectorAll<HTMLElement>('.theme')];

/** The name each row is showing. */
const names = () => rows().map((row) => row.querySelector('.name')?.textContent?.trim());

afterEach(() => wrapper?.remove());

it('lists what the backoffice has registered, not a hard-coded three', async () => {
  await mountPicker('umb-light-theme');
  expect(names()).to.deep.equal(CORE.map((theme) => theme.name));

  // A site that ships its own theme gets it in the list for free, and one that drops a shipped
  // theme stops seeing it. That is the whole reason this reads the registry.
  themes.setValue([...CORE, { alias: 'acme-theme', name: 'Acme' }]);
  await picker.updateComplete;
  expect(names()).to.contain('Acme');
});

it('marks the theme in force, and only that one', async () => {
  await mountPicker('umb-dark-theme');

  const pressed = rows().filter((row) => row.getAttribute('aria-pressed') === 'true');
  expect(pressed).to.have.lengthOf(1);
  expect(pressed[0].querySelector('.name')?.textContent?.trim()).to.equal('Dark (Experimental)');
});

it('writes a click through the theme context rather than to core directly', async () => {
  await mountPicker('umb-light-theme');

  rows()[2].click();
  await picker.updateComplete;

  // One value, two front ends: the context is what the current-user modal's setting also travels
  // through, so a write here cannot leave the two disagreeing.
  expect(applied).to.deep.equal(['umb-high-contrast-theme']);
});

it('follows the setting when it is changed somewhere else', async () => {
  await mountPicker('umb-light-theme');

  // What happens when the user changes it in the current-user modal with this picker open. The
  // mark has to move, because nothing here decided it.
  alias.setValue('umb-high-contrast-theme');
  await picker.updateComplete;

  const pressed = rows().filter((row) => row.getAttribute('aria-pressed') === 'true');
  expect(pressed[0]?.querySelector('.name')?.textContent?.trim()).to.equal('High contrast (Experimental)');
});

it('renders without marking anything when the stored alias is no longer registered', async () => {
  // `localStorage` outlives the extension that wrote it. A list with nothing marked is honest;
  // an empty screen or a thrown error is not.
  await mountPicker('acme-gone');

  expect(names()).to.have.lengthOf(CORE.length);
  expect(rows().filter((row) => row.getAttribute('aria-pressed') === 'true')).to.have.lengthOf(0);
});
