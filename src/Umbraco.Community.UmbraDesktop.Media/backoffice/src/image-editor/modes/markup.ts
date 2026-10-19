import { html } from '@umbraco-cms/backoffice/external/lit';
import { IText, Path, PencilBrush } from 'fabric';
import type { Canvas, FabricObject } from 'fabric';
import type { WordKey } from '../../shared/words.js';
import { isSyncingMarks, markFromObject, markIdOf, markObjectsOf, markToObject, syncMarks } from '../marks.js';
import type { Mark, Point } from '../state.js';
import type { UmbraDesktopImageEditorElement } from '../image-editor.element.js';
import type { ModeModule } from './mode.js';

/** The tools, in the order the panel lists them. */
const TOOLS = [
  { tool: 'select', label: 'toolSelect', icon: 'icon-mouse-cursor' },
  { tool: 'text', label: 'toolText', icon: 'icon-font' },
  { tool: 'arrow', label: 'toolArrow', icon: 'icon-arrow-right' },
  { tool: 'box', label: 'toolBox', icon: 'icon-checkbox-dotted' },
  { tool: 'pen', label: 'toolPen', icon: 'icon-brush' },
] as const;

/** A Markup tool. */
export type Tool = (typeof TOOLS)[number]['tool'];

/** The six colours, the mocks' palette: Umbraco's pink, yellow, green, blue and navy, and white. */
export const COLOURS: ReadonlyArray<{ name: string; value: string; label: WordKey }> = [
  { name: 'red', value: '#d42054', label: 'colourRed' },
  { name: 'yellow', value: '#f5c142', label: 'colourYellow' },
  { name: 'green', value: '#2bc37c', label: 'colourGreen' },
  { name: 'blue', value: '#3544b1', label: 'colourBlue' },
  { name: 'navy', value: '#1b264f', label: 'colourNavy' },
  { name: 'white', value: '#ffffff', label: 'colourWhite' },
];

/** The line widths offered, in picture pixels. */
const WIDTH_MIN = 1;
const WIDTH_MAX = 40;

/** A drag that is shorter than this, in picture pixels, is a click and draws no box or arrow. */
const MIN_DRAG = 2;

/** What Markup keeps while it is the mode. */
interface MarkupSettings {
  /** The tool. */
  tool: Tool;
  /** The colour a new mark gets. */
  colour: string;
  /** The width a new mark gets. */
  width: number;
  /** The selected mark, by id. */
  selectedId?: string;
  /** The box or arrow being drawn. */
  drawing?: { from: Point; preview: FabricObject };
}

/** The settings Markup keeps between visits, on the editor. */
function settings(editor: UmbraDesktopImageEditorElement): MarkupSettings {
  return (editor.modeState.markup ??= { tool: 'arrow', colour: COLOURS[0].value, width: 5 }) as MarkupSettings;
}

/** A new mark id: unique within a document, which is all it needs to be. */
function newId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Add a mark as one step.
 * @param editor The editor.
 * @param mark The mark.
 */
function addMark(editor: UmbraDesktopImageEditorElement, mark: Mark): void {
  const state = editor.state;
  if (!state) return;
  editor.apply({ ...state, marks: [...state.marks, mark] });
}

/**
 * Replace the selected mark, as one step.
 * @param editor The editor.
 * @param change What to make of it.
 */
function changeSelected(editor: UmbraDesktopImageEditorElement, change: (mark: Mark) => Mark | null): void {
  const state = editor.state;
  const id = settings(editor).selectedId;
  if (!state || !id) return;
  const marks = state.marks.flatMap((mark) => (mark.id === id ? (change(mark) ?? []) : [mark]));
  if (JSON.stringify(marks) === JSON.stringify(state.marks)) return;
  if (!marks.some((mark) => mark.id === id)) settings(editor).selectedId = undefined;
  editor.apply({ ...state, marks });
}

/**
 * Put the marks on the canvas the way the tool wants them: selectable with Select, out of the way of
 * the drawing tools.
 * @param editor The editor.
 */
function placeMarks(editor: UmbraDesktopImageEditorElement): void {
  const own = settings(editor);
  const canvas = editor.stage?.canvas;
  if (!canvas) return;
  syncMarks(editor, own.tool === 'select', own.selectedId);
  canvas.isDrawingMode = own.tool === 'pen';
  if (own.tool === 'pen') {
    const brush = new PencilBrush(canvas);
    brush.color = own.colour;
    brush.width = own.width;
    canvas.freeDrawingBrush = brush;
  }
  canvas.defaultCursor = own.tool === 'select' ? 'default' : 'crosshair';
}

/** Which editor a canvas belongs to, for the canvas's handlers. */
const EDITORS = new WeakMap<Canvas, UmbraDesktopImageEditorElement>();

/**
 * The handlers on a canvas, by name, so leaving the mode takes exactly these off.
 * @param canvas The canvas.
 * @returns The handlers.
 */
