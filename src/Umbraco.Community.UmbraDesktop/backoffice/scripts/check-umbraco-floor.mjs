/**
 * Fails when a packed bundle imports something the oldest Umbraco the packages allow does not export.
 *
 * The floor is read from what ships, not typed here: the lower bound of the packed host's
 * `Umbraco.Cms.StaticAssets` dependency (or `Umbraco.Cms.Core`'s, which moves with it). That release's
 * backoffice is fetched from NuGet
 * (`Umbraco.Cms.StaticAssets`), and every named import of every packed `.nupkg`'s scripts is looked up
 * in its import map and modules (`umbraco-floor.mjs` has the rules and why this exists).
 *
 * Usage, from the build action after packing one Umbraco major:
 *   node check-umbraco-floor.mjs <folder with that major's .nupkg files>
 * Needs `unzip` and network access to api.nuget.org. Exits 1 on anything missing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { missingImports, moduleExports, namedImports, umbracoFloorOf } from './umbraco-floor.mjs';

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node check-umbraco-floor.mjs <folder with .nupkg files>');
  process.exit(2);
}

/**
 * Every file below a folder whose name ends with an extension.
 * @param {string} dir The folder.
 * @param {string} extension Such as `.js`.
 * @param {string[]} found Collects the paths.
 * @returns {string[]} The paths.
 */
function filesIn(dir, extension, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) filesIn(full, extension, found);
    else if (entry.name.endsWith(extension)) found.push(full);
  }
  return found;
}

const packages = readdirSync(folder).filter((name) => name.endsWith('.nupkg') && !name.endsWith('.snupkg'));
const host = packages.find((name) => /^Umbraco\.Community\.UmbraDesktop\.\d/.test(name));
if (!host) {
  console.error(`No Umbraco.Community.UmbraDesktop package in ${folder}.`);
  process.exit(1);
}
const nuspec = execFileSync('unzip', ['-p', join(folder, host), '*.nuspec'], { encoding: 'utf8' });
const floor = umbracoFloorOf(nuspec);
if (!floor) {
  console.error(`${host} has no lower bound on Umbraco.Cms.StaticAssets or Umbraco.Cms.Core.`);
  process.exit(1);
}

// The floor release's backoffice, downloaded once per version.
const work = join(tmpdir(), 'umbradesktop-umbraco-floor');
const assets = join(work, `staticassets-${floor}`);
const backoffice = join(assets, 'staticwebassets', 'umbraco', 'backoffice');
/** Written once the whole package is out, so a run cut short is never mistaken for a finished one. */
const extracted = join(assets, '.extracted');
if (!existsSync(extracted)) {
  mkdirSync(assets, { recursive: true });
  const id = 'umbraco.cms.staticassets';
  const response = await fetch(`https://api.nuget.org/v3-flatcontainer/${id}/${floor}/${id}.${floor}.nupkg`);
  if (!response.ok) {
    console.error(`Could not download Umbraco.Cms.StaticAssets ${floor}: ${response.status}.`);
    process.exit(1);
  }
  const archive = join(work, `${id}.${floor}.nupkg`);
  writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  // Whole: a `dir/*` pattern does not reach below `dir` in every unzip (Windows' 6.00 stops there).
  execFileSync('unzip', ['-q', '-o', archive, '-d', assets]);
  writeFileSync(extracted, floor);
}
const importMap = JSON.parse(readFileSync(join(backoffice, 'umbraco-package.json'), 'utf8')).importmap.imports;

/** Each module file's exported names, following `export *`, read once. */
const cache = new Map();

/**
 * Every name a module file exports, including what it passes on from others.
 * @param {string} file The module file.
 * @param {Set<string>} visiting Files on the current path, so a cycle ends.
 * @returns {Set<string>} The names.
 */
function exportsOfFile(file, visiting = new Set()) {
  if (cache.has(file)) return cache.get(file);
  if (visiting.has(file) || !existsSync(file)) return new Set();
  visiting.add(file);
  const { names, starFrom } = moduleExports(readFileSync(file, 'utf8'));
  for (const specifier of starFrom) for (const name of exportsOfFile(resolve(dirname(file), specifier), visiting)) names.add(name);
  cache.set(file, names);
  return names;
}

/**
 * Every name a backoffice module exports in the floor release.
 * @param {string} module Such as `@umbraco-cms/backoffice/imaging`.
 * @returns {Set<string> | undefined} The names, or undefined when the release has no such module.
 */
const exportsOf = (module) => {
  const url = importMap[module];
  return url ? exportsOfFile(join(backoffice, url.replace(/^\/umbraco\/backoffice\//, ''))) : undefined;
};

let failed = false;
for (const name of packages) {
  const unpacked = join(work, 'packages', name);
  mkdirSync(unpacked, { recursive: true });
  // Whole, for the same reason as the backoffice above.
  execFileSync('unzip', ['-q', '-o', join(folder, name), '-d', unpacked]);
  const imports = filesIn(join(unpacked, 'staticwebassets'), '.js').flatMap((file) => namedImports(readFileSync(file, 'utf8')));
  const missing = missingImports(imports, exportsOf);
  if (missing.length) {
    failed = true;
    console.log(`::error::${name} imports what Umbraco ${floor}, its floor, does not have:`);
    for (const item of missing) console.log(`  ${item.module}${item.name ? ` ${item.name}` : ' (no such module)'}`);
  } else {
    console.log(`${name}: all ${imports.length} imports from the backoffice resolve in Umbraco ${floor}.`);
  }
}
process.exit(failed ? 1 : 0);
