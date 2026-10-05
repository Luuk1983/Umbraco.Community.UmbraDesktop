import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/** One folder per package under App_Plugins, named after the package id. */
const outDir = "../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Services.Arcade";

/**
 * Copies this package's docs into its App_Plugins folder, where the desktop's Help app reads them.
 *
 * After the bundle is written rather than before, because `emptyOutDir` empties the folder first.
 * The whole of `docs/` is copied: it holds only what is published (`product.json`, `user/`,
 * `developer/` and the screenshots those pages use), as the other add-ons do.
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

/** The display font's file in the fontsource package, and its licence. Kept in step with `src/pieces/font.ts`. */
const FONT_SOURCE = "../node_modules/@fontsource-variable/fraunces";

/**
 * Copies the Arcade's display font (Fraunces, SIL Open Font License) and its licence into this
 * package's App_Plugins folder, where `src/pieces/font.ts` points the browser. Copied rather than
 * committed, so the repository holds no binary and the version is the lock file's.
 * @returns The Vite plugin.
 */
function copyFont(): Plugin {
	return {
		name: "umbradesktop-copy-font",
		closeBundle() {
			const from = (file: string) => fileURLToPath(new URL(`${FONT_SOURCE}/${file}`, import.meta.url));
			const to = (file: string) => fileURLToPath(new URL(`${outDir}/fonts/${file}`, import.meta.url));
			cpSync(from("files/fraunces-latin-wght-normal.woff2"), to("fraunces-latin-wght-normal.woff2"));
			cpSync(from("LICENSE"), to("OFL.txt"));
		},
	};
}

export default defineConfig({
	build: {
		lib: {
			// The entry module's filename does not name the output. Vite's lib mode takes that from
			// package.json's "name", so this builds to umbradesktop-services-arcade.js and
			// umbraco-package.json has to point there.
			entry: "src/bundle.manifests.ts",
			formats: ["es"],
		},
		// One folder per package under App_Plugins, named after the package id, so two UmbraDesktop
		// packages installed together never write over each other's assets.
		outDir,
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			// The backoffice is supplied by Umbraco at runtime, never bundled. The host package is
			// deliberately absent from this list because nothing is imported from it: the manifest
			// contract is structural, so this bundle shares types with the host, not code.
			external: [/^@umbraco/],
		},
	},
	plugins: [copyDocs(), copyFont()],
});
