import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import { UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT } from './manager-window.context.js';
import { contextNow } from '../edit-image/context-now.js';

/** The condition's alias. */
export const UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION = 'Umbraco.Community.UmbraDesktop.Media.Condition.InMediaManager';

/** What the condition can be told. */
export interface UmbraDesktopInMediaManagerConditionConfig extends UmbConditionConfigBase<typeof UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION> {
  /** Only for a place or the Media root, as "Open in new window" is. */
  folder?: boolean;
  /**
   * The opposite: true anywhere but a manager window (#176). Edit image has two manifests, a quick
   * button inside a manager window and a normal weight everywhere else, and this keeps them apart.
   */
  outside?: boolean;
}

/**
 * True only inside a Media Manager window, so this package's own actions never show in the Media
 * section, whose menus stay exactly as Umbraco ships them (design §1).
 *
 * Asked for a folder, also checks the entity the action is for: the Media root, or an item whose
 * type has a collection. Core gives every card, table row and tree item its own entity context, which
 * is what this reads. In the window's tree every item is a place, a folder or an item that can hold
 * items (#158, design §19), so there any item gets a folder's actions; a card keeps an item's.
 */
export class UmbraDesktopInMediaManagerCondition
  extends UmbConditionBase<UmbraDesktopInMediaManagerConditionConfig>
  implements UmbExtensionCondition
{
  /** Counts answers, so a slow folder lookup for an entity since replaced is dropped. */
  #asks = 0;

  /**
   * @param host Where core evaluates the condition: the element showing the action.
   * @param args The configuration and core's change callback.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbraDesktopInMediaManagerConditionConfig>) {
    super(host, args);
    if (this.config.outside) {
      // Decided now rather than consumed: a consume never says "none", and "none" is this answer.
      this.#decideOutside();
      return;
    }
    this.consumeContext(UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT, (window) => {
      if (!window) {
        this.permitted = false;
        return;
      }
      if (!this.config.folder) {
        this.permitted = true;
        return;
      }
      this.consumeContext(UMB_ENTITY_CONTEXT, (entity) => {
        if (!entity) return;
        this.observe(entity.entityType, () => this.#checkFolder(window, entity.getEntityType(), entity.getUnique()), 'umbradesktopEntityType');
        this.observe(entity.unique, () => this.#checkFolder(window, entity.getEntityType(), entity.getUnique()), 'umbradesktopUnique');
      });
    });
  }

  /** Ask again once the element showing the action is in the page, for `outside`. */
  override hostConnected(): void {
    super.hostConnected();
    if (this.config.outside) this.#decideOutside();
  }

  /** For `outside`: permitted when no manager window is around the element. */
  #decideOutside(): void {
    this.permitted = !contextNow(this.getHostElement(), UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT);
  }

  /**
   * Decide for a folder-only action.
   * @param window The manager window.
   * @param entityType The entity's type.
   * @param unique The entity's key.
   */
  async #checkFolder(window: { isFolder(unique: string): Promise<boolean> }, entityType: string | undefined, unique: string | null | undefined) {
    const ask = ++this.#asks;
    if (entityType === 'media-root') {
      this.permitted = true;
      return;
    }
    if (entityType !== 'media' || !unique) {
      this.permitted = false;
      return;
    }
    if (inTree(this.getHostElement())) {
      this.permitted = true;
      return;
    }
    const folder = await window.isFolder(unique);
    if (ask === this.#asks) this.permitted = folder;
  }
}

/** The tag of the window's tree, whose items are all places. */
const TREE_HOST = 'UMBRADESKTOP-MEDIA-TREE-HOST';

/**
 * Whether an element is inside a manager window's tree, through the shadow roots core draws it in.
 * @param element The element.
 * @returns True inside the tree.
 */
function inTree(element: Element | undefined): boolean {
  for (let node: Node | null | undefined = element; node; node = node.parentNode ?? (node as ShadowRoot).host) {
    if (node instanceof Element && node.tagName === TREE_HOST) return true;
  }
  return false;
}

export { UmbraDesktopInMediaManagerCondition as api };
