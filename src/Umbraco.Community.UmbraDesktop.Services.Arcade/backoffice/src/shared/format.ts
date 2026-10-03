/**
 * A score as the Arcade shows it (design D13, §7). Points are a whole number. A time under a minute
 * is seconds to one decimal, because Minesweeper's easy board ties constantly on whole seconds;
 * from a minute it is m:ss, where a tenth no longer matters to anyone reading it.
 *
 * Flooring to the tenth, not rounding, so a board never shows a time faster than the one played.
 * @param format The board's format.
 * @param value The value: points, or milliseconds.
 * @param locale The locale for digits and the decimal mark; the backoffice's by default.
 * @returns The text.
 */
export function formatScore(format: 'points' | 'time', value: number, locale?: string): string {
  if (format === 'points') return Math.round(value).toLocaleString(locale);
  if (value < 60_000) {
    return (Math.floor(value / 100) / 10).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  const seconds = Math.floor(value / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
