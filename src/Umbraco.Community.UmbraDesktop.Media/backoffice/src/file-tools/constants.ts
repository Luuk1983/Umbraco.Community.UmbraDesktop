/**
 * The file tools' names (#176), apart from their code, so the bundle's manifests can name them
 * without pulling the tools into the bundle's main chunk.
 */

/** The file-property condition's alias. */
export const UMBRADESKTOP_FILE_PROPERTY_CONDITION = 'Umbraco.Community.UmbraDesktop.Media.Condition.FileProperty';

/**
 * Which of the file's tools a manifest runs, in its `meta.umbraDesktopTool`: one tool, reached from the
 * footer button, its fold-out and the file property's menu, through one implementation.
 */
export type UmbraDesktopFileTool = 'editImage' | 'download' | 'replaceFile' | 'optimize';