function handlers(canvas: Canvas) {
  const editorOf = () => EDITORS.get(canvas);
  /** A point in oriented space, from a point in the view's world. */
  const oriented = (editor: UmbraDesktopImageEditorElement, point: { x: number; y: number }): Point => ({
    x: Math.round(point.x + editor.worldOffset.x),
    y: Math.round(point.y + editor.worldOffset.y),
  });
  return {
    'mouse:down': (event: { scenePoint?: { x: number; y: number }; target?: FabricObject }) => {
      const editor = editorOf();
      if (!editor || !event.scenePoint) return;
      const own = settings(editor);
      if (own.tool === 'text') {
        if (event.target instanceof IText) return;
        const mark: Mark = {
          id: newId(),
          kind: 'text',
          colour: own.colour,
          width: own.width,
          data: { at: oriented(editor, event.scenePoint), text: editor.words('textDefault'), size: Math.max(16, own.width * 6) },
        };
        own.selectedId = mark.id;
        addMark(editor, mark);
        const object = markObjectsOf(editor).find((candidate) => markIdOf(candidate) === mark.id);
        if (object instanceof IText) {
          object.set({ selectable: true, evented: true });
          canvas.setActiveObject(object);
          object.enterEditing();
          object.selectAll();
        }
        return;
      }
      if (own.tool !== 'box' && own.tool !== 'arrow') return;
      const from = oriented(editor, event.scenePoint);
      const preview = markToObject(drawn(own, from, from), editor.worldOffset);
      preview.set({ selectable: false, evented: false });
      canvas.add(preview);
      own.drawing = { from, preview };
    },
    'mouse:move': (event: { scenePoint?: { x: number; y: number } }) => {
      const editor = editorOf();
      const own = editor ? settings(editor) : undefined;
      if (!editor || !own?.drawing || !event.scenePoint) return;
      canvas.remove(own.drawing.preview);
      own.drawing.preview = markToObject(drawn(own, own.drawing.from, oriented(editor, event.scenePoint)), editor.worldOffset);
      own.drawing.preview.set({ selectable: false, evented: false });
      canvas.add(own.drawing.preview);
      canvas.requestRenderAll();
    },
    'mouse:up': (event: { scenePoint?: { x: number; y: number } }) => {
      const editor = editorOf();
      const own = editor ? settings(editor) : undefined;
      if (!editor || !own?.drawing) return;
      const { from, preview } = own.drawing;
      own.drawing = undefined;
      canvas.remove(preview);
      const to = event.scenePoint ? oriented(editor, event.scenePoint) : from;
      if (Math.abs(to.x - from.x) < MIN_DRAG && Math.abs(to.y - from.y) < MIN_DRAG) return;
      addMark(editor, drawn(own, from, to));
    },
    'path:created': (event: { path?: Path }) => {
      const editor = editorOf();
      const path = event.path;
      if (!editor || !path) return;
      canvas.remove(path);
      const own = settings(editor);
      // Each command's end point, in the path's own coordinates, then into the world by its transform.
      const local = (path.path as unknown as Array<Array<string | number>>).map((command) => {
        const numbers = command.slice(1) as number[];
        return { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
      });
      const matrix = path.calcTransformMatrix();
      const points = local
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        .map((point) => {
          const x = point.x - path.pathOffset.x;
          const y = point.y - path.pathOffset.y;
          return oriented(editor, { x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] });
        });
      if (!points.length) return;
      addMark(editor, { id: newId(), kind: 'pen', colour: own.colour, width: own.width, data: { points } });
    },
    'object:modified': (event: { target?: FabricObject }) => {
      const editor = editorOf();
      const target = event.target;
      const id = target ? markIdOf(target) : undefined;
      if (!editor || !target || !id) return;
      settings(editor).selectedId = id;
      const moved = markFromObject(target, editor.worldOffset);
      if (moved) changeSelected(editor, () => moved);
    },
    'text:editing:exited': (event: { target?: FabricObject }) => {
      const editor = editorOf();
      const target = event.target;
      const id = target ? markIdOf(target) : undefined;
      if (!editor || !target || !id) return;
      settings(editor).selectedId = id;
      const edited = markFromObject(target, editor.worldOffset);
      if (edited) changeSelected(editor, () => (edited.kind === 'text' && !edited.data.text.trim() ? null : edited));
    },
    'selection:created': (event: { selected?: FabricObject[] }) => select(editorOf(), event.selected?.[0]),
    'selection:updated': (event: { selected?: FabricObject[] }) => select(editorOf(), event.selected?.[0]),
    'selection:cleared': () => select(editorOf(), undefined),
  };
}

/**
 * The mark a drag draws with the box or arrow tool.
 * @param own The settings.
 * @param from Where the drag started.
 * @param to Where it is now.
 * @returns The mark.
 */
function drawn(own: MarkupSettings, from: Point, to: Point): Mark {
  if (own.tool === 'arrow') return { id: newId(), kind: 'arrow', colour: own.colour, width: own.width, data: { from, to } };
  return {
    id: newId(),
    kind: 'box',
    colour: own.colour,
    width: own.width,
    data: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) },
  };
}

