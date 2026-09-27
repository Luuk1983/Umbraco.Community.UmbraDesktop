import type { UmbraDesktopPackageEntry, UmbraDesktopPackageGroup } from './catalogue.extension';
import type { UmbraDesktopCatalogueReport, UmbraDesktopChromeProfile } from './types';
import {
  UMBRADESKTOP_FALLBACK_ALIAS_PREFIX,
  UMBRADESKTOP_MORE_GROUP_ALIAS,
  UMBRADESKTOP_MORE_GROUP_WEIGHT,
  UMBRADESKTOP_SECTION_ALIAS,
  UMBRADESKTOP_SECTION_PATHNAME,
} from './constants';
import { UMBRADESKTOP_BACKOFFICE_SECTION_PATH } from './url-inference';
import { isBoolean, isFiniteNumber, isNonEmptyString, isRecord, isSize, isStringArray } from './manifest-values';

/**
 * A weight inside a catalogue at or above this is almost certainly Umbraco's higher-first number
 * written into a field that sorts lower first (design D2). The largest group weight the desktop ships
 * is 70, and an entry's weight only orders it within its group.
 */
const SCALE_MIX_UP_WEIGHT = 1000;

/** The three chrome profiles. Anything else is dropped rather than half-applied (design D9). */
const CHROME_PROFILES: ReadonlySet<string> = new Set<UmbraDesktopChromeProfile>(['full-section', 'workspace-only', 'bare']);

/** The desktop's own section. An entry opening it would put a desktop inside a desktop window. */
const DESKTOP_SECTION_PATH = `${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/${UMBRADESKTOP_SECTION_PATHNAME}`;

/** One package catalogue after validation: what it defines, and how it ranks against the others. */
export interface UmbraDesktopPackageCatalogue {
  /** The manifest alias, which every report about this catalogue names. */
  manifestAlias: string;
  /** The manifest's root weight, on Umbraco's higher-first scale; 0 when unset or not a number. */
  manifestWeight: number;
  /** The groups that survived validation, in the package's own order. */
  groups: UmbraDesktopPackageGroup[];
  /** The entries that survived validation, in the package's own order. */
  entries: UmbraDesktopPackageEntry[];
}

/** What {@link normalisePackageCatalogues} produces. */
export interface UmbraDesktopNormalisedCatalogues {
  /** Every catalogue manifest that is an object, validated, in input order. */
  catalogues: UmbraDesktopPackageCatalogue[];
  /** Everything dropped or doubted on the way, for the context to print. */
  reports: UmbraDesktopCatalogueReport[];
}

/** Formats and collects the reports about one catalogue, so every line names its manifest alike. */
interface CatalogueReporter {
  /**
   * Report something about the catalogue as a whole.
   * @param what A short key for the problem, unique within the catalogue.
   * @param text What completes `Catalogue "<alias>" ...`.
   */
  catalogue(what: string, text: string): void;
  /**
   * Report something about one group or entry in it.
   * @param kind Which list the item is in.
   * @param alias The item's alias.
   * @param what A short key for the problem, unique within the item.
   * @param text What completes `Catalogue "<alias>", <kind> "<item>": ...`.
   */
  item(kind: 'group' | 'entry', alias: string, what: string, text: string): void;
}

/**
 * The same-origin path a package `url` resolves to, when it is somewhere a window may go: http or
 * https on this origin, under `/umbraco/section/` (design D14).
 *
 * The resolved path is returned rather than the author's string, so the window loads exactly what
 * was checked: `/umbraco/section/../x` is judged, and would be loaded, as `/umbraco/x`. `URL` does
 * the parsing because it is what the iframe will do, backslashes, protocol-relative forms and dot
 * segments included.
 * @param url The entry's `url`, absolute or relative.
 * @param origin This page's origin, passed in so the rule is testable.
 * @returns The path, query and hash to load, or `undefined` when the url is refused.
 */
export function backofficePath(url: string, origin: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url, origin);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (parsed.origin !== origin) return undefined;
  if (!parsed.pathname.startsWith(`${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/`)) return undefined;
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/**
 * Validate the package catalogue manifests Umbraco has permitted, dropping and reporting whatever
 * cannot be used. **Never throws** (design D9): the input is third-party JSON, and one throw here
 * would stop every later recompute, freezing the launcher for everyone on the install.
 *
 * A bad required field drops the item; a bad optional field drops only that field. Both are
 * reported. Unknown fields are left behind silently, so a package built for a newer desktop still
 * works on this one. Sorting and precedence are not done here: this only decides what is usable.
 * @param manifests The permitted `umbraDesktopCatalogue` manifests, typed as unknown on purpose.
 * @param origin This page's origin, for the url rule.
 * @returns The validated catalogues and the reports.
 */
