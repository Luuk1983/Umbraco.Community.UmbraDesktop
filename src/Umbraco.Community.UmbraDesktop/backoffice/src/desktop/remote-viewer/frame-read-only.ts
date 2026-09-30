import type { UmbExtensionRegistry } from '@umbraco-cms/backoffice/extension-api';
import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';

/**
 * Making everything inside a remote viewer frame read-only in the interface, whatever the remote
 * user may do and whatever any package does to work out permissions.
 *
 * The first version rewrote the verb lists in permission responses. That only works for an
 * implementation whose verbs arrive in a shape we know, and Advanced Permissions showed why that is
 * not enough: it replaces Umbraco's permission condition outright and keeps its own verbs inside it,
 * so there is no shared list to rewrite. What every implementation does share is the extension
 * registry, which decides what appears at all, and the workspace's read-only guard, which decides
 * whether what appears can be edited. This module acts at those two points only:
 *
 * - Every action-like extension, and every section except Content and Media, gets one more
 *   condition, which always says no. Umbraco shows an extension only when all of its conditions say
 *   yes, so ours wins over any permission logic without knowing what that logic is.
 * - Every workspace that has a read-only guard gets a permanent rule, the same mechanism Umbraco uses
 *   to lock a document in the recycle bin. That covers the editors themselves, which are not
 *   extensions with conditions but read the guard.
 *
 * This is the interface, not the protection. The protection is that the proxy only performs GET and
 * the shim answers anything else with 405, so an extension this module misses can still offer an
 * action but can never carry it out.
 */

/** The name the viewer gives its frame. A window keeps its name across navigations, so it is there before any script runs. */
export const REMOTE_VIEWER_FRAME_NAME = 'umbradesktop-remote-viewer';

/** The condition that always says no. */
export const REMOTE_READ_ONLY_CONDITION_ALIAS = 'UmbraDesktop.Condition.RemoteReadOnly';

/** The workspace context that locks every workspace it is created in. */
const REMOTE_READ_ONLY_WORKSPACE_CONTEXT_ALIAS = 'UmbraDesktop.WorkspaceContext.RemoteReadOnly';

/**
 * Extension types that do something to the remote rather than show it. Hidden by type rather than
 * by what their permission condition asks for, because a package's own action need not ask anything
 * and would otherwise slip through.
 */
const ACTION_TYPES: ReadonlyArray<string> = [
  'workspaceAction',
  'workspaceActionMenuItem',
  'entityAction',
  'entityBulkAction',
  'entityCreateOptionAction',
  'collectionAction',
  'propertyAction',
  'blockAction',
  'treeAction',
];

/** Action kinds that only read, and so stay: refreshing a tree and copying to the local clipboard. */
const READING_KINDS: ReadonlyArray<string> = ['reloadTreeItemChildren', 'copyToClipboard'];

/**
 * Individual actions that only read. Opening a block is how its content is looked at, and the block
 * workspace it opens is locked by the guard like every other workspace.
 */
const READING_ALIASES: ReadonlyArray<string> = [
  'Umb.BlockAction.EditContent',
  'Umb.BlockAction.EditSettings',
  'Umb.BlockAction.CopyToClipboard',
];

/** The sections a content viewer is for. Every other section is hidden. */
const VISIBLE_SECTIONS: ReadonlyArray<string> = ['Umb.Section.Content', 'Umb.Section.Media'];

/** The parts of a manifest the decision reads. */
export interface ManifestLike {
  /** The extension type, like `entityAction`. */
  type: string;
  /** The extension alias. */
  alias: string;
  /** The kind, when the manifest uses one. */
  kind?: string;
}

/**
 * Whether this window is a remote viewer frame.
 * @param win The window to ask, or anything with a name.
 * @param win.name The window name.
 * @returns True when it is the frame the viewer made.
 */
export function isRemoteViewerFrame(win: { name: string }): boolean {
  return win.name === REMOTE_VIEWER_FRAME_NAME;
}

/**
 * Whether the frame should hide an extension.
 * @param manifest The extension's manifest.
 * @returns True for anything that acts on the remote, and for sections a content viewer does not show.
 */
export function shouldHide(manifest: ManifestLike): boolean {
  if (manifest.type === 'section') return VISIBLE_SECTIONS.includes(manifest.alias) === false;
  if (ACTION_TYPES.includes(manifest.type) === false) return false;
  if (manifest.kind && READING_KINDS.includes(manifest.kind)) return false;
  return READING_ALIASES.includes(manifest.alias) === false;
}

/**
 * The condition that is never met. Appended to what the frame hides, it outvotes every other
 * condition on the extension, including ones a package supplies in place of Umbraco's.
 */
