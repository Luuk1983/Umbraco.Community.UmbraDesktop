import { accessoryStyles } from '../shared/styles.js';
import { AREA } from '../shared/area.js';
import { UNSAVED_ATTRIBUTE } from '../shared/unsaved.js';
import { editableImageType, fileNameFor } from '../shared/media-files.js';
import { createMediaOpener } from '../shared/media-open.js';
import type { MediaOpener } from '../shared/media-open.js';
import { createMediaSaver } from '../shared/media-save.js';
import type { MediaSaver } from '../shared/media-save.js';
import { UmbraDesktopAccessoriesSettingsController } from '../settings/settings.source.js';
import type { AccessoriesSettingsSource } from '../settings/settings.source.js';
import {
  PAINT_BRUSH_SIZES,
  PAINT_CANVAS_SIZE,
  PAINT_MAX_IMAGE_EDGE_PX,
  PAINT_PADDING_PX,
  PAINT_PALETTE,
  PAINT_PALETTE_COLUMNS,
  PAINT_STATUS_HEIGHT_PX,
  PAINT_SWATCH_PX,
  PAINT_TOOLBAR_HEIGHT_PX,
  PAINT_WELL_PADDING_PX,
  undoDepthFor,
} from './constants.js';
import { floodFill, linePoints, parseColour, stamp } from './raster.js';
import { css, customElement, html, nothing, property, query, state } from '@umbraco-cms/backoffice/external/lit';
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

/** A new picture's file type. */
const NEW_PICTURE_TYPE = 'image/png';

/**
 * Paint, as a self-contained UmbraDesktop app: a pencil, a brush, an eraser and a bucket, MS Paint's
 * palette and Undo, over images in the media library.
 *
 * **Every picture lives in the media library**, as in Notepad. Open picks an image there and puts it
 * on the canvas at its own size; Save writes it back over the same media item, in the format it came
 * in where a browser can write that format, so a JPEG stays a JPEG. A new picture is white paper at
 * the default size, saved as a PNG into the folder Desktop settings name.
 *
 * New paper is white under every theme, because the paper is the document and not the chrome: a
 * dark theme should not turn someone's drawing black. Everything round it is the theme's.
 *
 * The pixels are set by `raster.ts` rather than by canvas strokes, which is what keeps them aliased
 * and so what makes the bucket fill cleanly up to a line (see that module). The element owns one
 * `ImageData`, changes it through those functions, and puts it back on the canvas after each change.
 *
 * Aliased drawing on a photograph is honest rather than pretty, which is the MS Paint trade: the
 * bucket stays exact, and a line is the pixels it says it is.
 */
@customElement('umbradesktop-paint')
export class PaintElement extends UmbLitElement {
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

  /** Which folder a new picture is saved into. The stored per-user Desktop setting unless a test says otherwise. */
  @property({ attribute: false })
  saveSettings?: AccessoriesSettingsSource;

  /** How a picture reaches the media library. The backoffice's media repositories unless a test says otherwise. */
  @property({ attribute: false })
  saveToMedia?: MediaSaver;

  /** How an image is picked from the media library and read. Umbraco's media picker unless a test says otherwise. */
  @property({ attribute: false })
  openFromMedia?: MediaOpener;

  /** The settings in use: the ones given, or the stored ones. */
  #settings?: AccessoriesSettingsSource;

  /** The picture's size in pixels: the default for new paper, the image's own for an opened one. */
  @state()
  private _pictureSize: { w: number; h: number } = PAINT_CANVAS_SIZE;

  /** What the picture is called, as typed in the status bar. Empty means untitled. */
  @state()
  private _name = '';

  /** The name as last saved or opened. A rename is unsaved until it is saved. */
  #savedName = '';

  /** The type the picture saves as: its own, where a canvas can write it. */
  #type = NEW_PICTURE_TYPE;

  /** The extension its file saves with. */
  #extension = 'png';

  /** The last thing worth telling the person: a save, or why an open or a save did not happen. */
  @state()
  private _notice = '';

  /**
   * The media item this picture came from or was last saved as, which the next save overwrites.
   * Forgotten by New, which starts a new picture.
   */
  #mediaUnique?: string;

  /** What the left button paints. */
  @state()
  private _foreground = '#000000';

  /** What the right button and the eraser paint. */
  @state()
  private _background = '#ffffff';

  /** How many strokes Undo can take back, for the button's disabled state. */
  @state()
  private _undoDepth = 0;

  /** Whether anything has been drawn since the picture was last saved, opened or started. */
  #drawn = false;

  /** Whether there are strokes, or a name, that have not been saved. */
  get dirty(): boolean {
    return this.#drawn || this._name !== this.#savedName;
  }

