import { expect } from '@open-wc/testing';
import './window-path.element.js';
import type { UmbraDesktopWindowPathElement } from './window-path.element.js';
import type { UmbraDesktopPathCrumb } from '../path/types.js';

/**
 * Mount the strip with a set of crumbs.
 *
 * Appended by hand rather than through `fixture`, matching `window-body.test.ts`: `fixture` awaits
 * a `nextFrame()` that never resolves in the backgrounded pages this runner uses when it has
 * several files in flight.
 * @param crumbs What the strip should draw.
 * @returns The element, its shadow root, and a dispose.
 */
async function mountPath(crumbs: UmbraDesktopPathCrumb[]) {
  const element = document.createElement('umbradesktop-window-path') as UmbraDesktopWindowPathElement;
  element.crumbs = crumbs;
  document.body.appendChild(element);
  await element.updateComplete;
  return { element, root: element.shadowRoot!, dispose: () => element.remove() };
}

it('renders a button per linked crumb and plain text for the current one', async () => {
  const { root, dispose } = await mountPath([
    { label: 'Media library', href: '/umbraco/section/media', current: false, home: true },
    { label: 'Campaigns', href: 'section/media/workspace/media/edit/a1', current: false },
    { label: 'hero.jpg', href: undefined, current: true },
  ]);

  const buttons = root.querySelectorAll('button.path-crumb');
  expect(buttons.length).to.equal(2);
  expect(buttons[1].textContent?.trim()).to.equal('Campaigns');
  expect(root.querySelector('.path-current')?.textContent?.trim()).to.equal('hero.jpg');
  dispose();
});

it('draws the window’s own root as a house, and still names it for hover and screen readers', async () => {
  // The titlebar is a few pixels above and already carries the app's name, so repeating it in text
  // opened every window on the same words twice.
  const { root, dispose } = await mountPath([
    { label: 'Media library', href: '/umbraco/section/media', current: false, home: true },
    { label: 'hero.jpg', href: undefined, current: true },
  ]);

  const home = root.querySelector('button.path-crumb');
  expect(home?.textContent?.trim(), 'the home crumb spells nothing out').to.equal('');
  expect(home?.querySelector('umb-icon')).to.exist;
  expect(home?.getAttribute('aria-label')).to.equal('Media library');
  expect(home?.getAttribute('title')).to.equal('Media library');
  dispose();
});

it('asks the window to navigate, rather than navigating itself', async () => {
  const { element, root, dispose } = await mountPath([
    { label: 'Media library', href: '/umbraco/section/media', current: false, home: true },
    { label: 'hero.jpg', href: undefined, current: true },
  ]);

  let navigated: string | undefined;
  element.addEventListener('umbradesktop-path-navigate', (event) => {
    navigated = (event as CustomEvent<{ href: string }>).detail.href;
  });

  root.querySelector<HTMLButtonElement>('button.path-crumb')?.click();

  expect(navigated).to.equal('/umbraco/section/media');
  dispose();
});

it('separates crumbs, and puts no separator after the last', async () => {
  const { root, dispose } = await mountPath([
    { label: 'Media library', href: '/umbraco/section/media', current: false, home: true },
    { label: 'hero.jpg', href: undefined, current: true },
  ]);

  expect(root.querySelectorAll('.path-separator').length).to.equal(1);
  dispose();
});

it('draws nothing at all when it has no crumbs', async () => {
  const { root, dispose } = await mountPath([]);
  expect(root.querySelector('.path-bar')).to.not.exist;
  dispose();
});

it('prefixes every class it renders, so a theme’s window sheet cannot restyle it by accident', async () => {
  // The same trap `window-notices.element` documents: this element adopts the active theme's whole
  // `window` stylesheet, so a class named `.title` or `.body` here would be silently restyled by
  // four of the five themes.
  const { root, dispose } = await mountPath([
    { label: 'Media library', href: '/umbraco/section/media', current: false, home: true },
    { label: 'hero.jpg', href: undefined, current: true },
  ]);

  const classes = new Set<string>();
  root.querySelectorAll('*').forEach((node) => {
    node.classList.forEach((name) => classes.add(name));
  });

  expect(classes.size).to.be.greaterThan(0);
  for (const name of classes) expect(name, `class "${name}"`).to.match(/^path-/);
  dispose();
});

