import { itemSelector, writeViewStyle } from '../manager/open-item.js';
import type { UmbraDesktopDragWindowHandle } from './drag.controller.js';
import type { UmbraDesktopDropTarget } from './targets.js';

/**
 * Drawing the one target a drag would land in (design §4 and §6): the window's folder area outlined,
 * or a folder card or tree folder lit, in the theme's selection colour, or its danger colour when
 * nothing would go. For the manager's own drags and for files from the OS alike.
 */

/** The id of the style a lit card or tree folder is drawn with, in core's view and in the tree. */
const DROP_STYLE = 'umbradesktop-media-drop';

/**
 * How thick a drop target's border is, around a card, a tree folder or a window's folder area. Two
 * pixels read as a hint and went unnoticed (owner's test, 2026-10-18); the manager's own shade reads
 * this too, so every target has the same weight.
 */
export const DROP_OUTLINE_PX = 3;

/** How much of the target's colour tints it, in percent: enough to read as "here", not to hide it. */
export const DROP_TINT_PERCENT = 14;

/**
 * The colour a target is drawn in.
 * @param refused Whether nothing would go.
 * @returns The theme's selection colour, or its danger colour.
 */
export function dropColour(refused: boolean): string {
  return refused ? 'var(--uui-color-danger, #d42054)' : 'var(--umbradesktop-app-accent, var(--uui-color-selected, #3544b1))';
}

/**
 * A colour as a light tint, for a target's fill.
 * @param colour The colour.
 * @returns The tint.
 */
export function dropTint(colour: string): string {
  return `color-mix(in srgb, ${colour} ${DROP_TINT_PERCENT}%, transparent)`;
}

/**
 * Light a target.
 * @param target The target.
 * @param refused Whether nothing would go.
 */
export function lightTarget(target: UmbraDesktopDropTarget<UmbraDesktopDragWindowHandle>, refused: boolean): void {
  const colour = dropColour(refused);
  // A card: outlined, with a glow of the tint around it, both outside it, since core draws the card
  // opaque and an overlay inside would need it positioned, which would move a card core places itself.
  const rule = (selector: string) =>
    `${selector} { outline: ${DROP_OUTLINE_PX}px solid ${colour}; outline-offset: 0; border-radius: var(--uui-border-radius, 3px); box-shadow: 0 0 0 ${DROP_OUTLINE_PX * 3}px ${dropTint(colour)}; }`;
  // A tree row: drawn as uui draws a selected row, in the drop colour. That colours the row itself and
  // none of the folders open inside it, which an outline round the menu item did (owner's test,
  // 2026-10-19), and it wins over the window's own folder's fill. The colours go in through uui's own
  // variables, which only a selected row reads.
  const contrast = refused ? 'var(--uui-color-danger-contrast, #fff)' : 'var(--uui-color-selected-contrast, #fff)';
  const treeRule = (selector: string) =>
    `${selector} { --uui-menu-item-background-color-selected: ${colour}; --uui-menu-item-color-selected: ${contrast}; }`;
  // One target at a time: any row the tree has lit comes down unless it is this target's.
  const tree = target.window.tree();
  if (tree && !(target.kind === 'folder' && target.via === 'tree') && !(target.kind === 'bin' && target.element)) markRow(tree, undefined);
  if (target.kind === 'window' || (target.kind === 'bin' && !target.element)) {
    target.window.setDrop(refused ? 'refused' : 'target');
    return;
  }
  // A lit folder inside a window means the window itself is not the target.
  target.window.setDrop(undefined);
  if (target.kind === 'folder' && target.via === 'card' && target.unique) {
    const folder = target.window.folder();
    if (folder) writeViewStyle(folder, DROP_STYLE, rule(itemSelector(target.unique)));
    return;
  }
  if (!tree) return;
  const selector =
    target.kind === 'bin'
      ? 'uui-menu-item[href*="/workspace/media-recycle-bin-root/"]'
      : target.unique
        ? `uui-menu-item[href$="/edit/${target.unique}"]`
        : 'uui-menu-item[href*="/workspace/media-root/"]';
  writeViewStyle(tree, DROP_STYLE, treeRule(selector), 'uui-menu-item');
  markRow(tree, menuItemIn(tree, selector));
}

