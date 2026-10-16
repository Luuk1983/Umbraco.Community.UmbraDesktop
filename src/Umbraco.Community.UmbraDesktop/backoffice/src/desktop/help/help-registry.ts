import { UmbExtensionsManifestInitializer } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { normaliseDocsManifests } from './docs-sources';
import { loadHelpProducts, serverDocsFetcher } from './help-loader';
import type { UmbraDesktopHelpProduct } from './help-product';

/** Console lines already printed this visit, so reopening Help, or searching it, does not repeat them. */
const printed = new Set<string>();

/**
 * Loads the products registered through `umbraDesktopDocs`, the only route there is (Help design
 * D3). Resolves on the registry's first answer: docs manifests arrive with their packages' bundles,
 * which are loaded before anyone can open the desktop, so there is no later answer worth waiting for.
 * Shared by the Help app and by desktop search's Help source.
 * @param host The controller that owns the initializer and the requests.
 * @returns The products, in picker order.
 */
export async function loadHelpProductsFromRegistry(host: UmbControllerHost): Promise<UmbraDesktopHelpProduct[]> {
  const manifests = await new Promise<unknown[]>((resolve) => {
    new UmbExtensionsManifestInitializer(
      host,
      umbExtensionsRegistry,
      'umbraDesktopDocs',
      null,
      (permitted) => resolve(permitted.map((controller) => controller.manifest)),
      'umbraDesktopHelpDocs',
    );
  });
  const { sources, reports } = normaliseDocsManifests(manifests, window.location.origin);
  const loaded = await loadHelpProducts(sources, serverDocsFetcher(host));
  for (const report of [...reports, ...loaded.reports]) {
    if (printed.has(report.key)) continue;
    printed.add(report.key);
    console.warn(report.message);
  }
  return loaded.products;
}
