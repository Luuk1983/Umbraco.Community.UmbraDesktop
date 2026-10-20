import { css, customElement, html, nothing, property, query, state, unsafeCSS } from '@umbraco-cms/backoffice/external/lit';
import { DROP_OUTLINE_PX, MARK_DIM_OPACITY, dropColour, dropTint, markTint } from '../drag/light.js';
import type { UmbraDesktopDropMark } from '../drag/light.js';
import { isPlaceRef } from '../operations/media-types.js';
import type { PropertyValues } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import './folder-host.element.js';
import './tree-host.element.js';
import type { UmbraDesktopMediaFolderHostElement } from './folder-host.element.js';
import { UmbraDesktopMediaServerSource, isFolder, itemName } from './media-source.js';
import type { UmbraDesktopMediaSource } from './media-source.js';
import { parseLocation, printLocation, samePlace } from './location.js';
import type { UmbraDesktopMediaPlace } from './location.js';
import { linkIntent } from './link-rule.js';
import { UmbraDesktopMediaManagerWindowContext } from './manager-window.context.js';
import { UMBRADESKTOP_OPEN_ITEM_KEY, editPath, markOpenItem, openKeyFrom } from './open-item.js';
import { guardRoutes, markActive } from './route-guard.js';
import { markCutItems } from './cut-fade.js';
import { refsOf } from './actions/held-items.js';
import { cutKeys } from '../clipboard/clipboard.js';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';
import type { UmbraDesktopMediaManagerContext } from '../context/media-manager.context.js';
import { UmbraDesktopMediaSelectionController } from '../selection/selection.controller.js';
import '../selection/box.element.js';
import type { UmbraDesktopMediaSelectionBoxElement } from '../selection/box.element.js';
import { UMBRADESKTOP_MEDIA_RENAME_MODAL } from '../selection/rename-dialog.element.js';
import { umbConfirmModal, umbOpenModal } from '@umbraco-cms/backoffice/modal';
import type { UmbraDesktopDragWindowHandle } from '../drag/drag.controller.js';
import type { UmbraDesktopLabelLine } from '../drag/label.js';
import { renderedItems } from '../selection/rendered-items.js';
import { inField } from '../selection/keys.js';
import { hasPrimaryModifier, onMac } from '../platform-keys.js';
import { UmbraDesktopTreeCurrent, treePlaceAt } from '../tree/current-folder.js';
import { UmbraDesktopTreeArrival, ancestorChain } from '../tree/arrival.js';
import { pasteInto } from '../clipboard/clipboard.js';
import { keyIntent } from '../selection/keys.js';
import { pasteIntent, pastedFiles } from '../clipboard/paste-intent.js';
import { nameForPaste } from '../upload/paste-name.js';
import { uploadInto } from '../upload/upload.js';
import { watchUploads } from '../upload/upload-watch.js';
import type { UmbraDesktopUploadBatch } from '../upload/upload-watch.js';

/**
 * When to look for core's cards again after something that may have drawn new ones (an item opened,
 * a folder loaded, a view switched): core renders its view a moment after the collection is built,
 * and how long that takes depends on the server. Each look is cheap and stops at the cards.
 */
const BORDER_RETRIES_MS = [0, 100, 300, 800, 2000];

/**
 * How long after opening an item the window takes the keyboard back from the page beside it. Core's
 * workspace focuses its name field as it loads, and the first item a window opens boots a whole
 * backoffice in its frame, which took up to ten seconds in a headless check; a
 * file manager with a preview keeps the keyboard in the list.
 */
const HOLD_FOCUS_MS = 20000;

/**
 * When to look for what a drop brought in, to select it: the operation reloads the folder through
 * core's event, and core redraws it once the server answers. The last look selects whatever arrived.
 */
const SELECT_RETRIES_MS = [0, 100, 300, 800, 2000, 4000];

/**
 * How long Ctrl+V waits for the browser's paste event before pasting what the manager holds. Chrome
 * sends it straight after the key; Safari sends none outside a text field, and then the key pastes.
 */
const PASTE_EVENT_WAIT_MS = 150;

/** How far the drag label sits from the pointer, so the pointer does not cover it. */
const LABEL_OFFSET_PX = 16;

/**
 * One Media Manager window: core's media tree beside core's media collection for one place.
 *
 * Everything inside is core's (design §1). What this element owns is the window around it: which place
 * it shows and in which view, what it is called and where it reopens, and every link click inside it.
 * Core renders links meant for the Media section, and Umbraco's router takes any link click that
 * reaches the page's window and navigates the whole backoffice, so a click on a link in here is read
 * ({@link linkIntent}), acted on in the window, and never let through.
 *
 * An item opens beside the window (design §8): the window asks the desktop for core's media workspace
 * on the item's page, under one key, so one item is open per window and the next click routes the
 * same pane, where core asks about unsaved changes first. Create opens the same way, on core's create
 * page in the open folder. The desktop reports back in `attached`, and the open item's card gets the
 * pink border.
 */
@customElement('umbradesktop-media-manager')
export class UmbraDesktopMediaManagerElement extends UmbLitElement {
  /**
   * Where the window opens, as the desktop hands it back: on a reload, or from "Open in new window".
   * Read once, when the window opens.
   */
  @property({ attribute: false })
  location?: string;

  /** Where the window asks the server; a test hands in its own. */
  @property({ attribute: false })
  source: UmbraDesktopMediaSource = new UmbraDesktopMediaServerSource(this);

  /** The place the window shows. */
  @state()
  private _place: UmbraDesktopMediaPlace = { kind: 'root' };

  /** The collection view the window shows, or undefined for core's default. */
  @state()
  private _view?: string;

  /**
   * What the desktop has open beside this window: each key the window opened a page under, and the
   * page it is on now. Set by the desktop; the open item is read from it, never from the selection.
   */
  @property({ attribute: false })
  attached: UmbraDesktopAttachedPages = {};

