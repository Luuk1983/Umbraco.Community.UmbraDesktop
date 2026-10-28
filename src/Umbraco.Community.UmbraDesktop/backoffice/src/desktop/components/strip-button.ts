import { unsafeCSS } from '@umbraco-cms/backoffice/external/lit';

/**
 * The size of the box an Umbraco icon draws in, in em of its font size. `uui-icon` sizes itself at
 * 1.125em, so a 16px icon is an 18px box.
 *
 * Stated here rather than read off the rendered icon, because the strips' buttons set it on the icon
 * themselves: the padding around an icon is worked out from this box in CSS, and an icon that has
 * not drawn yet, or a test page that never registers `umb-icon`, would otherwise be a 0px box and
 * throw the sum off.
 */
export const UMBRADESKTOP_ICON_BOX_EM = 1.125;

/**
 * The box a strip icon draws in: the strip icon size, at the icon's own 1.125em. Set as the width
 * and height of every icon on a strip button, so the button's padding can be worked out from it.
 */
export const UMBRADESKTOP_STRIP_ICON_BOX = unsafeCSS(
  `calc(var(--umbradesktop-strip-icon-size, 16px) * ${UMBRADESKTOP_ICON_BOX_EM})`,
);

/**
 * The padding a strip button leaves either side of what it shows: the space its icon leaves above
 * and below it, so a button pads its content the same on all four sides. An icon-only button comes
 * out square, and a labelled one leaves that same space after its label.
 *
 * Read off the strip's own inner height, through a size container, rather than off a token, because
 * the inner height is the strip's height less whatever border or bevel the theme draws inside it, and
 * neither is a number this CSS can see. Every strip a button sits in declares `container-type: size`,
 * which is what `100cqh` is measured against. A fixed 32px width came first, and in Windows 98's
 * 22px strip it drew a 32 by 22 button that its bevel outlined.
 */
export const UMBRADESKTOP_STRIP_BUTTON_PADDING = unsafeCSS(`calc((100cqh - ${UMBRADESKTOP_STRIP_ICON_BOX}) / 2)`);
