import { cpSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** One folder per package under App_Plugins, named after the package id. */
const outDir = "../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment";

/**
 * Copies this package's docs into its App_Plugins folder, where the desktop's Help app reads them.
 *
 * After the bundle is written rather than before, because `emptyOutDir` empties the folder first.
 * The whole of `docs/` is copied: it holds only what is published (`product.json`, `user/` and the
 * screenshots those pages use), so there is nothing to leave out. These are the lines the host's
 * add-on guide shows, used as written.
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

/**
 * The Apache 2.0 notice for the card rank outlines, read from the `/*! ... *\/` block at the top of
 * the generated file so it is written in exactly one place (scripts/build-ranks.mjs).
 *
 * Apache 2.0 requires the copyright notice and a statement of changes to travel with the outlines,
 * and the bundler drops comments, legal ones included when they sit above code that compiles away.
 * So the build stamps the notice onto whichever output chunk contains that module, in
 * `generateBundle`: that runs after minification, which is what strips an `output.banner` here.
 */
const RANKS_MODULE = "ranks.generated.ts";
const RANKS_NOTICE = (/^\/\*![\s\S]*?\*\//.exec(readFileSync(`src/solitaire/faces/classic/${RANKS_MODULE}`, "utf8")) ?? [""])[0];

export default defineConfig({
	plugins: [
		copyDocs(),
		{
			name: "umbradesktop-rank-outline-notice",
			/** Prepends the notice to the chunk holding the outlines, and fails the build if none does. */
			generateBundle(_options, bundle) {
				const chunks = Object.values(bundle).filter(
					(file) => file.type === "chunk" && file.moduleIds.some((id) => id.endsWith(RANKS_MODULE)),
				);
				if (!RANKS_NOTICE || chunks.length === 0) {
					this.error(`The Apache 2.0 notice for ${RANKS_MODULE} could not be attached to the build.`);
				}
				for (const chunk of chunks) if (chunk.type === "chunk") chunk.code = `${RANKS_NOTICE}
${chunk.code}`;
			},
		},
	],
	build: {
		lib: {
			// The entry module's filename does not name the output. Vite's lib mode takes that from
			// package.json's "name", so this builds to umbradesktop-entertainment.js and
			// umbraco-package.json has to point there.
			entry: "src/bundle.manifests.ts",
			formats: ["es"],
		},
		// So two UmbraDesktop packages installed together never write over each other's assets.
		outDir,
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			// The backoffice is supplied by Umbraco at runtime, never bundled. The host package is
			// deliberately absent from this list because nothing is imported from it: the manifest
			// contract is structural, so this bundle shares types with the host, not code.
			external: [/^@umbraco/],
		},
	}
});
