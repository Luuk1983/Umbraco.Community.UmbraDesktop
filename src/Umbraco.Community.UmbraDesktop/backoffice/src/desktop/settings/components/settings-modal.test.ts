import { expect } from '@open-wc/testing';
import './settings-modal.element.js';
import { UMBRADESKTOP_SETTINGS_CATEGORIES } from '../categories/index.js';

/**
 * The panel's own job is navigation: show the categories, go into one, come back, and put focus
 * where the person using it would look for it. Everything else on screen belongs to a category's
 * element or to a picker.
 *
 * Two things about testing this surface, both learned the hard way here:
 *
 * **Assert on strings and booleans, never on a DOM node.** When an assertion over an element fails,
 * chai builds its message by inspecting the value, and inspecting a Lit element with a shadow root
 * and resolved contexts does not come back — the run dies at the runner's 120s file timeout with no
 * failure to read. Every check below compares a tag name, an id or a boolean, so a failure prints a
 * diff instead of hanging the suite.
 *
 * **Clicks on a `uui-button` land a macrotask late.** Measured: a click on one of our own elements
 * runs its handler synchronously, so `await element.updateComplete` sees the new state, while a
 * click on `uui-button` — the back button — has not run its handler by the time that promise
 * resolves. Hence `settle()`, which waits a macrotask first. Awaiting `updateComplete` twice does
 * not help; the handler has not run at all yet.
 */

/** Wait for a click to have been handled and the panel to have rendered what it did. */
const settle = async (element: { updateComplete: Promise<unknown> }) => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await element.updateComplete;
};

/**
 * Mount the panel, optionally at a category.
 *
 * Mounted by hand rather than with `fixture()`, which never settles for a modal element — it waits
 * on the whole rendered tree, and this renders `umb-body-layout` and `uui-button`, neither
 * registered in a bare test page.
 * @param data The modal data, for the deep-link cases.
 * @returns The element and queries over what it rendered.
 */
async function panel(data?: { category?: string }) {
  const element = document.createElement('umbradesktop-settings-modal');
  if (data) element.data = data;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;

  const root = element.shadowRoot!;
  return {
    element,
    rowIds: () =>
      [...root.querySelectorAll('umbradesktop-settings-row')].map((row) => (row as HTMLElement).dataset.category),
    iconNames: () =>
      [...root.querySelectorAll('umbradesktop-settings-row uui-icon')].map((icon) => icon.getAttribute('name')),
    // By id, not by index: the order of the categories is the registry's business and changes when
    // it changes, and a test that clicked "the first row" would quietly start testing another one.
    clickRow: (id: string) => (root.querySelector(`umbradesktop-settings-row[data-category="${id}"]`) as HTMLElement).click(),
    clickBack: () => (root.querySelector('.crumb uui-button') as HTMLElement | null)?.click(),
    hasHeading: () => !!root.querySelector('.heading'),
    showing: (tag: string) => !!root.querySelector(tag),
    focused: () => {
      const active = root.activeElement as HTMLElement | null;
      return active?.dataset?.category ?? active?.className ?? null;
    },
  };
}

const ids = UMBRADESKTOP_SETTINGS_CATEGORIES.map((category) => category.id);

it('opens on the categories, one row each', async () => {
  const view = await panel();

  expect(view.rowIds()).to.deep.equal(ids);
  expect(view.hasHeading(), 'the list is not inside a category, so it has no back heading').to.equal(false);
});

it('gives every row an icon to be recognised by', async () => {
  const view = await panel();

  expect(view.iconNames()).to.deep.equal(UMBRADESKTOP_SETTINGS_CATEGORIES.map((category) => category.icon));
});

it('shows a category when its row is picked, and the list stops being there', async () => {
  const view = await panel();

  view.clickRow('appearance');
  await settle(view.element);

  expect(view.showing('umbradesktop-settings-appearance')).to.equal(true);
  expect(view.rowIds(), 'the category list is replaced, not appended to').to.deep.equal([]);
});

it('comes back to the list', async () => {
  const view = await panel();

  view.clickRow('appearance');
  await settle(view.element);
  view.clickBack();
  await settle(view.element);

  expect(view.showing('umbradesktop-settings-appearance')).to.equal(false);
  expect(view.rowIds()).to.deep.equal(ids);
});

it('opens straight at the category it was asked for', async () => {
  const view = await panel({ category: 'general' });

  expect(view.showing('umbradesktop-settings-general')).to.equal(true);
  expect(view.hasHeading()).to.equal(true);
});

it('opens at the list when asked for a category it has never heard of', async () => {
  // A deep link from a version that had a category this one does not, or a typo in whatever wrote
  // it. Either way, a list is a recoverable place to land and an empty screen is not.
  const view = await panel({ category: 'taskbar' });

  expect(view.rowIds()).to.deep.equal(ids);
  expect(view.hasHeading()).to.equal(false);
});

it('moves focus to the category heading on the way in, and back to its row on the way out', async () => {
  // Without this the panel loses its place twice per visit: going in leaves focus on a row that is
  // no longer rendered, coming back leaves it on a back button that has just gone.
  const view = await panel();

  view.clickRow('appearance');
  await settle(view.element);
  expect(view.focused(), 'focus follows you into the category').to.equal('heading');

  view.clickBack();
  await settle(view.element);
  expect(view.focused(), 'focus returns to the row you came from').to.equal('appearance');
});
