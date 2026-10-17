import { css, html, nothing } from '@umbraco-cms/backoffice/external/lit';
import type { TemplateResult } from '@umbraco-cms/backoffice/external/lit';
import { Rect } from 'fabric';
import type { TPointerEventInfo } from 'fabric';
import type { WordKey } from '../../shared/words.js';
import { constrainCrop, flip, orientPoint, ratioFor, rotate } from '../geometry.js';
import type { RatioChoice } from '../geometry.js';
import { orientedSize } from '../state.js';
import type { EditorState, Rect as Box, Size } from '../state.js';
import type { UmbraDesktopImageEditorElement } from '../image-editor.element.js';
import type { ModeModule } from './mode.js';

/** The ratios, in the order the panel lists them. */
const RATIOS: ReadonlyArray<{ choice: RatioChoice; label?: WordKey; text?: string }> = [
  { choice: 'free', label: 'ratioFree' },
  { choice: 'original', label: 'ratioOriginal' },
  { choice: '1:1', text: '1:1' },
  { choice: '4:3', text: '4:3' },
  { choice: '3:2', text: '3:2' },
  { choice: '16:9', text: '16:9' },
];

/** What Crop keeps while it is the mode. */
interface CropSettings {
  /** The ratio chosen. */
  ratio: RatioChoice;
  /** Which way round a fixed ratio is. */
  orientation: 'portrait' | 'landscape';
}

/** The size label's height, in px, which its CSS and its placement share. */
const LABEL_HEIGHT = 22;

/** Half the size label's widest, in px: "6000 × 4000 px" with room. Its CSS and placement share it. */
const LABEL_HALF_WIDTH = 64;

/** The gap between the frame and its size label, and the label and the canvas's edge, in px. */
const LABEL_GAP = 8;

/** The frame's look: a light line that reads on any photo, over a shade of the outside. */
const FRAME_LINE = 'rgba(255, 255, 255, 0.95)';
const FRAME_SHADE = 'rgba(0, 0, 0, 0.45)';

/**
 * The crop frame: a Fabric rectangle with eight handles and no turn handle, drawing the
 * rule-of-thirds lines inside it and the shade outside it.
 *
 * A Fabric object rather than Cropper.js's elements, because the frame has to zoom and pan with the
 * picture, and the picture is on Fabric's canvas: one canvas, one transform (design §8 left this to
 * the builder; the choice is recorded there).
 */
export class CropFrame extends Rect {
  /** The picture the shade covers, in world pixels. */
  world: Size = { w: 1, h: 1 };

  /**
   * Draw the shade outside the frame, then the frame and its thirds.
   * @param ctx The context, centred on the frame.
   */
  override _render(ctx: CanvasRenderingContext2D): void {
    const w = this.width;
    const h = this.height;
    const left = -w / 2;
    const top = -h / 2;
    const sx = this.scaleX || 1;
    const sy = this.scaleY || 1;
    ctx.save();
    // The shade, in world units round the frame's own: the world rect with the frame cut out of it.
    const originX = this.left + (w * sx) / 2;
    const originY = this.top + (h * sy) / 2;
    ctx.beginPath();
    ctx.rect((-originX) / sx, (-originY) / sy, this.world.w / sx, this.world.h / sy);
    ctx.rect(left, top, w, h);
    ctx.fillStyle = FRAME_SHADE;
    ctx.fill('evenodd');
    ctx.strokeStyle = FRAME_LINE;
    ctx.lineWidth = 1 / Math.max(sx, sy) / (this.canvas?.viewportTransform[0] ?? 1);
    ctx.beginPath();
    for (const third of [1 / 3, 2 / 3]) {
      ctx.moveTo(left + w * third, top);
      ctx.lineTo(left + w * third, top + h);
      ctx.moveTo(left, top + h * third);
      ctx.lineTo(left + w, top + h * third);
    }
    ctx.stroke();
    ctx.lineWidth *= 2;
    ctx.strokeRect(left, top, w, h);
    ctx.restore();
  }
}

/** The settings Crop keeps between visits, on the editor. */
function settings(editor: UmbraDesktopImageEditorElement): CropSettings {
  return (editor.modeState.crop ??= { ratio: 'free', orientation: 'landscape' }) as CropSettings;
}

