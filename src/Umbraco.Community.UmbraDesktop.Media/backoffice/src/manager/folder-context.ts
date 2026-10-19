import { UmbBasicState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The alias core's media workspace context is provided under. Core's media collection and its Create
 * action read the folder they work in from that context, not from the collection's configuration.
 */
export const UMBRADESKTOP_WORKSPACE_CONTEXT_ALIAS = 'UmbWorkspaceContext';

/**
 * A stand-in for core's media workspace context, so that core's media collection, hosted in a manager
 * window, creates and uploads into the window's folder rather than into the root (hosting spike,
 * workaround 1).
 *
 * **This stands in for an internal contract.** Core's `umb-media-collection` reads its dropzone's
 * parent from `UMB_MEDIA_WORKSPACE_CONTEXT.unique`, and Create builds its links from the same context
 * and lists the types `contentTypeUnique` allows. Nothing documents that, so a release can change it.
 * It is what the Media section does too: there the folder's own workspace is the provider. Measured
 * working on 17.7. The upstream fix would be for the collection to read its parent from its
 * configuration or from `UMB_ENTITY_CONTEXT`, which a manager window already provides; design §15 says
 * why that was not asked for. If a release breaks this, Create and uploads land in the media root.
 *
 * Only what core reads is here. The context token's discriminator checks `getEntityType()` is
 * `media`, which is why this says so.
 */
export class UmbraDesktopMediaFolderContext {
  /** Core's media workspace alias, for anything that checks which workspace it is in. */
  readonly workspaceAlias = 'Umb.Workspace.Media';

  /** The element core's actions treat as the workspace's host: the folder host. */
  #host: Element;

  /** The folder's key. */
  #unique: UmbBasicState<string | null>;

  /** The folder's media type, which decides what Create offers. */
  #contentTypeUnique: UmbBasicState<string | undefined>;

  /** The folder's key, as core observes it. */
  readonly unique;

  /** The folder's media type, as core observes it. */
  readonly contentTypeUnique;

  /**
   * @param host The element hosting the collection.
   * @param unique The folder's key.
   * @param contentTypeUnique The folder's media type.
   */
  constructor(host: Element, unique: string, contentTypeUnique: string | undefined) {
    this.#host = host;
    this.#unique = new UmbBasicState<string | null>(unique);
    this.#contentTypeUnique = new UmbBasicState<string | undefined>(contentTypeUnique);
    this.unique = this.#unique.asObservable();
    this.contentTypeUnique = this.#contentTypeUnique.asObservable();
  }

  /** @returns `media`, which the media workspace token's discriminator checks. */
  getEntityType(): string {
    return 'media';
  }

  /** @returns The folder's key. */
  getUnique(): string | null {
    return this.#unique.getValue();
  }

  /** @returns The folder's media type. */
  getContentTypeUnique(): string | undefined {
    return this.#contentTypeUnique.getValue();
  }

  /** @returns The folder host. */
  getHostElement(): Element {
    return this.#host;
  }

  /** Nothing to release; here because core may call it on anything it holds as a context. */
  destroy(): void {}
}
