# Changelog

All notable changes to ChronoAnvil will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file covers the **5.x series**, in reader-facing summary. The unabridged
notes — every entry as it was originally written, and the whole of the Almanac
era through 4.84 — are in [CHANGELOG-ARCHIVE.md](./CHANGELOG-ARCHIVE.md).

## [5.27.0] - 2026-09-05

The *Add a section…* list is grouped by what a section is **about**.
**Nothing in a vault is rewritten by this release, and nothing on a page moves.**
Every note this plugin composes comes out byte for byte identical to the one
5.26 composed. What changes is one list, in two places.

### Changed

- **The add list is grouped by subject, not by "Section" and "Widget".** Opening *Edit sections… → Add a section…* on the homepage offers thirty-two things; on a diary entry, forty. Until now those were sorted under two headings, **Sections** and **Widgets**, which put *Open tasks*, *On this day*, *Tags* and twenty-odd others below one label and the two or three the page was built around above the other. They are now filed under seven: **Writing**, **Diary**, **Journals**, **Tasks & events**, **Trackers**, **Finding** and **Structure** — so *Open tasks* sits with *Coming up* and *Review*, and the diary card sits with *On this day* and *The week by the hour*, wherever you opened the list from.
- **The old split was sorting by something that isn't a property of a section.** Whether a section is drawn as a widget — a small titled card — or as a full section is a toggle you flip per section, on the page, whenever you like. Every one of the thirty-two "widgets" in that list is a section by any other measure; each already had a heading of its own. So the second heading named a distinction that was not there, and the first hid the rows it was meant to promote.
- **Add a section here now shows the same headings.** The command in the note's own menu and the button inside the section editor list the same sections from the same catalogue, and one of them had been drawing a flat list while the other drew headings. Both read one table now, so neither can drift from the other in wording or in order.

### Fixed

- **The logbook is filed with the other ways to look something up.** It had been the one entry with a hand-written exception keeping it on the correct side of the two-way split. Under **Finding**, with search, tags and the navigator, no exception is needed.

## [5.26.0] - 2026-09-05

Widgets can be added to diary entries and to journal notes and templates.
**Nothing in a vault is rewritten by this release, and nothing on a page moves.**
Every note this plugin composes — homepage, Search, logbooks, the four period
dashboards, journal dashboards, journal templates and diary entries — comes out
byte for byte identical to the one 5.25 composed. What changes is what
*Edit sections… → Add a section…* offers you on two surfaces where it had been
offering nothing at all.

### Added

- **A diary entry can hold any widget the plugin has.** Open tasks, On this day, the logbook, the time grid, Coming up, a tracker readout — thirty of them, from the same list the homepage has always offered. They land in the block your entry's other sections already live in, below the rule, and they are dressed the way that block dresses everything else: a title, a chevron, a fold. Nothing you have written moves, because a widget owns no part of the note body — that is what separates one from a field.
- **So can a journal note and a journal template.** Twenty-three on a journal's index, twenty-eight on a leaf. A widget added to a *template* is the one that could not be done by hand at all: a directive typed into a template was removed again by the next **Maintenance: refresh journal templates**, because the composer could not see it. Added through the editor, it survives.
- **A widget you configure keeps its answer.** The folder an Open tasks table searches, the journal a Contents list indexes: asked when you add it, remembered in the template it was saved into, and carried across when a layout is transferred from one journal to another.

### Changed

- **Two widgets are no longer offered on pages that cannot draw them.** *What the days said* draws a refusal on a note with no period to roll up, and *Go to period* writes a `week-start` property onto whatever note it is on — which on a daily entry is enough to make the plugin read that day as a week. Both are still offered on the four period dashboards, where they are the point. Nothing composed changes: on the pages that keep them, those two were already part of the page.

### Fixed

- **A widget in a diary entry no longer welds the entry into a single card.** A daily entry's sections share one block, and the plugin puts a name over a block when the block is one nameable thing. Seven fields that each name themselves counted as none — so no name was drawn, which was right for the wrong reason — and the moment one widget joined them the whole block counted as *one*: Today's focus, Highlights, Challenges, Notes, Attachments, Tasks and Captured were drawn inside a single bordered surface titled after the widget that had just been added to them. A block of several sections is now never named after one of them, and the widget carries its own title instead.

## [5.25.0] - 2026-09-05

**Nothing in a vault is rewritten by this release, and nothing on a page moves.**
Every note this plugin composes — homepage, Search, logbooks, the four period
dashboards, journal dashboards, journal templates and diary entries — comes out
byte for byte identical to the one 5.21 composed. That is the whole point of the
release: the machinery underneath those nine composers was four near-copies of
one thing, and it is now one thing.