/** The frame on the stage, while Crop is the mode. For tests, and for the mode's own handlers. */
export function cropFrameOf(editor: UmbraDesktopImageEditorElement): CropFrame | undefined {
  return editor.stage?.canvas.getObjects().find((object): object is CropFrame => object instanceof CropFrame);
}

/** @returns The whole turned picture, as a crop. */
function whole(state: EditorState): Box {
  const size = orientedSize(state.source, state.rotation);
  return { x: 0, y: 0, w: size.w, h: size.h };
}

/** @returns The ratio in force, as width over height, or null for free. */
function ratioOf(editor: UmbraDesktopImageEditorElement): number | null {
  const state = editor.state!;
  const { ratio, orientation } = settings(editor);
  return ratioFor(ratio, orientation, orientedSize(state.source, state.rotation));
}

/**
 * Put the frame where the draft is.
 * @param editor The editor.
 */
function placeFrame(editor: UmbraDesktopImageEditorElement): void {
  const frame = cropFrameOf(editor);
  const draft = editor.cropDraft;
  if (!frame || !draft) return;
  frame.set({ left: draft.x, top: draft.y, width: draft.w, height: draft.h, scaleX: 1, scaleY: 1 });
  frame.world = { ...editor.stage!.world };
  frame.setCoords();
  editor.stage!.canvas.requestRenderAll();
}

/**
 * Set the draft, held inside the picture and to the ratio, and move the frame to it.
 * @param editor The editor.
 * @param rect The frame as drawn.
 */
function setDraft(editor: UmbraDesktopImageEditorElement, rect: Box): void {
  const state = editor.state!;
  editor.cropDraft = constrainCrop(rect, orientedSize(state.source, state.rotation), ratioOf(editor));
  placeFrame(editor);
}

/**
 * The frame was moved or resized: read it back, and keep it inside and at the ratio once let go.
 * @param editor The editor.
 * @param final Whether the gesture ended, which is when the ratio is enforced.
 */
function frameMoved(editor: UmbraDesktopImageEditorElement, final: boolean): void {
  const frame = cropFrameOf(editor);
  if (!frame) return;
  const rect = { x: frame.left, y: frame.top, w: frame.width * frame.scaleX, h: frame.height * frame.scaleY };
  if (final) setDraft(editor, rect);
  else editor.cropDraft = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) };
}

/**
 * Apply the frame as one step, if it differs from the crop applied. A pending resize keeps its
 * scale against the new crop, so a resize then a crop is not stretched.
 * @param editor The editor.
 */
function applyDraft(editor: UmbraDesktopImageEditorElement): void {
  const state = editor.state;
  const draft = editor.cropDraft;
  if (!state || !draft) return;
  const full = whole(state);
  const isWhole = draft.x === 0 && draft.y === 0 && draft.w === full.w && draft.h === full.h;
  const next = isWhole ? null : draft;
  const current = state.crop;
  const same = (!next && !current) || (!!next && !!current && JSON.stringify(next) === JSON.stringify(current));
  if (same) return;
  const before = current ?? full;
  const size = state.size
    ? {
        w: Math.max(1, Math.round((draft.w * state.size.w) / before.w)),
        h: Math.max(1, Math.round((draft.h * state.size.h) / before.h)),
      }
    : null;
  editor.apply({ ...state, crop: next, size });
}

/** Throw the frame away: back to the crop applied, or the whole picture. */
function discardDraft(editor: UmbraDesktopImageEditorElement): void {
  const state = editor.state;
  if (!state) return;
  editor.cropDraft = state.crop ? { ...state.crop } : whole(state);
  placeFrame(editor);
}

/**
 * Turn or flip at once, as one step, and the frame with the picture.
 * @param editor The editor.
 * @param op The operation.
 */
function reorient(editor: UmbraDesktopImageEditorElement, op: (state: EditorState) => EditorState): void {
  const state = editor.state;
  if (!state) return;
  const draft = editor.cropDraft ?? whole(state);
  const turnedDraft = op({ ...state, crop: draft }).crop;
  editor.apply(op(state));
  editor.cropDraft = turnedDraft;
  placeFrame(editor);
}

/**
 * Choose a ratio, or turn a fixed one the other way, and fit the frame to it.
 * @param editor The editor.
 * @param change What changed.
 */
function chooseRatio(editor: UmbraDesktopImageEditorElement, change: Partial<CropSettings>): void {
  Object.assign(settings(editor), change);
  setDraft(editor, editor.cropDraft ?? whole(editor.state!));
  editor.requestUpdate();
}

