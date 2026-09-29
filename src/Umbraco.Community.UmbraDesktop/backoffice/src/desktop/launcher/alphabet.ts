import type { UmbraDesktopApp } from '../types';

/**
 * The All apps drawer's ordering (design §3.2, D8): by translated name, in the backoffice culture,
 * under letter headings. Pure, and given the name function rather than a localizer so it can be
 * tested without one.
 */

/** One letter heading and the apps under it. */
export interface UmbraDesktopLetterSection {
  /** The heading: an uppercase letter without its accent, or `#`. */
  letter: string;
  /** The apps, in collation order. */
  apps: UmbraDesktopApp[];
}

/**
 * A collator for a culture, or for the runtime's default when the culture is one the browser
 * rejects: `Intl` throws a `RangeError` for a malformed tag, and a drawer that cannot open is a far
 * worse failure than one sorted in the wrong language.
 * @param locale The backoffice culture, e.g. `en-us`.
 * @returns A collator.
 */
function collatorFor(locale: string): Intl.Collator {
  try {
    return new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  } catch {
    return new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  }
}

/**
 * The heading a name files under. Accents are stripped so "Éditeur" sits with the other Es, which is
 * how a phone's contact list does it; anything that does not start with a letter goes under `#`.
 * @param name The translated name.
 * @param locale The backoffice culture.
 * @returns The heading.
 */
export function letterOf(name: string, locale: string): string {
  const first = [...name.trim()][0] ?? '';
  const base = first.normalize('NFD').replace(/\p{M}/gu, '');
  let upper: string;
  try {
    upper = base.toLocaleUpperCase(locale);
  } catch {
    upper = base.toUpperCase();
  }
  return /\p{L}/u.test(upper) ? upper : '#';
}

/**
 * Sort apps by name and group them under letter headings.
 * @param apps The apps.
 * @param nameOf Their translated name.
 * @param locale The backoffice culture.
 * @returns The sections, in order.
 */
export function alphabetise(
  apps: ReadonlyArray<UmbraDesktopApp>,
  nameOf: (app: UmbraDesktopApp) => string,
  locale: string,
): UmbraDesktopLetterSection[] {
  const collator = collatorFor(locale);
  const sorted = [...apps].sort((a, b) => collator.compare(nameOf(a), nameOf(b)));
  const sections: UmbraDesktopLetterSection[] = [];
  for (const app of sorted) {
    const letter = letterOf(nameOf(app), locale);
    const last = sections[sections.length - 1];
    if (last && last.letter === letter) last.apps.push(app);
    else sections.push({ letter, apps: [app] });
  }
  return sections;
}

/**
 * The apps whose name contains the filter text anywhere, ignoring case.
 * @param apps The apps.
 * @param nameOf Their translated name.
 * @param query What the user typed.
 * @returns The matching apps, in the order given; all of them for an empty filter.
 */
export function filterApps(
  apps: ReadonlyArray<UmbraDesktopApp>,
  nameOf: (app: UmbraDesktopApp) => string,
  query: string,
): UmbraDesktopApp[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...apps];
  return apps.filter((app) => nameOf(app).toLocaleLowerCase().includes(needle));
}
