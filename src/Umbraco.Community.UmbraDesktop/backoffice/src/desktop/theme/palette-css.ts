import type { UmbraDesktopPalette } from './types';

/**
 * Render a palette as a declaration string for a `style` attribute.
 *
 * Emitted as one string, and applied by replacing the whole attribute, so that switching to a
 * theme which does not set a token clears the previous theme's value instead of leaving it
 * stranded. An empty palette therefore renders an empty string, which is what a theme that is only
 * stylesheets needs (the Umbraco theme was one until it grew a palette of its own).
 * @param palette The palette to render.
 * @returns The declarations, or an empty string when the palette sets nothing.
 */
export function paletteCss(palette: UmbraDesktopPalette): string {
  return Object.entries(palette)
    .filter(([, value]) => value !== undefined)
    .map(([token, value]) => `${token}:${value};`)
    .join('');
}

/**
 * What makes a disabled button look disabled in every app on the desktop, whatever the theme.
 *
 * UUI 2.0.2, the floor's, gives a primary button its colour with a rule (`look='primary'` and
 * `color`, two attributes) that outranks the one giving a disabled button the disabled colour
 * (`disabled`, one), so a disabled primary button paints exactly its enabled fill and only the
 * cursor changes. Media Health's step 1 shipped a Review button that looked pressable because of it
 * (design §16.1). UUI's disabled rule reads these three public properties before its own `--color`,
 * so setting them to the backoffice's own disabled colours restores the state for every look. A
 * default or outline button, transparent when disabled until now, gets the faint disabled fill too:
 * a restyle, never a removal. `disabled-buttons.test.ts` holds it for every theme and variant.
 */
export const UMBRADESKTOP_DISABLED_BUTTONS =
  '--uui-button-background-color-disabled:var(--uui-color-disabled);' +
  '--uui-button-border-color-disabled:var(--uui-color-disabled);' +
  '--uui-button-contrast-disabled:var(--uui-color-disabled-contrast);';

/**
 * The desktop's `style`: {@link UMBRADESKTOP_DISABLED_BUTTONS} first, then the theme's palette, so a
 * theme that wants its own disabled look can still set the same properties and win.
 * @param palette The active palette.
 * @returns The declarations.
 */
export function desktopStyleOf(palette: UmbraDesktopPalette): string {
  return UMBRADESKTOP_DISABLED_BUTTONS + paletteCss(palette);
}
