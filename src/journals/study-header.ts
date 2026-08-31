// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `journal-header` widget (spelled `study-header` in notes written before
// 2.28, still accepted): the strip at the top of a journal note's banner,
// welded to whichever tracker cells follow it in the same ```chronoanvil fence —
// the journal equivalent of entryheader.ts's diary strip, and welded the same
// way (see .ca-journal-study-banner in styles.css).
//
// Type-agnostic since 2.28. It was written for Study and hard-coded Study's
// shape: the journals root as the base of every path, `subject`/`topic` as the
// ancestor properties, `lesson`/`practice` as the note kinds that count as
// activity. Every one of those is now read off the JournalType the note
// resolves to, which is what lets a custom journal have a banner at all — and
// therefore what lets the journal trackers introduced in 2.27 be seen anywhere
// but Study.
//
// Row 1: the trail — Home, then this note's Subject and Topic as breadcrumb
//        pills — and the note's date, right-aligned. The trail is the note's
//        *whole* navigation: Lesson and Practice notes used to carry a
//        separate `links:home,up` card above the banner, but `up` resolves to
//        the parent folder note, which for a leaf note under a topic *is* the
//        topic — so the card's two destinations were Home and a duplicate of
//        the last crumb. One trail replaces both.
// Row 2: the note's title, click-to-edit, exactly as entryheader.ts's does.
//        Lesson and Practice templates no longer carry a `# {{title}}`
//        heading; the banner owns the title the same way a diary entry's
//        header does (see template-daily.md, which has carried no H1 since
//        entry-header took it).
//
// Subject and Topic are read from frontmatter rather than from where the note
// sits on disk, so a note dragged out of its folder still points at the right
// dashboards.
//
//   ```chronoanvil
//   study-header
//   ```

import {
  App,
  MarkdownPostProcessorContext,
  Menu,
  MenuItem,
  setIcon,
  TFile,
} from "obsidian";
import { settingsButton } from "../ui/section-frame";
import { openJournalTemplateWindow } from "../ui/journal-template-modal";
import { attachNoteRename } from "../ui/header-title";
import type ChronoAnvilPlugin from "../main";
import { folderNotePath, frontmatterOf, getFile, isoDate, moment, noExt, openFile } from "../core/util";
import { pagesUnder, relativeActivity } from "../core/query";
import { journalAncestors, journalTypeOfNote } from "./journal";

// The characters Obsidian refuses in a file name. Checked up front so a bad
// rename reports what is wrong instead of surfacing a raw vault exception.

export interface Crumb {
  label: string;
  file: TFile | null;
  // Lucide id for a crumb that draws as an icon rather than as text.
  //
  // NOTHING SETS THIS SINCE 4.1 §2.5, and the field is kept rather than removed
  // because the rendering path is still correct and still the right answer for
  // a crumb that is the same destination on every note in the vault. The root
  // crumb WAS that — a `home` glyph standing for `Homepage.md` — and is not any
  // more: it names the journals root, which is this note's actual ancestor, and
  // an ancestor has to say which one it is.
  icon?: string;
}

// The label on the trail's root crumb.
//
// NAMED, because §2.5 turns on it. `"Home"` appeared in exactly two places in
// the tree — here and `core/links.ts` — and moving this crumb's destination
// without moving its word would have given one name two destinations, which is
// the pattern `RETIRED_WORDS` exists to delete one layer up.
export const ROOT_CRUMB_LABEL = "Journals";

// Which note the trail's root crumb points at, or null for no root crumb.
//
// PURE, AND SEPARATED FROM THE DRAWING for `tagSourcesOf`'s reason: the
// interesting half is a string rule over paths, and a rule that can be asserted
// is worth more than one that can be eyeballed on a banner.
//
// THE RULE, which is `journalCrumbs`' own rule reaching one crumb further than
// it used to. "A trail names a note's ancestors, never the note itself", and a
// folder note IS its folder — so the trail already drops its own name at the
// leaf end. `03 - Journals/03 - Journals.md` is the folder note of the root
// every journal note lives under, which is what makes it a legitimate root
// crumb at all; and when it is itself the open note it is the page you are on,
// so it goes by the same rule rather than becoming a step to nowhere.
export function rootCrumbPath(
  journalsRoot: string,
  notePath: string
): string | null {
  const home = folderNotePath(journalsRoot);
  return notePath === home ? null : home;
}