/**
 * Crop mode (design §4.1). The frame is a draft until it is applied: Apply crop, Enter or another
 * mode applies it as one step, Escape or Reset throws it away. Rotate and flip apply at once.
 */
export const cropMode: ModeModule = {
  enter(editor) {
    const stage = editor.stage;
    const state = editor.state;
    if (!stage || !state) return;
    // The frame starts from the crop applied each time: the mode is entered after every change to
    // the history, and anything pending was applied when the mode was last left, so a frame kept
    // from before would describe a picture that has since been turned or undone.
    editor.cropDraft = state.crop ? { ...state.crop } : whole(state);
    let frame = cropFrameOf(editor);
    if (!frame) {
      frame = new CropFrame({
        originX: 'left',
        originY: 'top',
        fill: 'transparent',
        stroke: undefined,
        strokeWidth: 0,
        lockRotation: true,
        objectCaching: false,
        hasBorders: false,
        transparentCorners: false,
        cornerColor: FRAME_LINE,
        cornerStrokeColor: 'rgba(0, 0, 0, 0.6)',
        cornerSize: 14,
        touchCornerSize: 28,
        cornerStyle: 'rect',
        padding: 0,
      });
      frame.setControlsVisibility({ mtr: false });
      stage.canvas.add(frame);
      stage.canvas.on('object:moving', onMoving);
      stage.canvas.on('object:scaling', onMoving);
      stage.canvas.on('object:modified', onModified);
      frameEditors.set(stage.canvas, editor);
    }
    // Over the marks and regions, which the editor puts on the canvas before the mode is entered.
    stage.canvas.bringObjectToFront(frame);
    placeFrame(editor);
    stage.canvas.setActiveObject(frame);
  },

  leave(editor) {
    applyDraft(editor);
    const frame = cropFrameOf(editor);
    const stage = editor.stage;
    if (frame && stage) {
      stage.canvas.remove(frame);
      stage.canvas.off('object:moving', onMoving);
      stage.canvas.off('object:scaling', onMoving);
      stage.canvas.off('object:modified', onModified);
    }
    editor.cropDraft = null;
  },

  key(editor, event) {
    if (event.key === 'Enter') {
      applyDraft(editor);
      return true;
    }
    if (event.key === 'Escape') {
      discardDraft(editor);
      return true;
    }
    return false;
  },

  overlay(editor) {
    const stage = editor.stage;
    const draft = editor.cropDraft;
    const state = editor.state;
    if (!stage || !draft || !state) return html``;
    const below = stage.toScreen({ x: draft.x + draft.w / 2, y: draft.y + draft.h });
    const above = stage.toScreen({ x: draft.x + draft.w / 2, y: draft.y });
    // Under the frame, or over its bottom edge when the frame runs past the canvas, and never off it:
    // the size is what Apply crop will make, and must stay readable whatever the zoom.
    const view = stage.viewport;
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
    const labelX = clamp(below.x, LABEL_HALF_WIDTH + LABEL_GAP, view.w - LABEL_HALF_WIDTH - LABEL_GAP);
    const labelY = clamp(
      below.y + LABEL_GAP + LABEL_HEIGHT <= view.h - LABEL_GAP ? below.y + LABEL_GAP : below.y - LABEL_GAP - LABEL_HEIGHT,
      Math.max(LABEL_GAP, above.y + LABEL_GAP),
      view.h - LABEL_GAP - LABEL_HEIGHT,
    );
    const focal = editor.focalPoint
      ? stage.toScreen(orientPoint(state, { x: editor.focalPoint.left * state.source.w, y: editor.focalPoint.top * state.source.h }))
      : null;
    return html`<span class="crop-size" style="left: ${labelX}px; top: ${labelY}px"
        >${editor.words('dimensions', draft.w, draft.h)}</span
      >${focal
        ? html`<span class="focal" style="left: ${focal.x}px; top: ${focal.y}px" title=${editor.words('focalPoint')}></span>`
        : nothing}`;
  },

  panel(editor) {
    const { ratio, orientation } = settings(editor);
    const fixed = ratio !== 'free';
    const square = (command: string, icon: string, label: WordKey, action: () => void, mirrored = false): TemplateResult =>
      html`<button
        type="button"
        class="square"
        data-command=${command}
        title=${editor.words(label)}
        aria-label=${editor.words(label)}
        @click=${action}>
        <umb-icon name=${icon} style=${mirrored ? 'transform: scaleX(-1)' : ''}></umb-icon>
      </button>`;
    return html`
      <section class="box">
        <h4>${editor.words('aspectRatio')}</h4>
        <div class="row ratios">
          ${RATIOS.map(
            (item) => html`<button
              type="button"
              data-command="ratio-${item.choice}"
              aria-pressed=${ratio === item.choice ? 'true' : 'false'}
              @click=${() => chooseRatio(editor, { ratio: item.choice })}>
              ${item.label ? editor.words(item.label) : item.text}
            </button>`,
          )}
        </div>
        <div class="segmented">
          ${(['portrait', 'landscape'] as const).map(
            (way) => html`<button
              type="button"
              data-command="orientation-${way}"
              aria-pressed=${fixed && orientation === way ? 'true' : 'false'}
              ?disabled=${!fixed || ratio === '1:1'}
              @click=${() => chooseRatio(editor, { orientation: way })}>
              ${editor.words(way)}
            </button>`,
          )}
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('rotateFlip')}</h4>
        <div class="row">
          ${square('rotate-left', 'icon-refresh', 'rotateLeft', () => reorient(editor, (s) => rotate(s, 'left')), true)}
          ${square('rotate-right', 'icon-refresh', 'rotateRight', () => reorient(editor, (s) => rotate(s, 'right')))}
          ${square('flip-h', 'icon-navigation-horizontal', 'flipHorizontal', () => reorient(editor, (s) => flip(s, 'h')))}
          ${square('flip-v', 'icon-navigation-vertical', 'flipVertical', () => reorient(editor, (s) => flip(s, 'v')))}
        </div>
      </section>
      <section class="box">
        <h4>${editor.words('focalPoint')}</h4>
        <p class="focal-note"><umb-icon name="icon-crosshair"></umb-icon> ${editor.words('focalNote')}</p>
      </section>
      <div class="actions">
        <button type="button" data-command="crop-reset" @click=${() => discardDraft(editor)}>${editor.words('reset')}</button>
        <button type="button" class="primary" data-command="crop-apply" @click=${() => applyDraft(editor)}>
          ${editor.words('applyCrop')}
        </button>
      </div>
    `;
  },
};

