/** Types for `copy-plan.mjs`, which is plain JS so the copy script can import it. */

/** Decides which docs files and images go into a package for the Help app. */
export declare function planDocsCopy(files: Map<string, string>): {
  files: string[];
  images: string[];
  problems: string[];
};
