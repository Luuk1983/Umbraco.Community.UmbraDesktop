import { UMBRADESKTOP_SETTINGS_MODAL_ALIAS, UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS } from './modal-tokens';

/** Modal registrations for the desktop settings feature. */
export const manifests: Array<UmbExtensionManifest> = [
  {
    type: 'modal',
    alias: UMBRADESKTOP_SETTINGS_MODAL_ALIAS,
    name: 'UmbraDesktop Settings Modal',
    element: () => import('./components/settings-modal.element.js'),
  },
  {
    type: 'modal',
    alias: UMBRADESKTOP_WALLPAPER_PICKER_MODAL_ALIAS,
    name: 'UmbraDesktop Wallpaper Picker Modal',
    element: () => import('./components/wallpaper-picker-modal.element.js'),
  },
];