  /**
   * Ask for an item's new name: the Rename dialog F2 opens (decided 2026-10-17). A property so a test
   * can answer for the person.
   * @param current The name now.
   * @returns The name typed, or undefined when cancelled.
   */
  @property({ attribute: false })
  askName: (current: string) => Promise<string | undefined> = async (current) => {
    try {
      return (await umbOpenModal(this, UMBRADESKTOP_MEDIA_RENAME_MODAL, { data: { name: current } })).name;
    } catch {
      return undefined;
    }
  };

  /**
   * Ask a new folder's name: the Rename dialog in its create mode, starting at "New folder". A property
   * so a test can answer for the person.
   * @returns The name typed, or undefined when cancelled.
   */
  @property({ attribute: false })
  askFolderName: () => Promise<string | undefined> = async () => {
    try {
      const value = await umbOpenModal(this, UMBRADESKTOP_MEDIA_RENAME_MODAL, {
        data: { name: this.localize.term('umbraDesktopMedia_newFolder'), create: true },
      });
      return value.name.trim() || undefined;
    } catch {
      return undefined;
    }
  };

  /**
   * Ask before moving a tree folder to the recycle bin with Delete, in core's own words, as core's
   * Trash action asks. A property so a test can answer for the person.
   * @param name The folder's name.
   * @returns True to go ahead.
   */
  @property({ attribute: false })
  confirmTrash: (name: string) => Promise<boolean> = async (name) => {
    try {
      await umbConfirmModal(this, {
        headline: '#actions_trash',
        content: this.localize.string('#defaultdialogs_confirmTrash', name),
        color: 'danger',
        confirmLabel: '#actions_trash',
      });
      return true;
    } catch {
      return false;
    }
  };

  /** The hosted collection. */
  @query('umbradesktop-media-folder-host')
  private _folderHost?: UmbraDesktopMediaFolderHostElement;

  /** The tree host. */
  @query('umbradesktop-media-tree-host')
  private _treeHost?: HTMLElement;

  /**
   * Whether a drag over the window would land in the folder it shows, and whether anything would go:
   * reflected, since the window's styles draw the shade from it.
   */
  @property({ reflect: true })
  drop?: 'target' | 'refused';

  /**
   * Whether the place the window shows takes what is being dragged, marked from the drag's start
   * (#158, design §19): lightly tinted when it does, dimmed when it does not. Reflected, as `drop` is;
   * a drag over the window draws `drop` over it.
   */
  @property({ reflect: true })
  mark?: UmbraDesktopDropMark;

  /** The label under the pointer while a drag is over this window, in the window's coordinates. */
  @state()
  private _dropLabel?: { lines: UmbraDesktopLabelLine[]; refused: boolean; x: number; y: number };

  /** The selection box's layer. */
  @query('umbradesktop-media-selection-box')
  private _box?: UmbraDesktopMediaSelectionBoxElement;

  /** Selecting and the keys, on top of core's collection (plan phase 3). */
  protected readonly _selection = new UmbraDesktopMediaSelectionController(this, {
    folder: () => this._folderHost,
    box: () => this._box,
    open: (unique) => void this.#openItem(unique, false, false),
    rename: (unique) => void this.#rename(unique),
    canTrash: () => this._place.kind !== 'bin',
    hold: (mode, uniques) => this.#holdKey(mode, uniques),
    paste: () => this.#pasteKey(),
    tree: () => this._treeHost,
    undo: () => void this.#context?.undo?.(),
    emptyCut: () => this.#emptyCut(),
  });

  /** Whether Cmd, not Ctrl, is the primary modifier here. */
  #mac = onMac();

  /** Marks the folder the window shows in its tree; made once the tree is drawn. */
  #treeCurrent?: UmbraDesktopTreeCurrent;

  /** Shows pastes and drops into folders in the tree; made once the tree is drawn. */
  #arrival?: UmbraDesktopTreeArrival;

  /** Where the pending Ctrl+V pastes: a tree folder it was pressed on, or the window's folder. */
  #pasteTarget?: UmbraDesktopMediaPlace;

  /** The add-on's desktop context: the clipboard and the operations. Absent outside a desktop. */
  #context?: UmbraDesktopMediaManagerContext;

  /** The keys of the items cut now, faded in this window. */
  #cut: string[] = [];

  /**
   * The item the pane was last named after, by this window. The pane can reach an item this window
   * did not ask for (a new item saved, a link followed inside it), and is then named after it once.
   */
  #namedKey?: string;

  /** What the page beside the window was on when the desktop last said: an item's key, `create`, or nothing. */
  #besideWas?: string;

  /** The pending looks for core's cards; see {@link BORDER_RETRIES_MS}. */
  #borderTimers: number[] = [];

  /** Until when the window takes the keyboard back from the page beside it; see {@link HOLD_FOCUS_MS}. */
  #holdFocusUntil = 0;

  /** Stops guarding the desktop page against core's own navigation; see `route-guard.ts`. */
  #stopGuard?: () => void;

  /** This window, for our actions and conditions inside it. */
  #window = new UmbraDesktopMediaManagerWindowContext(this, this.source);

  /** Whether the location the desktop handed over has been read. */
  #placed = false;

  /** Takes the window off the desktop context's list of drag windows. */
  #leaveDrag?: () => void;

  /** Stops following the uploads in core's dropzone in this window. */
  #stopUploads?: () => void;

  /** Counts the batches of uploads in this window, for their task ids. */
  #uploadSequence = 0;

  /** The paste Ctrl+V makes if no paste event follows it; see {@link PASTE_EVENT_WAIT_MS}. */
  #pasteFallback?: number;

  /** The pending looks for what a drop brought in; see {@link SELECT_RETRIES_MS}. */
  #selectTimers: number[] = [];

