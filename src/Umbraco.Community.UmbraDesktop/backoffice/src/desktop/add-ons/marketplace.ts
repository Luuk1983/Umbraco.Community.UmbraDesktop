/**
 * Everything the Add-ons app knows about the Umbraco Marketplace: where to ask, what comes back, and
 * how a package becomes one add-on on a card (Add-ons design §3).
 *
 * Kept free of elements and contexts so the rules (which major, which version, ours or the
 * community's) can be tested on plain data. The Marketplace's own field names are kept on the types
 * that mirror its answers, and the app's own names on {@link UmbraDesktopAddOn}, so it is always clear
 * which side of the conversion a value is on.
 */

/** The Marketplace's packages endpoint. It answers any origin, so the browser asks it directly. */
export const UMBRADESKTOP_MARKETPLACE_API = 'https://api.marketplace.umbraco.com/api/v1/packages';

/**
 * The tag that lists a package here. A third party adds it to the `Tags` in its
 * `umbraco-marketplace.json`, and that is all it takes: there is no list in this repository.
 */
export const UMBRADESKTOP_ADD_ON_TAG = 'umbradesktop';

/** The prefix of every package the UmbraDesktop team ships, which is what puts one in "ours". */
export const UMBRADESKTOP_TEAM_PACKAGE_PREFIX = 'Umbraco.Community.UmbraDesktop.';

/** The Marketplace's page for a package, followed by its lowercased id. */
const MARKETPLACE_PAGE = 'https://marketplace.umbraco.com/package/';

/**
 * How many packages the list call returns at most. The API caps `pageSize` at 50 whatever is asked
 * for, measured on 2026-10-29, so the list is read page by page.
 */
const LIST_PAGE_SIZE = 50;

/**
 * How many list pages are read at most: 500 add-ons. A guard against a list that never ends, not a
 * limit anyone is expected to reach.
 */
const LIST_PAGE_LIMIT = 10;

/** How many per-package calls run at once, so a long list does not open dozens of requests together. */
const DETAIL_CONCURRENCY = 6;

/** One screenshot as the Marketplace returns it. */
export interface UmbraDesktopMarketplaceScreenshot {
  /** The image's own address, as the package's marketplace file gives it. */
  sourceUrl?: string;
  /** What the image shows. */
  caption?: string;
}

/** One row of a package's version table: the newest package version for an Umbraco version. */
export interface UmbraDesktopMarketplaceVersionDetail {
  /** The lowest Umbraco version the row applies to, such as `17.0.0`. */
  umbracoVersionNumber?: string;
  /** The newest package version that runs on it. */
  latestPackageVersionNumber?: string;
}

/**
 * A package as the per-package call returns it, cut down to what the app reads. Every field is
 * optional because the answer is another party's, and a missing field must cost a line on a card,
 * never the app.
 */
export interface UmbraDesktopMarketplacePackage {
  /** The NuGet package id. */
  packageId: string;
  /** The package's display name. */
  title?: string;
  /** Who made it, as one string. */
  authors?: string;
  /** One or two sentences about it. */
  description?: string;
  /** The package icon. */
  iconSourceUrl?: string;
  /** The icon's dominant colour, worked out by the Marketplace, with or without its `#`. */
  iconDominantColor?: string;
  /** Screenshots in the order of the package's marketplace file. */
  screenshots?: UmbraDesktopMarketplaceScreenshot[];
  /** The README, rendered to HTML by the Marketplace. */
  readMeContent?: string;
  /** The Umbraco majors the package runs on. */
  umbracoMajorVersionsSupported?: number[];
  /** The newest package version per Umbraco version. */
  versionDetails?: UmbraDesktopMarketplaceVersionDetail[];
  /** The newest version of all, whatever Umbraco it needs. */
  latestVersionNumber?: string;
  /** Licence names, such as `Free`. */
  licenseTypes?: string[];
  /** NuGet downloads. */
  numberOfNuGetDownloads?: number;
  /** Where its documentation is. */
  documentationUrl?: string;
  /** Where to report a problem. */
  issueTrackerUrl?: string;
  /** Its home page or repository. */
  projectUrl?: string;
}

