import { expect } from '@open-wc/testing';
import icons from './icons.js';
import { manifests } from './manifest.js';

/**
 * The desktop's own icons: the glyphs it needs that Umbraco does not ship, registered the way
 * Umbraco registers its own, through an `icons` extension that `umb-icon` resolves names against.
 *
 * What is asserted is what nothing else would notice going wrong. A name that is not registered
 * draws an empty button without an error anywhere, an icon left visible turns up in the icon picker
 * an editor uses for document types, and a glyph with a hard-coded colour would ignore every theme.
 */

/**
 * Load one icon's markup, the way the icon registry does when `umb-icon` first asks for it.
 * @param path The icon's loader, as the dictionary declares it.
 * @returns The SVG markup.
 */
async function load(path: unknown): Promise<string> {
  const module = await (path as () => Promise<{ default: string }>)();
  return module.default;
}

/**
 * The set, refusing to be empty: every case below walks it, and a loop over nothing passes while
 * checking nothing.
 * @returns The icons.
 */
function iconSet() {
  expect(icons, 'the icon set is empty').to.not.be.empty;
  return icons;
}

it('hands the icon set to Umbraco as an icons extension', async () => {
  const registered = manifests.filter((manifest) => manifest.type === 'icons');
  expect(registered.length, 'one icons extension').to.equal(1);
  const module = await (registered[0].js as () => Promise<{ default: unknown }>)();
  expect(module.default, 'the extension should load this dictionary').to.equal(icons);
});

it('keeps every icon out of the icon picker', () => {
  // They are the desktop's controls, not pictures of content: an editor choosing an icon for a
  // document type has no use for "exit full screen", and core hides its own chrome icons the same way.
  for (const icon of iconSet()) {
    expect(icon.hidden, `${icon.name} should be hidden`).to.equal(true);
  }
});

it('gives every icon a name of its own', () => {
  // Prefixed, because the registry is shared with core and with every other package on the site,
  // and a name another set also registers is a coin toss over which glyph is drawn.
  const names = iconSet().map((icon) => icon.name);
  expect(new Set(names).size, 'two icons share a name').to.equal(names.length);
  for (const name of names) expect(name, 'prefixed with the package').to.match(/^icon-umbradesktop-/);
});

it('draws every icon in the colour of the button around it', async () => {
  // `currentColor` is what lets a theme colour the glyph through the button's own colour, the way
  // it colours every Umbraco icon beside it. The 24-unit box is Umbraco's, so `umb-icon` sizes
  // these exactly as it sizes the pinned apps next to them.
  for (const icon of iconSet()) {
    const svg = await load(icon.path);
    expect(svg, `${icon.name} is not an svg`).to.match(/^<svg[\s>]/);
    expect(svg, `${icon.name} is not drawn in currentColor`).to.contain('stroke="currentColor"');
    expect(svg, `${icon.name} is not on Umbraco's 24-unit box`).to.contain('viewBox="0 0 24 24"');
    expect(svg, `${icon.name} has a colour of its own`).to.not.match(/(fill|stroke)="#/);
  }
});