There are no version numbers between this one and 5.21. The work landed in four
stages that were planned as separate releases and shipped as one, because none
of them changed anything a reader could see.

### Changed

- **One kind of section, everywhere.** A section on a journal template, a period dashboard, a diary entry and the homepage were four different objects in the code, described by four types and edited by four sets of near-identical routines. They are one type now, read by one parser, with one shared vocabulary for working out what a note has and what it should have. What this buys is not speed — it is that a fix made once is a fix made everywhere. Two of the rules merged here had already drifted apart once and been repaired in only one of their two copies.
- **A quarter of the section catalogue is now plain data.** Twenty-two of the sections this plugin offers — every page widget you can add to a note among them — are described by a small block of values rather than by code: their title, their directives, what they ask you, where to find them in a note. That is the shape a section would have to have for you to define one yourself from Settings, and this release is what makes the distance to that measurable rather than guessed at.

### Fixed

- **The count of unrecognised blocks in a note agrees with itself.** *Edit sections…* reported "1 block in this file aren't the catalogue's". It now says *isn't*.

## [5.21.0] - 2026-09-04

A control that only ever half-worked is gone, and two that had no door on the
page now have one. Nothing in a vault is rewritten by this release: notes keep
the sections and the groups they have, and a group already titled keeps its
title.

### Changed

- **The Open tasks table no longer carries its own scope button.** The Below / Journal / Path cycle sat on the section's title bar and rewrote the folder the table searched — on some pages. On the homepage it was never drawn at all, which was not a decision: the table was told a title bar had drawn the control when none had, so the one page whose task list covers your whole vault was the page the control was missing from. Rather than fix a button onto a fourth surface, it is removed. The folder is still yours to set, in *Edit sections…*, where every other widget's folder is set and where the change is shown to you before it happens.
- **Cells after the first in a group say why their form is fixed.** The tick box on those rows reads *"Cells after the first are always widgets — the group's title is the first cell's"*, which names the reason rather than restating the state.

### Added

- **Open tasks can be drawn bare.** It is the second cell of the *Lately* band on a journal dashboard, so it composes no title of its own — and once it was on its own, having been taken out of that band, there was no way to take the title back off again. The section now offers the same *draw it as a widget* box the sections beside it do, on the line it wears when it stands alone.
- **A group can be told whether to draw a head.** The card in *Edit sections…* carries a **Title header** tick beside *Break up the group*: ticked, one full-width bar is drawn over the whole group, worded by its first cell; unticked, the group captions itself from the names of its cells — *Lately · Open tasks* — in a light box of its own. Both were already how a group could look and there was no way to choose between them, so a group broken up and made again came back wearing the other one for good.
- **One GitHub release that is always the current build.** A rolling `latest` pre-release now carries `main.js`, `manifest.json`, `styles.css` and both zips under permanent links, replaced on every version pushed to the default branch. The per-version releases are unchanged — Obsidian still resolves a version by its own tag — and the README's Install section now hands out links that do not go stale.

### Fixed

- **A tick answered for one column of a group no longer takes the whole group's title off.** *Draw it as a widget*, answered for a cell that is not the first, removed the band's one title bar — an answer about a single column, spent on the group it was in. It is now refused, as it already was on journal templates.
- **A group given its title back is written the way it is composed.** The title bar went in above the group's own `row` line rather than below it. It renders identically and it is not the same file: the plugin compares your note against a freshly composed one to decide whether you have edited it by hand, so a group titled from the editor was a page reported as hand-edited on the strength of one line's position.

## [5.20.0] - 2026-09-04

Journal templates open with four sections, and two controls that had no door on
the page now have one. Nothing in a vault is rewritten by this release:
templates already written keep their sections, notes already split into pages
keep their pages, and journal dashboards already in a vault keep theirs.

### Changed

- **Every template a journal writes starts with four sections.** The banner, the tracker card, the table of **what is below** — a folder's notes, or a long note's pages — and the **prose skeleton**, which is always last so nothing the plugin composes sits under your own writing. Ten sections that used to be composed for you, wherever they applied, are now one tick away on the step you are already on: the review queue, the task rollup, the progress band, the charts region, the learning path, the resources shelf, recall cards, the checklist, the stats band and Find. Next-Next-Next-Create gives you a page you can start using rather than one you have to prune.
- **The four preset journals ship those defaults too**, and their arrangement pins are gone with them — Study, Projects, Exercise & Diet and Media are now composed by the same rules as a journal you make yourself, rather than being the one set of journals that carried a hand-written layout.
- **The prose skeleton is the last thing in the catalogue**, so a section re-added after it goes above it rather than under it.
- **Pages stopped being a checkbox on the Structure step.** It was the one field on a note type's row that was not about what the type *is* — it decided what the type's template *contains*, one step before the step that asks exactly that. It is now the **📄 Pages** section, on the Sections list where its effect is shown: tick it and long notes of that type can be split into pages, each with its own Recall deck, and the journal gains a shared **Page** template. Untick it and notes already split keep their pages and go on working. The tick is available in the wizard and, on a journal you already have, in *Edit sections…* over that type's template — which is a question an established journal had no way to answer at all.

