import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { UMBRADESKTOP_MEDIA_BIN_TREE, UMBRADESKTOP_MEDIA_FOLDER_TREE } from './tree/constants.js';
import { IMAGE_EDITOR_CONTENT_SIZE, IMAGE_EDITOR_MIN_CONTENT_SIZE } from './image-editor/constants.js';
import en from './localization/en.js';

/** Narrows the bundle to one extension type, so each test reads only what it is about. */
const byType = (type: string) => manifests.filter((m) => m.type === type);

/** A registered app's fields, as far as these tests read them. */
interface App {
  alias: string;
  element?: unknown;
  js?: unknown;
  weight?: number;
  conditions?: Array<{ alias: string; match?: string }>;
  meta: {
    label: string;
    icon: string;
    group?: string;
    defaultSize?: unknown;
    minSize?: unknown;
    allowMultiple?: boolean;
    hideFromLauncher?: boolean;
  };
}

/** One registered app by the last part of its alias. */
const app = (name: string) =>
  (byType('umbraDesktopApp') as unknown as App[]).find((m) => m.alias === `Umbraco.Community.UmbraDesktop.Media.${name}`);

/** The dictionary's area, for the label checks. */
const area = (en as Record<string, Record<string, string>>).umbraDesktopMedia;

/** What both launcher apps and the Transfers window show under: the Media section, and nothing else. */
const MEDIA_SECTION = [{ alias: 'Umb.Condition.SectionUserPermission', match: 'Umb.Section.Media' }];

/** Every alias is namespaced with the package id, so two packages can never collide. */
it('namespaces every alias with the package id, and never repeats one', () => {
  const aliases = manifests.map((m) => m.alias);
  expect(aliases.every((alias) => alias.startsWith('Umbraco.Community.UmbraDesktop.Media.'))).to.equal(true);
  expect(new Set(aliases).size).to.equal(aliases.length);
});

it('registers its docs for the Help app', () => {
  const [docs] = byType('umbraDesktopDocs') as Array<{ alias: string; meta: { path: string } }>;
  expect(docs.alias).to.equal('Umbraco.Community.UmbraDesktop.Media.Docs');
  expect(docs.meta.path).to.equal('/App_Plugins/Umbraco.Community.UmbraDesktop.Media/docs');
});

it('registers its dictionaries in English and Dutch', () => {
  expect(byType('localization').map((m) => (m as { meta: { culture: string } }).meta.culture)).to.deep.equal(['en', 'nl']);
});

/**
 * A Media group of its own, defined by the package whose apps fill it, as the Image Editor's branch
 * defines it: the same alias, label and weight, so the two land as one.
 */
it('defines a Media group for the launcher, after System and before Accessories', () => {
  const [catalogue] = byType('umbraDesktopCatalogue') as Array<{ alias: string; meta: { groups: Array<{ alias: string; label: string; weight: number }> } }>;
  expect(catalogue.alias).to.equal('Umbraco.Community.UmbraDesktop.Media.Catalogue');
  expect(catalogue.meta.groups).to.deep.equal([{ alias: 'media', label: '#umbraDesktopMedia_groupMedia', weight: 52 }]);
});

/** The Media Manager in the launcher's Media group, for anyone who may use the Media section. */
it('registers the Media Manager as a desktop app that opens many windows', () => {
  const manager = app('MediaManager')!;
  expect(manager.meta.label).to.equal('#umbraDesktopMedia_mediaManager');
  expect(area.mediaManager).to.be.a('string');
  expect(manager.meta.icon).to.equal('icon-folders');
  expect(manager.meta.group).to.equal('media');
  expect(manager.meta.allowMultiple).to.equal(true);
  expect(manager.conditions).to.deep.equal(MEDIA_SECTION);
});

/**
 * The Image Editor (#136) in the same group, under the same rule: it saves to media items, which the
 * management API refuses without the Media section. Owner's choice, 2026-10-19.
 */
it('registers the Image Editor under its final alias, for anyone who may use the Media section', () => {
  const editor = app('ImageEditor')!;
  expect(editor.meta.label).to.equal('#umbraDesktopMedia_imageEditor');
  expect(area.imageEditor).to.be.a('string');
  expect(editor.meta.icon).to.equal('icon-picture');
  expect(editor.meta.group).to.equal('media');
  expect(editor.meta.allowMultiple).to.equal(true);
  expect(editor.meta.defaultSize).to.deep.equal(IMAGE_EDITOR_CONTENT_SIZE);
  expect(editor.meta.minSize).to.deep.equal(IMAGE_EDITOR_MIN_CONTENT_SIZE);
  expect(editor.conditions).to.deep.equal(MEDIA_SECTION);
});

/** `element`, never `js`: the desktop reads only `element`, and an app declared with `js` is dropped. */
it('declares every app through a lazy `element` loader', () => {
  for (const each of byType('umbraDesktopApp') as unknown as App[]) {
    expect(typeof each.element, each.alias).to.equal('function');
    expect(each.js, each.alias).to.equal(undefined);
  }
});

/**
 * The Media Manager first in the group, then the Image Editor (owner, 2026-10-19). A root `weight`
 * sorts higher first, as everywhere in Umbraco, and an unset one competes as zero, which would put the
 * Manager behind the editor: so both are set, and the two icons differ so the tiles do too.
 */