// Which note the trail's JOURNAL crumb points at, or null for no journal crumb.
//
// THE SAME RULE, ONE LEVEL IN (4.36 §4). `03 - Journals/Study/Study.md` is the
// folder note of the folder every Study note lives under, so by this function's
// sibling's own argument it IS an ancestor — and when it is the open note it is
// the page you are on, so it goes by the rule rather than becoming a step to
// nowhere.
//
// IT HAS BEEN MISSING FROM EVERY TRAIL IN THE PLUGIN, and the reason was the
// absent file rather than the rule. `journalAncestors` slices the path BELOW the
// root (`journal.ts`), so a Study lesson's trail has always read
// `Journals › Maths › Algebra` — the journals root, then a Subject, with the
// journal itself skipped. Until 4.36 there was nothing at that path to link to.
//
// A SEPARATE FUNCTION RATHER THAN A WIDER `journalAncestors`, because that one
// answers "which CONTAINER folders is this note inside" — a question the folder
// rollups, `metaFor` and the level index all ask — and a journal is not a
// container. Widening it would change four readers to give one a crumb.
export function journalCrumbPath(
  journalRoot: string,
  notePath: string
): string | null {
  const home = folderNotePath(journalRoot);
  return notePath === home ? null : home;
}

// The crumb trail: Home, then this note's ancestor containers within its
// journal type.
//
// Derived from the note's *path* rather than from `subject`/`topic`
// frontmatter, and that is the change that makes this banner work for any
// journal type. Those two property names are Study's; a journal whose level is
// called Section has neither, and a three-level journal would need a third
// name nobody has defined. A path already encodes the hierarchy, in the right
// order, for every type — and the folder-note convention (`Topic/Topic.md`)
// means each ancestor folder names its own dashboard, so a crumb resolves the
// same way `resolveUp` does in links.ts.
//
// The frontmatter is kept as a *fallback* for a note that sits outside every
// registered root — dragged out, or written before its journal existed. That
// preserves the property the old implementation was built for (a note moved
// out of its folder still points at the right dashboards) without making it
// the primary rule for types that can't satisfy it.
//
// A trail names a note's ancestors, never the note itself. A folder note *is*
// its folder, so its own name is dropped: the title two lines down already
// says it, and a trail ending in the name of the page you are on is a step to
// nowhere.
export function journalCrumbs(
  app: App,
  plugin: ChronoAnvilPlugin,
  file: TFile,
  isIndex: boolean
): Crumb[] {
  const paths = plugin.settings.paths;
  const out: Crumb[] = [];

  // THE ROOT CRUMB IS THE JOURNALS DASHBOARD, NOT THE HOMEPAGE (4.1 §2.5), and
  // the reason is this function's own rule rather than a preference.
  //
  // "A trail names a note's ancestors, never the note itself" — and until 4.1
  // this trail was seeded with `Homepage.md`, which is an ancestor of nothing.
  // It was a shortcut bolted onto a breadcrumb. `03 - Journals/03 - Journals.md`
  // is the folder note of the root every journal note lives under, so it IS the
  // ancestor the rule asks for, and the pill becomes the breadcrumb.
  //
  // THE LABEL CHANGES WITH THE DESTINATION, and it has to. "Home" appeared in
  // exactly two places in the tree — here and `core/links.ts` — and leaving the
  // word on a crumb that goes somewhere else would give one name two
  // destinations, which is the pattern `RETIRED_WORDS` exists to delete. It
  // reads `Journals`, and it drops `icon: "home"` with the word: the glyph was
  // shorthand for "the same destination on every note in the vault", which this
  // is not.
  //
  // `core/links.ts` is untouched. The links row's `Home` still means the
  // homepage, and that is still true.
  //
  // AND THE `isIndex` RULE NOW REACHES THE ROOT — see `rootCrumbPath`, which
  // is where that rule is written and asserted. The seed is conditional where
  // it used to be unconditional, which is a real change to this function rather
  // than a new argument to it.
  const rootPath = rootCrumbPath(paths.journalsRoot, file.path);
  if (rootPath) {
    out.push({ label: ROOT_CRUMB_LABEL, file: getFile(app, rootPath) });
  }

  const type = journalTypeOfNote(plugin, file.path);
  if (type) {
    // THE JOURNAL ITSELF, BETWEEN THE ROOT AND THE CONTAINERS (4.36 §4). See
    // `journalCrumbPath` for why this has been absent and why it belongs.
    //
    // A CRUMB WITH NO FILE IS NOT DRAWN, which is the condition that makes this
    // safe on a vault that predates 4.36: the page is written by repair, by the
    // wizard and by adoption, and until one of those has run there is nothing to
    // point at. `Crumb.file` is already nullable and the renderer already draws
    // an unlinked crumb — but an unlinked crumb naming a page that does not
    // exist is a step to nowhere, which is the thing this trail's own rule is
    // about. So the crumb is withheld rather than drawn dead.
    const journalPath = journalCrumbPath(type.root, file.path);
    const journalFile = journalPath ? getFile(app, journalPath) : null;
    if (journalFile) out.push({ label: type.name, file: journalFile });

    const ancestors = journalAncestors(type, file.path);
    // A folder note's last ancestor is itself.
    const trail = isIndex ? ancestors.slice(0, -1) : ancestors;
    for (const a of trail) {
      out.push({
        label: a.name,
        file: getFile(app, `${a.folder}/${a.name}.md`),
      });
    }
    return out;
  }

  // OUTSIDE EVERY ROOT, THERE ARE NO ANCESTORS (3.21). This built a breadcrumb
  // from `subject`/`topic` frontmatter under Study's configured root — "Study's
  // historical property names" — which is the last of the fallbacks 3.19.1
  // removed from the widget layer, and wrong for the same reason: it linked a
  // stray note to folders inside a journal that has nothing to do with it, and
  // on a vault where Study has been removed, to folders that do not exist.
  //
  // A note in no journal has no trail above it, and saying so is the honest
  // answer rather than a plausible-looking one.
  return out;
}

