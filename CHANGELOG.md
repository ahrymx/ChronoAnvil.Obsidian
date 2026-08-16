# Changelog

> Detailed development history prior to 4.0.1 is available in [docs/dev-log.md](docs/dev-log.md).

All notable changes to Almanac will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.34.5] - 2026-08-16

**A widget outside a group opened its header to any pointer near its top edge.**
4.34.4 made the drag dots the only thing that reveals a widget's header, and set
that on one of the two places a header can live — so widgets in a group behaved
as intended while widgets on their own kept the full-width strip along their top
edge and went on opening unasked. One control, two behaviours, on the same page.
The strip is gone from both now.

**And the archives are a script.** They were made by hand until this release, and
by hand is how they went wrong: three times in one session a `tar` inherited a
directory change from earlier on the same command line and wrote a valid,
correctly named, 410-byte archive of nothing — exit code 0, the only symptom
being the file size. `npm run release` packages and files both archives, and it
does three things a command line does not: it has no working directory to be
wrong about, it opens each archive after writing it and deletes any that does not
contain what its name claims, and it refuses to file a stale build under a new
number — the one error reading the archive back cannot catch, because everything
inside it is real. An existing version's archive is never replaced without
`--force`.

## [4.34.4] - 2026-08-16

**The widget header opens from the drag dots now, and from nothing else.** 4.34.3
made it an overlay triggered by a strip along the card's top edge, which was
still too easy to ask for by accident: the top of a card is something a pointer
crosses on its way somewhere else, so the band went on appearing unbidden.

The header names what the grip picks up, so the two are one control — hover a
widget and the dots appear, move onto them and the band opens under them. It has
no hit area of its own until it is open, which is what makes the minimisation
real rather than a matter of degree; once open it takes one back, so the band
stays up as you move down off the dots and into it.

## [4.34.3] - 2026-08-16

**A widget's header no longer pushes the widget down.** Hovering one opened a
band that was not there a moment before, so the widget's own contents moved — and
inside a group it made that cell taller than the ones beside it, which moved the
whole row. A label about a widget was rearranging the widget. It is laid **over**
the top edge now, the way the drag dots already are, so nothing reflows.

**And it only appears where it will be.** A band that opens over the thing you
are pointing at is worse than one that opens over the padding above it — so the
trigger is the top edge itself, a 10px strip over the card's own top padding. On
a phone it is unchanged: a static band, because there is no hover to open one
with and nothing there to drag.

**The mark you pull to set a widget's height is the widget's bottom edge now.**
It was a short pill centred in the gap between two cards — punctuation dropped
between the widgets rather than a property of either, and on a group of three the
eye had to work out which card each one belonged to. It runs the full width of
the card's own bottom edge instead, so what lights up is the edge of the thing
the drag resizes. The 12px target is unchanged; only the drawing moved.

**In *Edit sections…*, the accent spine follows the pointer.** It was painted
permanently on every section row, so a list of twelve drew a dozen accent bars
down its left edge — all saying the same thing about a distinction the *Section*
pill on the row already states in words. Emphasis that never varies is texture,
and the one thing it could not tell you was which row you were on. Now it marks
that, and its width is held on every row so nothing shifts as you move down the
list.

**A group in that list has more room around it.** At six pixels its card sat
almost against the loose sections above and below, leaving a 2px rule to carry
the whole difference between *these three are one object* and *this one is on its
own*.

## [4.34.2] - 2026-08-16

**Pages are in *Edit sections…* now.** The `+` in a group's foot is the gesture
for when you are pointing at one thing; the sections window is where you arrange
the whole note, and until now it could not see pages at all — it would have shown
a paged group as one undivided list and flattened it on the next Save.

Every section inside a group carries **Start a page here**, and the group's card
shows where its pages divide. Press it again — it reads **Join the page before** —
to take the division away. **The column stays either way:** removing a page
boundary puts the two sections back beside each other rather than stacking them,
because a page break is a column break that was promoted, and unmaking it returns
it to what it was.

**The card stopped counting columns, and so did the group's foot.** *Group — 4
columns* became exactly wrong the moment a group could hold pages: two pages of
two columns each is not a group of four columns, and that number was the one
thing on the card you would have read as a description of your page. It says how
many **pages** now, and only where there is more than one.

**And the `2 COLUMNS` in the foot is gone entirely.** It was there because 4.9's
foot needed something in it to be a bar at all, and what it said was a count of
the columns directly above it — a label restating the thing it sat under. The
foot carries three controls instead: the grip, the `+`, and the page numbers.

## [4.34.1] - 2026-08-16

**A group now says that pages exist.** 4.34 shipped `tab` reachable only by
typing it, and the first thing a reader saw was a footer still reading *2
columns* with nothing anywhere suggesting a page was a thing a group could have.
That is precisely the state `cell: 2` sat in from 4.4 until 4.9 gave it a divider
to drag — a grammar nobody used, because nothing on the page said it was there.

**Point at a group and a `+` appears in its foot.** Press it and the last column
becomes a page of its own; press it again and the next one follows. It is offered
on any group with two columns left to divide, **including one that has no pages
yet**, which is exactly where you would go looking for it.

**It splits rather than adds, and that is not a shortcut.** A page with nothing
in it is not drawn — that rule is what stops a stray `tab` line putting an empty
number in the strip — so a button that only appended a `tab` would have written
to your note and changed nothing on the screen. Splitting the last column is the
gesture that has something to show for itself.

**One fix you would only have seen in a group that was never paged.** The
wrapper 4.34 put around a group's rows clipped its contents at rest, in a release
whose whole claim is that a group without a `tab` line is untouched. It now clips
only while a page is actually moving.

## [4.34.0] - 2026-08-16

**A widget group can have pages now.** A `row` line has put widgets side by side
since 4.2 and a `cell` line has divided that row into columns since 4.4. A **`tab`**
line divides the block itself — into pages, one on screen at a time, with a
numbered strip in the group's foot to switch between them:

````
```almanac
row
diary:3
cell
tasks-table
tab
journal-chart:confidence
```
````

That is one group with two pages. The first is two columns, the second is a
single wide chart, and the foot reads **[1] [2]** with the open one tinted. Until
now the only answer to a crowded dashboard was to make it longer; this is the
answer for the widgets that are *alternatives* to each other — the confidence
chart and the accuracy chart, this month and last month, the table and the chart
of the same thing.

**Each page is a whole row of its own,** so every page has its own columns and its
own widths. A `cell` divides the page it is in and nothing else.

**Two commands, and they are the reason to open Settings → Hotkeys.** *Note: next
page in this widget group* and *Note: previous page in this widget group* switch
the group you last clicked in, and they wrap — pressing *next* on the last page
goes back to the first. Nothing ships bound to a key, because any default we
chose would collide with something you already use. With one group on the note
the keys simply find it; with several, the one they are listening to shows a
tinted line above its foot, so you are never pressing a key at a group you cannot
identify.

**Where you left it is remembered per note, and your markdown is untouched.**
Close the note, come back a week later, and the group is on the page you were
reading. Switching pages never writes to the file — the page you have open is the
plugin's business, not your note's.

**The strip does not jump under your pointer.** A tall page followed by a short
one would otherwise move the foot between two presses of the same key, which is
the kind of thing that is never broken and always feels broken. The group's
height moves with the page instead. If you have **reduced motion** turned on, the
swap is instant — and that setting is now respected across the plugin, which it
never has been before.

**`tab` takes no value,** the way `row` doesn't. The pages are numbered, and the
count is the number of `tab` lines you wrote, so `tab: Charts` is refused rather
than quietly ignored. Named pages are a reasonable thing to want later, and a
value accepted and dropped today would be sitting in your files by then.

**A page you cannot see is not drawn** — a `tab` at the end of a block, two in a
row, or one above a widget that has nothing to show. The strip never offers a
number that opens onto nothing.

**And a group with no `tab` line is exactly what it was:** one row, its columns,
and the column count in the foot. Every dashboard Almanac ships is one of those
and none of them has changed.

## [4.33.1] - 2026-08-16

**A subject with no topics yet now says so.** *What's below this note* asked the
wrong question. It looked at whether a folder had any sub-folders in it *right
now* and treated an empty answer as "this is the bottom of the journal" — so a
brand-new Subject, which has no Topics by definition, was given the tables that
belong on a Topic: a **Lessons** table and a **Practice** table, each telling you
to press a *New Lesson* button that is not on a Subject page. Every subject you
made looked broken for as long as it was new, and looked correct the moment you
added a topic to it. What decides now is the shape of the journal itself: a
Subject has Topics below it whether or not any exist yet, so an empty one shows
**No topics yet** and points at the **+ Topic** button in that section's own bar.

**And a topic stopped turning into a subject.** The same question got the same
answer backwards: a lesson split across pages is a folder, so the first time you
split one, the Topic holding it decided it must have containers below it and
replaced its **Lessons** and **Practice** tables with a folder rollup listing
that one lesson.

**The empty state points at the button that is actually on the page.** It used
to send you to the Journals card on the homepage while the control that does the
job sat directly above the sentence.

**"Practice" is "Practice" everywhere.** Study spells out that this one does not
gain an "s", and three places ignored it and pluralised the label themselves: a
subject's table column, the four-number band at the top of a topic, and the
per-type headings *What's below this note* draws when it is pointed at a folder
by hand. So a subject's page said **Practices** over a topic that called itself
**Practice** on every one of its own headings and buttons. The same fix covers
any journal of yours whose spelling you have corrected by hand.

**A journal's front page named the wrong level.** A rollup drawn at the root of a
journal — the folder that holds your Subjects — headed its first column **Topic**
and offered to make one, because it counted the root as though it were a Subject.

## [4.33.0] - 2026-08-16

**Your journal notes can decide what a journal note looks like.** 4.29 gave every
diary entry a **Template…** item on its cog. Journal notes had nothing like it:
the only way to change what a new Lesson started with was Settings → Journals →
*Templates and sections*, which edits the template file from a screen nowhere
near the note. There is now a **Template…** item on every journal note's banner
cog, next to *Edit sections…*, and it does the same three things.

**Save this page as the default.** Arrange a note however you like — drag its
sections into the order you want, take out the ones you never use — then save
that page as the default for its note type. Every new note of that type is built
from it. Notes you already have keep what they have.

**Every kind of journal page, not just the note types.** Front pages — the
dashboard note in each folder — and pages both have their own default now, and
you save one the same way: stand on the page and press the button. Saving
finishes by opening the usual template window, so you see exactly what your
templates gain and lose before saying yes.

**Named layouts, now offered on front pages and pages too.** Saving a layout asks
where it should be available, and the list has two new entries beside your note
types: **Front page** and **Page**. A layout tagged that way is an arrangement
you can reload onto any front page or page — it does not add a new choice when
you create one, because front pages and pages are not created from a choice.

**Reload a template onto a note you have not written in.** Pick the type's
default or any saved layout and the note is rebuilt from it. **This is only
offered when the note is genuinely empty**, and "empty" is strict: a word in any
section, a paragraph under one of your headings, a tracker you added to that one
note, a chart you added to that page, a resource shelf you named, or a line of
your own in a widget block all count. When something is in the way the window
says exactly what, and points you at *Edit sections…*, which changes a note's
sections without losing anything.

**Charts you added are now protected, and previously they were not reported at
all.** A journal note's charts live in a block Almanac treats as opaque, so the
existing "preview changes" window would tell you a page's charts were unchanged
while a rebuild was about to replace every one of them. A rebuild now refuses.

**Saving keeps what you wrote in the markdown, which it used to quietly drop.**
If you renamed a heading — `## Notes` to `## Working` — or retitled a section's
header bar, saving the page as a default or a layout now keeps your name for it.
It used to fall back to the name the journal had stored, at exactly the moment
you asked it to keep something. The prose *under* a heading is never carried into
a template: that is what you wrote in that note, not the shape of the next one.

Nothing about a reload touches your properties. What the note is, the folders it
belongs to, when it was made and any readings on it are kept exactly as they
are — only the body is rebuilt — and you see the full difference and confirm
before anything is written.