/** One screenshot on the details page. */
export interface UmbraDesktopAddOnScreenshot {
  /** An https address. */
  url: string;
  /** What it shows, or empty. */
  caption: string;
}

/** One add-on, as the app shows it. */
export interface UmbraDesktopAddOn {
  /** The NuGet package id, which is also what `dotnet add package` takes. */
  id: string;
  /** Its name. */
  title: string;
  /** Who made it. */
  authors: string;
  /** One or two sentences about it. */
  description: string;
  /** Its icon's https address; unset offline or when the Marketplace has none. */
  icon?: string;
  /** The colour a cover without a screenshot is filled with, as `#rrggbb`. */
  color?: string;
  /** Its screenshots, the first one being the cover. Empty offline. */
  screenshots: UmbraDesktopAddOnScreenshot[];
  /** The README as the Marketplace's HTML, not yet sanitised. Empty offline. */
  readme: string;
  /**
   * The newest version for this site's Umbraco major, which the install line names. Unset when it
   * cannot be known, which is offline for a package the built-in list cannot pin.
   */
  version?: string;
  /** The Umbraco majors it runs on. */
  majors: number[];
  /** Its licences, joined. */
  licence?: string;
  /** NuGet downloads. */
  downloads?: number;
  /** Whether the UmbraDesktop team ships it. */
  ours: boolean;
  /** Where to read more. Each is https or unset. */
  links: { marketplace?: string; documentation?: string; issues?: string };
}

/**
 * Whether a package is one of ours, by its id.
 * @param packageId The NuGet package id.
 * @returns True for the team's packages.
 */
export function isOurs(packageId: string): boolean {
  return packageId.toLowerCase().startsWith(UMBRADESKTOP_TEAM_PACKAGE_PREFIX.toLowerCase());
}

/**
 * The Marketplace's page for a package.
 * @param packageId The NuGet package id.
 * @returns The page's address.
 */
export function marketplacePageUrl(packageId: string): string {
  return `${MARKETPLACE_PAGE}${packageId.toLowerCase()}`;
}

/**
 * Compares two version strings the way NuGet orders them, as far as the app needs: numbers part by
 * part, a missing part as zero, a prerelease before its release, build metadata ignored.
 *
 * Not a full SemVer comparison, which would also order prerelease labels against each other. The app
 * only asks "is the installed one older than the newest", and both sides of that are releases except
 * on a site running a build of its own.
 * @param a One version.
 * @param b The other.
 * @returns Negative when `a` is older, positive when newer, zero when the same.
 */
export function compareVersions(a: string, b: string): number {
  const split = (value: string) => {
    const [core, pre] = value.split('+')[0].split(/-(.*)/s);
    return { parts: core.split('.').map((part) => Number.parseInt(part, 10) || 0), pre: pre ?? '' };
  };
  const left = split(a);
  const right = split(b);
  for (let i = 0; i < Math.max(left.parts.length, right.parts.length); i++) {
    const difference = (left.parts[i] ?? 0) - (right.parts[i] ?? 0);
    if (difference !== 0) return difference;
  }
  if (left.pre === right.pre) return 0;
  if (!left.pre) return 1;
  if (!right.pre) return -1;
  return left.pre < right.pre ? -1 : 1;
}

/**
 * The major of a version string.
 * @param version Such as `17.6.0`.
 * @returns The major, or NaN when the string does not start with a number.
 */
export function majorOf(version: string): number {
  return Number.parseInt(version, 10);
}

/**
 * The newest package version that runs on this site's Umbraco.
 *
 * The Marketplace's version table has one row per Umbraco version a release line starts at. The row
 * that applies is the latest one in the site's major that the site has reached: a row starting at
 * 17.8 describes releases that need 17.8, which a 17.6 site cannot take.
 * @param detail The package.
 * @param siteVersion The site's Umbraco version, such as `17.6.0`.
 * @returns The version, or undefined when nothing runs on the site's major.
 */
