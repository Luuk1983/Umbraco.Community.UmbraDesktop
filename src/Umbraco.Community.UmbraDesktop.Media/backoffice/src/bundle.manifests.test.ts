import { expect } from '@open-wc/testing';
import { manifests } from './bundle.manifests.js';
import { UMBRADESKTOP_MEDIA_BIN_TREE, UMBRADESKTOP_MEDIA_FOLDER_TREE } from './tree/constants.js';
import { IMAGE_EDITOR_CONTENT_SIZE, IMAGE_EDITOR_MIN_CONTENT_SIZE } from './image-editor/constants.js';
import { MEDIA_HEALTH_CONTENT_SIZE, MEDIA_HEALTH_DETAILS_MIN_SIZE, MEDIA_HEALTH_DETAILS_SIZE, MEDIA_HEALTH_MIN_CONTENT_SIZE, UMBRADESKTOP_MEDIA_HEALTH_DETAILS_APP } from './health/health-app.js';
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
  // Not icon-picture, which is the Media section's own (owner, 2026-10-20), nor Paint's icon-palette,
  // the Crop mode's icon-crop or the Markup pen's icon-brush: a pencil and ruler, used nowhere else.
  expect(editor.meta.icon).to.equal('icon-ruler-alt');
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

/** An action's fields, as far as the tests below read them. */
interface Action {
  alias: string;
  forEntityTypes: string[];
  meta: { label: string; icon: string };
  conditions?: Array<{ alias: string; match?: string; folder?: boolean }>;
}

/** Every action this package registers, item and selection bar alike. */
const actions = () => [...byType('entityAction'), ...byType('entityBulkAction')] as unknown as Action[];

/** The in-manager condition's alias, found by alias rather than by its place in the list. */
const IN_MANAGER = 'Umbraco.Community.UmbraDesktop.Media.Condition.InMediaManager';

/**
 * The actions that belong to a Media Manager window and to no other place: the Manager's own
 * clipboard and windows. Named one by one, so an action added later has to be put on this list or
 * on the everywhere list below, and cannot slip into the Media section by default.
 */
const MANAGER_ONLY = ['OpenInNewWindow', 'Cut', 'Copy', 'Paste', 'BulkCut', 'BulkCopy', 'CopyTo', 'EditImageInManager'];

/**
 * The actions that show wherever core shows a media item's actions, on the desktop: Edit image (#137),
 * and Optimize images in the selection bar of any media collection (#139).
 */
const EVERYWHERE = ['EditImage', 'OptimizeImages'];

it('registers the in-manager condition', () => {
  expect(byType('condition').map((m) => m.alias)).to.include(IN_MANAGER);
});

/** Design §1: the Manager's actions only inside a manager window, so the Media section stays as Umbraco ships it. */
it("shows the Manager's own actions only inside a manager window", () => {
  for (const name of MANAGER_ONLY) {
    const action = actions().find((m) => m.alias === `Umbraco.Community.UmbraDesktop.Media.${name}`);
    expect(action, name).to.not.equal(undefined);
    expect(action!.conditions?.some((each) => each.alias === IN_MANAGER), name).to.equal(true);
  }
});

it('puts every action it registers on one of the two lists', () => {
  const named = [...MANAGER_ONLY, ...EVERYWHERE].map((name) => `Umbraco.Community.UmbraDesktop.Media.${name}`);
  expect(actions().map((m) => m.alias).sort()).to.deep.equal(named.sort());
});

/** The conditions every file tool shows under (#137, #176): on the desktop, the Media section, not in the bin. */
const ON_DESKTOP_WITH_MEDIA = ['Umbraco.Community.UmbraDesktop.Media.Condition.OnDesktop', 'Umb.Condition.SectionUserPermission', 'Umb.Condition.EntityIsNotTrashed'];

/**
 * The weight core's `default` workspace action kind gives an action that sets none, as the media Save
 * does (`workspace-action/default/manifests.ts` at release-17.6.0).
 */
const CORE_DEFAULT_ACTION_WEIGHT = 1000;

/** The is-image condition's alias, which with `match: 'file'` answers for other files (#176). */
const IS_IMAGE = 'Umbraco.Community.UmbraDesktop.Media.Condition.IsImage';

