import type { UmbraDesktopGroup } from '../types';
import { launcherGroupOrder } from '../group-apps';

/**
 * What a layout group is called, and whether that text goes through the translator.
 *
 * Two kinds of text reach a group heading. A catalogue label is a localisation token (or a package's
 * literal, which the translator passes through), so it follows the backoffice language. A name the
 * user typed is theirs and is shown exactly as typed: sending "#1 priorities" through the translator
 * would look it up as a token.
 */
export interface UmbraDesktopGroupLabel {
  /** A label to translate, or literal text. */
  text: string;
  /** Whether {@link text} goes through `localize.string`. */
  translate: boolean;
}

/**
 * Name a layout group (design §4.4).
 *
 * A `null` label is looked up by id among the merged catalogue groups plus the reserved More group,
 * so a group a package brings is named as well as a curated one. This is the registry the role
 * presets will extend: they pass their own groups alongside the catalogue's. A `null` label on an id
 * nobody knows shows the id, which only happens when a package's group is gone and the user had
 * moved other apps into it.
 * @param id The layout group's id.
 * @param label The stored label: `null` to look up, or the user's text.
 * @param groups The merged catalogue groups.
 * @returns The heading text, and whether to translate it.
 */
export function groupLabel(
  id: string,
  label: string | null,
  groups: ReadonlyArray<UmbraDesktopGroup>,
): UmbraDesktopGroupLabel {
  if (label !== null) return { text: label, translate: false };
  const known = launcherGroupOrder(groups).find((group) => group.alias === id);
  return known ? { text: known.label, translate: true } : { text: id, translate: false };
}
