import { css, customElement, html, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { wordsOf } from '../shared/words.js';
import { FILE_MENU_TAG, OPEN_VIEW_TAG, whenFileMenu } from '../shared/file-menu.js';
import type { FileMenuDocument, FileMenuElement, FileMenuPanel, FileSavedDetail, FileSaveOutcome, OpenViewElement } from '../shared/file-menu.js';
import { MediaService } from '../shared/media-service.js';
import type { OpenedMedia } from '../shared/media-service.js';
import { ACCEPT, PANEL_WIDTH } from './constants.js';
import { decodePicture } from './decode.js';
import { encodeCanvas } from './encode.js';
import type { SaveFormat } from './encode.js';
import { resetsFocalPoint } from './focal.js';
import { isAnimatedGif, refusalFor } from './formats.js';
import { stepZoom as nextZoom } from './geometry.js';
import { History } from './history.js';
import { adjustMatrix, isIdentity } from './adjust.js';
import { renderDocument } from './render.js';
import type { Picture } from './render.js';
import { NEUTRAL_ADJUST, initialState, outputSize } from './state.js';
import type { EditorState, Point, Rect, Size } from './state.js';
import { Stage, VIEW_TEXTURE_LIMIT } from './stage.js';
import { modeBarStyles, renderModeBar } from './mode-bar.js';
import { renderStatusBar, statusBarStyles } from './status-bar.js';
import type { Mode, ModeModule } from './modes/mode.js';
import { cropMode, cropOverlayStyles } from './modes/crop.js';
import { adjustMode, adjustOverlayStyles } from './modes/adjust.js';
import { markupMode } from './modes/markup.js';
import { redactMode } from './modes/redact.js';
import { resizeMode } from './modes/resize.js';
import { panelStyles } from './panel-styles.js';
import { syncMarks } from './marks.js';
import { syncRegions } from './regions.js';

/** The input types a person types into, whose own keys (Ctrl+Z among them) are theirs. */
const TYPED_INPUTS = new Set(['text', 'number', 'search', 'email', 'url', 'tel', 'password']);

/**
 * Whether an element takes typing, so the editor leaves its keys to it.
 * @param element Where the key landed.
 * @returns True for a text field, a text area or editable text; false for a slider or a button.
 */
function takesTyping(element: HTMLElement): boolean {
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT' && TYPED_INPUTS.has((element as HTMLInputElement).type);
}

/** Each mode's module. */
const MODE_MODULES: Record<Mode, ModeModule> = {
  crop: cropMode,
  adjust: adjustMode,
  markup: markupMode,
  redact: redactMode,
  resize: resizeMode,
};

/** The longest side of Save as's preview, in px: a picture's worth for the page's preview box. */
const PREVIEW_SIDE = 640;

/** What the editor has open: the file menu's document, less what is derived from the picture. */
interface OpenDocument {
  /** The media item, or null when never saved. */
  unique: string | null;
  /** The name as last saved or opened, so a rename counts as a change. */
  savedName: string;
  /** Its folder. */
  folder: string | null;
  /** Its folder's name. */
  folderName?: string;
  /** Its update date as last seen. */
  updateDate?: string | null;
  /** Its file extension now. */
  extension: string;
  /** Its file size now. */
  bytes: number;
  /** Its file's own name, which a save over it keeps. */
  fileName?: string;
}

/**
 * The Image Editor: crop, adjust, mark up, redact and resize a picture from the media library, and
 * save it back or as a copy. Issue #136; `docs/design/2026-10-17-image-editor-design.md`.
 *
 * **What it owns, and what it hands on.** The editor owns the picture and its history of states;
 * opening and saving are Services.Media's file menu (D6, D12), which "..." opens and which it renders
 * by tag name and gives its document, its dirty flag and an encoder; with nothing open, the service's
 * open view is on the canvas instead (D14). They run the media library's own pickers and saves and
 * tell the editor what happened, and the editor takes the facts: a save marks the history saved, a
 * copy moves the editor onto the copy.
 *
 * **One history of whole states** (`history.ts`), so undo steps back past a save and the unsaved dot
 * follows the saved point; the D8 rule compares with the saved state (`focal.ts`). The picture is
 * drawn for the view by the same `renderDocument` that draws the file, at the view's size, with the
 * adjustment as a live GPU filter on top (`stage.ts`).
 *
 * Its location is the open item's key (#137): it opens the item it is given on connect, and reports
 * the one it shows through `umbradesktop-app-location`, so Edit image finds its window and a reload
 * reopens it at that image.
 *
 * Its window's title is the open item's name, through the desktop's `umbradesktop-app-title` event, and
 * its unsaved dot is its history's, through the attribute the desktop reads (`data-umbradesktop-dirty`);
 * the menu's Close closes the window through the desktop's unsaved guard (`umbradesktop-close-request`).
 */
@customElement('umbradesktop-image-editor')
export class UmbraDesktopImageEditorElement extends UmbLitElement {
  /** This package's words. */
  readonly words = wordsOf(this.localize);

  /** The undo history, or undefined while nothing is open. */
  history?: History<EditorState>;

  /** The decoded picture, upright. */
  picture?: Picture;

  /** The open item's facts, or null while nothing is open. */
  @state()
  protected _document: OpenDocument | null = null;

  /** The name in the status bar, which a save renames the item to. */
  @state()
  protected _name = '';

  /** Counts history changes, so a change re-renders. */
  @state()
  protected _revision = 0;

  /** The mode showing. Crop first, as the mode bar lists it. */
  @state()
  mode: Mode = 'crop';

  /** Whether the file menu is showing, over the whole editor. */
  @state()
  menuOpen = false;

  /** What the editor last said in its status bar. */
  @state()
  notice?: { kind: 'info' | 'error'; text: string };

  /** Whether the media library is there, or undefined while that is being found out. */
  @state()
  reachable?: boolean;

  /** The zoom people see, kept in step with the stage. */
  @state()
  zoom = 1;

  /** A resize not yet applied, shown as "before → after" in the status bar. */
  @state()
  pendingSize: Size | null = null;

  /** The crop frame while Crop is the mode, in oriented space, or null for none drawn. */
  @state()
  cropDraft: Rect | null = null;

  /** The item's focal point as fractions, or null; drawn in Crop. */
  @state()
  focalPoint: { left: number; top: number } | null = null;

  /**
   * The media item to open, by key: the editor's location (#137, design §4.1). The desktop sets it
   * before the editor connects, when Edit image opens the editor at an item and when a window reopens
   * at the item it had; the editor opens it once the media library answers.
   */
  @property({ attribute: false })
  location?: string;

  /** What a mode keeps while it is the mode, by mode: its tool, its style, its compare state. */
  readonly modeState: Record<string, unknown> = {};

  /** The editing view, once rendered. */
  stage?: Stage;

  /** The line to the media service. */
  readonly #media = new MediaService(this);

  /** The view's geometry as last drawn, so a change that only adjusts does not redraw the picture. */
  #viewKey = '';

  /** The view's resolution as last drawn, as world pixels per view pixel. */
  #viewScale = 1;

  /** Save as's preview, as an object URL, revoked when replaced. */
  #previewUrl?: string;

  /** @returns Whether a picture is open. */
  get hasDocument(): boolean {
    return !!this._document && !!this.history;
  }

  /** @returns The document now, or undefined. */
  get state(): EditorState | undefined {
    return this.history?.current;
  }

  /** @returns Whether there is unsaved work: a change in the history, or a rename. */
  get dirty(): boolean {
    return !!this._document && (!!this.history?.dirty || this._name !== this._document.savedName);
  }

  /** @returns The file menu, once rendered and defined. */
  get fileMenu(): FileMenuElement | undefined {
    const menu = this.shadowRoot?.querySelector(FILE_MENU_TAG) as FileMenuElement | null;
    return menu && customElements.get(FILE_MENU_TAG) ? menu : undefined;
  }

  /** @returns What the file menu shows and saves: the open item with the picture's size as it will be saved. */
  get fileMenuDocument(): FileMenuDocument | null {
    const doc = this._document;
    const current = this.state;
    if (!doc || !current) return null;
    const size = outputSize(current);
    return {
      unique: doc.unique,
      name: this._name,
      folder: doc.folder,
      ...(doc.folderName !== undefined ? { folderName: doc.folderName } : {}),
      updateDate: doc.updateDate,
      extension: doc.extension,
      width: size.w,
      height: size.h,
      bytes: doc.bytes,
      ...(doc.fileName !== undefined ? { fileName: doc.fileName } : {}),
    };
  }

  /** @returns Whether the next save resets the focal point and named crops (design D8). */
  get resetFocalPoint(): boolean {
    return !!this.history && resetsFocalPoint(this.history.saved, this.history.current);
  }

  /**
   * Make a change: one step in the history.
   * @param next The new state.
   */
  apply(next: EditorState): void {
    if (!this.history) return;
    this.history.push(next);
    this.#changed();
  }

  /** A history change happened elsewhere (a gesture's preview): re-render and redraw. */
  refresh(): void {
    this.#changed();
  }

  /** Step back. */
  undo(): void {
    if (!this.history?.canUndo) return;
    this.#leaveMode();
    this.history.undo();
    this.#changed();
  }

  /** Step forward. */
  redo(): void {
    if (!this.history?.canRedo) return;
    this.#leaveMode();
    this.history.redo();
    this.#changed();
  }

  /**
   * Show a mode, applying what the mode before it had pending.
   * @param mode The mode.
   */
  setMode(mode: Mode): void {
    if (!this.hasDocument) return;
    if (this.menuOpen) this.fileMenu?.hide();
    if (mode === this.mode) return;
    this.#leaveMode();
    this.mode = mode;
    this.#redrawView();
    this.#syncOverlays();
    MODE_MODULES[mode].enter?.(this);
  }

  /**
   * Show the file menu, from "..." or a key: what the mode has pending is applied first, so Save as
   * shows and saves what was seen.
   * @param panel The menu, or the panel to slide in over it.
   * @param options For Save as, the format to start on.
   */
  showMenu(panel: FileMenuPanel = 'menu', options?: { format?: SaveFormat }): void {
    const menu = this.fileMenu;
    if (!menu || !this.reachable) {
      this.notice = { kind: 'error', text: this.words('unreachable') };
      return;
    }
    if (!this.menuOpen) this.#leaveMode();
    this.menuOpen = true;
    this.#syncMenu();
    this.#refreshPreview();
    menu.show(panel, options);
  }

  /**
   * Save as the Save button does, through the file menu.
   * @returns How it went, or undefined when there was nothing to save or nowhere to save it.
   */
  async save(): Promise<FileSaveOutcome | undefined> {
    const menu = this.fileMenu;
    if (!this.hasDocument) return undefined;
    if (!menu || !this.reachable) {
      this.notice = { kind: 'error', text: this.words('unreachable') };
      return undefined;
    }
    // What the mode has pending is applied first, so what is saved is what is seen; the mode's
    // objects come back afterwards unless the menu was shown on Save as instead.
    this.#leaveMode();
    this.#syncMenu();
    const outcome = await menu.save();
    if (outcome.status === 'needs-save-as') {
      this.menuOpen = true;
      this.#refreshPreview();
    } else {
      MODE_MODULES[this.mode].enter?.(this);
    }
    return outcome;
  }

  /**
   * Rename the item; the save renames it in the media library.
   * @param name The name typed.
   */
  rename(name: string): void {
    this._name = name;
  }

  /**
   * Zoom to a level.
   * @param zoom The level.
   */
  setZoom(zoom: number): void {
    this.stage?.setZoom(zoom);
  }

  /**
   * Zoom one step in or out.
   * @param dir In or out.
   */
  stepZoom(dir: 1 | -1): void {
    this.stage?.setZoom(nextZoom(this.zoom, dir));
  }

  /** Fit the picture into the view. */
  fit(): void {
    this.stage?.fit();
  }

  /**
   * Where the world of the view starts in oriented space: the crop's corner, since the world is the
   * picture as cropped, in every mode. Crop showed the whole picture once, and an applied crop then
   * changed nothing on screen (found by the owner; design §14.8).
   * @returns The offset.
   */
  get worldOffset(): Point {
    const crop = this.state?.crop;
    return crop ? { x: crop.x, y: crop.y } : { x: 0, y: 0 };
  }

  /**
   * Draw the view again with what the state is now: the picture when its geometry changed, and the
   * adjustment either way. Modes call it after changing what the view shows.
   */
  redrawView(): void {
    this.#redrawView();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Before the first update, which reports the location: an editor opening an item is there
    // already as far as the desktop is concerned, so a second Edit image on it finds this window.
    if (this.location && !this.hasDocument) this.#opening = true;
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.addEventListener('keydown', this.#onKeyDown);
    this.addEventListener('keyup', this.#onKeyUp);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    this.removeEventListener('keyup', this.#onKeyUp);
    this.stage?.dispose();
    this.stage = undefined;
    if (this.#previewUrl) URL.revokeObjectURL(this.#previewUrl);
    super.disconnectedCallback();
  }

  protected override firstUpdated(): void {
    const container = this.shadowRoot!.querySelector('.stage') as HTMLElement;
    this.stage = new Stage(container);
    this.stage.onChange = () => {
      this.zoom = this.stage?.zoom ?? 1;
      this.#maybeSharpen();
      this.requestUpdate();
    };
    void this.#findService();
  }

  protected override updated(): void {
    this.toggleAttribute('data-umbradesktop-dirty', this.dirty);
    this.#sendTitle(this._document ? this._name : '');
    if (!this.#opening && !this.#keepLocation) this.#sendLocation(this._document?.unique ?? '');
    this.#syncMenu();
  }

  /** Whether the item at the editor's location is still being opened, so its location is not cleared meanwhile. */
  #opening = false;

  /**
   * Whether the item at the editor's location could not be asked for at all (the media library did
   * not answer in time, or the call failed), so the window keeps its location: that says nothing
   * about the item, and clearing it would lose it from the window for good. Only a definite answer
   * clears it: gone, refused, in the bin, or not an image the editor opens. Reset once a file opens.
   */
  #keepLocation = false;

  /** The location last reported, or undefined before the first. */
  #sentLocation?: string;

  /**
   * Tell the desktop which media item the editor shows, through `umbradesktop-app-location`
   * (`docs/developer/desktop-apps.md` §7.3), whenever that changes: an open, and a Save as onto a
   * copy. Empty with nothing open, which clears the window's location, so an editor whose image failed
   * to open is not brought forward for it and does not fail at it again after a reload.
   * @param location The item's key, or an empty string.
   */
  #sendLocation(location: string): void {
    if (location === this.#sentLocation) return;
    this.#sentLocation = location;
    this.dispatchEvent(new CustomEvent('umbradesktop-app-location', { detail: { location }, bubbles: true, composed: true }));
  }

  /**
   * Open the item at the editor's location, by key, through the media service: then the same path as
   * an open from the file menu. A failure leaves the empty canvas with Open on it and the reason in the
   * status bar.
   * @param unique The media item.
   */
  async #openAt(unique: string): Promise<void> {
    try {
      const result = await this.#media.open(unique);
      if (result.status === 'opened') await this.#openFile(result);
      else if (result.status === 'unreachable') {
        this.#keepLocation = true;
        this.notice = { kind: 'error', text: this.words('unreachable') };
      } else this.notice = { kind: 'error', text: result.status === 'failed' && result.name ? this.words('openFailed', result.name) : this.words('openFailedUnnamed') };
    } finally {
      this.#opening = false;
      this.requestUpdate();
    }
  }

  /** The title last given to the window, or undefined before the first. */
  #sentTitle?: string;

  /**
   * Name the window after the open item, or give it the app's own name back with an empty title, through
   * the desktop's `umbradesktop-app-title` (`docs/developer/desktop-apps.md` §7). Said only when it
   * changes, and said once as the editor starts even with nothing open: the desktop saves a window's
   * title with the layout and shows it on a reopened window, and an editor that reopens with no item to
   * open (or fails to open it) is empty, so an empty title is what takes the last session's file name
   * off it.
   * @param title The item's name, or an empty string with nothing open.
   */
  #sendTitle(title: string): void {
    if (title === this.#sentTitle) return;
    this.#sentTitle = title;
    this.dispatchEvent(new CustomEvent('umbradesktop-app-title', { detail: { title }, bubbles: true, composed: true }));
  }

  /**
   * Find out whether the media library is there. When it is, the empty canvas offers Open (D14);
   * when it is not, the editor says so.
   */
  async #findService(): Promise<void> {
    const [menu, service] = await Promise.all([whenFileMenu(), this.#media.reachable()]);
    this.reachable = menu && service;
    await this.updateComplete;
    if (!this.reachable) {
      this.notice = { kind: 'error', text: this.words('unreachable') };
      if (this.#opening) this.#keepLocation = true;
      this.#opening = false;
      this.requestUpdate();
      return;
    }
    if (this.location && !this.hasDocument) await this.#openAt(this.location);
  }

  /**
   * Give the file menu what it shows and saves, and the open view what it opens. Their properties
   * are set here rather than bound, since their tags may be defined late.
   */
  #syncMenu(): void {
    const view = this.shadowRoot?.querySelector(OPEN_VIEW_TAG) as OpenViewElement | null;
    if (view) {
      view.accept = [...ACCEPT];
      view.dirty = this.dirty;
      view.heading = this.words('openAnImage');
    }
    const menu = this.fileMenu;
    if (!menu) return;
    menu.label = this.words('imageEditor');
    menu.document = this.fileMenuDocument;
    menu.dirty = this.dirty;
    menu.accept = [...ACCEPT];
    menu.resetFocalPoint = this.resetFocalPoint;
    menu.encode = this.hasDocument
      ? async (format, quality) => {
          const picture = this.picture;
          const current = this.state;
          if (!picture || !current) throw new Error('Nothing is open.');
          return encodeCanvas(renderDocument(picture, current), format, quality);
        }
      : undefined;
    menu.preview = this.#previewUrl;
  }

  /** Draw Save as's preview of the picture as it will be saved, while the file menu shows. */
  #refreshPreview(): void {
    const picture = this.picture;
    const current = this.state;
    if (!picture || !current) return;
    const out = outputSize(current);
    const scale = Math.min(1, PREVIEW_SIDE / Math.max(out.w, out.h));
    renderDocument(picture, current, { scale }).toBlob((blob) => {
      if (!blob) return;
      if (this.#previewUrl) URL.revokeObjectURL(this.#previewUrl);
      this.#previewUrl = URL.createObjectURL(blob);
      this.#syncMenu();
    });
  }

  /** Apply what the mode has pending, and take its objects off the canvas. */
  #leaveMode(): void {
    if (this.hasDocument) MODE_MODULES[this.mode].leave?.(this);
  }

  /** The history changed: re-render, redraw, and tell the file menu. */
  #changed(): void {
    this._revision++;
    this.#redrawView();
    this.#syncOverlays();
    if (!this.menuOpen) MODE_MODULES[this.mode].enter?.(this);
    if (this.menuOpen) this.#refreshPreview();
  }

  /**
   * The state the view draws: the cropped picture, in every mode, so Crop shows a crop once it is
   * applied. Never resized (the zoom shows the size), never adjusted (the GPU filter does), never with
   * its marks and regions (the modes draw those as objects).
   * @param current The document.
   * @returns The view's state.
   */
  #viewState(current: EditorState): EditorState {
    return {
      ...current,
      crop: current.crop,
      size: null,
      adjust: { ...NEUTRAL_ADJUST },
      marks: [],
      regions: [],
    };
  }

  /** Draw the view: the picture when its geometry or resolution changed, and the adjustment. */
  #redrawView(sharpen = false): void {
    const stage = this.stage;
    const picture = this.picture;
    const current = this.state;
    if (!stage || !picture || !current) return;
    const view = this.#viewState(current);
    const world = outputSize(view);
    const out = outputSize(current);
    const outPerWorld = out.w / world.w;
    const key = JSON.stringify([view.rotation, view.flipH, view.flipV, view.crop, out]);
    if (key !== this.#viewKey || sharpen) {
      const { w, h } = stage.viewport;
      const dpr = window.devicePixelRatio || 1;
      const onScreen = Math.max(Math.min(w / world.w, h / world.h), stage.hasPicture && !stage.fitted ? stage.zoom * outPerWorld : 0);
      const scale = Math.min(1, VIEW_TEXTURE_LIMIT / Math.max(world.w, world.h), onScreen * dpr);
      // A newly opened picture is fitted; after that the stage refits only when the world's size
      // changes (a crop, a turn), and keeps the zoom for anything else.
      const first = !this.#viewKey;
      this.#viewKey = key;
      this.#viewScale = scale;
      stage.setView(renderDocument(picture, view, { scale, withOverlays: false }), world, outPerWorld, first);
    }
    const matrix = adjustMatrix(current.adjust);
    stage.setFilter(isIdentity(matrix) ? null : matrix);
    this.zoom = stage.zoom;
  }

  /**
   * Show the document's marks (and regions) on the canvas, unselectable: every mode shows them, and
   * the mode that edits them makes them selectable when it is entered.
   */
  #syncOverlays(): void {
    syncRegions(this, false);
    syncMarks(this, false);
  }

  /** Zoomed in past what the view was drawn at: draw it again, sharper, once the zoom settles. */
  #sharpenTimer?: ReturnType<typeof setTimeout>;

  /** Draw the view again at a resolution that suits the zoom, after the zoom has stopped moving. */
  #maybeSharpen(): void {
    const stage = this.stage;
    if (!stage || !this.state || this.#viewScale >= 1) return;
    const dpr = window.devicePixelRatio || 1;
    const world = stage.world;
    const needed = Math.min(1, VIEW_TEXTURE_LIMIT / Math.max(world.w, world.h), stage.canvas.viewportTransform[0] * dpr);
    if (needed <= this.#viewScale * 1.25) return;
    clearTimeout(this.#sharpenTimer);
    this.#sharpenTimer = setTimeout(() => this.#redrawView(true), 200);
  }

  /**
   * The file menu or the open view opened a file.
   * @param event Their event, with the file.
   */
  #onOpen = async (event: Event) => {
    await this.#openFile((event as CustomEvent<OpenedMedia>).detail);
  };

  /**
   * Open a file, from the file menu, the open view or the editor's location: refuse what the editor
   * does not edit, decode the rest, and start a history on it. An item in the recycle bin is refused
   * too (#137): opening by key reads an item wherever it is, and an image saved in the bin is an image
   * nobody sees. A refusal leaves whatever was open as it was.
   * @param file The file.
   */
  async #openFile(file: OpenedMedia): Promise<void> {
    if (file.isTrashed) {
      this.notice = { kind: 'error', text: this.words('openTrashed', file.name) };
      return;
    }
    const refusal = refusalFor(file.extension);
    if (refusal) {
      this.notice = { kind: 'error', text: this.words(refusal === 'svg' ? 'refusedSvg' : 'refusedOther', file.name) };
      return;
    }
    let picture: ImageBitmap;
    try {
      picture = await decodePicture(file.blob);
    } catch {
      this.notice = { kind: 'error', text: this.words('decodeFailed', file.name) };
      return;
    }
    const animated = file.extension.toLowerCase() === 'gif' && isAnimatedGif(new Uint8Array(await file.blob.arrayBuffer()));
    this.#leaveMode();
    this.#keepLocation = false;
    this.picture = picture;
    const initial = initialState({ w: picture.width, h: picture.height });
    if (this.history) this.history.reset(initial);
    else this.history = new History(initial);
    this._document = {
      unique: file.unique,
      savedName: file.name,
      folder: file.folder ?? null,
      ...(file.folderName !== undefined ? { folderName: file.folderName } : {}),
      updateDate: file.updateDate,
      extension: file.extension.toLowerCase(),
      bytes: file.blob.size,
      ...(file.fileName !== undefined ? { fileName: file.fileName } : {}),
    };
    this._name = file.name;
    this.focalPoint = file.focalPoint ?? null;
    this.pendingSize = null;
    this.cropDraft = null;
    this.notice = animated ? { kind: 'info', text: this.words('animatedGif') } : undefined;
    this.#viewKey = '';
    // Before hiding, so the menu's hidden event finds it closed and leaves the mode to the lines below.
    this.menuOpen = false;
    this.fileMenu?.hide();
    this._revision++;
    await this.updateComplete;
    this.#redrawView();
    this.#syncOverlays();
    MODE_MODULES[this.mode].enter?.(this);
  }

  /**
   * The file menu saved: the history is saved there, and the editor takes what was written as its
   * document's facts, so after a copy it is on the copy.
   * @param event The menu's event.
   */
  #onSaved = (event: Event) => {
    const saved = (event as CustomEvent<FileSavedDetail>).detail;
    if (!this._document || !this.history) return;
    // A copy is a full copy and carries the focal point (design §11.6); a save, copy or overwrite,
    // that reframed the picture reset it; a plain copy, of an image gone by then, never had one (§11.7).
    if (this.resetFocalPoint || (saved.copy && saved.fullCopy === false)) this.focalPoint = null;
    this.history.markSaved();
    this._document = {
      unique: saved.unique,
      savedName: saved.name,
      folder: saved.folder,
      ...(saved.folderName !== undefined ? { folderName: saved.folderName } : {}),
      updateDate: saved.updateDate,
      extension: saved.extension,
      bytes: saved.bytes,
      fileName: saved.fileName,
    };
    this._name = saved.name;
    this.notice = { kind: 'info', text: saved.notice || this.words('saved') };
    this._revision++;
  };

  /**
   * The file menu or the open view could not open, or the menu could not save: say why.
   * @param event Their event.
   */
  #onFailed = (event: Event) => {
    const message = (event as CustomEvent<{ message?: string }>).detail?.message;
    this.notice = { kind: 'error', text: message ? message : this.words('notSaved') };
  };

  /** The file menu went away, whatever put it away: the editor's own view and its mode are back. */
  #onHidden = () => {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    if (this.hasDocument) MODE_MODULES[this.mode].enter?.(this);
  };

  /** The file menu's Close: close the window, through the desktop's unsaved guard. */
  #onClose = () => {
    this.dispatchEvent(new CustomEvent('umbradesktop-close-request', { bubbles: true, composed: true }));
  };

  /**
   * The editor's keys, handled on the element as Paint handles its own.
   *
   * **Shortcuts with Ctrl** are the editor's everywhere except in a field that takes typing, where
   * Ctrl+Z undoes the typing and not a crop. A slider, a checkbox or a button is not such a field:
   * after a slider drag, Ctrl+Z undoes the drag (design §4.2). Ctrl+S and Ctrl+Shift+S work even in
   * a text field. **While the file menu shows, Ctrl+S does nothing**: what Save as writes is what its
   * own button says (a copy, another format), and Save from here would replace the original instead.
   *
   * **Keys without Ctrl** (Space to pan, Enter, Escape, Delete for the mode) are the editor's only
   * when they land on the editor itself or its canvas. On a button they are the button's, so a
   * keyboard user's Enter on Rotate right rotates, and Space presses it.
   * @param event The key.
   */
  #onKeyDown = (event: KeyboardEvent) => {
    const target = event.composedPath()[0] as HTMLElement | undefined;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (ctrl && key === 's') {
      event.preventDefault();
      if (event.shiftKey) this.showMenu('saveAs');
      else if (!this.menuOpen) void this.save();
      return;
    }
    if (target && takesTyping(target)) return;
    if (ctrl && key === 'o') {
      event.preventDefault();
      this.showMenu('open');
      return;
    }
    if (this.menuOpen || !this.hasDocument) return;
    const onCanvas = !target || target === this || !!this.shadowRoot?.querySelector('.stage')?.contains(target);
    const handled = (() => {
      if (ctrl && key === 'z' && !event.shiftKey) return this.undo(), true;
      if (ctrl && (key === 'y' || (key === 'z' && event.shiftKey))) return this.redo(), true;
      if (ctrl && key === '0') return this.fit(), true;
      if (ctrl && key === '1') return this.setZoom(1), true;
      if (ctrl && (key === '=' || key === '+')) return this.stepZoom(1), true;
      if (ctrl && (key === '-' || key === '_')) return this.stepZoom(-1), true;
      if (ctrl || !onCanvas) return false;
      if (key === ' ' && this.stage) return (this.stage.panning = true), true;
      return MODE_MODULES[this.mode].key?.(this, event) ?? false;
    })();
    if (handled) event.preventDefault();
  };

  /**
   * A key went up: Space ends a pan.
   * @param event The key.
   */
  #onKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ' && this.stage) this.stage.panning = false;
  };

  override render() {
    const open = this.hasDocument;
    return html`
      ${renderModeBar(this)}
      <div class="middle">
        <div class="canvas">
          <div class="stage"></div>
          <div class="overlay">${open && !this.menuOpen ? MODE_MODULES[this.mode].overlay?.(this) ?? nothing : nothing}</div>
          ${this.reachable && !open
            ? html`<umbradesktop-media-open-view
                class="open-view"
                @umbradesktop-media-file-open=${this.#onOpen}
                @umbradesktop-media-file-failed=${this.#onFailed}></umbradesktop-media-open-view>`
            : nothing}
          ${this.reachable === false ? html`<p class="unreachable" role="alert">${this.words('unreachable')}</p>` : nothing}
        </div>
        <aside class="panel" aria-label=${this.words(`mode${this.mode[0].toUpperCase()}${this.mode.slice(1)}` as 'modeCrop')}>
          ${open ? MODE_MODULES[this.mode].panel(this) : nothing}
        </aside>
      </div>
      ${renderStatusBar(this)}
      <umbradesktop-media-file-menu
        @umbradesktop-media-file-open=${this.#onOpen}
        @umbradesktop-media-file-saved=${this.#onSaved}
        @umbradesktop-media-file-failed=${this.#onFailed}
        @umbradesktop-media-file-hidden=${this.#onHidden}
        @umbradesktop-media-file-close=${this.#onClose}></umbradesktop-media-file-menu>
    `;
  }

  static override styles = [
    modeBarStyles,
    statusBarStyles,
    panelStyles,
    cropOverlayStyles,
    adjustOverlayStyles,
    css`
      :host {
        position: relative;
        display: flex;
        flex-direction: column;
        box-sizing: border-box;
        height: 100%;
        min-height: 0;
        overflow: hidden;
        background: var(--umbradesktop-app-surface, var(--uui-color-surface));
        color: var(--umbradesktop-app-text, var(--uui-color-text));
        font-family: var(--umbradesktop-app-font, inherit);
      }

      :host(:focus) {
        outline: none;
      }

      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }

      .muted {
        color: var(--umbradesktop-app-text-muted, var(--uui-color-text-alt));
      }

      .middle {
        flex: 1;
        display: flex;
        min-height: 0;
        min-width: 0;
      }

      .canvas {
        position: relative;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        background: var(--umbradesktop-app-surface-sunken, var(--uui-color-background));
      }

      .stage {
        position: absolute;
        inset: 0;
        touch-action: none;
      }

      .overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .unreachable {
        position: absolute;
        inset: auto 24px 24px;
        margin: 0;
        padding: 12px 16px;
        background: var(--umbradesktop-app-surface, var(--uui-color-surface));
        border-radius: var(--umbradesktop-app-radius, 3px);
        box-shadow: 0 0 0 1px var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      .panel {
        flex: 0 0 ${PANEL_WIDTH}px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        overflow-y: auto;
        background: var(--umbradesktop-app-surface, var(--uui-color-surface));
        border-left: 1px solid var(--umbradesktop-app-border, var(--uui-color-text-alt));
      }

      /* Open on the empty canvas (D14), over the stage, which has nothing to show yet. */
      .open-view {
        position: absolute;
        inset: 0;
        z-index: 1;
      }

      /* The file menu places itself over the whole editor (its own :host), under the title bar. */
    `,
  ];
}

export { UmbraDesktopImageEditorElement as element };

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-image-editor': UmbraDesktopImageEditorElement;
  }
}
