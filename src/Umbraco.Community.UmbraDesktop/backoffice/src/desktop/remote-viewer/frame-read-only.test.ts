import { expect } from '@open-wc/testing';
import { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbReadOnlyVariantGuardManager } from '@umbraco-cms/backoffice/utils';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';

/** Minimal controller host for the guard under test. */
class GuardTestHost extends UmbLitElement {}
customElements.define('umbradesktop-guard-test-host', GuardTestHost);
import {
  REMOTE_READ_ONLY_CONDITION_ALIAS,
  REMOTE_VIEWER_FRAME_NAME,
  UmbraDesktopRemoteReadOnlyWorkspaceContext,
  enforceReadOnlyInterface,
  isRemoteViewerFrame,
  shouldHide,
} from './frame-read-only';

/** The conditions the registry now holds for one alias, read back through the public API. */
function conditionsOf(registry: UmbExtensionRegistry<any>, alias: string): string[] {
  const manifest = registry.getByAlias(alias) as { conditions?: Array<{ alias: string }> } | undefined;
  return (manifest?.conditions ?? []).map((condition) => condition.alias);
}

describe('remote viewer: telling the frame apart', () => {
  it('recognises the frame by its name, which survives the navigation that loses everything else', () => {
    expect(isRemoteViewerFrame({ name: REMOTE_VIEWER_FRAME_NAME })).to.equal(true);
  });

  it('leaves every other window alone, the desktop and ordinary app windows included', () => {
    expect(isRemoteViewerFrame({ name: '' })).to.equal(false);
    expect(isRemoteViewerFrame({ name: 'something-else' })).to.equal(false);
  });
});

describe('remote viewer: which extensions the frame hides', () => {
  const hidden = [
    { type: 'workspaceAction', alias: 'Umb.WorkspaceAction.Document.Save' },
    { type: 'workspaceAction', alias: 'SomePackage.WorkspaceAction.Approve' },
    { type: 'workspaceActionMenuItem', alias: 'Umb.Document.SaveAndSchedule' },
    { type: 'entityAction', kind: 'delete', alias: 'Umb.EntityAction.Document.Delete' },
    { type: 'entityAction', kind: 'default', alias: 'SomePackage.EntityAction.Custom' },
    { type: 'entityBulkAction', alias: 'Umb.EntityBulkAction.Document.Publish' },
    { type: 'entityCreateOptionAction', alias: 'Umb.EntityCreateOptionAction.Document.Default' },
    { type: 'collectionAction', alias: 'Umb.CollectionAction.Document.Create' },
    { type: 'propertyAction', kind: 'clear', alias: 'Umb.PropertyAction.BlockList.Clear' },
    { type: 'propertyAction', kind: 'pasteFromClipboard', alias: 'Umb.PropertyAction.BlockList.Clipboard.Paste' },
    { type: 'blockAction', alias: 'Umb.BlockAction.Delete' },
    { type: 'treeAction', alias: 'Umb.TreeAction.Something' },
    { type: 'section', alias: 'Umb.Section.Settings' },
    { type: 'section', alias: 'SomePackage.Section.Custom' },
  ];
  for (const manifest of hidden) {
    it(`hides ${manifest.alias}`, () => {
      expect(shouldHide(manifest)).to.equal(true);
    });
  }

  const kept = [
    // Reading: refreshing a tree and copying to the local clipboard change nothing on the remote.
    { type: 'entityAction', kind: 'reloadTreeItemChildren', alias: 'Umb.EntityAction.Document.Tree.ReloadChildrenOf' },
    { type: 'propertyAction', kind: 'copyToClipboard', alias: 'Umb.PropertyAction.BlockList.Clipboard.Copy' },
    // Opening a block is how its content is read. The block workspace is read-only by the guard.
    { type: 'blockAction', alias: 'Umb.BlockAction.EditContent' },
    { type: 'blockAction', alias: 'Umb.BlockAction.EditSettings' },
    // The two sections a content viewer is for.
    { type: 'section', alias: 'Umb.Section.Content' },
    { type: 'section', alias: 'Umb.Section.Media' },
    // Not actions at all.
    { type: 'propertyEditorUi', alias: 'Umb.PropertyEditorUi.TextBox' },
    { type: 'workspace', alias: 'Umb.Workspace.Document' },
    { type: 'condition', alias: 'Umb.Condition.UserPermission.Document' },
  ];
  for (const manifest of kept) {
    it(`keeps ${manifest.alias}`, () => {
      expect(shouldHide(manifest)).to.equal(false);
    });
  }
});

