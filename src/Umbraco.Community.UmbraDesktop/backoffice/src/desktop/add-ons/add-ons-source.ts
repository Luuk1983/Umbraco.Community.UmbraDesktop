import { ManifestService } from '@umbraco-cms/backoffice/external/backend-api';
import { filter, firstValueFrom } from '@umbraco-cms/backoffice/external/rxjs';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import type { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import { tryExecute } from '@umbraco-cms/backoffice/resources';
import { UMB_SERVER_CONTEXT } from '@umbraco-cms/backoffice/server';
import { normaliseDocsManifests } from '../help/docs-sources';
import { findGuide, installedVersions, type UmbraDesktopAddOnsSource } from './add-ons-data';
import { fetchMarketplaceAddOns, type UmbraDesktopMarketplacePackage } from './marketplace';

/**
 * How long the app waits for the site's version before listing without it. The server context reads
 * it lazily and never says it failed, so without a limit a failed read would leave the app loading.
 */
const SITE_VERSION_WAIT_MS = 5000;

/**
 * The Marketplace's answer, kept for as long as the page is open (Add-ons design §6). The list
 * changes when someone publishes a package, which is a matter of days, so a second window, or the
 * same one reopened, has no reason to ask again. Only an answer is kept: a failure is forgotten, so
 * "Try again" really asks again.
 */
let marketplaceAnswer: Promise<UmbraDesktopMarketplacePackage[] | undefined> | undefined;

/**
 * Asks the Marketplace, or hands back the answer already had.
 * @returns The tagged packages with their details, or undefined when it cannot be reached.
 */
function cachedMarketplace(): Promise<UmbraDesktopMarketplacePackage[] | undefined> {
  if (!marketplaceAnswer) {
    const asking = fetchMarketplaceAddOns();
    marketplaceAnswer = asking;
    asking.then((packages) => {
      if (!packages && marketplaceAnswer === asking) marketplaceAnswer = undefined;
    });
  }
  return marketplaceAnswer;
}

/**
 * Reads one same-origin file's text, quietly.
 * @param url The file's path.
 * @returns Its text, or undefined.
 */
async function readSameOrigin(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    return response.ok ? await response.text() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The real source of the Add-ons app's facts.
 *
 * - **The Marketplace**, from the browser: its API answers any origin, and nothing about it needs the
 *   site's server.
 * - **What is installed**, from Umbraco's own private manifest endpoint, which every backoffice user
 *   may read, and which names each package's `id` and `version`. The Packages section's installed
 *   list uses the full endpoint instead, which needs access to that section; the app is for everyone.
 * - **The site's version**, from Umbraco's server context.
 * - **A package's guide**, from the registered docs folders' `product.json`.
 * @param host The app element, which owns the requests and reaches the server context.
 * @returns The source.
 */
export function serverAddOnsSource(host: UmbLitElement): UmbraDesktopAddOnsSource {
  return {
    marketplace: cachedMarketplace,
    async installed() {
      const { data } = await tryExecute(host, ManifestService.getManifestManifestPrivate(), { disableNotifications: true });
      return installedVersions(data ?? []);
    },
    async siteVersion() {
      const server = await host.getContext(UMB_SERVER_CONTEXT);
      if (!server) return undefined;
      const information = firstValueFrom(server.serverInformation.pipe(filter((value) => value !== undefined)));
      const timeout = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), SITE_VERSION_WAIT_MS));
      return (await Promise.race([information, timeout]))?.version;
    },
    async guide(packageId) {
      const manifests = await firstValueFrom(umbExtensionsRegistry.byType('umbraDesktopDocs'));
      const { sources } = normaliseDocsManifests(manifests, location.origin);
      return findGuide(
        sources.map((source) => source.path),
        readSameOrigin,
        packageId,
      );
    },
  };
}