**One fix that has nothing to do with the window.** Installing a journal from a
preset shared part of its arrangement with the preset itself, so a second Study —
or *Start from Study* in the journal wizard — could have handed you the first
one's edits as though they were the plugin's defaults. Installing now copies
everything.

## [4.32.0] - 2026-08-15

**A refined surface hierarchy for diary pages and subsystems.**
- **Banner Tinting & Texture**: Grain headers (`.journal-slim-banner`) now feature subtle theme-driven accent gradient tinting combined with fine engraved diagonal hatching texture and top edge highlights.
- **Recessed Tracker Cells**: Tracker widgets (`.journal-tracker-cell`) now use the semantic recessed inset surface (`--am-surface-inset`), giving the logging grid crisp visual containment that no longer punches through to the note page ground.
- **Accent-Washed Captured Cards**: The captured log cards (`.journal-capture-card`) now sport a subtle accent background wash, crisp border, accent left spine, and refined elevation.
- **Global Surface Token Harmony**: Standardized `--am-surface-card` and `--am-surface-inset` tokens across Settings tables, notes, icon tokens, and groups for consistent depth across light and dark themes.

## [4.31.0] - 2026-08-15

**Now the whole lot at once.** 4.30 gave you one page on the clipboard. There is
now **Maintenance: export as plain markdown**, which writes every diary entry and
every journal note into one folder — `Almanac Export` by default, and you can
move it in Settings → Paths — as ordinary markdown anybody can read.

**You see the full list before a single file is written.** The same window a
vault repair uses: every file it would create, every one it would refresh, and
the line-by-line difference for anything already there. Say no and nothing
happens. Files that already match are not listed at all, so running it a second
time on an unchanged vault tells you so and stops.

**Your properties come with the note, written into the page.** This is the one
place the export differs from the clipboard copy, and it matters: a copy that
kept its properties as properties would still say `journal: Daily Notes`, and
Almanac would read it as a second Tuesday — in your calendar, your rollups and
every chart. So the properties become a short block at the top of the page
instead. Nothing is lost, everything is visible, and no copy can be mistaken for
the entry it came from.

**It only ever writes inside the export folder.** Nothing else in your vault is
touched, read back, or changed by any of it — the copies are copies, and Almanac
never reads them again.

**Entries and journal notes only.** Dashboards, the homepage and Search are
views built out of those pages rather than pages you write on, so exporting them
would just fill a folder with empty scaffolding.

Two things it deliberately does not do: it does not delete an exported copy when
you delete the note it came from, and it does not copy your images and
attachments — an exported note's `![[picture.png]]` still points into the vault.

## [4.30.0] - 2026-08-15

**Your writing can leave.** Almanac keeps what you type in two places a reader
cannot see without the plugin: the words themselves sit inside HTML comments,
which Obsidian hides, and the name of each field — *Today's focus*, *Highlights*
— lives inside a fenced block that shows up as code. Uninstall the plugin, or
open a year of entries in anything else, and a page you wrote every morning is a
stack of code blocks over nothing.

There is a new command, **Note: copy as plain markdown**. Run it on a diary
entry or a journal note and the whole page goes to your clipboard as ordinary
markdown: a heading per field, with the field's name as you see it on the page,
and your words underneath. Paste it into anything.

**It is your writing that comes out, and only that.** Task lists become real
markdown checkboxes, your lists become lists, recall cards become a question in
bold with its answer under it, and attachments are already links so they come
through as they are. Calendars, charts, tables, summaries and the like are left
out — they are views built from the rest of your vault rather than something you
wrote on this page, and a copy of them would mean nothing away from it.

**Nothing is written anywhere.** No new file, no new folder, no setting, nothing
to migrate, and no window to confirm — the command reads the page and fills your
clipboard. If you don't like what comes out, don't press it again.

**Your properties come through untouched**, exactly as they are on the page. The
date, the title, your tracker readings and any events stamped on an entry are
copied byte for byte at the top. Readings are not repeated as text further down:
they are already in the properties, and one number in two places is one number
that can end up disagreeing with itself.

If you have renamed a section — the header bar on any field is editable — the
copy uses **your** name for it, not the one Almanac shipped.

## [4.29.0] - 2026-08-15

**Your entries can decide what an entry looks like.** Until now the shape of a
daily, weekly, monthly, quarterly or yearly entry was the plugin's, with two
checkboxes in Settings to soften it. There is a new **Template…** item on every
entry's cog, next to *Edit sections…*, and it does three things.

**Save this page as the default.** Arrange an entry however you like — drag its
sections into the order you want, take out the ones you never use, point *From
the journals* at the journal you actually read — then save that page as the
default for its grain. Every new entry of that grain is built from it. Entries
you already have keep what they have.

**Keep named layouts.** Save an arrangement under a name and choose which grains
it is offered on, so a "Quiet Monday" saved from a daily entry can be reloaded
onto a weekly one too. The section editor's own *Save as layout…* button now
works on diary entries as well, so you can arrange and keep in one go.

**Reload a template onto an entry you have not written in.** Pick the grain's
default or any saved layout and the entry is rebuilt from it. **This is only
offered when the entry is genuinely empty**, and "empty" is strict: a word in
any section, a tracker you added to that one entry, a line you typed under the
rule, or a directive of your own in the widget fence all count. When something
is in the way the window says exactly what, and points you at *Edit sections…*,
which changes an entry's sections without losing anything.

Nothing about a reload touches your properties. The date, the title, and any
special events stamped on the entry are kept exactly as they are — only the body
is rebuilt — and you see the full diff and confirm before anything is written.

Saving a default finishes by opening the usual template-refresh window, so you
can see precisely what the entry templates on disk gain and lose before saying
yes. Nothing else in your vault is read or changed.

## [4.28.0] - 2026-08-15

**Every capture is its own card now.** The Captured section was one text box
holding the lot, so there was no way to cross one thought off, delete one, or
fix a typo in one without editing all of them as text. Each capture is now a
card with its timestamp, and three controls that appear when you hover it:
**cross off**, **edit**, and **delete**.

Crossing one off draws a line through it and records the date — useful if you
use the capture log the way a lot of people do, as the day's running to-do list.
Press it again to bring it back. Editing opens that one capture for typing;
Cmd/Ctrl+Enter saves it, Escape abandons it, and multi-line captures stay
multi-line.

**Your existing captures are untouched.** The region on disk keeps the exact
format it has always had — a card list is a new way of showing it, not a new way
of storing it. Open an entry, change nothing, and nothing is written. A capture
you crossed off gains a small `[done:: date]` at the end of its first line, and
that is the only addition.

**The section still folds** where it always did, and remembers it per entry
exactly as before.

## [4.27.0] - 2026-08-15

**The capture box asks where it is going.** It has always written to today's
daily entry and never said so, which meant a *Captured* section added to a
weekly or monthly entry could never be filled, and capturing while you read a
past entry quietly landed somewhere else. There is now a **Capture to** row at
the top of the box. Cmd/Ctrl+Enter still captures in one keystroke without
touching it.

It offers the entries that can actually show a capture: today always, plus any
grain you tick *Captured* for in **Settings → Almanac → Diary entries**, plus
the note you are on when it is an entry with a Captured field of its own. A
destination that would swallow the text into a note that draws nothing is not
offered at all.

**A capture can no longer be overwritten by the field it landed in.** If a
capture arrived while a Captured box was open — from another device, another
pane, or the mood-note pencil — the next edit to that box could write over it.
The text now appears in the open field as it arrives, and any write that would
have replaced it carries it along instead.

**Diary entries settings are one table.** Five stacked lists repeating the same
two rows are now a grid: a row per section, a column per grain, with *Ships*
where a grain's template already writes it and a dash where it cannot have one.

**Settings tables follow your theme.** The pills in Trackers, Journals and the
new table had their colours written in by hand, so they drew a light-mode chip
whatever theme you use.

## [4.26.0] - 2026-08-15

**Trends and statistics now matches every other heading.** 4.25 put the whole
plugin's section titles into sentence case and had to leave this one behind: it
is the heading Almanac uses to *find* your chart section, not only to show it,
and renaming it would have quietly unhooked two old repairs from the notes that
still need them. Almanac now remembers every spelling a heading has shipped
under, so the words could change without anything losing track of the section.

**Nothing on your pages changes until you say so.** Existing dashboards keep
reading "Trends and Statistics" and keep working exactly as they do — the charts
draw, the toolbar appears, the section folds. To take the new spelling, run
**Almanac: Maintenance: set up / repair vault** and tick *migrations*; you get
the usual line-by-line preview first, and declining costs you nothing but a
capital S.

**A Trends bar you renamed yourself is left alone.** If your chart section is
called "My numbers", it stays "My numbers". Almanac only rewrites headings it
wrote itself, which is why it keeps a list of its own past wording rather than
guessing from the shape of the words.

## [4.25.0] - 2026-08-15

**A section is called the same thing on every page it appears on.** "Open Tasks"
and "Open tasks" were both on screen, on adjacent pages, in the same session —
one section could carry four separate display strings and nothing compared them.
The headings written into your dashboards, the rows in the section editor and
the bar over a folded block now agree: *Open tasks*, *On this day*, *All
entries*, *Search the diary*.

Your notes keep whatever their headings currently say — nothing is rewritten
behind you. To take the new wording, run **Almanac: Maintenance: set up / repair
vault** and accept the changes it lists; each one shows you the exact line
before and after. Declining leaves everything working, and a heading you
retitled yourself is still yours.

**Trends and Statistics deliberately keeps its capitals.** It is the one heading
the plugin uses to *find* a section rather than only to display it, so renaming
it would hide your charts on every dashboard written before the rename.

**A Subject Index wore the charts icon over its open tasks.** 📊 where every
other page in the plugin uses ⏳ — in the section editor's list and in the
heading it wrote into the note.

**The search box's example filters had a date frozen in them.** The diary's hint
line read `to:2026-03` — a month in the past, written into the source rather
than read off the calendar — and the journal's *Find* box omitted `to:`
entirely, so the two boxes taught different syntaxes for the same search. Both
are now built from the search grammar itself, so neither can go stale.

**Internal:** the charts region's "No charts yet" sentence existed in two files;
it is one constant now.

## [4.24.0] - 2026-08-14

**Visual excellence: frames, depth hierarchy, and interface consolidation.**
- **Surface Elevation**: Defined a structured 3-tier surface depth system (`--am-surface-card`, `--am-surface-raised`, `--am-surface-inset`) with subtle top-edge highlights (`--am-edge-highlight`) across all callouts, cards, and section blocks.
- **Card Frames & Boundaries**: Standardized 1px borders with smooth 10px radius (`--am-radius-md`) and seamless hover transitions.
- **Modal Scaffolding**: Consolidated dialog architectures (`RepairModal`, `EditorModal`, pickers) with isolated scrollports, discrete 6px webkit scrollbars, and pinned footer action rows.
- **Accessible Focus Rings**: Modern `:focus-visible` rings for buttons, inputs, and selects.

## [4.23.0] - 2026-08-14

**Template drift detection, unified refresh parity, and upgrade safety.**
- **Unified Repair Window**: Integrated template drift into `surveyRepair()` with exact added and removed line diffs (`+N −N`).
- **Safety Parity**: Standalone template refresh commands now open the diff-based repair modal before modifying files.
- **Upgrade Detection**: Added `installedVersion` tracking to surface pending migrations upon plugin updates.

## [4.22.0] - 2026-08-14

**You can set how tall a widget is now.** A group's columns have been resizable
since 4.9 and its rows have not, so every widget in a column was exactly as tall
as its content wanted and nothing on the page could say otherwise — a table with
five empty topics still drew five rows and took the space, and *On this day*, the
widget whose whole value is showing more of itself, stayed two lines.

**Hover a group and every card draws a mark on its bottom edge**, the last one in
each column included. Drag it and the card follows, snapping to twenties; letting
go writes a `height: 240` line above the widget, which is a line you could have
typed. The card's contents scroll inside the height you chose — a card scrolls
rather than stretching, because stretching a card does not stretch what is in it.

**Drag it back past the card's own height and the line goes away.** A card that
is already the height it wants needs no number, and one left behind would go
stale the first time the widget had more in it. Escape mid-drag puts it back and
writes nothing.

