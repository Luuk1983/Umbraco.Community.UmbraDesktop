/**
 * English (en) strings for the `umbraDesktopMedia` area.
 *
 * The Media group's heading, the Image Editor's name, and everything the editor says itself. The
 * File page's words are Services.Media's own. The code reads its fallback from this file
 * (`shared/words.ts`), so a backoffice where this dictionary failed to load still renders words.
 */
export default {
  umbraDesktopMedia: {
    groupMedia: 'Media',
    imageEditor: 'Image Editor',

    // The mode bar.
    file: 'File',
    undo: 'Undo',
    redo: 'Redo',
    save: 'Save',
    modes: 'Modes',
    modeCrop: 'Crop',
    modeAdjust: 'Adjust',
    modeMarkup: 'Markup',
    modeRedact: 'Redact',
    modeResize: 'Resize',

    // The status bar.
    noImage: 'No image open',
    name: 'Name',
    inFolder: 'in %0%',
    root: 'the media library',
    dimensions: '%0% × %1% px',
    dimensionsPending: '%0% × %1% → %2% × %3% px',
    zoomOut: 'Zoom out',
    zoomIn: 'Zoom in',
    zoom: 'Zoom',
    fit: 'Fit',

    // What the editor says about a file.
    refusedSvg: '%0% is an SVG, a vector image. The Image Editor edits photos and other pixel images.',
    refusedOther: '%0% is not an image the Image Editor can open.',
    decodeFailed: '%0% could not be read as an image.',
    animatedGif: 'This GIF is animated. Saving keeps only its first frame.',
    unreachable: 'The media library cannot be reached, so nothing can be opened or saved.',
    saved: 'Saved.',
    notSaved: 'Not saved.',

    // Crop.
    aspectRatio: 'Aspect ratio',
    ratioFree: 'Free',
    ratioOriginal: 'Original',
    portrait: 'Portrait',
    landscape: 'Landscape',
    rotateFlip: 'Rotate and flip',
    rotateLeft: 'Rotate left',
    rotateRight: 'Rotate right',
    flipHorizontal: 'Flip horizontal',
    flipVertical: 'Flip vertical',
    focalPoint: 'Focal point',
    focalNote: 'Saving a crop, rotate or flip resets the focal point and the named crops to the centre. Set them again in the Media section.',
    reset: 'Reset',
    applyCrop: 'Apply crop',

    // Adjust.
    light: 'Light',
    colour: 'Colour',
    exposure: 'Exposure',
    brightness: 'Brightness',
    contrast: 'Contrast',
    saturation: 'Saturation',
    sliderHint: 'Double-click a slider to put it back to 0.',
    compare: 'Compare',
    compareHint: 'Hold to see the original, or split the picture.',
    holdCompare: 'Hold to compare',
    splitView: 'Split view',
    splitLine: 'Split line',

    // Markup.
    tool: 'Tool',
    toolSelect: 'Select',
    toolText: 'Text',
    toolArrow: 'Arrow',
    toolBox: 'Box',
    toolPen: 'Pen',
    line: 'Line',
    lineWidth: 'Width',
    pixelsValue: '%0% px',
    colourRed: 'Red',
    colourYellow: 'Yellow',
    colourGreen: 'Green',
    colourBlue: 'Blue',
    colourNavy: 'Navy',
    colourWhite: 'White',
    selectedMark: 'Selected mark',
    delete: 'Delete',
    bringToFront: 'Bring to front',
    textDefault: 'Text',
    markupHint: 'Marks stay movable until you save. In the saved file they are part of the picture.',

    // Redact.
    style: 'Style',
    pixelate: 'Pixelate',
    blur: 'Blur',
    strength: 'Strength',
    selectedRegion: 'Selected region',
    redactHint: 'Drag over what should not be seen. Redaction is burned into the saved file; the original pixels are gone from it.',

    // Resize.
    size: 'Size',
    width: 'Width',
    height: 'Height',
    keepProportions: 'Keep proportions',
    pixels: 'Pixels',
    percent: 'Percent',
    commonWidths: 'Common widths',
    half: 'Half',
    resizeHint: "Resize changes the picture's pixels. Zoom only changes how close you look.",
    applySize: 'Apply size',
  },
};
