/** Types for `umbraco-floor.mjs`, which is plain JS so the build action can run it with no install. */

/** One name a bundle imports from one backoffice module. */
export interface UmbracoImport {
  module: string;
  name: string;
}

/** Every name a bundle imports from a backoffice module, by the name the module exports it under. */
export declare function namedImports(source: string): UmbracoImport[];

/** The names a module exports itself, and the modules it passes every name of on. */
export declare function moduleExports(source: string): { names: Set<string>; starFrom: string[] };

/** The lowest version a NuGet dependency allows. */
export declare function rangeFloor(range: string): string | undefined;

/** The oldest Umbraco a packed package allows, from its nuspec's backoffice or Core dependency. */
export declare function umbracoFloorOf(nuspec: string): string | undefined;

/** Which imports a release cannot satisfy: each missing name once, and a missing module once. */
export declare function missingImports(
  imports: ReadonlyArray<UmbracoImport>,
  exportsOf: (module: string) => Set<string> | undefined,
): Array<{ module: string; name?: string }>;