  /**
   * Record whether there are unsaved strokes.
   * @param drawn Whether anything is drawn and unsaved.
   */
  #setDirty(drawn: boolean): void {
    this.#drawn = drawn;
    this.requestUpdate();
  }

  /**
   * Tell the desktop about unsaved work with {@link UNSAVED_ATTRIBUTE}, which is what makes the
   * window's close button ask before throwing the picture away.
   */
  override updated(): void {
    this.toggleAttribute(UNSAVED_ATTRIBUTE, this.dirty);
  }

  /** The picture. */
  @query('canvas')
  private _canvas!: HTMLCanvasElement;

  /** The picture's pixels, the one copy the tools change. Created on first render. */
  #image?: ImageData;

  /** Copies of the picture from before each stroke, newest last. */
  #history: ImageData[] = [];

  /** The stroke in progress: its last point and its colour. Undefined between strokes. */
  #stroke?: { x: number; y: number; colour: string };

  /** Listen for Ctrl+Z and Ctrl+S, and to the save settings. */
  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('keydown', this.#onKeyDown);
    this.#settings ??= this.saveSettings ?? new UmbraDesktopAccessoriesSettingsController(this);
  }

  /** Stop listening. The whole of teardown: there is no timer here. */
  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    super.disconnectedCallback();
  }

  /** Lay down the white paper once the canvas exists. */
  override firstUpdated(): void {
    void this.#blank();
  }

  /** The canvas's 2D context. Never null for a 2D canvas that is attached. */
  get #context(): CanvasRenderingContext2D {
    return this._canvas.getContext('2d', { willReadFrequently: true })!;
  }

  /** Replace the picture with white paper at the default size, as a new untitled PNG. */
  async #blank(): Promise<void> {
    await this.#resize(PAINT_CANVAS_SIZE);
    const context = this.#context;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, PAINT_CANVAS_SIZE.w, PAINT_CANVAS_SIZE.h);
    this.#adopt(undefined, '', NEW_PICTURE_TYPE, 'png');
  }

  /**
   * Give the canvas a new size and wait for it. Resizing a canvas clears it, so this always comes
   * before the pixels are laid down, never after.
   * @param size The picture's size.
   */
  async #resize(size: { w: number; h: number }): Promise<void> {
    this._pictureSize = size;
    await this.updateComplete;
  }

  /**
   * Take whatever is on the canvas as the picture, with no history and nothing unsaved.
   * @param unique The media item it came from, if any.
   * @param name What it is called.
   * @param type The type it saves as.
   * @param extension The extension its file saves with.
   */
  #adopt(unique: string | undefined, name: string, type: string, extension: string): void {
    const { w, h } = this._pictureSize;
    this.#image = this.#context.getImageData(0, 0, w, h);
    this.#history = [];
    this._undoDepth = 0;
    this.#mediaUnique = unique;
    this._name = name;
    this.#savedName = name;
    this.#type = type;
    this.#extension = extension;
    this._notice = '';
    this.#setDirty(false);
  }

  /** Put the pixels back on the canvas after a change. */
  #paint(): void {
    if (this.#image) this.#context.putImageData(this.#image, 0, 0);
  }

  /** Keep a copy of the picture as it is, so the stroke about to happen can be undone. */
  #remember(): void {
    if (!this.#image) return;
    this.#history.push(new ImageData(new Uint8ClampedArray(this.#image.data), this.#image.width, this.#image.height));
    if (this.#history.length > undoDepthFor(this.#image.width, this.#image.height)) this.#history.shift();
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

  /** Start a new picture, asking first if the current one has unsaved work. */
  async newPicture(): Promise<void> {
    if (this.dirty && !(await this.confirmDiscard())) return;
    await this.#blank();
  }

  /**
   * Open an image from the media library, at its own size.
   *
   * Refused, with the file's name, when Paint cannot edit it: an SVG (a drawing in text, which Paint
   * could only flatten, and saving that back would destroy it), anything that is not an image, and
   * an image past {@link PAINT_MAX_IMAGE_EDGE_PX} on either edge. The picture on screen is untouched
   * by a refusal.
   */
  async open(): Promise<void> {
    if (this.dirty && !(await this.confirmDiscard())) return;
    const result = await (this.openFromMedia ?? createMediaOpener(this))();
    if (result.status === 'cancelled') return;
    if (result.status === 'failed') {
      this._notice = this.#term('openFailed', `${result.name ?? ''} could not be read.`, result.name ?? '');
      return;
    }
    const type = editableImageType(result.blob.type);
    if (!type) {
      this._notice = this.#term('paintNotImage', `Paint edits pictures, and ${result.name} is not one it can edit.`, result.name);
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(result.blob);
    } catch {
      this._notice = this.#term('openFailed', `${result.name} could not be read.`, result.name);
      return;
    }
    if (bitmap.width > PAINT_MAX_IMAGE_EDGE_PX || bitmap.height > PAINT_MAX_IMAGE_EDGE_PX) {
      bitmap.close();
      this._notice = this.#term(
        'paintTooLarge',
        `${result.name} is too large for Paint, which opens pictures up to ${PAINT_MAX_IMAGE_EDGE_PX} pixels across.`,
        result.name,
        PAINT_MAX_IMAGE_EDGE_PX,
      );
      return;
    }
    await this.#resize({ w: bitmap.width, h: bitmap.height });
    this.#context.drawImage(bitmap, 0, 0);
    bitmap.close();
    // A type the canvas cannot write (a GIF, a BMP) saves as PNG, so its file takes that extension.
    const extension = type === result.blob.type ? result.extension || 'png' : 'png';
    this.#adopt(result.unique, result.name, type, extension);
  }

  /**
   * Save the picture to the media library: over the item it came from, or as a new item in the
   * folder Desktop settings name.
   */
  async save(): Promise<void> {
    const blob = await new Promise<Blob | null>((resolve) => this._canvas.toBlob(resolve, this.#type, 0.92));
    if (!blob) return;
    const untitled = this.#term('paintUntitled', 'Untitled');
    const name = this._name;
    const drawnBefore = this.#history.length;
    const result = await (this.saveToMedia ?? createMediaSaver(this))({
      file: new File([blob], fileNameFor(name, untitled, this.#extension), { type: this.#type }),
      name: name.trim() || untitled,
      folder: this.#settings?.value.folder?.unique ?? null,
      existing: this.#mediaUnique,
    });
    if (!result.ok) {
      this._notice = this.#term('saveFailed', `Not saved. ${result.message ?? ''}`, result.message ?? '');
      return;
    }
    this.#mediaUnique = result.unique;
    this.#savedName = name;
    // Strokes made while the save was on its way were not in it, and are still unsaved.
    this.#setDirty(this.#history.length !== drawnBefore);
    this._notice = this.#term('savedToMedia', 'Saved to the media library.');
  }

  /**
   * Ctrl+Z (or Cmd+Z) is Undo, Ctrl+S is Save and Ctrl+O is Open, each claimed so the browser does
   * not act on it too.
   * @param event The keydown.
   */
  #onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const action = { z: () => this.undo(), s: () => this.save(), o: () => this.open() }[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    void action();
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
    this.#setDirty(true);
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
  #term(key: string, fallback: string, ...args: unknown[]): string {
    return this.localize.termOrDefault(`${AREA}_${key}`, fallback, ...args);
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
   * One of the file actions at the right of the toolbar: an icon with its name as label and tooltip.
   *
   * Icons rather than words, unlike Notepad's toolbar, because Paint's is one row that already holds
   * four tools and three brush sizes, and four more words would push it past the window's minimum
   * width. The name is still there for a screen reader and on hover.
   * @param action The `data-action`, for tests and styling.
   * @param icon The Umbraco icon.
   * @param label What the action is called.
   * @param run What it does.
   * @param disabled Whether it is unavailable.
   * @returns The button.
   */
  #renderAction(action: string, icon: string, label: string, run: () => unknown, disabled = false) {
    return html`<button
      class="control tool"
      data-action=${action}
      title=${label}
      aria-label=${label}
      ?disabled=${disabled}
      @click=${run}
    >
      <umb-icon name=${icon}></umb-icon>
    </button>`;
  }

  /**
   * The whole window body.
   * @returns The toolbar, the picture in its well, the palette and the status bar.
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
        ${this.#renderAction('undo', 'icon-undo', this.#term('paintUndo', 'Undo'), () => this.undo(), this._undoDepth === 0)}
        ${this.#renderAction('new', 'icon-page-add', this.#term('paintNew', 'New'), () => this.newPicture())}
        ${this.#renderAction('open', 'icon-folder-open', this.#term('openTitle', 'Open from the media library (Ctrl+O)'), () =>
          this.open(),
        )}
        ${this.#renderAction('save', 'icon-save', this.#term('saveTitle', 'Save to the media library (Ctrl+S)'), () => this.save())}
      </div>
      <div class="well sunken">
        <canvas
          width=${this._pictureSize.w}
          height=${this._pictureSize.h}
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
      <div class="status muted">
        <input
          class="name sunken"
          data-field="name"
          .value=${this._name}
          placeholder=${this.#term('paintUntitled', 'Untitled')}
          aria-label=${this.#term('documentName', 'Name')}
          @input=${(event: Event) => (this._name = (event.target as HTMLInputElement).value)}
        />
        ${this._notice ? html`<span class="notice" role="status">${this._notice}</span>` : nothing}
        <span class="dimensions">${this._pictureSize.w} × ${this._pictureSize.h}</span>
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

      .status {
        display: flex;
        align-items: center;
        gap: 12px;
        height: ${PAINT_STATUS_HEIGHT_PX}px;
        font-size: 0.85em;
        white-space: nowrap;
        overflow: hidden;
      }

      /* The picture's name, which is the media item's name. A field so a new picture can be named
         where it is always in view. */
      .name {
        flex: 0 1 14em;
        min-width: 6em;
        height: ${PAINT_STATUS_HEIGHT_PX - 2}px;
        padding: 0 6px;
        border: none;
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font: inherit;
      }

      .name:focus-visible {
        outline: 2px solid var(--umbradesktop-app-accent, var(--uui-color-selected));
        outline-offset: 0;
      }

      .notice {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .dimensions {
        margin-left: auto;
        font-variant-numeric: tabular-nums;
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
