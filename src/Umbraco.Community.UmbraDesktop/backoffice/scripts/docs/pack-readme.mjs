/**
 * Writes the copy of a README that goes into a NuGet package, with every relative link pinned to
 * the commit being packed. See pin-readme.mjs for why.
 *
 * Called by the `PinPackedReadme` target in src/Directory.Build.targets, for every packed project.
 *
 * Usage: node pack-readme.mjs --readme <file> --out <file> --repo-url <url> [--ref <commit>]
 *
 * Without `--ref`, or with an empty one, it pins to `git rev-parse HEAD`. MSBuild passes
 * `$(SourceRevisionId)`, which SourceLink fills in on a normal pack but not always on
 * `dotnet pack --no-build`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { pinReadmeLinks } from './pin-readme.mjs';

/**
 * Reads `--name value` pairs from the command line.
 * @param {string[]} argv Arguments after the script name.
 * @returns {Record<string, string>} Values by name, without the dashes.
 */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) args[argv[i].replace(/^--/, '')] = argv[i + 1] ?? '';
  return args;
}

/**
 * Runs git in a directory and returns its trimmed output.
 * @param {string} cwd Where to run it.
 * @param {string[]} args Git arguments.
 * @returns {string} Standard output.
 */
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const args = parseArgs(process.argv.slice(2));
if (!args.readme || !args.out || !args['repo-url']) {
  console.error('Usage: node pack-readme.mjs --readme <file> --out <file> --repo-url <url> [--ref <commit>]');
  process.exit(1);
}

const readme = resolve(args.readme);
const repoRoot = git(dirname(readme), ['rev-parse', '--show-toplevel']);
const ref = args.ref || git(repoRoot, ['rev-parse', 'HEAD']);
const repo = new URL(args['repo-url']).pathname.replace(/^\/|\.git$|\/$/g, '');
const readmeDir = relative(resolve(repoRoot), dirname(readme)).split(sep).join('/');

const pinned = pinReadmeLinks(readFileSync(readme, 'utf8'), { repo, ref, readmeDir });
mkdirSync(dirname(resolve(args.out)), { recursive: true });
writeFileSync(resolve(args.out), pinned);
console.log(`Pinned ${relative(repoRoot, readme)} to ${repo}@${ref.slice(0, 12)} for packing.`);