**A height travels with the widget it sizes.** Drag a sized card to another
column and its `height` line goes too; remove that section in the page's section
editor and the line goes with the section. Nothing is left behind sizing the
widget that moved up into its place. Drag one out to a block of its own and it
tells you why a height cannot mean anything there, rather than leaving a line
that quietly does nothing.

The mark you drag is the one that has been drawn between stacked widgets since
4.13.1 — it was inert then because there was no way to write a height down. It is
the same mark, in the same place, doing the job it was drawn for.

## [4.21.3] - 2026-08-14

**A diary entry and a journal note said their name twice.** Obsidian draws the
note's name above the note and the banner draws it again, larger, with a rename
on it. Almanac has hidden Obsidian's copy on its dashboards since 4.5.1; the rule
only ever recognised the dashboard banner, so the two page kinds you are in most
have been showing both names ever since. Remove the banner and Obsidian's title
comes back, exactly as on a dashboard.

**Pressing Enter on an entry's title now closes the field.** It saved correctly
and left the input open — the title only appeared after you left the note and
came back.

**And the date and "Tracking:" moved above the card's hairline**, where they
belong: the rule now separates everything the page says about itself from the
grid you fill in, rather than running between the two halves of that.

## [4.21.2] - 2026-08-14

**A diary entry showed "Daily" where its date belongs.** On a daily note that
lasted until you next saved something; on a weekly, quarterly or yearly entry it
was permanent, because those three keep their date under a property the strip
never looked at. All four are fixed, and a date that genuinely cannot be read is
now left blank rather than replaced with the word for what kind of note it is.

**Clicking the title of an entry no longer shrinks it.** The field that opened
was a third smaller than the words it was editing, so the row re-wrapped under
your cursor. It is now the same size as the title, and it widens as you type.

**The date moved down to the "Tracking" row.** Your title for the day, the date
and the navigator between entries were three things on one line — fine in a wide
pane, two wrapped lines on a phone. The date now sits at the left of the caption
over the logging grid, opposite **Tracking:**, and the title line is a title and
one control.

## [4.21.1] - 2026-08-13

**There are two banners now, where there were four.** A page you land on gets the
large one; a note you write in gets the slim one. Diary entries and journal notes
were drawing two different slim banners that were meant to be identical and were
not — their strips differed by about 24 pixels and the cog sat in a different
place on each. They are one drawing now, so a change to how a note identifies
itself cannot reach one page kind without reaching the other.

**Every banner opens with the note's name.** Dashboards already did; entries and
journal notes opened with their navigation and put the name underneath. The name
leads and the row of destinations is welded beneath it, on all nine surfaces.
Nothing in your notes is rewritten to do this.

**The cog is beside the name, and on an entry it now looks it.** 4.21 moved it
there and it rendered on a line of its own underneath, because the band it moved
into was not laid out as a row.

**The title you give a day is the biggest thing on the page.** 4.21 moved it out
of the banner and set it small, which left `Day-2026-08-13` as the largest words
on a diary entry and the line saying what the day actually was reduced to a
label. Both are still where 4.21 put them; the alias is now set above the file
name, with the date beside it.

**The logging grid says "Tracking".** It was the only section in the plugin with
a card around it and no name on it.

**And the section editor stopped describing rows by what used to be in them.** A
diary entry's Banner still listed the date navigator and the tracker grid, which
left it in 4.20 and 4.21; a journal note's still listed its tracker grid, and
wore a different icon from the same section on every other page.

## [4.21.0] - 2026-08-13

**A diary entry's banner shows what the note is called.** It used to show a
`title` property from the frontmatter, falling back to a formatted date — so an
entry was the one Almanac page whose banner did not show its own file name, and
the one place renaming from the banner did not rename the file. It does now, like
every other page. **Your existing titles are not lost**: they moved down to the
tracker section, along with the prev/next date stepper, and the cog came up to
sit beside the name it acts on.

**The tracker section has a frame.** Moving the grid out of the banner in 4.20
left it as loose cards on the page with nothing around them. It is a card now,
matching the banner above it, with a strip across its top carrying what the page
knows about itself — on a diary entry the title and the date navigator, on a
journal note its level and its kind.

**A journal note now says what it is.** Its level (Subject, Topic, Lesson) and,
on a leaf, its kind were only ever written in frontmatter; two notes with
identical breadcrumbs could be a Lesson and a Practice with nothing on the page
saying which.

**And the banner stopped calling itself "Links".** Every dashboard, every entry
and the Search note drew a bar reading **🔗 LINKS** above the page's own name.
4.19.1 fixed it for the dashboards and the fix could not reach an entry, whose
banner opens with its navigation row; it is fixed for all of them now.

**The section editor reads the same on every page type.** The bands are named for
what they hold rather than where they sit, and every refusal is one sentence in
one shape. One of them read *"Trackers is part of every entry"* — every refusal
opened with the section's own name, so the first plural name to arrive broke the
sentence. They no longer repeat the name the row already shows above them.

## [4.20.0] - 2026-08-13

**A banner is now three things: the file's name, its navigation, and the cog that
edits the page.** Those three, and nothing else — which is the sentence the rest
of this release follows from.

**Your trackers are their own section.** The grid of ratings you fill in on a
diary entry or a journal note used to live inside the banner's card, and it was
there because of where the plugin needed to put some markers in 2018, not because
anybody decided the banner should hold it. It is a block of its own now, directly
under the banner and still above the rule — so you can move it, and the section
editor lists it by name. On a diary entry it cannot be removed: every chart on
every dashboard reads these cells, so a note without the grid quietly empties the
pages above it.

**The homepage's banner carries the same row as every other page** — Home, Diary,
Journals — where it used to show only the name. It overlaps two tiles of the
**Go to** grid, and that is the price: the banner means the same thing on every
page now, instead of being one thing on eight pages and something else on the
ninth. The two are not really the same object anyway — the banner's row is chrome
you read to know where you are, and Go to is content you click.

**One control on every page.** A diary entry and a journal note had the same menu
as a dashboard, opening the same section editor, behind a `⋯` instead of a cog.
It is the cog everywhere now.

**Two formats, and they are named.** A **Dashboard banner** on the homepage,
Search, the two folder notes and the four period overviews — drawn loud, because
those are pages you land on. An **Entry banner** on diary entries and journal
notes — drawn quiet, because those are pages you write in.

**Nothing in your vault is rewritten.** Entries you already have keep their
trackers where they are and go on working; the new arrangement is what a new entry
gets. An existing homepage keeps its current banner until you re-make it.

## [4.19.1] - 2026-08-13

**The banner was drawing a bar that said "Links" above your page's name.** Every
dashboard and the Search note showed it. When 4.19 welded the page's name and its
navigation row into one block, the block took its heading from the only widget in
it that had a name to give — and that was the navigation row, not the page. The
banner says the page's name now, and nothing above it.

**The banner is one material rather than two.** The accent wash and the hatch
behind the page's name used to stop at the divider, so the pills underneath sat
on a plain strip and the block read as two things stacked. They run the whole
banner now, and the divider between the name and the pills is a hairline instead
of a full rule.

**Diary entries and journal notes get the quieter banner they should have had.**
Both keep their card, and both lose a third of their height. The date on a diary
entry was being drawn at the size of a section label — smaller than the words
underneath it — and is now the same size as the name on a journal note, so the
two read as the same kind of thing. A journal note's breadcrumb trail becomes a
small-caps line above the title, matching the row of destinations a dashboard
banner draws in the same place.

**No note is rewritten by any of this.** It is all in how the blocks are drawn.

## [4.19.0] - 2026-08-13

**Every page now opens with a Banner — one block that says which note this is
and where it goes, and one row in the section editor.** Until now a page's own
name and its navigation row were two separate sections in two separate blocks,
and the section editor showed you two rows for what the page draws as one strip.
On Search the navigation row was worse than separate: it was a line inside the
search block, so it belonged to a section you could remove, and no row in the
editor described it.

**One thing is taken away, and it is the reason this is worth reading.** The
banner carries the way out of the page, so it cannot be removed. On the four
period overviews, Search and the homepage you could remove the plain title card
before this release, and you can't now. A page you cannot get home from is worse
than a page with a name you did not want, and one rule across every page beats a
rule that held on five of them.

**Your existing notes are not rewritten.** Pages made before 4.19 keep their two
blocks and render exactly as they always have. To bring them to the new shape,
run **Set up / repair vault** and tick **Run format migrations** — it shows you
every line it would move before it moves one, and moves the row rather than
rewriting it, so your own destinations survive. Ordinary repair adds nothing to
these pages and never gives one two navigation rows.

**Diary entries and journal notes are almost unchanged.** Their banner already
did this job — it is what names the note and renames it — so what changed there
is that the editor stops listing it twice. The composed entry templates come out
byte-for-byte identical to 4.18's.

**What is deliberately not in the banner:** the **Go to** grid, the diary
calendar card, and the period overview's date navigator. Those are widgets you
chose, and they stay their own sections.

**Also in this release**

- A dashboard's section list called two different things the banner — the block
  at the top, and the period summary beneath it. The summary's description no
  longer claims the word.
- A refusal on the homepage, Search and both folder notes could say *"You can
  move it, though."* about a section that cannot move. It now says which
  restriction it means.
- Fixed a fault that could have swapped two blocks' contents on a period
  overview: a page with two blocks matching one section could have the second
  written over the first when you reordered anything, with nothing in the
  preview saying so. The first block in the file is the section now, and the
  second is reported as a block Almanac does not manage.

## [4.18.2] - 2026-08-13

**Renaming something now updates it everywhere it is on screen, not just in the
tab you are reading.** Almanac blocks can be drawn outside an ordinary note tab —
by a dashboard or homepage plugin that embeds your notes, or anywhere else a note
is rendered inside another view. Until now those copies kept whatever words they
were drawn with: rename a note type from *Lessons* to *Seminars* and the heading
in your note updated while the same section, embedded in a dashboard beside it,
still said *Lessons* until something happened to redraw it.

**This includes the buttons.** The per-topic buttons Almanac writes into table
cells are the ones a rename renames, and they were the most visible half of the
disagreement.

**And *set up / repair vault* now always opens its window.** If your vault was
already up to date the command used to say so in a corner notice and open
nothing, which left you deciding whether it had run at all. This command is as
often a question — *is anything out of date?* — as it is a fix, so it now answers
in the window, where the answer was going to appear. A vault with nothing to do
gets a window saying so, naming what it looked for, and one button that closes
it. Nothing is written on that path, exactly as before.

### Fixed
- **Blocks rendered outside a markdown tab now repaint with everything else.**
  The repaint that follows a note-type or heading rename could only reach notes
  open in a markdown tab, because re-rendering the note was the only way it knew
  to redraw a block. Each rendered block now knows how to draw itself again, so
  the repaint reaches embeds, dashboards and any other host that renders a note.
- **Inline `almanac:` widgets repaint too**, including the table-cell buttons
  that a rename gives new labels.

### Changed
- **The repair window opens every time the command is run.** It previously
  stayed shut when there was nothing to do and reported that as a notice. The
  window now carries that answer itself, as an empty state that names what it
  checked for, with a single Close button — no ticks and no confirmation to
  answer, because there is nothing being proposed.
- **A block redrawn in place no longer leaves its old watchers behind.** Each
  drawing of a block owns the live widgets inside it, and the previous drawing is
  discarded before the next one starts — so a block that is redrawn many times
  keeps one set of watchers rather than accumulating a set per redraw.

## [4.18.1] - 2026-08-13

**Repair asks before it acts, and shows you the lines.** *Maintenance: set up /
repair vault* used to be one button over four different kinds of work — creating
files that were missing, updating the pages this plugin ships, catching journal
index notes up, and fixing the format of notes written by older releases. Saying
yes meant saying yes to all four. It now opens a window with the four listed
separately, a tick against each, and every file it would touch listed underneath.

**Click any file to see exactly what changes** — the actual lines it would gain
and lose, not a description of them. Untick anything you would rather it left
alone; the button tells you how many things you have left selected.

**Nothing you have written is touched, and nothing is written until you press the
button.** If your vault is already up to date, no window opens at all.