// The right-hand slot of the trail row. A leaf note states its own date; an
// index note has none, so it states when anything under it last happened —
// the same relative phrasing (and the same source) as the Activity column of
// the subject page's topics table.
export function metaFor(
  app: App,
  file: TFile,
  isIndex: boolean,
  kindIds: string[]
): string {
  const fm = frontmatterOf(app, file);
  const dateIso = isoDate(fm["date"]);
  if (dateIso) return moment(dateIso).format("D MMM YYYY");
  if (!isIndex || !file.parent) return "";

  // Which `type` values count as activity comes from the journal type's own
  // kinds rather than the literals "lesson" and "practice", so a Cooking
  // journal's Recipes register as activity on its Section index.
  const counts = new Set(kindIds);
  let last: string | null = null;
  for (const p of pagesUnder(app, file.parent.path)) {
    const t = p.fm["type"];
    if (typeof t !== "string" || !counts.has(t)) continue;
    const d = isoDate(p.fm["date"]);
    if (d && (!last || d > last)) last = d;
  }
  // Deliberately not "No lessons yet": pluralising an arbitrary kind label
  // ("Practice" → "Practices"?) produces worse English than saying nothing
  // specific, and the empty state only has to read as empty.
  if (!last) return "Nothing logged yet";
  return `Active ${relativeActivity(last).toLowerCase()}`;
}

