/**
 * The pure half of the Umbraco floor check (`check-umbraco-floor.mjs` does the reading and
 * downloading): what our bundles import from the backoffice, what a release's modules export, and
 * which of the first the second lacks.
 *
 * It exists because a bundle that imports a name its Umbraco does not export fails to link, and so does
 * everything that imports it. The packages declared Umbraco 17.0.0 as their floor while the desktop
 * imported names that arrived in 17.4, so on 17.0 to 17.3 it never loaded, and nothing noticed: every
 * test runs against the backoffice in the lock file, which is the newest.
 *
 * Plain JS, so the build action can run it with no install. Types are in `umbraco-floor.d.mts`.
 */

/** A bundle importing one name from one backoffice module. */
const IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'](@umbraco-cms\/backoffice\/[^"']+)["']/g;

/** An export list: `export { a as b, c }`, with or without a `from`. */
const EXPORT_LIST = /export\s*\{([^}]*)\}/g;

/** A declaration exported where it is made. */
const EXPORT_DECLARATION = /export\s+(?:const|let|var|async\s+function|function\*?|class)\s+([A-Za-z_$][\w$]*)/g;

/** `export * from "…"`, which takes every name of another module. */
const EXPORT_STAR = /export\s*\*\s*from\s*["']([^"']+)["']/g;

/**
 * Every name a bundle imports from a backoffice module, by the name the module exports it under.
 * @param {string} source The bundle's code.
 * @returns {Array<{ module: string, name: string }>} The imports, in order.
 */
export function namedImports(source) {
  const imports = [];
  for (const match of source.matchAll(IMPORT)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) imports.push({ module: match[2], name });
    }
  }
  return imports;
}

/**
 * The names a module exports itself, and the modules it passes every name of on.
 * @param {string} source The module's code.
 * @returns {{ names: Set<string>, starFrom: string[] }} Its own exported names, and the specifiers of
 *   its `export *` modules, for the caller to resolve and read.
 */
export function moduleExports(source) {
  const names = new Set();
  for (const match of source.matchAll(EXPORT_LIST)) {
    for (const part of match[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const name = (bits[1] ?? bits[0]).trim();
      if (name) names.add(name);
    }
  }
  for (const match of source.matchAll(EXPORT_DECLARATION)) names.add(match[1]);
  const starFrom = [...source.matchAll(EXPORT_STAR)].map((match) => match[1]);
  return { names, starFrom };
}

/**
 * The lowest version a NuGet dependency allows.
 * @param {string} range A range such as `[17.4.0, 17.99999999.0]`, or a plain minimum such as `17.4.0`.
 * @returns {string | undefined} The lower bound, or undefined when the range has none.
 */
export function rangeFloor(range) {
  const match = /^\s*[[(]?\s*([0-9][^,\])\s]*)/.exec(range);
  return match ? match[1] : undefined;
}

/**
 * Which imports a release cannot satisfy.
 * @param {Array<{ module: string, name: string }>} imports What the bundles import.
 * @param {(module: string) => Set<string> | undefined} exportsOf Every name a module exports in that
 *   release, or undefined when the release has no such module.
 * @returns {Array<{ module: string, name?: string }>} Each missing name once, and a missing module
 *   once, without its names.
 */
export function missingImports(imports, exportsOf) {
  const missing = [];
  const seen = new Set();
  for (const { module, name } of imports) {
    const exported = exportsOf(module);
    const key = exported ? `${module} ${name}` : module;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!exported) missing.push({ module });
    else if (!exported.has(name)) missing.push({ module, name });
  }
  return missing;
}
