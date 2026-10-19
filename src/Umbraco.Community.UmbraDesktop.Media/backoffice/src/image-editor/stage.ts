import { Canvas, FabricImage, Point, Rect, config, filters } from 'fabric';
import type { Point as XY, Size } from './state.js';
import { MAX_ZOOM, MIN_ZOOM, fitZoom } from './geometry.js';

/** Space left round a fitted picture, in px, so its edge and the crop handles are never under the panel's edge. */
export const FIT_PADDING = 24;

/**
 * The largest picture side the view draws, in px: Fabric's own texture size, which its WebGL filters
 * work within. Left at Fabric's 4096 rather than raised to the GPU's limit: Fabric's filter backend
 * keeps one square canvas of this size for the page's whole life, 64 MB at 4096 and 256 MB at 8192,
 * and a view of a large photo needs no more, since the saved file is drawn on the CPU at full size
 * (`render.ts`). Found by review, 2026-10-17.
 */
export const VIEW_TEXTURE_LIMIT = config.textureSize;

/**
 * The editing view: a Fabric canvas filling the editor's canvas area, showing the picture with its
 * live adjustment, zoomed and panned, with the modes' own objects (the crop frame, marks, regions)
 * on top of it.
 *
 * **Two units.** The canvas's world is the picture's pixels in the space the editor shows (the whole
 * turned picture in Crop, the cropped picture otherwise), so a mark's position is a picture pixel
 * whatever the zoom. The zoom people see is against the picture as it will be saved, which after a
 * resize is a different number of pixels; `outPerWorld` converts, so 100% is one saved pixel per
 * screen pixel in every mode.
 *
 * Built imperatively into a container the element renders empty, because Fabric wraps its canvas in
 * elements of its own and Lit must not own them.
 */
export class Stage {
  /** The Fabric canvas. */
  readonly canvas: Canvas;

  /** The element it fills. */
  readonly #container: HTMLElement;

  /** The picture, adjusted live. */
  #image?: FabricImage;

  /** The picture unadjusted, under the adjusted one, for Split view; hidden otherwise. */
  #original?: FabricImage;

  /** The world's size, in picture pixels. */
  #world: Size = { w: 1, h: 1 };

  /** The picture as drawn for the view, unadjusted, for anything that redraws part of it (a region). */
  #base?: HTMLCanvasElement;

  /** Saved pixels per world pixel. */
  #outPerWorld = 1;

  /** Whether the view is at Fit, so a resize of the window fits again. */
  #fitted = true;

  /** Watches the container's size. */
  readonly #observer: ResizeObserver;

  /** Pointers down for panning or pinching, by id. */
  readonly #pointers = new Map<number, XY>();

  /** What the view shows instead of, or beside, the adjusted picture. */
  #compare: 'none' | 'original' | 'split' = 'none';

  /** Where Split view's line is, as a share of the world's width. */
  #split = 0.5;

  /** Whether Space is held, which turns a drag into a pan. */
  panning = false;

  /** Told whenever the zoom or the pan changes, so the editor can redraw its status bar and overlays. */
  onChange?: () => void;

