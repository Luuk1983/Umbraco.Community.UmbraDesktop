/**
 * One category in the settings panel: a row in the list, and the screen behind it.
 *
 * Curated rather than an extension point, the same way the themes and the app catalogue are: adding
 * a category means adding a folder and one entry in `index.ts`. There is no "registered but empty"
 * state to design for, because a category *is* its folder — which is what keeps an empty category,
 * the thing that reads as a broken screen, from being possible at all.
 */
export interface UmbraDesktopSettingsCategory {
  /** Stable id. Used by the panel's deep link, so it outlives any label change. */
  id: string;
  /** Localization key for the row's name. */
  labelKey: string;
  /** Umbraco icon for the row. */
  icon: string;
  /** The custom element that renders this category's settings. Defined by importing the registry. */
  tag: string;
  /**
   * Localization key for the line under the row's name: what this category is *for*.
   *
   * A description rather than the values inside it. The row used to summarise what was set —
   * "Umbraco, Blueprint Core" — and a wallpaper's name turns out to say nothing about what lives
   * behind the row: you have to already know what a category holds for its contents to describe it.
   * A description works the other way round, and it is the same line whether or not the settings
   * have loaded.
   */
  descriptionKey: string;
}