/** The tree row each tree has marked selected as a drop target. */
const markedRows = new WeakMap<Element, Element>();

/**
 * Mark one row of a tree as the drop target, and unmark the one before. Core binds `selected` to its
 * own selection, which is off in a manager's tree, and Lit only writes a binding whose value changed,
 * so the mark stays until it is taken off here.
 * @param tree The tree host.
 * @param row The row, or undefined to mark none.
 */
function markRow(tree: Element, row: Element | undefined): void {
  const before = markedRows.get(tree);
  if (before === row) return;
  before?.removeAttribute('selected');
  if (row) {
    row.setAttribute('selected', '');
    markedRows.set(tree, row);
  } else {
    markedRows.delete(tree);
  }
}

/**
 * The first menu item in a tree, through every shadow root, that a selector matches.
 * @param tree The tree host.
 * @param selector The selector.
 * @returns The item, or undefined.
 */
function menuItemIn(tree: Element, selector: string): Element | undefined {
  const queue: ShadowRoot[] = tree.shadowRoot ? [tree.shadowRoot] : [];
  while (queue.length) {
    for (const element of queue.shift()!.querySelectorAll('*')) {
      if (element.tagName === 'UUI-MENU-ITEM' && element.matches(selector)) return element;
      if (element.shadowRoot) queue.push(element.shadowRoot);
    }
  }
  return undefined;
}

/**
 * Take down whatever a window has lit.
 * @param window The window.
 */
export function clearTarget(window: UmbraDesktopDragWindowHandle): void {
  window.setDrop(undefined);
  const folder = window.folder();
  if (folder) writeViewStyle(folder, DROP_STYLE, '');
  const tree = window.tree();
  if (tree) {
    writeViewStyle(tree, DROP_STYLE, '', 'uui-menu-item');
    markRow(tree, undefined);
  }
}

/**
 * The attribute a drag marks each target with as it starts (#158, design §19): every place in the
 * tree, every folder card, `accepts` or `refuses`, from the same rule as the label, so the two agree.
 * An attribute rather than a rule per key, so a test and a person in DevTools can read it off the row.
 */
export const DROP_MARK_ATTRIBUTE = 'data-umbradesktop-drop';

/** What a target says before the pointer reaches it: it takes at least one dragged item, or none. */
export type UmbraDesktopDropMark = 'accepts' | 'refuses';

/** How strong an accepting target's tint is: half a hovered target's, so the one under the pointer stands out. */
export const MARK_TINT_PERCENT = DROP_TINT_PERCENT / 2;

/** How visible a refusing target stays: dimmed, still readable. */
export const MARK_DIM_OPACITY = 0.45;

/** The id of the style the marks are drawn with, in each tree row and in a window's view. */
const MARK_STYLE = 'umbradesktop-media-marks';

/**
 * The tint an accepting target is drawn with.
 * @returns The colour.
 */
export function markTint(): string {
  return `color-mix(in srgb, ${dropColour(false)} ${MARK_TINT_PERCENT}%, transparent)`;
}

/**
 * The marks of a tree row, written into the row's own shadow root, on its own line (`#menu-item`), so
 * the places open inside it keep their own marks. A row the pointer is over is drawn selected, as the
 * target, and keeps that look.
 */
const TREE_MARKS = `
  :host([${DROP_MARK_ATTRIBUTE}='accepts']:not([selected])) #menu-item { background-color: ${markTint()}; }
  :host([${DROP_MARK_ATTRIBUTE}='refuses']:not([selected])) #menu-item { opacity: ${MARK_DIM_OPACITY}; }
`;

