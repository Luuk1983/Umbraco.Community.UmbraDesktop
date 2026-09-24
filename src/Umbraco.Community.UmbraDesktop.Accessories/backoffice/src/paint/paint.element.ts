import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { downloadBlob } from '../shared/download.js';
import {
  PAINT_BRUSH_SIZES,
  PAINT_CANVAS_SIZE,
  PAINT_PADDING_PX,
  PAINT_PALETTE,
  PAINT_PALETTE_COLUMNS,
  PAINT_SWATCH_PX,
  PAINT_TOOLBAR_HEIGHT_PX,
  PAINT_UNDO_DEPTH,
  PAINT_WELL_PADDING_PX,
} from './constants.js';
import { floodFill, linePoints, parseColour, stamp } from './raster.js';
import { css, customElement, html, property, query, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UMB_DISCARD_CHANGES_MODAL, umbOpenModal } from '@umbraco-cms/backoffice/modal';

/** The tools, in toolbar order. */
type PaintTool = 'pencil' | 'brush' | 'eraser' | 'fill';

/**
 * Each tool's toolbar label, as a localisation key and its English fallback, and its icon. The icons
 * are Umbraco's own, so they match the rest of the backoffice under every theme.
 */
const TOOLS: Record<PaintTool, { term: string; fallback: string; icon: string }> = {
  pencil: { term: 'paintPencil', fallback: 'Pencil', icon: 'icon-edit' },
  brush: { term: 'paintBrush', fallback: 'Brush', icon: 'icon-brush' },
  eraser: { term: 'paintEraser', fallback: 'Eraser', icon: 'icon-clear-formatting' },
  fill: { term: 'paintFill', fallback: 'Fill', icon: 'icon-color-bucket' },
};

/**
 * Paint, as a self-contained UmbraDesktop app: a pencil, a brush, an eraser and a bucket, MS Paint's
 * palette, Undo, and Save as PNG.
 *
 * The picture is a fixed-size canvas of white paper, and it stays white under every theme, because
 * the paper is the document and not the chrome: a dark theme should not turn someone's drawing
 * black. Everything round it is the theme's.
 *
 * The pixels are set by `raster.ts` rather than by canvas strokes, which is what keeps them aliased
 * and so what makes the bucket fill cleanly up to a line (see that module). The element owns one
 * `ImageData`, changes it through those functions, and puts it back on the canvas after each change.
 *
 * Saving is a download, as it is in Notepad: nothing reaches the server or the media library.
 */
@customElement('umbradesktop-paint')
export class PaintElement extends UmbLitElement {
  /** How a saved picture reaches the person. A browser download unless a test says otherwise. */
  @property({ attribute: false })
  download: (blob: Blob, name: string) => void | Promise<void> = downloadBlob;

  /**
   * Ask whether an unsaved picture may be thrown away. Umbraco's own discard-changes dialog unless a
   * test says otherwise, as in Notepad.
   */
  @property({ attribute: false })
  confirmDiscard: () => Promise<boolean> = async () => {
    try {
      await umbOpenModal(this, UMB_DISCARD_CHANGES_MODAL);
      return true;
    } catch {
      return false;
    }
  };

  /** The tool in hand. */
  @state()
  private _tool: PaintTool = 'pencil';

  /** The brush and eraser size, in pixels. */
  @state()
  private _size: number = PAINT_BRUSH_SIZES[1];

  /** What the left button paints. */
  @state()
  private _foreground = '#000000';

  /** What the right button and the eraser paint. */
  @state()
  private _background = '#ffffff';

  /** How many strokes Undo can take back, for the button's disabled state. */
  @state()
  private _undoDepth = 0;

  /** Whether anything has been drawn since the picture was last saved or started. */
  #dirty = false;

  /** The picture. */
  @query('canvas')
  private _canvas!: HTMLCanvasElement;

  /** The picture's pixels, the one copy the tools change. Created on first render. */
  #image?: ImageData;

  /** Copies of the picture from before each stroke, newest last. */
  #history: ImageData[] = [];

  /** The stroke in progress: its last point and its colour. Undefined between strokes. */
  #stroke?: { x: number; y: number; colour: string };

  /** Listen for Ctrl+Z. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKeyDown);
  }

  /** Stop listening. The whole of teardown: there is no timer here. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /** Lay down the white paper once the canvas exists. */
  override firstUpdated(): void {
    this.#blank();
  }

