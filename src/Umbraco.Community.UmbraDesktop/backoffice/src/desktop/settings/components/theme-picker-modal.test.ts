import { expect } from '@open-wc/testing';
import './theme-picker-modal.element.js';
import { UMBRADESKTOP_THEMES } from '../../theme/themes/index.js';
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