### Added
- **A repair window with four groups you can choose between.** *Create what's
  missing* only ever adds files that aren't there. *Update pages to this release*
  brings the pages this plugin ships up to date. *Catch up journal index notes*
  adds tables for note types added since a note was written. *Run format
  migrations* fixes entry banners and Trends sections written by older versions.
  All four start ticked, which is what repair already did — the difference is
  that you can now say no to one of them.
- **Every change shown as the lines it would write.** A file with something to
  show opens to a green-and-red list of added and removed lines, with a `+2 −1`
  count on the row. Very long notes say so instead of guessing.

### Changed
- **The window opens whenever there is anything to do**, including when the only
  work is creating missing files. It used to stay shut in that case and create
  them without saying which — which was fine when it was a bare confirmation, and
  isn't now that it can tell you.
- **The finishing message names what each group did** rather than lumping
  everything into one count.

## [4.18.0] - 2026-08-12

**Repair learns where a block goes.** Until now it could only add a widget that
was the *first* thing in its block — and since 4.2 put the homepage's top row
into one block, and the period dashboards keep their masthead in one, that meant
the diary card, the Go-to tiles, Open tasks, On this day and every dashboard's
summary could never be added to a page you already had. Repair didn't mention
it either: those were skipped in silence, so a page that was missing half of
itself reported nothing to do.

**Run *Maintenance: set up / repair vault* once.** It shows you everything it
intends to do and writes nothing until you accept. Only missing blocks are
added — nothing you have written, moved or arranged is touched.

### Fixed
- **Repair no longer gives an older homepage two page heads and two diary
  cards.** On any homepage made before 4.2 — one column, each widget in its own
  block — repair saw that the page was missing the line that opens the top row,
  and added the whole row: a second copy of the diary card along with it. Same
  for the page's title. If this has already happened to you, delete the
  duplicate blocks and run repair again; it will leave the page alone now.
- **Repair can add the blocks it could only skip.** The homepage's Go-to tiles,
  Open tasks and On this day, and each period dashboard's summary and period
  button, are all restorable now. They arrive as blocks of their own — you can
  drag them into the row wherever you want them, and repair will not move them
  again.
- **A retired widget hiding in a chart block is no longer reported.** Repair
  read your saved chart definitions as though they were widget names, so a chart
  whose first word happened to match one could be listed as a change that then
  never happened.

### Added
- **On this day keeps its empty state on the homepage.** 4.3.1 made a new
  vault's homepage say what that panel is waiting for instead of leaving a third
  of the row blank, and there was no way for an existing homepage to catch up.
  Repair adds it now — and leaves any number you have set beside it alone, so
  `on-this-day:5` becomes `on-this-day:5:always` rather than losing your 5.
- **Journal index notes catch up from repair.** Adding a note type has offered
  to list it on your dashboards since 3.18. Nothing else did — so a journal that
  fell behind for any other reason, or one where you declined that offer once,
  had nowhere to catch up from. Repair now finds them and offers the same thing,
  in the same window as everything else it is about to do. Index notes and their
  templates only; your own writing is never a candidate.

### Changed
- **The repair window covers both halves in one list.** Pages are listed by
  name, journal index notes by their full path — two subjects can have
  identically named index notes, and the path is what tells them apart.
- **The repair summary counts index notes it caught up**, alongside the files it
  created and the dashboards it updated.

## [4.17.0] - 2026-08-10

Two things that were only ever half-offered: a refusal you can act on, and a
place for a deleted journal's folders to go. **Nothing in your vault is moved
unless you ask for it, and there is nothing to run.**

### Added
- **Deleting a journal can put its folders in a bin.** Until now the folders and
  notes stayed exactly where they were and you tidied them up by hand. Delete
  now asks: leave them, or move them to `00 - Infrastructure/Bin/<name>-<date>/`.
  **It is a move, never a delete** — the notes are all still there, links into
  them still work, and you empty the bin yourself whenever you like. A journal
  whose folders you already removed doesn't ask the question.
- **A blocked journal name can tell you why, and offer to clear it.** If the
  folder is claimed by a journal whose own folders are no longer in your vault —
  which is what happens when you delete them in the file explorer and then try
  to make the journal again — the message says so, names that journal, and gives
  you a button to remove the leftover registration and carry on. Where the other
  journal is real and still has your notes in it, you get its name and a pointer
  to Settings, and no button: nothing unregisters a journal you're using on one
  click.

### Changed
- **The name-collision message names the journal it's talking about.** It used
  to say "another journal's folder" and tell you to pick a different name, which
  is only good advice when that other journal actually exists.

## [4.16.1] - 2026-08-10

### Fixed
- **Picking a folder for a journal level index no longer refuses it.** The
  folder box offers full paths from the top of your vault, and the widget was
  written expecting a path starting inside the journal — so choosing *italian*
  under Cooking produced *No folder "03 - Journals/Cooking/03 - Journals/Cooking/italian"
  in Cooking*, with the journal's own folder named twice. Both spellings work
  now: pick from the dropdown, or type `level-index:cooking/italian` by hand. A
  folder outside the journal you named still says so, in one sentence that names
  the journal.
- **The folder box no longer promises the wrong default.** On a level index it
  read *This note's folder*, which is not what leaving it empty does — it
  indexes the whole journal. It says so.
- **A level index that watched the wrong folder now cannot.** The widget and its
  live refresh worked out the folder separately, so the one that decided *when
  to redraw* could disagree with the one that decided *what to draw*. There is
  one answer now, and both use it.

## [4.16.0] - 2026-08-10

*What's below this note* becomes one table that answers the question when the
page is drawn instead of when the page was written. **Nothing in your vault is
rewritten and there is nothing to run** — the tables you already have go on
working exactly as they are.

### Added
- **A journal level index.** `level-index` draws what is below a note: the
  folders inside it, one row each, or — where there are no folders left — its
  notes, one table per note type. Which one you get is decided every time the
  page renders, so a Subject that gains its first Topic folder starts listing
  Topics on its own, with nothing to edit. It replaces the Topics table, which
  asked the same question but only ever of the note it sat in.
- **It can be pointed anywhere, and a page can hold several.** The sections
  editor gives it two boxes: a journal, and a folder inside that journal. Leave
  both empty and it describes the note it is on. Pick Study and it describes
  Study's top level; add `Maths` and it describes that. Two level indexes on one
  page, showing different journals, is now an ordinary thing to build.

### Fixed
- **The category titles in the *Add a section* menu no longer belong to the
  entry below them.** `WIDGETS` was drawn inside the first widget's row, so it
  highlighted when that row was selected and read as part of its name. It is its
  own line now, and when you type in the search box it follows the first entry
  that actually matched.

### Changed
- **`topics-table` is now the old spelling of `level-index`.** Every note that
  carries one goes on rendering, and the sections editor still finds the section
  — it is the same question under a better name. Newly created Subject indexes
  get the new word. The menu no longer offers the old one.

## [4.15.0] - 2026-08-10

The sections editor draws what it already knew, and a page can hold more than
one of the same widget for the first time. **Nothing in your vault is rewritten
and there is nothing to run.**

### Added
- **A journal card widget, and you can have several.** `journal-card:study`
  draws one journal as a card — the same card the Journals grid draws, from the
  same builder — so a page can put Study beside Cooking, or hold three of the
  six journals a vault has. It is the first widget Almanac lets you repeat: add
  it as many times as you like from the sections editor, and each row carries a
  dropdown naming which journal it shows. Naming a journal that no longer exists
  lists the ones that do rather than drawing an empty card.
- **The Add menu says what each section is.** Every section and widget has
  carried a one-line description for releases, written for this menu, and the
  menu was a plain dropdown that could not draw one — so twenty-eight entries
  offered a glyph and a name, and *Entry rollup*, *Entry timeline* and *Period
  recap* were three labels with nothing to tell them apart. It is now the same
  picker the *Add a section* command uses: descriptions on every entry, and
  typing `heatmap` finds Activity chart.
- **Every widget gets a frame.** Six widgets — Events, Sleep, the period
  navigator, Journals activity, Topic statistics and Quick links — drew their
  contents straight onto the page's background, with no title bar and no card,
  beside neighbours that each had one. All six now look like the rest.

### Changed
- **Section rows have an actions row.** The dropdowns, folder boxes and title
  boxes in the sections editor used to share one line with the row's title, its
  description and its buttons, so all three had been quietly shrunk to fit —
  including a question that rendered as *"Choose a journal to p"*. The controls
  now sit on a line of their own under the row, each with a label saying what
  the box is. Only the sections editor changes; every other list in Almanac is
  exactly as it was.

### Fixed
- **A card you pick from the editor is written by id, not by name**, so renaming
  a journal in Settings changes what the dropdown reads and leaves the line in
  your note working.

## [4.14.0] - 2026-08-10

The diary calendar shows you where you are. The year rail becomes a real table,
today stops being one hairline, and the twelve month tiles start reporting what
is in them. **Nothing in your vault is rewritten and there is nothing to run.**

### Added
- **Every month tile says how many days you logged.** The twelve tiles under
  *2026 entries* are the largest things on the month view and each carried one
  word, so a month with forty entries drew the same picture as a month with
  none. There is a count in the corner now and a bar along the foot, scaled
  against that month's own length — so the year reads as a shape before you read
  any of it as a number. A month with nothing in it says `—` rather than `0`.
- **The current quarter is marked, not just tinted.** A small accent tick sits
  before `Q3`, so which quarter you are in survives a theme whose accent sits
  close to its body text.
- **The quarter headers say they are doors.** Each one opens that Quarterly
  Overview and never showed it; a chevron now appears under the pointer, and
  rests visible on touch devices where there is no pointer to reveal it.

### Changed
- **The year rail is drawn as a table.** 4.13.6 made it four cells — quarter as
  header, months as content — and drew the divisions in a colour one step off
  the card behind them, which is a structure you can prove and cannot see. The
  rail now has an outer frame and its rules are drawn at the **same weight as
  the day grid below it**, which was the card's own answer all along.
- **A quarter header is now bigger than the months it heads**, instead of
  smaller and fainter. It was 11px faint text over 12.8px muted — a caption,
  not a quiet header.
- **Today is a fill as well as a ring.** It was a single accent hairline on a
  cell whose thirty neighbours each carry a hairline of their own. It now takes
  the same soft accent wash the selected month and the current week use, so the
  card's three *you are here* marks are one idea at three scales.
- **The week number beside today takes a leading edge**, so the row you are in
  and the day you are on stop being the same mark drawn twice.
- **The selected month in the rail gains an edge.** It was a fill and nothing
  else — the only control on a card made of edges without one.

### Fixed
- **The selected month tile had lost its highlight, and had for some time.** It
  was meant to be filled in your accent colour. Whenever that month also had a
  Monthly Overview note — which is most of the time, since you are usually
  looking at a month you have written in — a second rule repainted the tile dark
  and the highlight never appeared. The violet edge you could see on it was the
  mark for *today*, not for *selected*. It is drawn properly now: the accent
  wash, a ring, and a leading edge, in keeping with the rest of the card.

## [4.13.8] - 2026-08-10

The controls under a section title get room to stand clear of the line above
them. **Nothing in your vault is rewritten and there is nothing to run.**

### Fixed
- **Twice the air between a section's hairline and its controls.** With the
  buttons brought down to the strip's size in 4.13.7 they no longer crossed the
  line — but they sat two pixels under it with thirteen below, so a control with
  its own edge still read as resting on the rule.

  There are eight pixels there now. **Four was the right number for what that
  strip held when it was designed**: a right-aligned label, like the one along
  the bottom of a widget group. It holds buttons and links, and a filled control
  needs clearance from a rule that a word does not.

  **The group's own footer strip takes the same eight pixels**, because the two
  are drawn as one object and always have been.

## [4.13.7] - 2026-08-10

*Today* and the scope button stop overlapping the line above them, for the reason
4.13.6 missed. **Nothing in your vault is rewritten and there is nothing to run.**