/**
 * The strip is drawn while the window behind it is still loading, and during that window the only
 * crumb that exists is the app's own root — so it showed a lone house floating over a covered
 * window, saying where you are about somewhere that has not arrived. Suppress the crumbs.
 *
 * The bar itself stays. `.path-bar` carries an explicit `height`, so an empty one is exactly the
 * strip's themed height with the strip's own background on it: the crumbs appear in place when the
 * content lands, rather than the body shrinking by the strip's height under a frame that has
 * already painted.
 */
it('keeps the bar but draws no crumbs while the window is busy', async () => {
  const { element, root, dispose } = await mountPath([
    { label: 'Content editor', href: '/umbraco/section/content', current: false, home: true },
  ]);

  expect(root.querySelector('.path-crumb-home'), 'the house is there when the window is idle').to.not.be.null;

  element.busy = true;
  await element.updateComplete;

  expect(root.querySelector('.path-bar'), 'the bar keeps its box, so nothing moves when it fills').to.not.be.null;
  expect(root.querySelectorAll('.path-crumb').length, 'and carries no crumbs').to.equal(0);
  expect(root.querySelector('.path-current'), 'including the current one').to.be.null;

  element.busy = false;
  await element.updateComplete;
  expect(root.querySelector('.path-crumb-home'), 'and the house comes back when the content lands').to.not.be.null;
  dispose();
});

/**
 * A busy strip is furniture, not navigation, and a screen reader landing on a labelled `nav` with
 * nothing in it is worse than one that is not there: the label promises a path and delivers an
 * empty region.
 */
it('does not offer an empty path as a navigation landmark', async () => {
  const { element, root, dispose } = await mountPath([
    { label: 'Content editor', href: '/umbraco/section/content', current: false, home: true },
  ]);
  element.busy = true;
  await element.updateComplete;

  expect(root.querySelector('nav'), 'the empty strip should not be a nav landmark').to.be.null;
  dispose();
});

/**
 * The space a strip button leaves around what it shows, on each side: to its first icon on the left,
 * top and bottom, and to its last child on the right, which is the label on a labelled button.
 * @param button The button.
 * @returns The four paddings, in px.
 */
function paddings(button: Element): { left: number; right: number; top: number; bottom: number } {
  const box = button.getBoundingClientRect();
  const icon = button.querySelector('umb-icon')!.getBoundingClientRect();
  const last = button.lastElementChild!.getBoundingClientRect();
  return { left: icon.left - box.left, right: box.right - last.right, top: icon.top - box.top, bottom: box.bottom - icon.bottom };
}

/**
 * Expect a strip button to pad what it shows by the same amount on all four sides, to within half a
 * pixel, since an odd space split in two lands on a half.
 * @param button The button.
 * @param name What to call it in a failure.
 */
function expectEvenPadding(button: Element, name: string): void {
  const pad = paddings(button);
  for (const side of ['left', 'right', 'bottom'] as const) {
    expect(pad[side], `${name}: ${side} against top`).to.be.closeTo(pad.top, 0.5);
  }
}

describe('the preview action', () => {
  const crumbs: UmbraDesktopPathCrumb[] = [
    { label: 'Content', href: '/umbraco/section/content', current: false, home: true },
    { label: 'Home', href: undefined, current: true },
  ];

  it('is offered when the window can be previewed', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    await element.updateComplete;
    expect(root.querySelector('button.path-preview')).to.exist;
    dispose();
  });

  it('is not offered otherwise', async () => {
    const { root, dispose } = await mountPath(crumbs);
    expect(root.querySelector('button.path-preview')).to.equal(null);
    dispose();
  });

  it('asks the window to open the preview, rather than opening it itself', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    await element.updateComplete;
    let asked = 0;
    element.addEventListener('umbradesktop-path-preview', () => (asked += 1));
    (root.querySelector('button.path-preview') as HTMLButtonElement).click();
    expect(asked).to.equal(1);
    dispose();
  });
});

