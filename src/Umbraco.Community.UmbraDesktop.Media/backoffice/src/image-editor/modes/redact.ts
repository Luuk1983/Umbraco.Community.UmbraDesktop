import { html } from '@umbraco-cms/backoffice/external/lit';
import { Rect } from 'fabric';
import type { Canvas, FabricObject } from 'fabric';
import { REDACT_DEFAULT_STRENGTH, redactionBlock } from '../redact.js';
import { isSyncingRegions, regionFromObject, regionIdOf, syncRegions } from '../regions.js';
import { orientedSize } from '../state.js';
import type { Point, Region } from '../state.js';
import type { UmbraDesktopImageEditorElement } from '../image-editor.element.js';
import type { ModeModule } from './mode.js';

/** The strengths offered: 1 to 10, as `redactionBlock` takes them. */
const STRENGTH_MIN = 1;
const STRENGTH_MAX = 10;

/** A drag shorter than this, in picture pixels, is a click and draws no region. */
const MIN_DRAG = 2;

/** What Redact keeps while it is the mode. */
interface RedactSettings {
  /** The style a new region gets. */
  style: Region['style'];
  /** The strength a new region gets. */
  strength: number;
  /** The selected region, by id. */
  selectedId?: string;
  /** The region being drawn. */
  drawing?: { from: Point; preview: FabricObject };
}

/** The settings Redact keeps between visits, on the editor. */
function settings(editor: UmbraDesktopImageEditorElement): RedactSettings {
  return (editor.modeState.redact ??= { style: 'pixelate', strength: REDACT_DEFAULT_STRENGTH }) as RedactSettings;
}

/** A new region id. */
function newId(): string {
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Replace the selected region, as one step.
 * @param editor The editor.
 * @param change What to make of it; null deletes it.
 */
function changeSelected(editor: UmbraDesktopImageEditorElement, change: (region: Region) => Region | null): void {
  const state = editor.state;
  const id = settings(editor).selectedId;
  if (!state || !id) return;
  const regions = state.regions.flatMap((region) => (region.id === id ? (change(region) ?? []) : [region]));
  if (JSON.stringify(regions) === JSON.stringify(state.regions)) return;
  if (!regions.some((region) => region.id === id)) settings(editor).selectedId = undefined;
  editor.apply({ ...state, regions });
}

/** Which editor a canvas belongs to, for the canvas's handlers. */
const EDITORS = new WeakMap<Canvas, UmbraDesktopImageEditorElement>();

/**
 * The handlers on a canvas, by name.
 * @param canvas The canvas.
 * @returns The handlers.
 */
function handlers(canvas: Canvas) {
  const editorOf = () => EDITORS.get(canvas);
  const oriented = (editor: UmbraDesktopImageEditorElement, point: { x: number; y: number }): Point => ({
    x: Math.round(point.x + editor.worldOffset.x),
    y: Math.round(point.y + editor.worldOffset.y),
  });
  const select = (object?: FabricObject) => {
    const editor = editorOf();
    if (!editor || isSyncingRegions()) return;
    settings(editor).selectedId = object ? regionIdOf(object) : undefined;
    editor.requestUpdate();
  };
  return {
    'mouse:down': (event: { scenePoint?: { x: number; y: number }; target?: FabricObject }) => {
      const editor = editorOf();
      if (!editor || !event.scenePoint || (event.target && regionIdOf(event.target))) return;
      const from = oriented(editor, event.scenePoint);
      const offset = editor.worldOffset;
      const preview = new Rect({
        left: from.x - offset.x,
        top: from.y - offset.y,
        width: 0,
        height: 0,
        originX: 'left',
        originY: 'top',
        fill: 'rgba(255, 255, 255, 0.25)',
        stroke: '#ffffff',
        strokeDashArray: [6, 4],
        strokeWidth: 1,
        strokeUniform: true,
        selectable: false,
        evented: false,
      });
      canvas.add(preview);
      settings(editor).drawing = { from, preview };
    },
    'mouse:move': (event: { scenePoint?: { x: number; y: number } }) => {
      const editor = editorOf();
      const drawing = editor ? settings(editor).drawing : undefined;
      if (!editor || !drawing || !event.scenePoint) return;
      const to = oriented(editor, event.scenePoint);
      const offset = editor.worldOffset;
      drawing.preview.set({
        left: Math.min(drawing.from.x, to.x) - offset.x,
        top: Math.min(drawing.from.y, to.y) - offset.y,
        width: Math.abs(to.x - drawing.from.x),
        height: Math.abs(to.y - drawing.from.y),
      });
      canvas.requestRenderAll();
    },
    'mouse:up': (event: { scenePoint?: { x: number; y: number } }) => {
      const editor = editorOf();
      const own = editor ? settings(editor) : undefined;
      const state = editor?.state;
      if (!editor || !own?.drawing || !state) return;
      const { from, preview } = own.drawing;
      own.drawing = undefined;
      canvas.remove(preview);
      const to = event.scenePoint ? oriented(editor, event.scenePoint) : from;
      if (Math.abs(to.x - from.x) < MIN_DRAG || Math.abs(to.y - from.y) < MIN_DRAG) return;
      const region: Region = {
        id: newId(),
        style: own.style,
        strength: own.strength,
        rect: { x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) },
      };
      own.selectedId = region.id;
      editor.apply({ ...state, regions: [...state.regions, region] });
    },
    'object:modified': (event: { target?: FabricObject }) => {
      const editor = editorOf();
      const target = event.target;
      const id = target ? regionIdOf(target) : undefined;
      if (!editor || !target || !id) return;
      settings(editor).selectedId = id;
      const moved = regionFromObject(target, editor.worldOffset);
      if (moved) changeSelected(editor, () => moved);
    },
    'selection:created': (event: { selected?: FabricObject[] }) => select(event.selected?.[0]),
    'selection:updated': (event: { selected?: FabricObject[] }) => select(event.selected?.[0]),
    'selection:cleared': () => select(undefined),
  };
}

