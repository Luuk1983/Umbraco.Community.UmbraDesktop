---
id: connection-status
title: Connection status
description: See this instance and every connected one, and what each connection status means.
sidebar_position: 2
---

# Connection status

**Experimental.** See [External connections](README.md).

**Connection status** lists this instance and every connected one, with what each reports about
itself: its Umbraco version, its runtime mode and its state. It is in the launcher's Experimental
group once a connection exists. For the API user it reads with, the user group needs no sections at
all. See [Setting up connections](setting-up-connections.md).

- To refresh the list, select **Refresh**.
- To change the connections, select **Manage connections**.
- To open an instance's own backoffice, select its name. It opens in a new browser tab, where its own
  login applies.

## What the statuses mean

Each instance shows one of five statuses. They are kept separate on purpose, because each one is
fixed by a different person doing a different thing.

| Status | What happened | What to do |
| --- | --- | --- |
| **Connected** | Everything worked. | Nothing. |
| **Cannot be reached** | Nothing answered at that address. | Check the address, and whether the site is up. |
| **Credentials refused** | The site answered and rejected the client ID or secret. | Check both. A secret pasted with a trailing space looks exactly like this. |
| **Not permitted** | The credentials were accepted, and that API user is not allowed to read this. | Someone with access to that instance needs to put its API user in a group that has the section. |
| **No secret set** | The connection exists but has no secret stored yet. | Edit it and add one. |

The difference between the first two failures is worth knowing. A site that is down and credentials
that are wrong look identical from a browser. Telling them apart is why the status check asks an
endpoint that needs no credentials before it asks one that does. The same endpoint is why an instance
stuck part-way through an upgrade reports that it is upgrading rather than reading as dead.
