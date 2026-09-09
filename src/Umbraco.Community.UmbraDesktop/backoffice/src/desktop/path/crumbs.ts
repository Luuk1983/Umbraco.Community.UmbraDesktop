import { UMB_WORKSPACE_EDIT_PATH_PATTERN } from '@umbraco-cms/backoffice/workspace';
import type { UmbraDesktopApp } from '../types.js';
import type {
  UmbraDesktopAppLanguage,
  UmbraDesktopPathCrumb,
  UmbraDesktopStructureItem,
  UmbraDesktopVariantId,
} from './types.js';

/**
 * Whether a window draws a path strip.
 *
 * Keyed on the chrome profile rather than on a new catalogue field, because `full-section` already
 * means "this window keeps the section's tree", and a tree is the only thing there is to get lost
 * in. A `workspace-only` window is one workspace and a `bare` one is a single dashboard: neither
 * has ancestors to show, so a strip there would be a permanent empty bar.
 *
 * The body kind is checked too, and it is not redundant. An element app's `chromeProfile` is
 * meaningless — `derive-apps.ts` sets it to `bare` because the field is required, not because
 * anything reads it — so a check on the profile alone would one day put a strip on a game whose
 * manifest happened to say `full-section`.
 *
 * Read by three callers that must agree, which is why it is a function and not three conditions:
 * the window element's render, the window element's resize floor and the window manager's opening
 * size. The last two spend `metrics.pathbarHeight` only for the windows this returns true for.
 * @param app The app the window hosts.
 * @returns True when this window draws a strip.
 */
export function windowShowsPath(app: UmbraDesktopApp): boolean {
  return app.content.kind === 'iframe' && app.chromeProfile === 'full-section';
}

/**
 * The name to show for one structure item.
 *
 * Documents and media carry a name per variant, and an ancestor need not exist in every culture, so
 * naming a crumb is a chain of fallbacks rather than a lookup. **This is core's chain, step for
 * step, brackets included** — `workspace-variant-menu-breadcrumb.element`'s `#getItemVariantName`:
 *
 * 1. the variant the workspace is editing;
 * 2. the app's current culture, in brackets, because that name is borrowed from another language;
 * 3. the app's default culture, also in brackets;
 * 4. the invariant name, unbracketed, since an invariant name is nobody's borrowing;
 * 5. the first variant there is, as a last resort.
 *
 * Copied rather than simplified because Umbraco's own breadcrumb sits inside the same window until
 * the injector hides it, and an editor already reads brackets as "this name comes from another
 * language". A shorter chain of ours would disagree with core in exactly the multilingual sites
 * where the difference is confusing. The one deliberate difference: an *invariant workspace* shows a
 * borrowed name without brackets, because with one name to show there is no distinction to draw —
 * which is core's rule too.
 * @param item The structure item.
 * @param active The variant the workspace is editing; undefined for an invariant workspace.
 * @param language The backoffice's current and default cultures, once the frame has reported them.
 * @returns The item's name.
 */
export function structureItemLabel(
  item: UmbraDesktopStructureItem,
  active: UmbraDesktopVariantId | undefined,
  language?: UmbraDesktopAppLanguage,
): string {
  const variants = item.variants;
  if (!variants?.length) return item.name;

  // A workspace editing a specific variant gets that variant's own name when the item has one.
  if (active?.culture) {
    const own = variants.find(
      (variant) => variant.culture === active.culture && variant.segment === active.segment,
    );
    if (own) return own.name;
  }

  /** Brackets say the name was borrowed from another language — except on an invariant workspace. */
  const borrowed = (name: string) => (active?.culture ? `(${name})` : name);

  const current = variants.find((variant) => variant.culture === language?.current && variant.segment === null);
  if (current) return borrowed(current.name);

  const fallback = variants.find((variant) => variant.culture === language?.default && variant.segment === null);
  if (fallback) return borrowed(fallback.name);

  const invariant = variants.find((variant) => variant.culture === null && variant.segment === null);
  if (invariant) return invariant.name;

  return variants[0].name;
}

