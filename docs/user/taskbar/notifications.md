---
id: notifications
title: Notifications
description: Notifications from every window, shown once on the desktop, and the list behind the clock.
sidebar_position: 2
---

# Notifications

Umbraco raises a notification in the backoffice it happened in, and every window on the desktop is a
backoffice of its own. Left alone, five open windows would show a package's license warning five
times, each inside its own window. So the desktop takes them over: a notification raised in any
window shows once, on the desktop, and not inside the window.

![The desktop with a content and a media window open and the notification list open from the taskbar clock: a document published, a scheduled publishing warning raised twice, and a media save, each with the window it came from and the time. A dot by the clock says a warning is in the list.](../../screenshots/notifications.png)

## How they behave

- **Once.** The same message from several windows is one notification with a count on it.
- **For as long as its sender asked.** A notification goes away after the time its sender chose, and
  one the sender asked to keep stays until it is closed. To hold one while reading it, point at it.
- **Select it to go there.** Selecting a notification brings forward the window that raised it, and
  restores that window if it was minimised. An error with buttons of its own, such as **Full Error
  Message**, is shown again inside its window, where those buttons work.

## The list behind the clock

To see recent notifications, select the clock on the taskbar. The list holds the last twenty, newest
first, each with the window that raised it, how many times and when it last did. A repeat updates its
line rather than taking a new one, so one noisy message cannot push the others out.

A dot by the clock means a warning or an error is in the list, red when one is an error. It is not
an unread count, so looking does not clear it. It goes when the last warning or error drops off the
end of the list.

To empty the list, select **Clear**.

The list belongs to the tab. It survives reloading the desktop and is gone when the tab closes, and
two tabs are two desktops with a list each. After a reload, lines that pointed at a window stay
readable but can no longer be selected, because that window is not the same one any more.

## Under each theme

Every theme draws notifications its own way. Under macOS they arrive at the top right, as they do on
a Mac. The other themes put them above the clock.
