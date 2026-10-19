import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_ENTITY_CONTEXT } from '@umbraco-cms/backoffice/entity';
import { UMBRADESKTOP_MEDIA_MANAGER_WINDOW_CONTEXT } from './manager-window.context.js';

/** The condition's alias. */
export const UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION = 'Umbraco.Community.UmbraDesktop.Media.Condition.InMediaManager';

/** What the condition can be told. */
export interface UmbraDesktopInMediaManagerConditionConfig extends UmbConditionConfigBase<typeof UMBRADESKTOP_IN_MEDIA_MANAGER_CONDITION> {
  /** Only for a folder or the Media root, as "Open in new window" is. */
  folder?: boolean;
}

/**
 * True only inside a Media Manager window, so this package's own actions never show in the Media
 * section, whose menus stay exactly as Umbraco ships them (design §1).
 *
 * Asked for a folder, also checks the entity the action is for: the Media root, or an item whose
 * type has a collection. Core gives every card, table row and tree item its own entity context, which
 * is what this reads.
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
    const folder = await window.isFolder(unique);
    if (ask === this.#asks) this.permitted = folder;
  }
}

export { UmbraDesktopInMediaManagerCondition as api };
