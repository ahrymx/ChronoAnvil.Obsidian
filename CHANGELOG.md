# Changelog

All notable changes to ChronoAnvil will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.3] - 2026-09-12

### Added

- **"Add note type" on the *What's below* card.** A journal's note types could
  only be changed in Settings → ChronoAnvil → Journals → Edit journal →
  Structure, which is four steps from the page a reader is looking at when the
  thought occurs. The card that draws a group per note type now ends in a
  dashed slot in the same vocabulary as "+ Add tracker" and "+ New journal";
  pressing it asks for one name and adds the type. The emoji, the rating and
  the pages toggle stay in Settings, and the prompt says so. The row is drawn
  by the renderer rather than composed into a note, so every deepest index note
  already in a vault gains it at the next repaint with no migration. The name
  becomes the `type:` value through the editor's own rule with existing ids
  preserved, the template is written, and the dashboards are offered their new
  table through the same window the editor uses. A name the journal already has
  is refused rather than filed under a suffix.

## [1.0.2] - 2026-09-12

### Fixed

- **The journal wizard's folder-collision refusal.** Creating a journal whose
  derived folders are already on disk is still refused, but the refusal now
  says something a reader can act on. It names both folders at once instead of
  stopping at the first, so a journal copied in with its templates no longer
  produces two refusals in a row about two halves of one collision; it counts
  the notes claiming the folder would take in; it describes a templates
  collision as one rather than as a claim on notes that are not there; and it
  offers the adoption route only when that route exists. The last of those was
  the reported dead end — the message pointed every collision at "Found in the
  vault" in Settings → Journals, including folders of ordinary notes, which
  discovery ignores on purpose.

## [1.0.1] - 2026-09-08

### Changed

- **Visual tour screenshots.** Updated the visual tour captures with clean,
  sidebar-free screenshots taken from a freshly seeded development vault.
  Updated `dashboard.png` with a clean hero capture, `study-journal.png` with
  modern styling, and `section-composer.png` to demonstrate the active
  drag-and-drop section composer modal.

## [1.0.0] - 2026-09-07

First public release.

ChronoAnvil is a self-contained journaling, diary, habit-tracking and study
system for Obsidian. Everything below is drawn by the plugin itself — there are
no Templater scripts, no Meta Bind buttons, no Dataview queries and no external
chart plugin behind any of it. Obsidian's own **Bases** is still supported for
standalone `.base` files, and is the only thing kept.

### Added

- **A diary.** Daily and monthly entries, an overview calendar with heat maps
  and special events, week / month / quarter / year dashboards, full-text search
  filtered by date, tag and tracker, and on-this-day and timeline recaps. Every
  entry opens on its own head — the date, the title you give the day, the
  navigator to the entries either side of it, and the day's logging grid.
- **Journals you define yourself.** A journal is a folder tree with its own
  folder levels, note types, templates, commands and homepage section. Four
  presets ship ready to use — Study (*Subjects → Topics → Lessons and
  Practice*), Projects, Fitness and Media — and a journal you write yourself
  gets the same dashboards, indexes and charts they do.
- **One tracker registry, shared by both.** Trackers are defined once and appear
  wherever you put them: numberless rating scales, steppers, dropdowns,
  multi-row tag flow, habit pills, and bedtime / wake-up buttons that carry live
  sleep and wake durations. Any tracker can be added to a single entry on the
  fly without touching the registry.
- **Charts drawn from your own frontmatter.** Line, bar, calendar heat map,
  scatter correlation, streak and summary stat cards, rendered natively onto
  diary dashboards and journal indexes.
- **The week by the hour.** An interactive hourly scheduling grid with
  colour-coded blocks: drag down an empty column to block out a slot, drag a
  block to move it to another day or hour. Logbooks and task blocks sit beside
  it — named, standing lists for the work that belongs to the diary but not to
  one date.
- **Quick capture, and a search that reaches everything.** One box that stamps a
  line into any note with the time; and full-text search across the diary and
  every journal at once, filtered by date, tag and tracker.
- **A page you can rearrange.** Every ChronoAnvil page is a set of sections and
  widgets you can reorder by dragging, or compose in *Edit this note's
  sections…* — into rows of columns, into groups with pages, or welded into the
  page's banner as one card. The arrangement is written into the note in plain
  text, so the file always says what the page is.
- **Appearance that follows your theme.** Two aesthetic presets, five temporal
  grain palettes, page ground textures (dot grid, graph paper, scanlines,
  weaves) and vault banners — all built on your Obsidian theme's own colours
  rather than over them.
- **Vault scaffolding.** One command — *Maintenance: set up / repair vault* —
  writes the folders, dashboards and reference documentation, and repairs them
  in place afterwards. The notes it writes are compiled into `main.js`, so a
  community-store install has everything it needs from the three files Obsidian
  copies.

## Pre-1.0 development

ChronoAnvil was developed privately before this release. No build was published,
distributed or installed by anyone other than its author, and the notes for
those iterations are not part of this repository.
