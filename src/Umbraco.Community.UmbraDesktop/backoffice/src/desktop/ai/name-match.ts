/**
 * Matching the name a person said against the names the desktop knows.
 *
 * Shared by both tools that take a name, and they resolve against different sets: opening searches
 * the catalogue, closing searches the windows that are open. The rules are the same either way,
 * and having them in one place is what stops "log viewer" working in one tool and not the other.
 */

/** One candidate: the thing, and the name a person would call it. */
export interface Labelled<T> {
  /** The candidate. */
  item: T;
  /** Its name, already localised. */
  label: string;
}

/**
 * Every candidate a name could mean.
 *
 * Exact wins outright, so an app called "Media" is never ambiguous just because "Media library"
 * exists. Only when nothing matches exactly does containment apply, which is what makes
 * "background" find Background Jobs without letting it also mean something it merely overlaps.
 *
 * Case is folded because a model writes "Log Viewer" and a person types "log viewer", and refusing
 * over that would be pedantry rather than safety.
 * @param candidates What there is to choose from.
 * @param wanted The name that was said.
 * @returns The matches: none, one, or several for the caller to refuse over.
 */
export function matchByLabel<T>(
  candidates: ReadonlyArray<Labelled<T>>,
  wanted: string,
): Array<Labelled<T>> {
  const needle = wanted.trim().toLowerCase();
  if (!needle) return [];
  const exact = candidates.filter((entry) => entry.label.toLowerCase() === needle);
  if (exact.length > 0) return exact;
  return candidates.filter((entry) => entry.label.toLowerCase().includes(needle));
}
