import { expect, fixture, html } from '@open-wc/testing';
import '@umbraco-cms/backoffice/external/uui';
import { HOVER_EXPAND_MS, UmbraDesktopHoverExpand } from './hover-expand.js';

/** A closed tree folder opens under a resting drag (design §4, plan task 5.8). */

/** uui's own menu item, as core's tree draws one, with children it has not shown yet. */
type MenuItem = HTMLElement & { hasChildren: boolean; showChildren: boolean; updateComplete: Promise<boolean> };

/**
 * A tree folder with children, closed. `hasChildren` is set as core sets it: as a property, which uui
 * does not reflect to an attribute.
 * @returns The item.
 */
async function closedFolder(): Promise<MenuItem> {
  const item = await fixture<MenuItem>(html`<uui-menu-item label="Design" .hasChildren=${true}></uui-menu-item>`);
  await item.updateComplete;
  return item;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('opening tree folders under a drag', () => {
  it('opens a closed folder the drag rests on', async () => {
    const item = await closedFolder();
    const expand = new UmbraDesktopHoverExpand();
    expand.over(item);
    await wait(HOVER_EXPAND_MS + 150);
    expect(item.showChildren).to.equal(true);
  });

  it('opens it from the link inside it, which is what a real pointer is over', async () => {
    const item = await fixture<MenuItem & { href: string }>(
      html`<uui-menu-item label="Design" href="section/umbradesktop/workspace/media/edit/x" .hasChildren=${true}></uui-menu-item>`,
    );
    await item.updateComplete;
    const link = item.shadowRoot!.querySelector('#label-button')!;
    const expand = new UmbraDesktopHoverExpand();
    expand.over(link);
    await wait(HOVER_EXPAND_MS + 150);
    expect(item.showChildren).to.equal(true);
  });

  it('leaves it closed when the drag moves on first', async () => {
    const item = await closedFolder();
    const expand = new UmbraDesktopHoverExpand();
    expand.over(item);
    await wait(HOVER_EXPAND_MS / 2);
    expand.over(undefined);
    await wait(HOVER_EXPAND_MS);
    expect(item.showChildren).to.equal(false);
  });

  it('leaves an open folder open', async () => {
    const item = await closedFolder();
    item.showChildren = true;
    await item.updateComplete;
    const expand = new UmbraDesktopHoverExpand();
    expand.over(item);
    await wait(HOVER_EXPAND_MS + 150);
    expect(item.showChildren).to.equal(true);
  });
});
