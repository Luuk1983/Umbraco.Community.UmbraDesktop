# Licensing: design

> UmbraDesktop moves from one MIT licence for everything to a licence per package. The host, the
> service packages, Entertainment and Accessories go to MPL 2.0, and Media goes to the Functional
> Source License. Everyone can still use all of it
> for free, client sites included. What changes is that nobody can take the code, close it and sell it
> as their own, and that Media keeps the option of becoming a paid package.

- **Status:** Built 2026-10-28, not released. Applies from the first release after it is merged
- **Date:** 2026-10-28
- **Branch:** `docs/licensing-split`
- **Target:** every package in the repository, from the first release after the switch

---

## 1. Why change

MIT lets anyone copy the code, change it and sell it under their own name, closed, with nothing
owed but a copyright line. As the project grew that became too generous. The goal is not to stop
use, which should stay as free as it is now, but to stop someone else running with the work.

A trademark would protect the name and is the usual answer. It is not an option here, so the licence
has to carry more of the weight.

Agencies may one day pay for parts of it. There are no plans for that, but the licence chosen now
decides which parts can still be sold later, so it is considered here.

## 2. The model: Umbraco's own

Umbraco HQ runs two separate worlds:

- **The CMS is MIT.** Contributions come in under MIT, and nobody signs anything: its contributing
  guide only asks that you are allowed to share the code, and says an accepted contribution "will be
  MIT licensed from that time onwards". The licence going in is the licence going out.
- **The paid products are closed.** Forms, Workflow, Commerce, Engage and UI Builder declare no
  licence on NuGet, are "Copyright © Umbraco", and are licensed by key per domain. They are written by
  Umbraco's own staff, so Umbraco owns them outright. Partners who see their source sign an agreement
  for that access.

So Umbraco needs no contributor agreement for the open part, and an agreement only where the code is
closed. UmbraDesktop takes the same shape, with one difference: without a trademark, the open part
needs a licence that is a little stricter than MIT.

## 3. Decisions

- **D1. A licence per package, in this one repository.** A licence belongs to code, not to a
  repository. Each package folder carries its own licence file and its own value in its `.csproj`, and
  the root `README.md` says which is which. A separate repository was considered and rejected: an
  add-on is built from the same commit as the host it depends on (the `BoundHostRange` target in
  `src/Directory.Build.targets`), and that would break.
- **D2. The host and the service packages: MPL 2.0.** See §4 for why this one.
- **D3. Entertainment: MPL 2.0.** Same as the host.
- **D4. Media: the Functional Source License, as `FSL-1.1-MIT`.** See §5.
- **D5. Accessories: MPL 2.0, with its main author's agreement.** About 17,900 of its 18,700 lines
  are by suedeapple (Paul). Relicensing his work without him was ruled out, so he was asked first. On
  2026-10-28 he agreed, in a chat with the repository owner: "you can take full ownership and credit
  of my wonky code". Keep that message. It settles the relicensing; §6 covers what it does not.
- **D6. No contributor licence agreement.** Contributions come in under the licence of the package
  they change, as Umbraco does it. One sentence in a new `CONTRIBUTING.md` says so. §4 explains why
  MPL makes an agreement unnecessary.
- **D7. Media takes no outside contributions.** Issues and ideas are welcome, but pull requests that
  change Media's code are not accepted. That keeps Media entirely in one owner's hands, which is what
  lets it be sold later, without asking anyone to sign anything. Chosen over a contributor agreement
  limited to the Media folder: contributions to Media are not important enough to justify the
  machinery.
- **D8. Released versions stay MIT.** A licence change only applies from the next release. Everything
  already on NuGet, including Media's `18.0.0-beta.1`, stays MIT forever.

## 4. Why MPL 2.0 for the open packages

The candidates, judged by three questions: can it still be used freely, can someone close it and sell
it, and can paid add-ons be built on it later.

| Licence | Free use, client sites included | Close it and sell it | Paid add-ons on top, ours or others' |
| --- | --- | --- | --- |
| MIT (now) | Yes | Yes | Yes |
| **MPL 2.0** | Yes | **No**: changes to our files must be handed on with the copy | **Yes**: an add-on can carry any licence |
| GPLv3 | Yes | No | Only GPL add-ons, and ours only with a contributor agreement |
| AGPLv3 | Yes, but many companies ban it outright | No | As GPL |

