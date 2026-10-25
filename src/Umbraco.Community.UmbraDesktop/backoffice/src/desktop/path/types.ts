/**
 * The shapes the path strip works in.
 *
 * Deliberately this package's own rather than core's. `UmbStructureItemModel` and its variant
 * cousin arrive from inside the frame carrying observables and entity contexts, none of which the
 * strip needs and none of which survive being reasoned about outside the realm they were made in.
 * The watcher flattens them to these on the way out, which is what keeps `crumbs.ts` pure and
 * testable without a booting backoffice behind it.
 */

/** One variant of a structure item, reduced to what naming a crumb needs. */
export interface UmbraDesktopStructureVariant {
  /** Culture code, or null for an invariant item. */
  culture: string | null;
  /** Segment, or null. */
  segment: string | null;
  /** The item's name in this variant. */
  name: string;
}

/** Which variant a workspace is showing, for picking a variant item's name. */
export interface UmbraDesktopVariantId {
  /** Culture code, or null. */
  culture: string | null;
  /** Segment, or null. */
  segment: string | null;
}

/**
 * One ancestor from core's menu structure, flattened.
 *
 * `unique` is falsy — null in practice, since `UmbEntityUnique` is `string | null` — for core's own
 * synthetic root item, which is how that item is recognised and dropped: the strip's first crumb is
 * already the window's root. That is core's own marker for it, not a guess: `media-menu-structure`
 * branches on exactly `if (!structureItem.unique)` to hand that item the section root as its href.
 *
 * `href` is present only when the structure context computes one. On 18 the tree-based contexts do,
 * except for a folder, and the language structure context never does (on 17 only documents and media
 * did). `crumbs.ts` builds the missing links from core's own path pattern rather than leaving those
 * crumbs unclickable.
 */
export interface UmbraDesktopStructureItem {
  /** The entity's unique id; null or empty for core's synthetic root item. */
  unique: string | null;
  /** The entity type, e.g. `media`. */
  entityType: string;
  /** The item's name, for an invariant item; empty for a variant one, which names itself per variant. */
  name: string;
  /** The href the structure context computed, usually base-relative; absent when it computes none. */
  href?: string;
  /** Per-variant names, present only for the entity types that vary (documents, media). */
  variants?: UmbraDesktopStructureVariant[];
}

/**
 * The backoffice's own language state, which is what a crumb falls back to when the item it names
 * does not exist in the variant being edited.
 *
 * Two cultures and not one, because core distinguishes them: `current` is the language the editor
 * has selected in the backoffice and `default` is the site's, and a name borrowed from either is
 * shown in brackets to say it is borrowed. Both are optional, since a frame reports them only once
 * the app language context has answered.
 */
export interface UmbraDesktopAppLanguage {
  /** The culture the backoffice is currently set to. */
  current?: string;
  /** The site's default culture. */
  default?: string;
}

/** One rendered crumb. */
export interface UmbraDesktopPathCrumb {
  /**
   * What the crumb reads.
   *
   * Carried even for the home crumb, which draws an icon instead: it is that crumb's tooltip and its
   * accessible name, so the app is still named for anyone hovering it or reading the strip aloud.
   */
  label: string;
  /** Where it goes; undefined for the current item, which is not a link. */
  href?: string;
  /** Whether this is the item the window is showing. */
  current: boolean;
  /**
   * Whether this is the window's own root, drawn as a house rather than as text.
   *
   * The strip sits directly under the titlebar, and the titlebar already says the app's name, so
   * spelling it out again made the first two lines of every window a repetition. A house is also
   * what the rest of the world puts at the head of a path.
   */
  home?: boolean;
}

/** The workspace view a document window shows, as the path strip names it (issue #131). */
export interface UmbraDesktopPathView {
  /** The view's tab label, a `#key` or a literal. */
  label: string;
  /** The view's tab icon. */
  icon?: string;
  /** Whether it can open beside the editor, which puts the side-panel button on it. */
  beside: boolean;
  /**
   * Whether it is open beside the window already, which shows the button as pressed: pressing it
   * then closes it, as Preview's does.
   */
  open?: boolean;
}
