import type { UmbraDesktopPalette } from './types';

/**
 * Render a palette as a declaration string for a `style` attribute.
 *
 * Emitted as one string, and applied by replacing the whole attribute, so that switching to a
 * theme which does not set a token clears the previous theme's value instead of leaving it
 * stranded. An empty palette therefore renders an empty string, which is exactly what the Umbraco
 * identity theme needs.
 * @param palette The palette to render.
 * @returns The declarations, or an empty string when the palette sets nothing.
 */
export function paletteCss(palette: UmbraDesktopPalette): string {
  return Object.entries(palette)
    .filter(([, value]) => value !== undefined)
    .map(([token, value]) => `${token}:${value};`)
    .join('');
}
