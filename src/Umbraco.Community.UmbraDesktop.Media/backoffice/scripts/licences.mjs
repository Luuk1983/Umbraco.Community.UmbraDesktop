/**
 * The licence check the Vite build runs over every npm package in the built JavaScript.
 *
 * Plain JavaScript, pure, and with no Node imports, so `vite.config.ts` runs it at build time and the
 * test runner runs it in the browser. Design D10 and §9 of
 * `docs/design/2026-10-17-image-editor-design.md`: MIT asks for its copyright line and licence text
 * in every copy, and the built JavaScript is a copy, so the build stamps each package's notice on
 * the chunk that holds it (minifying strips the libraries' own comments), and fails on a package
 * whose licence is not permissive or that `THIRD-PARTY-NOTICES.md` does not name. An update that
 * brings in a new package, or a copyleft one, then stops the build instead of shipping.
 */

/** The licences a bundled package may carry, by SPDX id. */
export const ALLOWED_LICENCES = ['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC'];

/**
 * The npm package a bundled module belongs to: the segment after the last `node_modules`, with its
 * scope when it has one.
 * @param {string} moduleId A module id from the bundle, a file path or a virtual id.
 * @returns {{ name: string; root: string } | null} The package's name and folder, or null for a
 *   module that is not in `node_modules` (this package's own source, Vite's helpers).
 */
export function packageOf(moduleId) {
  const path = moduleId.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const at = path.lastIndexOf(marker);
  if (at < 0 || path.startsWith('\0')) return null;
  const rest = path.slice(at + marker.length).split('/');
  const name = rest[0]?.startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return { name, root: path.slice(0, at + marker.length) + name };
}

/**
 * Whether an SPDX licence expression is allowed. A choice (`OR`) is allowed when any side is, a
 * combination (`AND`) only when every side is; `UNLICENSED`, an empty field, or anything not on the
 * list is not. Brackets are only grouping here, and a package's field is short enough that reading
 * it flat is exact for the expressions npm packages carry.
 * @param {string} expression The `license` field.
 * @returns {boolean} True when allowed.
 */
function allowed(expression) {
  const flat = expression.replace(/[()]/g, ' ').trim();
  if (!flat) return false;
  return flat
    .split(/\s+OR\s+/)
    .some((choice) => choice.split(/\s+AND\s+/).every((id) => ALLOWED_LICENCES.includes(id.trim())));
}

/**
 * Everything wrong with the bundle's packages, one message each.
 * @param {Array<{ name: string; version: string; license: string; licenseText: string }>} packages
 *   Every npm package in the bundle.
 * @param {string} notices The contents of `THIRD-PARTY-NOTICES.md`.
 * @returns {string[]} The problems; empty when the bundle may ship.
 */
export function licenceProblems(packages, notices) {
  const problems = [];
  for (const { name, version, license } of packages) {
    const id = `${name}@${version}`;
    if (!allowed(license ?? '')) {
      problems.push(`${id} is licensed "${license || 'nothing'}", which is not one of ${ALLOWED_LICENCES.join(', ')}.`);
    }
    if (!notices.includes(id)) problems.push(`${id} is bundled but THIRD-PARTY-NOTICES.md does not name it.`);
  }
  return problems;
}

/**
 * The comment that heads a chunk: each package's name, version and licence, then its full licence
 * text. `/*!` so a minifier that does keep comments keeps this one. Sorted by name, so the banner
 * is the same build to build.
 * @param {Array<{ name: string; version: string; license: string; licenseText: string }>} packages
 *   The packages in the chunk.
 * @returns {string} The comment.
 */
export function noticeBanner(packages) {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
  return sorted
    .map(({ name, version, license, licenseText }) => {
      // A licence text holding the comment's own end would close it early and leave the rest as code.
      const text = licenseText.trim().replace(/\*\//g, '* /');
      return `/*! ${name}@${version} | ${license}\n${text}\n*/`;
    })
    .join('\n');
}