What MPL 2.0 means in practice:

- Anyone may use it, build and sell sites with it, write closed add-ons for it, and bundle it into a
  product.
- A private fork with changes is allowed, and running it creates no obligation. MPL has no network
  clause.
- Whoever **passes on** a changed copy of our files, to a client or a customer, must hand over those
  files' source under MPL as well. Files of their own beside ours may stay closed.

**Why not GPL.** UmbraDesktop is built to be extended by others, and GPL would force every add-on to
be GPL as well. It would also need a contributor agreement before a paid add-on of our own could be
built on the host, because the host holds other people's GPL code. MPL needs neither.

**Why MPL makes D6 possible.** MPL allows closed add-ons for everyone, us included. A future paid
add-on can therefore be built on an MPL host that contains other people's contributions, without any
right from them beyond MPL itself. An agreement would only be needed to put the host itself under
another or a paid licence, and that is not planned.

## 5. Why the Functional Source License for Media

Media is the package most likely to be worth paying for. Two rules decide its licence:

1. **What is given away for free stays free.** A later version can be stricter, but a released
   version keeps its licence, and anyone can carry on from it.
2. **Loosening is easy, tightening hurts.** Going from strict to open later is welcomed. Going from
   open to paid leaves a free copy of the last open version, and annoyed users.

| Option | Use now | Paid later | Cost |
| --- | --- | --- | --- |
| MPL, with a paid "Pro" add-on later | Free | Only for new features in a separate add-on | Today's Media is free forever, and a fork can carry it on |
| **FSL** | Free for everyone, client sites included. Only a competing product is not | New versions can be paid | Not "open source", so fewer contributors (accepted in D7) |
| Proprietary, free of charge | Free, on our terms | Yes | No community, a separate repository (D1), and less trust on the Marketplace |

**Chosen: FSL.** Its terms allow any purpose except a *competing use*: offering the software, or
something substantially similar, to others in a commercial product or service. It names "professional
services that you provide to a licensee" as permitted, so an agency building a client's site with
Media is covered. Each version becomes available under a permissive licence two years after it is
made available, and the FSL counts pushing a Git commit as making it available, so the clock runs per
commit, not per release. If Media is never sold, switching it to MPL is one step in the easy direction.

**The variant: `FSL-1.1-MIT`.** The FSL comes in two variants, differing only in what a version
becomes after two years: MIT (`FSL-1.1-MIT`) or Apache 2.0 (`FSL-1.1-ALv2`). For a two-year-old
version of an Umbraco package the difference is negligible. MIT is the simpler of the two, and the
licence Umbraco and the rest of its ecosystem use. Apache 2.0's patent grant matters little here.

