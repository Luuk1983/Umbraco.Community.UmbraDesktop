import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { UMBRADESKTOP_MEDIA_BIN_TREE, UMBRADESKTOP_MEDIA_FOLDER_TREE } from './tree/constants.js';

/** Narrows the bundle to one extension type, so each test reads only what it is about. */
const byType = (type: string) => manifests.filter((m) => m.type === type);

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
  const [app] = byType('umbraDesktopApp') as Array<{
    alias: string;
    meta: { label: string; group?: string; allowMultiple?: boolean; minSize?: { w: number; h: number } };
    conditions?: Array<{ alias: string; match?: string }>;
  }>;
  expect(app.alias).to.equal('Umbraco.Community.UmbraDesktop.Media.MediaManager');
  expect(app.meta.label).to.equal('#umbraDesktopMedia_appName');
  expect(app.meta.group).to.equal('media');
  expect(app.meta.allowMultiple).to.equal(true);
  expect(app.conditions).to.deep.equal([{ alias: 'Umb.Condition.SectionUserPermission', match: 'Umb.Section.Media' }]);
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
  expect(transfers!.conditions).to.deep.equal([{ alias: 'Umb.Condition.SectionUserPermission', match: 'Umb.Section.Media' }]);
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
