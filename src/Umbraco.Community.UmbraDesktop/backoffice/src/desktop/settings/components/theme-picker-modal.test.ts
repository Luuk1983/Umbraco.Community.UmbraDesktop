import { expect } from '@open-wc/testing';
import './theme-picker-modal.element.js';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index.js';
import { UMBRADESKTOP_THEME_CONTEXT } from '../../theme/theme.context-token.js';
import { UmbContextProvider } from '@umbraco-cms/backoffice/context-api';
import { UmbObjectState, UmbStringState } from '@umbraco-cms/backoffice/observable-api';
import {
  UMBRADESKTOP_PREVIEW_PICKER_SCALE,
  UMBRADESKTOP_PREVIEW_SCALE,
  UMBRADESKTOP_PREVIEW_SCENE,
} from '../../theme/preview/constants.js';
import '../../theme/preview/theme-preview.element.js';

/**
 * The picker's job is to show every theme as itself and to say which one is on. Applying a choice
 * is the settings context's job and is one call, exercised wherever that context is; what is worth
 * testing here is what the user is looking at.
 */

/**
 * Mount the picker with a theme marked as current.
 *
 * Mounted by hand rather than with `fixture()`, which never settles for this element: it waits on
 * the whole rendered tree, and the picker renders `umb-body-layout` and `uui-button`, neither of
 * which is registered in a bare test page. The element's own `updateComplete` resolves in
 * milliseconds — what it rendered is all these tests read.
 * @param currentId The theme to pass in as the one in use.
 * @returns The mounted element and its rendered rows.
 */
async function pickerOn(currentId: string) {
  const element = document.createElement('umbradesktop-theme-picker-modal');
  element.data = { current: currentId };
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;
  return { element, rows: [...element.shadowRoot!.querySelectorAll('.theme')] as HTMLElement[] };
}

it('lists every shipped theme, one row each, in catalogue order', async () => {
  const { rows } = await pickerOn('umbraco');

  expect(rows.map((row) => row.querySelector('.name')?.textContent?.trim())).to.deep.equal(
    UMBRADESKTOP_THEMES.map((theme) => theme.name),
  );
});

it('shows each row as a preview of that theme, not of the one in use', async () => {
  const { rows } = await pickerOn('umbraco');

  const painted = rows.map((row) => (row.querySelector('umbradesktop-theme-preview') as { theme?: { id: string } }).theme?.id);
  expect(painted).to.deep.equal(UMBRADESKTOP_THEMES.map((theme) => theme.id));
});

it('marks the current theme, and only that one', async () => {
  const { rows } = await pickerOn('win98');

  const pressed = rows.filter((row) => row.getAttribute('aria-pressed') === 'true');
  expect(pressed).to.have.lengthOf(1);
  expect(pressed[0].querySelector('.name')?.textContent?.trim()).to.equal('Windows 98');
});

it('draws its previews larger than the settings panel does', async () => {
  const { rows } = await pickerOn('umbraco');
  const preview = rows[0].querySelector('umbradesktop-theme-preview') as HTMLElement;

  // The size follows the scale, rather than the scale being one number and the box another: a
  // caller sets the custom property and both the drawing and the layout box move together.
  expect(preview.getBoundingClientRect().width).to.be.closeTo(
    UMBRADESKTOP_PREVIEW_SCENE.w * UMBRADESKTOP_PREVIEW_PICKER_SCALE,
    0.5,
  );
  expect(UMBRADESKTOP_PREVIEW_PICKER_SCALE).to.be.greaterThan(UMBRADESKTOP_PREVIEW_SCALE);
});

it('offers the wallpaper toggle above the theme list', async () => {
  const { element } = await pickerOn('umbraco');

  const follows = element.shadowRoot!.querySelector('.follows');
  const themes = element.shadowRoot!.querySelector('.themes');
  expect(follows, 'no wallpaper toggle in the theme picker').to.not.equal(null);
  expect(follows!.querySelector('uui-toggle'), '.follows holds no toggle').to.not.equal(null);

  // Above, not below, and the order is the point rather than decoration: it decides what every
  // click in the list beneath it will do, so it has to be readable before you start flipping
  // through themes. DOCUMENT_POSITION_FOLLOWING === the themes list comes after this node.
  expect(
    follows!.compareDocumentPosition(themes!) & Node.DOCUMENT_POSITION_FOLLOWING,
    'the toggle renders after the theme list',
  ).to.not.equal(0);
});

it('renders the toggle off until the settings context says otherwise', async () => {
  const { element } = await pickerOn('umbraco');

  // No settings context in a bare test page, so this is the unconfigured case: it must render
  // off rather than checked-by-accident, because checked-by-accident is a wallpaper being replaced.
  const toggle = element.shadowRoot!.querySelector('.follows uui-toggle') as HTMLInputElement;
  expect(toggle.hasAttribute('checked')).to.equal(false);
});

it('paints every miniature in the variant the backoffice is in, not the one the chosen theme got', async () => {
  // These are two different questions and the picker was asking the wrong one. `resolved.variant`
  // is the palette *the chosen theme* ended up with, so a theme that ships no dark palette — the
  // Umbraco theme, the default — reports "light" in a dark backoffice, and every row here was
  // painted from that. Four themes leave the window body on the backoffice's own token and looked
  // dark regardless; macOS is the one that states the body colour in both its palettes, so it alone
  // came out white, in a dark panel, beside four dark ones. Each preview already falls back to a
  // theme's light palette by itself, so what a row must hand it is what the backoffice is.
  const wrapper = document.createElement('div');
  document.body.append(wrapper);
  after(() => wrapper.remove());
  new UmbContextProvider(wrapper, UMBRADESKTOP_THEME_CONTEXT, {
    resolved: new UmbObjectState({
      theme: UMBRADESKTOP_THEMES[0],
      // The state the bug lived in: a dark backoffice, and a chosen theme with no dark palette.
      variant: 'light',
      palette: UMBRADESKTOP_THEMES[0].palettes.light,
      highContrast: false,
    }).asObservable(),
    backofficeVariant: new UmbStringState('dark').asObservable(),
    getHostElement: () => wrapper,
  } as never).hostConnected();

  const element = document.createElement('umbradesktop-theme-picker-modal');
  element.data = { current: 'umbraco' };
  wrapper.append(element);
  await element.updateComplete;

  const painted = [...element.shadowRoot!.querySelectorAll('.theme')].map(
    (row) => (row.querySelector('umbradesktop-theme-preview') as { variant?: string }).variant,
  );
  expect(painted).to.deep.equal(UMBRADESKTOP_THEMES.map(() => 'dark'));
});
