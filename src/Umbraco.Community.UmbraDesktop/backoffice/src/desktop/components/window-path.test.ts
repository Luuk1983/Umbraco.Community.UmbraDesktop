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
