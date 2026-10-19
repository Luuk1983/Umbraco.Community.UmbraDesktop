import { Group, IText, Path, Point as FabricPoint, Rect, util } from 'fabric';
import type { FabricObject, TMat2D } from 'fabric';
import type { Mark, Point } from './state.js';
import type { UmbraDesktopImageEditorElement } from './image-editor.element.js';

/**
 * Marks as Fabric objects, and back.
 *
 * The document holds marks as plain data in oriented space (`state.ts`); the canvas shows them as
 * objects the person can select, move and resize. Each object remembers the mark it was made from
 * and its transform at that moment, so whatever Fabric does to it afterwards (a drag, a resize) is
 * read back by applying the change in transform to the mark's own points: exact for every kind,
 * with no attempt to reverse-engineer a path from Fabric's bounding boxes. Marks are not rotated
 * (their turn handle is hidden), so the data stays as simple as the plan's model.
 */

/** What an object remembers about the mark it shows. */
interface MarkOrigin {
  /** The mark as it was when the object was made. */
  mark: Mark;
  /** The object's transform then. */
  matrix: TMat2D;
  /** The crop offset then, which the object's coordinates are less. */
  offset: Point;
}

/** Each mark object's origin. */
const ORIGINS = new WeakMap<FabricObject, MarkOrigin>();

/** The light halo under an arrow, as the saved file draws it (`render.ts`). */
const ARROW_HALO = 'rgba(255, 255, 255, 0.85)';

/** What every mark object shares: no turn handle, its own stroke kept as wide at any size. */
const COMMON = {
  originX: 'left' as const,
  originY: 'top' as const,
  lockRotation: true,
  strokeUniform: true,
  transparentCorners: false,
  cornerSize: 12,
  touchCornerSize: 28,
};

/**
 * The arrow's path: its shaft and its two-sided head, as `render.ts` draws them.
 * @param from The tail.
 * @param to The tip.
 * @param width The line width, which sizes the head.
 * @returns SVG path data.
 */
function arrowPath(from: Point, to: Point, width: number): string {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = Math.max(12, width * 4);
  const side = (sign: number) =>
    `${to.x - head * Math.cos(angle + sign * 0.45)} ${to.y - head * Math.sin(angle + sign * 0.45)}`;
  return `M ${from.x} ${from.y} L ${to.x} ${to.y} M ${side(-1)} L ${to.x} ${to.y} L ${side(1)}`;
}

/**
 * Subtract an offset from a point.
 * @param point The point.
 * @param offset The offset.
 * @returns The moved point.
 */
const less = (point: Point, offset: Point): Point => ({ x: point.x - offset.x, y: point.y - offset.y });

/**
 * A mark's object.
 * @param mark The mark.
 * @param offset Where the view's world starts in oriented space (the crop's corner, outside Crop).
 * @returns The object, not yet on a canvas.
 */
export function markToObject(mark: Mark, offset: Point): FabricObject {
  let object: FabricObject;
  switch (mark.kind) {
    case 'box':
      object = new Rect({
        ...COMMON,
        left: mark.data.x - offset.x - mark.width / 2,
        top: mark.data.y - offset.y - mark.width / 2,
        width: mark.data.w,
        height: mark.data.h,
        fill: 'transparent',
        stroke: mark.colour,
        strokeWidth: mark.width,
        strokeLineJoin: 'miter',
      });
      break;
    case 'text':
      object = new IText(mark.data.text, {
        ...COMMON,
        left: mark.data.at.x - offset.x,
        top: mark.data.at.y - offset.y,
        fill: mark.colour,
        fontSize: mark.data.size,
        fontWeight: 700,
        fontFamily: 'system-ui, sans-serif',
        lineHeight: 1.2,
      });
      break;
    case 'pen': {
      const [first, ...rest] = mark.data.points.map((point) => less(point, offset));
      const data = first ? `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')}` : 'M 0 0';
      object = new Path(data, {
        ...COMMON,
        fill: '',
        stroke: mark.colour,
        strokeWidth: mark.width,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      });
      break;
    }
    case 'arrow': {
      const data = arrowPath(less(mark.data.from, offset), less(mark.data.to, offset), mark.width);
      const line = { fill: '', strokeLineCap: 'round' as const, strokeLineJoin: 'round' as const };
      object = new Group(
        [
          new Path(data, { ...line, stroke: ARROW_HALO, strokeWidth: mark.width + 4 }),
          new Path(data, { ...line, stroke: mark.colour, strokeWidth: mark.width }),
        ],
        { ...COMMON, subTargetCheck: false },
      );
      break;
    }
  }
  object.setControlsVisibility({ mtr: false });
  object.setCoords();
  ORIGINS.set(object, { mark, matrix: object.calcTransformMatrix(), offset: { ...offset } });
  return object;
}