// One crumb: a real pill when its destination exists, muted flat text
// otherwise (mirrors links.ts::renderTarget's "destination doesn't exist yet"
// treatment) — never a dead link.
export function renderCrumb(
  parent: HTMLElement,
  app: App,
  crumb: Crumb,
  sourcePath: string
): void {
  const iconOnly = !!crumb.icon;
  if (!crumb.file) {
    const muted = parent.createSpan({
      cls: "ca-jn-flat ca-jn-muted" + (iconOnly ? " ca-jsh-crumb-icon" : ""),
      attr: { "aria-label": crumb.label, title: crumb.label },
    });
    if (crumb.icon) setIcon(muted, crumb.icon);
    else muted.setText(crumb.label);
    return;
  }
  const file = crumb.file;
  const href = noExt(file.path);
  const a = parent.createEl("a", {
    cls: "internal-link ca-jn-pill" + (iconOnly ? " ca-jsh-crumb-icon" : ""),
    href,
    attr: { "data-href": href, "aria-label": crumb.label, title: crumb.label },
  });
  if (crumb.icon) setIcon(a, crumb.icon);
  else a.setText(crumb.label);
  a.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(app, file);
  });
  a.addEventListener("mouseover", (evt) => {
    app.workspace.trigger("hover-link", {
      event: evt,
      source: "ca-study-header",
      hoverParent: parent,
      targetEl: a,
      linktext: href,
      sourcePath,
    });
  });
}

// The banner's overflow menu.
//
// WHY IT EXISTS
//
// The best things in the plugin were reachable only from the command palette.
// The section editor, the change preview, the tracker add/remove, converting a
// note into a dashboard — roughly eight features with no other affordance, so a
// reader who has never opened the palette had none of them. Meanwhile they were
// looking at a template with nothing to say it was structurally editable, and at
// a note with nothing to say it could hold pages.
//
// The banner is where they already are. It renders on every journal note, every
// index and every template; it already has a row of chrome; and since 2.54 it
// can resolve its own surface for free.
//
// BUILT FROM THE CONTEXT, NEVER A FIXED LIST. A kind with no pages must not be
// offered "convert to dashboard", and a note the plugin does not recognise gets
// no control at all rather than a menu that opens and then explains it cannot
// help. resolveSectionHost already returns null for that case, so the check is
// one line and the answer is the same one "Add a section" gives.
//
// BUILT ON CLICK, NOT ON RENDER. This banner is on every journal note in the
// vault, so anything slow or throwing here is visible everywhere at once.
// Populating the Menu inside the handler also means it reflects the note as it
// is when opened rather than as it was when drawn.
//
// THE COMMANDS STAY REGISTERED. This is a second door, not a replacement: the
// palette is how hotkeys are bound and how anyone who already knows the plugin
// works.
function attachBannerMenu(
  plugin: ChronoAnvilPlugin,
  host: HTMLElement,
  notePath: string,
  isIndex: boolean
): void {
  const build = journalBannerMenu(plugin, notePath, isIndex);
  if (build) settingsButton(host, "ca-jsh-more", build);
}

