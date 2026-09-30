---
id: external-connections
title: External connections
description: Read other, unrelated Umbraco instances from this desktop. Experimental.
---

# External connections

**Experimental.** It works, and it only ever reads. But how connections are stored and what they can
reach is still likely to change, so expect to redo some of the setup in a later version, and expect
the two apps below to change. Desktop settings labels it the same way, on purpose.

This is for looking after several unrelated Umbraco sites: an agency with a handful of clients, or
anyone who signs in to more than one backoffice in a day. "Which version is that client on, and is it
up" stops meaning signing in to eight backoffices. It needs nothing installed on the other instances.

It is not for the test, acceptance and production environments of one solution. Those share content
and keys, and comparing or moving things between them is what uSync and Deploy already do well.
Unrelated instances share nothing, so there is nothing to compare, and the value is simply seeing them
all in one place.

- [Setting up connections](setting-up-connections.md): how a connection works, creating the API user
  on the other instance, adding it in Desktop settings, and where the credentials live.
- [Connection status](connection-status.md): an app listing this instance and every connected one,
  with what each reports about itself, and what each status means.
- [Remote content](remote-content.md): an app that shows another instance's content and media,
  read-only, with Umbraco's own editors.

Nothing appears until a connection has been added. Then both apps show in the launcher's
Experimental group.