/**
 * #137 and #176: Edit image on image items wherever core shows a media item's actions, in two
 * manifests. Inside a Media Manager window it stays an image card's quick button (owner, 2026-10-26:
 * "it's what people expect"); everywhere else it has a normal weight below every core media action on
 * an item (Create 1200, Trash 1150, Delete 1100, Move to 700, Sort 100) and above Reload (0), so core's
 * own card shows what core shows. The in-manager condition, asked for `outside` on the second, keeps
 * the two from both showing.
 */
it('offers Edit image on image items: the quick button in a Manager window, low in the menu elsewhere', () => {
  const find = (name: string) => byType('entityAction').find((m) => m.alias === `Umbraco.Community.UmbraDesktop.Media.${name}`) as unknown as Action & { weight: number };
  const elsewhere = find('EditImage');
  const inManager = find('EditImageInManager');
  for (const edit of [elsewhere, inManager]) {
    expect(edit.forEntityTypes).to.deep.equal(['media']);
    expect(edit.meta.label).to.equal('#umbraDesktopMedia_editImage');
    expect(edit.meta.icon).to.equal(app('ImageEditor')!.meta.icon);
    const aliases = (edit.conditions ?? []).map((each) => each.alias);
    for (const alias of [...ON_DESKTOP_WITH_MEDIA, IS_IMAGE]) expect(aliases, `${edit.alias} ${alias}`).to.include(alias);
  }
  expect(area.editImage).to.be.a('string');
  expect(elsewhere.weight).to.be.below(100).and.above(0);
  expect(inManager.weight).to.be.above(1990, 'above Cut, so it is the card quick button');
  const managerOf = (edit: Action) => edit.conditions?.find((each) => each.alias === IN_MANAGER) as { outside?: boolean } | undefined;
  expect(managerOf(elsewhere)?.outside).to.equal(true);
  expect(managerOf(inManager)?.outside).to.equal(undefined);
  expect(managerOf(inManager)).to.not.equal(undefined);
  const registered = byType('condition').map((m) => m.alias);
  expect(registered).to.include('Umbraco.Community.UmbraDesktop.Media.Condition.OnDesktop');
  expect(registered).to.include(IS_IMAGE);
});

/** A workspace action, menu item or property action, as far as the tests below read them. */
interface FileTool {
  alias: string;
  type: string;
  kind?: string;
  weight?: number;
  api?: unknown;
  forWorkspaceActions?: string | string[];
  forPropertyEditorUis?: string[];
  meta: { label: string; icon?: string; look?: string; umbraDesktopTool: string };
  conditions?: Array<{ alias: string; match?: string }>;
}

/** One file tool manifest by the last part of its alias. */
const tool = (name: string) => manifests.find((m) => m.alias === `Umbraco.Community.UmbraDesktop.Media.${name}`) as unknown as FileTool;

/** The media workspace, by core's workspace-alias condition. */
const inMediaWorkspace = (each: FileTool) =>
  each.conditions?.some((condition) => condition.alias === 'Umb.Condition.WorkspaceAlias' && condition.match === 'Umb.Workspace.Media') === true;

/**
 * #176, after the owner's second look: two buttons beside Save in the media item's footer, **Download**
 * and **File actions**, on any item that holds a file, and none on a folder. File actions only opens a
 * menu, so no tool is the default behind the others (owner, 2026-10-26: "Edit image is not more
 * important than the other options").
 */
it("puts Download and File actions in the media item's footer, left of Save", () => {
  const download = tool('WorkspaceAction.Download');
  const fileActions = tool('WorkspaceAction.FileActions');
  for (const button of [download, fileActions]) {
    expect(button.type, button.alias).to.equal('workspaceAction');
    // Left of Save, so Save keeps its place at the right edge: core's `default` kind gives the media
    // Save weight 1000 (it sets none), and a higher weight sits further left (measured 2026-10-26).
    expect(button.weight, button.alias).to.be.above(CORE_DEFAULT_ACTION_WEIGHT);
    expect(typeof button.api, button.alias).to.equal('function');
    expect(inMediaWorkspace(button), button.alias).to.equal(true);
    const aliases = (button.conditions ?? []).map((each) => each.alias);
    for (const alias of ON_DESKTOP_WITH_MEDIA) expect(aliases, `${button.alias} ${alias}`).to.include(alias);
    const match = (button.conditions?.find((each) => each.alias === IS_IMAGE) as { match?: string } | undefined)?.match;
    expect(match, `${button.alias} on any item with a file`).to.equal('any');
  }
  expect(download.weight!, 'Download first').to.be.above(fileActions.weight!);
  expect(download.kind).to.equal('default');
  expect(download.meta).to.include({ label: '#umbraDesktopMedia_download', look: 'secondary', umbraDesktopTool: 'download' });
  expect(typeof (fileActions as unknown as { element?: unknown }).element, 'its own element, a menu button').to.equal('function');
  expect(fileActions.meta.label).to.equal('#umbraDesktopMedia_fileActions');
  expect(area.fileActions).to.be.a('string');
  expect(manifests.some((m) => m.alias === 'Umbraco.Community.UmbraDesktop.Media.WorkspaceAction.EditImage'), 'no Edit image face any more').to.equal(false);
});

