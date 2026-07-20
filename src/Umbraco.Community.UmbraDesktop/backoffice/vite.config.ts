import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: "src/bundle.manifests.ts", // your web component source file
			formats: ["es"],
		},
		outDir: "../wwwroot/App_Plugins/Umbraco.Community.UmbraDesktop", // all compiled files will be placed here
		emptyOutDir: true,
		sourcemap: true,
		rollupOptions: {
			external: [/^@umbraco/], // ignore the Umbraco Backoffice package in the build
		},
	}
});