### Added

- **A journal's front page can be edited from the page.** The **⋯** control on `03 - Journals/Study/Study.md`, on every other journal's folder note, and on `03 - Journals.md` now carries *Edit sections…*, *Add a section…* and *Wide page*, the same three every diary dashboard has had. Those pages have had a section catalogue and a working editor since 4.36; the only way in was the command palette. Every journal is still created from the same hardcoded list, so a journal you make next year opens the way the one you made today did.

### Fixed

- **A section you ticked in the New journal wizard is no longer silently taken back out.** The wizard recorded the *order* of your sections but not *which* ones, so a Recall deck or a search box ticked at Create survived into the templates and was then removed by the next **Refresh journal templates** — a command whose own warning is that it replaces custom edits. Both are written now. This had been latent since 4.35 and became total in this release, when ten more sections came to depend on it.

## [5.19.0] - 2026-09-03

Documentation only. No change to the plugin's behaviour, and nothing in a vault
is touched by this release.

### Added

- **The visual tour shows the settings and capture surfaces.** Three captures join it: the **Journals** settings panel — the four presets with their identifiers, root folders and structure — the **Quick capture** modal, and a **logbook** with its sub-logbook menu open, entry counts and the Open / Done / Timed tabs. Twelve images now, from nine.
- **The hourly week grid is annotated with its three gestures.** Sweep an empty column to block out a slot, click a block to edit it, drag a block to move it — numbered on the image, with the legend beside it in the README.
- **`themes.png` is a real comparison.** One homepage under five themes, at the same scroll position, cut into five equal bands on four parallel diagonals. It replaces a single capture that had been standing in for a composite the repository's own notes described but had never built. `tools/make-theme-strip.mjs` and `tools/annotate-shot.mjs` build both generated images from the untouched grabs, so either can be rebuilt after a recapture.
- **The vault reference documents Appearance.** Seventeen page grounds in five families, the three aesthetic presets, and how a ground takes its colour from your Obsidian theme rather than from a fixed palette. Page grounds shipped in 4.80 and the reference had never mentioned them.

### Changed

- **The changelog opens on the current release.** It had grown to 413 KB across 164 versions reaching back to 4.0.0, which GitHub renders truncated. It now carries the 5.x series in reader-facing summary; every entry as originally written, and the whole Almanac era, moved to [CHANGELOG-ARCHIVE.md](./CHANGELOG-ARCHIVE.md). Nothing was discarded.

### Fixed

- **5.11.0 has its release notes back.** The version shipped — it is in `versions.json` and both its archives exist — but its section had been renumbered as 5.12.0 rather than kept, so the released version had none of its own and a release built from that tag would have published "See CHANGELOG.md" as its body. The section is recovered verbatim from the 5.11.0 source archive, and the four bullets 5.12.0 had inherited from it word for word now appear once, under 5.11.0.
- **The README's most prominent link went nowhere.** "Watch the tour" pointed at `youtu.be/REPLACE_WITH_VIDEO_ID` — a placeholder that reached the community listing, where the README is the plugin's front page. The line is removed until there is a recording to point it at.
- **The reference no longer ships a migration note for 1.5.0** into a 5.19 vault.

## [5.18.0] - 2026-09-03

### Changed

- The four preset journals ship the arrangement they were rearranged into: every index opens with the table of what is below it, and closes with Find and Charts.
- A leaf index draws the tracker grid and the stats band as one group with two tabs, rather than two bordered boxes saying two things about the same note.
- A journal's activity band moves below the stats band, so the front page opens on the way into the journal. Every journal gets this, custom ones included.

### Fixed

- A section re-added from the Section Editor goes back where its own template would have put it, rather than where the generic catalogue would.
- A row whose cell holds a tracker grid can be cut down to one cell. The region's own markers were being counted as widgets, so such a row could never fall below three.

## [5.17.0] - 2026-09-02

### Fixed