  /** @param container The element to fill. */
  constructor(container: HTMLElement) {
    this.#container = container;
    const element = document.createElement('canvas');
    container.appendChild(element);
    const { w: width, h: height } = this.viewport;
    this.canvas = new Canvas(element, {
      width,
      height,
      selection: false,
      preserveObjectStacking: true,
      enableRetinaScaling: true,
      allowTouchScrolling: false,
      // Pointer events, not Fabric's default of mouse events plus touch events: a finger, a pen and a
      // mouse then take one path through every tool, which is what lets the big targets the design
      // chose for touch extend to the canvas. Found when a test drove a drag with the pointer events a
      // browser sends and Fabric heard none of them.
      enablePointerEvents: true,
      fireRightClick: false,
      stopContextMenu: true,
    });
    this.#observer = new ResizeObserver(() => this.#resize());
    this.#observer.observe(container);
    container.addEventListener('wheel', this.#onWheel, { passive: false });
    container.addEventListener('pointerdown', this.#onPointerDown, { capture: true });
  }

  /** @returns The container's size, in CSS px, at least a pixel. */
  get viewport(): Size {
    return { w: Math.max(1, this.#container.clientWidth), h: Math.max(1, this.#container.clientHeight) };
  }

  /** @returns The world's size. */
  get world(): Size {
    return this.#world;
  }

  /** @returns The zoom people see: screen pixels per saved pixel. */
  get zoom(): number {
    return this.canvas.viewportTransform[0] / this.#outPerWorld;
  }

  /** @returns Whether the view is at Fit. */
  get fitted(): boolean {
    return this.#fitted;
  }

  /**
   * Show a picture.
   * @param base The picture drawn for the view, at any resolution; it is stretched to the world.
   * @param world The world's size, in picture pixels.
   * @param outPerWorld Saved pixels per world pixel.
   * @param refit Whether to fit it; otherwise the zoom and pan are kept.
   */
  setView(base: HTMLCanvasElement, world: Size, outPerWorld: number, refit: boolean): void {
    const changedWorld = world.w !== this.#world.w || world.h !== this.#world.h;
    this.#world = { ...world };
    this.#base = base;
    this.#outPerWorld = outPerWorld;
    const make = () =>
      new FabricImage(base, {
        left: 0,
        top: 0,
        originX: 'left',
        originY: 'top',
        scaleX: world.w / base.width,
        scaleY: world.h / base.height,
        selectable: false,
        evented: false,
        objectCaching: false,
      });
    const filtersBefore = this.#image?.filters ?? [];
    // Disposed as well as removed: Fabric keeps a filtered image's GPU texture until the image is
    // disposed, so a view redrawn while an adjustment shows would otherwise strand one each time.
    for (const old of [this.#image, this.#original]) {
      if (!old) continue;
      this.canvas.remove(old);
      old.dispose();
    }
    this.#original = make();
    this.#original.visible = false;
    this.#image = make();
    this.canvas.insertAt(0, this.#original, this.#image);
    if (filtersBefore.length) {
      this.#image.filters = filtersBefore;
      this.#image.applyFilters();
    }
    if (this.#compare !== 'none') this.setCompare(this.#compare, this.#split);
    if (refit || changedWorld || this.#fitted) this.fit();
    else this.canvas.requestRenderAll();
  }

  /** @returns What the view compares: nothing, the original alone, or the two split. */
  get compare(): 'none' | 'original' | 'split' {
    return this.#compare;
  }

  /** @returns The picture as drawn for the view, unadjusted, or undefined before one is shown. */
  get base(): HTMLCanvasElement | undefined {
    return this.#base;
  }

  /** @returns The view picture's pixels per world pixel. */
  get baseScale(): number {
    return this.#base ? this.#base.width / this.#world.w : 1;
  }

  /** @returns Whether a picture is showing. */
  get hasPicture(): boolean {
    return !!this.#image;
  }

  /** Take the picture away, for a file that could not be opened over nothing. */
  clear(): void {
    this.canvas.clear();
    this.#base = undefined;
    this.#image = undefined;
    this.#original = undefined;
  }

  /**
   * The live adjustment, through Fabric's ColorMatrix filter, on the GPU where there is one.
   * @param matrix The 20 numbers, or null for none.
   * @returns How long applying it took, in ms.
   */
  setFilter(matrix: number[] | null): number {
    if (!this.#image) return 0;
    const started = performance.now();
    this.#image.filters = matrix ? [new filters.ColorMatrix({ matrix, colorsOnly: true })] : [];
    this.#image.applyFilters();
    this.canvas.requestRenderAll();
    return performance.now() - started;
  }

  /**
   * Show the original instead of the adjusted picture (Hold to compare), or the two side by side
   * with the adjusted one from `split` across (Split view), or neither.
   * @param mode What to show.
   * @param split For Split view, where the line is, as a share of the world's width.
   */
  setCompare(mode: 'none' | 'original' | 'split', split = 0.5): void {
    this.#compare = mode;
    this.#split = split;
    if (!this.#image || !this.#original) return;
    this.#original.visible = mode !== 'none';
    this.#image.visible = mode !== 'original';
    if (mode === 'split') {
      // The adjusted picture is clipped to the right of the line, in its own units.
      const width = this.#image.width ?? 1;
      const height = this.#image.height ?? 1;
      this.#image.clipPath = splitClip(width, height, width * split);
    } else {
      this.#image.clipPath = undefined;
    }
    this.#image.dirty = true;
    this.canvas.requestRenderAll();
  }

  /**
   * Zoom to a level, round a point on the screen (the pointer, for the wheel) or the centre.
   * @param zoom The level people see.
   * @param around The screen point to keep still, in container px.
   */
  setZoom(zoom: number, around?: XY): void {
    const level = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    const { w, h } = this.viewport;
    const at = around ?? { x: w / 2, y: h / 2 };
    this.canvas.zoomToPoint(new Point(at.x, at.y), level * this.#outPerWorld);
    this.#fitted = false;
    this.#changed();
  }

  /** Fit the picture into the view, never above 100%, centred. */
  fit(): void {
    const { w, h } = this.viewport;
    const out = { w: this.#world.w * this.#outPerWorld, h: this.#world.h * this.#outPerWorld };
    const zoom = fitZoom(out, { w: Math.max(1, w - FIT_PADDING * 2), h: Math.max(1, h - FIT_PADDING * 2) });
    const scale = zoom * this.#outPerWorld;
    this.canvas.setViewportTransform([scale, 0, 0, scale, (w - this.#world.w * scale) / 2, (h - this.#world.h * scale) / 2]);
    this.#fitted = true;
    this.#changed();
  }

  /**
   * Move the view.
   * @param dx Across, in screen px.
   * @param dy Down, in screen px.
   */
  panBy(dx: number, dy: number): void {
    this.canvas.relativePan(new Point(dx, dy));
    this.#fitted = false;
    this.#changed();
  }

  /**
   * Where a world point is on the screen, in container px.
   * @param point The world point.
   * @returns The screen point.
   */
  toScreen(point: XY): XY {
    const [a, , , d, e, f] = this.canvas.viewportTransform;
    return { x: point.x * a + e, y: point.y * d + f };
  }

  /** Stop watching and free the canvas. */
  dispose(): void {
    this.#observer.disconnect();
    this.#container.removeEventListener('wheel', this.#onWheel);
    this.#container.removeEventListener('pointerdown', this.#onPointerDown, { capture: true });
    void this.canvas.dispose();
  }

  /** The container changed size: the canvas follows, and a fitted view fits again. */
  #resize(): void {
    const { w, h } = this.viewport;
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.setDimensions({ width: w, height: h });
    if (this.#fitted && this.#image) this.fit();
    else this.#changed();
  }

  /** Tell the editor, and draw. */
  #changed(): void {
    this.canvas.requestRenderAll();
    this.onChange?.();
  }

  /**
   * The wheel: with Ctrl (and a trackpad pinch, which the browser reports as Ctrl and the wheel) it
   * zooms round the pointer; without, it pans, as the Photos apps and Figma do.
   * @param event The wheel event.
   */
  #onWheel = (event: WheelEvent) => {
    if (!this.#image) return;
    event.preventDefault();
    const box = this.#container.getBoundingClientRect();
    if (event.ctrlKey) {
      this.setZoom(this.zoom * Math.exp(-event.deltaY / 300), { x: event.clientX - box.left, y: event.clientY - box.top });
    } else {
      this.panBy(-event.deltaX, -event.deltaY);
    }
  };

  /**
   * A pointer went down: with Space held, the middle button, or a second finger, the view pans (and
   * two fingers pinch), and Fabric is kept out of it for the rest of the gesture.
   * @param event The pointer event.
   */
  #onPointerDown = (event: PointerEvent) => {
    if (!this.#image) return;
    const touches = event.pointerType === 'touch' ? this.#pointers.size + 1 : 0;
    const pans = this.panning || event.button === 1 || touches >= 2;
    if (!pans && event.pointerType !== 'touch') return;
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pans) {
      // One finger is Fabric's (a drag, a draw), but it is remembered until it lifts, so a second
      // finger landing meanwhile is known to be the second and starts a pinch.
      const lifted = (ended: PointerEvent) => {
        if (ended.pointerId !== event.pointerId) return;
        this.#pointers.delete(ended.pointerId);
        window.removeEventListener('pointerup', lifted, true);
        window.removeEventListener('pointercancel', lifted, true);
      };
      window.addEventListener('pointerup', lifted, true);
      window.addEventListener('pointercancel', lifted, true);
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.canvas.skipTargetFind = true;
    const move = (moved: PointerEvent) => {
      const before = this.#pointers.get(moved.pointerId);
      if (!before) return;
      const others = [...this.#pointers.entries()].filter(([id]) => id !== moved.pointerId).map(([, point]) => point);
      if (others.length === 1) {
        const other = others[0];
        const distance = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const box = this.#container.getBoundingClientRect();
        const centre = { x: (moved.clientX + other.x) / 2 - box.left, y: (moved.clientY + other.y) / 2 - box.top };
        this.setZoom(this.zoom * (distance({ x: moved.clientX, y: moved.clientY }, other) / distance(before, other)), centre);
        this.panBy((moved.clientX - before.x) / 2, (moved.clientY - before.y) / 2);
      } else {
        this.panBy(moved.clientX - before.x, moved.clientY - before.y);
      }
      this.#pointers.set(moved.pointerId, { x: moved.clientX, y: moved.clientY });
    };
    const up = (ended: PointerEvent) => {
      this.#pointers.delete(ended.pointerId);
      if (this.#pointers.size) return;
      this.canvas.skipTargetFind = false;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };
}

/**
 * Split view's clip: the right of the line, in an image's own coordinates, which Fabric centres on
 * the image.
 * @param width The image's width.
 * @param height Its height.
 * @param from Where the line is, from the left.
 * @returns The clip.
 */
function splitClip(width: number, height: number, from: number): Rect {
  return new Rect({ left: from - width / 2, top: -height / 2, width: Math.max(0, width - from), height, originX: 'left', originY: 'top' });
}
