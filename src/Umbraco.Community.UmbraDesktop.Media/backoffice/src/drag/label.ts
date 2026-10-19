/**
 * The label under the pointer during a drag, which says what letting go will do and how to change it
 * (design §4, plan task 5.3). Pure: it answers with dictionary keys and their arguments, and the
 * element that draws it puts them into the person's language.
 */

/** What letting go would do. */
export interface UmbraDesktopDropPlan {
  /** Move, copy, trash (the recycle bin) or restore (out of the recycle bin). */
  kind: 'move' | 'copy' | 'trash' | 'restore';
  /** The folder's name, for every kind but trash. */
  target: string;
  /** How many items are dragged. */
  total: number;
  /** How many of them would go. */
  going: number;
  /** One item that would not go, and why, when any would not. */
  notGoing?: { name: string; reason: string };
}

/** One line of the label: a dictionary key and its arguments. */
export interface UmbraDesktopLabelLine {
  /** The key. */
  key: string;
  /** Its arguments. */
  args: Array<string | number>;
}

/**
 * The label for a drop.
 * @param plan What letting go would do.
 * @param mac Whether this is a Mac, where the copy key is Option.
 * @returns The lines, and whether the target refuses everything.
 */
export function dropLabel(plan: UmbraDesktopDropPlan, mac: boolean): { lines: UmbraDesktopLabelLine[]; refused: boolean } {
  const cannot = plan.notGoing ? [{ key: 'umbraDesktopMedia_dragCannot', args: [plan.notGoing.name, plan.notGoing.reason] }] : [];
  if (plan.going === 0) return { lines: cannot, refused: true };
  if (plan.kind === 'trash') return { lines: [{ key: 'umbraDesktopMedia_dragTrash', args: [] }, ...cannot], refused: false };
  if (plan.kind === 'restore') return { lines: [{ key: 'umbraDesktopMedia_dragRestore', args: [plan.target] }, ...cannot], refused: false };
  const some = plan.going < plan.total;
  const head =
    plan.kind === 'copy'
      ? some
        ? { key: 'umbraDesktopMedia_dragCopySome', args: [plan.going, plan.total, plan.target] }
        : { key: 'umbraDesktopMedia_dragCopy', args: [plan.target] }
      : some
        ? { key: 'umbraDesktopMedia_dragMoveSome', args: [plan.going, plan.total, plan.target] }
        : { key: 'umbraDesktopMedia_dragMove', args: [plan.target] };
  const hint = plan.kind === 'move' ? [{ key: mac ? 'umbraDesktopMedia_dragHoldToCopyMac' : 'umbraDesktopMedia_dragHoldToCopy', args: [] }] : [];
  return { lines: [head, ...cannot, ...hint], refused: false };
}