  /** This window, as a drag between windows works with it (plan phase 5). */
  readonly #dragHandle: UmbraDesktopDragWindowHandle = {
    element: this,
    place: () => this._place,
    folder: () => this._folderHost,
    tree: () => this._treeHost,
    setDrop: (state) => {
      // The attribute at once, which the drag reads back; Lit takes the property from it.
      if (state) this.setAttribute('drop', state);
      else this.removeAttribute('drop');
    },
    setMark: (state) => {
      if (state) this.setAttribute('mark', state);
      else this.removeAttribute('mark');
    },
    setLabel: (label) => {
      if (!label) {
        this._dropLabel = undefined;
        return;
      }
      const rect = this.getBoundingClientRect();
      this._dropLabel = { ...label, x: label.x - rect.left + LABEL_OFFSET_PX, y: label.y - rect.top + LABEL_OFFSET_PX };
    },
    raise: () => this.dispatchEvent(new CustomEvent<UmbraDesktopAppFocusDetail>('umbradesktop-app-focus', { bubbles: true, composed: true })),
    selectWhenShown: (keys) => this.#selectWhenShown(keys),
    arriving: (destination) => this.#arriving(destination),
    landed: (destination, folders) => this.#landed(destination, folders),
  };

  override connectedCallback(): void {
    super.connectedCallback();
    // Focusable, so the keys reach the window when nothing inside it has the focus, as when the desktop
    // hands the window the keyboard.
    if (!this.hasAttribute('tabindex')) this.tabIndex = -1;
    this.consumeContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, (context) => {
      this.#context = context ?? undefined;
      void this.#guardPlace(this._place);
      this.#leaveDrag?.();
      this.#leaveDrag = undefined;
      if (!context) return;
      this.#leaveDrag = context.registerDragWindow?.(this.#dragHandle);
      this.observe(
        context.clipboard,
        (clipboard) => {
          this.#cut = cutKeys(clipboard);
          this.#scheduleBorder();
        },
        'umbradesktopClipboard',
      );
    });
    if (!this.#placed) {
      this.#placed = true;
      const { place, view } = parseLocation(this.location);
      this._place = place;
      this._view = view;
    }
    this.addEventListener('click', this.#onClick);
    this.addEventListener('auxclick', this.#onClick);
    this.addEventListener('mousedown', this.#onMouseDown);
    this.addEventListener('pointerdown', this.#onPointerDown);
    this.addEventListener('paste', this.#onPaste);
    this.addEventListener('keydown', this.#onTreeKey);
    this.#stopGuard ??= guardRoutes(this);
    // Every upload into this window goes through core's dropzone here; each batch is shown in the
    // Transfers window (plan task 7.3).
    this.#stopUploads ??= watchUploads(this, (batch) => {
      this.#context?.followUpload?.(batch);
      this.#reportUploads(batch);
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const timer of [...this.#borderTimers, ...this.#selectTimers]) window.clearTimeout(timer);
    this.#borderTimers = [];
    this.#selectTimers = [];
    this.#leaveDrag?.();
    this.#leaveDrag = undefined;
    this.removeEventListener('click', this.#onClick);
    this.removeEventListener('auxclick', this.#onClick);
    this.removeEventListener('mousedown', this.#onMouseDown);
    this.removeEventListener('pointerdown', this.#onPointerDown);
    this.removeEventListener('paste', this.#onPaste);
    this.removeEventListener('keydown', this.#onTreeKey);
    this.#treeCurrent?.stop();
    this.#treeCurrent = undefined;
    window.clearTimeout(this.#pasteFallback);
    this.#stopUploads?.();
    this.#stopUploads = undefined;
    this.#stopGuard?.();
    this.#stopGuard = undefined;
    this.#releaseFocus();
  }

  /**
   * Keep the keyboard in the window for a while after opening an item, taking it back each time the
   * page beside it takes it, until the person presses anywhere.
   */
  #holdFocus(): void {
    this.#holdFocusUntil = Date.now() + HOLD_FOCUS_MS;
    this.addEventListener('focusout', this.#onFocusOut);
    document.addEventListener('pointerdown', this.#releaseFocus, true);
  }

  /** Stop keeping the keyboard: the person pressed somewhere, or the time is up. */
  #releaseFocus = (): void => {
    this.#holdFocusUntil = 0;
    this.removeEventListener('focusout', this.#onFocusOut);
    document.removeEventListener('pointerdown', this.#releaseFocus, true);
  };

  /**
   * The focus left the window. If it went into a frame (the page beside the window loading) within the
   * hold, take it back to the item that had it. Checked at once, for a frame that already has it, and
   * again a moment later: while the browser is still sending `focusout` the focus has not arrived yet.
   */
  #onFocusOut = (): void => {
    if (!this.#takeFocusBack()) window.setTimeout(() => this.#takeFocusBack(), 0);
  };

  /**
   * Within the hold, take the keyboard back from a frame that has it.
   * @returns True when it was taken back.
   */
  #takeFocusBack(): boolean {
    if (Date.now() > this.#holdFocusUntil) {
      this.#releaseFocus();
      return false;
    }
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active instanceof HTMLIFrameElement && this._selection.refocus();
  }

  /**
   * Select what a drop brought in, once core shows it, and bring the first into view.
   * @param keys The items.
   */
  #selectWhenShown(keys: string[]): void {
    for (const timer of this.#selectTimers) window.clearTimeout(timer);
    const wanted = keys.map((key) => key.toLowerCase());
    this.#selectTimers = SELECT_RETRIES_MS.map((delay, index) =>
      window.setTimeout(() => {
        const collection = this._folderHost?.collection();
        if (!collection) return;
        const shown = new Set(collection.items().map((item) => item.unique.toLowerCase()));
        const present = wanted.filter((key) => shown.has(key));
        const last = index === SELECT_RETRIES_MS.length - 1;
        if (present.length < wanted.length && !(last && present.length)) return;
        for (const timer of this.#selectTimers) window.clearTimeout(timer);
        this.#selectTimers = [];
        collection.selection.setSelection(present);
        const first = renderedItems(this._folderHost!).find((item) => item.unique.toLowerCase() === present[0]);
        first?.element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }, delay),
    );
  }

  /**
   * Say the window is busy while core's dropzone in it uploads. Those uploads belong to the dropzone,
   * so they stop if the window closes; as a task, closing the window, or leaving the desktop, asks
   * first (`window-progress.md`), and the window's own ring shows them.
   * @param batch The batch.
   */
  #reportUploads(batch: UmbraDesktopUploadBatch): void {
    const id = `media-upload-${++this.#uploadSequence}`;
    const report = () => {
      const files = batch.items().filter((item) => !item.folder);
      const waiting = files.some((item) => item.status === 'waiting');
      const detail = waiting
        ? { id, state: 'running', completed: files.filter((item) => item.status !== 'waiting').length, total: files.length, label: '#umbraDesktopMedia_uploading' }
        : { id, state: 'done' };
      this.dispatchEvent(new CustomEvent('umbradesktop-task', { detail, bubbles: true, composed: true }));
    };
    batch.onChange(report);
    void batch.done.then(report);
    report();
  }

  /** A press in this window makes it the one core's dialogs belong to; see `route-guard.ts`. */
  #onPointerDown = (): void => markActive(this);

  /**
   * Take a page core was about to navigate the desktop to, from a dialog opened in this window: an
   * item opens as a click on it would, a create page opens beside the window. Anything else is left to
   * the router.
   * @param url The address being pushed, as core wrote it.
   * @returns True when the window took it.
   */
  takeRoute(url: string): boolean {
    const intent = linkIntent(url, []);
    if (intent.kind === 'item') {
      void this.#openItem(intent.unique, false, false);
      return true;
    }
    if (intent.kind === 'create') {
      void this.#create(intent, false);
      return true;
    }
    return false;
  }

  /**
   * Rename an item: ask for the new name, save it, and show it on its card.
   * @param unique The item's key.
   */
  async #rename(unique: string): Promise<void> {
    const current = this._folderHost?.collection()?.items().find((item) => item.unique === unique)?.name ?? '';
    const name = await this.askName(current);
    if (name === undefined) return;
    const context = this.#context;
    if (!context) {
      // Outside a desktop there are no operations to run it as; the source saves it directly.
      if (await this.source.rename(unique, name)) this._folderHost?.reload();
      return;
    }
    const [item] = await refsOf(context.api, [unique]);
    if (item && item.name !== name.trim() && name.trim()) await context.rename(item, name.trim());
  }

  /**
   * Hold items for a paste, read from the server so a paste in any window knows what they are.
   * @param mode Cut or copy.
   * @param uniques Their keys.
   */
  async #hold(mode: 'cut' | 'copy', uniques: string[]): Promise<void> {
    const context = this.#context;
    if (context) context.hold(mode, await refsOf(context.api, uniques));
  }

  /**
   * Ctrl+C or Ctrl+X on the view's items. A copy of one item starts its picture on the OS clipboard
   * here, in the key's own moment, before the item is read: the browser refuses a clipboard write
   * that starts later, and reading the item is a trip to the server.
   * @param mode Cut or copy.
   * @param uniques The items' keys.
   */
  #holdKey(mode: 'cut' | 'copy', uniques: string[]): void {
    if (mode === 'copy' && uniques.length === 1) this.#context?.startPicture?.(uniques[0]);
    void this.#hold(mode, uniques);
  }

  /**
   * A key in the tree. The tree's items cannot be selected, so the clipboard keys act on the folder the
   * key is pressed on, as in a file manager's folder pane: Ctrl+C and Ctrl+X hold it, Ctrl+V pastes
   * into it. Ctrl+Z undoes, as anywhere in the window. Other keys are the tree's own.
   * @param event The key.
   */
  #onTreeKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !this._treeHost) return;
    const path = event.composedPath();
    if (!path.includes(this._treeHost)) return;
    const intent = keyIntent(event, this.#mac, path);
    const place = treePlaceAt(path);
    switch (intent?.kind) {
      case 'cut':
      case 'copy':
        if (place?.kind !== 'folder') return;
        event.preventDefault();
        void this.#hold(intent.kind, [place.unique]);
        return;
      case 'paste':
        // Not cancelled, as in the view: the browser then sends its paste, which may carry files.
        if (place && place.kind !== 'bin') this.#pasteKey(place);
        return;
      case 'undo':
        event.preventDefault();
        void this.#context?.undo?.();
        return;
      case 'trash':
        if (place?.kind !== 'folder') return;
        event.preventDefault();
        void this.#trashFolder(place.unique);
        return;
    }
  };

  /**
   * Delete on a tree folder: move it to the recycle bin, after asking. A window that showed it goes
   * to the folder it was in, as a file manager leaves a folder that is gone.
   * @param unique The folder's key.
   */
  async #trashFolder(unique: string): Promise<void> {
    const context = this.#context;
    if (!context) return;
    const [folder] = await refsOf(context.api, [unique]);
    if (!folder || !(await this.confirmTrash(folder.name))) return;
    await context.trash([folder]);
    if (this._place.kind === 'folder' && this._place.unique === unique) {
      this.#go(folder.parent === null ? { kind: 'root' } : { kind: 'folder', unique: folder.parent });
    }
  }

  /**
   * Ctrl+V: wait for the paste event the key makes the browser send, and paste what is held when none
   * comes.
   * @param target Where to paste: a tree folder the key was pressed on, or the folder the window shows.
   */
  #pasteKey(target: UmbraDesktopMediaPlace = this._place): void {
    this.#pasteTarget = target;
    window.clearTimeout(this.#pasteFallback);
    this.#pasteFallback = window.setTimeout(() => {
      this.#pasteFallback = undefined;
      void this.#paste(this.#takePasteTarget());
    }, PASTE_EVENT_WAIT_MS);
  }

  /**
   * Where the paste under way goes, used up as it is read.
   * @returns The place.
   */
  #takePasteTarget(): UmbraDesktopMediaPlace {
    const target = this.#pasteTarget ?? this._place;
    this.#pasteTarget = undefined;
    return target;
  }

  /**
   * A paste into the window: the only place the OS clipboard can be read. A paste into a field (core's
   * filter, a dialog's input) is the field's.
   * @param event The paste.
   */
  #onPaste = (event: ClipboardEvent): void => {
    if (inField(event.composedPath())) return;
    event.preventDefault();
    window.clearTimeout(this.#pasteFallback);
    this.#pasteFallback = undefined;
    // Read now: the browser empties the clipboard data once the event has been sent.
    void this.#pasteFrom(pastedFiles(event.clipboardData), this.#takePasteTarget());
  };

  /**
   * Paste what a paste brought: files upload into the folder, and our own picture coming back, or
   * nothing usable, pastes what the manager holds (design §5).
   * @param files The files the paste carried.
   * @param target Where they go.
   */
  async #pasteFrom(files: File[], target: UmbraDesktopMediaPlace): Promise<void> {
    const heldIsNewer = this.#context?.heldIsNewer?.() ?? false;
    const intent = await pasteIntent(files, heldIsNewer ? undefined : await this.#context?.osPicture?.(), heldIsNewer);
    if (intent.kind === 'files') await this.#upload(intent.files, target);
    else await this.#paste(target);
  }

  /**
   * Upload files into the folder this window shows, through core's own dropzone in the window, so core
   * picks the types and draws its placeholders as it does for a drop. A pasted picture without a name
   * is named for when it was pasted. Into a tree folder that is not the window's, they upload
   * directly, since core's dropzone in the window uploads into the window's folder.
   * @param files The files.
   * @param place Where they go.
   */
  async #upload(files: File[], place: UmbraDesktopMediaPlace = this._place): Promise<void> {
    if (place.kind === 'bin') return;
    const context = this.#context;
    if (context?.canUse && !(await context.canUse(place.kind === 'folder' ? place.unique : null))) {
      context.refuseAccess?.(files[0]?.name ?? '');
      return;
    }
    const at = new Date();
    const prefix = this.localize.term('umbraDesktopMedia_pastedImage');
    const named = files.map((file) => nameForPaste(file, at, prefix));
    // What a drop on core's dropzone sends: uui's file dropzone's `change`, which core's dropzone
    // handles as it handles a drop (its `onUpload` is deprecated from 17.7).
    const zone = this._folderHost ? deepFind(this._folderHost, (element) => element.tagName === 'UMB-DROPZONE-MEDIA') : undefined;
    const fileDropzone = zone ? deepFind(zone, (element) => element.tagName === 'UUI-FILE-DROPZONE') : undefined;
    if (fileDropzone && samePlace(place, this._place)) {
      fileDropzone.dispatchEvent(new CustomEvent('change', { detail: { files: named, folders: [] } }));
      return;
    }
    // No dropzone in the view: upload directly, and show what arrived.
    await uploadInto(this, { files: named, folders: [] }, place.kind === 'folder' ? place.unique : null);
    this._folderHost?.reload();
  }

  /**
   * Paste what is held into a folder; not into the recycle bin. The folder it lands in shows it in the
   * tree: loading at once, then open with the folders that arrived lit.
   * @param place The folder: the window's, unless a tree folder was pasted on.
   */
  async #paste(place: UmbraDesktopMediaPlace = this._place): Promise<void> {
    if (place.kind === 'bin') return;
    const context = this.#context;
    if (!context) return;
    const clipboard = context.getClipboard?.();
    const into = pasteInto(clipboard, place.kind === 'folder' ? place.unique : null);
    const done = this.#arriving(into);
    let result;
    try {
      result = await context.paste(place.kind === 'folder' ? place.unique : null);
    } finally {
      done();
    }
    const folders = (result?.succeeded ?? [])
      .filter((each) => isPlaceRef(each.item))
      .map((each) => (clipboard?.mode === 'copy' ? each.created?.[0] : each.item.unique))
      .filter((each): each is string => !!each);
    this.#landed(into, folders);
  }

  /**
   * Work into a folder started: show it loading in the tree.
   * @param unique The folder, null for the root.
   * @returns Call when it is done.
   */
  #arriving(unique: string | null): () => void {
    return this.#arrival?.start(unique === null ? { kind: 'root' } : { kind: 'folder', unique }) ?? (() => undefined);
  }

  /**
   * Work into a folder is done: open it in the tree, with the folders that arrived lit.
   * @param unique The folder, null for the root.
   * @param folders The keys of the folders that arrived.
   */
  #landed(unique: string | null, folders: string[]): void {
    void this.#arrival?.land(unique === null ? { kind: 'root' } : { kind: 'folder', unique }, folders);
  }

  /**
   * Empty a cut, as Esc does once nothing is selected.
   * @returns True when there was a cut to empty.
   */
  #emptyCut(): boolean {
    if (!this.#context || this.#context.getClipboard()?.mode !== 'cut') return false;
    this.#context.empty();
    return true;
  }

  /**
   * Create what Create offered: a folder in the window, by name alone, as a file manager's New folder
   * does, since core's page beside the window had nothing for it but a name (owner's test, 2026-10-19);
   * anything else on core's create page beside the window. The new folder is selected and lit in the
   * tree once it shows.
   * @param intent What Create offered: the folder it goes in, the media type and core's create page.
   * @param floating Whether to open core's page as a window, as Shift-click asks.
   */
  async #create(intent: { parent: string | null; mediaType: string; path: string }, floating: boolean): Promise<void> {
    const context = this.#context;
    if (context?.canUse && !(await context.canUse(intent.parent))) {
      context.refuseAccess?.(this.localize.term('umbraDesktopMedia_createConfirm'));
      return;
    }
    if (!context?.isFolderType || !(await context.isFolderType(intent.mediaType))) {
      this.#openCreate(intent.path, floating);
      return;
    }
    const name = await this.askFolderName();
    if (!name) return;
    const created = await context.createFolder(intent.parent, intent.mediaType, name);
    if (!created) return;
    this.#selectWhenShown([created]);
    this.#landed(intent.parent, [created]);
  }

  /**
   * Open core's create page beside the window, in the folder its address names.
   * @param path The create page.
   * @param floating Whether to open it as a window, as Shift-click asks.
   */
  #openCreate(path: string, floating: boolean): void {
    this.#namedKey = undefined;
    this.#openBeside(path, this.localize.term('umbraDesktopMedia_newItem'), 'icon-add', floating);
  }

  override willUpdate(changed: Map<string, unknown>): void {
    super.willUpdate(changed);
    if (changed.has('source')) this.#window.setSource(this.source);
    if (changed.has('attached')) this.#onAttached();
  }

  /**
   * The desktop says what is open beside the window: move the border, and name the pane after an item
   * it reached without this window asking.
   */
  #onAttached(): void {
    const key = openKeyFrom(this.attached);
    // The page moved on from what it showed (another item, a new item saved, or closed): whatever was
    // saved there was saved in another backoffice, so the window reloads to show it on its card.
    const path = this.attached[UMBRADESKTOP_OPEN_ITEM_KEY];
    const now = path ? (key ?? 'create') : undefined;
    if (this.#besideWas !== undefined && now !== this.#besideWas) this.#reloadShown();
    this.#besideWas = now;
    this.#scheduleBorder();
    if (key === this.#namedKey) return;
    this.#namedKey = key;
    if (key) void this.#nameOpenItem(key);
  }

  /**
   * Load the folder the window shows again, after a save in the page beside it. Through the desktop
   * context's reload, core's own event, so the tree reloads it too and a folder created or renamed
   * there shows in it (owner's test, 2026-10-19); outside a desktop, the collection alone.
   */
  #reloadShown(): void {
    const place = this._place;
    const context = this.#context;
    if (place.kind === 'bin' || !context?.reloadFolder) {
      this._folderHost?.reload();
      return;
    }
    context.reloadFolder(place.kind === 'folder' ? place.unique : null);
  }

  /**
   * Name the pane after an item it is already on. Sent as an open request for the page it is on,
   * which the desktop answers by renaming the pane rather than routing it.
   * @param key The item's key.
   */
  async #nameOpenItem(key: string): Promise<void> {
    const item = await this.source.item(key);
    if (!item || openKeyFrom(this.attached) !== key) return;
    this.#openBeside(editPath(key), itemName(item), item.mediaType.icon, false);
  }

  /** Look for core's cards now and a few times after, to put the border on the open item's card. */
  #scheduleBorder(): void {
    for (const timer of this.#borderTimers) window.clearTimeout(timer);
    this.#borderTimers = BORDER_RETRIES_MS.map((delay) =>
      window.setTimeout(() => {
        if (!this._folderHost) return;
        markOpenItem(this._folderHost, openKeyFrom(this.attached));
        markCutItems(this._folderHost, this.#cut);
      }, delay),
    );
  }

  /**
   * Ask the desktop for a page beside this window, under the one key the window opens items under.
   * @param path The page.
   * @param name The pane's title.
   * @param icon The pane's icon.
   * @param floating Whether to open it as a window, as Shift-click asks.
   */
  #openBeside(path: string, name: string, icon: string, floating: boolean): void {
    this.dispatchEvent(
      new CustomEvent<UmbraDesktopOpenAttachedDetail>('umbradesktop-open-attached', {
        detail: { key: UMBRADESKTOP_OPEN_ITEM_KEY, path, name, icon, floating },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Show a place in this window, and tell the desktop where the window now is.
   * @param place The place.
   */
  #go(place: UmbraDesktopMediaPlace): void {
    if (samePlace(place, this._place)) return;
    this._place = place;
    this.#reportLocation();
  }

  /** Tell the desktop where the window is, for it to reopen there. */
  #reportLocation(): void {
    this.dispatchEvent(
      new CustomEvent('umbradesktop-app-location', {
        detail: { location: printLocation(this._place, this._view) },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The place has loaded: name the window after it. A `#key` is core's own word, put into this
   * window's language here, because a window title is plain text.
   * @param event The folder host's event.
   */
  #onFolderLoaded = (event: CustomEvent<{ name: string }>): void => {
    this.#scheduleBorder();
    const title = this.localize.string(event.detail.name);
    this.dispatchEvent(new CustomEvent('umbradesktop-app-title', { detail: { title }, bubbles: true, composed: true }));
  };

  /**
   * Keep a middle press on a link from starting the browser's autoscroll, which it does before any
   * click arrives.
   * @param event The press.
   */
  #onMouseDown = (event: MouseEvent): void => {
    if (event.button === 1 && this.#linkIn(event)) event.preventDefault();
  };

  /**
   * The link a click landed on, if it landed on one. Read from the composed path, because core's links
   * sit in shadow roots several levels down.
   * @param event The click.
   * @returns The link's href, or undefined.
   */
  #linkIn(event: Event): string | undefined {
    for (const node of event.composedPath()) {
      if (node === this) return undefined;
      if (node instanceof HTMLAnchorElement && node.hasAttribute('href')) return node.getAttribute('href') ?? undefined;
    }
    return undefined;
  }

  /**
   * Close the popover menu a click came from, if it came from one.
   * @param event The click.
   */
  #closeMenuOf(event: Event): void {
    for (const node of event.composedPath()) {
      if (node === this) return;
      if (node instanceof HTMLElement && node.hasAttribute('popover')) {
        if (node.matches(':popover-open')) node.hidePopover();
        return;
      }
    }
  }

  /**
   * Every click and middle-click in the window, in the bubble phase: after core's own handlers, so a
   * click core already handled (a card in select-only mode, say) is left alone, and before the click
   * reaches the page's window, where the router would take it.
   * @param event The click.
   */
  #onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented) return;
    const href = this.#linkIn(event);
    if (href === undefined) return;
    const views = (this._folderHost?.views() ?? []).map((view) => ({ alias: view.alias, pathName: view.meta?.pathName ?? '' }));
    const intent = linkIntent(href, views);
    if (intent.kind === 'other') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'auxclick' && event.button !== 1) return;
    // Ctrl or Cmd on a tree folder opens it in a new window, as a middle-click does: in the
    // collection the same keys select instead, which the selection controller has already done.
    const inTree = !!this._treeHost && event.composedPath().includes(this._treeHost);
    const middle = event.type === 'auxclick' || (inTree && hasPrimaryModifier(event, this.#mac));
    switch (intent.kind) {
      case 'place':
        if (middle) this.#window.openInNewWindow(intent.place);
        else this.#go(intent.place);
        return;
      case 'item':
        void this.#openItem(intent.unique, middle, event.shiftKey, inTree);
        return;
      case 'create':
        // Core's create page, in the folder this window shows: Create's own links already carry it.
        // Core's menu closes itself when the page changes, which here it does not, so it is closed.
        this.#closeMenuOf(event);
        void this.#create(intent, event.shiftKey);
        return;
      case 'view':
        if (middle) return;
        this._view = intent.alias;
        void this._folderHost?.setView(intent.alias);
        this.#reportLocation();
        this.#scheduleBorder();
        return;
      default:
        // Any other backoffice link: never followed from inside a window.
        return;
    }
  };

  /**
   * An item was clicked: a folder opens in this window, or in a new one on a middle-click; anything
   * else opens beside the window, as a window of its own on Shift-click. In the tree everything is a
   * place, so every tree item opens as a folder does: one that is no folder, an image that holds items
   * say, is a virtual folder, whose items Umbraco's collection lists through this package's server
   * code (#158, design §19). Its card stays the item, and opens beside.
   * @param unique The item's key.
   * @param middle Whether it was a middle-click.
   * @param floating Whether Shift was held.
   * @param inTree Whether it was clicked in the tree.
   */
  async #openItem(unique: string, middle: boolean, floating: boolean, inTree = false): Promise<void> {
    const item = await this.source.item(unique);
    if (!item) return;
    if (!inTree && !isFolder(item)) {
      this.#namedKey = unique.toLowerCase();
      this.#openBeside(editPath(unique), itemName(item), item.mediaType.icon, floating);
      if (!floating) this.#holdFocus();
      return;
    }
    const place: UmbraDesktopMediaPlace = { kind: 'folder', unique };
    if (middle) this.#window.openInNewWindow(place);
    else this.#go(place);
  }

  /**
   * Mark the window's folder in its tree once the tree is drawn, and again whenever the window moves.
   * @param changed What changed.
   */
  override updated(changed: PropertyValues): void {
    super.updated(changed);
    if ((changed.has('drop') && this.drop) || (changed.has('mark') && this.mark)) this.#placeShade();
    if (!this.#treeCurrent && this._treeHost) {
      this.#arrival = new UmbraDesktopTreeArrival(this._treeHost);
      this.#treeCurrent = new UmbraDesktopTreeCurrent(this._treeHost);
      this.#treeCurrent.show(this._place);
      void this.#reveal(this._place);
    } else if (changed.has('_place')) {
      this.#treeCurrent?.show(this._place);
      void this.#reveal(this._place);
    }
    if (changed.has('_place')) void this.#guardPlace(this._place);
  }

  /**
   * Keep the window out of a folder the person cannot reach: one restored from before their start
   * folders changed, or opened from an address. It goes to Media, which shows them their start
   * folders, as the Media section does (a restricted user's check, 2026-10-19).
   * @param place The place the window shows.
   */
  async #guardPlace(place: UmbraDesktopMediaPlace): Promise<void> {
    if (place.kind !== 'folder' || !this.#context?.canUse) return;
    if (await this.#context.canUse(place.unique)) return;
    if (samePlace(place, this._place)) this.#go({ kind: 'root' });
  }

  /**
   * Lay the drop shade over core's view area alone: its body layout's `#main`, between the toolbar
   * and the selection bar, which a shade over the whole folder area covered too (owner's test,
   * 2026-10-19). Measured when the shade shows, since core's toolbar and bar come and go. Without a
   * view to measure, the shade fills the folder area, its cell in the window's grid.
   */
  #placeShade(): void {
    const shade = this.shadowRoot?.querySelector<HTMLElement>('.drop-shade');
    if (!shade) return;
    const main = this._folderHost
      ? deepFind(this._folderHost, (element) => element.id === 'main' && (element.getRootNode() as ShadowRoot).host?.tagName === 'UMB-BODY-LAYOUT')
      : undefined;
    const area = main?.getBoundingClientRect();
    if (!area || !area.width || !area.height) {
      shade.removeAttribute('style');
      return;
    }
    const frame = this.getBoundingClientRect();
    // Out of its grid cell, which an absolutely placed grid item would otherwise measure from.
    shade.style.cssText = `position:absolute;grid-column:auto;grid-row:auto;left:${area.left - frame.left}px;top:${area.top - frame.top}px;width:${area.width}px;height:${area.height}px;`;
  }

  /**
   * Open the tree down to the place the window shows, as the Media section's tree follows the folder
   * on screen: a window opened on a folder, or gone into one from its view, shows it in the tree too
   * (owner's test, 2026-10-18). Nothing is closed.
   * @param place The place.
   */
  async #reveal(place: UmbraDesktopMediaPlace): Promise<void> {
    if (!this.#arrival || place.kind === 'bin') return;
    if (place.kind === 'root') return this.#arrival.openTo([]);
    const parents = (await this.source.parents?.(place.unique)) ?? new Map<string, string | null>();
    if (!samePlace(place, this._place)) return;
    await this.#arrival.openTo(ancestorChain(parents.get(place.unique) ?? null, parents));
  }

  override render() {
    return html`
      <umbradesktop-media-tree-host class="tree"></umbradesktop-media-tree-host>
      <umbradesktop-media-folder-host
        class="contents"
        .source=${this.source}
        .place=${this._place}
        .view=${this._view}
        @umbradesktop-media-folder-loaded=${this.#onFolderLoaded}></umbradesktop-media-folder-host>
      <div class="drop-shade"></div>
      <umbradesktop-media-selection-box></umbradesktop-media-selection-box>
      ${this.#renderDropLabel()}
    `;
  }

  /**
   * The label under the pointer while a drag is over this window: what letting go will do, and how to
   * change it. Folder names and reasons may be core's `#keys`, put into the person's language here.
   * @returns The label, or nothing.
   */
  #renderDropLabel() {
    const label = this._dropLabel;
    if (!label) return nothing;
    const word = (arg: string | number) => (typeof arg === 'string' ? this.localize.string(arg) : arg);
    return html`<div class="drop-label" ?refused=${label.refused} style="left:${label.x}px;top:${label.y}px" role="status">
      ${label.lines.map((line) => html`<div>${this.localize.term(line.key, ...line.args.map(word))}</div>`)}
    </div>`;
  }

  static override styles = css`
    :host {
      /* The tree's width, the one number the layout has. */
      --umbradesktop-media-tree-width: 220px;
      display: grid;
      grid-template-columns: var(--umbradesktop-media-tree-width) minmax(0, 1fr);
      /* One row, as tall as the window and no taller, so the tree and the view each scroll inside it. */
      grid-template-rows: minmax(0, 1fr);
      height: 100%;
      min-height: 0;
      background: var(--uui-color-background);
      color: var(--uui-color-text);
      font-family: var(--umbradesktop-app-font, inherit);
      /* The selection box is drawn over the window, from its own corner. */
      position: relative;
    }

    /* The window takes the keyboard to pass keys to its items; the focus shows on the item, as the
       card's or row's own focus ring, not as a ring round the whole window. */
    :host(:focus) {
      outline: none;
    }

    /* Each in its own cell, named: the drop shade shares the folder area's cell, and an element left to
       auto-placement would be pushed into a new row by it. */
    .tree {
      grid-column: 1;
      grid-row: 1;
      background: var(--uui-color-surface);
      border-right: 1px solid var(--uui-color-border);
    }

    .contents {
      grid-column: 2;
      grid-row: 1;
      min-width: 0;
    }

    /* A drag over the window lands in the folder it shows: that area is covered, bordered and tinted
       in the theme's selection colour, or its danger colour when nothing would go. Above core's
       dropzone overlay (100), below the label (200); it takes no pointer, so the drag reads through. */
    .drop-shade {
      display: none;
      grid-column: 2;
      grid-row: 1;
      z-index: 150;
      pointer-events: none;
      box-sizing: border-box;
      border: ${unsafeCSS(DROP_OUTLINE_PX)}px solid ${unsafeCSS(dropColour(false))};
      background: ${unsafeCSS(dropTint(dropColour(false)))};
    }

    :host([drop]) .drop-shade {
      display: block;
    }

    :host([drop='refused']) .drop-shade {
      border-color: ${unsafeCSS(dropColour(true))};
      background: ${unsafeCSS(dropTint(dropColour(true)))};
    }

    /* Before the pointer gets there, the drag's mark: the shade without its border, a light tint where
       the items would go, and the view washed out to the same strength a refusing tree row is dimmed to. */
    :host([mark]:not([drop])) .drop-shade {
      display: block;
      border: none;
    }

    :host([mark='accepts']:not([drop])) .drop-shade {
      background: ${unsafeCSS(markTint())};
    }

    :host([mark='refuses']:not([drop])) .drop-shade {
      background: color-mix(in srgb, var(--uui-color-surface, #fff) ${unsafeCSS(Math.round((1 - MARK_DIM_OPACITY) * 100))}%, transparent);
    }

    .drop-label {
      position: absolute;
      /* Above core's dropzone overlay, which is drawn at 100 during a drag of files from the OS. */
      z-index: 200;
      pointer-events: none;
      max-width: 280px;
      padding: var(--uui-size-space-2, 6px) var(--uui-size-space-3, 9px);
      border-radius: var(--uui-border-radius, 3px);
      background: var(--uui-color-surface, #fff);
      color: var(--uui-color-text, #000);
      border: 1px solid var(--uui-color-border, #d8d7d9);
      box-shadow: var(--uui-shadow-depth-2, 0 2px 6px rgba(0, 0, 0, 0.2));
      font-size: var(--uui-type-small-size, 12px);
      line-height: 1.4;
    }

    .drop-label > div + div {
      color: var(--uui-color-text-alt, #515054);
    }

    .drop-label[refused] {
      border-color: var(--uui-color-danger, #d42054);
      color: var(--uui-color-danger, #d42054);
    }
  `;
}

export default UmbraDesktopMediaManagerElement;

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-manager': UmbraDesktopMediaManagerElement;
  }
}

/**
 * The first element under a root, through shadow roots, that a test accepts.
 * @param root Where to look.
 * @param test The test.
 * @returns The element, or undefined.
 */
function deepFind(root: Element, test: (element: Element) => boolean): Element | undefined {
  const queue: ParentNode[] = [root.shadowRoot ?? root];
  while (queue.length) {
    const node = queue.shift()!;
    for (const element of node.querySelectorAll('*')) {
      if (test(element)) return element;
      if (element.shadowRoot) queue.push(element.shadowRoot);
    }
  }
  return undefined;
}
