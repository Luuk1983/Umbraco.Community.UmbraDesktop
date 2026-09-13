/**
 * One of the backoffice's own themes, reduced to what a picker row needs.
 *
 * Deliberately not `ManifestTheme`: a manifest also carries the stylesheet, the kind and whatever
 * else an extension author put on it, none of which a row can use, and all of which would make the
 * picker's contract change whenever core's manifest shape does.
 */
export interface UmbraDesktopBackofficeTheme {
  /** The alias core stores and sets the theme by. */
  alias: string;
  /** What the manifest calls this theme, shown as-is. */
  name: string;
}

/**
 * The part of a theme manifest this module reads.
 *
 * Structural rather than imported, so the pure function below can be tested with three object
 * literals instead of a booted extension registry.
 */
export interface UmbraDesktopBackofficeThemeManifest {
  /** The theme's alias. */
  alias: string;
  /** The theme's display name. */
  name: string;
  /** Where the manifest asks to sit in the list. Optional, as it is on every manifest. */
  weight?: number;
}

/**
 * Turn the registry's theme manifests into the list a picker shows.
 *
 * **Sorted, because the registry's observable is not.** `umbExtensionsRegistry.byType()` filters and
 * merges kinds and stops there — only the synchronous `getByType()` sorts — so the order a consumer
 * sees is registration order. Core's three come out right by accident, being registered heaviest
 * first, but a package registering its own theme before core's would push it above Light for no
 * reason a user could see. Weight is how a manifest says where it belongs, so that is what this
 * reads, heaviest first, the same comparison core's own sort uses.
 *
 * `Array.prototype.sort` is stable, so themes of equal weight — including the two that both left it
 * off — keep the order they were registered in.
 * @param manifests The `theme` manifests currently registered.
 * @returns The themes to offer, in the order to offer them.
 */
export function backofficeThemes(
  manifests: ReadonlyArray<UmbraDesktopBackofficeThemeManifest>,
): UmbraDesktopBackofficeTheme[] {
  return [...manifests]
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map((manifest) => ({ alias: manifest.alias, name: manifest.name }));
}

/**
 * The name of the theme in force, for the row that has to say which one that is.
 *
 * `undefined` for an alias nothing registers, which is a real state rather than a defensive one:
 * `localStorage` outlives the extension that wrote it, so a site that drops a theme package still
 * has its alias stored. Core has already fallen back to no stylesheet at all by then, and a row
 * showing no name is the honest report of that — naming a theme that is not applied would not be.
 * @param themes The themes on offer.
 * @param alias The alias in force.
 * @returns The theme's name, or `undefined` when nothing registers that alias.
 */
export function backofficeThemeName(
  themes: ReadonlyArray<UmbraDesktopBackofficeTheme>,
  alias: string | undefined,
): string | undefined {
  return themes.find((theme) => theme.alias === alias)?.name;
}
