import { FabricImage } from 'fabric';
import type { Canvas, FabricObject } from 'fabric';
import { adjustMatrix, applyMatrix, isIdentity } from './adjust.js';
import { redact, redactionBlock } from './redact.js';
import { orientedSize } from './state.js';
import type { Point, Region } from './state.js';
import type { UmbraDesktopImageEditorElement } from './image-editor.element.js';

/**
 * Redaction regions on the canvas: each one an image of its own redacted pixels, drawn over the
 * picture where the region is, so the view shows the redaction live while the region stays an
 * object that moves and resizes (design §4.1).
 *
 * The pixels come from the view's own drawing of the picture, adjusted on the CPU with the same
 * matrix the GPU filter uses so the region matches what is round it, then redacted with the same
 * function the saved file is redacted with, at the view's resolution. The saved file redacts the
 * full-resolution picture again (`render.ts`); this is only what the person sees.
 */

/** What a region object remembers: the region it shows, and the crop offset it was drawn at. */
interface RegionOrigin {
  /** The region. */
  region: Region;
  /** The offset its coordinates are less. */
  offset: Point;
}

/** Each region object's origin. */
const ORIGINS = new WeakMap<FabricObject, RegionOrigin>();

/** Whether regions are being put back on the canvas, which removes and selects objects of its own. */
let syncing = false;

/**
 * Whether a selection event comes from putting the regions back rather than from the person.
 * @returns True while {@link syncRegions} runs.
 */
export function isSyncingRegions(): boolean {
  return syncing;
}

/**
 * The region an object shows now, after whatever was done to it on the canvas.
 * @param object A region object.
 * @param offset Where the view's world starts in oriented space now.
 * @returns The region, in whole pixels, or undefined for any other object.
 */
export function regionFromObject(object: FabricObject, offset: Point): Region | undefined {
  const origin = ORIGINS.get(object);
  if (!origin) return undefined;
  return {
    ...origin.region,
    rect: {
      x: Math.round(object.left + offset.x),
      y: Math.round(object.top + offset.y),
      w: Math.max(1, Math.round(object.width * object.scaleX)),
      h: Math.max(1, Math.round(object.height * object.scaleY)),
    },
  };
}

/**
 * The region id an object shows.
 * @param object A canvas object.
 * @returns The id, or undefined.
 */
export function regionIdOf(object: FabricObject): string | undefined {
  return ORIGINS.get(object)?.region.id;
}

/**
 * The region objects on the editor's canvas.
 * @param editor The editor.
 * @returns The objects, in drawing order.
 */
export function regionObjectsOf(editor: UmbraDesktopImageEditorElement): FabricImage[] {
  return (editor.stage?.canvas.getObjects().filter((object) => ORIGINS.has(object)) ?? []) as FabricImage[];
}

/**
 * A region's redacted pixels, from the view's picture.
 * @param editor The editor.
 * @param region The region.
 * @param offset The crop offset.
 * @returns A canvas of the region at the view's resolution, or undefined without a picture.
 */
function redactedPixels(editor: UmbraDesktopImageEditorElement, region: Region, offset: Point): HTMLCanvasElement | undefined {
  const stage = editor.stage;
  const state = editor.state;
  const base = stage?.base;
  if (!stage || !state || !base) return undefined;
  const scale = stage.baseScale;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.rect.w * scale));
  canvas.height = Math.max(1, Math.round(region.rect.h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(base, -(region.rect.x - offset.x) * scale, -(region.rect.y - offset.y) * scale);
  const matrix = adjustMatrix(state.adjust);
  if (!isIdentity(matrix)) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyMatrix(pixels.data, matrix);
    ctx.putImageData(pixels, 0, 0);
  }
  const block = redactionBlock(orientedSize(state.source, state.rotation), region.strength) * scale;
  redact(ctx, { x: 0, y: 0, w: canvas.width, h: canvas.height }, region.style, block);
  return canvas;
}

/**
 * Put the document's regions on the canvas as redacted images, replacing the ones there.
 * @param editor The editor.
 * @param interactive Whether they can be selected, moved and resized.
 * @param selectedId A region to select again.
 */
export function syncRegions(editor: UmbraDesktopImageEditorElement, interactive: boolean, selectedId?: string): void {
  const canvas = editor.stage?.canvas as Canvas | undefined;
  const state = editor.state;
  if (!canvas || !state) return;
  syncing = true;
  try {
    for (const object of regionObjectsOf(editor)) canvas.remove(object);
    const offset = editor.worldOffset;
    let selected: FabricObject | undefined;
    // Regions go under the marks, as the saved file redacts before it marks up.
    let index = canvas.getObjects().findIndex((object) => !(object instanceof FabricImage) || ORIGINS.has(object));
    if (index < 0) index = canvas.getObjects().length;
    for (const region of state.regions) {
      const pixels = redactedPixels(editor, region, offset);
      if (!pixels) continue;
      const object = new FabricImage(pixels, {
        left: region.rect.x - offset.x,
        top: region.rect.y - offset.y,
        originX: 'left',
        originY: 'top',
        scaleX: region.rect.w / pixels.width,
        scaleY: region.rect.h / pixels.height,
        lockRotation: true,
        selectable: interactive,
        evented: interactive,
        hoverCursor: interactive ? 'move' : 'default',
        transparentCorners: false,
        cornerSize: 12,
        touchCornerSize: 28,
        objectCaching: false,
      });
      object.setControlsVisibility({ mtr: false });
      ORIGINS.set(object, { region, offset: { ...offset } });
      canvas.insertAt(index++, object);
      if (region.id === selectedId) selected = object;
    }
    if (selected) canvas.setActiveObject(selected);
    canvas.requestRenderAll();
  } finally {
    syncing = false;
  }
}
