import { expect } from '@open-wc/testing';
import { buildCrumbs, crumbHref, sectionPathnameOf, structureItemLabel, windowShowsPath } from './crumbs.js';
import type { UmbraDesktopApp } from '../types.js';

/** A section window: the case the strip exists for. */
const mediaApp: UmbraDesktopApp = {
  alias: 'media',
  name: 'Media library',
  icon: 'icon-picture',
  content: { kind: 'iframe', url: '/umbraco/section/media' },
  chromeProfile: 'full-section',
};

/** A window that is one workspace, with no tree to get lost in. */
const logViewerApp: UmbraDesktopApp = {
  alias: 'log-viewer',
  name: 'Log Viewer',
  icon: 'icon-box',
  content: { kind: 'iframe', url: '/umbraco/section/settings/workspace/log-viewer' },
  chromeProfile: 'workspace-only',
};

/** A tree-root window inside another section: the case a "back to the section root" button got wrong. */
const docTypesApp: UmbraDesktopApp = {
  alias: 'document-types',
  name: 'Document Types',
  icon: 'icon-document-dashed-line',
  content: { kind: 'iframe', url: '/umbraco/section/settings/workspace/document-type-root' },
  chromeProfile: 'full-section',
};

/** A self-contained app, which has no frame at all. */
const gameApp: UmbraDesktopApp = {
  alias: 'minesweeper',
  name: 'Minesweeper',
  icon: 'icon-bug',
  content: { kind: 'element', element: 'game.js' },
  chromeProfile: 'bare',
};

it('draws a strip for a full-section iframe window only', () => {
  expect(windowShowsPath(mediaApp)).to.be.true;
  expect(windowShowsPath(logViewerApp)).to.be.false;
  expect(windowShowsPath(gameApp)).to.be.false;
});

it('draws no strip for an element app, whatever profile it claims', () => {
  // The body kind is checked as well as the profile: an element app's `chromeProfile` is meaningless
  // and never read on that path, so a check on the profile alone would put a strip on a game.
  expect(windowShowsPath({ ...gameApp, chromeProfile: 'full-section' })).to.be.false;
});

it('is the app alone when the frame reports no structure', () => {
  expect(buildCrumbs(mediaApp, [], undefined)).to.deep.equal([
    { label: 'Media library', href: '/umbraco/section/media', current: false, home: true },
  ]);
});

it("drops core's own root item, because the first crumb already is it", () => {
  const crumbs = buildCrumbs(
    mediaApp,
    [
      // null, not '': `UmbEntityUnique` is `string | null` and core's root item carries null.
      { unique: null, entityType: 'media-root', name: 'Media', href: 'section/media' },
      { unique: 'a1', entityType: 'media', name: 'Campaigns', href: 'section/media/workspace/media/edit/a1' },
      { unique: 'b2', entityType: 'media', name: 'hero.jpg', href: 'section/media/workspace/media/edit/b2' },
    ],
    undefined,
  );

  expect(crumbs.map((crumb) => crumb.label)).to.deep.equal(['Media library', 'Campaigns', 'hero.jpg']);
});

it('marks the last crumb current, and gives it no link', () => {
  const crumbs = buildCrumbs(
    mediaApp,
    [
      { unique: 'a1', entityType: 'media', name: 'Campaigns', href: 'section/media/workspace/media/edit/a1' },
      { unique: 'b2', entityType: 'media', name: 'hero.jpg', href: 'section/media/workspace/media/edit/b2' },
    ],
    undefined,
  );

  // Indexed rather than `.at(-1)`: this project's `lib` target predates it, and `npm test` would
  // not have told us — esbuild transpiles without type-checking, so only `npm run build` catches it.
  expect(crumbs[crumbs.length - 1]).to.deep.equal({ label: 'hero.jpg', href: undefined, current: true });
  expect(crumbs[crumbs.length - 2].current).to.be.false;
});

it("prefers the workspace's live name over the structure's copy for the current item", () => {
  const crumbs = buildCrumbs(
    mediaApp,
    [{ unique: 'b2', entityType: 'media', name: 'hero.jpg', href: 'x' }],
    'hero-renamed.jpg',
  );

  expect(crumbs[crumbs.length - 1].label).to.equal('hero-renamed.jpg');
});