export function newestVersionFor(detail: UmbraDesktopMarketplacePackage, siteVersion: string): string | undefined {
  const major = majorOf(siteVersion);
  const rows = (detail.versionDetails ?? []).filter(
    (row) =>
      typeof row.umbracoVersionNumber === 'string' &&
      typeof row.latestPackageVersionNumber === 'string' &&
      majorOf(row.umbracoVersionNumber) === major &&
      compareVersions(row.umbracoVersionNumber, siteVersion) <= 0,
  );
  rows.sort((a, b) => compareVersions(b.umbracoVersionNumber!, a.umbracoVersionNumber!));
  return rows[0]?.latestPackageVersionNumber;
}

/**
 * An address the app may load or link to: absolute https, nothing else. A package's marketplace file
 * is another party's, and `javascript:` or a path on this site have no business on a card.
 * @param value The address as given.
 * @returns The address, or undefined.
 */
export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return new URL(value).protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A colour the app may put in a style: six or three hex digits, with or without the `#` the
 * Marketplace sometimes leaves off. Anything else would be another party's text inside our CSS.
 * @param value The colour as given.
 * @returns `#` and the digits, or undefined.
 */
function hexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/^#/, '');
  return /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(digits) ? `#${digits}` : undefined;
}

/**
 * Turns a package into an add-on for this site, or leaves it out.
 *
 * Only a package that runs on the site's Umbraco major is kept, and only when the Marketplace names a
 * version for that major: listing one the site cannot install, even greyed out, is on the issue's
 * "Not doing" list. When the site's version is not known, nothing is left out and the version is the
 * package's latest, which is the best the app can do without lying.
 * @param detail The package.
 * @param siteVersion The site's Umbraco version, or undefined when it could not be read.
 * @returns The add-on, or undefined when it does not run here.
 */
export function toAddOn(detail: UmbraDesktopMarketplacePackage, siteVersion: string | undefined): UmbraDesktopAddOn | undefined {
  const majors = (detail.umbracoMajorVersionsSupported ?? []).filter((major) => Number.isFinite(major));
  let version: string | undefined;
  if (siteVersion) {
    if (!majors.includes(majorOf(siteVersion))) return undefined;
    version = newestVersionFor(detail, siteVersion);
    if (!version) return undefined;
  } else {
    version = detail.latestVersionNumber;
  }
  const screenshots = (detail.screenshots ?? []).flatMap((shot) => {
    const url = httpsUrl(shot.sourceUrl);
    return url ? [{ url, caption: shot.caption ?? '' }] : [];
  });
  return {
    id: detail.packageId,
    title: detail.title || detail.packageId,
    authors: detail.authors ?? '',
    description: detail.description ?? '',
    icon: httpsUrl(detail.iconSourceUrl),
    color: hexColor(detail.iconDominantColor),
    screenshots,
    readme: detail.readMeContent ?? '',
    version,
    majors,
    licence: detail.licenseTypes?.length ? detail.licenseTypes.join(', ') : undefined,
    downloads: typeof detail.numberOfNuGetDownloads === 'number' ? detail.numberOfNuGetDownloads : undefined,
    ours: isOurs(detail.packageId),
    links: {
      marketplace: marketplacePageUrl(detail.packageId),
      documentation: httpsUrl(detail.documentationUrl) ?? httpsUrl(detail.projectUrl),
      issues: httpsUrl(detail.issueTrackerUrl),
    },
  };
}

/**
 * Splits add-ons into the two sections and orders each.
 *
 * Ours come in the order the built-in list gives, which is the order the team chose, and any of ours
 * the built-in list does not know yet follow by title. The community's are by title, the one order
 * that favours nobody: the app informs, and ranking by downloads would be the start of advertising.
 * @param addOns Every add-on to show.
 * @param ourOrder Our package ids in the order to show them.
 * @returns The two sections.
 */
