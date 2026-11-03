import type { ManifestResponseModel } from '@umbraco-cms/backoffice/external/backend-api';
import { UMBRADESKTOP_BUILT_IN_ADD_ONS, UMBRADESKTOP_BUILT_IN_ICON } from './built-in';
import { majorOf, marketplacePageUrl, sortAddOns, toAddOn, type UmbraDesktopAddOn, type UmbraDesktopMarketplacePackage } from './marketplace';

/** The desktop's own package id, which is never an add-on and whose version ours are released at. */
export const UMBRADESKTOP_HOST_PACKAGE_ID = 'Umbraco.Community.UmbraDesktop';

/**
 * Where the Add-ons app gets its facts. An interface so the app and the loader can be tested against
 * fixed answers; `add-ons-source.ts` holds the real one.
 */
export interface UmbraDesktopAddOnsSource {
  /** Every package tagged `umbradesktop` with its details, or undefined when the Marketplace cannot be reached. */
  marketplace(): Promise<UmbraDesktopMarketplacePackage[] | undefined>;
  /** The version of every package installed on this site, by lowercased package id. */
  installed(): Promise<ReadonlyMap<string, string>>;
  /** This site's Umbraco version, or undefined when it cannot be read. */
  siteVersion(): Promise<string | undefined>;
  /**
   * The Help product that documents a package, for "Open its guide in Help".
   * @param packageId The package id.
   * @returns The product id, or undefined when no installed docs name the package.
   */
  guide(packageId: string): Promise<string | undefined>;
}

/** Everything the app shows, read once per open. */
export interface UmbraDesktopAddOnsData {
  /** Whether the Marketplace answered. False means ours come from the built-in list and the community's are unknown. */
  online: boolean;
  /** The site's Umbraco major, or undefined when it could not be read. */
  siteMajor?: number;
  /** The team's add-ons, in the team's order. */
  ours: UmbraDesktopAddOn[];
  /** Everyone else's, by title. */
  community: UmbraDesktopAddOn[];
  /** The version of every installed package, by lowercased id. */
  installed: ReadonlyMap<string, string>;
}

/**
 * Awaits a call that must not take the app down with it.
 * @param call The call.
 * @param fallback What to use when it fails.
 * @returns Its answer, or the fallback.
 */
async function quietly<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await call();
  } catch {
    return fallback;
  }
}

/**
 * Reads the installed packages out of Umbraco's own manifest answer: every package that declares an
 * `id`, with its `version`. The same answer the backoffice registers its extensions from, so a
 * package counts as installed exactly when its extensions are loaded.
 * @param manifests The packages as the manifest endpoint returns them.
 * @returns Versions by lowercased package id.
 */
export function installedVersions(manifests: ReadonlyArray<ManifestResponseModel>): Map<string, string> {
  const map = new Map<string, string>();
  for (const manifest of manifests) {
    if (manifest.id && manifest.version) map.set(manifest.id.toLowerCase(), manifest.version);
  }
  return map;
}

/**
 * The built-in list as add-ons, for when the Marketplace cannot be reached.
 *
 * Their version is the desktop's own: our packages are released together at one version, so the
 * add-on that goes with this desktop is the one at its version, and the install line can still be
 * pinned without asking anyone.
 * @param hostVersion The installed desktop's version, if known.
 * @returns Our add-ons.
 */
function builtInAddOns(hostVersion: string | undefined): UmbraDesktopAddOn[] {
  return UMBRADESKTOP_BUILT_IN_ADD_ONS.map((builtIn) => ({
    id: builtIn.id,
    title: builtIn.title,
    authors: builtIn.authors,
    description: builtIn.description,
    icon: UMBRADESKTOP_BUILT_IN_ICON,
    color: builtIn.color,
    screenshots: [],
    readme: '',
    version: hostVersion,
    majors: [],
    ours: true,
    links: { marketplace: marketplacePageUrl(builtIn.id) },
  }));
}

/**
 * Reads everything the app shows: the site's version, what it has installed, and the add-ons for its
 * major, split into ours and the community's. Never throws: a failed call costs what it would have
 * added, and a Marketplace that cannot be reached means the built-in list.
 * @param source Where the facts come from.
 * @returns What to show.
 */
export async function loadAddOns(source: UmbraDesktopAddOnsSource): Promise<UmbraDesktopAddOnsData> {
  const [siteVersion, installed, packages] = await Promise.all([
    quietly(() => source.siteVersion(), undefined),
    quietly(() => source.installed(), new Map<string, string>() as ReadonlyMap<string, string>),
    quietly(() => source.marketplace(), undefined),
  ]);
  const siteMajor = siteVersion && Number.isFinite(majorOf(siteVersion)) ? majorOf(siteVersion) : undefined;
  const order = UMBRADESKTOP_BUILT_IN_ADD_ONS.map((builtIn) => builtIn.id);

  if (!packages) {
    const ours = builtInAddOns(installed.get(UMBRADESKTOP_HOST_PACKAGE_ID.toLowerCase()));
    return { online: false, siteMajor, ours, community: [], installed };
  }

  const addOns = packages
    .filter((detail) => detail.packageId.toLowerCase() !== UMBRADESKTOP_HOST_PACKAGE_ID.toLowerCase())
    .map((detail) => toAddOn(detail, siteMajor === undefined ? undefined : siteVersion))
    .filter((addOn): addOn is UmbraDesktopAddOn => addOn !== undefined);
  return { online: true, siteMajor, ...sortAddOns(addOns, order), installed };
}

/**
 * Finds the Help product that documents a package: the installed docs folder whose `product.json`
 * names it as its `packageId`. Only `product.json` is read, one small file per folder, rather than
 * loading every page the way the Help app does.
 * @param paths The registered docs folders.
 * @param read Reads one file's text, or undefined.
 * @param packageId The package to find docs for.
 * @returns The product id, or undefined.
 */
export async function findGuide(
  paths: ReadonlyArray<string>,
  read: (url: string) => Promise<string | undefined>,
  packageId: string,
): Promise<string | undefined> {
  const wanted = packageId.toLowerCase();
  for (const path of paths) {
    const text = await quietly(() => read(`${path}/product.json`), undefined);
    if (!text) continue;
    let product: { id?: unknown; packageId?: unknown };
    try {
      product = JSON.parse(text);
    } catch {
      continue;
    }
    if (typeof product.packageId === 'string' && product.packageId.toLowerCase() === wanted && typeof product.id === 'string') {
      return product.id;
    }
  }
  return undefined;
}
