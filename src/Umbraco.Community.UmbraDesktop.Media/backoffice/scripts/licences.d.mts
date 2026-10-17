/** Types for `licences.mjs`, which is plain JS so the Vite config and the test runner both import it. */

/** An npm package in the bundle, with what its licence says. */
export interface BundledPackage {
  /** Its name, with its scope. */
  name: string;
  /** Its version. */
  version: string;
  /** Its `license` field, an SPDX expression. */
  license: string;
  /** Its licence file's full text. */
  licenseText: string;
}

/** The licences a bundled package may carry, by SPDX id. */
export declare const ALLOWED_LICENCES: string[];

/** The npm package a bundled module belongs to, or null outside `node_modules`. */
export declare function packageOf(moduleId: string): { name: string; root: string } | null;

/** Everything wrong with the bundle's packages, one message each. */
export declare function licenceProblems(packages: BundledPackage[], notices: string): string[];

/** The `/*!` comment that heads a chunk with its packages' notices. */
export declare function noticeBanner(packages: BundledPackage[]): string;
