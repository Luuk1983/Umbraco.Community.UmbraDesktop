import { UmbCollectionElement } from '@umbraco-cms/backoffice/collection';
import { customElement } from '@umbraco-cms/backoffice/external/lit';

/** The event a hosted collection dispatches once core has created its collection context. */
export const UMBRADESKTOP_COLLECTION_API_EVENT = 'umbradesktop-media-collection-api';

/**
 * Core's `umb-collection`, unchanged except that it says when its context exists.
 *
 * The manager needs the collection context to switch the window's view, and core provides it on this
 * element, where nothing outside it can ask for it. `apiChanged` is the protected hook core's own
 * element overrides for the same moment, so overriding it here is the supported way in, rather than
 * reaching into a protected field.
 */
@customElement('umbradesktop-media-hosted-collection')
export class UmbraDesktopMediaHostedCollectionElement extends UmbCollectionElement {
  /**
   * Core created or replaced the collection context: pass it on, after core has configured it.
   * @param api The collection context.
   */
  protected override apiChanged(api: Parameters<UmbCollectionElement['apiChanged']>[0]): void {
    super.apiChanged(api);
    this.dispatchEvent(new CustomEvent(UMBRADESKTOP_COLLECTION_API_EVENT, { detail: { api } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'umbradesktop-media-hosted-collection': UmbraDesktopMediaHostedCollectionElement;
  }
}
