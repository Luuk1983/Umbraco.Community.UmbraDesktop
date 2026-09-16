import { expect } from '@open-wc/testing';
import {
  APPLE_TOUCH_ICON_HREF,
  manifestHref,
  refreshManifestLink,
  UMBRADESKTOP_MANIFEST_LINK_ID,
  upsertManifestLink,
} from './manifest-link';

it('serves the manifest from a fixed site-root path', () => {
  expect(manifestHref()).to.equal('/umbradesktop/manifest.webmanifest');
});

it('appends a manifest link when the document has none', () => {
  const head = document.createElement('head');

  upsertManifestLink(head);

  const link = head.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  expect(link).to.not.equal(null);
  expect(link?.getAttribute('href')).to.equal('/umbradesktop/manifest.webmanifest');
  expect(link?.id).to.equal(UMBRADESKTOP_MANIFEST_LINK_ID);
});

it('never adds a second link when called twice', () => {
  const head = document.createElement('head');

  upsertManifestLink(head);
  upsertManifestLink(head);

  expect(head.querySelectorAll('link[rel="manifest"]').length).to.equal(1);
});

it('leaves a manifest link the host already declared alone', () => {
  const head = document.createElement('head');
  const existing = document.createElement('link');
  existing.rel = 'manifest';
  existing.href = '/site.webmanifest';
  head.appendChild(existing);

  upsertManifestLink(head);

  const links = head.querySelectorAll('link[rel="manifest"]');
  expect(links.length).to.equal(1);
  expect(links[0].getAttribute('href')).to.equal('/site.webmanifest');
});

it('adds an apple-touch-icon, which Safari uses instead of the manifest icons', () => {
  const head = document.createElement('head');

  upsertManifestLink(head);

  const icon = head.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  expect(icon?.getAttribute('href')).to.equal(APPLE_TOUCH_ICON_HREF);
});

it('never adds a second apple-touch-icon when called twice', () => {
  const head = document.createElement('head');

  upsertManifestLink(head);
  upsertManifestLink(head);

  expect(head.querySelectorAll('link[rel="apple-touch-icon"]').length).to.equal(1);
});

it('still adds the Safari icon when the host declared its own manifest', () => {
  // The two links are independent. A host manifest is a reason to leave the manifest link alone,
  // and no reason at all to leave Safari without an icon — Safari does not read manifest icons.
  const head = document.createElement('head');
  const existing = document.createElement('link');
  existing.rel = 'manifest';
  existing.href = '/site.webmanifest';
  head.appendChild(existing);

  upsertManifestLink(head);

  expect(head.querySelectorAll('link[rel="apple-touch-icon"]').length).to.equal(1);
});

it('replaces its own link so the browser re-reads the manifest', () => {
  const head = document.createElement('head');
  upsertManifestLink(head);
  const before = head.querySelector('link[rel="manifest"]');

  refreshManifestLink(head);

  const after = head.querySelector('link[rel="manifest"]');
  // A new element, not the same one mutated: replacing it is what makes the browser look again.
  expect(after).to.not.equal(before);
  expect(head.querySelectorAll('link[rel="manifest"]').length).to.equal(1);
  expect(after?.getAttribute('href')).to.equal(manifestHref());
});

it('adds a link when refreshing a document that somehow has none', () => {
  const head = document.createElement('head');

  refreshManifestLink(head);

  expect(head.querySelectorAll('link[rel="manifest"]').length).to.equal(1);
});

it('never touches a manifest link the host declared', () => {
  // The host's manifest is theirs. Refreshing must not become a way to steal it back, which would
  // take an installed app away from someone at the moment they changed an unrelated setting.
  const head = document.createElement('head');
  const existing = document.createElement('link');
  existing.rel = 'manifest';
  existing.href = '/site.webmanifest';
  head.appendChild(existing);

  refreshManifestLink(head);

  const links = head.querySelectorAll('link[rel="manifest"]');
  expect(links.length).to.equal(1);
  expect(links[0]).to.equal(existing);
});