describe('the preview action while a preview is open', () => {
  const crumbs: UmbraDesktopPathCrumb[] = [
    { label: 'Content', href: '/umbraco/section/content', current: false, home: true },
    { label: 'Home', href: undefined, current: true },
  ];

  it("draws Preview at rest in the strip's text colour, as a button, where the crumbs are links", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.style.setProperty('--umbradesktop-path-link', 'rgb(200, 0, 0)');
    element.style.setProperty('--umbradesktop-path-text', 'rgb(0, 90, 0)');
    element.previewable = true;
    await element.updateComplete;
    expect(getComputedStyle(root.querySelector('button.path-preview')!).color).to.equal('rgb(0, 90, 0)');
    dispose();
  });

  it("fills the pressed toggle from the theme's on tokens, which no other state uses", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.style.setProperty('--umbradesktop-strip-button-on-background', 'rgb(1, 2, 3)');
    element.style.setProperty('--umbradesktop-strip-button-on-text', 'rgb(4, 5, 6)');
    element.previewable = true;
    await element.updateComplete;
    const button = root.querySelector('button.path-preview')!;
    expect(getComputedStyle(button).backgroundColor, 'not while it is off').to.not.equal('rgb(1, 2, 3)');
    element.previewActive = true;
    await element.updateComplete;
    expect(getComputedStyle(button).backgroundColor).to.equal('rgb(1, 2, 3)');
    expect(getComputedStyle(button).color).to.equal('rgb(4, 5, 6)');
    dispose();
  });

  it('shows as pressed', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    // A link colour that resolves, so a ring drawn from it would show rather than drop out.
    element.style.setProperty('--umbradesktop-path-link', 'rgb(7, 8, 9)');
    element.previewable = true;
    element.previewActive = true;
    await element.updateComplete;
    expect(root.querySelector('button.path-preview')?.getAttribute('aria-pressed')).to.equal('true');
    // Pressed is drawn as a filled toggle, from its own token, and never as the outline ring a form
    // control draws.
    const pressed = getComputedStyle(root.querySelector('button.path-preview')!);
    expect(pressed.boxShadow).to.equal('none');
    dispose();
  });

  it('is not pressed otherwise', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    await element.updateComplete;
    expect(root.querySelector('button.path-preview')?.getAttribute('aria-pressed')).to.equal('false');
    dispose();
  });
});

describe('the view the window shows', () => {
  const crumbs: UmbraDesktopPathCrumb[] = [
    { label: 'Content', href: '/umbraco/section/content', current: false, home: true },
    { label: 'Home', href: undefined, current: true },
  ];

  it('is named after the crumbs, with its own icon, when the window gives one', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.view = { label: 'Info', icon: 'icon-info', beside: false };
    await element.updateComplete;
    const view = root.querySelector('.path-view');
    expect(view?.textContent?.trim()).to.equal('Info');
    expect(view?.querySelector('umb-icon')?.getAttribute('name')).to.equal('icon-info');
    const parts = [...root.querySelectorAll('.path-current, .path-view')];
    expect(parts.map((p) => p.className.split(' ')[0])).to.deep.equal(['path-current', 'path-view']);
    dispose();
  });

  it('is not named when the window gives none', async () => {
    const { root, dispose } = await mountPath(crumbs);
    expect(root.querySelector('.path-view')).to.equal(null);
    dispose();
  });

  it('carries the open-beside button only while the view can open beside the editor', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.view = { label: 'Analytics', icon: 'icon-chart', beside: false };
    await element.updateComplete;
    expect(root.querySelector('button.path-beside'), 'a view that cannot').to.equal(null);
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    const button = root.querySelector('.path-view + button.path-beside');
    expect(button, 'right after the view it moves').to.exist;
    expect(button?.getAttribute('aria-label')).to.be.a('string').and.not.equal('');
    dispose();
  });

  it('asks the window to open the view beside it, as a window on Shift-click', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    const asked: boolean[] = [];
    element.addEventListener('umbradesktop-path-beside', (e) => asked.push((e as CustomEvent<{ floating: boolean }>).detail.floating));
    const button = root.querySelector('button.path-beside') as HTMLButtonElement;
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(asked).to.deep.equal([false, true]);
    dispose();
  });

  it('shows as pressed while the view is open beside the window, as Preview does', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.style.setProperty('--umbradesktop-strip-button-on-background', 'rgb(1, 2, 3)');
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    const button = root.querySelector('button.path-beside')!;
    expect(button.getAttribute('aria-pressed')).to.equal('false');
    const closedTitle = button.getAttribute('title');
    element.view = { label: 'Info', icon: 'icon-info', beside: true, open: true };
    await element.updateComplete;
    expect(button.getAttribute('aria-pressed')).to.equal('true');
    expect(getComputedStyle(button).backgroundColor, 'the theme’s pressed fill').to.equal('rgb(1, 2, 3)');
    expect(button.getAttribute('title'), 'the tooltip says pressing it closes it').to.not.equal(closedTitle);
    dispose();
  });

  it('leaves Preview alone at the strip’s end', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    const actions = root.querySelector('.path-actions');
    expect(actions?.querySelectorAll('button').length).to.equal(1);
    expect(actions?.querySelector('button.path-preview')).to.exist;
    dispose();
  });
});

