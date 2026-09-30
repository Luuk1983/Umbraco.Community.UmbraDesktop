/** Types for `pin-readme.mjs`, which is plain JS so the pack script can import it. */

/** Pins every relative link and image in a README to one commit of the repository. */
export declare function pinReadmeLinks(
  markdown: string,
  options: { repo: string; ref: string; readmeDir?: string },
): string;
