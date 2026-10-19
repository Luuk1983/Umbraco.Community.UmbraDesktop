import { css, customElement, nothing, property, state } from '@umbraco-cms/backoffice/external/lit';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import { UmbContextProviderController } from '@umbraco-cms/backoffice/context-api';
import type { Observable } from '@umbraco-cms/backoffice/external/rxjs';
import type { UmbCollectionConfiguration } from '@umbraco-cms/backoffice/collection';
import { UMBRADESKTOP_COLLECTION_API_EVENT, UmbraDesktopMediaHostedCollectionElement } from './hosted-collection.element.js';
import { UMBRADESKTOP_WORKSPACE_CONTEXT_ALIAS, UmbraDesktopMediaFolderContext } from './folder-context.js';
import { UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW, UmbraDesktopMediaServerSource, itemName } from './media-source.js';
import type { UmbraDesktopMediaSource } from './media-source.js';
import { layoutsLeading, memoryOf, viewMemory } from './view-switch.js';
import type { UmbraDesktopLayout } from './view-switch.js';
import type { UmbraDesktopMediaPlace } from './location.js';

/** Core's media collection. */
export const UMBRADESKTOP_MEDIA_COLLECTION = 'Umb.Collection.Media';

/** Core's collection of what is in the media recycle bin, as its recycle bin workspace shows it. */
export const UMBRADESKTOP_MEDIA_BIN_COLLECTION = 'Umb.Collection.Media.RecycleBin.TreeItemChildren';

/** The event the host dispatches once it knows the place's name, with `{ name }`: a `#key` or plain text. */
export const UMBRADESKTOP_FOLDER_LOADED_EVENT = 'umbradesktop-media-folder-loaded';

/** A collection view, as much of its manifest as the manager reads. */
export interface UmbraDesktopMediaViewManifest {
  /** The view's alias. */
  alias: string;
  /** Its path segment and switcher text, from its manifest. */
  meta?: { pathName?: string; label?: string };
}

/** Core's selection manager, as much of it as the window uses. */
export interface UmbraDesktopCollectionSelection {
  /** The selected keys. */
  getSelection(): ReadonlyArray<string | null>;
  /**
   * Replace the selection.
   * @param value The keys to select.
   */
  setSelection(value: Array<string>): void;
  /**
   * Add one key.
   * @param unique The key.
   */
  select(unique: string): void;
  /**
   * Remove one key.
   * @param unique The key.
   */
  deselect(unique: string): void;
  /** Select nothing. */
  clearSelection(): void;
}

/** One item of core's collection, as much of it as the window reads. */
export interface UmbraDesktopCollectionItem {
  /** Its key. */
  unique: string;
  /** Its name. */
  name: string;
}

/** Core's collection in a window: what is shown, in core's order, and what is selected. */
export interface UmbraDesktopHostedCollection {
  /** The items shown, in core's order. */
  items(): ReadonlyArray<UmbraDesktopCollectionItem>;
  /** Core's own selection, never a copy (plan phase 3). */
  selection: UmbraDesktopCollectionSelection;
}

/** As much of core's collection context as the host reads, typed loosely because releases differ. */
interface UmbraDesktopCollectionContextShape {
  /** Core's view manager, with the views on offer. */
  view?: { views?: Observable<ReadonlyArray<UmbraDesktopMediaViewManifest>> };
  /** Core's selection manager. */
  selection?: UmbraDesktopCollectionSelection;
  /** The items shown. */
  items?: Observable<ReadonlyArray<{ unique: string; name?: string }>>;
}

/**
 * One place's contents: core's own media collection, hosted for a folder, the Media root or the
 * recycle bin, with what core needs around it to behave as it does in the Media section.
 *
 * Three things go around it. The entity context tells core's actions and reloads which entity the
 * window shows, as core's media dashboard does. In a folder, a stand-in workspace context tells
 * Create and the dropzone where they are ({@link UmbraDesktopMediaFolderContext}). And the view is
 * set per window, never through the address ({@link setView}).
 *
 * A new place builds a new collection rather than reconfiguring the old one, as the Media section
 * does when it routes to another folder: everything core keeps per collection (selection, filter,
 * page) belongs to the place it was made for.
 */
@customElement('umbradesktop-media-folder-host')
export class UmbraDesktopMediaFolderHostElement extends UmbLitElement {
  /** Where the server is asked; a test hands in its own. */
  @property({ attribute: false })
  source: UmbraDesktopMediaSource = new UmbraDesktopMediaServerSource(this);

  /** The place to show. */
  @property({ attribute: false })
  place: UmbraDesktopMediaPlace = { kind: 'root' };

  /** The collection view this window shows, or undefined for core's default. */
  @property({ attribute: false })
  view?: string;

  /** The collection core renders, rebuilt per place. */
  @state()
  private _collection?: UmbraDesktopMediaHostedCollectionElement;

  /** Which entity the window shows, for core's actions and reloads. */
  #entity = new UmbEntityContext(this);

  /** The stand-in workspace context while the place is a folder. */
  #folderProvider?: UmbContextProviderController;

  /** Counts builds, so a slow answer for a place the window has since left is dropped. */
  #builds = 0;

  /** The hosted collection's context, once core has made it. */
  #api?: unknown;

  /** The views the hosted collection offers, in core's order. */
  #views: ReadonlyArray<UmbraDesktopMediaViewManifest> = [];

  /** The items core shows, in its order. */
  #items: ReadonlyArray<UmbraDesktopCollectionItem> = [];

  /** The place's collection configuration, as the list view gave it. */
  #config?: UmbCollectionConfiguration;