describe('the glyph for opening beside the window', () => {
  const crumbs: UmbraDesktopPathCrumb[] = [
    { label: 'Content', href: '/umbraco/section/content', current: false, home: true },
    { label: 'Home', href: undefined, current: true },
  ];

  it("is Umbraco's panel icon turned to the right, saying which way the panel will move", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    const icon = root.querySelector('button.path-beside umb-icon.path-toggle-icon') as HTMLElement | null;
    expect(icon, 'the view button has the toggle icon').to.exist;
    // Closed: the panel will come out, so the chevron points right, the way the edge moves.
    expect(icon!.getAttribute('name'), 'closed').to.equal('icon-pannel-close');
    expect(getComputedStyle(icon!).rotate, 'turned a quarter to the left').to.equal('-90deg');
    dispose();
  });

  it('leaves the panel icon off Preview, whose eye and label already say what it opens', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    await element.updateComplete;
    // Two icons on one button read as clutter beside the view button's one. The panel icon is for a
    // button that does nothing but move a pane; Preview names its feature, and its pane's header
    // starts with the same eye.
    const button = root.querySelector('button.path-preview')!;
    expect(!!button.querySelector('.path-toggle-icon'), 'no panel icon').to.equal(false);
    expect(button.querySelectorAll('umb-icon').length, 'the eye alone').to.equal(1);
    dispose();
  });

  it('turns its chevron round once the panel is open, to say it will put it away', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.view = { label: 'Info', icon: 'icon-info', beside: true, open: true };
    await element.updateComplete;
    expect(root.querySelector('button.path-beside umb-icon.path-toggle-icon')?.getAttribute('name')).to.equal('icon-panel-show');
    dispose();
  });

  it("leaves Preview out while the preview is docked: the pane's own Hide has taken its place", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    element.previewActive = true;
    element.previewDocked = true;
    element.view = { label: 'Info', icon: 'icon-info', beside: true, open: true, docked: true };
    await element.updateComplete;
    // Booleans, never `to.equal(null)` on an element: a failing one hangs this runner.
    expect(!!root.querySelector('button.path-preview'), 'Preview while docked').to.equal(false);
    expect(!!root.querySelector('button.path-beside'), 'the view button while docked').to.equal(false);
    element.previewDocked = false;
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    expect(!!root.querySelector('button.path-preview'), 'Preview once it has slid back in').to.equal(true);
    expect(!!root.querySelector('button.path-beside'), 'the view button once it has slid back in').to.equal(true);
    dispose();
  });

  it('keeps Preview, pressed, while the preview is a window of its own, so it can still be closed from here', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    element.previewActive = true;
    await element.updateComplete;
    const button = root.querySelector('button.path-preview');
    expect(button?.getAttribute('aria-pressed')).to.equal('true');
    dispose();
  });

  it("draws every icon on the strip at the pane header's icon size, and its text at 13px", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    // One size for every icon in a strip, the window's and the pane's alike: the first build drew
    // Preview's icons at 15.5px beside the pane's 18px, and the two strips did not read as one.
    for (const icon of ['.path-home', '.path-preview-icon', '.path-toggle-icon', '.path-view-icon']) {
      expect(getComputedStyle(root.querySelector(icon)!).fontSize, icon).to.equal('16px');
    }
    expect(getComputedStyle(root.querySelector('.path-bar')!).fontSize).to.equal('13px');
    dispose();
  });

  it('centres its words on their capitals, as its icons are centred, rather than on their line box', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    // A line box carries the font's room above the letters as well as below, so a word centred by
    // its box sat 1.7px above the icons beside it (measured on the drawn pixels in a live strip).
    // Trimmed to cap height and baseline, the box is the word, and flex centres it like an icon.
    for (const text of ['.path-crumb', '.path-separator', '.path-current', '.path-view-label', '.path-preview-label']) {
      const style = getComputedStyle(root.querySelector(text)!) as CSSStyleDeclaration & { textBoxTrim?: string; textBoxEdge?: string };
      expect(style.textBoxTrim, text).to.equal('trim-both');
      expect(style.textBoxEdge, text).to.equal('cap alphabetic');
    }
    dispose();
  });

  it("draws its bottom line in the backoffice's border colour, the line between the tree and the workspace", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.style.setProperty('--uui-color-border', 'rgb(1, 2, 3)');
    element.style.setProperty('--uui-color-divider', 'rgb(250, 250, 250)');
    await element.updateComplete;
    // The divider colour it used before is barely darker than the strip itself, so the strip ran
    // into the content below it with no visible edge.
    const bar = getComputedStyle(root.querySelector('.path-bar')!);
    expect(bar.borderBottomWidth).to.equal('1px');
    expect(bar.borderBottomColor).to.equal('rgb(1, 2, 3)');
    dispose();
  });

  it('pads the strip the same at both ends, so the first crumb starts as far in as Preview ends', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    await element.updateComplete;
    // The strip owns the space at its ends, and whatever sits there, a crumb or a button, starts at
    // it. Each then pads its own content as it does everywhere.
    const bar = root.querySelector('.path-bar')!.getBoundingClientRect();
    const first = root.querySelector('.path-bar > :first-child')!.getBoundingClientRect();
    const last = root.querySelector('button.path-preview')!.getBoundingClientRect();
    expect(bar.right - last.right).to.equal(first.left - bar.left);
    dispose();
  });

  it('pads Preview and the view button evenly on every side, so the icon-only one is square', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.style.setProperty('--umbradesktop-path-height', '37px');
    element.previewable = true;
    element.view = { label: 'Info', icon: 'icon-info', beside: true };
    await element.updateComplete;
    const beside = root.querySelector('button.path-beside')!;
    expectEvenPadding(beside, 'the view button');
    const box = beside.getBoundingClientRect();
    expect(box.width, 'the view button is square').to.be.closeTo(box.height, 0.5);
    expectEvenPadding(root.querySelector('button.path-preview')!, 'Preview');
    dispose();
  });

  it("fills the strip's height with Preview, as the pane header's buttons fill theirs", async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.style.setProperty('--umbradesktop-path-height', '37px');
    element.previewable = true;
    await element.updateComplete;
    expect(root.querySelector('button.path-preview')!.getBoundingClientRect().height).to.equal(
      root.querySelector('.path-bar')!.clientHeight,
    );
    dispose();
  });

  it('opens Preview as a window on Shift-click too', async () => {
    const { element, root, dispose } = await mountPath(crumbs);
    element.previewable = true;
    await element.updateComplete;
    const asked: boolean[] = [];
    element.addEventListener('umbradesktop-path-preview', (e) => asked.push((e as CustomEvent<{ floating: boolean }>).detail.floating));
    const button = root.querySelector('button.path-preview') as HTMLButtonElement;
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    expect(asked).to.deep.equal([false, true]);
    dispose();
  });
});