export function sortAddOns(
  addOns: ReadonlyArray<UmbraDesktopAddOn>,
  ourOrder: ReadonlyArray<string>,
): { ours: UmbraDesktopAddOn[]; community: UmbraDesktopAddOn[] } {
  const rank = (addOn: UmbraDesktopAddOn) => {
    const index = ourOrder.findIndex((id) => id.toLowerCase() === addOn.id.toLowerCase());
    return index === -1 ? ourOrder.length : index;
  };
  const byTitle = (a: UmbraDesktopAddOn, b: UmbraDesktopAddOn) => a.title.localeCompare(b.title);
  return {
    ours: addOns.filter((addOn) => addOn.ours).sort((a, b) => rank(a) - rank(b) || byTitle(a, b)),
    community: addOns.filter((addOn) => !addOn.ours).sort(byTitle),
  };
}

/** Where an add-on stands on this site. */
export type UmbraDesktopInstallState = 'installed' | 'update' | 'not-installed';

/**
 * Where an add-on stands on this site.
 *
 * A site running a version newer than the Marketplace's newest (its own build, or a release the
 * Marketplace has not picked up yet) is up to date: "update available" would ask for a downgrade.
 * @param installed The version this site runs, or undefined when it does not have it.
 * @param newest The newest version for this site's major, when known.
 * @returns The state.
 */
export function installState(installed: string | undefined, newest: string | undefined): UmbraDesktopInstallState {
  if (!installed) return 'not-installed';
  if (newest && compareVersions(installed, newest) < 0) return 'update';
  return 'installed';
}

/**
 * Reads one JSON answer, quietly.
 * @param fetcher The fetch to use.
 * @param url Where to ask.
 * @returns The parsed body, or undefined on any failure.
 */
async function readJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  try {
    const response = await fetcher(url, { headers: { accept: 'application/json' } });
    return response.ok ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads every package tagged `umbradesktop`, with its details.
 *
 * Two kinds of call, because the list call leaves `tags`, the supported majors and the version table
 * empty (measured 2026-10-29): the list says which packages, and one call per package says the rest.
 * The per-package calls run a few at a time. A package whose details fail is left out rather than
 * shown half-known, and the others still show.
 * @param fetcher The fetch to use; the browser's own unless a test says otherwise.
 * @returns The packages in the list's order, or undefined when the list itself cannot be read, which
 *   is what "the Marketplace can't be reached" means to the app.
 */
export async function fetchMarketplaceAddOns(
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<UmbraDesktopMarketplacePackage[] | undefined> {
  const ids: string[] = [];
  for (let page = 1; page <= LIST_PAGE_LIMIT; page++) {
    const body = await readJson(
      fetcher,
      `${UMBRADESKTOP_MARKETPLACE_API}?tags=${UMBRADESKTOP_ADD_ON_TAG}&pageSize=${LIST_PAGE_SIZE}&pageNumber=${page}`,
    );
    const results = (body as { results?: unknown } | undefined)?.results;
    if (!Array.isArray(results)) {
      if (page === 1) return undefined;
      break;
    }
    for (const result of results) {
      const id = (result as { packageId?: unknown } | null)?.packageId;
      if (typeof id === 'string' && id) ids.push(id);
    }
    const total = (body as { totalResults?: unknown }).totalResults;
    if (results.length < LIST_PAGE_SIZE || typeof total !== 'number' || ids.length >= total) break;
  }

  const details: Array<UmbraDesktopMarketplacePackage | undefined> = new Array(ids.length);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const index = next++;
      const body = await readJson(fetcher, `${UMBRADESKTOP_MARKETPLACE_API}/${encodeURIComponent(ids[index])}`);
      const id = (body as { packageId?: unknown } | undefined)?.packageId;
      details[index] = typeof id === 'string' && id ? (body as UmbraDesktopMarketplacePackage) : undefined;
    }
  };
  await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, ids.length) }, worker));
  return details.filter((detail): detail is UmbraDesktopMarketplacePackage => detail !== undefined);
}
