/**
 * English (en) strings for the `umbraDesktopServicesMedia` area.
 *
 * What this service says itself: the overwrite question, and everything on the File page, which is
 * this package's element and so words its own pages. What an app says around them (its own button
 * titles, its status bar) is the app's, in its own package's area. Umbraco's own `media_` keys give
 * the reasons a file is refused.
 *
 * The overwrite question's code passes each key to `localize.termOrDefault` with the same English as
 * its fallback; the File page reads its fallback from this file (`shared/words.ts`), so a backoffice
 * where this dictionary failed to load still renders words.
 */
export default {
  umbraDesktopServicesMedia: {
    // Moved from Accessories with Notepad and Paint's save, words unchanged.
    overwriteHeadline: 'Overwrite %0%?',
    overwriteQuestion: '%0% was changed in the media library after you opened it. Overwrite it with your version?',
    overwriteConfirm: 'Overwrite',

    // The File page's list. Issue #136.
    filePage: 'File',
    backToPicture: 'Back to the picture',
    pageOpen: 'Open',
    pageSave: 'Save',
    pageSaveAs: 'Save as',
    pageInfo: 'Info',
    pageClose: 'Close',

    // Open.
    openHeading: 'Open',
    openRecent: 'Recent images in the media library',
    openNoRecent: 'Nothing opened yet. Images you open or save show here.',
    openBrowse: 'Browse the media library...',
    openUpload: 'Upload from this computer...',
    openFailed: '%0% could not be opened.',
    openFailedUnnamed: 'The file could not be opened.',
    discardHeadline: 'Discard your changes?',
    discardQuestion: 'Opening another file throws away the changes you have not saved.',
    discardConfirm: 'Discard',

    // Save.
    saveHeading: 'Save',
    saveLede: 'Writes over %0% in the same format.',
    saveButton: 'Save',
    saveSaving: 'Saving...',
    saveSaved: 'Saved.',
    saveFailed: 'Not saved.',
    saveCancelled: 'Not saved. Nothing was written.',
    saveNeedsSaveAs: '%0% cannot be written back in its own format. Choose one on Save as.',

    // Save as.
    saveAsHeading: 'Save as',
    saveAsReplaceLede: '%0% is replaced. Umbraco keeps no older version of media.',
    saveAsCopyLede: 'A new media item. %0% stays as it is.',
    saveAsReplace: 'Replace %0%',
    saveAsReplaceHint: 'Write over the media item',
    saveAsCopy: 'Save a copy',
    saveAsCopyHint: 'Keep the original as it is',
    saveAsCopyName: '%0% (copy)',
    saveAsName: 'Name',
    saveAsFolder: 'In %0%',
    saveAsRoot: 'the media library',
    saveAsChangeFolder: 'Change...',
    saveAsFormat: 'Format',
    saveAsKeep: 'Keep (%0%)',
    saveAsQuality: 'Quality',
    saveAsNow: 'Now',
    saveAsAfter: 'After',
    saveAsMeasuring: 'Measuring...',
    saveAsAddressWarning:
      "A new format changes the file's address. Pages that pick the image are fine; a link someone pasted to the old file will break.",
    saveAsSaveCopy: 'Save copy',
    saveAsPreview: '%0% × %1% px, as it will be saved',

    // Info.
    infoHeading: 'Info',
    infoName: 'Name',
    infoFolder: 'Folder',
    infoDimensions: 'Dimensions',
    infoDimensionsValue: '%0% × %1% px',
    infoSize: 'Size',
    infoFormat: 'Format',
    infoUpdated: 'Last updated',
    infoNeverSaved: 'Not saved yet',
  },
};
