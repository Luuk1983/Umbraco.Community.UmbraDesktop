import { expect } from '@open-wc/testing';
import './package-settings-screen.element.js';
import type { UmbraDesktopSettingsPackage } from '../package-settings.js';
import type { ManifestUmbraDesktopPackageSettings } from '../package-settings.extension.js';

/**
 * A package's screen: who the settings are from, then one box per manifest with the package's own
 * element inside. Strings and booleans only in assertions; see `settings-modal.test.ts` for why.
 */

class BoxA extends HTMLElement {}
class BoxB extends HTMLElement {}
if (!customElements.get('test-box-a')) customElements.define('test-box-a', BoxA);
if (!customElements.get('test-box-b')) customElements.define('test-box-b', BoxB);

/** A package with the given boxes, already in drawing order. */
function pkg(...boxes: Array<{ alias: string; label: string; element: unknown }>): UmbraDesktopSettingsPackage {
  return {
    name: 'My Package',
    boxes: boxes.map((box) => ({
      alias: box.alias,
      label: box.label,
      weight: 0,
      manifest: {
        type: 'umbraDesktopPackageSettings',
        alias: box.alias,
        name: box.alias,
        element: box.element,
        meta: { package: 'My Package', label: box.label },
      } as ManifestUmbraDesktopPackageSettings,
    })),
  };
}

/** Mount the screen and wait until `done` holds, or give up after 50 macrotasks. */
async function mount(value: UmbraDesktopSettingsPackage, done: (root: ShadowRoot) => boolean) {
  const element = document.createElement('umbradesktop-settings-package');
  element.package = value;
  document.body.append(element);
  after(() => element.remove());
  await element.updateComplete;
  const root = element.shadowRoot!;
  for (let tries = 0; tries < 50 && !done(root); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await element.updateComplete;
  }
  return { element, root };
}

it('says whose settings these are, by package name', async () => {
  const { root } = await mount(pkg({ alias: 'A', label: 'General', element: BoxA }), () => true);
  // No dictionary in the runner, so the term renders as its key with the name; in a backoffice it
  // is the sentence. Either way the package is named.
  expect(root.querySelector('.attribution')?.textContent ?? '').to.match(/settingsPackageAttribution|My Package/);
});

it('draws one box per manifest, headed by its label, in the order given', async () => {
  const { root } = await mount(
    pkg({ alias: 'A', label: 'First', element: BoxA }, { alias: 'B', label: 'Second', element: BoxB }),
    (r) => !!r.querySelector('test-box-b'),
  );
  expect([...root.querySelectorAll('uui-box')].map((box) => box.getAttribute('headline'))).to.deep.equal([
    'First',
    'Second',
  ]);
  expect(!!root.querySelector('uui-box[data-box="A"] test-box-a')).to.equal(true);
  expect(!!root.querySelector('uui-box[data-box="B"] test-box-b')).to.equal(true);
});

it('says so in a box whose element cannot be loaded, and still shows the others', async () => {
  const { root } = await mount(
    pkg(
      { alias: 'Broken', label: 'Broken', element: () => Promise.reject(new Error('the chunk is gone')) },
      { alias: 'A', label: 'Fine', element: BoxA },
    ),
    (r) => !!r.querySelector('uui-box[data-box="Broken"] .failed') && !!r.querySelector('test-box-a'),
  );
  expect(root.querySelector('uui-box[data-box="Broken"] .failed')?.textContent ?? '').to.match(
    /settingsBoxLoadFailed|could not be loaded/,
  );
  expect(!!root.querySelector('uui-box[data-box="A"] test-box-a')).to.equal(true);
});

it('keeps a loaded element when the package is handed over again', async () => {
  const value = pkg({ alias: 'A', label: 'First', element: BoxA });
  const { element, root } = await mount(value, (r) => !!r.querySelector('test-box-a'));
  const before = root.querySelector('test-box-a');
  element.package = { ...value, boxes: [...value.boxes] };
  await element.updateComplete;
  expect(root.querySelector('test-box-a') === before, 'the same element, not a fresh one').to.equal(true);
});

it('drops a box that is no longer in the package', async () => {
  const value = pkg({ alias: 'A', label: 'First', element: BoxA }, { alias: 'B', label: 'Second', element: BoxB });
  const { element, root } = await mount(value, (r) => !!r.querySelector('test-box-b'));
  element.package = { ...value, boxes: value.boxes.slice(0, 1) };
  await element.updateComplete;
  expect(!!root.querySelector('uui-box[data-box="B"]')).to.equal(false);
});
