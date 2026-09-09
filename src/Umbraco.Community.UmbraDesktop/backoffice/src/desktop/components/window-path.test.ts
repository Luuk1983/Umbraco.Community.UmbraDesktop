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