**Closing it was considered and deferred.** Closing Media now would protect two things FSL does not:
continuing from a two-year-old version, and learning from the source. It would also cost the most of
anything in this document. A public repository cannot hold closed code, so Media would move to a
private one and lose being built from the same commit as the host (D1), and its features have needed
host changes in the same pull request (#136, #144). It would protect less than it seems as well:
Media ships as JavaScript every editor's browser downloads and as a DLL that decompiles, and its code
up to now is public and MIT through `18.0.0-beta.1`. So the order is FSL now, and if selling Media
becomes concrete, its further development moves to a private repository under a commercial licence
then. The FSL versions released by that point cannot be used to compete for two years.

**On NuGet.** NuGet.org only accepts licence *expressions* that the OSI or the FSF approve, and the FSL
is neither. Media therefore packs its licence as a file (`PackageLicenseFile`) rather than an
expression. The packages under MPL and MIT keep using an expression.

## 6. Other people's code

- **Contributions under MIT stay usable.** Besides Accessories, suedeapple contributed three host features
  (window focus, reopening windows, full screen) and Entertainment's Snake, and Robert Foster one PR
  across several packages, all under MIT. MIT allows that code to be included in an MPL package, as
  long as its notice is kept. The MIT text therefore stays in the repository, and the root `README.md`
  says that code contributed before the switch was contributed under MIT.
- **suedeapple's agreement (D5) is permission, not a transfer of copyright.** It is enough for MPL,
  and MIT already allowed that much. Taking over the copyright itself needs a written, signed
  assignment, under Dutch law and under UK law alike. That only matters if his code ever ends up in a
  package that is sold. If it does, ask him for a short signed note first.
- **Robert Foster's six lines in Media** (`Places/MediaPlaceListViewService.cs`, from
  [#165](https://github.com/Luuk1983/Umbraco.Community.UmbraDesktop/pull/165)) are the only outside code
  in Media's package. Like every earlier contribution they came in under MIT, which allows them in an
  FSL package with their notice kept, so the switch did not wait for him. Ask him anyway, and rewrite
  them if he would rather not, before Media is ever sold.
- **`Media.Tests/Guidelines/InMemoryKeyValueService.cs` is a copy of suedeapple's test helper** from
  Accessories. Test projects are not packed, so it never ships, and his agreement covers it under the
  FSL as well. If Media is ever sold, rewrite it or include it in the signed note.
- **The bundled libraries keep their own licences.** Lit (BSD-3-Clause), Fabric.js (MIT), Roboto
  Slab (Apache 2.0) and the Arcade's display font Fraunces (SIL Open Font License, shipped beside it as
  `OFL.txt`) can all be bundled under MPL 2.0 and under the FSL. Their notices stay where they are. Media's build check, which fails on a bundled library that is not
  MIT, Apache 2.0, BSD or ISC, checks the libraries rather than Media's own licence and needs no
  change.

## 7. What changes in the repository

| Where | Change |
| --- | --- |
| `LICENSE` (root) | The MPL 2.0 text, exactly as Mozilla publishes it, so GitHub recognises it and shows MPL for the repository |
| `licenses/MIT.txt` | The MIT text, kept for the releases and the code that came before (§6). Outside the root, so GitHub does not see two licences there |
| `src/Umbraco.Community.UmbraDesktop.Media/` | A licence file with the FSL text, packed with `PackageLicenseFile` |
| `PackageLicenseExpression` in each `.csproj` | `MPL-2.0` for the host, both service packages, Entertainment and Accessories; removed for Media |
| Accessories' `README.md` | A credit line for suedeapple as its original author |
| `README.md` (root) | The **License** section lists the licence per package |
| The `README.md` in each package | Its **License** section, and its licence badge: the badge reads the repository's licence, which is wrong for Media |
| `THIRD-PARTY-NOTICES.md` (Entertainment, Media) | The first line names the package's own licence |
| `CONTRIBUTING.md` (new) | Contributions are licensed under the licence of the package they change (D6); Media takes no pull requests (D7) |

MPL 2.0 asks for a short notice in each source file "if it is possible", and accepts a licence file in
a place a recipient would look instead. Per-file headers are not added: the licence file in each
package folder, and the expression on NuGet, are where a recipient looks.

The Marketplace files keep `"LicenseTypes": ["Free"]`. Despite its name that field is the price model,
and the schema allows only `Free`, `Purchase` and `Subscription`. The licence itself the Marketplace
takes from the NuGet package. Media's file changes the day it gets a price, and none of the files
changes before then.

## 8. Handing Accessories over

Not part of the switch, and less likely now that suedeapple has handed his code over rather than
asking for it. MPL does not stand in the way. If it happens:

- **The code and its history** move to a repository of Paul's, for example with `git filter-repo`
  limited to the Accessories folders, so its history goes with it.
- **The NuGet package** gets Paul as a co-owner on nuget.org, then passes to him. The package ID stays.
- **The Marketplace file** `umbraco-marketplace-umbraco.community.umbradesktop.accessories.json` moves
  to his repository, since the Marketplace looks it up in the package's own repository.
- **The build** references the host as a NuGet package with a version range, instead of the project
  built beside it. `BoundHostRange` no longer applies.
- **What has to change here:** the build action and CI workflow, the solution file, the TestInstance,
  `RELEASE.md`, the root `README.md`, and the developer guide pages that use Accessories as their
  example (desktop apps, package catalogues, package settings), which would move to Entertainment or
  Media. Media's own comments point at Accessories' files as their model, and need their own wording.

## 9. Open questions

- **Robert Foster:** his agreement for his six lines in Media, or a rewrite (§6). Not blocking.
- **When:** which release is the first under the new licences.