// What the banner's cog offers on a JOURNAL note, as a builder rather than as a
// button. 4.51.
//
// SPLIT OUT SO THE VAULT BANNER OFFERS THE SAME MENU. That banner draws the cog
// itself, in its own corner, on its own surface — but what the cog DOES must not
// fork: a reader who learns "Template…" on a note before turning the banner on
// has to find it in the same place after. `attachBannerMenu` above is now three
// lines and this is all of the behaviour, so there is one list.
//
// NULL WHERE THERE IS NOTHING TO OFFER, which is `sectionsMenuFor`'s rule and
// `discoverability.test.ts`'s: *a menu that opens and then explains it cannot
// help is worse than no menu.*
export function journalBannerMenu(
  plugin: ChronoAnvilPlugin,
  notePath: string,
  isIndex: boolean
): ((menu: Menu) => void) | null {
  const ctx = plugin.sections.contextFor(notePath);
  if (!ctx) return null;

  const isTemplate = plugin.sections.isTemplate(notePath);
  return (menu: Menu) => {
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Edit sections…")
        .setIcon("layout-list")
        .onClick(() => void plugin.sections.editSectionsHere(notePath))
    );

    if (isTemplate) {
      // A template can be measured against what the catalogue would write. A
      // note cannot — there is nothing for it to have drifted from.
      menu.addItem((i: MenuItem) =>
        i
          .setTitle("Preview template changes")
          .setIcon("eye")
          .onClick(() => void plugin.scaffold.previewJournalTemplates())
      );
      return;
    }

    // BESIDE "Edit sections…", NOT INSTEAD OF IT (4.33). Both act on the page's
    // structure and they are different gestures: that one changes THIS note and
    // destroys nothing; this one is about what every note of this type is built
    // from, and carries the only control in the plugin that can rewrite a note's
    // whole body. The ellipsis is every window-opening item's convention on this
    // menu.
    //
    // NOT ON A MANAGED TEMPLATE — the `isTemplate` branch above has already
    // returned. "Save this template as the default" is a tautology, and the file
    // is regenerated anyway.
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Template…")
        .setIcon("layout-template")
        .onClick(() =>
          openJournalTemplateWindow(plugin.app, plugin, notePath, ctx)
        )
    );

    menu.addSeparator();
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Add a tracker…")
        .setIcon("plus-circle")
        .onClick(() => void plugin.entryTrackers.addTracker(notePath))
    );
    menu.addItem((i: MenuItem) =>
      i
        .setTitle("Remove a tracker…")
        .setIcon("minus-circle")
        .onClick(() => void plugin.entryTrackers.removeTracker(notePath))
    );

    // Only where it can happen: a kind that declares pages, on a note that is
    // not already a dashboard. Offering it on an index would be offering to
    // promote something already promoted, and offering it on a kind without
    // pages would be a menu item whose only outcome is an error notice.
    if (!isIndex && ctx.noteKind !== "page" && ctx.hasPages) {
      menu.addSeparator();
      menu.addItem((i: MenuItem) =>
        i
          .setTitle("Convert to a dashboard")
          .setIcon("layout-dashboard")
          .onClick(() => void plugin.journals.convertHere())
      );
    }

  };
}

