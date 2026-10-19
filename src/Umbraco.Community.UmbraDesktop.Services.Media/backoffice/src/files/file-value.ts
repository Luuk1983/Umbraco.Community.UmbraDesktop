/**
 * The `umbracoFile` value an overwrite saves: the item's current value pointed at a new file.
 *
 * Everything else the value holds is kept, which for an image means its focal point and its named
 * crops, unless the save says the picture was reframed. A crop, a rotate or a flip moves what every
 * fraction in those points at, so a kept focal point would mark the wrong face and a kept crop would
 * cut the wrong part; they are reset instead, the focal point to none and each crop's coordinates
 * to none, so Umbraco falls back to its centre and its own default crop. The crops themselves (alias,
 * width, height) are kept: they belong to the data type, not to this picture. Design D8, issue #136.
 *
 * The server's file-upload and image-cropper editors both take `temporaryFileId` to mean "replace
 * the file with this one", which is what the dropzone's own scaffold relies on too.
 * @param current The item's `umbracoFile` value now, whatever shape it has; anything that is not an
 *   object is treated as empty.
 * @param temporaryFileId The uploaded file that replaces the item's file.
 * @param resetFocalPoint Whether the picture was cropped, rotated or flipped since it was last saved.
 * @returns A new value; `current` is never changed.
 */
export function fileValueFor(
  current: unknown,
  temporaryFileId: string,
  resetFocalPoint: boolean,
): Record<string, unknown> {
  const base = current && typeof current === 'object' ? (current as Record<string, unknown>) : {};
  if (!resetFocalPoint) return { ...base, temporaryFileId };
  const crops = Array.isArray(base.crops) ? base.crops : [];
  return {
    ...base,
    temporaryFileId,
    focalPoint: null,
    crops: crops.map((crop) => (crop && typeof crop === 'object' ? { ...crop, coordinates: null } : crop)),
  };
}
