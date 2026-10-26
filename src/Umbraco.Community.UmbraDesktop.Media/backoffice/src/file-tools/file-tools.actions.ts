import { UmbWorkspaceActionBase, UmbWorkspaceActionMenuItemBase } from '@umbraco-cms/backoffice/workspace';
import { UmbPropertyActionBase } from '@umbraco-cms/backoffice/property-action';
import type { UmbraDesktopFileTool } from './constants.js';
import { runFileTool } from './run-tool.js';

/**
 * The three ways the file's tools are reached (#176), each a thin class that runs the tool its
 * manifest names in `meta.umbraDesktopTool`: one implementation per tool, three manifests over it.
 * Core hands every one of these its manifest's `meta` as `args.meta`.
 */

/** What a file tool's manifest carries beyond core's own meta. */
interface FileToolMeta {
  /** Which tool. */
  umbraDesktopTool: UmbraDesktopFileTool;
}

/** A plain button beside Save in the media item's footer: Download. */
export class UmbraDesktopFileToolWorkspaceAction extends UmbWorkspaceActionBase<FileToolMeta> {
  /** Run the tool. */
  override async execute(): Promise<void> {
    await runFileTool(this, this.args.meta.umbraDesktopTool);
  }
}

/**
 * File actions' api. Core makes an api for every workspace action, but File actions' button only opens
 * its menu (`file-actions.element.ts`), whose entries run the tools.
 */
export class UmbraDesktopFileActionsApi extends UmbWorkspaceActionBase<never> {
  /** Nothing: the menu's entries do the work. */
  override async execute(): Promise<void> {}
}

/** An entry under File actions: Edit image, Replace file, Optimize. */
export class UmbraDesktopFileToolMenuItem extends UmbWorkspaceActionMenuItemBase<FileToolMeta> {
  /** Run the tool. */
  override async execute(): Promise<void> {
    await runFileTool(this, this.args.meta.umbraDesktopTool);
  }
}

/** An entry in the file property's own "..." menu. */
export class UmbraDesktopFileToolPropertyAction extends UmbPropertyActionBase<FileToolMeta> {
  /** Run the tool. */
  override async execute(): Promise<void> {
    await runFileTool(this, this.args.meta.umbraDesktopTool);
  }
}