- Every page of a paged group can be dragged, not only the page that happened to be open when it rendered.
- A fence holding nothing but a tracker grid is named — **📊 Trackers**, the same name the card carries inside a group.
- A widget's grab handle and its name answer the same hover target, so neither appears without the other.
- A tracker grid can be picked up, and its whole marked region travels with it.
- Widgets in a group row each wear one head, instead of a tracker grid scattering loose grab dots across its cells.

## [5.16.0] - 2026-09-02

### Changed

- Compact, mobile-friendly tracker cells — 66px with tighter padding, and scale faces, habit chips and sleep buttons sized for a finger.

### Fixed

- Dropping a field in the middle of a diary entry targets that field. The middle 60% of every field used to belong to nobody, and the entry's own edge-to-edge bands lay underneath it.
- Seven fields, one gap. Field spacing no longer depends on which kind of field it is or whether it happens to be last.
- A diary entry no longer shows one grip that silently means all seven fields at once.

## [5.15.0] - 2026-09-02

### Changed

- Tracker cells are spacious, numberless and uniform in height. Scale ratings draw clean face glyphs; the numeric value stays in the tooltip.
- The sleep tracker has dynamic time buttons — `[ 🌙 Bed ]` and `[ ⏰ Wake ]` morph into the time once set, with a live `😴 8h 15m` duration readout under them. Right-click clears.
- Tags flow across two full rows before spawning a `+N` overflow badge.

### Fixed

- The date navigator falls back to the filename's ISO date, so the label never collapses to an empty badge while the cache is still indexing.

## [5.14.0] - 2026-09-02

### Added

- The second cell of a row can be drawn as a widget too — *⏳ Open tasks*, *🏷️ Tags* and *😴 Sleep* on the diary and journals dashboards.

### Changed

- Every field in a diary entry wears the same head as every section everywhere else, and the fold is remembered per field per note.
- Attachments has a complete frame: the name is the field's head, with ✕, *Add file* and *Add link* in it, and the dashed border stays on the drop zone.
- Highlights and Challenges are two ordinary fields rather than one welded box. They remain two regions on disk.
- Every widget in a bare fence has a grip of its own, so a diary field can be dragged into a new order without opening the Section Editor.
- A widget group has a head carrying its caption and grip, and a foot carrying the page numbers and the `+`. The box is drawn on every surface.
- A group whose fence has a `header:` bar draws no second head — the bar is the group's head.

### Fixed

- A section broken out of a group comes back with the title its catalogue declares.
- The missing-title repair defers to the new widget toggle instead of arguing with it.

## [5.13.0] - 2026-09-02

### Changed

- "What's below this note" is one section again: one bar naming the whole, with a quieter group head per note type and each type's create button inline in it.

### Fixed

- A bare second `header:` in one fence is a group inside that section, not a second section. `header:1:` is still left alone.
- A page composed before this release is offered the one bar it is missing.
- A section's own bar no longer offers to rename a note type.

## [5.12.0] - 2026-09-01

### Added

- Any journal section without an action row can be drawn as a widget. A section is offered the choice unless something is anchored into its title bar — *🗂️ Topics* has **New Topic** there, *📊 Charts* has **+ Add chart**.

### Changed

- The section/widget toggle reads **Show as widget**.

### Fixed

- A section holding a logging grid no longer swallows the block under it into its own card and its own fold.

## [5.11.0] - 2026-09-01

### Added

- A journal note's groups are in the Section Editor: a group on the page is a group in the window, so it can be broken apart, its cells moved, and a new one made.
- A journal section that is a title over one widget can be drawn as a widget — *🔎 Find*, *🔁 Review*, *⏳ Open tasks*, *📈 Progress*, *🔢 Stats*, *🧮 Status* and *🏷️ Tags*.

### Fixed

- The 5.10 missing-title repair no longer overwrites an answer you gave. A barless fence under the toggle is an answer, not an omission.
- The empty strip of card that hung under the last section on a page. A section's invisible storage regions still belong to it and still fold with it; they no longer paint.
- A page banner could be grouped. A journal note's `journal-header` and a diary entry's `entry-header` are page heads like `title`.

## [5.10.0] - 2026-09-01

### Added

- Unified section framing and collapsible headers for **🧠 Recall** and **✅ Tasks**.

### Fixed

- Drag handles anchor inside the section header bar instead of floating into the margin above it.
- Two chart sections drew their header under their own content, so the empty-state sentence printed above the header it referred to.
- Trackers and Recall each drew a second, private fold bar — which on the tasks region silently hid the **Compact** toggle and the progress readout.
- A closed section is its title row and nothing else, whatever it happens to carry.
- A tally names what it counts wherever nothing else names it.
- A note written before a section had a title is offered the missing line.

## [5.9.0] - 2026-09-01

### Added