export function normalisePackageCatalogues(manifests: ReadonlyArray<unknown>, origin: string): UmbraDesktopNormalisedCatalogues {
  const catalogues: UmbraDesktopPackageCatalogue[] = [];
  const reports: UmbraDesktopCatalogueReport[] = [];
  for (const manifest of manifests) {
    // The registry never hands over a non-object, so there is nothing to name and nothing to report.
    if (!isRecord(manifest)) continue;
    const manifestAlias = String(manifest.alias);
    const reporter = reporterFor(manifestAlias, reports);
    const catalogue: UmbraDesktopPackageCatalogue = {
      manifestAlias,
      manifestWeight: isFiniteNumber(manifest.weight) ? manifest.weight : 0,
      groups: [],
      entries: [],
    };
    catalogues.push(catalogue);
    const meta = manifest.meta;
    if (!isRecord(meta)) {
      reporter.catalogue('meta', 'has no "meta" object, so it defines nothing');
      continue;
    }
    catalogue.groups = normaliseList(meta.groups, 'group', reporter, (raw) => normaliseGroup(raw, reporter));
    catalogue.entries = normaliseList(meta.entries, 'entry', reporter, (raw) => normaliseEntry(raw, reporter, origin));
  }
  return { catalogues, reports };
}

/**
 * A reporter that names this catalogue in every line and keys every line so it prints once.
 * @param manifestAlias The catalogue's manifest alias.
 * @param reports Where the reports go.
 * @returns The reporter.
 */
function reporterFor(manifestAlias: string, reports: UmbraDesktopCatalogueReport[]): CatalogueReporter {
  return {
    catalogue: (what, text) =>
      reports.push({ key: `catalogue:${manifestAlias}:${what}`, message: `[UmbraDesktop] Catalogue "${manifestAlias}" ${text}.` }),
    item: (kind, alias, what, text) =>
      reports.push({
        key: `catalogue:${manifestAlias}:${kind}:${alias}:${what}`,
        message: `[UmbraDesktop] Catalogue "${manifestAlias}", ${kind} "${alias}": ${text}.`,
      }),
  };
}

/**
 * Validate a list of groups or entries: absent is empty, anything but an array is reported and
 * ignored, and the second definition of one alias in the same list loses to the first.
 * @param value The `groups` or `entries` value, as sent.
 * @param kind Which list this is, for the reports.
 * @param reporter This catalogue's reporter.
 * @param one Validates a single item, returning it or `undefined`.
 * @returns The usable items, in the package's own order.
 */
function normaliseList<T extends { alias: string }>(
  value: unknown,
  kind: 'group' | 'entry',
  reporter: CatalogueReporter,
  one: (raw: unknown) => T | undefined,
): T[] {
  if (value === undefined) return [];
  const field = kind === 'group' ? 'groups' : 'entries';
  if (!Array.isArray(value)) {
    reporter.catalogue(field, `has "${field}" that is not a list, so it was ignored`);
    return [];
  }
  const kept: T[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const item = one(raw);
    if (!item) continue;
    if (seen.has(item.alias)) {
      reporter.item(kind, item.alias, 'twice', 'is defined twice in this catalogue; the first is used');
      continue;
    }
    seen.add(item.alias);
    kept.push(item);
  }
  return kept;
}

/**
 * A reader for one item's optional fields: the value when it is valid, otherwise `undefined` with a
 * report naming the field. An absent field is simply `undefined`, and says nothing.
 * @param raw The item.
 * @param report Reports one bad field.
 * @returns The reader.
 */
function fieldReader(raw: Record<string, unknown>, report: (field: string, text: string) => void) {
  return <T>(field: string, valid: (value: unknown) => value is T, why = 'has the wrong type'): T | undefined => {
    const value = raw[field];
    if (value === undefined) return undefined;
    if (valid(value)) return value;
    report(field, `"${field}" ${why}, so it was ignored`);
    return undefined;
  };
}

/**
 * Whether a value is one of the three chrome profiles.
 * @param value Anything.
 * @returns True for `full-section`, `workspace-only` or `bare`.
 */
function isChromeProfile(value: unknown): value is UmbraDesktopChromeProfile {
  return typeof value === 'string' && CHROME_PROFILES.has(value);
}

/**
 * Whether a validated backoffice path opens the desktop's own section.
 * @param path A path from {@link backofficePath}.
 * @returns True when the window would hold a desktop.
 */
