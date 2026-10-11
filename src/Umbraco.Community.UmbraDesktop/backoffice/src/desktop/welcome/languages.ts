/**
 * The language page's list (design doc D14).
 *
 * Pure, with the names passed in as a function, because the names come from the backoffice's own
 * `uiCulture_` dictionary and a test should not need that loaded to check the order.
 */

/** One row of the list. */
export interface UmbraDesktopWelcomeLanguage {
  /** The culture, lowercased, as the profile stores it. */
  culture: string;

  /** The language's name in that language, the way people look for their own. */
  name: string;

  /** Whether the desktop shows in English for this language, because it has no translation of its own. */
  desktopInEnglish: boolean;
}

/**
 * Whether the desktop has its own strings for a culture.
 *
 * A regional culture counts when the desktop has its language: the backoffice falls back from
 * `nl-nl` to `nl` when it looks a key up, so the desktop's Dutch reaches a `nl-nl` user.
 * @param culture The backoffice culture.
 * @param desktopCultures The cultures the desktop registers dictionaries for.
 * @returns True when the desktop is translated into it.
 */
export function desktopTranslates(culture: string, desktopCultures: ReadonlyArray<string>): boolean {
  const own = new Set(desktopCultures.map((c) => c.toLowerCase()));
  const lower = culture.toLowerCase();
  return own.has(lower) || own.has(lower.split('-')[0]);
}

/**
 * The list: every culture once, alphabetical by its own name, with the ones the desktop is not
 * translated into marked.
 *
 * Every backoffice culture rather than only the desktop's, because this page sets the user's
 * backoffice language, the same setting as their Umbraco profile, and every window is the
 * backoffice. Listing only the desktop's two would stop a German editor choosing German here.
 *
 * Sorted the way core's own culture picker sorts, so the two lists agree.
 * @param cultures The backoffice's registered cultures, in any case and order, repeats allowed.
 * @param desktopCultures The cultures the desktop registers dictionaries for.
 * @param nameOf The name of a lowercased culture in its own language.
 * @returns The rows, in display order.
 */
export function welcomeLanguages(
  cultures: ReadonlyArray<string>,
  desktopCultures: ReadonlyArray<string>,
  nameOf: (culture: string) => string,
): UmbraDesktopWelcomeLanguage[] {
  // Every package that ships a dictionary registers its own manifest for the same culture, so the
  // registry holds repeats.
  const distinct = [...new Set(cultures.map((culture) => culture.toLowerCase()))];

  return distinct
    .map((culture) => ({
      culture,
      name: nameOf(culture),
      desktopInEnglish: !desktopTranslates(culture, desktopCultures),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The sentence a fallback mark explains itself with, naming the language in the language the wizard
 * is in: "The desktop isn't translated into Spanish yet…".
 *
 * The name comes from the browser rather than a dictionary, so every culture the backoffice ships
 * has one without the desktop translating two dozen language names into each of its languages.
 * @param culture The row's culture.
 * @param uiCulture The culture the wizard is showing in.
 * @param term Looks a localization key up with its arguments, as `localize.term` does.
 * @returns The explanation.
 */
export function fallbackExplanation(
  culture: string,
  uiCulture: string,
  term: (key: string, ...args: unknown[]) => string,
): string {
  let name = culture;
  try {
    name = new Intl.DisplayNames([uiCulture], { type: 'language' }).of(culture) ?? culture;
  } catch {
    // An unknown or malformed tag: the code itself is still a better name than nothing.
  }
  return term('umbraDesktop_welcomeLanguageFallback', name);
}
