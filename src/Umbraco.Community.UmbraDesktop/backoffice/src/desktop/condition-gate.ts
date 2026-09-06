/**
 * One condition config as it appears in a manifest's `conditions` array. Only the alias matters
 * to the pure layer; the rest of the object is the condition's own configuration and is passed
 * through to it untouched.
 */
export interface UmbraDesktopConditionConfig {
  /** The registered alias of the condition this config configures. */
  alias: string;
}

/**
 * The condition configs on a referenced manifest that this entry has opted into evaluating.
 *
 * A manifest's conditions are a mix of two kinds. Mount-dependent ones (`Umb.Condition.SectionAlias`,
 * `Umb.Condition.WorkspaceAlias`, the block and collection conditions) are answered relative to the
 * section or workspace the extension renders in; the desktop shell is mounted in its own section, so
 * evaluating them here would deny every entry in the catalogue. The iframe is mounted in the right
 * place and answers those correctly. User- or install-dependent ones — a permission, a server
 * setting, an existence check — give the same answer in either place, and answering them here is
 * what stops a window opening empty.
 *
 * Nothing infers which is which. The entry names the aliases worth answering, so the judgment sits
 * in the catalogue diff rather than in a global list that has to track 54 CMS conditions and
 * whatever every package adds.
 * @param configs The referenced manifest's own conditions, if it has any.
 * @param evaluate The aliases the catalogue entry opted into, if it opted into any.
 * @returns The subset of `configs` to instantiate; empty when the entry opted into nothing.
 */
export function evaluableConditions<T extends UmbraDesktopConditionConfig>(
  configs: ReadonlyArray<T> | undefined,
  evaluate: ReadonlyArray<string> | undefined,
): T[] {
  if (!configs?.length || !evaluate?.length) return [];
  return configs.filter((config) => evaluate.includes(config.alias));
}

/**
 * Whether an entry's evaluated conditions permit it to appear.
 *
 * Only an explicit `false` denies. A condition whose manifest has not registered yet, whose api
 * failed to load, or which has been created but has not reported, is `undefined` and permits — a
 * condition arriving late must make an app appear, never make one vanish. That direction matters:
 * the desktop's standing rule is that a missing affordance is a bug, and a permanently unresolvable
 * condition failing closed would silently delete a working app.
 * @param states The latest verdict per evaluated condition; `undefined` where none has arrived.
 * @returns False only when some condition has explicitly denied the entry.
 */
export function isPermitted(states: ReadonlyArray<boolean | undefined>): boolean {
  return !states.includes(false);
}