it('takes the section from the window’s own launch URL', () => {
  expect(sectionPathnameOf(mediaApp)).to.equal('media');
  expect(sectionPathnameOf(docTypesApp)).to.equal('settings');
  expect(sectionPathnameOf(gameApp)).to.be.undefined;
});

it("builds a link for a structure that hands out none, which is every non-variant section in v17", () => {
  // Document types provide the plain `UmbMenuStructureWorkspaceContext`, which publishes `structure`
  // and no `getItemHref`. Without this the middle crumbs of a Document Types window would be dead
  // text, and that window has the same complaint as Media (issue #43).
  const crumbs = buildCrumbs(
    docTypesApp,
    [
      { unique: 'f1', entityType: 'document-type', name: 'Pages' },
      { unique: 'd2', entityType: 'document-type', name: 'Blog Post' },
    ],
    undefined,
  );

  expect(crumbs[1].href).to.equal('section/settings/workspace/document-type/edit/f1');
});

it("keeps core's own href when it has one, because the section knows things the shell does not", () => {
  const crumbs = buildCrumbs(
    mediaApp,
    [{ unique: 'a1', entityType: 'media', name: 'Campaigns', href: 'section/media/hand/written' }],
    'Campaigns',
  );

  // The only item is also the current one, so the href is dropped; check the builder directly.
  expect(crumbHref({ unique: 'a1', entityType: 'media', name: 'x', href: 'kept' }, 'media')).to.equal('kept');
  expect(crumbs[crumbs.length - 1].href).to.be.undefined;
});

/**
 * The naming chain is core's, step for step, including the parentheses.
 *
 * Not invented here and not simplified: an editor reading a path in Umbraco already knows that a
 * name in brackets is borrowed from another language, because that is what core's own breadcrumb
 * does two lines further down the same window. A shorter chain of ours would disagree with it in
 * exactly the multilingual sites where the difference is confusing.
 */
const localised = {
  unique: 'a1',
  entityType: 'document',
  name: '',
  href: 'x',
  variants: [
    { culture: 'da-DK', segment: null, name: 'Forside' },
    { culture: 'en-US', segment: null, name: 'Home' },
  ],
};

it("names a variant item after the variant the workspace is editing", () => {
  expect(structureItemLabel(localised, { culture: 'en-US', segment: null })).to.equal('Home');
});

it("borrows the app's current culture when the item has no variant for the one being edited, and says so", () => {
  // An ancestor need not exist in every language. A crumb in another language still navigates; the
  // brackets are what tell the editor the name is not this variant's own.
  expect(
    structureItemLabel(localised, { culture: 'de-DE', segment: null }, { current: 'da-DK' }),
  ).to.equal('(Forside)');
});

it("falls back to the app's default culture after that, still bracketed", () => {
  expect(
    structureItemLabel(localised, { culture: 'de-DE', segment: null }, { current: 'fr-FR', default: 'en-US' }),
  ).to.equal('(Home)');
});

it('shows a borrowed name unbracketed when the workspace itself is invariant', () => {
  // Nothing is borrowed from the reader's point of view: an invariant workspace has one name, so
  // brackets would be claiming a distinction that does not exist here.
  expect(structureItemLabel(localised, undefined, { current: 'da-DK' })).to.equal('Forside');
});

it('prefers an invariant name over an arbitrary variant, and the first variant only as a last resort', () => {
  const mixed = {
    ...localised,
    variants: [
      { culture: 'da-DK', segment: null, name: 'Forside' },
      { culture: null, segment: null, name: 'Shared' },
    ],
  };
  expect(structureItemLabel(mixed, { culture: 'de-DE', segment: null }, { current: 'fr-FR' })).to.equal('Shared');
  expect(structureItemLabel(localised, { culture: 'de-DE', segment: null }, { current: 'fr-FR' })).to.equal('Forside');
});

it('uses the plain name for an item that does not vary at all', () => {
  expect(
    structureItemLabel({ unique: 'a1', entityType: 'media', name: 'hero.jpg', href: 'x' }, undefined),
  ).to.equal('hero.jpg');
});
