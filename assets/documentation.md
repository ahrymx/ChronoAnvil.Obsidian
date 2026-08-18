# 📖 Almanac — how this vault works

This vault is driven by the **Almanac** plugin, which owns the bespoke "glue" that used to be spread across Templater scripts, Meta Bind buttons, Folder Notes and a set of CSS snippets. The dashboards are now rendered by Almanac itself, with **Bases** for `.base` views (that remains a dependency). As of 1.5.0, **Dataview is no longer required**; as of 2.5.0 **Tracker is no longer required either**; and as of 2.8.1 **Tasks is no longer required** — the "Open Tasks" lists on the Weekly, Monthly, Staging and Subject dashboards are now the built-in `tasks-table` widget, reading Almanac's own task lines. The topic tables, confidence summaries, tag index, diary calendars, entry navigator, diary search / on-this-day / timeline and every chart (trend, heatmap, summary, and the study activity chart) are all built-in Almanac widgets too.

## Required plugins

No **community** plugins are required — as of 2.8.1 the last one (Tasks) is gone, its "Open Tasks" lists replaced by the built-in `tasks-table` widget.

Enable these **core** plugins (Settings → Core plugins):

- **Bases** — the `.base` tables (All Entries, Study Notes, per-topic Lessons/Practice).
- **Properties view** — editing frontmatter.

You do **not** need Templater, Meta Bind, CSS snippets, or **Dataview** — the Almanac plugin replaces all of them, including (as of 1.5.0) the topic tables, confidence summaries and tag index, which are now built-in widgets reading Obsidian's own metadata cache directly, same as the diary calendars and entry navigator.

## First run