/**
 * #176: File actions' menu: Edit image, Replace file, Optimize on an image; Replace file on any other
 * file. Each entry is a workspace action menu item, so another package can add one.
 */
it('lists Edit image, Replace file and Optimize under File actions', () => {
  const fileActionsAlias = 'Umbraco.Community.UmbraDesktop.Media.WorkspaceAction.FileActions';
  const items = (manifests.filter((m) => m.type === 'workspaceActionMenuItem') as unknown as FileTool[]).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  for (const each of items) {
    expect(([] as string[]).concat(each.forWorkspaceActions ?? []), each.alias).to.deep.equal([fileActionsAlias]);
    expect(each.kind, each.alias).to.equal('default');
    expect(typeof each.api, each.alias).to.equal('function');
    expect(area[each.meta.label.replace('#umbraDesktopMedia_', '')], each.alias).to.be.a('string');
  }
  expect(items.map((each) => each.meta.umbraDesktopTool)).to.deep.equal(['editImage', 'replaceFile', 'optimize']);
  const imagesOnly = (each: FileTool) => (each.conditions ?? []).some((condition) => condition.alias === IS_IMAGE && (condition.match ?? 'image') === 'image');
  expect(items.filter(imagesOnly).map((each) => each.meta.umbraDesktopTool)).to.deep.equal(['editImage', 'optimize']);
});

/**
 * #176: the same tools on the file property's own "...": the Image Cropper and the Upload field, in the
 * media item only (never on a page's cropper), on its file property only, and only with a file in it.
 * Edit image and Optimize for images; Replace file only where the property can be written.
 */
it("offers the same tools on the file property's own menu, in the media item only", () => {
  const actions = manifests.filter((m) => m.type === 'propertyAction') as unknown as FileTool[];
  expect(actions.map((each) => each.meta.umbraDesktopTool)).to.have.members(['editImage', 'download', 'replaceFile', 'optimize']);
  for (const each of actions) {
    expect(each.kind, each.alias).to.equal('default');
    expect(each.forPropertyEditorUis, each.alias).to.have.members(['Umb.PropertyEditorUi.ImageCropper', 'Umb.PropertyEditorUi.UploadField']);
    expect(inMediaWorkspace(each), each.alias).to.equal(true);
    const aliases = (each.conditions ?? []).map((condition) => condition.alias);
    for (const alias of [...ON_DESKTOP_WITH_MEDIA, 'Umbraco.Community.UmbraDesktop.Media.Condition.FileProperty', 'Umb.Condition.Property.HasValue']) {
      expect(aliases, `${each.alias} ${alias}`).to.include(alias);
    }
    const imagesOnly = each.meta.umbraDesktopTool === 'editImage' || each.meta.umbraDesktopTool === 'optimize';
    expect(aliases.includes(IS_IMAGE), each.alias).to.equal(imagesOnly);
    expect(aliases.includes('Umb.Condition.Property.Writable'), each.alias).to.equal(each.meta.umbraDesktopTool === 'replaceFile');
  }
  const order = [...actions].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).map((each) => each.meta.umbraDesktopTool);
  expect(order).to.deep.equal(['editImage', 'download', 'replaceFile', 'optimize']);
  expect(byType('condition').map((m) => m.alias)).to.include('Umbraco.Community.UmbraDesktop.Media.Condition.FileProperty');
});