- Section header bars for **📊 Trackers** and **🔢 Stats**.

### Fixed

- A row's surviving cell keeps a title. Unticking the cell that opens a row used to leave the other one drawn as a loose widget.
- The journal tally wears the section frame rather than a field's private fold bar.
- Review queue drag handle visibility, and the duplicated Trackers card surface.

## [5.8.0] - 2026-08-31

### Added

- Harmonized section headers across Trackers, Recall and Tasks, and a fold toggle on Trackers with persistent per-note state.

### Changed

- A compact Pages layout, with a slim inline empty state instead of an oversized callout.
- The tracker card drops its redundant context strip.

## [5.7.0] - 2026-08-31

### Added

- Recall renders with full surface styling and a collapsible header.

### Fixed

- A spurious *"Open a note first"* when creating a page straight after using the Section Editor. The active file is now resolved across four tiers.
- The prose skeleton disappearing when moved past a section backed by a region comment.
- Section order persisting through **Save as Default**.

## [5.6.0] - 2026-08-31

### Added

- **The prose skeleton can be removed, and removing it keeps what you wrote.** The headings sit between two invisible markers, so removal is by heading: scaffolding goes, anything you have written under stays, and the change list names each one it keeps before you press Save.
- **The heading list is editable in the Section Editor** — reorder, rename, add, delete — and **Save as layout…** makes it what every note of that kind opens with.
- Time-grid filter chips remember which are active across reloads and workspace restarts.
- Logbook widgets re-render as soon as Quick capture writes to them.
- Larger time-grid resize targets, with right-click and long-tap to open a block.

### Fixed

- The settings tab keeps your scroll position, your search and your category through every change, and clearing a search puts every fold back to your own answer.
- Calendar heatmaps fit the tile they are drawn in on both axes, and scroll rather than clip when they cannot.
- Settings rows stop shifting when a longer value is picked — the control column has a fixed width.
- The three tracker tables share one column grid, and the capture matrix's headings sit over the switches they name.
- A wizard's footer stays where you aimed: the body is floored at the tallest step drawn so far.

## [5.5.0] - 2026-08-31

### Added

- A GitHub-style transposed contribution heatmap, and responsive 14- / 7-day calendar heatmaps for shorter ranges.
- The README's visual tour has its screenshots, and `test/review-checklist.test.ts` opens the files to prove it.

## [5.4.0] - 2026-08-31

### Fixed

- A journal's activity strip said *"last worked today"* over a year of empty cells.
- The seeded vault put every journal note in the oldest two months.

## [5.3.0] - 2026-08-31

### Removed

- The `title:` directive's argument, and the head it fed.
- The last traces of the name the plugin briefly carried between Almanac and ChronoAnvil, which was never released.

### Changed

- The five longest builders are sub-builders. Nothing in a reader's vault is rewritten by any of it.

## [5.2.0] - 2026-08-31

### Added

- A tagged release workflow.
- The settings tab is documented in the vault reference, along with thirteen widgets that had never been written down.
- A focus ring and a pressed state on the settings category pills.

### Changed

- Searching the settings no longer ignores the category you picked.
- `versions.json` describes this plugin rather than its predecessor.

### Fixed

- The diary card had stopped drawing its actions strip, and everything around it went on passing.
- A folder note written `type: Lesson` was not the same note as `type: lesson`.
- Two licence documents credited a library that is not in the build.

## [5.1.0] - 2026-08-30

### Added

- Settings category tabs and real-time keyword search.
- A settings masthead card with repository links and an integrated **Repair vault** action.
- The visual tour in the README, and themed activity ramp tokens.

### Changed

- A clean section hierarchy in the settings tab, and corrected manifest metadata.

## [5.0.0] - 2026-08-29

The rename. **Almanac is now ChronoAnvil.**

### Changed

- The plugin id, the vault format tokens and the CSS namespace all move to the new name.
- The stylesheet no longer ships its own commentary — comments are stripped from the built file.
- No command claims a default keyboard shortcut, and the settings tab no longer prints the plugin name Obsidian has already printed above it.
- YAML goes through Obsidian's `parseYaml` / `stringifyYaml` instead of a bundled parser.

### Added

- `tools/migrate-vault.mjs`, read-compatibility for pre-rename vaults, and settings that survive the id change — restored from `.almanac-registry.json` in the vault root.
- Scaffolded notes are compiled into `main.js`, so a community-store install has them without any extra files on disk.

### Fixed

- A click listener that outlived every log widget.

---

Releases 4.84.0 and earlier went out under the name **Almanac**. Their notes are
in [CHANGELOG-ARCHIVE.md](./CHANGELOG-ARCHIVE.md).