Run **Maintenance: set up / repair vault** (ribbon 📖 menu, the command palette, or the plugin's settings tab). It creates any missing folders, templates, base files and the homepage. It never overwrites existing files, so it's safe to re-run any time something looks out of place.

## Commands

Everything below is also reachable from the note itself. Every journal note, index and template carries a banner, and the **⋯** control at the right of its breadcrumb row is the shortest way to what that note supports: editing its sections, adding or removing a tracker, converting it into a dashboard. The menu is built from the note, so it never offers something whose only outcome would be an error — and a note no journal recognises gets no control at all rather than a menu that opens and then explains it can't help. Each journal in Settings also has a **Templates and sections** button that opens straight onto its section list.

All available from the command palette and the 📖 ribbon menu. **Every command
is named `<group>: <what it does>`** (3.13), so the palette groups them when you
filter: type `almanac diary` for the diary's, `almanac maint` for the ones that
write to your vault. The ribbon menu draws the group as a heading instead, so
its items drop the prefix — the group is said once per surface, never twice.

- **Diary: open today** / **Diary: new entry (pick a date)**
- **Diary: open this month's entry** / **Diary: new monthly entry (pick a month)**
- **Diary: quick capture**, **Diary: search**, and the four **Diary: open the weekly / monthly / quarterly / yearly overview** commands, each of which sets the dashboard to *now* rather than leaving it wherever you last browsed
- **Study: new journal (subject)** — creates a subject folder + index note. Study is one of four **presets** (Settings → Journals → Presets), alongside **Projects**, **Exercise & Diet** and **Media**; a fresh vault installs none of them, and these commands appear only once a journal that declares them exists.
- **Study: new topic** — pick a subject, name a topic; creates the topic folder + index
- **Study: new lesson** / **Study: new practice** — created in the current topic folder (or pick one). The popup also asks which **Layout** to use, when the kind has more than one — arrange a template's sections however you like, press **Save as layout…**, and it becomes a choice here. Since 3.18 that button is on the note itself as well as in Settings — arrange the note in front of you, then keep the arrangement from the same window. (Saved layouts live on journals you defined; the built-in Study journal has nowhere to store one.) A layout is not a new kind: a Math Lesson is still a Lesson, with the same trackers, the same review queue and the same tables.
- **Note: edit sections…** — the note's whole section list: add from the catalogue (Find, Review queue, Charts, Progress, Open tasks, Recall cards, a Notes field, Resources, a Path…), reorder, rename, or remove. Nothing reaches the note until you save, and the button counts what it is about to do. Some sections — the Task Manager, Resources, and the table of what's below a folder note — carry a title box in their row: leave it empty for the heading the plugin writes, or type your own. A dashboard that is missing a note table, because its journal gained a note type after the dashboard was written, shows up here as one entry offering to add it; your own notes are never touched this way. Works on a journal note or on one of its templates — both are just markdown, and the directives don't care which. The list offered is filtered to what belongs on that note's surface (a review queue is an index-note thing, recall cards are a leaf-note thing) and leaves out anything the note already has.
- **Note: trackers for this entry…** — one list with the state in it: what this entry carries is shown first and marked, then what could be added, then *New tracker…*. Picking a present row removes it; picking an absent one adds it.
- **Note: new page** and **Note: convert to a dashboard** — offered only on a note that is inside a journal.
- **Note: next page in this widget group** / **Note: previous page in this widget group** — switch which page of a tabbed group is on screen (see `tab` under the widgets). Offered only on a note that has one. These are the two commands worth **binding a key to** in Settings → Hotkeys; nothing ships bound, because a default would collide with whatever you already use. They act on the group you last clicked in and wrap at both ends.
- **Diary: new special event…** — add a birthday, holiday, trip or sick day
- **Diary: open the special events note**
- **Maintenance: refresh journals on the homepage** — re-reads every journal's folders and repaints the Journals banner, which is also what the **Refresh** button in the banner's hero does. On a homepage still carrying the pre-2.13.9 layout it additionally replaces that whole generated section — the `📚 Journals` header bar, the per-type bars and the subject callouts — with the single `journals` directive that draws it now. That migration runs once; afterwards the section is live and nothing on the page is rewritten.
- **Maintenance: find unregistered journals** — restores any journal folder that carries its own manifest, and opens Settings on the list of any that would have to be reconstructed. Runs automatically on load; this is the button for when you have just copied a folder in and don't want to reload. See *Moving and importing a journal*.
- **Maintenance: sync trackers into vault**, **Maintenance: refresh entry templates (overwrites)**, **Maintenance: refresh journal templates**
- **Maintenance: set up / repair vault** — shown in red on the ribbon menu, because it is the one item there that writes to notes you cannot easily get back.

## Almanac widgets

Small interactive controls are rendered by the plugin, not written out by hand — they read and write the note's own frontmatter, so the note itself stays mostly your own content.

Preferred: a fenced `` ```almanac `` block, one directive per line. Simple widgets on consecutive lines (slider/time/date/select/button) collapse into a single row; anything else — `diary`, `month-summary`, `journals`, `timeline` — renders as its own full-width block:

````
```almanac
slider:Mood|☀️ Mood
button:week-prev
button:week-this
button:week-next
date:week-start|Jump to any day
week-summary
```
````

Directives:

- `header:Title` / `header:2:Title` — a header bar (1.6.1): the section title on the left, the simple widgets after it (and a `links:` row) anchored on the right, as one element. Used in place of a `## Title` heading so the title and its controls sit on one line. As of 1.6.4 every section on the home, Weekly and Monthly dashboards is a header bar. Each titled bar can **collapse** its section (click the chevron or the bare title — folds every block after it up to the next same-or-higher-level bar **or the next markdown heading**, whichever comes first; state is remembered across reloads and follows the note if you rename it). A heading ends a bar's scope because a bar titles a *widget* section while a heading is the note's own structure — without that rule, a note with one bar and prose beneath it would fold away entirely. The optional level (`1` = top-level, default; `2` = nested; anything higher is clamped to 2) sets both size and nesting: a level-2 bar renders indented/bracketed under the level-1 bar above it and folds away with it. (The Journals section no longer uses header bars at all — it is one `journals` card with its own folds — but the mechanism is unchanged for every other section and for dashboards you build yourself.) As of 2.56.24 every shipped dashboard writes a section as **one fence**: the `header:` line and the widget it titles sit in the same ```almanac block, the way journal notes always did. A section split across two fences still works — older vaults are full of them — but it is two blocks pretending to be one object, which is why they folded and shaded differently in Live Preview. One fence means you can pick a whole section up and move it.
- `frame:card` / `frame:section` / `frame:none` — not a widget but a line about the **block**, read before the directives (4.1.0): what the widgets in this block are drawn *inside*. `card` is the default and is what every block did before this existed; `section` gives the block a collapsible titled bar, taking its title from the directive (`month-summary` becomes *🗓 This month*), which is what makes a bare widget foldable in a note you wrote yourself; `none` draws no chrome at all, for a canvas node or another plugin's tile, where the thing around the block already *is* the frame. A block cannot carry both `header:` and `frame:section` — they both title it — and says so in the block rather than picking one silently.
- `row` — the other line about the block (4.2): its widgets sit **side by side** instead of stacking, as a **group**, which is what the thing it makes is called everywhere else. A group draws a box around its columns with a slim strip along the bottom carrying how many columns it has and the grip that moves the whole group; a group inside a section or under `frame: none` draws no box, because the surface it is on is already somebody else's. The cells are the directives, so three lines make three cells and there is no number to write; `row: 3` is refused rather than ignored, because a count above the directives stops agreeing with them the first time you add one. A row is one block — two `row` lines in a block are refused, naming the way out, which is a second block, and that is also how you get a row of framed widgets above a row of unframed ones, since a block's `frame:` describes the whole block. A `header:` bar stays full width above the row. By default each directive is its own column; a **`cell`** line starts the next one, so directives between two `cell` lines share a column and stack inside it — `row` / `diary:3` / `cell` / `tasks-table` / `on-this-day:always` is two columns, with the last two stacked in the second. A cell can be wider than its neighbours: **`cell: 2`** opens a column two shares wide, `cell: 3` three, a plain `cell` one. You can also **drag the edge between two columns** — point at a group and a divider appears there; the columns follow it and snap to whole shares, and letting go writes the `cell` lines. Dragging back to even takes them away again, and Escape puts it back. The divider only offers ratios the window can hold, because a wider column asks for more room and wraps sooner; a number you write yourself is taken at its word. The first column is opened by the `row` line, so it is one share unless you open it yourself with a leading `cell: 2` — which is how you get a two-thirds / one-third row. The width sits on the cell rather than on the row because a number on the row would have to agree with how many columns there are; one on a cell cannot disagree with anything. A column that cannot have the width it asks for wraps to the next line rather than squeezing, so there is no maximum. `cell` outside a row is refused rather than ignored. A row **wraps** rather than squeezing: each cell asks for a minimum width, so cells that cannot all have it move to the next line — three across on a wide pane, two and one on a half-width one, a column on a phone. Each cell measures itself, so a widget in a third of a pane is in its compact layout even when the note is wide. A widget can also be given a **height**: a **`height: 240`** line sizes the directive on the line under it to 240 pixels and lets its contents scroll inside, which is how you stop a table of five empty topics from setting how tall its column is. Hover a group and every card draws a mark on its bottom edge — the last card in each column included — and dragging it writes the `height` line, snapping to twenties. Drag it back past the card's own natural height and the line goes away again, because a card that is already the height it wants needs no number; Escape puts it back. A card **scrolls** rather than stretching, which is the direction that works: stretching a card does not stretch what is in it. Moving a sized widget to another column takes its height with it, and removing that section takes the line with the section, so nothing is left sizing the widget that moved up. Like `cell`, `height` outside a row is refused rather than ignored — it sizes a card, and cards are only drawn inside a row. A group can also hold **pages**: a **`tab`** line divides the block the way `cell` divides a row, so `row` / `diary:3` / `cell` / `tasks-table` / `tab` / `journal-chart:confidence` is one group with two pages — two columns on the first, one wide chart on the second — and the foot carries `[1] [2]` with the open one tinted. Each page is a whole row of its own, so every page has its own columns and its own widths; a `cell` divides the page it is in and nothing else, and you do not have to type any of it — point at a group and a **`+`** appears in its foot, which splits the last column off as a page of its own, or open **Note: edit sections…**, where every section inside a group carries **Start a page here** and the card shows where the pages divide (it splits rather than merely adding, because a page with nothing in it is not drawn, so a button that only wrote a `tab` line would change your note and not the page). and the `tab` line opens its page's first column exactly as `row` opens the block's. Like `row`, `tab` takes no value: the pages are numbered and the count is the number of `tab` lines you wrote, so `tab: Charts` is refused rather than ignored — named pages may come later, and a value quietly dropped now would be in your files by then. A page with nothing in it is not drawn, so a trailing `tab`, two in a row, or one above a widget with nothing to show never puts a number in the strip that opens onto nothing. Where you left a group is **remembered per note** and nothing is written into the note to do it — switching pages never touches the file. Two commands switch pages and neither ships with a key: bind *Note: next page in this widget group* and *Note: previous page in this widget group* in Settings → Hotkeys, and they act on the group you last clicked in, wrapping at both ends. With one group on the note the keys simply find it; with several, the one they are listening to shows a tinted line above its foot. The swap moves the group's height with the page so the strip does not jump under your pointer between presses, and if you have reduced motion turned on it is instant. A group with no `tab` line is exactly what it was. One thing to know: a widget that draws nothing still takes its share of a row, so where a widget has a form that keeps its empty state — like `on-this-day:always` — prefer that one inside a row.
- `slider:Prop[:min:max:step][|Label]` — defaults to a 1–5 slider.
- `time:Prop[|Label]` / `date:Prop[|Label]` — a time or date picker.
- `select:Prop:val=Label,val2=Label2[|Label]` — a dropdown.
- `tracker:<id>[|Label]` — a widget for a tracker defined in Settings → Trackers (stepper for numbers, a face picker for a scale like Mood/Energy/Focus, a checkbox for a yes/no habit, otherwise the matching picker/dropdown; derived Sleep is a read-only chip). See "Trackers" below.
- `sleep` — the coupled Wake-Up + Bedtime control with a live asleep/awake readout; re-derives the `Sleep` property on change.
- `sleep-summary` — sleep stats across all daily entries (average, typical times, range).
- `button:<action>[:arg]` — a button. Diary/chart actions: `today`, `this-month`, `new-diary`, `new-monthly`, `week-prev`/`week-this`/`week-next`, `month-prev`/`month-this`/`month-next`, `chart-add`/`chart-edit`/`chart-remove`, `tracker-add`/`tracker-remove`, `log:<trackerId>:<delta>`.
- `button:<typeId>:<action>[:arg]` — a journal-type button, scoped to a registered type (`study` or a custom type id). Actions: `new-journal`, `new-container`/`new-topic`, `new-lesson:<folder>`, `new-practice:<folder>`, `refresh`. E.g. `button:study:new-lesson:<folder>`.
- `entry-header[:home,week,month]` — the unified top strip: an editable title (writes the note's `title` property; empty shows the date plus an "Add a title…" hint), quick links, and a compact prev/next navigator, in one bar. Used at the top of the daily and monthly templates in place of separate links + nav rows.
- `period-nav:<week|month>` — the weekly/monthly dashboards' date finder: prev/next pills around a date-picker pill whose dropdown lists the weeks/months you've journaled (plus the current one) to jump to. Same look as an entry's picker, but it re-scopes the in-page summary by writing this note's `week-start` / `month-start` rather than opening a note. As of 2.22 the navigator is folded into the overview banner (see `week-summary` / `month-summary` below) — the `week-summary` / `month-summary` widget draws it in the banner's top-right corner — so it is no longer written as a separate directive in the dashboard notes.
- `diary[:N]` — the homepage's entire Diary section in one card: a tinted header band (greeting, today's date and entry status, buttons that act on today, a strip of at-a-glance numbers, and the Weekly / Monthly / All Entries pills), then the month grid, then the next `N` upcoming events (default 5). The greeting heads the calendar rather than sitting in a card of its own, so the section has no separate header bar and cannot be collapsed. On an empty vault the band shows a first-run invitation instead of the numbers.

- **The Year** (`02 - Diary/Year.md`) — a dashboard for a whole year. Pick a year with the row of buttons at the top; everything on the page follows, including the charts. Shows how many diary entries you wrote and what share of the days that covers, your longest unbroken streak and when it ran, lessons completed, tasks done, and a twelve-month strip showing when you wrote most. A year still in progress is titled "so far" and tells you how much of it the numbers cover, so a part-year is never silently compared against a whole one.

  The **Trends and Statistics** section on that page is the same dashboard chart section as everywhere else — use **Add chart** to put whichever trackers you care about on it, and set their range to **Period** so they follow the year you've picked. Also on the ribbon menu and as the **Open the year view** command.

- **Quick capture** — a box for getting a thought into today's entry without opening it. Reach it with the **Quick capture** command (worth giving a hotkey), the ribbon menu, or the **Capture** button on the homepage's diary card. Type as many lines as you like — Enter is a newline, **Cmd/Ctrl+Enter** saves — and it's appended to today's **Captured** field stamped with the time, creating today's entry first if it doesn't exist yet. You stay where you are; nothing navigates.

  Captures go in their own field rather than into Notes, so your written-on-purpose prose stays separate from fragments arriving all day. The field is folded by default (**Settings → Quick capture** changes that, and folding or unfolding it in a particular entry sticks for that entry).

  Closing the box with Escape **keeps what you typed** for next time, including across a restart. One caveat worth knowing: an unsaved draft is stored in the plugin's settings rather than in your vault, so it doesn't sync between devices and won't survive resetting settings — it's a scratch buffer, not a safe place to leave something for days. Settings shows you when a draft is waiting.

- `diary-search` — search everything you've written. It matches the note **body**, not just frontmatter, so it finds the words in your Log, Highlights, notes and tasks — not only the dates and numbers. Filters are typed into the same box as the words: `from:30d` / `to:2026-03` (an ISO date, a month, a year, or a relative window like `30d`, `6m`, `1y`), `tag:health`, `is:daily` / `is:monthly`, `has:attachment` / `has:task` / `has:event`, and a tracker comparison like `Mood<=2`. Every word must appear (so "dentist appointment" doesn't return every appointment), `"quoted phrases"` stay whole, and anything that isn't a recognised filter is simply searched for. Each result shows the matching text with the field it came from. Lives on **02 - Diary/Search.md**; also on the ribbon menu and as the **Search the diary** command.
- `on-this-day[:always][:N]` — this date in previous years, newest first, out to `N` years back (default 25). Years you didn't write in are skipped, and if there's nothing at all the widget shows nothing rather than an empty box — so it costs you nothing on a new vault and quietly starts appearing once you've kept the diary through a year. Add `:always` if you'd rather it always hold its space. On the **Search** note by default, where it holds its space; the homepage offers it but no longer writes it (3.13) — add it back from *Note: edit sections…* if you want it there.
- `timeline[:N]` — every entry, newest first, grouped by month: date, title, the opening of what you wrote, and small markers for mood, open tasks, attachments and tags. This is what the **All Entries** link now opens. Shows `N` months (default 3) with a **Show earlier** button for the rest.
- `month-summary` — the Monthly Overview dashboard's whole summary, driven by that note's `month-start` property, as one card (2.22): an accent-washed **banner** at the top — the "Monthly Overview" eyebrow, the month as its title, the stats line, and the month navigator — welded above the day grid and the year-of-reviews grid. The banner is built the same way as the homepage's diary card and a diary entry's banner, so the three read as one family.
- `week-summary` — the Weekly Overview dashboard's summary, driven by that note's `week-start` property, in the same banner-over-body card (2.22): a "Weekly Overview" banner (eyebrow, the week's span as its title, stats, and the week navigator) above the seven-day table. Each table row leads with a logged/empty status dot, splits the weekday from the date, links the entry under its own title with a mood heat dot, and rolls the day's tasks into a count pill; an unlogged day offers a quiet **Add entry** in its place.
- `events` — the special-events manager: every recurring and one-off event, grouped, with an **Add event** button. Lives in the body of the events note by default.
- `events:upcoming[:N]` — the next `N` events (default 5), each with a relative "in 3 days" / "day 2 of 5" readout. A standalone list, for a page that wants upcoming events without a calendar; the homepage's `diary` card already ends with this list.
- `topics-table` — per-topic rollup on a subject index note (lesson/practice counts, last activity, open tasks). Scope is the host note's own folder.
- `kind-table:<kind>` — the notes of one kind on a topic index note: title, date, that kind's rating (if it has one) and status. Scope is the host note's own folder, the same rule `topics-table` uses, so the table and the stats band above it always agree. Open notes come first, newest first; finished ones sort to the bottom and grey out. Written once per kind by the index template, all in the same block as their headers and **New …** buttons.
- `pages-table` — the page index on a note that has been split. Lists the pages sitting beside it, in the order they were created. Only appears with something to show; before that it invites you to press **New Page**.
- `recall:<key>[|Label]` — question-and-answer cards, stored in the note's `<!--almanac:<key>-->` body region like the other content fields. Each card shows its question with the answer hidden; press **Show answer**, then say whether you **Got it** or **Not yet**. Grading writes the note's own rating — 🎯 Confidence on a Lesson, ✔️ Accuracy on a Practice note — and stamps 🔁 Last reviewed, which is what feeds the review queue and the trend. The pencil in the top-right switches to an editable list for writing the cards; the arrow clears the sitting so you can run the deck again. On the Lesson and Page templates by default.
- `review-queue[:all|:<folder>]` — what is worth reopening. Reads the dated notes in scope, works out when each is next due from its Confidence rating and when it was last reviewed, and lists the ones that have come round. Bare, it scopes to the host note's folder (so a subject page covers every topic beneath it); `:all` spans every journal at once. Each row has a ✓ that stamps today's date into 🔁 Last reviewed and drops the row from the list. Deliberately quiet: no overdue counter, no streak, and the list is capped — a short list is a next action, a long one is a backlog.
- `journal-search[:all|:<folder>]` — full-text search across your journal notes: the note **body**, not just frontmatter, so it finds the words in your Overview, Notes, recall cards and tasks. Same scope grammar as `review-queue`: bare it covers the host note's folder (on a subject index, every topic beneath it), `:all` spans every journal, or name a folder. Filters go in the same box — `from:30d`, `to:2026-03`, `tag:algebra`, `is:lesson` / `is:page` / `is:practice` (whatever kinds your journals define), `has:task` / `has:attachment`, and a tracker comparison like `confidence<=2`. Every word must appear, `"quoted phrases"` stay whole, and anything unrecognised is simply searched for. Each result shows the note, its trail (Subject › Topic › Lesson) and the matching text. On the Subject Index template by default.
- `journal-chart:<tracker>[|Label]` — any journal tracker, plotted over the dated notes in the host note's folder. Same folder rule as `topic-stats`, so it reads a subject index (every topic beneath it) or a topic index (just itself) without being told which. Titled with the tracker's own name unless you give it a label. Needs at least two readings; one is a dot, not a trend. Once a trend passes about eighteen readings it also draws a dashed **rolling average** through itself, labelled in the legend — there is nothing to switch on, because below that count the smoothed line would just be the same line half a step late. This is how a Reading journal plots "pages read" or a Cooking one plots "difficulty" — any numeric journal tracker you have defined, not just the built-in one.
- `journal-breakdown:<tracker>[|Label]` — the same tracker, ranked instead of plotted: one bar per topic below the host note, **weakest first**. The counterpart to `journal-chart` — that one answers "am I improving?", this one answers "where am I weakest?", and only the second changes what you open next. On a note whose children are notes rather than folders (a topic index), it ranks the notes instead, which is the same question one level down. Bars scale to the tracker's own range, not to the best bar, so a good set doesn't stretch to look full. Averages through the same helper `topics-table`'s confidence column uses, so the bar and the column can't disagree.
- `journal-tally:<tracker>` — how many of the things below sit at **each value** of a select. The question a chart cannot ask: charts refuse `select` by design, so nothing could count "how many finished". On a note whose children are folders it counts those folders' index notes, and where they are notes it counts the notes — so an Area tallies its **Projects** and a Project tallies its **Updates**. Options are drawn in the order the tracker declares them, not by size, so the row reads as a pipeline; an option nothing carries is dimmed rather than dropped, because a missing stage reads as a stage that doesn't exist.
- `journal-totals` — what the notes below **add up to**: one cell per quantity this journal totals. It takes no argument on purpose — it reads your tracker registry for whatever declares *chart by month: total* — so a journal with five quantities bands all five out of one line. A quantity with no readings here draws no cell, which is how one Media journal shows *Pages read* on the Books shelf and *Minutes* on the Film shelf.
- `confidence-trend` — the preset spelling of `journal-chart` for 🎯 Confidence. The shipped Topic template does **not** write this: its Charts section is a managed region carrying `jchart:` specs, which is where **Add chart** puts things. This spelling is for a dashboard you write by hand. The counterpart to `topic-stats`: the stats band says where you are, this says which way you are going. Untitled, since it sits under a header bar already.
- `activity-chart` — open vs completed tasks across the host note's folder, bucketed by each note's `date` and drawn as a calendar quarter: three month heatmaps side by side, with chevrons stepping a quarter at a time (Q1 2026, Q2 2026, …). All three grids share one shade scale — the busiest day in the quarter — so the months are comparable with each other, and the stat rail totals the quarter on screen. A day with a note behind it opens that note. Used on a subject index (it aggregates every topic beneath it) and refreshes as lessons are logged.
- `journals` — the entire Journals section as **one card**: the hero band described below, then a row per journal (Study, any custom types) carrying its `+ Subject` / `+ Topic` buttons, then a group per subject, then a plain row per topic. Topic rows carried a button per note type until 2.51; a flat journal, which has no topic rows, keeps a single `+ {kind}` button on each group head. This is the counterpart of `diary`, which is the whole Diary section in one card. Two things fold, and each remembers its state per note: a type row folds its subjects, and a subject row folds its topics — the last is the one that matters on a subject with thirty topics. The card is live: creating a subject, adding a topic or logging a lesson repaints it in place, with no rebuild step and nothing written back to the note. **Refresh** in the hero forces a re-read from disk, for changes that arrived from outside Obsidian. **Reorganise**, beside it, opens a short window for the order the journals appear in — move a journal with the ↑/↓ buttons and press Save; nothing is written until you do, and nothing moves on disk (no folder is renamed and no note is touched). The order is the same one the homepage uses. On the homepage itself, where each journal is a card rather than a section, **drag a card onto another** to put it in that card's place — same order, same setting, and there it writes as you drop. Each page offers one of the two, not both.
- `level-cards[:<journal>[/<folder>]]` — **what is below this note, as cards** (4.36): one card per folder in the scope, carrying its numbers — notes, when it was last worked, open tasks, and the average rating where the journal rates anything — over **Open** and a **＋** that creates the level below where there is one and a note of any of this journal's types where there is not. Where the journal declares a level below that folder, the card is joined by a **second card beside it** listing what is inside, so a two-level journal reads as pairs and a flat one as singles. Whether a card is paired is a question about the journal's SHAPE, not about what is in the folder today — a subject with no topics yet draws its pair with an empty list rather than being mistaken for a deepest level. Same two arguments as `level-index` and the same resolver, so an unknown journal or a folder outside it gets the same sentence from either; at the deepest level it declines and names `level-index`, because a card is a container and what is below a deepest folder is notes. A page may hold several.
- `journals-header[:<journal>]` — the hero band on its own, for putting the numbers on another dashboard: at-a-glance numbers (active days, current and longest streak, open tasks) over a 53-week activity strip. Bare it covers *every* enabled journal at once, which is what it has always meant; name a journal and it covers that one (4.36), which is what each journal's own dashboard does — a band of the whole vault's figures under one journal's name is a plausible number about something else. `journals-header:all` is bare said out loud, and is what the sections editor writes when you pick **Every journal**. Unlike `activity-chart` it is a fixed window with no navigation and no day numbers — it answers "have I kept this up?" at a glance rather than being browsed — but it shares the same four-shade scale, so a colour means the same amount of work in both. A day with a note behind it opens that note, and the strip repaints as notes are added under any journal root. Renders nothing at all when no journals are enabled.
- `tag-index[:<folder>]` — a table of tags, most-used first, counted under `<folder>`. The folder is optional and defaults to **the host note's own folder**, the same rule `tasks-table`, `review-queue` and `journal-search` follow — so a bare `tag-index` on a Subject Index covers every topic beneath it. (Before 3.11 it defaulted to the Diary root instead; the homepage now writes its folder out, so nothing there changed.) Where the scope spans more than one folder, each row also names its **sources** — the first folder beneath the scope its notes live in, so a table over your journals root says which journal each tag came from. With one source, or none, that column isn't drawn. Available as the **Tags** section on the homepage, on journal index notes, and — new in 3.14 — on the weekly, monthly, quarterly and yearly dashboards, where it is offered rather than added for you and writes the diary root out as its folder (the dashboards' own folders hold period notes, not tagged ones). Click a tag to search the **whole vault** for it; expand a row to see the notes counted in scope.
- `entry-rollup[:day|:month]` — **What the entries said**: each entry inside the host dashboard's period that wrote something, oldest first, with its focus (and highlights and challenges, where the entry logged them). Bare gathers **days**; `entry-rollup:month` gathers **monthly entries**, which is what a Quarterly dashboard wants. Scoped by the host note's `week-start` / `month-start` / `quarter-start` property — put it on a note without one and it says so rather than guessing a window. Ships on the Weekly and Monthly dashboards and is offered on the Quarterly one, where it overlaps the Recap.
- `tasks-table[:<folder>]` — the "Open Tasks" rollup: every still-open Almanac task from notes under `<folder>` (optional, defaults to the host note's own folder), grouped by source note with the note title linked. Tick a checkbox to complete a task in place; edit its text/priority/due in the source note's own Tasks field. Used on the Weekly, Monthly, Staging and Subject dashboards. Replaces the old Tasks-plugin `` ```tasks `` query blocks.

All of the above read note metadata directly through Obsidian's own cache, so none of them need Dataview.

Legacy syntax — `` `almanac:kind:...` `` written as a single inline code span — still works, and is what the plugin uses for the per-topic buttons inside the homepage's study table (a table cell can't hold a fenced block). Prefer the block syntax everywhere else.

Widgets render in reading view and in live preview.

## Trackers

Trackers come in two kinds: six **built-in** ones the plugin formats for you,
and any number of **custom** ones you define for everything else.

The **built-ins** are locked — they can only be turned on or off (their
property name, type and range are fixed so their special widgets keep working):

- **🏷️ Tags** — the one **global** built-in, and the only one whose value is a
  list. Add it to any note — a diary entry, a dashboard, a Lesson, a Subject
  Index — from **+ Add tracker**; it is never put on a template for you.

  It writes Obsidian's own `tags:` frontmatter property, so everything that
  reads tags reads these: the tag pane, `tag:` search, and Almanac's own
  `tag-index` section. **Why a tracker at all:** an Obsidian tag is only a tag
  where Obsidian's parser can see it, and it cannot see inside a fenced code
  block — which is where Almanac puts every section. Typing `#reading` into a
  section gets you a string, not a tag. This is the way to tag a note from
  inside one.

  The cell shows what the note carries and a **Manage** button. In the window:
  each tag can be renamed (pencil) or removed (×); an add box takes a new one
  (a leading `#` is fine, and spaces become hyphens — “deep work” writes
  `deep-work`); and below that is every tag already used **in this note's own
  folder**, most-used first, as pills you can tap to add or remove. That last
  list is the point of the window: it is what keeps your twentieth entry
  agreeing with your first about whether it is `#deep-work` or `#deepwork`.
  Nothing is written to the note until you press Save, so Cancel really is
  cancel.
- **☀️ Mood**, **⚡ Energy**, **🎯 Focus** — the three *scale* built-ins: a
  face-picker (😞 😕 😐 🙂 😄, editable on each one's settings row) rather than a
  bare stepper. Mood ships enabled and colours the diary-calendar heat map;
  Energy and Focus ship off, one toggle away. Any of them can be made the single
  heat-map source from its settings row. Once you've picked a face, a small
  pencil badge appears **on that face** — press the face again to open the
  quick-capture box and jot a "why"; it's added to this entry's Captured log as
  a timestamped line tagged to the reading (`09:14 — [scale:Mood=4] …`), so it's
  searchable and paired to the value. The badge fills in once a reading has a
  note, so you can see at a glance which values carry one. It's always optional.
  To clear a reading, **right-click** (or Alt-click) the selected face. Daily
  only — for a monthly reflection, define a monthly tracker of your own.
- **😴 Wake-Up** + **🌙 Bedtime** — the coupled sleep pair. With both on and
  Sleep enabled, the daily note shows one control (two time pickers + a live
  "asleep / awake" readout) instead of two separate fields.
- **🛌 Sleep** — a *derived* value (hours asleep) computed automatically from
  Wake-Up + Bedtime whenever either changes. You never type it; it's written to
  the `Sleep` property, added as a Diary.base column, and can be charted like
  any number. The `sleep-summary` widget aggregates it across all daily entries.

A **custom tracker** — chapters read, kilometres run, weight, a habit, a daily
rating, anything numeric or picked-from-a-list — is configured in Settings →
Trackers instead of typed into the template by hand: a label, a type, and the
fields that type needs. The **property name** (the frontmatter key it writes)
follows the label on its own — type "🏃 KM" and it becomes `KM` — so you only
touch that field if you want a different key; typing in it stops it following,
and clearing it hands it back. An existing tracker's property name never
follows the label, because it is the key already written into every note that
has logged it: renaming a label is a relabel, not a migration.

The types are `number` (−/+ stepper), `scale` (a face/word picker over a small
range, heat-map-eligible like Mood), `boolean` (a yes/no habit checkbox storing
0/1, so it averages to a completion rate and feeds the streak chart), `time`,
`date`, and `select` (dropdown). Numbers take an optional min/max/step and unit;
a scale takes a range and its faces.

**Habits.** A boolean tracker doesn't get a logging cell of its own — every
boolean on a note folds into a single cell titled **Habits**, each becoming a
named chip inside it (a small box plus the tracker's label). Ten habits cost
the grid one cell rather than ten, and the chips wrap. A chip cycles
unset → done → not-done → unset just as the standalone checkbox does, and each
carries its own **×** for taking that habit off this note. Nothing about the
note changes: it's still one `tracker:<id>` line per habit.

### Tracker surfaces

Every tracker has a **surface**: the only kind of note it can be logged on at
all. A surface is either a kind of diary entry — **Daily** or **Monthly**,
with weekly, quarterly and yearly the obvious future additions — or a journal
surface: **any journal note**, or one named journal such as Study.

"Any journal note" is the one the built-in journal trackers (Confidence,
Accuracy, Status, Last reviewed) use, and it's usually the right answer for
your own too: a "Minutes spent" or a "Source" belongs on a lesson, a recipe and
a meeting note alike, and scoping it to one type means recreating it under a
second property the day you add a second journal. Pick a named type only when
the measurement genuinely belongs to that journal and nothing else.

The surface is a boundary, not a preference. A daily tracker cannot be put on a
monthly entry, and a Study tracker cannot be put on a note in another journal.
The "+ Add tracker" picker simply doesn't offer them, and a directive that ends
up on the wrong note some other way (hand-written, pasted, or left behind after
you moved a tracker) draws as a short refusal instead of a working widget.

Within the diary this is a rule about meaning rather than tidiness. A Mood
logged against *July* is not a Mood logged against *the 14th*; they are two
different measurements that would land in one frontmatter key, and any average
over the mixture is arithmetic on unlike quantities. Keeping them apart is what
lets a chart read a tracker's values without first having to ask which folder
they came from — which is why the chart editor no longer asks.

The six diary built-ins are locked to **Daily**: the scales ask how today went,
Wake-Up and Bedtime are one night's two clock times, and Sleep is the hours
between them. Two further built-ins — **Confidence** (1–5) and **Status** —
live on the journal side and are offered on *every* journal, so a custom
journal you create tomorrow already has both without anything being copied into
it.

Custom trackers pick their surface in the tracker editor. Changing it later is
allowed: if the tracker has no readings yet the change is silent, and if it does
have some, you're asked to confirm first. The change is metadata-only —
readings already written stay in the notes that hold them and go dormant, and
this tracker stops reading them until you set the surface back. They are never
moved (within the diary, a day's worth of values can't collapse into one monthly
figure without deciding how, and that differs per tracker; between the diary and
a journal they are simply in notes the new surface doesn't cover), so to track
both, add a second tracker on the other surface.

### Which notes a tracker appears on

Two places decide this, and they answer different questions.

**Settings → Trackers** decides what every **new diary entry** starts with.
Turning "On every new daily/monthly entry" on keeps that tracker's
`tracker:<id>` line and blank frontmatter key in sync inside the live template
for its class — add, rename or delete a tracker in Settings and every new entry
picks it up. "Diary.base column" does the same for that file's columns, adding
the column to the views that can actually show that class (a monthly tracker's
column goes to the monthly and mixed views, not the daily one). Both only ever
touch the region they manage (marked by `# almanac:trackers:start` /
`# almanac:trackers:end` comments in the template, and the columns the plugin
remembers adding in Diary.base) — anything else you've written stays
untouched, **including entries you have already filled in**. A sync never
rewrites a note you wrote; only the templates and Diary.base.

Neither switch applies to a journal tracker, and the tracker editor hides both
rather than showing you a control that would do nothing. A journal has
several templates — one index per level, one per note type — and "which entries
start with this" has no single answer when the surface is the *type*: Confidence
belongs on a Lesson and not on a Practice, and Settings cannot say so. Nothing
regenerates a journal's templates either, which means they are yours: the
shipped Subject, Topic, Lesson and Practice templates carry their `tracker:`
lines directly, and you can add or remove lines there by hand and they will stay
put. Diary.base is likewise a diary file, so a journal tracker never takes a
column in it.

**The note itself** decides what *that one* carries. At the end of every logging
grid — on a diary entry and on a journal note alike — there is a dashed
**+ Add tracker** tile. Pressing it opens a window listing the trackers this
note's surface allows, each with a second line saying what it writes (its type,
its unit, its property); search narrows the list, Enter takes the first match,
and picking one appends its widget to this note alone (with its frontmatter key
seeded blank, exactly as the template would have).

The window's **New tracker…** button is the other half of it: it opens the full
tracker editor with the surface already set to this note's, so defining
something you've just realised you want to log doesn't mean leaving the note for
Settings and coming back. What you create is a real registry tracker — saved,
synced into the templates and Diary.base like any other — it just isn't seeded
onto every new entry by default, because "+ Add tracker" is the gesture for a
thing that happened *today*. Turn that on in Settings if you want it everywhere.

Each cell also carries a small **×** in its corner — hover a cell, or focus the
button — which takes that module off this note again (a habit chip carries its
own). Removing a widget **never removes a reading**: a property you've already
logged into is kept and you're told so; only untouched keys are pruned.

The surface and the "on every new entry" switch are separate questions, and it
matters that they are: the first says *where a tracker may go*, the second says
*whether it goes there by default*. An occasional tracker is off the template
and still fully reachable.

### Trackers on journal notes

### Two ratings, not one

Grading a Recall deck writes a rating, and **which** rating depends on the kind
of note it is on. A Lesson is graded into **🎯 Confidence**; a Practice note
into **✔️ Accuracy**. They look the same — both 1–5, both written the same way
— and they answer different questions: *did I remember this* against *did I get
these right*. Kept as one property they averaged into a number per topic that
meant neither, which is exactly the number `topics-table`, `topic-stats`
and `journal-breakdown` read.

So a topic's Confidence is its lessons, and its Accuracy is its practice, and
you can chart either: `journal-chart:accuracy` for the trend,
`journal-breakdown:accuracy` for the weakest-first ranking — or add them
through the **📊 Charts** section's **Add chart** button. The review queue reads
whichever rating a note's kind uses, so a Practice note you did badly on comes
back round sooner just as a Lesson would.

One thing to know if you have Practice notes you graded before this: they hold
a Confidence rather than an Accuracy, so they stop being counted in the topic
average (which is the point) and drop out of the review queue until you grade
them again. Nothing is deleted — the old value stays in the note's frontmatter.

What a kind is *rated on* is also what the **+ Add tracker** list offers, so a
Practice note isn't offered Confidence any more. It's a filter and not a rule:
a note can still hold any tracker its journal has, so nothing you have already
logged is refused or hidden. If you define your own journals, each kind says
what it measures in **Settings → Journals**: every kind is a row with a
**Rated on** dropdown — what a Recall sitting grades into, what the trend
charts plot, and the one tracker that kind keeps to itself. A tracker no kind
is rated on is offered everywhere, which is how every journal behaved before
any of this existed.

A second field, **Carries**, sat beside it until 3.18 and is gone. It let a
kind list the trackers it held, and on Study that list restated the rating and
then added the trackers every kind had anyway — so it restricted nothing while
being one more row to get wrong. What it *could* do and no longer can is hide a
tracker a kind isn't rated on: if you had used it to keep Reviewed off one
kind, that kind is offered Reviewed again. Nothing you have logged changes.

### Designing a journal

**Settings → Journals → Add journal** is a four-step flow: Identity,
Structure, Sections, Create.

On the **Sections** step each template's list can be reordered with the
up/down arrows beside each row, and the schematic on the right redraws in the
order the file will actually be written. The banner stays first and cannot be
moved: it carries the spacer that keeps a click at the top of a note from
expanding the fence below it. Change nothing and you get the arrangement the
plugin has always written.

**Identity** is just a name and an emoji. The folders follow the name — a
journal called "Cook Book" gets `<journals root>/Cook Book` for its notes and
`<templates root>/Cook Book` for its templates — and both are shown beneath the
name rather than typed, the same way Settings → Paths shows every path that
follows a root. The built-in Study journal sits in exactly the same place, at
`<journals root>/Study`: the journals root is the folder journals live in,
and Study is one of them rather than the root itself. Once a journal exists its folders stop following the name, so
renaming it later is just a relabel; to actually move one, move the folder in
the file explorer and Almanac retargets the setting.

**Structure** is the folder depth and the note types, one row per kind: an
emoji, a name, what it's rated on, whether it can be split across **pages**
(like a Study Lesson — tick it and the type gets a Page template), and which
trackers it carries.

**Sections** is the interesting one. It lists the
templates your type will have down the left — one per folder level, one per note
kind — and on the right, the sections each of those templates can carry, with a
schematic of the arrangement beneath. Everything starts ticked as Study arranges
it, so Next-Next-Next-Create is a perfectly good way through, and you'll get a
journal with the same topics table, search box, review queue, charts, activity
heatmap and task rollup that Study has.

Which sections are offered depends on the template. An index note (a folder's
dashboard) can have a review queue, a search box and an activity chart; a leaf
note can have recall cards and a checklist. A top-level index gets the search
and the rollups because there's a tree beneath it worth searching; the deepest
index gets a path and a resources shelf instead, because that's where the notes
actually are. None of this is Study-specific — the same rules produce a Cooking
journal whose Cuisine index aggregates and whose Dish index lists recipes.

Study's own Subject and Topic dashboards are built from this same catalogue —
they hold no prose, so there was nothing to hand-write. Its Lesson, Practice and
Page templates stay markdown files, because their substance *is* prose you fill
in.

**The templates are written once, at Create, and then they're yours.** Nothing
regenerates them, there's no saved layout behind them and no "your layout has
drifted" nag — the markdown *is* the design. Editing them afterwards is editing
markdown, and adding a section later is the **Note: edit sections…**
command, which shows the change before it writes anything. (Existing journals have no Sections step
for exactly this reason: it could only either do nothing or overwrite a file
you've since edited. Use the command instead.)

Folder emojis are a **single vault-wide pool**, edited under Settings →
Journals → Folder emojis. A folder called Chemistry gets ⚗️ whether it's a Study
subject, a Cooking cuisine or a project area; a name that isn't in the pool
falls back to the emoji set on its level (📚 for a Study Subject, 📂 for a
Topic, whatever you chose for a custom level).

Every journal note — all four Study levels, and every level and note type of a
custom journal — carries a tracker grid in the banner at the top, the same grid
a diary entry has.
Confidence and Status are what the shipped templates put there; anything else
you define on that journal's surface is one tap away on the notes where it
applies.

One difference is worth knowing. Subject and Topic index notes have no `date`
of their own (deliberately — otherwise the topics table would report the day you
made a topic as study activity), so a tracker written on one is a **current
value**: readable, filterable, shown in tables, but never plotted. Lesson and
Practice notes carry dates and do form a series. Same tracker, two capabilities,
depending on where the value lands.

Journal trackers stay out of the **Add Chart** dialog for that reason — the
registry cannot tell in advance whether a given tracker will end up on dated
notes, so offering one there would mean charts that quietly draw nothing. The
`journal-chart:<tracker>` widget is the version that *is* available: one
tracker, one folder, read from the dated notes in it. The difference is that
the directive is written on a note, so the folder is known — which is exactly
what the Add Chart dialog doesn't have when it decides what to offer.

Its categorical sibling is **`journal-breakdown:<tracker>`**, which ranks
rather than plots — one bar per topic, weakest first. The two answer different
questions and both are worth having on a subject page: the trend says which way
you are going, the breakdown says where to go next.

Write either wherever you want it: `journal-chart:confidence` on a topic
index, `journal-breakdown:difficulty|How hard` on a Cooking section. It refuses,
and says why, if you point it at a diary tracker (the readings are in the diary,
not under this folder), at another journal's tracker, or at something
that isn't a number. `confidence-trend` is the same widget under an older
name and still works everywhere it is written.

**You don't have to write either by hand.** Subject and Topic index notes
carry a **📊 Charts** section with an **Add chart / Edit…** toolbar, the same
way your home, weekly and monthly notes carry **Trends and Statistics**. Press
**Add chart**, pick a shape (**trend over time** or **ranked breakdown**), a
tracker and an optional title, and it appears in the section. **Edit…** asks
which one when there is more than one, and its editor is also where you remove
a chart.

The editor only lists trackers that would actually draw on that note — so if
something you expected is missing, that is the same refusal above, arriving
before you add the chart rather than after. There is no range or time window to
choose, because neither shape has one: a chart reads the folder its note sits
in.

There is no **rolling average** tick either, and that one is a real difference
from a diary chart. A trend decides for itself: past about eighteen readings it
draws a dashed average through the line, and below that it doesn't, because a
smoothed line over a handful of points is the same line half a step later. So a
topic you have six lessons on stays a single line, and a subject with a couple
of terms behind it gains a guide through the noise, without either being asked
for. The dashed line is named in the chart's legend when it appears.

**Which note you put it on is what sets the scope**, and the editor tells you
what that means as you pick, in your own journal's words. A trend on a Topic
index plots that topic's own lessons; on a Subject index, every topic beneath
it. A breakdown on a Subject index gives one bar per topic; on a Topic index —
which holds notes rather than folders — one bar per rated note.

A note written before 2.35, or one you have added a chart to by hand, keeps
working exactly as it did: `journal-chart:`, `journal-breakdown:` and
`confidence-trend` are still ordinary directives. The section is somewhere to
keep them, not a replacement for them. To add the section to templates you
already have, run **Refresh journal templates (asks first)** — nothing rewrites
a journal template on its own.

### Moving and importing a journal

A journal's notes live in the vault; until 2.48 its *definition* — the
levels, the kinds, what each is rated on — lived only in `data.json`, inside
the plugin folder. Those two came apart whenever the plugin folder was replaced
or a journal folder was copied to another vault: the notes were all still
there, and Almanac had no idea they were a journal. It vanished from the
Journals banner and from Settings.

Each journal now keeps its definition **in its own folder**, in a hidden
`.almanac-journal.json` beside its top-level containers. It is written when the
journal is created, whenever you save changes to it, and for every existing
journal the next time you run **Maintenance: set up / repair vault**. Because it is *in* the
folder, it travels with it.

So **to move or share a journal, copy its folder**. Drop it under `03 -
Journals` in another vault, reload, and it registers itself — its section, its
buttons, its commands and any trackers only it uses. Copy its templates folder
too if you want your edited templates; without them the journal still works and
**Maintenance: set up / repair vault** writes fresh ones.

The manifest carries the journal's **trackers** as well as its shape: the ones
scoped to it, plus any custom tracker you scoped to *every* journal, since its
notes may well be logging one. Built-in trackers are left out — Almanac re-seeds
those on load, so a copy could only ever be stale. Importing never overwrites a
tracker the receiving vault already defines.

Trackers on the **diary** side are not part of any journal, so no journal
folder carries them and copying one will not bring them. They are covered
instead by the settings mirror below, which is what makes them survive a
reinstall.

Nothing is stored about *where* it came from, deliberately: the folder you
dropped it in is where it now lives, and its templates folder is re-derived
against the receiving vault's own paths. A journal whose id is already taken is
given a fresh one rather than colliding with the type that has it.

A folder that arrives **without** a manifest — one from before 2.48, or a
journal folder copied on its own — is **offered rather than taken**. It appears
under *Found in the vault* in Settings → Journals; **Review** reads the
folder and fills the journal form in from it, and nothing is registered until
you save. If it isn't a journal at all, dismiss it and it stops being offered.

The reason for the difference is that reconstruction has to guess at one thing.
Almanac's own generated files describe the journal precisely.
Almanac's own generated files describe the journal precisely: every template is
named after an id, and each kind's header bar sits in the same fence as its
create button, so the levels, their order, the kinds, their emoji, which kind
is paged and what each is rated on all read straight back. Only a lost
tracker's *type and range* are genuinely guessed — from the readings in the
notes — and the notice that reports the import says which. Check anything it
names in **Settings → Journals** and **Settings → Trackers**. A manifest is
written once it has been adopted, so this happens once rather than on every
load.

Discovery runs on load and never changes a journal already in Settings — if the
two disagree, Settings wins, because that is what you last said out loud. It is
cheap: restoring from manifests reads one small file per folder, and finding
out whether anything needs offering costs nothing at all, so no note is read
until you press Review. To look again without reloading (after copying a folder
in with Obsidian open), use **Maintenance: find unregistered journals**. A
folder under `03 - Journals` that shows no sign of being a journal is left
alone, as is Study's.

### If the plugin folder is replaced

Almanac's settings live in `data.json` inside its own plugin folder, so
replacing that folder — reinstalling, or copying a new build over the old one
— takes them with it. Journals survive that on their own (see above, each
carries its definition in its own folder), but everything else in Settings did
not: your paths, your folder emojis, and in particular any **custom diary
tracker** you had defined, which lived nowhere else at all.

As of 2.50 Almanac keeps a mirror of its settings at `.almanac-registry.json`
in the **vault root**. It is written as you change things and read back in
exactly one situation: there is no `data.json` at all. When that happens your
settings come back and Almanac says so.

The single-signal rule is deliberate. `data.json` stays the only thing consulted
in an ordinary session, so two machines syncing one vault can never trade
settings back and forth through the mirror — which would be a worse problem
than the one it solves.

The file holds everything in Settings except three things that describe a
moment rather than a configuration: which sections you had folded, anything
half-typed in the capture box, and which settings groups were open.

**To reset Almanac completely**, delete the mirror as well as `data.json` —
deleting `data.json` on its own no longer clears anything, since the mirror
simply puts it back. The notice you get after a restore says this too.

It sits at the vault root rather than under `00 - Infrastructure` because it
contains your **paths**: filing it under a configured folder would mean needing
the file in order to know where to look for the file, and a vault that had
moved its infrastructure root is exactly the vault whose mirror could not then
be found.

### Splitting a lesson across pages

A lesson that has grown too long for one note can be split. Press **New Page**
on it (or run *New page in this note*) and the lesson becomes a small
dashboard: the note moves into a folder of its own, keeps everything you had
written, and gains a Pages list at the top. Each page after that is a note
beside it.

The move updates every link pointing at the lesson, and nothing you wrote is
replaced — the Pages section is added above your content, not instead of it.
*Convert this note to a dashboard* does the same move without creating a page,
for when the reason is "this is getting long" rather than "I want to write the
next bit now".

Splitting a long lesson also makes it harder to *find*, which is why
**`journal-search`** exists: one large note is greppable in one place, five
pages are five places. The search indexes bodies, so a phrase you wrote on page
three is findable, and each result names the lesson the page belongs to. It is
on the Subject Index by default; put `journal-search:all` on your homepage if
you'd rather search everything at once.

**A page is not a lesson**, and that distinction does the work. Pages carry no
Confidence and no Status, never appear in the review queue, are not counted in
a confidence average, and don't show up in a topic's Lessons table. The lesson
stays the thing you review and rate; the pages are where its content lives. A
page's banner still names the lesson it belongs to, so you can always get back.

Only Lessons can hold pages — a Practice note is a set of exercises rather than
a document that grows.

### Reviewing

Three built-in journal trackers work together to say what is worth reopening:
**🎯 Confidence** (how well it stuck), **📌 Status** (whether it is still open)
and **🔁 Last reviewed** (when you last went back to it).

A note falls due again a while after it was last touched, and how long depends
on how confident you were: 1 → the next day, 2 → three days, 3 → a week,
4 → a fortnight, 5 → a month, counted from the last review or, if you have
never reviewed it, from the day you wrote it. Nothing is written to disk for
this — the due date is worked out from the two properties each time, so
changing a rating changes the schedule immediately and there is no third
property to go stale.

Completed and paused notes drop out of the queue: a finished note is not
homework, and a queue that keeps surfacing things you deliberately closed is a
queue you stop reading. Subject and Topic index notes never appear either —
they carry no date, so there is nothing to count from.

#### Testing yourself

The queue tells you *what* to reopen; the **Recall** field on a lesson is what
happens when you get there. Write your key concepts as question-and-answer
cards, and studying the note is pressing **Show answer** and then saying
honestly whether you had it.

That is the part that closes the loop. Confidence and Last reviewed used to be
things you set by hand, which meant the queue and the trend were only ever as
good as your willingness to rate yourself unprompted. Grading a card writes
both: the rating comes from how the sitting actually went — all right is 5, none
right is 1, and the rest fall in between — and the date is stamped in the same
breath, so the note reschedules itself the moment you finish.

Two things worth knowing about how it grades. It rewrites the rating after
*every* card rather than at the end, so a sitting you abandon three cards in
still counts — those are often the sittings most worth recording. And it does
not ratchet: a bad run lowers the rating, because Confidence is meant to say how
well the material stuck this time, not how long you have owned the note.

A recall block **on a page grades the lesson the page belongs to**, and says so
under the cards. Pages carry no Confidence of their own, so there is nowhere
else for the grade to go — and the lesson is the thing the queue schedules
anyway. On an index note, where nothing reads a Confidence rating, the cards
still study but grading is declined rather than writing a property that nothing
would ever look at.

That split is what makes an occasional tracker worth defining. Kilometres run,
weight, a migraine, a hangover — leave them off new entries and they cost you
nothing on the 350 days they didn't happen, but they're one tap away on the
days they did, and they still chart and still get a Diary.base column. Before
this the only way to log something now and then was to put its widget on every
entry of the year and leave most of them blank.

Both controls edit the note's own `tracker:` directives, so what an entry
shows is always readable in its source — there's no hidden per-note state, and
a note stays meaningful as plain markdown. The same actions are available as
the commands **"Add a tracker to this entry…"** / **"Remove a tracker from
this entry…"**, and as `button:tracker-add` / `button:tracker-remove` for a
dashboard that wants them as ordinary buttons.

The daily template is the one note where this is refused: its tracker region
is generated from Settings, so a directive added there by hand would vanish on
the next sync. Edit it in Settings instead.

Use `button:log:<id>:<delta>` for one-tap logging anywhere, without the
full stepper widget — e.g. a `+1 chapter` button on a book's own note. Its
label (`+1 📖`, `−0.5 km`) is generated from the tracker's own settings.

## Special events

Two kinds of dated thing that aren't diary entries:

- **Recurring** — birthdays, anniversaries, fixed-date holidays. A month and a day, repeating every year.
- **Single** — trips, sick days, milestones. One date, or a range of them.

Both are stored as one list in the frontmatter of **`02 - Diary/Events.md`** (configurable in **Settings → Special events**), under the `almanac-events` key. They live in the vault rather than in the plugin's config because an event is *content* — a fact about your life, the same as the mood score beside it — and content should stay readable in plain text without the plugin. The note also carries the `events` widget in its body, so the file that stores the list is the page where you manage it.

### Adding and editing

Three doors, one editor:

- **Settings → Special events** — the full list, with an **Add event** button.
- The `events` widget on the events note itself.
- **Right-click any day** on the homepage calendar — adds an event already dated to that day, or edits one already on it.

Plus the **New special event…** command and the 📖 ribbon menu.

Entering a run of holidays is what **Save and add another** is for: it keeps the icon, colour and kind, and clears the title and date for the next one.

### How they appear

- A **single-day event** shows its icon in the bottom-right corner of the day cell, in its colour.
- A **multi-day event** tints the days it covers and draws a connecting bar along the top of them, so a week-long trip reads as one continuous block across the calendar.
- Hovering a day lists everything on it, including which day of a span you're looking at.
- A day carrying more events than fit shows a `+n` counter; the tooltip still lists them all.

Decorations are a **Lucide icon** from a built-in set (grouped as Personal / Travel / Health / Work / Holiday / Other) and one of **eight colours**. Both are chosen from a picker — there's no free-text icon name or hex value, so a decoration can't end up invisible in one of the two themes.

### Events never create entries

This is deliberate and worth being explicit about. An event decorates a date; it does not journal it. A birthday six months out shows on the calendar as a birthday, but the day stays visibly un-journalled: no dot, no bold, and it isn't counted in "N/M days logged" or in any average. Entries are still created only when you click a day, use a command, or open today's diary.

The connection runs one way. When you create a diary entry for a date that has events, the new note records their ids in an `events:` frontmatter property, so the note itself knows what the day was — handy for a Bases column or for decorating the page later. That's written **once, at creation**. Adding an event afterwards doesn't reach back and rewrite old entries: an entry is a record of a day, not a live view of one. The calendars read the events list directly, so they always show the current picture regardless.

Turning the feature off (**Settings → Special events → Show special events**) hides every decoration and stops new entries recording events, but never touches the events note.

### Edge cases

- **29 February** is accepted, and shows on the 28th in non-leap years — the tooltip says so rather than pretending.
- A range typed backwards is corrected rather than rejected.
- The events note is hand-editable. One malformed row is dropped; the rest of the list is unaffected.
- Renaming or moving the events note in the file explorer retargets the setting automatically, like every other Almanac path.

## Charts

Any number, time, scale, or boolean tracker can get a chart: Line (trend, with
an optional rolling-average overlay), Bar (per-day totals), Summary
(avg/min/max/total as text), Calendar heatmap, Scatter (two trackers against
each other), or — for a habit — Streak (current run, longest run, completion
rate). On a scatter, days that logged the *same* pair of values merge into one
dot sized by how many they were — two self-reported daily numbers repeat
constantly, and stacked identical dots made one reading look the same as
twenty. Hover a dot for the count and the dates behind it. A boolean's raw 0/1 isn't offered as a line or bar (it reads better as a
streak or a rate), and streak is offered only for a boolean; everything else
charts as you'd expect. For the
range, the default **This period** follows the page it sits on — a chart on
the weekly overview shows that week, one on the monthly overview shows that
month, and it moves automatically as you navigate with the period buttons, so
there's no date to set. (The calendar and summary show the period exactly;
line and bar keep a trailing window ending at the period so a short week still
reads as a trend.) You can also pick a fixed **30/90/365 days** or **all time**
window that ignores the page's period. Charts live on your dashboards, not in
Settings. Open the home, weekly, or monthly note and, in its **📊 Trends and
Statistics** section, press **Add chart** — pick a tracker, a chart type,
and a range. Almanac reads the value straight from each daily note's own
frontmatter and draws the chart itself, so you never touch a query language.

**Changing the range from the chart itself.** Every chart tile carries its
current range as a small button in its title bar — `Page`, `30d`, `90d`, `1y`,
`All` — and pressing it cycles to the next one. That is the one chart setting
you change idly while reading rather than once when you create it, so it comes
out of the editor and onto the tile; everything else still lives in **Edit…**.
The change is written into the note like any other chart setting, so it sticks.
On a note that isn't a period dashboard, `Page` is left out of the cycle: there
would be nothing on the page for the chart to follow. If only one range applies
at all, the button stays as a label so you can still read the window at a
glance.

Charts render as a grid of tiles — two per row — so a section of trends reads
as one tidy set rather than a ragged stack. Each chart also has a **size**: how
much of that grid it takes. By default Almanac picks one for you from the chart
type and the length of the window it draws, because a trend and a calendar are
limited by different things — a year-long line chart is easier to read *wide*,
and a year-long calendar heatmap is easier to read *tall*. Set it yourself in
the chart editor if you disagree: **Small** (1×1), **Wide** (2×1), **Tall**
(1×2) or **Large** (2×2). The editor's **Auto** option names the size it would
choose, so you can see what you're overriding.

Because the automatic size is worked out from the window a chart actually
draws, a **This period** chart resizes itself as you move it: the same calendar
heatmap is a small tile on the weekly overview and a large one on the year
dashboard, without you editing anything. On a narrow pane — a sidebar, or a
split view — every chart drops to full width regardless, so a wide tile never
becomes two cramped half-charts.

The **Add chart** and **Edit…** controls sit in the section's own header bar;
Edit… prompts you to pick which chart when a section has more than one, and the
editor that opens holds **Delete** as well as the fields — so one button covers
both changing a chart and removing it, and the toolbar stays two controls wide
on a phone. The whole section is stored in the note as a
single `` ```almanac-charts `` block (one line per chart), so every dashboard
keeps its own set — the homepage is a good place for the full long-range
library, while the weekly and monthly overviews suit shorter rolling windows.
Line and bar charts render with a bundled Chart.js; the summary and calendar
heatmap are drawn as plain DOM — no Tracker plugin, so every date range shows
its data reliably.

Note: every chart reads each entry's date from the daily note's
`Day-YYYY-MM-DD` filename and filters the window in Almanac itself, so bounded
ranges (30/90/365 days, this period) are as reliable as all time. In the
calendar heatmap, each day links to its own daily note. Weeks in the heatmap
(and in the diary calendar) start on your locale's first day of the week, so
both grids always line up.

## What is on the homepage

A title card and three rows. The card at the top is the page's own name with a cog at its right — the cog opens the section editor, and clicking the name renames the note itself. Obsidian's own title above the note is hidden while that card is there, so the name is said once — remove the block and it comes back. **That is true on every page as of 4.21.3**: diary entries and journal notes drew Obsidian's title and their banner's copy of the same name until then. **Every Almanac page has a banner now**: the homepage, Search, the diary and journals folder notes, the four period overviews, and — as they always did — diary entries and journal notes. A banner is one block that says which note this is and where it goes, and one row in the section editor. On the dashboards and Search it carries the page's name, a row of destinations — Home, Diary, Journals — and the Today/scope pills beneath them, all in one card. The homepage's banner keeps just the name, because its **Go to** grid is already that row. Entries and journal notes carry no separate name line: their banner already names the note and renames it. Those two are drawn by one **slim banner** as of 4.21.1, where they used to be two separate drawings that had quietly drifted apart in height and put the cog in different places — so there are two banner formats in the plugin, a large one for pages you land on and a slim one for pages you write in, and both open with the note's name and put the row of destinations under it. Under the slim banner sits the **page-context section**: on a diary entry the title you give the day, set large, with the navigator between entries at the far edge, then a caption row carrying the entry's date opposite **Tracking:**, then a hairline and the logging grid; on a journal note the note's level and kind above the same caption row and grid. Clicking the title opens a field the same size as the words in it, and a date Almanac cannot read is left blank rather than replaced with the name of the grain. The banner cannot be removed — it is the way out of the page — where the plain title card could be before 4.19. On a folder note the name is the folder's, so a default vault reads **02 - Diary** there, and renaming it renames the folder too. Then the top row is two columns — the diary card on the left, and a grid of shortcuts (**Go to**) with your open tasks and this date in previous years stacked on the right; then the journals card; then the vault's charts. The top row is a single `almanac` block with a `row` line in it, which is what puts those three next to each other. A row wraps rather than squeezing: each cell asks for a minimum width, so the three are three across on a wide window, two and one on a half-width pane, and a plain column on a phone.

You can rearrange any of it from **Edit this note's sections…**. Unticking one widget of a row removes just that widget and leaves the row, whether it stood alone in a column or was stacked with another; a member whose lines cannot be told apart from its neighbours' is not offered **Take out of the group** at all, and the button says so rather than sitting there greyed with no explanation. A homepage you already have is not changed by any of this: Almanac writes that note only when it is missing, so to take the new layout, delete it and run **Set up / repair vault**.

## How wide the homepage is

A new homepage is written with `cssclasses: almanac-wide` in its properties, and Almanac gives that class a width of its own — wider than Obsidian's **readable line length**, and capped where that setting imposes no cap at all. It exists because of `row`: a row splits the page into equal cells, so with readable line length on (700px by default) a two-cell row leaves each widget about 345px and every one of them renders in its narrow layout. Whether your dashboard is wide or collapsed should not depend on a setting meant for how many characters read comfortably in a line of prose. It is a line in your note rather than a setting of the plugin's: delete it and the page follows your own preference again, and nothing will write it back. You can add the same line to any dashboard you build yourself. A homepage you already have is not touched.

## Moving a widget by dragging it

Every widget in a **group** has a grip — a small patch of dots, shown when you point at it, in the widget's own head or over its top edge where it draws its own band. Drag it and the **landing places** open up. You do not have to hit a line: every point of a block is one. A **group** gives every widget in it five places, reading outward — its **left or right edge** puts the arrival in a column of its own before or after that cell, its **top or bottom** puts it in the same column above or below that widget, and its **middle trades the two over**. A swap is undone by repeating it, which is why the middle is the biggest of the five. **Every other block** is all places — its top half puts the widget above that block, its bottom half below it, in a block of its own across the page, which is how a widget leaves a group; and where the block is wide enough — and where neither block draws its own title bar — its **left or right quarter** makes the two into one group side by side, which is how a group is made on the page. A block offers columns or places, never both. A 3px bar lights up on the edge the widget would land against, so you can always see the one place the drop means. Landing places only exist while something is in the air, and dropping a widget back where it came from changes nothing.

**Every block has a grip too**, over its top edge. Dragging it puts the block in a **place** — the top half of another block means "above that one", the bottom half "below it". A block holding a *single* widget can also be dropped into a group, as a column, or onto another block's side quarter to make a group out of the two.

**A section is not a widget, and only widgets become columns.** A block that draws its own title bar — a `header:` line, or `frame: section` — reorders like anything else and is never offered a side quarter, in either direction: you cannot drag it into a column, and nothing can be dropped beside it to make one. The reason is what a group is: its columns each carry their own head, and a bar belongs to the whole block rather than to a cell of it, so a titled section pulled into a row draws its title *under* the group it was meant to name. A block holding two widgets is refused for a different reason — which column they would go in is a question only the section editor can ask. Both refusals are silent on the page: the quarter simply never lights up, so you meet them before you have committed to anything. The section editor says why, on a **Make a group** button that is drawn and disabled with the reason in its tooltip.

**Edit sections…** still does everything a drag does and more: it plans the change and shows it to you before it happens, and it can add, remove and split as well as reorder. It is also the only place a **widget** can be added — see below. It is also where a group is broken up — **Take out of the group** gives a member a block of its own, **Break up the group** does that for every member at once, and **Make a group** / **Add to group** puts a section beside the one above it. Dragging is the fast path.

**Adding a widget.** *Edit this note's sections…* lists every page widget under **Widgets**, on the homepage, Search and both folder-note dashboards. It arrives as a fence of its own at the end of the note and is then a section like any other — it moves, it groups, it removes, and where the widget takes a folder or a fixed choice the row carries a control you can change later. A widget the page already writes is not offered twice, and where you write a second copy of one by hand, Almanac manages the first and leaves yours alone. Not offered: anything bound to one frontmatter property, anything owning a keyed region of the note body, the two banners, and the few whose argument names a tracker or a note type — the window has no list of those to offer you, and they still work written by hand.

**Every block wears a slim head** carrying its name — the same names Edit sections… uses, so what you rearrange there is called what you see here. A block that already has a header bar of its own uses that one, and a block nobody can name in one word gets no head rather than an empty bar. No grip appears inside an embed or an export, where Almanac cannot tell where the block is in the file.

## Reading mode on Almanac's pages

Almanac's own pages — the homepage, Search, the dashboards, journal notes and diary entries — open in **reading mode** rather than editing mode. They are pages of widgets, and in editing mode they show the Properties block and put a cursor in the raw directive when you click near one. Everything on them still works: the section editor, the cog on the title card, click-to-rename, every button and tracker.

**Ctrl+E still wins** — switching an open note to editing mode is never undone. Almanac only acts when a note is opened, so switching tabs away and back does open it again.

To stop it for one note, add `obsidianUIMode: source` to that note's properties. The same key works the other way on any note (`obsidianUIMode: preview`), and it is the key the *Force note view mode* community plugin reads, so a vault that already uses that plugin needs nothing from this one. There is no plugin setting for it: the decision is a line in the note.

## Folder notes

Double-clicking a folder in the file explorer opens its same-named note (e.g. `Development/Development.md`). A single click always expands/collapses the folder, same as any other folder. Toggle this off in the plugin settings if you prefer plain folders.

Almanac writes several of these for you, and they are the pages you land on: `02 - Diary/02 - Diary.md` is about the diary, `03 - Journals/03 - Journals.md` is about every journal at once, and **each journal's own folder gets one too** (4.36) — `03 - Journals/Study/Study.md`, and one for each journal you have. A journal's page opens with its name, a twelve-month activity band scoped to that journal alone, its contents as cards, and its open tasks; a Review queue, a Totals band, a Tally, a Tags cloud and a charts region are offered in **“Edit this note's sections…”** rather than written for you, because each of them draws nothing on a journal that has not got the thing it counts.

None of these paths is a setting. They are derived from the folders, so renaming a folder in the file explorer carries its page along with everything else under it — and the pages themselves write no folder into their directives, so nothing inside them needs updating either.

A journal's page is also the note the **journal cards** point at, and where a `banner:` property in the frontmatter is read from to give a card its image. Run **Set up / repair vault** to write any that are missing; a journal you make afterwards gets one as it is created.

## A note on paths

The plugin's create/scaffold logic, and every `almanac` widget (including `diary`, `month-summary`, `events`, `topics-table`, `topic-stats`, `tag-index`, `tasks-table`, `activity-chart`, `journals` and `journals-header`), follow the paths in its settings. **Settings → Paths** holds five fields — the homepage and the four roots — and every other path is shown read-only beneath the root it follows; changing a root moves them with it. Those fields only point Almanac at a folder, though. To actually reorganise, **rename or drag the folder in the file explorer**: Almanac watches for that and retargets any path setting that pointed at it (or at anything inside it), including each custom journal's own root, then tells you what it changed. The `tasks-table` blocks on the Weekly, Monthly and Staging overviews still carry their folder as plain text (e.g. `tasks-table:02 - Diary/Weekly`) — a Subject dashboard's block resolves its `{{folder}}` at creation, so it's plain text too — so after moving one of those folders, update the folder in the matching block — either by hand, or from **“Edit this note's sections…”**, where a folder-scoped section now carries a folder field with type-ahead (3.15). Leave that field empty and the block scopes to its own note's folder, which needs no such edit at all; `journal-search` and `review-queue` also accept **Every journal**. (Journal *templates* show the folder as read-only: one template is used in every folder of its level, so a path written there would follow into every note made from it.)

## Upgrading from before 1.5.0

1.5.0 removes the last `dataviewjs` blocks from this vault. Run **Maintenance: set up / repair vault** once after upgrading — it scans `Homepage.md` and every subject/topic index note, and replaces any unmodified, shipped `dataviewjs` block with its native widget equivalent. Blocks you've edited yourself are left untouched and reported (console + a summary notice) so you can swap them in by hand. Back up your vault (or use git) first, same as any bulk rewrite. Once migrated, Dataview can be disabled or uninstalled.
