import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			// The entry module's filename does not name the output. Vite's lib mode takes that from
			// package.json's "name", so this builds to umbradesktop-entertainment.js and
			// umbraco-package.json has to point there.
			entry: "src/bundle.manifests.ts",
			formats: ["es"],
		},
		// One folder per package under App_Plugins, named after the package id, so two UmbraDesktop
		// packages installed together never write over each other's assets.
		outDir: "../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop.Entertainment",
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
