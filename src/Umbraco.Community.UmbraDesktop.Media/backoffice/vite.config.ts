import { cpSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { licenceProblems, noticeBanner, packageOf } from "./scripts/licences.mjs";
import type { BundledPackage } from "./scripts/licences.mjs";

/** The notices file packed at the package's root, which every bundled package must be named in. */
const NOTICES = fileURLToPath(new URL("../THIRD-PARTY-NOTICES.md", import.meta.url));

/** The names a package's licence file goes by, in the order they are tried. */
const LICENCE_FILES = ["LICENSE", "LICENCE", "LICENSE.md", "LICENCE.md", "LICENSE.txt"];

/**
 * Reads what a bundled package says about its licence.
 * @param name The package's name.
 * @param root Its folder.
 * @returns The package, or a message saying what is missing.
 */
function readPackage(name: string, root: string): BundledPackage | string {
	const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string; license?: string };
	const file = LICENCE_FILES.map((candidate) => join(root, candidate)).find((path) => existsSync(path));
	if (!file) return `${name}@${manifest.version} has no licence file, so its notice cannot be shipped.`;
	return { name, version: manifest.version, license: manifest.license ?? "", licenseText: readFileSync(file, "utf8") };
}

/**
 * The licence check and the notices, in the build (design D10 and §9).
 *
 * After the chunks are made, every module in each one is traced to its npm package. Every package
 * must be permissively licensed and named at its version in `THIRD-PARTY-NOTICES.md`, or the build
 * fails with every problem listed; the chunk that holds a package then starts with its notice,
 * because minifying strips the libraries' own licence comments and the built file is a copy that MIT
 * asks to carry them. Entertainment's `umbradesktop-rank-outline-notice` is the model.
 * @returns The Vite plugin.
 */
function licences(): Plugin {
	return {
		name: "umbradesktop-licences",
		generateBundle(_options, bundle) {
			const notices = readFileSync(NOTICES, "utf8");
			const all = new Map<string, BundledPackage>();
			const problems: string[] = [];
			const perChunk = new Map<string, BundledPackage[]>();
			for (const file of Object.values(bundle)) {
				if (file.type !== "chunk") continue;
				const here = new Map<string, BundledPackage>();
				for (const id of file.moduleIds) {
					const found = packageOf(id);
					if (!found || here.has(found.name)) continue;
					const read = all.get(found.name) ?? readPackage(found.name, found.root);
					if (typeof read === "string") {
						if (!problems.includes(read)) problems.push(read);
						continue;
					}
					all.set(found.name, read);
					here.set(found.name, read);
				}
				perChunk.set(file.fileName, [...here.values()]);
			}
			problems.push(...licenceProblems([...all.values()], notices));
			if (problems.length) this.error(`Licence check failed:\n- ${problems.join("\n- ")}`);
			for (const file of Object.values(bundle)) {
				const packages = file.type === "chunk" ? perChunk.get(file.fileName) : undefined;
				if (file.type === "chunk" && packages?.length) file.code = `${noticeBanner(packages)}\n${file.code}`;
			}
		},
	};
}

/** One folder per package under App_Plugins, named after the package id. */
const outDir = "../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Media";

/**
 * Copies this package's docs into its App_Plugins folder, where the desktop's Help app reads them.
 *
 * After the bundle is written rather than before, because `emptyOutDir` empties the folder first.
 * The whole of `docs/` is copied: it holds only what is published, as the other add-ons' do.
 * @returns The Vite plugin.
 */
function copyDocs(): Plugin {
	return {
		name: "umbradesktop-copy-docs",
		closeBundle() {
			cpSync(fileURLToPath(new URL("../docs", import.meta.url)), fileURLToPath(new URL(`${outDir}/docs`, import.meta.url)), {
				recursive: true,
			});
		},
	};
}

export default defineConfig({
	build: {
		lib: {
			// Vite's lib mode names the output after package.json's "name", so this builds to
			// umbradesktop-media.js and umbraco-package.json has to point there.
			entry: "src/bundle.manifests.ts",
			formats: ["es"],
		},
		outDir,
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			// The backoffice is supplied by Umbraco at runtime, never bundled, and that includes Lit,
			// which every element here imports through @umbraco-cms/backoffice/external/lit. So the only
			// npm code in this bundle is Fabric.js, which the licence check below covers.
			// Nothing is imported from the host or from Services.Media: they are reached by context alias
			// and tag name.
			external: [/^@umbraco/],
		},
	},
	plugins: [copyDocs(), licences()],
});