/** The marks of a folder card or table row, in the view that draws them. */
const VIEW_MARKS = `
  [${DROP_MARK_ATTRIBUTE}='accepts'] { box-shadow: 0 0 0 ${DROP_OUTLINE_PX}px ${markTint()}; border-radius: var(--uui-border-radius, 3px); }
  [${DROP_MARK_ATTRIBUTE}='refuses'] { opacity: ${MARK_DIM_OPACITY}; }
`;

/** The elements each window has marked, so the next marks and the end of the drag find them. */
const markedElements = new WeakMap<UmbraDesktopDragWindowHandle, Set<Element>>();

/**
 * Mark a window's targets, and unmark what no longer needs it.
 * @param window The window.
 * @param marks The marks: the tree's places by key (null for the Media root), the view's folder cards
 * by key, and the window's own place.
 * @param marks.tree The tree's places.
 * @param marks.cards The view's folder cards.
 * @param marks.place The window's own place, or undefined when it is no target.
 */
export function markTargets(
  window: UmbraDesktopDragWindowHandle,
  marks: { tree: ReadonlyMap<string | null, UmbraDesktopDropMark>; cards: ReadonlyMap<string, UmbraDesktopDropMark>; place?: UmbraDesktopDropMark },
): void {
  const marked = new Set<Element>();
  const tree = window.tree();
  if (tree) {
    writeViewStyle(tree, MARK_STYLE, TREE_MARKS, '#menu-item');
    for (const [unique, mark] of marks.tree) {
      const selector = unique ? `uui-menu-item[href$="/edit/${unique}"]` : 'uui-menu-item[href*="/workspace/media-root/"]';
      for (const row of deepAll(tree, selector)) marked.add(setMark(row, mark));
    }
  }
  const folder = window.folder();
  if (folder) {
    writeViewStyle(folder, MARK_STYLE, marks.cards.size ? VIEW_MARKS : '');
    for (const [unique, mark] of marks.cards) {
      for (const card of deepAll(folder, itemSelector(unique))) marked.add(setMark(card, mark));
    }
  }
  for (const element of markedElements.get(window) ?? []) {
    if (!marked.has(element)) element.removeAttribute(DROP_MARK_ATTRIBUTE);
  }
  markedElements.set(window, marked);
  window.setMark?.(marks.place);
}

/**
 * Take down every mark a window has.
 * @param window The window.
 */
export function clearMarks(window: UmbraDesktopDragWindowHandle): void {
  for (const element of markedElements.get(window) ?? []) element.removeAttribute(DROP_MARK_ATTRIBUTE);
  markedElements.delete(window);
  const tree = window.tree();
  if (tree) writeViewStyle(tree, MARK_STYLE, '', '#menu-item');
  const folder = window.folder();
  if (folder) writeViewStyle(folder, MARK_STYLE, '');
  window.setMark?.(undefined);
}

/**
 * Put a mark on an element.
 * @param element The row or card.
 * @param mark The mark.
 * @returns The element.
 */
function setMark(element: Element, mark: UmbraDesktopDropMark): Element {
  if (element.getAttribute(DROP_MARK_ATTRIBUTE) !== mark) element.setAttribute(DROP_MARK_ATTRIBUTE, mark);
  return element;
}

/**
 * Every element under a root, through every shadow root, that a selector matches.
 * @param root The tree host or folder host.
 * @param selector The selector.
 * @returns The elements.
 */
function deepAll(root: Element, selector: string): Element[] {
  const found: Element[] = [];
  const queue: ParentNode[] = [root.shadowRoot ?? root];
  while (queue.length) {
    for (const element of queue.shift()!.querySelectorAll('*')) {
      if (element.matches(selector)) found.push(element);
      if (element.shadowRoot) queue.push(element.shadowRoot);
    }
  }
  return found;
}