### Fixed
- **The links under a section title are drawn at that strip's size.** *Today* and
  the scope button were half again as tall as the buttons they share a band with
  — a strip centres what it holds, so the difference was split above and below,
  and the taller controls hung about five pixels over the top of the band with
  the hairline drawn straight through them.

  It was never a spacing problem: it was one kind of control in a band being a
  different size from everything else in it. They are the band's size now. **4.13.6
  fixed a real but different fault in that same row** and did not move these,
  which is why the overlap survived it.

  The same correction has been made twice before — to that strip's buttons in
  4.11, and to the diary card's links in 4.13.2. This row is the one those two
  passes did not reach.

## [4.13.6] - 2026-08-10

Two controls stop sitting on the line above them, and the quarter rail becomes
four cells that fit a phone. **Nothing in your vault is rewritten and there is
nothing to run.**

### Fixed
- **A widget's contents no longer touch its own title bar.** The bar stretches to
  the card's edges by pulling the card's top padding out from under itself, and
  nothing put that padding back below the line — so on the *Go to* launcher the
  first tile's border sat one pixel under the header's rule, and the tile you had
  selected drew its highlight directly against it. There is now the same space
  below the bar as there is above the card's bottom edge.

- **The scope button stops overlapping the rule above it on every overview.** The
  row that carries *Today* and the scope menu lays its left-hand controls out as
  a row and its right-hand one as loose text, so the taller scope button hung
  above the line instead of making room for itself — and the hairline was drawn
  straight through it. All three slots in that row are laid out the same way now,
  so the row is as tall as the tallest thing in it.

### Changed
- **The quarter rail is four cells: the quarter over its three months.** `Q1` sat
  at the head of its row, which cost the rail two columns of width — and the rail
  is the widest fixed thing on the diary card, so it is what runs off the edge of
  a phone. Each quarter now sits above its months as a header over its content,
  which gives that width back to the months.

  **And the rail is ruled again.** It kept only the line between its two rows;
  with the quarters stacked, nothing said where Q1's months ended and Q2's began.
  There is a line between them now, and one under each quarter's name, so the
  four read as four cells. **The frame it lost in 4.13.1 does not come back** —
  what marks today, the current quarter and the month you are looking at is
  exactly what it was.

## [4.13.5] - 2026-08-10

Widgets that were drawing two and three borders around the same nothing draw one,
a card no longer stretches past its contents, and the Journals band stops saying
its own name twice. **Nothing in your vault is rewritten and there is nothing to
run.**

### Changed
- **A widget draws one edge, not three.** *Open tasks* on the homepage was a
  bordered box inside a bordered box — the same fill, the same border colour,
  sixteen pixels apart — and *On this day* was three of them nested. Nobody chose
  that: each box was correct where it was written, and nothing had ever looked at
  them stacked.

  4.13 fixed exactly this on the diary and journals dashboards and stopped there,
  on the reasoning that a widget on the homepage has no card around it to be
  doubling. It has one — every widget with a title has been a card since 4.7.2 —
  so the same rule now covers it. **An empty state with nothing around it still
  draws its box**, which is the case the box was for.

- **A card ends where its contents end.** 4.13 stretched the last card in a
  shorter column to meet the taller one beside it, to close the gap between them.
  It closed it in the wrong place: stretching the card does not stretch the month
  grid inside it, so the diary card ran the full height of the page with
  **eighty-eight pixels of empty bordered card** below its last row.

  Columns are different heights again. That was never the problem — the strip
  along the bottom of a group spans the whole width, so nothing was ever left
  hanging.

- **One colour for the Journals band's four figures.** *Active days* printed in
  your accent colour and the three numbers beside it did not, which on a new
  vault is four zeroes with one of them coloured in. The colour was marking the
  figure someone had decided led the row — the same thing 4.13.1 took off every
  button and 4.13.2 took off this band's own background.

- **The Journals band stops repeating the section's name.** It opened with
  *Journals* in large type, directly under a section bar reading **JOURNALS**.
  What names it now is the line that was already there and always said more:
  *Last 12 months · Study* — the period the numbers cover and which journals are
  in them.

  Two earlier releases deleted this same duplicated title elsewhere; this was the
  copy they did not reach. If you use the `journals-header` widget on a note of
  your own, that band now opens with the *Last 12 months* line rather than a
  heading.

## [4.13.4] - 2026-08-10

Every subject card is now the same height and scrolls, and a single-layer journal
stops repeating a create button down its grid. **Nothing in your vault is
rewritten and there is nothing to run.**

### Changed
- **Every card is one height: its title bar plus four lines.** A subject with one
  topic and a subject with nine drew boxes of visibly different heights, so a row
  of cards did not read as a row. They match now, whatever is in them, and **a
  subject with more than four topics scrolls inside its own card**.

  This replaces the cap 4.13.3 shipped, where a card showed eight topics and sent
  the rest to the subject's note. Nothing is hidden any more — the whole list is
  there, a scroll away rather than a page away.

- **A single-layer journal's cards have no create button.** A journal with no
  sub-level put a `+ New Entry` — or whatever your journal calls its notes — on
  every one of its cards, so a journal with eight of them showed the same button
  eight times.

  **The ways to make one are unchanged**: the journal's own bar still carries its
  create button, the command palette still has the action, and it is still one
  click from the note's own index.

## [4.13.3] - 2026-08-10

Your journals are cards now, the activity strip fills the space it is given, and
Capture sits at the left of the diary card. **Nothing in your vault is rewritten
and there is nothing to run.**

### Changed
- **A subject is a card.** Study's subjects, a Cooking journal's cuisines —
  whatever your journals' top level is called — are laid out as a grid of cards
  rather than stacked one under another, with as many across as the pane has room
  for. Each card carries its own topics as lines inside it: the name, when you
  last worked on it, and how many tasks are still open under it. **Topics do not
  get cards of their own** — a card per topic would have given a topic the same
  weight as a whole subject.

  **A subject card does not fold.** The journal above it still does, and closing
  that closes the whole grid. If you had subjects collapsed, they open with this
  update; nothing else about them changes, and the setting is left alone rather
  than rewritten.

  **A subject with more than eight topics shows eight**, then a link to its own
  note — which lists every one of them, with the same two numbers, because both
  pages read them from the same place.

- **The activity strip fills the width it is given.** It was 53 fixed columns
  about 660px wide, so on a full-width page it sat in the left two-thirds under a
  scrollbar, with the current month cut off the right edge. It now stretches to
  fill the card and only scrolls when the pane is genuinely too narrow to draw a
  year — which is the case it was built for. **The squares stay square.**

- **Capture moved to the left of the diary card's strip, Search stays right.**
  They do different things — one writes without leaving the page, the other takes
  you somewhere — and pushed together at one end you had to read them to tell
  which was which.

## [4.13.2] - 2026-08-10

Three buttons come off the diary card, the Journals banner gives up its colour,
and a subject's topics become a table that says when you last worked on each one.
**Nothing in your vault is rewritten and there is nothing to run.**

### Changed
- **The diary card keeps two of its five controls.** The strip across the top
  read *Start today · Yesterday · Capture · All entries · Search*, sitting on a
  card whose entire body is a month grid — and three of those five went somewhere
  the grid already goes. **Today is the ringed cell and yesterday is the one
  before it**; both open on a click and both tell you the date while doing it.
  *All entries* is the diary folder, which the bar at the top of the page links.

  What is left is **Capture**, which writes a thought without taking you off the
  page, and **Search**, which reaches notes no calendar can point at.

- **A subject's topics are a table now.** A topic was an emoji and a name — the
  same thing the folder tree in the sidebar tells you, and nothing more. Each one
  is a row carrying two things: **when a note under it was last dated** (*Today*,
  *3d ago*, *2w ago*) and **how many open tasks are left in it**.

  They are the same two figures a subject's own dashboard has shown per topic
  since 2.39, read the same way, so the two pages cannot disagree about a topic.
  Columns line up down the list and collapse to a plain stack in a narrow pane.

- **The counts are gone from the journal and subject rows.** A journal said "1
  subject" directly above its one subject, and a subject said "1 topic" directly
  above its one topic. A number that counts rows already on screen is not telling
  you anything; the table's two are about things that are not.

- **The Journals banner has no tint.** It carried a wash of your accent colour —
  the last one in the plugin, kept when the diary card's went in 4.13.1 only
  because nobody had looked at this page yet. Its four numbers also stop sitting
  in a bordered box with lines between them and become a plain band under a
  hairline. The numbers, the activity strip and everything they say are
  unchanged.

### Fixed
- **A collapsed journal no longer shows its buttons.** 4.13.1 made a folded
  section fold its controls away with it; the Journals card folds by its own
  mechanism and was missed, so a closed journal still showed *+ Subject* and
  *+ Topic* under its title. It closes properly now.

## [4.13.1] - 2026-08-10

The buttons are smaller, squarer and grey, a folded section now folds its buttons
away with it, and the diary card has given up its greeting band — including the
four numbers in it. **Nothing in your vault is rewritten and there is nothing to
run.**

### Changed
- **Every button is drawn one way.** Some were filled with your accent colour and
  most were not, so *Open today* and *Add chart* sat on the page as coloured
  capsules while *Edit…* and *Remove…* beside them were quiet grey outlines. The
  colour was never saying anything you could act on — it marked the button
  someone had decided was the important one in that section.

  They are all the quiet one now, and slimmer and less rounded with it: a
  control's corner rather than a card's, and one step less padding. **A section's
  main action is still the one that keeps its words** when the pane gets narrow
  and the others shrink to their icons, which is the part of "primary" that was
  doing work.

  Your study subject cards already looked like this — they had their own rule
  turning the accent off, because "repeated on every topic row that accent
  becomes noise". That is now simply how a button looks, and the exception is
  gone.

- **A collapsed section hides its buttons.** Fold a section and its title bar
  stayed, which is right, but the strip of controls under the title stayed too —
  so a closed section was a title, a line, and a button, and read as though it
  had not closed at all. The strip goes with the body now and comes back when you
  open it. Sections whose buttons sit *beside* the title rather than under it —
  the per-subject rows on a Study index — are unchanged.

- **The diary card lost its greeting band, and its numbers with it.** The card
  opened with a tinted panel carrying the date, *Good morning*, whether today's
  entry was started, and a strip of four figures: entries this month, your
  streak, open tasks and your 7-day mood. **All of that is gone.**

  What replaces it is a slim row of the same controls — *Open today* (or *Start
  today*), *Yesterday*, *Capture*, *All Entries*, *Search* — across the top of
  the card. **Nothing you could click has been taken away**; the greeting, the
  status line and the four numbers have. If you want the numbers, the diary's
  own dashboards carry them where they can say what period they counted.

  The reason is the card sitting directly below it. *This month* is the same kind
  of thing — a heading, a rule, a month grid — drawn with no tint at all, and the
  two were plainly two different designs on one screen.

- **And the rest of that card came down to match it.** The navigator behind the
  year and the quarter rail no longer sits in a sunk panel, the rail has lost its
  box and the lines between its quarters, the `Q` labels and the week numbers
  down the left are no longer little filled chips, and the *Coming up* strip at
  the foot is on the card's own background. **The marks that tell you where you
  are all stay**: today's ring, the highlighted month, the current week.

- **A group of widgets shows where its parts divide.** Dragging the line between
  two columns has set their widths since 4.9, and a column holding several
  widgets stacked up had nothing between them. Hovering the group now shows the
  same small line between each pair. **It is a seam, not a handle** — there is
  nothing to drag there, and clicking it does nothing.

## [4.13.0] - 2026-08-10

Every section title on every page is now the same object, the fold arrow moved to
the right-hand end of the bar it belongs to, and a page with nothing on it stops
drawing four kinds of "nothing here yet". **Nothing in your vault is rewritten and
there is nothing to run.**

### Changed
- **One kind of section title, everywhere.** The same widget was titled two
  different ways depending on which page it sat on: *Open tasks* was small
  uppercase on the homepage and half again as large, in mixed case, on the diary
  and journals dashboards — from one name in one table. Nobody chose that; it
  followed from how each page happens to be written.

  There is one now, and it is the smaller of the two: the size the homepage
  already used. A title, its count and its buttons all read at one size, so a
  section bar is one band rather than a heading with things stuck to it. **Nested
  subject rows came down with it** — they used to be *larger* than the section
  containing them once the outer one shrank, and they are told apart by their
  indent and their left edge, which is what was doing that work anyway.

  **Your section names are not changed**, only how they are drawn. Click one to
  rename it and the field shows exactly what is in your note.