/**
 * The section a window lives in, taken from the URL it opened at.
 *
 * Needed because half the structure contexts do not hand out links. In v17 only the *variant* ones
 * — documents and media — carry `getItemHref`; the plain `UmbMenuStructureWorkspaceContext` that
 * document types, data types and templates provide publishes `structure` and nothing else. Rather
 * than leave those crumbs unclickable, {@link crumbHref} builds the link from core's own
 * `UMB_WORKSPACE_EDIT_PATH_PATTERN`, and the pattern needs a section name.
 *
 * Read off the window's own launch URL rather than asked of the frame's section context, because
 * the window already knows: it was opened at `/umbraco/section/<name>/…` and cannot navigate out of
 * its own section without ceasing to be the window it is.
 * @param app The app the window hosts.
 * @returns The section's pathname, or undefined for a URL that names none.
 */
export function sectionPathnameOf(app: UmbraDesktopApp): string | undefined {
  if (app.content.kind !== 'iframe') return undefined;
  return /\/section\/([^/?#]+)/.exec(app.content.url)?.[1];
}

/**
 * The link for one crumb.
 *
 * Core's own href wins when there is one, because a section that computes its links has reasons the
 * shell cannot see — media's root item is hand-written to the section root precisely because the
 * media menu has no root entity to link to. The pattern is only the fallback, and it is core's
 * pattern rather than a template string here so that a change to the backoffice's route shape
 * arrives with the package instead of being something to notice.
 * @param item The structure item.
 * @param sectionName The section the window lives in.
 * @returns The href, or undefined when neither source can produce one.
 */
export function crumbHref(
  item: UmbraDesktopStructureItem,
  sectionName: string | undefined,
): string | undefined {
  if (item.href) return item.href;
  if (!sectionName || !item.unique) return undefined;
  return UMB_WORKSPACE_EDIT_PATH_PATTERN.generateAbsolute({
    sectionName,
    entityType: item.entityType,
    unique: item.unique,
  });
}

/**
 * Turn the frame's reported ancestry into the crumbs the strip renders.
 *
 * The first crumb is always the window itself: the app's own name, pointing at the URL the window
 * opened at. That is what lets one rule cover both a section window, whose launch URL is a section
 * root, and a Document Types window, whose launch URL is a tree root inside Settings. A crumb that
 * meant "the section root" would send the second one to a Settings dashboard nobody asked for,
 * which is the reason this feature is not a Home button (issue #43).
 *
 * Core's own root item is dropped, since the first crumb already is it and two identical crumbs
 * would be silly. It is recognised by an empty `unique` — see {@link UmbraDesktopStructureItem}.
 *
 * The last crumb is the item the window is showing. It gets no href, because a link to where you
 * already are is a dead control, and it prefers `currentName` — the workspace's live name — over
 * the structure's copy, so a rename shows in the path before it has been saved.
 * @param app The app the window hosts.
 * @param structure The frame's ancestry, root first and current item last; empty when the frame's
 * route provides no menu structure at all, which is every dashboard and a section root.
 * @param currentName The workspace's live name, when a workspace is open.
 * @param active The variant the workspace is showing, when it has one.
 * @param language The backoffice's current and default cultures, for naming an ancestor that does
 * not exist in the variant being edited. See {@link structureItemLabel}.
 * @returns The crumbs, left to right.
 */
export function buildCrumbs(
  app: UmbraDesktopApp,
  structure: ReadonlyArray<UmbraDesktopStructureItem>,
  currentName: string | undefined,
  active?: UmbraDesktopVariantId,
  language?: UmbraDesktopAppLanguage,
): UmbraDesktopPathCrumb[] {
  const home: UmbraDesktopPathCrumb = {
    label: app.name,
    href: app.content.kind === 'iframe' ? app.content.url : undefined,
    current: false,
    home: true,
  };

  // Falsy rather than `=== ''`: `UmbEntityUnique` is `string | null`, and core's own test for its
  // synthetic root item is `!structureItem.unique`.
  const items = structure.filter((item) => !!item.unique);
  if (items.length === 0) return [home];

  const sectionName = sectionPathnameOf(app);
  const crumbs = items.map<UmbraDesktopPathCrumb>((item) => ({
    label: structureItemLabel(item, active, language),
    href: crumbHref(item, sectionName),
    current: false,
  }));

  const last = crumbs[crumbs.length - 1];
  crumbs[crumbs.length - 1] = {
    label: currentName ?? last.label,
    href: undefined,
    current: true,
  };

  return [home, ...crumbs];
}
