# Changelog

All notable changes to ChronoAnvil will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.9] - 2026-09-12

### Changed

- **A section's icon is its own button, and the name field holds only the
  name.** Clicking a section heading opened one text box over the icon and the
  title together, so changing a picture meant knowing which emoji you had typed
  and retyping it beside the words. The icon is now a button of its own: press
  it and the plugin's icon picker opens, with an entry for no icon at all, so a
  section can lose its picture as easily as it gained one. The name beside it
  edits as before and shows the name alone. A heading with no icon yet draws a
  faint slot to press rather than nothing, and an icon typed at the front of the
  name is still read as the icon, so pasting a title that already carries one
  cannot end up with two.

### Fixed

- **A welded section heading sits in the same column as everything above it.**
  On a page drawn as one stack, a section's title band pulled itself 14px wider
  than the card on both sides while keeping its own inset, and the two cancelled:
  the heading's icon began at the exact pixel the card's border ends, with no air
  on one side of it and the page name, the chevron strip and every group head
  indented past it. The band now states the inset the rest of the stack states,
  so the titles line up and the icon reads as an icon rather than as something
  cut off at the edge.

- **A diary entry's tracker section keeps its drag handle with its header.** The
  handle a widget offers when you hover it is meant to appear over the head it
  belongs to. In an entry it appeared above the section instead, on a strip of
  page context that is not a widget at all, because the plugin recorded which
  line each drawn thing came from before inserting that strip and read the record
  back afterwards — so the strip took the first slot and, with it, the line
  belonging to the trackers. Everything is now stamped as it is drawn. The
  handle pairs with its own header again, and a widget that had something
  inserted above it no longer answers with the next widget's line.

## [1.0.8] - 2026-09-12

### Fixed

- **A line typed under a card stays out of it.** A card whose cards, list, tasks
  or notes are stored in the note is drawn before its contents are read back off
  disk, and the plugin asked whether the fence had drawn a body at the moment it
  looked rather than once the answer had settled. In reading mode nothing ever
  asked again, so a card that was still loading was treated as a heading with
  nothing under it and took the next block into itself: a sentence written below
  a Recall card sat below the card while you were editing and inside its border
  when you read it back, from the same file. The question is now answered by what
  the fence drew rather than by what had finished arriving, so both views agree.

- **Prose typed in the gap under a card no longer detaches its contents.** A card
  and the region holding what it stores have to stay one unbroken run, and a
  sentence typed on the blank row between them cut the region loose — the card
  kept rendering, and the next thing that rewrote the note wrote the region back
  somewhere else. That row now behaves like the one above the markers at the
  bottom of a note: what you type moves to its own line below, where you can see
  it, and the card keeps hold of what it stores.

## [1.0.7] - 2026-09-12

### Fixed

- **The blank row below a note's markers has gone with them.** Every note ends
  with a newline, and that break drew one last empty row underneath the whole
  marker tail. It looked exactly like the row above it and wrote somewhere quite
  different: anything typed there landed after every marker, which is where the
  plugin appends a region it finds missing and a graph block it finds absent, so
  the next repair would wedge the sentence between two of its own lines. There is
  now one row to land on and it sits above the tail, where what you write stays
  where you put it. A note that already carries writing below its markers is
  unchanged, and the file still ends in the newline it always did — this is what
  the editor draws, never what the note says.

## [1.0.6] - 2026-09-12

### Fixed

- **The empty rows at the bottom of a note are gone.** A hidden marker takes the
  line break above it, so the blank line separating one marker from the next was
  left painted. A diary entry ends in seven parked regions one blank apart and
  therefore ended in eight identical empty rows, none of which were part of the
  note and all of which looked exactly like a row to write on. Two markers with
  one blank line between them are now hidden together, so that entry ends in the
  single blank line its last card is entitled to. The rule is keyed on the line
  actually being blank: write on one of those separators and the markers stay
  apart, so nothing you have typed can ever be swallowed by it.

- **The cursor no longer comes to rest inside a hidden marker.** Motion steps
  over a marker whole, but the position it steps *to* is the marker's own edge,
  and on one side that edge sits after the `-->` on a line you cannot see. Every
  hidden marker now names the one edge the cursor may hold, and it is the edge
  that is really visible — for a marker in the middle of a note the two edges
  draw at the same point on screen, so nothing appears to move and the invisible
  one stops existing.

- **Typing on the blank line at the top of a note works.** That line is put there
  so the cursor lands somewhere harmless when a note opens, and typing on it used
  to rewrite it until the plugin's own markup appeared in the middle of your
  sentence. Your text now goes on a fresh line below it and the line itself
  survives. Deleting is unchanged: it is still refused rather than moved.

## [1.0.5] - 2026-09-12

### Added

- **A level rail on journal index notes.** A journal home, an area index and a
  project index drew the same wash, the same spine and the same title, and were
  separated only by one word in a small-caps line — `PROJECTS · JOURNAL` against
  `PROJECTS · AREA` against `PROJECTS · PROJECT` — set in the same colour and at
  the same size as the journal name beside it. That line is now a rail: one step
  per layer of the journal, filled behind the reader, ringed where they are and
  hollow ahead. It answers two questions the old line could not, namely how deep
  the journal goes and whether there is a layer below this one. The steps come
  from the journal's own levels, so a flat journal draws two and a two-level
  journal draws three. The layer is read from the note's own `type:` value, which
  is what an index note at that depth already carries.

  Leaf notes are unchanged: an Update or a Decision is what the layers hold
  rather than a layer, so it keeps the line naming its note type. The rail does
  not navigate, because Obsidian's own breadcrumb sits directly above the note
  and already goes to every one of those folders.

### Fixed

- **A journal's colour reached its spine but not its background.** The note head
  and the view banner both set the journal's accent colour without setting the
  channel triple the background wash is computed from, so the wash fell through
  to the theme's accent. Every journal in the vault washed the same purple while
  its spine and its label took its own hue. Both now set both, through one
  function that also ends the colour being written out in two places.

## [1.0.4] - 2026-09-12

### Added

- **The note-type confirmation now covers folder depth.** A journal's depth and
  its note types are the same fact wearing two hats: both derive an id from a
  word the reader typed, both write that id as a `type:` value, both keep it
  across a rename, and removing either stops every note carrying it being
  recognised. Only one of them asked. Dropping a journal from two levels to flat
  declassified every sub-index note it had written, with no window at all, while
  the identical change to a note type opened a warning-coloured confirmation
  with a count read off the vault. Both now go through that one window, which is
  titled for whichever the reader actually changed.

  Both directions of a depth change are counted. Removing a level says how many
  index notes stop being recognised and what each one loses. Adding a level says
  how many notes are sitting directly in a folder that will hold sub-folders
  from then on, since the structure decides what a folder holds rather than its
  current contents, and it says that moving each note down one folder puts it
  back. That second cost is why adding a level gets the warning-coloured button
  where adding a note type does not.

### Fixed

- **Singular grammar in the declassification warning.** With exactly one note
  affected it read "That note stop being recognised", followed by five plural
  verbs under a singular subject.

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
