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
			// Leave the backoffice packages to the import map Umbraco already provides, rather than
			// bundling a second copy of them.
			//
			// Scoped to `@umbraco-cms` and not `@umbraco`, which matters more than it looks. The
			// desktop plugs into Umbraco AI's extension points (see `desktop/ai/`), and AI is an
			// optional package: its `@umbraco-ai/*` modules are in the import map only when it is
			// installed, so a bundle that imports one does not degrade on an install without AI, it
			// fails to load and takes the whole desktop with it. Under the old `/^@umbraco/` any such
			// import was externalised and shipped silently. Under this one it fails the build, which
			// is where that mistake should be caught. `desktop/ai/ai.extension.ts` is why nothing
			// needs to import from AI in the first place.
			external: [/^@umbraco-cms/],
		},
	}
});