/** Which editor a stage's canvas belongs to, for the canvas's event handlers. */
const frameEditors = new WeakMap<object, UmbraDesktopImageEditorElement>();

/**
 * The frame is moving or being resized: follow it.
 * @param event Fabric's event.
 */
function onMoving(this: unknown, event: Partial<TPointerEventInfo> & { target?: unknown }): void {
  const target = event.target as CropFrame | undefined;
  const editor = target?.canvas ? frameEditors.get(target.canvas) : undefined;
  if (editor && target instanceof CropFrame) {
    frameMoved(editor, false);
    editor.requestUpdate();
  }
}

/**
 * The frame was let go: hold it inside and to the ratio.
 * @param event Fabric's event.
 */
function onModified(this: unknown, event: { target?: unknown }): void {
  const target = event.target as CropFrame | undefined;
  const editor = target?.canvas ? frameEditors.get(target.canvas) : undefined;
  if (editor && target instanceof CropFrame) {
    frameMoved(editor, true);
    editor.requestUpdate();
  }
}

/** Crop's overlay styles: the size label under the frame, and the focal point. */
export const cropOverlayStyles = css`
  .crop-size {
    position: absolute;
    transform: translateX(-50%);
    box-sizing: border-box;
    height: ${LABEL_HEIGHT}px;
    max-width: ${LABEL_HALF_WIDTH * 2}px;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: ${LABEL_HEIGHT}px;
    padding: 0 8px;
    font-size: 12px;
    white-space: nowrap;
    color: var(--umbradesktop-app-accent-text, var(--uui-color-surface));
    background: var(--umbradesktop-app-accent, var(--uui-color-selected));
    border-radius: var(--umbradesktop-app-radius, 3px);
  }

  .focal {
    position: absolute;
    width: 26px;
    height: 26px;
    margin: -13px 0 0 -13px;
    border-radius: 50%;
    border: 3px solid #fff;
    box-shadow:
      0 0 0 2px rgba(0, 0, 0, 0.6),
      inset 0 0 0 2px rgba(0, 0, 0, 0.6);
  }
`;
