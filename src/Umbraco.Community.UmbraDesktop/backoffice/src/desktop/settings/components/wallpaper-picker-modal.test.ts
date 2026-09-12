import { expect } from '@open-wc/testing';
import './wallpaper-picker-modal.element.js';
import { UMBRADESKTOP_BUILTIN_WALLPAPERS } from '../wallpapers.generated.js';

/**
 * The picker is the only way into a wallpaper, built-in or your own, so two things must hold: it
 * always shows the way to your own images, and it always shows which wallpaper is in use. Both used
 * to fail. The way in was a button in the footer beside Close, and an image picked from the Media
 * Library is not in this grid, so the grid marked nothing at all.
 *
 * One tile answers both. It is always the first thing in the grid, it is an empty slot until you
 * have picked something of your own, and it is that image — marked — once you have.
 *
 * Mounted by hand rather than with `fixture()`, which never settles for a modal element — it waits
 * on `umb-body-layout` and `uui-button`, neither registered in a bare test page.
 */
async function pickerOn(data: { current: unknown; currentThumbUrl?: string | null }) {
  const element = document.createElement('umbradesktop-wallpaper-picker-modal');
  element.data = data as never;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;
  return [...element.shadowRoot!.querySelectorAll('.tile')] as HTMLElement[];
}

/** The tiles the picker is showing as selected. */
const selected = (tiles: HTMLElement[]) => tiles.filter((tile) => tile.getAttribute('aria-pressed') === 'true');

it('marks the built-in image in use', async () => {
  const first = UMBRADESKTOP_BUILTIN_WALLPAPERS[0];
  const tiles = await pickerOn({ current: { kind: 'builtin', id: first.id } });

  expect(selected(tiles)).to.have.lengthOf(1);
  expect(selected(tiles)[0].querySelector('.label')?.textContent?.trim()).to.equal(first.name);
});

it('fills its own-image slot with the image you picked, and marks it', async () => {
  const tiles = await pickerOn({ current: { kind: 'media', unique: 'abc' }, currentThumbUrl: '/thumb.avif' });

  expect(selected(tiles)).to.have.lengthOf(1);
  expect(selected(tiles)[0]).to.equal(tiles[0]);
  expect(tiles[0].querySelector('img')?.getAttribute('src')).to.equal('/thumb.avif');
});

it('offers your own images first, whatever is in use', async () => {
  const first = UMBRADESKTOP_BUILTIN_WALLPAPERS[0];
  const tiles = await pickerOn({ current: { kind: 'builtin', id: first.id } });

  // The slot, None, and the built-ins — the slot leading, since it is the only tile in the grid
  // that is not already showing you what it offers.
  expect(tiles).to.have.lengthOf(UMBRADESKTOP_BUILTIN_WALLPAPERS.length + 2);
  expect(tiles[0].classList.contains('own')).to.equal(true);
  expect(tiles[0].querySelector('img')).to.equal(null);
  expect(tiles[0].getAttribute('aria-pressed')).to.equal('false');
});

it('shows the empty slot, marked as nothing, when the image in use cannot be rendered', async () => {
  // A media item Umbraco cannot render resolves to no thumbnail. The slot stays the way in rather
  // than becoming a blank tile claiming to be the wallpaper in use.
  const tiles = await pickerOn({ current: { kind: 'media', unique: 'abc' }, currentThumbUrl: null });

  expect(selected(tiles)).to.have.lengthOf(0);
  expect(tiles[0].classList.contains('own')).to.equal(true);
  expect(tiles[0].querySelector('img')).to.equal(null);
});

it('has one action, and it is closing', async () => {
  // The way to the Media Library used to be a second button down here, beside Close — the corner
  // you look at to leave, not the corner you look at for another source of pictures.
  const element = document.createElement('umbradesktop-wallpaper-picker-modal');
  element.data = { current: { kind: 'none' } } as never;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;

  const actions = [...element.shadowRoot!.querySelectorAll('[slot="actions"]')];
  expect(actions.map((action) => action.getAttribute('label'))).to.deep.equal(['general_close']);
});
