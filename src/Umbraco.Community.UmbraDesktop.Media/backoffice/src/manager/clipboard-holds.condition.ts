import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMBRADESKTOP_MEDIA_MANAGER_CONTEXT } from '../context/media-manager.context.js';

/** The condition's alias. */
export const UMBRADESKTOP_CLIPBOARD_HOLDS_CONDITION = 'Umbraco.Community.UmbraDesktop.Media.Condition.ClipboardHolds';

/**
 * True while something is cut or copied, so Paste is in a folder's menu only when there is something
 * to paste (design §5), and is gone again once a cut has been pasted.
 */
export class UmbraDesktopClipboardHoldsCondition
  extends UmbConditionBase<UmbConditionConfigBase<typeof UMBRADESKTOP_CLIPBOARD_HOLDS_CONDITION>>
  implements UmbExtensionCondition
{
  /**
   * @param host Where core evaluates the condition: the element showing the action.
   * @param args The configuration and core's change callback.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbConditionConfigBase<typeof UMBRADESKTOP_CLIPBOARD_HOLDS_CONDITION>>) {
    super(host, args);
    this.consumeContext(UMBRADESKTOP_MEDIA_MANAGER_CONTEXT, (context) => {
      if (!context) {
        this.permitted = false;
        return;
      }
      this.observe(context.clipboard, (clipboard) => (this.permitted = !!clipboard?.items.length), 'umbradesktopClipboard');
    });
  }
}

export { UmbraDesktopClipboardHoldsCondition as api };