export function buildStudyHeader(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const wrap = createDiv({ cls: "ca-journal-study-header" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return wrap;

  // A folder note — `Topic/Topic.md` — is a dashboard for everything beneath
  // it; anything else is a leaf note sitting inside one. Same self-test
  // links.ts::resolveUp uses, so "which kind of study note is this" is
  // answered one way across the plugin.
  const isIndex = !!file.parent && file.basename === file.parent.name;

  // ── Band 1: the note's name, and the cog (4.21.1) ────────────────────
  //
  // EXTRACTED IN 4.5 and called rather than kept here. Every line of what this
  // used to hold — the pencil, the input, the commit guard, the collision
  // checks, the folder-note pair rename — now lives in `attachNoteRename`,
  // because the page title card wanted the same control and a second copy of a
  // rename is how two callers start disagreeing about which characters a name
  // may have. The classes are unchanged: `jsh-title` names the same four.
  //
  // AND IT IS FIRST NOW, WHERE THE TRAIL WAS. Three surfaces drew a banner and
  // two of them opened with navigation; the page banner opened with the name.
  // 4.21.1 settled it the page banner's way on all of them — the name is what a
  // reader looks for on a note they opened deliberately, and the trail is a
  // second fact about it. `journal-banner-name` is the class that says so, and
  // it is the same one `buildEntryHeader` puts on its band.
  const titleRow = wrap.createDiv({ cls: "ca-jsh-titlerow ca-journal-banner-name" });
  // A WRAPPER OF ITS OWN, WHICH IS LOAD-BEARING AND NOT TIDINESS.
  // `attachNoteRename` calls `row.empty()` to swap the name for an input and
  // `row.empty()` again to swap it back, so anything else parented in that row
  // is destroyed by the first rename and never comes back. The cog is now in
  // this band; it goes beside the wrapper rather than inside it. `page-title.ts`
  // and `buildEntryHeader` both take the same precaution, which is why neither
  // has ever lost its control to a rename.
  const titleWrap = titleRow.createDiv({
    cls: "ca-jsh-title-wrap ca-journal-banner-title",
  });
  attachNoteRename(app, titleWrap, file, "ca-jsh-title");

  // THE COG SITS BESIDE THE NAME, and this reverses a decision rather than
  // drifting from one. It was in the crumb row on the argument that the title is
  // click-to-edit, so "a control next to it would be a control one slip away
  // from renaming the note". The page banner has had a cog beside a
  // click-to-edit title since 4.5 and an entry's since 4.21, both without the
  // slip the argument predicted — the two are a hand's width apart at the
  // band's opposite ends, and the rename needs a click ON the name. Three
  // banners placing one control three ways was the larger cost.
  attachBannerMenu(plugin, titleRow, ctx.sourcePath, isIndex);

  // ── Band 2: the trail + this note's date or activity ─────────────────
  const nav = wrap.createDiv({ cls: "ca-jsh-nav ca-journal-banner-nav" });
  const crumbs = nav.createDiv({ cls: "ca-jsh-crumbs" });
  const type = journalTypeOfNote(plugin, ctx.sourcePath);
  const trail = journalCrumbs(app, plugin, file, isIndex);
  trail.forEach((crumb, i) => {
    if (i > 0) crumbs.createSpan({ cls: "ca-jsh-sep", text: "\u203a" });
    renderCrumb(crumbs, app, crumb, ctx.sourcePath);
  });

  const meta = metaFor(
    app,
    file,
    isIndex,
    // Outside a registered root there is no kind list to read, so there is
    // nothing this banner can count as activity (3.19.1). It fell back to
    // Study's kinds — "the only shape a stray note of this sort can plausibly
    // have" — which was true when Study was the only journal and became a claim
    // about somebody else's vault once it was not. `metaFor` reads this as the
    // set of `type:` values that count, so an empty list means the date line is
    // simply absent rather than reporting the last Study-shaped note under a
    // folder that has nothing to do with Study.
    (type?.kinds ?? []).map((k) => k.id)
  );
  // The date keeps its trailing group even now that the cog has left it. The
  // group exists because `.jsh-nav` is `justify-content: space-between`, and a
  // row of three children would push the middle one to the CENTRE of the band —
  // correct per the flexbox rule and wrong on the screen. It is still two
  // children today (the trail and this), and the group is what keeps that true
  // if anything else ever joins the end of the row.
  //
  // AND IT IS NOT DRAWN EMPTY. With the cog gone there is nothing else in it, so
  // a note with no date to report would otherwise contribute a zero-width flex
  // child to a `space-between` row — invisible, and one more thing for the trail
  // to be spaced against.
  if (meta) {
    const navEnd = nav.createDiv({ cls: "ca-jsh-nav-end" });
    navEnd.createDiv({ cls: "ca-jsh-date", text: meta });
  }

  return wrap;
}

// ── THE JOURNAL NOTE'S PAGE-CONTEXT STRIP (4.21) ─────────────────────
//
// The counterpart of `buildEntryContext`, and the same argument one surface
// over: 4.20 settled that a banner is the file's name, its navigation and the
// cog, so everything ELSE a page knows about itself moved onto the tracker
// section — the block that holds what this page type is.
//
// WHAT AN ENTRY PUTS THERE is its alias and the navigator between days. What a
// JOURNAL NOTE puts there is the pair that says where it sits in its journal:
// its LEVEL — Subject, Topic, Lesson — and, on a leaf, its KIND.
//
// WHY THOSE TWO. A journal's crumb trail says which subject and topic a note is
// under; it does not say what the note IS. Two notes with identical trails can
// be a Lesson and a Practice, and until now the only place that was written was
// a `type:` line in frontmatter. It is the same fact `children` groups a table
// by and `bridge` pulls across, said on the note it describes.
//
// READ THROUGH `contextFor`, which is the same question `section-insert.ts` asks
// to decide which catalogue a note has — so the strip cannot disagree with the

