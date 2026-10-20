import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { findDesktopWindows } from './desktop-windows.js';
import { UMBRADESKTOP_ON_DESKTOP_CONDITION } from './constants.js';

export { UMBRADESKTOP_ON_DESKTOP_CONDITION };

/** What the condition can be told: nothing beyond its alias. */
export type UmbraDesktopOnDesktopConditionConfig = UmbConditionConfigBase<typeof UMBRADESKTOP_ON_DESKTOP_CONDITION>;

/**
 * True where there is a desktop to open a window on: the desktop page, or a backoffice window on it
 * (design §3, condition 1). Edit image opens the Image Editor in a desktop window, so in the plain
 * backoffice it is hidden rather than offered and then unable to do anything.
 *
 * Asked as the condition starts, and again when its host connects: core may create a condition
 * before the element showing the action is in the page, where nothing above it can answer yet. A
 * page does not move onto or off a desktop while it shows, so nothing else asks again.
 */
export class UmbraDesktopOnDesktopCondition
  extends UmbConditionBase<UmbraDesktopOnDesktopConditionConfig>
  implements UmbExtensionCondition
{
  /**
   * @param host Where core evaluates the condition: the element showing the action.
   * @param args The configuration and core's change callback.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbraDesktopOnDesktopConditionConfig>) {
    super(host, args);
    this.#decide();
  }

  /** Ask again now the element showing the action is in the page. */
  override hostConnected(): void {
    super.hostConnected();
    this.#decide();
  }

  /** Whether there is a desktop above the element showing the action. */
  #decide(): void {
    this.permitted = !!findDesktopWindows(this.getHostElement());
  }
}

export { UmbraDesktopOnDesktopCondition as api };
