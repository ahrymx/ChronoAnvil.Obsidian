# Changelog

All notable changes to ChronoAnvil will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.15] - 2026-09-13

### Changed

- **On a phone, the drag handles and the resize bars are no longer drawn.** A
  widget's dotted grip, the vertical bar between two columns and the horizontal one
  under a card were all still faintly visible on mobile, and none of the three
  worked there: the grip drags with the browser's drag-and-drop machinery, which a
  finger never starts, and the two resize bars lose their gesture to the page
  scroll the moment you move. They are simply absent on a phone now — the layouts
  they edit are still there and still yours to rearrange from a desktop, and
  nothing else on the card changes.

  A desktop with a touchscreen keeps all three, faint but present, because that
  reader can still drag with a mouse.

## [1.0.14] - 2026-09-13

### Added

- **Move or delete several entries at once, from the card that lists them.**
  *What's below* has a second control at its foot beside **+ Add note type**: an
  **Edit** button. Press it and every note the card lists grows a tick box; tick
  as many as you like, across as many groups as you like, and the foot becomes a
  small bar telling you how many you have chosen and offering two things to do
  with them.

  **Move…** asks one question — where do these go — and answers it with one list
  in three parts:

  - **Note type** re-files them as another of the journal's own note types.
    Nothing moves on disk; the notes stop appearing under the head they are under
    now and start appearing under the other one. The list says so on every row,
    because the button says *Move* and you are entitled to expect a file to move.
  - **Index note** moves the files into another of the same journal's index notes.
    Links elsewhere in your vault are updated to follow. If a note already sitting
    there has the same name, that one note is left where it is and named in the
    report rather than quietly renamed around.
  - **Another journal**, listed under its own name and glyph. Links are updated to
    follow exactly as they are within a journal. Note types belong to a journal,
    though, so a note arriving in one is re-filed as one of *its* types — the row
    says so before you pick it, and ChronoAnvil asks which type only when the
    destination journal has more than one to choose between. Properties the new
    journal does not use stay on the note, unread, so nothing is lost if it ever
    goes back.

  If there is genuinely nowhere for a note to go — one journal, one folder, one
  note type, and no second journal in the vault — **Move…** is not drawn at all
  rather than drawn dead. *Delete…* is always there.

  **Delete…** does what everything else in 1.0.13 now does, and names the
  destination your *Deleted files* setting gives it before you press anything.

  Whichever you pick, a note with its own pages takes them with it, whatever else
  happens is reported per note — what moved, not what was asked for, with the
  ones that did not named — and the mode leaves the way it came: **Done**, or the
  banner's chevron, which folds the whole foot away with the rest of the card.

  Two things the edit mode deliberately does not do. It does not appear on a card
  with nothing on it yet, and the **Edit** button comes and goes on its own as a
  card gains or loses its first note. And it offers no *pages only* option: that
  scope belongs to a single row's `⋯`, where it has one answer, rather than to a
  selection of ten where it has ten.

### Changed

- **The dashed + Add note type row is narrower, because it now shares its line.**
  It was the only control at the foot of *What's below* and took the full width of
  the card. The **Edit** button sits beside it, so the dashed slot grows into
  whatever is left instead. Nothing else about it moved: same gap above it, same
  dashed edge, same place in the card — and the banner's chevron still folds the
  pair away together.

  While you are selecting, the dashed row is hidden rather than left live beside a
  delete: `+ Add note type` changes the card and the picking bar acts on notes, and
  those two do not belong on screen at the same moment.

### Fixed

- **A journal note can no longer be filed where nothing will list it.** When a
  journal has more than one level — Study's *Subject → Topic*, say — both
  **New …** and the new **Move…** offered every level as a home, including the
  intermediate ones. A note put directly in a Subject folder was then listed by
  nothing: that index draws a list of its *folders*, and a note is not a folder,
  while the tables that would show it live one level further down. It still
  counted on the journal's card, because that count sweeps the whole journal — so
  the note existed, still counted, and was reachable only by link or search,
  having quietly left the structure that displays it.

  Only the deepest level is offered now, by both the create and the move, and
  nothing changes for a journal with a single level. **If you already have a note
  parked at an intermediate level, it stays exactly where it is** — drag it into
  one of that folder's own sub-folders and it reappears on that index.

- **A note type's own plural is used where you are asked to confirm one.** A note
  type that overrides the plural ChronoAnvil would guess — *Practice*, not
  *Practices* — said the guess in the window asking whether to re-file notes as
  it, while every other surface in the plugin said the override.

## [1.0.13] - 2026-09-13

### Changed

- **Deleting a note now does what your vault's own setting says, and says so
  first.** ChronoAnvil used to move a deleted note into a folder of its own —
  `00 - Infrastructure/Bin/` — rather than delete it, and every window that
  offered to do it said *"Nothing is deleted"*. That folder is gone. A deletion
  now goes wherever Obsidian's **Settings → Files and links → Deleted files**
  sends everything else in your vault, and the window in front of the button says
  which of the three that is: your system trash, the vault's own `.trash` folder,
  or — if that is what you have chosen — **permanently**, in those words, with the
  setting named so you can go and change your mind before you press anything.

  This is your call rather than ours, and it reverses a decision from 4.50.1. The
  one thing it genuinely costs: the old bin *moved* a note, so links pointing at
  it followed and still resolved. A deletion cannot do that, and every window now
  says the links will break.

  **If you already have a `00 - Infrastructure/Bin/`, nothing touches it.** It is
  an ordinary folder and what is in it is yours — drag anything you still want
  back out and delete the folder when you are ready. ChronoAnvil will not make
  another one.

  One place this shows up that is easy to miss: deleting a *journal* in Settings
  used to offer to move its folders to the bin. It now offers to delete them, and
  the picker itself names where they will go.