it('puts the Media Manager before the Image Editor, each with its own icon', () => {
  const manager = app('MediaManager')!;
  const editor = app('ImageEditor')!;
  expect(manager.weight).to.be.a('number');
  expect(editor.weight).to.be.a('number');
  expect(manager.weight!).to.be.greaterThan(editor.weight!);
  expect(manager.meta.icon).to.not.equal(editor.meta.icon);
});

/** Design §1: our actions only inside a manager window, so the Media section stays as Umbraco ships it. */
it('shows every action of its own only inside a manager window', () => {
  const [condition] = byType('condition');
  expect(condition.alias).to.equal('Umbraco.Community.UmbraDesktop.Media.Condition.InMediaManager');
  const actions = [...byType('entityAction'), ...byType('entityBulkAction')] as Array<{ conditions?: Array<{ alias: string }> }>;
  expect(actions.length).to.be.greaterThan(0);
  for (const action of actions) {
    expect(action.conditions?.some((each) => each.alias === condition.alias)).to.equal(true);
  }
});

it('offers Open in new window on folders and the Media root', () => {
  const open = byType('entityAction').find((m) => m.alias === 'Umbraco.Community.UmbraDesktop.Media.OpenInNewWindow') as
    | { forEntityTypes: string[]; meta: { label: string }; conditions: Array<{ alias: string; folder?: boolean }> }
    | undefined;
  expect(open?.forEntityTypes).to.deep.equal(['media', 'media-root']);
  expect(open?.meta.label).to.equal('#umbraDesktopMedia_openInNewWindow');
  expect(open?.conditions[0].folder).to.equal(true);
});

/** Design §5: the clipboard is ours, in item menus, folder menus and core's selection bar. */
it('offers Cut and Copy on items, Paste on folders while something is held, and Cut, Copy and Copy to in the selection bar', () => {
  const entity = byType('entityAction') as Array<{ alias: string; forEntityTypes: string[]; conditions: Array<{ alias: string; folder?: boolean }> }>;
  const bulk = byType('entityBulkAction') as Array<{ alias: string; forEntityTypes: string[]; conditions: Array<{ alias: string; match?: string }> }>;
  const find = (list: typeof entity, name: string) => list.find((m) => m.alias === `Umbraco.Community.UmbraDesktop.Media.${name}`);
  expect(find(entity, 'Cut')?.forEntityTypes).to.deep.equal(['media']);
  expect(find(entity, 'Copy')?.forEntityTypes).to.deep.equal(['media']);
  const paste = find(entity, 'Paste');
  expect(paste?.forEntityTypes).to.deep.equal(['media', 'media-root']);
  expect(paste?.conditions.map((each) => each.alias)).to.include('Umbraco.Community.UmbraDesktop.Media.Condition.ClipboardHolds');
  expect(paste?.conditions.find((each) => each.alias.endsWith('InMediaManager'))?.folder).to.equal(true);
  for (const name of ['Cut', 'Copy']) {
    expect(find(entity, name)?.conditions.map((each) => each.alias), name).to.include('Umb.Condition.EntityIsNotTrashed');
  }
  for (const name of ['BulkCut', 'BulkCopy', 'CopyTo']) {
    const action = bulk.find((m) => m.alias === `Umbraco.Community.UmbraDesktop.Media.${name}`);
    expect(action?.forEntityTypes, name).to.deep.equal(['media']);
    expect(action?.conditions.find((each) => each.alias === 'Umb.Condition.CollectionAlias')?.match, name).to.equal('Umb.Collection.Media');
  }
});

it('runs its operations in a desktop context, so they outlive the window that started them', () => {
  expect(byType('umbraDesktopContext').map((m) => m.alias)).to.deep.equal(['Umbraco.Community.UmbraDesktop.Media.Context']);
});

it('registers the Transfers window as one desktop app the launcher leaves out', () => {
  const transfers = byType('umbraDesktopApp').find((m) => m.alias === 'Umbraco.Community.UmbraDesktop.Media.Transfers') as
    | { meta: { allowMultiple?: boolean; hideFromLauncher?: boolean }; conditions?: Array<{ alias: string; match?: string }> }
    | undefined;
  expect(!!transfers).to.equal(true);
  expect(transfers!.meta).to.deep.include({ allowMultiple: false, hideFromLauncher: true });
  expect(transfers!.conditions).to.deep.equal(MEDIA_SECTION);
});

/**
 * Design §17: the tree beside a window is core's default tree on data of the manager's own, folders only,
 * and the recycle bin a single row. Each tree names its repository, and the tree host draws both.
 */
it('registers a folders-only tree and a one-row recycle bin, each on a repository of its own', async () => {
  const trees = byType('tree') as Array<{ alias: string; kind?: string; meta: { repositoryAlias: string } }>;
  const repositories = byType('repository').map((m) => m.alias);
  expect(trees.map((tree) => tree.alias)).to.deep.equal([UMBRADESKTOP_MEDIA_FOLDER_TREE, UMBRADESKTOP_MEDIA_BIN_TREE]);
  for (const tree of trees) {
    expect(tree.kind, tree.alias).to.equal('default');
    expect(repositories, tree.alias).to.include(tree.meta.repositoryAlias);
  }
});
