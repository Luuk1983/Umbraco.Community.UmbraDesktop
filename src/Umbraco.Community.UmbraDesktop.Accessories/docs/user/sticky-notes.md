---
id: sticky-notes
title: Sticky Notes
description: Keep notes of your own, and leave notes for everyone else who uses the desktop.
sidebar_position: 5
---

# Sticky Notes

Sticky Notes has two kinds of note on one board:

- **Your own notes** are yellow and sit under **My notes**. Only you can see them.
- **Shared notes** are blue and sit under **Shared with everyone**. Everyone who uses the desktop can
  see and edit them, which makes them notes to each other.

## Write a note

- To write a note only you can see, select **New note**.
- To write a note for everyone, select **New shared note**.

A note saves itself shortly after you stop typing. Each note says when it was last written, and a
shared note also says who wrote it. Each kind has room for 100 notes of up to 2,000 characters.

To reorder a note, drag it by its handle, or focus the handle and use the arrow keys. A note moves
within its own group. To delete a note, select **Delete note**, the × in its corner. Deleting asks first.

## Where notes are kept

- Your own notes are stored on your Umbraco account, like your desktop settings, so they follow you
  to any browser you sign in on, and nobody else can read them.
- Shared notes are stored in the Umbraco database, so they belong to the site. Everyone with access
  to the Desktop section sees the same board, and nobody else can read it, even through the API.

A shared note someone else writes appears within about fifteen seconds, or as soon as you select the
window. The board stops checking while nobody can see it: in a hidden browser tab, or while the
window is minimised.

## When two people edit the same shared note

Nobody's words are thrown away. The first save wins. The second person's window keeps their text,
says who changed the note meanwhile, and offers **Use theirs** or **Keep mine**. A note that someone
deletes while you are writing in it is offered back the same way, with **Put it back** or
**Discard**. Until either is settled, the window shows the unsaved dot, so closing it asks first.
