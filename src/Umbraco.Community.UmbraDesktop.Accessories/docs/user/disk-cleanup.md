---
id: disk-cleanup
title: Disk Cleanup
description: Empty the content and media recycle bins for good, after checking and asking.
sidebar_position: 10
---

# Disk Cleanup

Disk Cleanup frees space on the server by emptying the recycle bins: **Content recycle bin** and
**Media recycle bin**, each with how many items it holds. Emptying a bin deletes its items for good,
for everyone, with everything under them, and for media their files too. Nothing can be restored
afterwards.

To empty a recycle bin:

1. Tick the bins to empty. Nothing is ticked when the window opens.
2. Select **Clean up…**. Disk Cleanup counts the ticked bins again, in case somebody deleted something
   since the window opened, and asks in the backoffice's red confirmation dialog, naming each bin and
   how many items it holds.
3. Select **Delete permanently**. The bins are emptied.

Disk Cleanup uses Umbraco's own Empty Recycle Bin, so Umbraco decides who may, exactly as in the
Content and Media sections. A bin you cannot reach shows **No access** and cannot be ticked. If
Umbraco refuses to empty a bin you can see, as it does for a Writer who may not delete, the window
says so and leaves the bin alone.

To count the bins again without emptying anything, select **Refresh**.
