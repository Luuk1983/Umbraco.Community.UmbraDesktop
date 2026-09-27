import { expect } from '@open-wc/testing';
import { dropClassFor, dropTargetAt } from './drop-target';

/** The boards this file appended, taken out after each case. */
const hosts: HTMLElement[] = [];
afterEach(() => hosts.splice(0).forEach((host) => host.remove()));

/**
 * A tiny shadow root laid out at known coordinates: one group card, 400x200 at the top left, with
 * one 100x60 tile inside it, and a remove pane below.
 *
 * Appended by hand rather than through open-wc's `fixture`. For a plain element `fixture` waits for
 * an animation frame, and a page the runner has in a background tab (the full suite runs two at a
 * time) gets no frames, so every case timed out there while passing on its own. `elementsFromPoint`
 * lays the page out itself, so nothing here needs a frame.
 * @returns The shadow root.
 */
async function board(): Promise<ShadowRoot> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed; left:0; top:0;';
  document.body.appendChild(host);
  hosts.push(host);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `
    <div data-drop="group" data-group="editing" style="position:absolute; left:0; top:0; width:400px; height:200px;">
      <div data-drop="tile" data-group="editing" data-alias="media" style="position:absolute; left:10px; top:10px; width:100px; height:60px;"><span>Media</span></div>
    </div>
    <div data-drop="remove" style="position:absolute; left:0; top:220px; width:400px; height:40px;"></div>`;
  return root;
}

it('reads a tile, with the half the pointer is over', async () => {
  const root = await board();
  expect(dropTargetAt(root, 30, 30, 'app')).to.deep.equal({ kind: 'tile', groupId: 'editing', alias: 'media', after: false });
  expect(dropTargetAt(root, 100, 30, 'app')).to.deep.equal({ kind: 'tile', groupId: 'editing', alias: 'media', after: true });
});

it("reads a group card's empty area", async () => {
  const root = await board();
  expect(dropTargetAt(root, 300, 150, 'app')).to.deep.equal({ kind: 'group', groupId: 'editing', after: true });
});

it('reads the remove pane, and nothing where there is no target', async () => {
  const root = await board();
  expect(dropTargetAt(root, 100, 240, 'app')).to.deep.equal({ kind: 'remove' });
  expect(dropTargetAt(root, 600, 600, 'app')).to.equal(undefined);
});

it('looks through tiles to their group when a group is being dragged', async () => {
  const root = await board();
  expect(dropTargetAt(root, 30, 30, 'group')).to.deep.equal({ kind: 'group', groupId: 'editing', after: false });
});

it('names the highlight a tile or a card gets from the target under the pointer', () => {
  const overTile = { kind: 'tile' as const, groupId: 'editing', alias: 'media', after: true };
  expect(dropClassFor(overTile, 'editing', 'media')).to.equal('drop-after');
  expect(dropClassFor({ ...overTile, after: false }, 'editing', 'media')).to.equal('drop-before');
  expect(dropClassFor(overTile, 'editing', 'content')).to.equal('');
  expect(dropClassFor(overTile, 'editing')).to.equal('drop');
  expect(dropClassFor({ kind: 'group', groupId: 'editing', after: false }, 'editing')).to.equal('drop');
  expect(dropClassFor({ kind: 'remove' }, 'editing')).to.equal('');
  expect(dropClassFor(undefined, 'editing')).to.equal('');
});
