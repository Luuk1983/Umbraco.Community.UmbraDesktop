import { UMB_APP_LANGUAGE_CONTEXT } from '@umbraco-cms/backoffice/language';
import { UMB_MENU_STRUCTURE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/menu';
import { UMB_SUBMITTABLE_WORKSPACE_CONTEXT } from '@umbraco-cms/backoffice/workspace';
import { aliasesOf, watchProvidedContexts, watchUnprovidedContext } from '../frame-context.js';
import type {
  UmbraDesktopAppLanguage,
  UmbraDesktopStructureItem,
  UmbraDesktopVariantId,
} from './types.js';

/**
 * Watches a window's frame for where it is, so the path strip can say so.
 *
 * Everything here comes from Umbraco rather than from the URL. The backoffice computes the ancestry
 * itself, for its own footer breadcrumb, and publishes it through
 * `UMB_MENU_STRUCTURE_WORKSPACE_CONTEXT` ordered root first with the current item last. Reading
 * that is both less code and more correct than parsing
 * `/umbraco/section/media/workspace/media/edit/<guid>` and then fetching a name for the guid.
 *
 * **Mostly untested, deliberately.** Like `dirty-watcher.ts`, most of what this module does is
 * subscribe to a booting backoffice, which the unit runner cannot stand up; the half worth testing
 * is pure and lives in `crumbs.ts`. Its wiring is covered by the manual pass. The exception is the
 * bookkeeping around contexts going away, which is plain state handling over an event core
 * documents and which the strip got wrong — `path-watcher.test.ts` covers that and nothing else.
 */

/**
 * The menu-structure context's aliases.
 *
 * One pair for both flavours, which is not an assumption: `UMB_MENU_VARIANT_STRUCTURE_WORKSPACE_CONTEXT`
 * is registered under the same `UmbWorkspaceContext#UmbMenuStructure` pair and differs only by a
 * discriminator. So one watch reaches documents and media as well as document types and templates,
 * and the difference between them is handled below, where it actually shows up.
 */
const [STRUCTURE_CONTEXT_ALIAS, STRUCTURE_API_ALIAS] = aliasesOf(UMB_MENU_STRUCTURE_WORKSPACE_CONTEXT);

/** The workspace context's aliases, for the live name of the item the window is showing. */
const [WORKSPACE_CONTEXT_ALIAS, WORKSPACE_API_ALIAS] = aliasesOf(UMB_SUBMITTABLE_WORKSPACE_CONTEXT);

/**
 * The app language context's aliases.
 *
 * A global context rather than a workspace one, so it is provided once per frame and near the root —
 * but it is announced through the same `umb:context-provide` event as everything else, so the same
 * watch reaches it. Its two cultures are what name an ancestor that does not exist in the variant
 * being edited, and observing them is what makes the strip follow a language switch instead of
 * sitting on the names it resolved when the window opened.
 */
const [LANGUAGE_CONTEXT_ALIAS, LANGUAGE_API_ALIAS] = aliasesOf(UMB_APP_LANGUAGE_CONTEXT);

/** Only what this module needs of an Umbraco observable. */
interface Subscribable<T> {
  /** Subscribe to the value, and get something back that can drop the subscription. */
  subscribe(next: (value: T) => void): { unsubscribe: () => void };
}

/**
 * The menu-structure context, reduced to what the strip reads.
 *
 * `getItemHref` is optional because in v17 it genuinely is: only the *variant* contexts (documents,
 * media) declare it, while the plain `UmbMenuStructureWorkspaceContext` that document types, data
 * types and templates provide publishes `structure` alone. `crumbs.ts` fills that gap from core's
 * own path pattern, which is why this can simply report the absence rather than work around it.
 */
interface StructureContext {
  /** The ancestry, root first and current item last. */
  structure: Subscribable<ReadonlyArray<Record<string, unknown>>>;
  /** The link for one item, usually base-relative; absent on the non-variant contexts. */
  getItemHref?: (item: unknown) => string | undefined;
}

/**
 * A workspace that can name itself.
 *
 * Duck-typed rather than keyed to a class, because which class provides `name` has moved between
 * versions — `UmbNamableWorkspaceContext` declares it, several bases implement it — and the strip
 * only ever needs the observable.
 */
interface NamedWorkspace {
  /** The item's live name, which is what makes a rename show in the path before it is saved. */
  name: Subscribable<string | undefined>;
  /** Present on a workspace with variants; its first active variant is the one being edited. */
  splitView?: { activeVariantsInfo: Subscribable<ReadonlyArray<UmbraDesktopVariantId>> };
}

/**
 * The backoffice's app language context, reduced to the two cultures a crumb can fall back to.
 *
 * `appDefaultLanguage` is a whole language model in core; only its `unique`, which is the culture
 * code, reaches here.
 */
interface AppLanguageContext {
  /** The culture the backoffice is currently set to. */
  appLanguageCulture: Subscribable<string | undefined>;
  /** The site's default language; its `unique` is the culture code. */
  appDefaultLanguage: Subscribable<{ unique?: string } | undefined>;
}

/** What the frame currently is, as far as the path strip is concerned. */
export interface UmbraDesktopFramePath {
  /** The ancestry, root first and current item last, flattened out of core's models. */
  structure: UmbraDesktopStructureItem[];
  /** The live name of the item the window is showing, when there is one. */
  currentName?: string;
  /** The variant the workspace is showing, when it has variants. */
  activeVariant?: UmbraDesktopVariantId;
  /** The backoffice's current and default cultures, once the frame has reported them. */
  language?: UmbraDesktopAppLanguage;
}

/**
 * Whether an instance is the menu-structure context.
 * @param instance The context instance a provider answered with.
 * @returns True when it publishes a structure observable.
 */
function isStructureContext(instance: unknown): instance is StructureContext {
  return typeof (instance as Partial<StructureContext>)?.structure?.subscribe === 'function';
}

/**
 * Whether an instance is a workspace that can name itself.
 * @param instance The context instance a provider answered with.
 * @returns True when it publishes a name observable.
 */
function isNamedWorkspace(instance: unknown): instance is NamedWorkspace {
  return typeof (instance as Partial<NamedWorkspace>)?.name?.subscribe === 'function';
}

/**
 * Whether an instance is the app language context.
 * @param instance The context instance a provider answered with.
 * @returns True when it publishes the current culture.
 */
function isAppLanguageContext(instance: unknown): instance is AppLanguageContext {
  return typeof (instance as Partial<AppLanguageContext>)?.appLanguageCulture?.subscribe === 'function';
}

/**
 * Flatten one of core's structure items into this package's own shape.
 *
 * The href is asked of the *context* rather than read off the item, because that is where core
 * keeps it: `getItemHref` is a method on the structure context, and each section overrides it —
 * media's hand-writes the root's link to the section root, since the media menu has no root entity.
 * @param item One of core's structure items.
 * @param context The context that produced it.
 * @returns The flattened item.
 */
function flattenItem(
  item: Record<string, unknown>,
  context: StructureContext,
): UmbraDesktopStructureItem {
  const variants = Array.isArray(item.variants)
    ? (item.variants as Array<Record<string, unknown>>).map((variant) => ({
        culture: (variant.culture as string | null) ?? null,
        segment: (variant.segment as string | null) ?? null,
        name: (variant.name as string) ?? '',
      }))
    : undefined;
  return {
    unique: (item.unique as string | null) ?? null,
    entityType: (item.entityType as string) ?? '',
    // A variant item carries no top-level name in v17: it names itself per variant, and
    // `structureItemLabel` is what picks between them.
    name: (item.name as string) ?? '',
    href: context.getItemHref?.(item),
    variants,
  };
}

/**
 * One accepted context and everything subscribing to it took out.
 *
 * Held per context rather than as one flat list of subscriptions, because a context can go away on
 * its own — see {@link watchFramePath} — and what it was saying has to go with it and nothing else.
 */
interface TrackedContext {
  /** The instance being listened to; what a withdrawal is matched against. */
  instance: unknown;
  /** Drop every subscription accepting this instance took out. */
  release: () => void;
}

/** A menu-structure context and the ancestry it last published. */
interface TrackedStructure extends TrackedContext {
  /** The ancestry, root first and current item last. */
  items: UmbraDesktopStructureItem[];
}

/** A workspace context and what it last said about itself. */
interface TrackedWorkspace extends TrackedContext {
  /** The item's live name. */
  name?: string;
  /** The variant it is showing, when it has variants. */
  variant?: UmbraDesktopVariantId;
}

/**
 * Forget one context, whichever position it holds.
 *
 * Spliced rather than popped because a withdrawal is not always of the innermost one: a modal
 * workspace closing is, but a section's own workspace can go while something is still stacked on it.
 * @param stack The contexts of one kind, outermost first.
 * @param instance The instance whose provider has gone.
 * @returns True when the stack actually held it, so a caller can skip publishing otherwise.
 */
function dropTracked(stack: TrackedContext[], instance: unknown): boolean {
  const index = stack.findIndex((entry) => entry.instance === instance);
  if (index === -1) return false;
  stack[index].release();
  stack.splice(index, 1);
  return true;
}

/**
 * Watch a frame for the path it is at, reporting each time that path changes.
 *
 * Reports on change only, for the reason `dirty-watcher.ts` gives at greater length: a workspace
 * re-emits its name on every keystroke, and passing each one through would re-render the strip per
 * character. The comparison is over the whole reported answer, so a re-emission that would draw
 * identically costs nothing.
 *
 * **Contexts going away are reported too, and that is not tidiness.** Every crumb but the first
 * comes from a workspace, and a window routed to its own root — which is what clicking the home
 * crumb does — has no workspace at all. Nothing is provided there, so without listening for the
 * withdrawal there is no second event to correct the record and the strip keeps naming the document
 * the window has just left. That withdrawal is heard on each provider's own element and nowhere
 * else; {@link watchUnprovidedContext} is where the reason is written down, and it is the one thing
 * in this file most likely to be "simplified" back into a bug.
 *
 * **A stack of contexts rather than one, per kind.** The common case is one at a time, because
 * `router-slot` clears its old page before it appends the new one, so an ordinary navigation
 * withdraws before it provides. A modal workspace does not: it stacks a second one on top of the
 * window's own and takes it away again when it closes. The innermost is what the strip reports, and
 * a context underneath is left subscribed so that closing a modal restores the window's own name
 * rather than blanking it.
 * @param doc The frame's document.
 * @param onChange Called with the frame's new path each time it changes.
 * @returns A function that stops watching and drops every subscription.
 */
export function watchFramePath(
  doc: Document,
  onChange: (path: UmbraDesktopFramePath) => void,
): () => void {
  let structure: UmbraDesktopStructureItem[] = [];
  let currentName: string | undefined;
  let activeVariant: UmbraDesktopVariantId | undefined;
  const language: UmbraDesktopAppLanguage = {};
  let reported = '';
  let stopped = false;
  const structures: TrackedStructure[] = [];
  const workspaces: TrackedWorkspace[] = [];
  // The app language context is global to the frame and outlives every navigation inside it, so it
  // is never replaced and never withdrawn short of the frame itself going. A flat list is all its
  // subscriptions need.
  const languageSubscriptions: Array<{ unsubscribe: () => void }> = [];

  /** Push the frame's path out, but only when it would draw differently. */
  const publish = () => {
    if (stopped) return;
    const signature = JSON.stringify([structure, currentName, activeVariant, language]);
    if (signature === reported) return;
    reported = signature;
    // A copy, because `language` is mutated in place by its own subscriptions and a consumer that
    // held the object would see a later language switch as a silent change to a past report.
    onChange({ structure, currentName, activeVariant, language: { ...language } });
  };

  /**
   * Take the frame's path from the innermost context of each kind, and report it.
   *
   * Derived on every change rather than written to as contexts emit, so a context that is no longer
   * the innermost — one the window has stacked a modal on top of, or one emitting a last time on its
   * way out — updates its own record and changes nothing about what is shown.
   */
  const refresh = () => {
    structure = structures[structures.length - 1]?.items ?? [];
    const workspace = workspaces[workspaces.length - 1];
    currentName = workspace?.name;
    activeVariant = workspace?.variant;
    publish();
  };

  const stopStructure = watchProvidedContexts(
    doc,
    STRUCTURE_CONTEXT_ALIAS,
    STRUCTURE_API_ALIAS,
    (instance, provider) => {
      if (!isStructureContext(instance)) return false;
      // Stacked before subscribing, as `dirty-watcher.ts` registers its entry before subscribing and
      // for the same reason: an Umbraco observable emits its current value the moment it is
      // subscribed to, and that first emission has to find this entry already in place or it would
      // be written to an entry nothing reads.
      const entry: TrackedStructure = { instance, items: [], release: () => {} };
      structures.push(entry);
      const subscription = instance.structure.subscribe((items) => {
        entry.items = items.map((item) => flattenItem(item, instance));
        refresh();
      });
      const stopWithdrawal = watchUnprovidedContext(provider, instance, () => {
        if (dropTracked(structures, instance)) refresh();
      });
      entry.release = () => {
        subscription.unsubscribe();
        stopWithdrawal();
      };
      return true;
    },
  );

  const stopWorkspace = watchProvidedContexts(
    doc,
    WORKSPACE_CONTEXT_ALIAS,
    WORKSPACE_API_ALIAS,
    (instance, provider) => {
      if (!isNamedWorkspace(instance)) return false;
      const entry: TrackedWorkspace = { instance, release: () => {} };
      workspaces.push(entry);
      const subscriptions = [
        instance.name.subscribe((value) => {
          entry.name = value || undefined;
          refresh();
        }),
      ];
      // Only a workspace with variants has this, and only its first active variant matters: a split
      // view shows two, and the leading one is the one the path is written in.
      const splitView = instance.splitView;
      if (splitView) {
        subscriptions.push(
          splitView.activeVariantsInfo.subscribe((variants) => {
            entry.variant = variants[0];
            refresh();
          }),
        );
      }
      const stopWithdrawal = watchUnprovidedContext(provider, instance, () => {
        if (dropTracked(workspaces, instance)) refresh();
      });
      entry.release = () => {
        for (const subscription of subscriptions) subscription.unsubscribe();
        stopWithdrawal();
      };
      return true;
    },
  );

  const stopLanguage = watchProvidedContexts(
    doc,
    LANGUAGE_CONTEXT_ALIAS,
    LANGUAGE_API_ALIAS,
    (instance) => {
      if (!isAppLanguageContext(instance)) return false;
      languageSubscriptions.push(
        instance.appLanguageCulture.subscribe((value) => {
          language.current = value;
          publish();
        }),
        instance.appDefaultLanguage.subscribe((value) => {
          language.default = value?.unique;
          publish();
        }),
      );
      return true;
    },
  );

  return () => {
    stopped = true;
    stopStructure();
    stopWorkspace();
    stopLanguage();
    for (const entry of [...structures, ...workspaces]) entry.release();
    structures.length = 0;
    workspaces.length = 0;
    for (const subscription of languageSubscriptions) subscription.unsubscribe();
    languageSubscriptions.length = 0;
  };
}
