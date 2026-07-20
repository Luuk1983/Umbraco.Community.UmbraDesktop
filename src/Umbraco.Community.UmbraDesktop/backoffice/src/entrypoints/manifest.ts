export const manifests: Array<UmbExtensionManifest> = [
  {
    name: "UmbraDesktop entrypoint",
    alias: "Umbraco.Community.UmbraDesktop.Entrypoint",
    type: "backofficeEntryPoint",
    js: () => import("./entrypoint"),
  }
];