describe('remote viewer: enforcing it on the registry', () => {
  let registry: UmbExtensionRegistry<any>;
  let stop: () => void;

  beforeEach(() => {
    registry = new UmbExtensionRegistry();
  });

  afterEach(() => stop?.());

  it('adds its condition to an action already registered, next to the conditions it had', () => {
    registry.register({
      type: 'workspaceAction',
      alias: 'Umb.WorkspaceAction.Document.Save',
      name: 'Save',
      conditions: [{ alias: 'Umb.Condition.UserPermission.Document', allOf: ['Umb.Document.Update'] }],
    });
    stop = enforceReadOnlyInterface(registry);
    expect(conditionsOf(registry, 'Umb.WorkspaceAction.Document.Save')).to.deep.equal([
      'Umb.Condition.UserPermission.Document',
      REMOTE_READ_ONLY_CONDITION_ALIAS,
    ]);
  });

  it('adds it to an action registered afterwards, which is how a package that loads late is caught', () => {
    stop = enforceReadOnlyInterface(registry);
    registry.register({ type: 'entityAction', kind: 'default', alias: 'Late.EntityAction.Custom', name: 'Custom' });
    expect(conditionsOf(registry, 'Late.EntityAction.Custom')).to.deep.equal([REMOTE_READ_ONLY_CONDITION_ALIAS]);
  });

  it('keeps it when a package replaces an extension under the same alias', () => {
    // Advanced Permissions does exactly this to Umbraco's own permission condition. The same trick
    // on an action must not shake our condition off.
    registry.register({ type: 'workspaceAction', alias: 'Umb.WorkspaceAction.Document.Save', name: 'Save' });
    stop = enforceReadOnlyInterface(registry);
    registry.unregister('Umb.WorkspaceAction.Document.Save');
    registry.register({ type: 'workspaceAction', alias: 'Umb.WorkspaceAction.Document.Save', name: 'Replaced save' });
    expect(conditionsOf(registry, 'Umb.WorkspaceAction.Document.Save')).to.deep.equal([REMOTE_READ_ONLY_CONDITION_ALIAS]);
  });

  it('adds it only once, however often the registry changes', () => {
    registry.register({ type: 'workspaceAction', alias: 'Umb.WorkspaceAction.Document.Save', name: 'Save' });
    stop = enforceReadOnlyInterface(registry);
    registry.register({ type: 'propertyEditorUi', alias: 'Other.Thing', name: 'Other', meta: {} });
    registry.register({ type: 'entityAction', kind: 'default', alias: 'Another.Action', name: 'Another' });
    expect(conditionsOf(registry, 'Umb.WorkspaceAction.Document.Save')).to.deep.equal([REMOTE_READ_ONLY_CONDITION_ALIAS]);
  });

  it('gives each of many actions the condition exactly once, and does not re-enter itself', () => {
    // A real backoffice has about 250 action manifests. Appending makes the registry emit again,
    // synchronously, while the first pass is still looping; handled naively that doubles conditions
    // and re-emits for every one, which hung a real frame.
    for (let i = 0; i < 300; i++) {
      registry.register({ type: 'entityAction', kind: 'default', alias: `Many.${i}`, name: `Many ${i}` });
    }
    let emissions = 0;
    const counting = registry.extensions.subscribe(() => emissions++);
    stop = enforceReadOnlyInterface(registry);
    counting.unsubscribe();
    const counts = Array.from({ length: 300 }, (_, i) => conditionsOf(registry, `Many.${i}`).length);
    expect(counts.every((count) => count === 1)).to.equal(true);
    // Two registrations of our own, and then at most one emission per action.
    expect(emissions).to.be.at.most(300 + 3);
  });

  it('leaves what it does not hide untouched', () => {
    registry.register({ type: 'entityAction', kind: 'reloadTreeItemChildren', alias: 'Reload', name: 'Reload' });
    stop = enforceReadOnlyInterface(registry);
    expect(conditionsOf(registry, 'Reload')).to.deep.equal([]);
  });

  it('registers the condition and the workspace context it relies on', () => {
    stop = enforceReadOnlyInterface(registry);
    expect(registry.getByAlias(REMOTE_READ_ONLY_CONDITION_ALIAS)?.type).to.equal('condition');
    expect(registry.getByTypeAndFilter('workspaceContext', () => true).length).to.equal(1);
  });
});

describe('remote viewer: the workspace guard', () => {
  let host: GuardTestHost;
  let guard: UmbReadOnlyVariantGuardManager;
  let context: UmbraDesktopRemoteReadOnlyWorkspaceContext | undefined;

  beforeEach(() => {
    host = document.createElement('umbradesktop-guard-test-host') as GuardTestHost;
    document.body.append(host);
    guard = new UmbReadOnlyVariantGuardManager(host);
  });

  afterEach(() => {
    context?.destroy();
    host.remove();
  });

  it('makes the workspace read-only', () => {
    context = new UmbraDesktopRemoteReadOnlyWorkspaceContext(host, { readOnlyGuard: guard });
    expect(guard.getPermitted()).to.equal(true);
  });

  it('stays read-only after the workspace loads a document, which clears every rule', () => {
    // content-detail-workspace-base.ts resetState() calls readOnlyGuard.clearRules() on every load,
    // which wiped the first version's rule before anyone saw the document.
    context = new UmbraDesktopRemoteReadOnlyWorkspaceContext(host, { readOnlyGuard: guard });
    guard.clearRules();
    expect(guard.getPermitted()).to.equal(true);
  });

  it('leaves other rules in place beside its own', () => {
    context = new UmbraDesktopRemoteReadOnlyWorkspaceContext(host, { readOnlyGuard: guard });
    guard.addRule({ unique: 'someone-else', permitted: true });
    expect(guard.getRules().map((rule) => rule.unique).sort()).to.deep.equal(['UMBRADESKTOP_REMOTE_READ_ONLY', 'someone-else']);
  });

  it('stops putting its rule back once destroyed', () => {
    context = new UmbraDesktopRemoteReadOnlyWorkspaceContext(host, { readOnlyGuard: guard });
    context.destroy();
    guard.clearRules();
    expect(guard.getRules().length).to.equal(0);
  });

  it('does nothing to a workspace without a guard, rather than failing it', () => {
    expect(() => (context = new UmbraDesktopRemoteReadOnlyWorkspaceContext(host, {}))).not.to.throw();
  });
});
