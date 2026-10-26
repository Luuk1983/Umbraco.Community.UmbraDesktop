import { UmbConditionBase } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbConditionConfigBase, UmbConditionControllerArguments, UmbExtensionCondition } from '@umbraco-cms/backoffice/extension-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UMB_PROPERTY_CONTEXT } from '@umbraco-cms/backoffice/property';
import { UMBRADESKTOP_FILE_PROPERTY_CONDITION } from './constants.js';

/** The property every media type that carries a file stores it in. */
const FILE_PROPERTY = 'umbracoFile';

/** What the condition can be told: nothing beyond its alias. */
export type UmbraDesktopFilePropertyConditionConfig = UmbConditionConfigBase<typeof UMBRADESKTOP_FILE_PROPERTY_CONDITION>;

/**
 * True on the property a media item keeps its file in, `umbracoFile` (#176): what puts the file's
 * tools on the Image and File properties' own "..." menu, and not on a second Image Cropper or
 * Upload field a site's media type may have, whose file the tools would not act on.
 */
export class UmbraDesktopFilePropertyCondition
  extends UmbConditionBase<UmbraDesktopFilePropertyConditionConfig>
  implements UmbExtensionCondition
{
  /**
   * @param host Where core evaluates the condition: inside the property.
   * @param args The configuration and core's change callback.
   */
  constructor(host: UmbControllerHost, args: UmbConditionControllerArguments<UmbraDesktopFilePropertyConditionConfig>) {
    super(host, args);
    this.consumeContext(UMB_PROPERTY_CONTEXT, (property) => {
      this.observe(property?.alias, (alias) => (this.permitted = alias === FILE_PROPERTY), 'umbradesktopFileProperty');
    });
  }
}

export { UmbraDesktopFilePropertyCondition as api };