/**
 * #139: Optimize images in core's selection bar of a media collection, in Media Manager windows and the
 * Media section's window alike (design §4): on the desktop, where its window opens, and for someone with
 * the Media section, as Edit image. Not the in-manager condition. After the Manager's Copy to (21) and
 * core's Move to (20), before core's Trash (10).
 */
it('offers Optimize images in the selection bar of any media collection on the desktop', () => {
  const optimize = byType('entityBulkAction').find((m) => m.alias === 'Umbraco.Community.UmbraDesktop.Media.OptimizeImages') as
    | { forEntityTypes: string[]; weight: number; meta: { label: string; icon: string }; conditions: Array<{ alias: string; match?: string }> }
    | undefined;
  expect(optimize?.forEntityTypes).to.deep.equal(['media']);
  expect(optimize?.meta.label).to.equal('#umbraDesktopMedia_optimizeImages');
  expect(area.optimizeImages).to.be.a('string');
  expect(optimize?.weight).to.be.below(20).and.above(10);
  expect(optimize?.conditions.map((each) => each.alias)).to.deep.equal([
    'Umb.Condition.CollectionAlias',
    'Umbraco.Community.UmbraDesktop.Media.Condition.OnDesktop',
    'Umb.Condition.SectionUserPermission',
  ]);
  expect(optimize?.conditions[0].match).to.equal('Umb.Collection.Media');
  expect(optimize?.conditions[2].match).to.equal('Umb.Section.Media');
});

it('offers Open in new window on folders and the Media root', () => {
  const open = byType('entityAction').find((m) => m.alias === 'Umbraco.Community.UmbraDesktop.Media.OpenInNewWindow') as
    | { forEntityTypes: string[]; meta: { label: string }; conditions: Array<{ alias: string; folder?: boolean }> }
    | undefined;
  expect(open?.forEntityTypes).to.deep.equal(['media', 'media-root']);
  expect(open?.meta.label).to.equal('#umbraDesktopMedia_openInNewWindow');
  expect(open?.conditions.find((each) => each.alias === IN_MANAGER)?.folder).to.equal(true);
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
  expect(byType('umbraDesktopContext').map((m) => m.alias)).to.deep.equal([
    'Umbraco.Community.UmbraDesktop.Media.Context',
    'Umbraco.Community.UmbraDesktop.Media.HealthContext',
  ]);
});

/**
 * Media Health (#141, design §3): one window in the Media group after the Image Editor, under the
 * Media section rule, its sizes derived from its own constants, and its check in a desktop context.
 */
it('registers Media Cleanup (Media Health in code) as one window in the Media group, after the Image Editor', () => {
  const health = app('Health');
  expect(!!health).to.equal(true);
  expect(health!.meta).to.deep.include({ label: '#umbraDesktopMedia_mediaHealth', group: 'media', allowMultiple: false });
  expect(area[health!.meta.label.slice('#umbraDesktopMedia_'.length)]).to.equal('Media Cleanup');
  expect(health!.meta.defaultSize).to.deep.equal(MEDIA_HEALTH_CONTENT_SIZE);
  expect(health!.meta.minSize).to.deep.equal(MEDIA_HEALTH_MIN_CONTENT_SIZE);
  expect(health!.meta.hideFromLauncher).to.equal(undefined);
  expect(health!.weight).to.be.lessThan(app('ImageEditor')!.weight!);
  expect(health!.conditions).to.deep.equal(MEDIA_SECTION);
});

/**
 * Media Cleanup's details pane (design §16.15): an app the launcher leaves out, which the window asks
 * the desktop to attach beside itself by its alias, sized by its own constants.
 */
it('registers Media Cleanup’s details pane as an app the launcher leaves out', () => {
  const details = app('Health.Details');
  expect(!!details).to.equal(true);
  expect(details!.alias).to.equal(UMBRADESKTOP_MEDIA_HEALTH_DETAILS_APP);
  expect(details!.meta).to.deep.include({ group: 'media', hideFromLauncher: true });
  expect(details!.meta.defaultSize).to.deep.equal(MEDIA_HEALTH_DETAILS_SIZE);
  expect(details!.meta.minSize).to.deep.equal(MEDIA_HEALTH_DETAILS_MIN_SIZE);
  expect(details!.conditions).to.deep.equal(MEDIA_SECTION);
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
