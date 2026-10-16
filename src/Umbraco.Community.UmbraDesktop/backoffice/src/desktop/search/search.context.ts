import { UMBRADESKTOP_SEARCH_CONTEXT } from './search.context-token';
import { helpSearchSource } from './help-source';
import { umbracoSearchSource } from './umbraco-sources';
import type { UmbraDesktopGlobalSearchManifest, UmbraDesktopSearchProviderApi } from './umbraco-sources';
import type { UmbraDesktopSearchSource } from './types';
import { loadHelpProductsFromRegistry } from '../help/help-registry';
import { UmbContextBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { createExtensionApiByAlias, umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UMB_APP_LANGUAGE_CONTEXT } from '@umbraco-cms/backoffice/language';
import { UmbArrayState } from '@umbraco-cms/backoffice/observable-api';

/**
 * The sources desktop search asks, for as long as the desktop is open. Lives on the desktop rather
 * than in the launcher because the launcher is unmounted every time it closes, and creating every
 * provider's api on each open would be work repeated for nothing.
 *
 * The sources are core's `globalSearch` registrations (design D3): the section-permission conditions
 * are on those manifests, not on the providers, so the initializer's permitted list is exactly what
 * the native modal would offer this user, third-party sources included. Help is added last.
 */
export class UmbraDesktopSearchContext extends UmbContextBase {
  /** The current sources. */
  #sources = new UmbArrayState<UmbraDesktopSearchSource>([], (source) => source.alias);

  /** The current sources, Help last. */
  public readonly sources = this.#sources.asObservable();

  /** Help's source, built once so its loaded docs survive a rebuild of the others. */
  #help = helpSearchSource(() => loadHelpProductsFromRegistry(this));

  /** Provider apis by alias, created once each; a rebuild must not create them again. */
  #providers = new Map<string, Promise<UmbraDesktopSearchProviderApi>>();

  /** The app language context, for the culture documents and media are searched in. */
  #appLanguage?: typeof UMB_APP_LANGUAGE_CONTEXT.TYPE;

  /** The latest rebuild's number, so an older one finishing late cannot overwrite it. */
  #build = 0;

  /**
   * @param host The desktop.
   */
  constructor(host: UmbControllerHost) {
    super(host, UMBRADESKTOP_SEARCH_CONTEXT);
    this.#sources.setValue([this.#help]);
    this.consumeContext(UMB_APP_LANGUAGE_CONTEXT, (context) => (this.#appLanguage = context ?? undefined));
    new UmbExtensionsManifestInitializer(
      this,
      umbExtensionsRegistry,
      'globalSearch',
      null,
      (permitted) => void this.#rebuild(permitted.map((controller) => controller.manifest as unknown as UmbraDesktopGlobalSearchManifest)),
      'umbraDesktopSearchSources',
    );
  }

  /**
   * Build a source per permitted manifest. A provider that cannot be created is left out, and the
   * rest still search.
   * @param manifests The permitted `globalSearch` manifests.
   */
  async #rebuild(manifests: ReadonlyArray<UmbraDesktopGlobalSearchManifest>): Promise<void> {
    const build = ++this.#build;
    const built = await Promise.all(
      manifests.map(async (manifest) => {
        try {
          const provider = await this.#provider(manifest.meta.searchProviderAlias);
          return umbracoSearchSource(manifest, provider, () => this.#appLanguage?.getAppCulture());
        } catch {
          return undefined;
        }
      }),
    );
    if (build !== this.#build) return;
    this.#sources.setValue([...built.filter((s): s is UmbraDesktopSearchSource => !!s), this.#help]);
  }

  /**
   * One provider's api, created on first use.
   * @param alias The `searchProvider` manifest's alias.
   * @returns The api.
   */
  #provider(alias: string): Promise<UmbraDesktopSearchProviderApi> {
    let provider = this.#providers.get(alias);
    if (!provider) {
      provider = createExtensionApiByAlias<UmbraDesktopSearchProviderApi & { destroy(): void }>(this, alias);
      // A failure is not cached, so a provider whose bundle loads later can still be created.
      provider.catch(() => this.#providers.delete(alias));
      this.#providers.set(alias, provider);
    }
    return provider;
  }
}