export class UmbraDesktopRemoteReadOnlyCondition extends UmbConditionBase<{ alias: string }> implements UmbExtensionCondition {
  /**
   * @param host The controller host.
   * @param args The condition's arguments.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<{ alias: string }>) {
    super(host, args);
    this.permitted = false;
  }
}

/** The unique of the rule this module keeps on every guard. */
const GUARD_RULE_UNIQUE = 'UMBRADESKTOP_REMOTE_READ_ONLY';

/** The part of a workspace context the guard rule needs. Every content workspace has it; others may not. */
interface GuardedWorkspace {
  /** The workspace's read-only guard. */
  readOnlyGuard?: {
    /** Every rule on the guard, now and whenever they change. */
    rules: { subscribe(next: (rules: ReadonlyArray<{ unique: unknown }>) => void): { unsubscribe(): void } };
    /** Adds a rule, replacing one with the same unique. */
    addRule(rule: { unique: string; message?: string; permitted: boolean }): unknown;
  };
}

/**
 * Created by Umbraco inside every workspace, because its manifest has no conditions. Keeps a
 * read-only rule on the workspace's guard. The rule's `permitted: true` reads backwards and is meant
 * to: the guard asks whether the workspace is permitted to be read-only, as Umbraco's own rule for a
 * trashed document does.
 *
 * "Keeps", not "adds": a content workspace clears every guard rule each time it loads a document
 * (`resetState()` in content-detail-workspace-base.ts calls `readOnlyGuard.clearRules()`), and this
 * context exists before the first load. Adding the rule once meant it was gone before anyone saw
 * the document, so it watches the guard and puts the rule back whenever it is missing. Umbraco's own
 * permission rule survives a load the same way, by being added again afterwards.
 */
export class UmbraDesktopRemoteReadOnlyWorkspaceContext {
  /** The watch on the guard's rules, ended with the workspace. */
  #subscription?: { unsubscribe(): void };

  /**
   * @param _host The workspace, which Umbraco passes as the host.
   * @param workspace The workspace context, passed again as the first argument.
   */
  constructor(_host: UmbControllerHost, workspace: GuardedWorkspace) {
    const guard = workspace?.readOnlyGuard;
    if (!guard) return;
    this.#subscription = guard.rules.subscribe((rules) => {
      if (rules.some((rule) => rule.unique === GUARD_RULE_UNIQUE)) return;
      guard.addRule({
        unique: GUARD_RULE_UNIQUE,
        message: 'This is another Umbraco instance, shown read-only.',
        permitted: true,
      });
    });
  }

  /** Stops watching the guard. */
  destroy() {
    this.#subscription?.unsubscribe();
    this.#subscription = undefined;
  }
}

/** A manifest's conditions, as far as this module reads them. */
interface HasConditions {
  /** The conditions on the manifest, if it has any. */
  conditions?: ReadonlyArray<{ alias: string }>;
}

/**
 * Whether a manifest already carries the never-met condition.
 * @param manifest The manifest to look at.
 * @returns True when our condition is among its conditions.
 */
function carriesOurCondition(manifest: HasConditions): boolean {
  return manifest.conditions?.some((condition) => condition.alias === REMOTE_READ_ONLY_CONDITION_ALIAS) ?? false;
}

/**
 * Register the condition and the workspace context, and add the condition to everything the frame
 * hides, including extensions registered later.
 *
 * It watches the registry rather than walking it once, because packages register when their own
 * bundles load, and a package that replaces an extension (unregister, then register the same alias)
 * must not shake the condition off. Umbraco does remember an appended condition by alias, but only
 * until it has applied it once (`#appendAdditionalConditions` deletes the entry), so a replacement
 * arrives without it. Hence the check is on the manifest in front of us, "does it carry our
 * condition", rather than on a list of aliases already handled. Appending re-emits the registry,
 * and that second pass finds the condition present and stops.
 * @param registry The frame's extension registry.
 * @returns A function that stops watching.
 */
export function enforceReadOnlyInterface(registry: UmbExtensionRegistry<any>): () => void {
  registry.register({
    type: 'condition',
    alias: REMOTE_READ_ONLY_CONDITION_ALIAS,
    name: 'UmbraDesktop Remote Read Only Condition',
    api: UmbraDesktopRemoteReadOnlyCondition,
  });
  registry.register({
    type: 'workspaceContext',
    alias: REMOTE_READ_ONLY_WORKSPACE_CONTEXT_ALIAS,
    name: 'UmbraDesktop Remote Read Only Workspace Context',
    api: UmbraDesktopRemoteReadOnlyWorkspaceContext,
  });

  // Appending makes the registry emit again, synchronously, while this pass is still looping. A
  // nested pass would work from a list the outer one has not finished with and append twice, and
  // with a real backoffice's few hundred actions that churn hung the frame. So a nested emission is
  // ignored, and each append first re-reads the manifest as the registry holds it now.
  let busy = false;
  const subscription = registry.extensions.subscribe((manifests: ReadonlyArray<ManifestLike & HasConditions>) => {
    if (busy) return;
    busy = true;
    try {
      const aliases = manifests.filter((manifest) => shouldHide(manifest)).map((manifest) => manifest.alias);
      for (const alias of aliases) {
        const current = registry.getByAlias(alias) as (ManifestLike & HasConditions) | undefined;
        if (current && carriesOurCondition(current) === false) {
          registry.appendCondition(alias, { alias: REMOTE_READ_ONLY_CONDITION_ALIAS });
        }
      }
    } finally {
      busy = false;
    }
  });
  return () => subscription.unsubscribe();
}