- **The fold arrow sits at the right-hand end of the bar.** It used to open the
  line, ahead of the section's own emoji and name. It now closes it, past the
  buttons where there are any, because folding acts on the whole section and a
  button acts on something inside it. It points **down when the section is closed
  and up when it is open**, which is the way round every other collapsing thing
  works — and the three places Almanac draws one now agree, where two of them used
  to disagree on the same screen.

- **A section's emoji sits in a fixed slot on every page.** On the homepage the
  emoji was part of the title text, so five titles started their words at five
  different positions. They line up now.

- **One appearance for "there's nothing here yet".** A single page could show four:
  a bordered box with a coloured heading, a bare line with a small tick, another
  bordered box, and a third with centred grey text. Inside a section, none of them
  draws its own border any more — the section is already a card, and a box inside a
  box was the plugin saying the same thing twice. Outside one, the box stays.

  **And the heading is Almanac's colour now.** It had never set one, so it took
  whatever your theme happened to paint an unrecognised callout — which is why one
  of these was blue and the one beside it violet, and why it could have been a
  third colour on a different theme.

- **A collapsed section is the height of its own bar.** It reserved the gap that
  sits under a section's last widget even when there was no widget to sit under —
  about ten pixels of empty surface per closed section, on every page of them.

- **A two-column row reads as two columns.** The shorter side stopped early and
  left a band of nothing above the row's foot; it fills now.

### Fixed
- **Renaming a section no longer resizes the bar under your cursor.** The field
  opened at the old, larger size, so clicking a title made the whole row jump.

## [4.12.0] - 2026-08-09

Every widget Almanac can draw is now something you can add from the section
window, a group stops accepting things it cannot lay out, and two ways of losing
work are closed. **Nothing in your vault is rewritten and there is nothing to
run.**

### Added
- **Add a widget to a page.** *Edit this note's sections…* now lists twenty-five
  widgets under **Widgets** in its *Add a section…* menu, on the homepage, Search
  and the diary and journals folder notes. Until now a page could only carry the
  handful of sections its own catalogue knew about; everything else — the events
  manager, the entry timeline, the activity chart, the journals activity strip —
  existed only if you knew the word and typed the fence yourself.

  **A widget you add is a section like any other.** It arrives in a block of its
  own at the end of the note, and from there it moves with the arrows, joins a
  group, takes a folder or a choice where the widget has one, and can be removed
  again — leaving the file exactly as it was before you added it. Change a
  widget's folder later and only that one line changes.

  **A widget the page already writes is not offered twice.** The diary dashboard
  does not offer *Open tasks*, because it composes one. And where you have written
  a second copy of a widget by hand, Almanac manages the first and leaves yours
  alone, reporting it as a block that is not the catalogue's.

  A few widgets are deliberately not on the list: the ones bound to a single
  property in a note's frontmatter, the ones that own a named region of the note
  body (two of those would share the region and overwrite each other), the two
  banners that say what a note *is*, and the few whose argument names one of your
  own trackers or note types — the window has no list of those to offer you yet.
  All of them still work written by hand.

- **A widget fence you wrote yourself is no longer "a block that isn't the
  catalogue's".** It shows up in the section window under its own name, and can be
  moved and removed from there.

### Fixed
- **"Make a group" on two blocks that were not already a group did nothing
  visible.** The two sections were joined into one block in the file — but without
  the `row` line that makes a block draw as columns, so the page stacked them and
  the change read as the button not working. Joining into a group that already
  existed always worked, which is why this went unnoticed.

- **A widget written twice on one page could lose the first copy's content.** If
  the same widget appeared in two blocks — an `events` list and an
  `events:upcoming` list, say — both blocks answered to the same section, and
  reordering anything on that page could write the second block's content over the
  first's. Almanac now manages the first block holding a given widget and leaves
  any others exactly as you wrote them.

- **The Diary card on the homepage claimed a diary-search block.** Its name
  matched any directive beginning with the word, so a search block added by hand
  was treated as the card itself.

### Changed
- **A section is not a widget, and only widgets become columns.** A block that
  draws its own title bar — a header bar, or `frame: section` — can be reordered
  as it always could, and is no longer offered as one side of a group in either
  direction: you cannot drag it into a column, and nothing can be dropped beside
  it to make one.

  **It never worked, and it looked like it did.** A group's columns each carry
  their own head, and a title bar belongs to the whole block rather than to one
  cell of it — so a titled section pulled into a group drew its title *underneath*
  the group it was meant to name, with the neighbouring column's bar appearing to
  title everything, and the fold that bar controls swallowing the lot. A
  `frame: section` block came out worse: it lost its bar, its title and its fold
  in one move.

  On the page you meet this as a landing place that simply never lights up, so the
  drag is declined before you have committed to it. In the section window,
  **Make a group** is drawn and disabled with the reason in its tooltip.

- **Two buttons that were greyed out for no stated reason now say why.**
  **Break up the group** and **Make a group** both explain what would need to
  change.

- **The widget reference has caught up with the plugin.** Seven widgets that had
  been shipping undocumented now have entries, and a widget that was documented
  but has not existed since 3.11 no longer does.

## [4.11.0] - 2026-08-09

The page's own name stays where it belongs, any dashboard can take the
homepage's width, and a page of widgets stops drawing three kinds of box and two
kinds of bar. **Nothing in your vault is rewritten and there is nothing to run** —
the one thing that writes to a note is the new toggle, and only when you use it.

### Added
- **Wide page, on every dashboard's cog.** Almanac's pages are 1100px wide when
  they ask to be — two full-size columns and the gap between them — because a
  row splits the pane and Obsidian's *readable line length* would otherwise
  decide, at its 700px default, that every widget on the page renders in its
  narrow layout.

  **The homepage has had that since 4.2 and nothing else could ask for it**, because
  it said so in frontmatter, which a rendered page cannot write and which repair
  deliberately never edits. The cog now writes a `wide` line into the block that
  draws the page's title, and unticking **Wide page** takes it out again. Nothing
  else in the note changes either way.

  **The line is in your note, so you can see it, copy it and delete it.** A `wide`
  line anywhere else is refused in that block, naming the way out: a page has one
  width, and a width that depended on which block you typed it in would be a
  setting you could not find.

### Changed
- **The page title cannot be moved.** It could be dragged under the charts,
  arrowed down the section list, and pulled into a group by the row beneath it —
  on the homepage, Search and both folder notes. The four period dashboards
  already had this right. Now every page does: the section window shows the head
  as **fixed**, with no grip and both arrows greyed, and on the page it draws no
  grip and accepts nothing dropped above it or beside it.

  **It can still be removed.** Those are two different questions, and the head is
  the section that separates them — a page with no title card is a coherent thing
  to want, since the note's name is in the tab, the file explorer and the window.
  Untick it and add it back and the file comes out exactly as it was.

- **An info card is a card.** One homepage showed three widgets with nothing to
  show and three appearances: *No notes here yet* as bare text at the panel's
  edge, *Nothing on this day yet* in a box, and *📚 No journals enabled* in a
  different box drawn a pixel thinner than every card around it. There is one box
  now, and it is the widget frame's — because an empty state stands in for a
  widget, so it should read as one with nothing in it rather than as a sentence
  left on the page.

  A one-line note *inside* a widget that did draw itself is unchanged. That was
  never the same thing and is still not.

- **A section's controls sit on a strip under its title.** *📊 Trends and
  Statistics* used to be a visibly different kind of bar from the slim head every
  widget block wears, with its button crowded onto the title's line. The title
  line now carries what names and numbers the section — the glyph, the count, the
  note — and everything that acts sits below it on the same strip a group of
  widgets already uses along its bottom edge: a hairline, right-aligned, at the
  small scale.

  **Stated plainly: a section with a control is not shorter than it was.** Moving
  the buttons costs a line and slimming the bar buys back less than that. What it
  buys is that a page reads as one kind of object instead of two.

  Nested sections — a subject on a Study index, one of twenty on a page — keep
  their buttons beside their titles. Twenty strips is the opposite of what this is
  for.

- **The homepage no longer has frontmatter.** Its width is a line in the note now,
  which is what makes the cog's toggle truthful on every page. A homepage you
  already have keeps its `cssclasses` key and keeps working; while that key is
  there, the toggle cannot narrow the page — delete it and the toggle takes over.

### Fixed
- **The page title can be removed from a weekly, monthly, quarterly or yearly
  overview.** It was described as removable in 4.10, offered as removable, and
  refused — the refusal that fixes navigation to the top row of a dashboard was
  answering the wrong question about the one pinned section that is not also
  locked.

## [4.10.0] - 2026-08-09

Every Almanac dashboard now opens with its own name, the places it can go, and
the control that edits it. Your existing pages are updated in place the next time
repair runs; nothing you wrote is touched.

### Added
- **A page head on every dashboard.** Search, the diary and journals folder
  notes, and the weekly, monthly, quarterly and yearly overviews each open with
  a card carrying the page's name, a row of destinations — **Home**, **Diary**,
  **Journals** — and the cog that opens **Edit sections…**.

  **The cog is the point.** It has existed since 4.5 and was drawn on the
  homepage only, so on every other Almanac page the section editor was reachable
  only through the command palette. It now sits where the page is.

  The head is drawn as the page rather than as another card: the name is set in
  a book face on a faintly hatched ground, which is the one place in Almanac
  that is not the interface's own typeface. It keeps the same border and corner
  radius as everything else, so it belongs without being one more thing to read.

- **Obsidian's own title is hidden on those pages too.** It already was on the
  homepage; the rule follows the head, so six more pages stop saying their name
  twice. Remove the head and Obsidian's title comes straight back.

### Changed
- **`title` takes a list of destinations.** `title:home,diary,journals` draws
  them under the name, using the same ids the `links:` row accepts. A plain
  `title` draws the name and the cog and nothing else, which is what the
  homepage uses — its **Go to** grid is already that row.

- **The navigation row on those pages dropped its Home pill**, because the head
  above it carries one and two pills to the same page is one too many. Today and
  the overview switcher are untouched, and the change is applied to pages you
  already have.

- **The page name on a folder note is the folder's name.** The diary and
  journals dashboards are folder notes, so a default vault reads **02 - Diary**
  and **03 - Journals** there. Clicking the name renames the folder as well as
  the note — which is what a folder note is, and what renaming a journal index
  has always done. To change how it reads, rename the folder in
  **Settings → Almanac → Paths**.

### Fixed
- **Removing a section from the top of a page and adding it back leaves the file
  exactly as it was.** It used to leave one extra blank line. Nothing before now
  could reach it, because the top section of every page was one you could not
  remove.

### Note
- **Diary entries and journal notes are unchanged.** Their banner already shows
  the note's name and renames it, so a head above it would say the name twice.
  They still have no cog — the section editor reaches them through the command
  palette, as before.

## [4.9.0] - 2026-08-09

Widgets side by side are now a thing you can see, resize and make. Nothing in
your vault is rewritten and there is nothing to run.

### Added
- **A row of widgets is drawn as a group.** Until now two widgets side by side
  were two cards floating next to each other with nothing saying they were one
  object. They now sit in a box of their own, with a slim strip along the bottom
  saying how many columns there are and carrying the grip that moves the whole
  group. The box is deliberately quieter than the cards inside it, and it is not
  drawn at all where the block is already inside a section or has been told
  `frame: none` — there the surface belongs to something else.

- **Drag the edge between two columns to set how wide they are.** Point at a
  group and a divider appears between its columns; drag it and the columns
  follow, snapping to whole shares — two-thirds / one-third, three-quarters /
  one-quarter and so on. Letting go writes it into the note. Dragging back to
  even takes it away again, and Escape during the drag puts everything back and
  writes nothing.

  **You are only offered ratios your window can hold.** A wider column asks for
  more room, so a group that has been widened wraps to a stack sooner than an
  even one — the divider will not snap to a ratio that would collapse the group
  while you are dragging it. Writing a width by hand still does whatever you ask.

  This is what `cell: 2` has always meant. It has been possible to type since
  4.4 and there was no other way to ask for it.