function opensDesktop(path: string): boolean {
  const pathname = path.split(/[?#]/, 1)[0];
  return pathname === DESKTOP_SECTION_PATH || pathname.startsWith(`${DESKTOP_SECTION_PATH}/`);
}

/**
 * The same object without its `undefined` fields, so a validated item carries only what was sent
 * and valid, and compares equal to it.
 * @param value The object.
 * @returns A copy without `undefined` values.
 */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}

/**
 * Validate one package entry (design D9, D14, D15).
 * @param raw The entry, as sent.
 * @param reporter This catalogue's reporter.
 * @param origin This page's origin, for the url rule.
 * @returns The usable entry, or `undefined` when it was dropped.
 */
function normaliseEntry(raw: unknown, reporter: CatalogueReporter, origin: string): UmbraDesktopPackageEntry | undefined {
  const alias = isRecord(raw) ? raw.alias : undefined;
  if (!isRecord(raw) || !isNonEmptyString(alias)) {
    reporter.catalogue('entry-without-alias', 'has an entry that is not an object with an "alias", so it was dropped');
    return undefined;
  }
  const report = (what: string, text: string) => reporter.item('entry', alias, what, text);
  if (alias.startsWith(UMBRADESKTOP_FALLBACK_ALIAS_PREFIX)) {
    report('alias', `the alias uses the reserved "${UMBRADESKTOP_FALLBACK_ALIAS_PREFIX}" prefix, so it was dropped`);
    return undefined;
  }
  const read = fieldReader(raw, report);
  const ref = read('ref', isNonEmptyString);
  const sentUrl = read('url', isNonEmptyString);
  const url = sentUrl === undefined ? undefined : backofficePath(sentUrl, origin);
  if (sentUrl !== undefined && url === undefined) {
    report('url', `"url" is not a backoffice screen on this site, so it was ignored. A url must sit under ${UMBRADESKTOP_BACKOFFICE_SECTION_PATH}/ on this origin`);
  }
  if (ref === undefined && url === undefined) {
    report('destination', 'it has neither a "ref" nor a usable "url", so it was dropped');
    return undefined;
  }
  const section = read('section', isNonEmptyString);
  if (ref === UMBRADESKTOP_SECTION_ALIAS || section === UMBRADESKTOP_SECTION_ALIAS || (url !== undefined && opensDesktop(url))) {
    report('desktop', 'it would open the desktop inside a desktop window, so it was dropped');
    return undefined;
  }
  const entry = defined<UmbraDesktopPackageEntry>({
    alias,
    ref,
    url,
    section,
    name: read('name', isNonEmptyString),
    icon: read('icon', isNonEmptyString),
    chromeProfile: read('chromeProfile', isChromeProfile, 'is not one of full-section, workspace-only or bare'),
    defaultSize: read('defaultSize', isSize, 'is not a { w, h } of positive numbers'),
    minSize: read('minSize', isSize, 'is not a { w, h } of positive numbers'),
    allowMultiple: read('allowMultiple', isBoolean),
    resizable: read('resizable', isBoolean),
    weight: read('weight', isFiniteNumber),
    group: read('group', isNonEmptyString),
    evaluateConditions: read('evaluateConditions', isStringArray, 'is not a list of condition aliases'),
  });
  if (entry.weight !== undefined && entry.weight >= SCALE_MIX_UP_WEIGHT) {
    report('scale', `"weight" is ${entry.weight}, which sorts it last: weights in a catalogue sort lower first, like the desktop's own`);
  }
  if (entry.url !== undefined && entry.evaluateConditions?.length) {
    report('url-conditions', 'a "url" bypasses registry resolution, so its "evaluateConditions" are never evaluated');
  }
  // The field an Umbraco author reaches for first, and not one an entry reads (design D12). Dropped
  // silently, the tile would show ungated, which is the wrong direction to fail in.
  if (raw.conditions !== undefined) {
    report(
      'conditions',
      'a catalogue entry does not read "conditions", so the tile shows ungated. Use "evaluateConditions" for conditions on the screen it opens, or give the gated tiles a catalogue manifest of their own with "conditions" on it',
    );
  }
  return entry;
}

/**
 * Validate one package group (design D9, §3.2).
 * @param raw The group, as sent.
 * @param reporter This catalogue's reporter.
 * @returns The usable group, or `undefined` when it was dropped.
 */
function normaliseGroup(raw: unknown, reporter: CatalogueReporter): UmbraDesktopPackageGroup | undefined {
  const alias = isRecord(raw) ? raw.alias : undefined;
  if (!isRecord(raw) || !isNonEmptyString(alias)) {
    reporter.catalogue('group-without-alias', 'has a group that is not an object with an "alias", so it was dropped');
    return undefined;
  }
  const report = (what: string, text: string) => reporter.item('group', alias, what, text);
  if (alias === UMBRADESKTOP_MORE_GROUP_ALIAS) {
    report('reserved', "that alias is the desktop's reserved More group, so it was dropped");
    return undefined;
  }
  const label = raw.label;
  if (!isNonEmptyString(label)) {
    report('label', 'it has no usable "label", so it was dropped');
    return undefined;
  }
  let weight = fieldReader(raw, report)('weight', isFiniteNumber);
  if (weight === undefined) {
    report('weight', 'it has no "weight", so it sorts ahead of every group the desktop ships (Editing is 10, System 50, Experimental 70)');
  } else if (weight >= UMBRADESKTOP_MORE_GROUP_WEIGHT) {
    report('after-more', `"weight" ${weight} would sort it after More, so it is placed just before More instead`);
    weight = UMBRADESKTOP_MORE_GROUP_WEIGHT - 1;
  } else if (weight >= SCALE_MIX_UP_WEIGHT) {
    report('scale', `"weight" is ${weight}: weights in a catalogue sort lower first, like the desktop's own (Editing is 10, System 50)`);
  }
  return weight === undefined ? { alias, label } : { alias, label, weight };
}