/**
 * The selection changed on the canvas.
 * @param editor The editor.
 * @param object The selected object, or none.
 */
function select(editor: UmbraDesktopImageEditorElement | undefined, object: FabricObject | undefined): void {
  if (!editor || isSyncingMarks()) return;
  settings(editor).selectedId = object ? markIdOf(object) : undefined;
  editor.requestUpdate();
}

/** The installed handlers, by canvas, so they go on once and come off with the mode. */
const INSTALLED = new WeakMap<Canvas, ReturnType<typeof handlers>>();

/**
 * Markup mode (design §4.1). Marks stay objects, movable and restylable, until the picture is saved;
 * then they are part of the saved file's pixels, and still objects here (§4.2). Each new mark, each
 * move or restyle, and each delete is one step.
 */
export const markupMode: ModeModule = {
  enter(editor) {
    const canvas = editor.stage?.canvas;
    if (!canvas) return;
    EDITORS.set(canvas, editor);
    if (!INSTALLED.has(canvas)) {
      const installed = handlers(canvas);
      for (const [name, handler] of Object.entries(installed)) canvas.on(name as never, handler as never);
      INSTALLED.set(canvas, installed);
    }
    placeMarks(editor);
  },

  leave(editor) {
    const canvas = editor.stage?.canvas;
    if (!canvas) return;
    const active = canvas.getActiveObject();
    if (active instanceof IText && active.isEditing) active.exitEditing();
    const installed = INSTALLED.get(canvas);
    if (installed) for (const [name, handler] of Object.entries(installed)) canvas.off(name as never, handler as never);
    INSTALLED.delete(canvas);
    canvas.isDrawingMode = false;
    canvas.defaultCursor = 'default';
    canvas.discardActiveObject();
    syncMarks(editor, false);
  },

  key(editor, event) {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return false;
    const active = editor.stage?.canvas.getActiveObject();
    if (active instanceof IText && active.isEditing) return false;
    if (!settings(editor).selectedId) return false;
    changeSelected(editor, () => null);
    return true;
  },

  panel(editor) {
    const own = settings(editor);
    const selected = editor.state?.marks.find((mark) => mark.id === own.selectedId);
    const restyle = (change: Partial<Pick<Mark, 'colour' | 'width'>>) => {
      Object.assign(own, change);
      if (selected) changeSelected(editor, (mark) => ({ ...mark, ...change }) as Mark);
      else placeMarks(editor);
      editor.requestUpdate();
    };
    return html`
      <section class="box">
        <h4>${editor.words('tool')}</h4>
        <div class="segmented">
          ${TOOLS.map(
            (item) => html`<button
              type="button"
              data-command="tool-${item.tool}"
              title=${editor.words(item.label)}
              aria-label=${editor.words(item.label)}
              aria-pressed=${own.tool === item.tool ? 'true' : 'false'}
              @click=${() => {
                own.tool = item.tool;
                if (item.tool !== 'select') {
                  own.selectedId = undefined;
                  editor.stage?.canvas.discardActiveObject();
                }
                placeMarks(editor);
                editor.requestUpdate();
              }}>
              <umb-icon name=${item.icon}></umb-icon>
            </button>`,
          )}
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('colour')}</h4>
        <div class="swatches">
          ${COLOURS.map(
            (colour) => html`<button
              type="button"
              data-command="colour-${colour.name}"
              aria-label=${editor.words(colour.label)}
              title=${editor.words(colour.label)}
              aria-pressed=${(selected?.colour ?? own.colour) === colour.value ? 'true' : 'false'}
              style="background: ${colour.value}"
              @click=${() => restyle({ colour: colour.value })}></button>`,
          )}
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('line')}</h4>
        <div class="slider">
          <label for="markup-width">${editor.words('lineWidth')}</label>
          <b>${editor.words('pixelsValue', selected?.width ?? own.width)}</b>
          <input
            id="markup-width"
            type="range"
            name="width"
            min=${WIDTH_MIN}
            max=${WIDTH_MAX}
            step="1"
            .value=${String(selected?.width ?? own.width)}
            @input=${(event: Event) => {
              own.width = Number((event.target as HTMLInputElement).value);
              editor.requestUpdate();
            }}
            @change=${(event: Event) => restyle({ width: Number((event.target as HTMLInputElement).value) })} />
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('selectedMark')}</h4>
        <div class="row">
          <button type="button" data-command="mark-delete" ?disabled=${!selected} @click=${() => changeSelected(editor, () => null)}>
            <umb-icon name="icon-trash"></umb-icon><span>${editor.words('delete')}</span>
          </button>
          <button
            type="button"
            data-command="mark-front"
            ?disabled=${!selected}
            @click=${() => {
              const state = editor.state;
              if (!state || !selected) return;
              editor.apply({ ...state, marks: [...state.marks.filter((mark) => mark.id !== selected.id), selected] });
            }}>
            ${editor.words('bringToFront')}
          </button>
        </div>
      </section>
      <p class="muted">${editor.words('markupHint')}</p>
    `;
  },
};