- **Make a group by dragging one section onto another.** A block that is not
  already a group now has a landing place on its left and right quarter: drop a
  section there and the two become one group, side by side. That is the first
  way to make one without opening the section editor. The quarters are only
  drawn where the block is wide enough to hold two columns, and a block holding
  two widgets is not offered them — which column they would go in is a question
  only the editor can ask.

### Changed
- **"Row" is called a group everywhere you can see it.** The section editor's
  card is headed *Group — N columns*; its buttons are now **Take out of the
  group**, **Break up the group**, and **Make a group** / **Add to group**
  depending on whether there is already one above. The `row` line in a note is
  unchanged — that is how a group is written, and notes you have already written
  keep working exactly as they did.

- **A group's grip moved to the strip along its bottom.** It used to be shoved
  to the left of the block's top edge to keep it clear of the widgets' own
  grips. The strip is the group's own edge, so there is nothing there for it to
  collide with.

## [4.8.0] - 2026-08-09

Rows became something you can rearrange, and the page got quieter. Nothing in
your vault is rewritten and there is nothing to run.

### Added
- **A widget can join a column instead of always opening a new one.** A cell has
  been able to hold more than one widget since 4.4, and until now every arrival
  opened a column of its own. Every widget in a row now offers five places, and
  the rule is one sentence: **its edges are the row, its middle is the widget.**
  The left and right edges give a column of its own before or after that cell;
  the top and bottom put it in the same column, above or below; and the middle
  **trades the two widgets over**. A swap is symmetric, so landing on it by
  accident is undone by doing it again.

- **Drag a widget in and out of a row.** Every widget in a row has its own grip —
  in its own head, or over its top edge where it draws a band of its own. Picking
  one up draws the places it can land: a strip between two columns and at each
  end of the row, and a strip above and below every block on the page. Between
  two columns reorders the row. Above or below a block takes the widget *out* of
  the row, into a block of its own across the page. The strips are drawn only
  while something is in the air.

  **A block holding a single widget has a grip too**, and it can do exactly one
  thing: drop into a row's column. That is how a widget gets into a row by hand.
  It cannot be dropped above or below another block — that would be reordering
  blocks by dragging them, which is what this release took away.

- **Rows in the section editor.** A block holding more than one section is drawn
  as a card around its members, so a row on the page is one thing in the list
  too. Each member gains **Take out** — a block of its own, directly below — and
  the card has **Break up**, which does that for all of them. A section under a
  block can **Join above** to become part of it, which is how a widget gets *into*
  a row. The Layout tab draws a row's members side by side.

  Nothing is written until Save. Each regrouping is named in Changes first, and a
  section whose lines cannot be told apart from its neighbours' is not offered a
  split rather than being offered one that quietly does nothing.

- **The launcher has a name and a surface**, and lays its tiles out four across,
  two by two, or one column — never three with one underneath.

### Changed
- **Dragging a block puts it in a place, rather than swapping it with another.**
  Every block has a grip. Drop it on the top half of another block to sit above
  that one, or the bottom half to sit below it — the same sentence every other
  drop in this release makes. Trading two blocks was symmetric and could not say
  "put this one at the top", which is most of what rearranging a page is.

  **A block holding one widget can also be dropped into a row**, as a column. One
  holding two cannot: which column they would go in is a question only the
  section editor can ask.

- **The tinted DIARY / JOURNALS bar is gone** from the period dashboards, the
  diary entries, and the homepage's Diary and Journals cards. It named the folder
  a card covered; the block's own head above it names the thing, which is the
  same sentence said better. The breadcrumb trail it carried goes with it.

- **A grip appears where your pointer is**, rather than every grip in a row
  lighting at once.

### Fixed
- **A section with no widgets, or with two, can be dragged again.** A block that
  cannot become a column of a row carries only one of the two drag types, and the
  condition that opens a page's landing places was only ever widened for the
  other. Dragging such a block offered nowhere to drop it — most visibly the
  homepage's Trends section, whose block holds a title line and no charts.
- **The drag no longer stutters.** Each block worked out its own position in the
  note on every movement of the pointer; it does so once per drag now.
- **A block can be dropped only where it would actually go.** The place a block
  is already in — just above itself, just below the one before it — no longer
  lights up or accepts the drop. It used to accept it and write nothing, which
  on the homepage made the last section look as though it refused to move: the
  nearest target above it means "where you already are".
- **The drag grip no longer appears twice.** Two different faults with one look:
  a block re-rendered after a drop could arrive already wearing a grip, and on a
  row of three the block's own grip sat at exactly the same spot as the middle
  widget's. A grip is drawn once, and a row block's own moves to the left, clear
  of the widgets inside it.
- **Dragging works outside the homepage's row.** A row block was drawing two
  kinds of landing place on top of each other, and the wrong one was winning
  every drop: dropping inside the row always took the widget *out* of it, and a
  widget being carried *into* the row could not land anywhere at all. A block now
  draws one kind — a row is all columns, everything else is all places — so a
  widget leaves a row by being dropped on another block, and joins one by being
  dropped on a column.
- **The drag targets are targets.** The place a widget would land was drawn the
  same size as the mark showing it — an 18px strip half outside the block, and
  18px columns sitting in a 10px gap — so the gesture was very nearly unusable.
  Every point of a block is now a landing place: its top half puts the widget
  above it, its bottom half below it, and inside a row each half-column places it
  in that column. The 3px bar still shows exactly where.
- **Sections under a section header have their grips back.** The grip used to sit
  inside the block's head, which is hidden on a block inside a section run and on
  an unframed one — so it went with it. A grip is now positioned against the
  thing it drags and nothing else.
- **The diary and journals cards have their grips back.** Removing the tinted bar
  above them exposed their own header bands, and a widget that draws its own band
  was getting no grip at all — it had only ever had one because the tinted bar was
  in the way of the rule.
- **No grip is drawn where it could not do anything.** The grip on a full-width
  block can only put that block into a row, so on a page with no row it is not
  drawn at all rather than being an affordance for nothing.

- **A row's dividers keep saying what they said.** A move adds exactly one `cell`
  line and only to a row that already divides itself, removes one left opening
  nothing, and drops the `row` line from a block left holding a single widget.

## [4.7.2] - 2026-08-09

Blocks and the widgets in them say what they are. Nothing in your vault is
rewritten and there is nothing to run.

### Added
- **A head on every block Almanac can name.** A slim bar across the top of the
  block carrying the widget's name — the same names the section editor uses, so
  a block titled **📚 Journals** there is titled that here. The drag grip lives
  in that bar now, as a small patch of dots in the middle rather than a strip
  across the whole block.

  **The block draws a card under it**, the same card the diary entry banner and
  the study banner draw, and the widget's own card inside gives its box up — one
  card, not a card in a card.

- **Every widget in a `row` gets its own card and name.** A column holding your
  launcher, open tasks and this day in earlier years is now three cards, each
  headed. A widget that already draws a bar of its own — the diary card says
  **DIARY** across its top — keeps it and gets no second one.

### Changed
- **A head with nothing to say is not drawn.** A block whose top is already a
  header bar, a block no single name covers, a block inside a section, and a
  block whose frame is `none` or `section` all keep the grip and skip the bar. A
  row itself is no longer named either: the widgets inside it carry the names.

## [4.7.1] - 2026-08-09

The drag grip, fixed and quieter. Nothing in your vault is rewritten and there is
nothing to run.

### Fixed
- **The grip is back in reading mode.** On a section it was drawing at the top of
  the note instead of on the block, so hovering a section showed no grip at all.
  It was correct in editing mode, which is why it looked like a reading-mode
  problem rather than a broken rule.

### Changed
- **One grip, and it is a quiet one.** A row of dots across the top edge of the
  block, on hover, with no box around it. It no longer takes a strip of its own,
  so nothing on the page is any taller for having a grip — a section in
  particular is exactly the height it was before.

## [4.7.0] - 2026-08-09

Blocks can be dragged into a different order on the page, by hand, while you are
reading it. Nothing in your vault is rewritten and there is nothing to run.

### Added
- **Drag a block to move it.** Hover a block and a grip appears as a strip across
  the top of it; pick it up, drop it on another block, and the two trade places.
  The note is rewritten to match — the same writer the section editor has always
  used, so everything it does not touch comes back as the exact lines it was read
  as, including anything of your own sitting between two Almanac blocks.

  **A whole block moves, with everything in it.** A row goes with its columns and
  each column with its widgets. That is the rule the section editor already
  states — a section sharing a block with another cannot be taken out of it — so
  a drag adds a way to arrange a page and no new rules about what may be
  arranged.

  **To undo a move, drag it back.** Two blocks trading places is undone by
  trading them again, which is why nothing pops up to offer it.

  **Reading mode only, which is how Almanac's pages now open.** In editing mode
  you are looking at the text itself, where the blocks can be moved by cutting
  and pasting them.

  **No grip where the move cannot be made.** A block rendered inside another note
  — an embed, an export, a preview — cannot be located in the file it came from,
  so it gets no grip rather than one that fails.
- **The section editor is unchanged and is still the complete interface.**
  Dragging is the quick way to reorder. Adding a section, removing one and
  changing what one does are still its job, and it can still reorder too.

## [4.6.0] - 2026-08-08

Almanac's own pages open in reading mode. Nothing in your vault is rewritten and
there is nothing to run — this applies to the notes you already have, not only to
new ones.

### Changed
- **An Almanac page opens in reading mode rather than editing mode.** The
  homepage, Search, the diary and journals dashboards, the four period
  dashboards, every journal note and every diary entry. These are pages of
  widgets: in editing mode they also show the Properties block, and clicking
  near a block puts a cursor in the raw directive behind it. Nothing is lost by
  reading them — the section editor, the cog on the title card, click-to-rename,
  and every button, tracker and field work exactly the same in reading view.

  **Ctrl+E still wins.** Switching an open note to editing mode is never undone;
  Almanac only acts when a note is *opened*. Switching tabs away and back counts
  as opening it again, so it returns to reading mode.

  **To stop it for one note**, add `obsidianUIMode: source` to that note's
  properties — an entry template, say, if you write prose straight into your
  entries and would rather not press Ctrl+E first. The same key works the other
  way round on any note at all (`obsidianUIMode: preview`), and it is the key the
  **Force note view mode** community plugin reads, so a vault already using that
  plugin needs nothing from this one.

  There is no setting for this. The decision lives in the note, where you can
  see it and delete it.

## [4.5.0] - 2026-08-08

Two new blocks: the page's own name as a card you can rename from, and a grid of
tiles for the places you go most. Both are on a new homepage; nothing in your
vault is rewritten and there is nothing to run.

### Added
- **A title card.** `title` draws the note's own name, large, with a cog at the
  far edge of the block. **Click the name to rename the note** — it renames the
  file, so every link pointing at it follows. The cog opens **Edit sections…**
  and **Add a section…**, the same two the ⋯ on a journal note offers. On a note
  whose sections Almanac has nothing to say about, you get the name and no cog
  rather than a menu that opens and then apologises.

  **Obsidian's own title above the note is hidden while this block is there**, so
  the name is said once instead of twice. It follows the block rather than a
  setting: delete the `title` line and Obsidian's title comes straight back.
- **A launcher.** `launcher` draws a grid of tiles for the places you go — the
  diary, search, the journals dashboard, and quick capture. Name your own to
  choose which: `launcher:today,week,search`. It shares its destinations with the
  `links:` row, so anything that row accepts this one does too, and three more
  are new to both: `diary`, `journals` and `capture`.

  **A tile that goes nowhere is not drawn.** No journals in the vault, no
  Journals tile — rather than one that opens nothing. If none of them resolve at
  all, the block says so and names what to run. An id it does not recognise
  costs only its own tile.

### Changed
- **A new homepage opens with its own name**, and its right-hand column starts
  with the launcher, above your open tasks and this date in previous years.
- **Your existing homepage keeps the layout you have.** Almanac writes that note
  only when it is missing. To take the new one: delete the note and run
  **Maintenance: set up / repair vault** — anything you added to it is deleted
  with it, so move that somewhere first. Or just add the two lines by hand:
  `title` in a block of its own at the top, and `launcher` wherever you want it.