/**
 * The mark an object shows now, after whatever was done to it on the canvas.
 * @param object The object, made by {@link markToObject}.
 * @param offset Where the view's world starts in oriented space now.
 * @returns The mark, or undefined for an object that is not a mark's.
 */
export function markFromObject(object: FabricObject, offset: Point): Mark | undefined {
  const origin = ORIGINS.get(object);
  if (!origin) return undefined;
  const { mark } = origin;
  // The change in transform since the object was made, as a map of world points.
  const change = util.multiplyTransformMatrices(object.calcTransformMatrix(), util.invertTransform(origin.matrix));
  const move = (point: Point): Point => {
    const local = less(point, origin.offset);
    const moved = util.transformPoint(new FabricPoint(local.x, local.y), change);
    return { x: moved.x + offset.x, y: moved.y + offset.y };
  };
  switch (mark.kind) {
    case 'box': {
      const scaleX = object.scaleX ?? 1;
      const scaleY = object.scaleY ?? 1;
      return {
        ...mark,
        data: {
          x: object.left + mark.width / 2 + offset.x,
          y: object.top + mark.width / 2 + offset.y,
          w: (object.width ?? 0) * scaleX,
          h: (object.height ?? 0) * scaleY,
        },
      };
    }
    case 'text':
      return {
        ...mark,
        data: {
          at: { x: object.left + offset.x, y: object.top + offset.y },
          text: (object as IText).text,
          size: mark.data.size * (object.scaleY ?? 1),
        },
      };
    case 'pen':
      return { ...mark, data: { points: mark.data.points.map(move) } };
    case 'arrow':
      return { ...mark, data: { from: move(mark.data.from), to: move(mark.data.to) } };
  }
}

/**
 * The mark id an object shows, or undefined for any other object.
 * @param object A canvas object.
 * @returns The id.
 */
export function markIdOf(object: FabricObject): string | undefined {
  return ORIGINS.get(object)?.mark.id;
}

/**
 * The mark objects on the editor's canvas, in drawing order.
 * @param editor The editor.
 * @returns The objects.
 */
export function markObjectsOf(editor: UmbraDesktopImageEditorElement): FabricObject[] {
  return editor.stage?.canvas.getObjects().filter((object) => ORIGINS.has(object)) ?? [];
}

/**
 * Put the document's marks on the canvas as objects, replacing the ones there: after every change
 * to the history, and whenever the mode changes, since only Markup makes them selectable.
 * @param editor The editor.
 * @param interactive Whether they can be selected and moved.
 * @param selectedId A mark to select again, so a restyle keeps the selection.
 */
export function syncMarks(editor: UmbraDesktopImageEditorElement, interactive: boolean, selectedId?: string): void {
  const canvas = editor.stage?.canvas;
  const state = editor.state;
  if (!canvas || !state) return;
  syncing = true;
  try {
    replaceMarks(editor, canvas, state.marks, interactive, selectedId);
  } finally {
    syncing = false;
  }
}

/** Whether marks are being put back on the canvas, which removes and selects objects of its own. */
let syncing = false;

/**
 * Whether a selection event comes from putting the marks back rather than from the person: Markup
 * ignores those, or every change would lose the selected mark.
 * @returns True while {@link syncMarks} runs.
 */
export function isSyncingMarks(): boolean {
  return syncing;
}

/**
 * The body of {@link syncMarks}.
 * @param editor The editor.
 * @param canvas Its canvas.
 * @param marks The marks to show.
 * @param interactive Whether they can be selected.
 * @param selectedId A mark to select again.
 */
function replaceMarks(
  editor: UmbraDesktopImageEditorElement,
  canvas: NonNullable<UmbraDesktopImageEditorElement['stage']>['canvas'],
  marks: Mark[],
  interactive: boolean,
  selectedId?: string,
): void {
  for (const object of markObjectsOf(editor)) canvas.remove(object);
  const offset = editor.worldOffset;
  let selected: FabricObject | undefined;
  for (const mark of marks) {
    const object = markToObject(mark, offset);
    object.set({ selectable: interactive, evented: interactive, hoverCursor: interactive ? 'move' : 'default' });
    canvas.add(object);
    if (mark.id === selectedId) selected = object;
  }
  if (selected) canvas.setActiveObject(selected);
  canvas.requestRenderAll();
}