## [1.0.12] - 2026-09-13

### Added

- **Turn the page's action menu on or off, one page at a time.** 1.0.11 gave every
  journal note, journal dashboard and diary entry a menu of things you can do to
  the page, and one place to change your mind about it: a switch in Settings that
  covers the whole vault. Settings still decides which items the menu holds; the
  banner's own row in *Edit sections…* now decides whether this page offers one at
  all. Untick **Show the action menu** and the control leaves that page's name;
  tick it and it comes back. Nothing else in the note moves either way — the line
  goes back exactly where the page would have been written with it.

  It is also how you give the menu to a note you already have. Pages written
  before 1.0.11 have no menu and are still not rewritten behind your back; the
  tick is the same write, asked for.

### Fixed

- **Closing *What's below* now closes all of it.** The dashed **+ Add note type**
  row at the foot of the card stayed on the page when the banner's chevron folded
  the section away, leaving one control sitting under a head that had gone.

- **A section you move out of the banner takes its chevron with it.** Dragging
  *Trackers* or *What's below* into a card of its own gives it that card's own
  fold, and the banner used to go on offering a second control for it — a chevron
  in the stack for a section that had left the stack. The strip now draws a button
  only for the sections the banner is actually holding.

## [1.0.11] - 2026-09-13

### Added

- **Every banner carries a menu of what you can do to the page.** Copying a note
  out as plain markdown was a command in the palette and nowhere else; linking a
  page to the diary was not possible at all, even though the diary index has
  always read the property it needed. Both are now items on one menu, behind a
  small control in the corner of the page's own name, on journal notes, journal
  dashboards and diary entries. Which items it holds is yours to set in
  Settings → Page actions, for the whole vault at once; turning the menu off
  hides the control and changes no note, so turning it back on restores it
  exactly as it was.

- **Link this page to the diary.** It writes the page's date — asking for one if
  the page has none — opens or creates the diary entry for that day, and links
  back to the page from that entry's Attachments. Dating a page is what joins it
  to the diary's timeline, so search, *on this day* and the bridge all start
  finding it together. Pressing it a second time does nothing rather than
  linking the page twice.

- **Copy as plain markdown, as a button.** The same text the command has always
  produced, with the plugin's own markup stripped out, from the page you are
  looking at rather than the one the workspace thinks is active.

### Notes

- Pages already in your vault are not rewritten. The menu is composed into notes
  made from here on; an existing note is left exactly as you have it, and
  opening *Edit sections…* on one plans no change.

## [1.0.10] - 2026-09-13

### Added

- **A diary entry can be one card.** A journal note has been able to fold its
  name, its bars and its index into a single card since 5.28, and an entry has
  been the one page that could not: its name band floated above a second card
  holding the date stepper and the tracker grid, two surfaces with a gap between
  them and the note's name belonging to neither. Open *Edit sections…* on an
  entry and the trackers row now offers the same weld button every other surface
  offers. Nothing moves unless you press it — the entries the plugin writes are
  composed exactly as before, and an entry you already have changes only when you
  weld it. Press it again to break the card back into two.

- **The navigator inside a welded card is sized for the card it is in.** The
  date stepper was drawn for the top line of the tracker card, where it is the
  card's own first row and is meant to carry its emphasis. Welded under a title,
  that emphasis read as a second, louder statement of the date the title had just
  made. Inside a stack the arrows and the picker come back to the scale of the
  controls around them, and the row keeps the air a band between two bands needs.
  The stepper's shape is unchanged: the arrows hold the card's two edges and the
  picker holds the middle.

### Fixed

- **The weld button draws on every surface that can weld.** Home and Search
  could not offer it at all, and neither could an entry. Their banners are pinned
  rows, and the editor was reading the band a weld joins from a list it had
  already filtered the pinned rows out of — so the surfaces whose banner cannot
  be dragged were the surfaces whose banner could not be welded either.

- **An entry's chevron hides its logging grid.** On a weekly, monthly, quarterly
  or yearly entry the grid is written as an empty region, and the reveal read a
  region's first content line to decide what it was looking at — finding none, it
  drew no chevron, so the grid could not be collapsed. The region's own opening
  marker is enough to name it now. A welded card's chevrons also select what they
  hide by the line each element was drawn from rather than by counting children,
  which is what they had been doing before the card's own chrome was inserted
  among them.

- **A welded entry keeps its page-context strip.** The strip carrying the date
  stepper took all of its styling from the tracker card, which a welded entry is
  not, and arrived inside the card as a bare row: no gutter, no spacing, nothing
  aligned to the bands above and below it. It now sits at the card's inset like
  every other band.

- **The vault repair leaves a welded entry alone.** The pass that splits an
  entry's merged fence back into two exists for notes written before 4.20, which
  have no divider in them. A welded entry is a fence with two parts and a divider
  between them, and the repair would have pulled it apart. It is now left as its
  reader arranged it.

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