  /** What was selected when the view switched, for the rebuilt collection to select again. */
  #carriedSelection?: ReadonlyArray<string>;

  /**
   * The views on offer in this window, for reading a view link and for the view switcher.
   * @returns The views, in core's order.
   */
  views(): ReadonlyArray<UmbraDesktopMediaViewManifest> {
    return this.#views;
  }

  /**
   * Called with the hosted collection's context once core has made it: the moment the window can
   * switch views in place, and learns which views there are.
   * @param api The collection context, typed loosely because the members read differ by release.
   */
  collectionReady(api: unknown): void {
    this.#api = api;
    const context = api as UmbraDesktopCollectionContextShape | undefined;
    const views = context?.view?.views;
    if (views) this.observe(views, (list) => (this.#views = list ?? []), 'umbradesktopViews');
    this.#items = [];
    const items = context?.items;
    if (items) {
      this.observe(
        items,
        (list) => (this.#items = (list ?? []).map((item) => ({ unique: item.unique, name: item.name ?? '' }))),
        'umbradesktopItems',
      );
    }
    if (this.#carriedSelection?.length) context?.selection?.setSelection([...this.#carriedSelection]);
    this.#carriedSelection = undefined;
  }

  /**
   * Show a collection view in this window only, by building the collection again to open on it.
   *
   * Not in place: core's router slot ignores new routes whose paths match the old ones, so a view
   * core remembers is only applied when the address changes, which a window must never do (measured
   * on 17.7). From 17.7 the new collection opens on the remembered view; before, on the first of its
   * layouts. The selection is carried across, as a view switch in the Media section keeps it.
   * @param alias The view's alias.
   */
  async setView(alias: string): Promise<void> {
    this.view = alias;
    this.#carriedSelection = ((this.#api as UmbraDesktopCollectionContextShape | undefined)?.selection?.getSelection() ?? []).filter((each): each is string => !!each);
    if (memoryOf(this.#api) || !this.#api) {
      this.#mount(this.#config ?? {});
      return;
    }
    const layouts = layoutsLeading(this.#views, this.#config?.layouts as ReadonlyArray<UmbraDesktopLayout> | undefined, alias);
    this.#mount({ ...(this.#config ?? {}), layouts } as UmbCollectionConfiguration);
  }

  /**
   * Core's collection in this window, once core has made it: its items and its selection, for the
   * window's keys and selection box.
   * @returns The collection, or undefined before core has made it.
   */
  collection(): UmbraDesktopHostedCollection | undefined {
    const selection = (this.#api as UmbraDesktopCollectionContextShape | undefined)?.selection;
    if (!selection) return undefined;
    return { items: () => this.#items, selection };
  }

  /**
   * Ask core's collection to load again, as core does after an action of its own. An item saved in the
   * page beside the window was saved in a backoffice of its own, which this collection never hears
   * from, so the window asks for it (#144).
   */
  reload(): void {
    (this.#api as { loadCollection?: () => void } | undefined)?.loadCollection?.();
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (changed.has('place') || changed.has('source')) void this.#build();
  }

  /** Build the collection for the current place. */
  async #build(): Promise<void> {
    const build = ++this.#builds;
    const place = this.place;
    this.#folderProvider?.destroy();
    this.#folderProvider = undefined;
    this.#api = undefined;
    this.#views = [];

    let name: string;
    let listView = UMBRADESKTOP_DEFAULT_MEDIA_LIST_VIEW;
    let unique: string | null = null;
    if (place.kind === 'folder') {
      const item = await this.source.item(place.unique);
      if (build !== this.#builds) return;
      unique = place.unique;
      name = item ? itemName(item) : '#sections_media';
      if (item?.mediaType.collection) listView = item.mediaType.collection.unique;
      this.#folderProvider = new UmbContextProviderController(
        this,
        UMBRADESKTOP_WORKSPACE_CONTEXT_ALIAS,
        new UmbraDesktopMediaFolderContext(this, place.unique, item?.mediaType.unique) as never,
      );
      this.#entity.setEntityType('media');
      this.#entity.setUnique(place.unique);
    } else {
      name = place.kind === 'bin' ? '#general_recycleBin' : '#sections_media';
      this.#entity.setEntityType(place.kind === 'bin' ? 'media-recycle-bin-root' : 'media-root');
      this.#entity.setUnique(null);
    }

    const config = place.kind === 'bin' ? ({ pageSize: 50 } as UmbCollectionConfiguration) : await this.source.collectionConfig(unique, listView);
    if (build !== this.#builds) return;
    this.#config = config;
    this.#mount(config);
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_FOLDER_LOADED_EVENT, { detail: { name } }));
  }

  /**
   * Put a new collection in, for the current place, with a configuration.
   * @param config The collection's configuration.
   */
  #mount(config: UmbCollectionConfiguration): void {
    const collection = new UmbraDesktopMediaHostedCollectionElement();
    collection.alias = this.place.kind === 'bin' ? UMBRADESKTOP_MEDIA_BIN_COLLECTION : UMBRADESKTOP_MEDIA_COLLECTION;
    collection.config = config;
    // Read by core from 17.7, which then opens on the remembered view; an unknown property before.
    if (this.view) (collection as unknown as { interactionMemories: unknown }).interactionMemories = [viewMemory(this.view)];
    collection.addEventListener(UMBRADESKTOP_COLLECTION_API_EVENT, (event) => this.collectionReady((event as CustomEvent<{ api: unknown }>).detail.api));
    this._collection = collection;
  }

  override render() {
    return this._collection ?? nothing;
  }

  static override styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    umbradesktop-media-hosted-collection {
      display: block;
      height: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-folder-host': UmbraDesktopMediaFolderHostElement;
  }
}