/** The installed handlers, by canvas. */
const INSTALLED = new WeakMap<Canvas, ReturnType<typeof handlers>>();

/**
 * Redact mode (design §4.1). A drag draws a region; each keeps its own style and strength and stays
 * an object, movable, resizable and deletable, until the picture is saved, when it is burned into the
 * file. The defaults are strong, because a light blur can be reversed by software.
 */
export const redactMode: ModeModule = {
  enter(editor) {
    const canvas = editor.stage?.canvas;
    if (!canvas) return;
    EDITORS.set(canvas, editor);
    if (!INSTALLED.has(canvas)) {
      const installed = handlers(canvas);
      for (const [name, handler] of Object.entries(installed)) canvas.on(name as never, handler as never);
      INSTALLED.set(canvas, installed);
    }
    canvas.defaultCursor = 'crosshair';
    syncRegions(editor, true, settings(editor).selectedId);
  },

  leave(editor) {
    const canvas = editor.stage?.canvas;
    if (!canvas) return;
    const installed = INSTALLED.get(canvas);
    if (installed) for (const [name, handler] of Object.entries(installed)) canvas.off(name as never, handler as never);
    INSTALLED.delete(canvas);
    canvas.defaultCursor = 'default';
    canvas.discardActiveObject();
    syncRegions(editor, false);
  },

  key(editor, event) {
    if ((event.key !== 'Delete' && event.key !== 'Backspace') || !settings(editor).selectedId) return false;
    changeSelected(editor, () => null);
    return true;
  },

  panel(editor) {
    const own = settings(editor);
    const state = editor.state;
    const selected = state?.regions.find((region) => region.id === own.selectedId);
    const style = selected?.style ?? own.style;
    const strength = selected?.strength ?? own.strength;
    const block = state ? redactionBlock(orientedSize(state.source, state.rotation), strength) : 0;
    const restyle = (change: Partial<Pick<Region, 'style' | 'strength'>>) => {
      Object.assign(own, change);
      if (selected) changeSelected(editor, (region) => ({ ...region, ...change }));
      editor.requestUpdate();
    };
    return html`
      <section class="box">
        <h4>${editor.words('style')}</h4>
        <div class="segmented">
          ${(['pixelate', 'blur'] as const).map(
            (option) => html`<button
              type="button"
              data-command="style-${option}"
              aria-pressed=${style === option ? 'true' : 'false'}
              @click=${() => restyle({ style: option })}>
              <umb-icon name=${option === 'pixelate' ? 'icon-grid' : 'icon-circle-dotted'}></umb-icon>
              <span>${editor.words(option)}</span>
            </button>`,
          )}
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('strength')}</h4>
        <div class="slider">
          <label for="redact-strength">${editor.words('strength')}</label>
          <b>${editor.words('pixelsValue', block)}</b>
          <input
            id="redact-strength"
            type="range"
            name="strength"
            min=${STRENGTH_MIN}
            max=${STRENGTH_MAX}
            step="1"
            .value=${String(strength)}
            @input=${(event: Event) => {
              if (!selected) own.strength = Number((event.target as HTMLInputElement).value);
              editor.requestUpdate();
            }}
            @change=${(event: Event) => restyle({ strength: Number((event.target as HTMLInputElement).value) })} />
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('selectedRegion')}</h4>
        <div class="row">
          <button type="button" data-command="region-delete" ?disabled=${!selected} @click=${() => changeSelected(editor, () => null)}>
            <umb-icon name="icon-trash"></umb-icon><span>${editor.words('delete')}</span>
          </button>
        </div>
      </section>
      <p class="muted"><umb-icon name="icon-info"></umb-icon> ${editor.words('redactHint')}</p>
    `;
  },
};
