import { expect } from '@open-wc/testing';
import { dropClassFor, dropTargetAt, nearestGroupTarget } from './drop-target';

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
  expect(dropTargetAt(root, 300, 150, 'app')).to.deep.equal({ kind: 'group', groupId: 'editing', after: true, stacked: true, gap: 0 });
});

it('reads the remove pane, and nothing where there is no target', async () => {
  const root = await board();
  expect(dropTargetAt(root, 100, 240, 'app')).to.deep.equal({ kind: 'remove' });
  expect(dropTargetAt(root, 600, 600, 'app')).to.equal(undefined);
});

it('looks through tiles to their group when a group is being dragged', async () => {
  const root = await board();
  expect(dropTargetAt(root, 30, 30, 'group')).to.deep.equal({ kind: 'group', groupId: 'editing', after: false, stacked: true, gap: 0 });
});

it('names the highlight a tile or a card gets from the target under the pointer', () => {
  const overTile = { kind: 'tile' as const, groupId: 'editing', alias: 'media', after: true };
  expect(dropClassFor(overTile, 'editing', 'media')).to.equal('drop-after');
  expect(dropClassFor({ ...overTile, after: false }, 'editing', 'media')).to.equal('drop-before');
  expect(dropClassFor(overTile, 'editing', 'content')).to.equal('');
  expect(dropClassFor(overTile, 'editing')).to.equal('drop');
  expect(dropClassFor({ kind: 'group', groupId: 'editing', after: false, stacked: false, gap: 0 }, 'editing')).to.equal('drop');
  expect(dropClassFor({ kind: 'remove' }, 'editing')).to.equal('');
  expect(dropClassFor(undefined, 'editing')).to.equal('');
});

it('reads groups laid out side by side by the half across, and stacked ones by the half down', async () => {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed; left:0; top:0;';
  document.body.appendChild(host);
  hosts.push(host);
  const root = host.attachShadow({ mode: 'open' });
  // Two cards side by side, each far taller than wide in neither direction, so only the layout
  // around them can say which way the next one lies.
  root.innerHTML = `
    <div style="display:grid; grid-template-columns:200px 200px; column-gap:20px; row-gap:8px;">
      <div data-drop="group" data-group="a" style="height:200px;"></div>
      <div data-drop="group" data-group="b" style="height:200px;"></div>
    </div>`;
  // The gap is the grid's own, across for cards side by side, so the bar can sit in its middle.
  expect(dropTargetAt(root, 150, 20, 'group')).to.deep.equal({ kind: 'group', groupId: 'a', after: true, stacked: false, gap: 20 });
  expect(dropTargetAt(root, 50, 180, 'group')).to.deep.equal({ kind: 'group', groupId: 'a', after: false, stacked: false, gap: 20 });
});

it('marks where a dragged group lands with a bar before or after the card, not the card itself', () => {
  const beside = { kind: 'group' as const, groupId: 'editing', after: false, stacked: false, gap: 0 };
  expect(dropClassFor(beside, 'editing', undefined, 'group')).to.equal('drop-before');
  expect(dropClassFor({ ...beside, after: true }, 'editing', undefined, 'group')).to.equal('drop-after');
  expect(dropClassFor({ ...beside, stacked: true }, 'editing', undefined, 'group')).to.equal('drop-before drop-stacked');
  expect(dropClassFor(beside, 'other', undefined, 'group')).to.equal('');
  expect(dropClassFor(beside, 'editing', undefined, 'app'), 'an app still lights the whole card').to.equal('drop');
});

describe('the nearest group, for a dragged group over no card', () => {
  /**
   * A pane with Pinned above two stacked groups and a 10px gap between them, like a menu-row theme.
   * @returns The shadow root.
   */
  function pane(): ShadowRoot {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed; left:0; top:0;';
    document.body.appendChild(host);
    hosts.push(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <div class="layout-pane" style="width:300px; height:400px;">
        <div data-drop="group" data-group="@pinned" style="height:80px;"></div>
        <div class="cards" style="display:grid; row-gap:10px;">
          <div data-drop="group" data-group="a" style="height:100px;"></div>
          <div data-drop="group" data-group="b" style="height:100px;"></div>
        </div>
      </div>`;
    return root;
  }

  it('lands before the first group from above it, as over Pinned', () => {
    expect(nearestGroupTarget(pane(), 50, 40, ['@pinned', 'b'])).to.deep.equal({ kind: 'group', groupId: 'a', after: false, stacked: true, gap: 10 });
  });

  it('lands beside the closer group from the gap between two', () => {
    // 'a' ends at 180 and 'b' starts at 190: 183 is closer to 'a', whose second half it is past.
    expect(nearestGroupTarget(pane(), 50, 183, ['@pinned'])).to.deep.equal({ kind: 'group', groupId: 'a', after: true, stacked: true, gap: 10 });
  });

  it('leaves out the groups it is told to, and finds nothing outside the pane', () => {
    expect(nearestGroupTarget(pane(), 50, 40, ['@pinned', 'a'])).to.deep.include({ kind: 'group', groupId: 'b' });
    expect(nearestGroupTarget(pane(), 600, 40, ['@pinned'])).to.equal(undefined);
  });
});
