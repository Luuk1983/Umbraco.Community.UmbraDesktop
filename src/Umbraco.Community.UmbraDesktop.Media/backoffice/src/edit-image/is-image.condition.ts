import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import type { UmbEntityContext } from '@umbraco-cms/backoffice/entity';
import { UMB_ENTITY_CONTENT_TYPE_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/content-type';
import type { UmbEntityContentTypeEntityContext } from '@umbraco-cms/backoffice/content-type';
import { observeMultiple } from '@umbraco-cms/backoffice/observable-api';
import { backofficeLookups, isImageMediaTypeCached } from './image-type.js';
import type { ImageLookups } from './image-type.js';
import { contextNow } from './context-now.js';
import { UMBRADESKTOP_IS_IMAGE_CONDITION } from './constants.js';

export { UMBRADESKTOP_IS_IMAGE_CONDITION };

/** What the condition can be told: nothing beyond its alias. */
export type UmbraDesktopIsImageConditionConfig = UmbConditionConfigBase<typeof UMBRADESKTOP_IS_IMAGE_CONDITION>;

/**
 * True for a media item whose type is an image type (design §3, condition 4): what puts Edit image on
 * a photo and not on a PDF, an SVG or a folder.
 *
 * **Where the media type comes from.** Core gives a tree item, a grid card and a media workspace a
 * content-type context naming the item's media type, and that is read first: no request. Core's table
 * view does not, so for a row the item is looked up instead, and its media type read from that.
 *
 * **The trap that makes this longer than the core condition it resembles.** A table inside a folder
 * sits inside the folder's workspace, which provides the folder's content-type context, so the nearest
 * one is the folder's, and taking it would hide Edit image on every row. A content-type context is
 * taken as the item's unless it is provided together with an entity context for a different item:
 * a workspace and a tree item provide the two from one place, for one item; a card provides only the
 * media type, and its item's entity context is the actions bundle's inside it.
 *
 * The content type is asked for past the actions bundle's own entity context, which shares its alias
 * and would otherwise stop the request before it reached the card (`context-now.ts`).
 *
 * Both contexts are asked for when the condition starts and again when its host connects, because
 * the answer needed includes "none" (see `context-now.ts`) and core may create a condition before the
 * element showing the action is in the page; what they say is then observed, since a reused row or
 * card changes item. Each media type is read once for the page (`isImageMediaTypeCached`).
 */
export class UmbraDesktopIsImageCondition
  extends UmbConditionBase<UmbraDesktopIsImageConditionConfig>
  implements UmbExtensionCondition
{
  /**
   * How the condition reads the backoffice. A static, so a test can answer from tables; set back
   * afterwards.
   */
  static lookupsFor: (host: UmbControllerHost) => ImageLookups = backofficeLookups;

  /** The lookups for this condition. */
  readonly #lookups: ImageLookups;

  /** Counts questions, so a slow answer for an item since replaced is dropped. */
  #asks = 0;

  /**
   * @param host Where core evaluates the condition: the element showing the action.
   * @param args The configuration and core's change callback.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbraDesktopIsImageConditionConfig>) {
    super(host, args);
    this.#lookups = UmbraDesktopIsImageCondition.lookupsFor(this);
    this.#start();
  }

  /** Find the item again now the element showing the action is in the page. */
  override hostConnected(): void {
    super.hostConnected();
    this.#start();
  }

  /** The contexts being followed, so finding the same ones again on connect asks nothing again. */
  #following?: { entity: UmbEntityContext; contentType?: UmbEntityContentTypeEntityContext };

  /** Find the item's contexts and follow what they say; refuse when there is no item to ask about. */
  #start(): void {
    const element = this.getHostElement();
    const entity = contextNow(element, UMB_ENTITY_CONTEXT);
    if (!entity) {
      this.#following = undefined;
      this.removeUmbControllerByAlias('umbradesktopIsImage');
      this.permitted = false;
      return;
    }
    const contentType = contextNow(element, UMB_ENTITY_CONTENT_TYPE_ENTITY_CONTEXT, { passAliasMatches: true });
    if (this.#following?.entity === entity && this.#following.contentType === contentType) return;
    this.#following = { entity, contentType };
    this.observe(
      contentType ? observeMultiple([entity.unique, contentType.unique]) : entity.unique,
      () => void this.#decide(entity, contentType),
      'umbradesktopIsImage',
    );
  }

  /**
   * Answer for the item the entity context names now.
   * @param entity The item's entity context.
   * @param contentType The nearest content-type context, or undefined when there is none.
   */
  async #decide(entity: UmbEntityContext, contentType: UmbEntityContentTypeEntityContext | undefined): Promise<void> {
    const ask = ++this.#asks;
    const unique = entity.getUnique();
    if (entity.getEntityType() !== 'media' || !unique) {
      this.permitted = false;
      return;
    }
    const mediaType = contentType && ownedBy(contentType, unique) ? contentType.getUnique() : await this.#lookups.itemMediaType(unique);
    const image = mediaType ? await isImageMediaTypeCached(this.#lookups, mediaType) : false;
    if (ask === this.#asks) this.permitted = image;
  }
}

/**
 * Whether a content-type context speaks for an item: not when an entity context for another item is
 * provided from the same place, as a folder's workspace provides both around a table of its children.
 * @param contentType The content-type context.
 * @param unique The item asked about.
 * @returns False only when the context is shown to be another item's.
 */
function ownedBy(contentType: UmbEntityContentTypeEntityContext, unique: string): boolean {
  const place = contentType.getHostElement();
  const beside = contextNow(place, UMB_ENTITY_CONTEXT);
  return !beside || beside.getHostElement() !== place || beside.getUnique() === unique;
}

export { UmbraDesktopIsImageCondition as api };
