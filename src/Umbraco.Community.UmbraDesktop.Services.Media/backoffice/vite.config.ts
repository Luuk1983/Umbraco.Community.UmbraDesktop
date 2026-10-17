import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** One folder per package under App_Plugins, named after the package id. */
const outDir = "../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Media";

/**
 * Copies this package's docs into its App_Plugins folder, where the desktop's Help app reads them.
 *
 * After the bundle is written rather than before, because `emptyOutDir` empties the folder first.
 * The whole of `docs/` is copied: it holds only what is published, as the other packages' do.
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
			// umbradesktop-services-media.js and umbraco-package.json has to point there.
			entry: "src/bundle.manifests.ts",
			formats: ["es"],
		},
		outDir,
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			// The backoffice is supplied by Umbraco at runtime, never bundled. Nothing is imported from
			// the host or from any add-on: they reach this package by its context alias.
			external: [/^@umbraco/],
		},
	},
	plugins: [copyDocs()],
});