## [4.4.0] - 2026-08-08

Columns of a row can hold more than one widget, and the homepage uses it: its
top row is now two halves rather than three thirds. Nothing in your vault is
rewritten and there is nothing to run.

### Added
- **`cell` — two widgets in one column.** A row gives each directive a column of
  its own; a `cell` line starts the next column, so the directives between two
  `cell` lines share one and stack inside it:

  ````
  ```almanac
  row
  diary:3
  cell
  tasks-table
  on-this-day:always
  ```
  ````

  That is two columns, not three. Widgets stacked in a column are spaced exactly
  as they would be in a block of their own, and a row with no `cell` line renders
  exactly as it did before this existed.
- **Two more lines that are refused rather than ignored.** `cell` in a block with
  no `row` divides nothing, and says so. `cell: 2` — the natural way to ask for a
  wider column — is refused too: every column of a row is an equal share for now,
  and refusing keeps the spelling free for when uneven columns are built.

### Changed
- **The homepage's top row is two columns.** The diary card on the left; your
  open tasks and this date in previous years stacked on the right. It was three
  equal thirds, which gave the busiest widget on the page — a greeting, this
  month's numbers, the month grid and what is coming up — the same width as a
  list that is empty on a new vault.
- **Removing a widget that shares a column** takes just that widget and leaves
  the column, the row and everything beside it. Emptying a column keeps its
  `cell` line, which marks where the column was and draws nothing; a widget
  written after it goes back there.
- **Your existing homepage keeps the layout you have.** Almanac writes that note
  only when it is missing. To take the new one: delete the note and run
  **Maintenance: set up / repair vault** — anything you added to it is deleted
  with it, so move that somewhere first.

## [4.3.1] - 2026-08-08

Two faults in the homepage 4.3.0 introduced, both found by looking at the page
rather than at the code. No new features. Your notes are untouched, and the
first fix repaints on its own — but see the second, which has one line you may
want to change by hand.

### Fixed
- **A row squeezed its widgets until they broke instead of wrapping.** Three
  widgets side by side in a half-width pane left each of them about 225 pixels,
  and at that width the diary calendar's quarter rail drew its month names on
  top of each other — `JaFeMar` where `Jan Feb Mar` should be. The row was
  watching the width of the whole block and waiting for it to drop below a
  phone's, which a block holding three widgets never does. Cells now claim a
  minimum width and wrap when they cannot all have it: three across on a wide
  window, two and one on a half-width pane, a single column on a phone. This
  repaints itself — there is nothing to run.
- **The third cell of the homepage's top row was blank on a new vault.** *This
  date in previous years* draws nothing at all until your diary is a year old,
  which cost nothing when it was a block in a column and costs a third of the
  row now that it is a cell. A new homepage writes `on-this-day:always`, so the
  cell says what will appear there and when, exactly as the same widget does on
  the Search note.

  **If your homepage was created by 4.3.0**, it still carries the older line and
  will still show a blank cell until you have a year of entries. Nothing will
  rewrite it for you. To fix it, open the note and add `:always` to the
  `on-this-day` line inside the top block, so it reads `on-this-day:always`.

## [4.3.0] - 2026-08-08

The homepage is laid out in rows. 4.2.0 added the `row` line; this is the first
page that uses it, so a new vault's homepage opens with three things side by
side instead of stacked. **A homepage you already have is not changed** — see
below for the one way to take the new layout if you want it.

### Changed
- **A new homepage is three rows.** Across the top: the diary card, your open
  tasks, and this date in previous years. Then the journals card. Then the
  vault's charts. Narrow the pane — a sidebar, a split, a phone — and the top
  row becomes a column again, with each widget in its own compact layout.
- **Open tasks is on the homepage now.** The widget is not new; it ships on the
  period dashboards and on every journal index. There was no room for it while
  the page was a single column, where it would have been a fourth full-width
  block on a note meant to be glanced at. Beside the diary card it costs no
  scrolling. It counts the whole vault, and it says so.
- **This date in previous years is back.** It was taken off the homepage in
  3.13 for being the one block there about the past, on the page that is about
  now — and that argument was about a block that took the full width of the
  page. A third of a row is not that. It still shows nothing at all until you
  have a year of entries, so a new vault sees an empty cell rather than a
  heading with nothing under it.
- **Your existing homepage keeps the layout you have.** Almanac writes that note
  only when it is missing, so nothing is rearranged under you. To take the new
  one: delete the note and run **Maintenance: set up / repair vault**. Anything
  you had added to it is deleted with it, so move it somewhere first.

### Fixed
- **Unticking one widget of a row now removes it**, instead of explaining that
  it cannot. 4.2.0 refused this rather than risk cutting the wrong lines out of
  a block, which was right for a block whose widgets each span several lines and
  needlessly strict for the ordinary case: a widget written on one line occupies
  that line, so removing it takes that line and nothing else. The row and the
  widgets beside it are left exactly as they were. A section that spans more
  than one line — a titled block, say — is still refused, and still says why.
- **A widget put back after being taken out of a row returns as its own block**,
  not into the row. It can be moved wherever you want from the same window; what
  it will not do is write itself back into a block you may have rearranged since.

## [4.2.0] - 2026-08-08

Two new ways to arrange a page — a card per journal, and widgets that sit side
by side — plus a homepage that decides its own width. Nothing in your vault is
rewritten and there is nothing to run: pages you already have keep the shape you
gave them, and the new lines only do anything where you type them.

### Added
- **A card per journal.** `journals:cards` draws every journal as a card with a
  banner, its name, how much is in it, and buttons to open it or start something
  new. It is the same list the `journals` block already shows, laid out
  differently — write either, or both. The banner comes from a `banner` property
  on the journal's own index note, which is the same place other banner plugins
  look, so one you have already set up is picked up with nothing to configure.
  A journal with no banner gets a colour of its own, derived from its name, so
  it stays the same colour as you add others.
- **`row` — widgets side by side.** A line you can put in any `almanac` block
  saying that its widgets sit next to each other instead of stacking. The cells
  are the lines you wrote, so three directives make three columns and there is
  no number to keep in step. On a narrow pane — a sidebar, a split, a phone —
  the row becomes a column again, and each widget answers to the width of its
  own cell rather than the window's, so a calendar in half a pane is in its
  compact layout even when the note is wide.
- **Two lines you might mistype are refused out loud**, in the block, rather
  than half-working: `row: 3`, and two `row` lines in one block. Each says what
  to do instead.

### Changed
- **A new homepage sets its own width.** It is composed with a `cssclasses`
  property, and Almanac gives that class a width wider than Obsidian's
  *readable line length* — and a limit where that setting has none. Readable
  line length is a setting about how many characters read comfortably in a line
  of prose, and a homepage of rows is a calendar and a card, so it no longer
  decides how much room each widget gets. **A homepage you already have is not
  touched** and keeps following your own setting. To give it the new width, add
  `cssclasses: almanac-wide` to its properties; to take it off a new one, delete
  that line and nothing will put it back.

### Fixed
- **The section window called a homepage's own properties a stray block.**
  Opening "Edit this note's sections…" on a homepage with any properties on it
  reported that a block in the file wasn't Almanac's and had been left alone —
  about the properties themselves. Your own blocks are still reported, as they
  should be; the note's properties no longer are. The message also said "1 block
  … aren't", which now agrees with itself.
- **Unticking one of two widgets that share a block did nothing, after saying it
  would.** If you had put two sections in one `almanac` block, the preview
  offered to remove one and then left the file exactly as it was. The window now
  says why it cannot — naming the block and the two ways out — instead of
  promising an edit it will not make. Unticking every section in a block still
  removes the whole block, and the same rule now applies to moving one: a block
  travels as a unit.

## [4.1.2] - 2026-08-08

The journals dashboard gets the collapsible title bars the diary dashboard got
in 4.1.1, and a button on the diary dashboard starts working again. Your notes
are untouched and there is nothing to run — the pages repaint themselves.

### Changed
- **The Journals card now has a collapsible title bar**, like the three sections
  under it. It was the only block on that page you could not fold and the only
  one without a title — the same thing that was fixed for **Today** and **This
  month** one release ago, on the page nobody had opened yet.

### Fixed
- **The This Week / This Month button stopped noticing you had navigated away.**
  Stepping to another month with the arrows left the button looking as though
  you were still on the current one, so the way back was there but did not say
  so. It looked for the button inside the card those sections gave up in 4.1.0.
- **Empty widgets sat flush against the edge** of a canvas node or another
  plugin's tile, with nothing around them, which read as a failed render rather
  than as "nothing here yet". They are inset and centred now. Widgets on an
  ordinary Almanac page are unchanged.

## [4.1.1] - 2026-08-08

Three rendering faults in 4.1.0's new pages. No new features, no changes to what
a vault contains, and nothing to run — the pages repaint themselves.

### Fixed
- **The `Today` and `This month` sections had no background, border or padding**,
  and sat wider than every section around them. They gave up the card they used
  to draw and nothing replaced it: the surface behind a section is applied by
  the header bars, and these two title themselves instead.
- **The stat strip in `This month` shrank to about a third of its width**,
  leaving DAYS LOGGED and TASKS DONE crowded to the left. The rule that lets the
  band's rows fill its width was written to apply only where the card was, and
  the card is exactly what those sections had just given up.
- **The review list on the journals dashboard showed a red *Unknown Almanac
  widget*** on a vault with no journals in it yet. It is a valid list with
  nothing in scope, and now says so.

## [4.1.0] - 2026-08-08

Two folders that a reader spends their whole time inside had no page of their
own. `02 - Diary/` had its four period dashboards nested underneath it and
nothing at its root; `03 - Journals/` had nothing at all. Clicking either folder
in the file explorer landed nowhere, so the homepage was doing duty for both —
which is how it ended up as the page that contains everything rather than a
place to start.

**Your existing notes are untouched.** Nothing is removed, renamed or rewritten.
The two pages are only created where they are missing, and a homepage you
already have keeps every section it has.

### Added
- **A diary dashboard**, at `02 - Diary/02 - Diary.md`. Today's card, this
  month, open tasks from across the diary, on this day, trends and the tag
  cloud. It is a folder note, so clicking `02 - Diary` in the file explorer
  opens it.
- **A journals dashboard**, at `03 - Journals/03 - Journals.md`. Every journal
  as one card, what is due for recall across all of them, open tasks and trends.
  The recall list is new here: until now it existed only on each journal's own
  index notes, so there was nowhere to see the whole vault's queue at once.
- Both pages work with **Edit this note's sections…** and **Add a section to
  this note…**, like the homepage and the period dashboards.
- **`frame:`** — a line you can put in any `almanac` block saying what its
  widgets should be drawn inside: `card` (the default, unchanged), `section` (a
  collapsible titled bar) or `none` (no chrome, for a canvas node or another
  plugin's tile). Blocks with no `frame:` line are unaffected.

### Changed
- **The homepage is now a place to start**: the diary card, the journals card
  and your charts. The tag cloud moved to the diary dashboard, which is a page
  about the diary and so the right home for a cloud of the diary's tags.
- On a journal note, the first crumb in the trail now reads **Journals** and
  opens the journals dashboard. It read `Home` and opened the homepage, which
  was a shortcut rather than a step up the tree — the trail names the folders a
  note sits inside, and the journals root is the first of those.
- Both new pages scope their tasks, tags and charts to the folder they sit in,
  so renaming `02 - Diary` or `03 - Journals` carries them along.
- On the diary dashboard, **Today** and **This month** now have collapsible
  title bars like every other section on the page. They shipped as bare cards,
  which left them the only two blocks there that could not be folded and did not
  look like their neighbours.

### Notes
- The tag cloud and **On this day** are still offered on the homepage — they are
  in the section list, and adding either back puts it exactly where it was.
- Run **Set up / repair vault** to create the two pages in a vault you already
  have.

## [4.0.2] - 2026-08-08

### Internal
- Internal test safety release. No user-visible changes.

## [4.0.1] - 2026-08-08

### Internal
- Continuous integration and version alignment release. No user-visible changes.

## [4.0.0] - 2026-08-08

### Changed
- Major version cut setting the 4.x direction.
