/**
 * Test support: WCAG contrast between two colours, for the checks that a theme's colours stay
 * legible on the ground they are promised against.
 *
 * Test-only, and imported only by `*.test.ts` files. It sits here, beside `palette-css.ts`, for
 * the reason `themes/mount-themed.ts` gives for itself: more than one test file measures contrast
 * now, the app tokens and the desktop label, and two copies of a luminance formula are exactly the
 * kind of drift these tests exist to catch elsewhere.
 */
/**
 * Parse a palette value into 8-bit sRGB channels, or `null` when it is not an opaque colour.
 *
 * Deliberately narrow. It understands `#rgb`, `#rrggbb` and `rgb()`/`rgba()`, which is every form
 * the six palettes actually use for these tokens, and refuses everything else — a gradient, a
 * `var()`, a named colour, `transparent`, or an `rgba()` with alpha below 1. Refusing is the point:
 * a translucent or computed value has no defined luminance without knowing what is behind it, and
 * inventing a backdrop to measure against would turn a real unknown into a confident wrong number.
 * The caller skips what this returns `null` for and reports it separately.
 *
 * It also reads `color(srgb r g b)`, with channels from 0 to 1, because that is how Chrome reports a
 * *computed* `color-mix(in srgb, …)`. The Umbraco theme's desktop ground is exactly that, so a test
 * measuring what the desktop really paints meets this form rather than a palette's hex.
 *
 * @param value The palette value as written in a `palette.ts`, or a computed style.
 * @returns The `[r, g, b]` channels in 0-255, or `null` if the value is not an opaque colour.
 */
export function parseOpaqueColor(value: string): [number, number, number] | null {
  const text = value.trim();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) {
    // `#abc` is `#aabbcc`, not `#0a0b0c`: each digit is doubled, not zero-padded.
    return [1, 2, 3].map((i) => parseInt(short[i] + short[i], 16)) as [number, number, number];
  }

  const long = /^#([0-9a-f]{6})$/i.exec(text);
  if (long) {
    return [0, 2, 4].map((i) => parseInt(long[1].slice(i, i + 2), 16)) as [number, number, number];
  }

  // Both the legacy comma syntax and the modern space syntax, with either separator before alpha.
  const functional = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (functional) {
    if (functional[4] !== undefined && Number(functional[4]) < 1) return null;
    return [1, 2, 3].map((i) => Number(functional[i])) as [number, number, number];
  }

  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/i.exec(text);
  if (srgb) {
    if (srgb[4] !== undefined && Number(srgb[4]) < 1) return null;
    return [1, 2, 3].map((i) => Number(srgb[i]) * 255) as [number, number, number];
  }

  return null;
}

/**
 * Relative luminance per WCAG 2.1: each channel linearised out of sRGB's transfer curve, then
 * weighted for the eye's response, which is why green dominates the sum.
 *
 * @param rgb The `[r, g, b]` channels in 0-255.
 * @returns Relative luminance in 0-1.
 */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((channel) => {
    const scaled = channel / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * The WCAG contrast ratio of two palette values, `(lighter + 0.05) / (darker + 0.05)`.
 *
 * Symmetric by construction — it sorts the two luminances rather than trusting the caller to pass
 * the lighter one first — so a pair whose direction flips between a theme's light and dark variants
 * (as Win11's accent does) needs no special handling at the call site.
 *
 * @param a One value.
 * @param b The other.
 * @returns The ratio, from 1 (identical) to 21 (black on white), or `null` if either value is not
 * an opaque colour and the pair therefore cannot be measured.
 */
export function contrastRatio(a: string, b: string): number | null {
  const first = parseOpaqueColor(a);
  const second = parseOpaqueColor(b);
  if (!first || !second) return null;

  const luminances = [relativeLuminance(first), relativeLuminance(second)];
  const lighter = Math.max(...luminances);
  const darker = Math.min(...luminances);
  return (lighter + 0.05) / (darker + 0.05);
}