  /** The canvas's 2D context. Never null for a 2D canvas that is attached. */
  get #context(): CanvasRenderingContext2D {
    return this._canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** Replace the picture with white paper and forget its history. */
  #blank(): void {
    const context = this.#context;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PAINT_CANVAS_SIZE.w, PAINT_CANVAS_SIZE.h);
    this.#image = context.getImageData(0, 0, PAINT_CANVAS_SIZE.w, PAINT_CANVAS_SIZE.h);
    this.#history = [];
    this._undoDepth = 0;
    this.#dirty = false;
  }

  /** Put the pixels back on the canvas after a change. */
  #paint(): void {
    if (this.#image) this.#context.putImageData(this.#image, 0, 0);
  }

  /** Keep a copy of the picture as it is, so the stroke about to happen can be undone. */
  #remember(): void {
    if (!this.#image) return;
    this.#history.push(new ImageData(new Uint8ClampedArray(this.#image.data), this.#image.width, this.#image.height));
    if (this.#history.length > PAINT_UNDO_DEPTH) this.#history.shift();
    this._undoDepth = this.#history.length;
  }

  /** Take the last stroke back. */
  undo(): void {
    const previous = this.#history.pop();
    if (!previous) return;
    this.#image = previous;
    this._undoDepth = this.#history.length;
    this.#paint();
  }

  /** Start a new picture, asking first if the current one has unsaved strokes. */
  async newPicture(): Promise<void> {
    if (this.#dirty && !(await this.confirmDiscard())) return;
    this.#blank();
  }

  /** Hand the picture to the person as a PNG. */
  async save(): Promise<void> {
    const blob = await new Promise<Blob | null>((resolve) => this._canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    await this.download(blob, `${this.#term('paintUntitled', 'Untitled')}.png`);
    this.#dirty = false;
  }

  /**
   * Ctrl+Z (or Cmd+Z) is Undo, claimed so the browser does not try to undo something of its own.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    if (event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    this.undo();
  };

  /**
   * Where a pointer event lands on the picture, in picture pixels. The canvas is drawn at its own
   * size today, but reading the scale off its box keeps this right if a later stylesheet zooms it.
   * @param event The pointer event.
   * @returns The pixel under the pointer.
   */
  #pointAt(event: PointerEvent): { x: number; y: number } {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) * this._canvas.width) / rect.width),
      y: Math.floor(((event.clientY - rect.top) * this._canvas.height) / rect.height),
    };
  }

  /** The brush's edge for the tool in hand: one for the pencil, the chosen size otherwise. */
  get #brush(): number {
    return this._tool === 'pencil' ? 1 : this._size;
  }

  /**
   * Begin a stroke, or fill.
   *
   * The left button paints the foreground and the right the background, as in MS Paint. The eraser
   * paints the background whichever button it is, which is what an eraser on paper does.
   * @param event The pointerdown.
   */
  #onPointerDown(event: PointerEvent): void {
    if (!this.#image || (event.button !== 0 && event.button !== 2)) return;
    const { x, y } = this.#pointAt(event);
    const colour = this._tool === 'eraser' || event.button === 2 ? this._background : this._foreground;
    this.#remember();
    this.#dirty = true;
    if (this._tool === 'fill') {
      floodFill(this.#image, x, y, parseColour(colour));
      this.#paint();
      return;
    }
    try {
      this._canvas.setPointerCapture(event.pointerId);
    } catch {
      // A synthetic pointer, or one the browser has already released. The stroke still draws.
    }
    this.#stroke = { x, y, colour };
    stamp(this.#image, x, y, this.#brush, parseColour(colour));
    this.#paint();
  }

  /**
   * Continue a stroke to the pointer, joining the gap since the last event with a line so a quick
   * drag does not draw a dotted one.
   * @param event The pointermove.
   */
  #onPointerMove(event: PointerEvent): void {
    if (!this.#stroke || !this.#image) return;
    const { x, y } = this.#pointAt(event);
    const colour = parseColour(this.#stroke.colour);
    for (const [px, py] of linePoints(this.#stroke.x, this.#stroke.y, x, y)) stamp(this.#image, px, py, this.#brush, colour);
    this.#stroke = { ...this.#stroke, x, y };
    this.#paint();
  }

  /** End the stroke. */
  #onPointerUp(): void {
    this.#stroke = undefined;
  }

  /**
   * One word from this package's dictionary.
   * @param key The key inside the area.
   * @param fallback The English, shown if the dictionary has not loaded.
   * @returns The localised string.
   */
  #term(key: string, fallback: string): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback);
  }

  /**
   * One palette swatch. Left click picks the foreground and right click the background.
   * @param colour The swatch's colour.
   * @returns Its button.
   */
  #renderSwatch(colour: string) {
    return html`<button
      class="swatch"
      data-colour=${colour}
      style="background: ${colour}"
      aria-label=${colour}
      aria-pressed=${colour === this._foreground ? 'true' : 'false'}
      @click=${() => (this._foreground = colour)}
      @contextmenu=${(event: Event) => {
        event.preventDefault();
        this._background = colour;
      }}
    ></button>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, the picture in its well, and the palette.
   */
  override render() {
    const sized = this._tool === 'brush' || this._tool === 'eraser';
    return html`
      <div class="toolbar">
        ${(Object.keys(TOOLS) as PaintTool[]).map((tool) => {
          const { term, fallback, icon } = TOOLS[tool];
          const label = this.#term(term, fallback);
          return html`<button
            class="control tool"
            data-tool=${tool}
            title=${label}
            aria-label=${label}
            aria-pressed=${this._tool === tool ? 'true' : 'false'}
            @click=${() => (this._tool = tool)}
          >
            <umb-icon name=${icon}></umb-icon>
          </button>`;
        })}
        <span class="separator"></span>
        ${PAINT_BRUSH_SIZES.map(
          (size) => html`<button
            class="control size"
            data-size=${size}
            ?disabled=${!sized}
            aria-label=${`${this.#term('paintSize', 'Size')} ${size}`}
            aria-pressed=${sized && this._size === size ? 'true' : 'false'}
            @click=${() => (this._size = size)}
          >
            <span class="dot" style="width: ${size + 2}px; height: ${size + 2}px"></span>
          </button>`,
        )}
        <span class="spacer"></span>
        <button class="control" data-action="undo" ?disabled=${this._undoDepth === 0} @click=${() => this.undo()}>
          ${this.#term('paintUndo', 'Undo')}
        </button>
        <button class="control" data-action="new" @click=${() => this.newPicture()}>
          ${this.#term('paintNew', 'New')}
        </button>
        <button class="control" data-action="save" @click=${() => this.save()}>
          ${this.#term('paintSave', 'Save')}
        </button>
      </div>
      <div class="well sunken">
        <canvas
          width=${PAINT_CANVAS_SIZE.w}
          height=${PAINT_CANVAS_SIZE.h}
          aria-label=${this.#term('paintCanvas', 'Picture')}
          @pointerdown=${this.#onPointerDown}
          @pointermove=${this.#onPointerMove}
          @pointerup=${this.#onPointerUp}
          @pointercancel=${this.#onPointerUp}
          @contextmenu=${(event: Event) => event.preventDefault()}
        ></canvas>
      </div>
      <div class="colours">
        <div
          class="current"
          role="img"
          aria-label=${`${this.#term('paintForeground', 'Foreground')} ${this._foreground}, ${this.#term('paintBackground', 'Background')} ${this._background}`}
        >
          <span class="chip background" style="background: ${this._background}"></span>
          <span class="chip foreground" style="background: ${this._foreground}"></span>
        </div>
        <div class="palette">${PAINT_PALETTE.map((colour) => this.#renderSwatch(colour))}</div>
      </div>
    `;
  }

  /**
   * The shared accessory look, plus the picture's well and the palette.
   *
   * The well scrolls and centres the picture, so a small window shows part of it and a maximized one
   * shows it whole in the middle, never a stretched copy: a stretched canvas would blur every pixel
   * the pencil set.
   */
  static override styles = [
    accessoryStyles,
    css`
      :host {
        padding: ${PAINT_PADDING_PX}px;
        gap: ${PAINT_PADDING_PX}px;
        height: 100%;
      }

      .toolbar {
        flex-wrap: nowrap;
        min-height: ${PAINT_TOOLBAR_HEIGHT_PX}px;
      }

      .toolbar .control {
        height: ${PAINT_TOOLBAR_HEIGHT_PX - 4}px;
      }

      .tool,
      .size {
        width: ${PAINT_TOOLBAR_HEIGHT_PX - 4}px;
        padding: 0;
      }

      .control[disabled] {
        opacity: 0.45;
        cursor: default;
      }

      .dot {
        display: block;
        background: currentColor;
      }

      .separator {
        width: 1px;
        align-self: stretch;
        margin: 4px 2px;
        background: var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      .spacer {
        flex: 1;
      }

      .well {
        flex: 1;
        min-height: 0;
        overflow: auto;
        display: grid;
        padding: ${PAINT_WELL_PADDING_PX}px;
      }

      /* Auto margins rather than place-content, so a picture larger than the well is pushed to the
         top-left and scrolls, where centring would clip its first rows and columns out of reach. */
      canvas {
        margin: auto;
        display: block;
        cursor: crosshair;
        touch-action: none;
        image-rendering: pixelated;
      }

      .colours {
        display: flex;
        align-items: center;
        gap: ${PAINT_PADDING_PX}px;
      }

      /* The foreground chip overlapping the background one, as MS Paint draws its current colours. */
      .current {
        position: relative;
        width: ${PAINT_SWATCH_PX * 2 + 2}px;
        height: ${PAINT_SWATCH_PX * 2 + 2}px;
        flex: none;
      }

      .chip {
        position: absolute;
        width: ${PAINT_SWATCH_PX + 4}px;
        height: ${PAINT_SWATCH_PX + 4}px;
        box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      .foreground {
        top: 0;
        left: 0;
      }

      .background {
        right: 0;
        bottom: 0;
      }

      .palette {
        display: grid;
        grid-template-columns: repeat(${PAINT_PALETTE_COLUMNS}, ${PAINT_SWATCH_PX}px);
        grid-auto-rows: ${PAINT_SWATCH_PX}px;
        gap: 2px;
      }

      /* A swatch is a colour, not a control face, so it keeps its own fill under every theme and
         takes only the theme's guaranteed boundary line round it. */
      .swatch {
        padding: 0;
        border: none;
        border-radius: 0;
        box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
        cursor: pointer;
      }

      .swatch[aria-pressed='true'] {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 1px;
      }

      .swatch:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 1px;
      }
    `,
  ];
}

export { PaintElement as element };

declare global {
  interface HTMLElementTagNameMap {
    /** Registered by the `@customElement` decorator above; declared so templates type-check. */
    'umbradesktop-paint': PaintElement;
  }
}
