# Changelog archive

The full, unabridged release notes for ChronoAnvil and for **Almanac**, the name
it shipped under through 4.84.

[CHANGELOG.md](./CHANGELOG.md) is the reader-facing summary of the 5.x series and
is the file to read first. This one is the long form: every 5.x entry as it was
originally written, followed by the entire Almanac era. Entries are reproduced
verbatim, including the ones whose `###` subheadings are prose sentences rather
than Keep a Changelog buckets.

**One section was repaired rather than copied.** 5.11.0 shipped — it is in
`versions.json` and both its zips are in the build archive — but its notes had
been renumbered as 5.12.0 rather than kept, so the released version had no
section of its own and a release built from its tag would have published "See
CHANGELOG.md" as its body. The 5.11.0 section here is recovered verbatim from
`chronoanvil-source-5.11.0.zip`, and the four bullets 5.12.0 had inherited from
it word for word are removed from 5.12.0, which keeps what 5.12 actually added.

## [5.18.0] - 2026-09-03

### Changed

- **The four preset journals ship the arrangement they were rearranged into.** All four were installed into a vault, moved around there with the drag grips and *Edit sections…*, and the result is now what a fresh install composes. What the six index templates agree on: **what is below comes first** — every index opens with its children table, because the page exists to get the reader into the folder and the numbers about it are what they look at second; **Find and Charts close the page**, a search box being a control the reader reaches for rather than a block they read past. Study's Topic index puts its learning path above its review queue, Projects' Project index does the same with its task manager, and a Block index in Exercise & Diet ships without the stats band — its two note tables and its charts region are what that page is for, and the band's four sums are the same four numbers the charts draw over time. Ticking Stats back on there still gives that journal's own sums rather than the generic band.
- **A leaf index draws the tracker grid and the stats band as one group with two tabs.** They were two bordered boxes stacked, saying two things about the same note, and the band was a block to scroll past on the way to the page's content. They are one box now, paged: each tab gets the fence's full width, which is what a band of four numbered cells needs and the reason 4.70 declined to put this pair in a row side by side. The group carries no title line — the head reads TRACKERS · STATS, derived from the cells themselves — and where there is no band, the grid stands alone under its own name exactly as before.
- **A journal's front page opens on the way in.** The activity band was the second block on every journal folder note, above the grid of shelves that is the only way into the journal; it now sits below the stats band, fourth. This is the shared catalogue rather than a preset, so every journal gets it, custom ones included. No page already in a vault is reordered — repair is additive and matches sections where they are.

### Fixed

- **A section re-added from the section editor goes back where its own template would have put it.** The plan ranked the arrival against the catalogue's order, which is the arrangement of a journal that declared none — so on a Study Topic index, whose layout puts the learning path above the review queue, removing the queue and adding it back landed it above the path. A file that came back a different shape from the one it went in as.
- **A row whose cell holds a managed region can come down to one cell.** "A row of one is not a row" counted the region's own `# chronoanvil:trackers:start` markers as widgets, so a fence holding a tracker grid could never fall below three of them: cutting the other cell left the `row` line, a stray page delimiter and no title behind. Blanks, fence lines and `#` comments are not widgets, which is the rule the drag engine already applies one file over.

## [5.17.0] - 2026-09-02

### Fixed

- **Page 2 of a group is a page, not a picture of one.** A group with pages is one fence and several rows, all of them in the document at once, and pressing [2] toggles a class rather than re-rendering — so the drag gesture, hung once against whichever row was open at render, stayed hung against that row. Every card on every other page had no grip, no landing places and a head that opened over something nothing could pick up. Grips and drop targets are hung on every page now; the column-width dividers stay on the open page, because a divider writes one page's widths into that page's own lines. And a card at the end of a page no longer opens its new column past the end of the *last* page — the fallback was the end of the fence body, which on page 1 of two is after everything on page 2.
- **A fence that is nothing but a tracker grid says so.** The same grid was a named card inside a group and an unnamed box on a note of its own — "Drag to move this block" over a widget with no name anywhere on it. The name it gets is the card's, exactly: 📊 Trackers. It is a fallback rather than an entry in the section-title table, so a fence holding a grid *and* something else still draws no head instead of announcing a part of what is under it, and a grid under a `header:` bar is untouched.
- **A widget's grab icon and its name are one control now, on one trigger.** The dots appeared on a hover of the whole card and the band naming what they pick up appeared only on a hover of the dots — so crossing a dashboard left a trail of grab icons for widgets it never named, and a reader who reached the band from the side or from below opened a name with no dots in it. Both now answer the same 10px strip along the top of the widget: hover it and the name and the handle appear together, hover the body and neither does. Every state that opens the band without a pointer on it — a drag in hand, a resize, a block being dropped into — keeps the grip lit with it.
- **A tracker grid can be picked up, and it carries its own region.** Every inline directive in a fence — `tracker:`, `sleep`, a slider, a button — is drawn into one bar, so the bar carried the line number of the first of them and a drag would have moved one tracker out from under the nine still drawn inside the thing being held. The bar had no grip at all rather than a wrong one, which left a head that named a widget nobody could move. It knows its whole run now, and for a tracker grid that run is the marked region itself: `# chronoanvil:trackers:start`, the cells, and the `end` travel as one and land as one. Its two places are the grid's own — above it and below it, below meaning after the last cell rather than after the first — and it offers no swap, because a swap trades one line and a grid is not one line. A declared region holding no trackers yet still offers no drag: there is nothing in it to move.
- **Every widget in a group row wears a head, and a tracker grid is no longer a field of loose grab dots.** A row's cells put a hover head on each widget they hold, and the head is what carries the widget's name and its grip. A tracker grid is not one widget, though — it is a band of inline directives (`tracker:`, `sleep:`, a habit chip) that a single fence line cannot address, so it was never named, and so it fell through to the loose-widget pass, which gave a grip to each of its parts. What showed on a group holding Trackers and Stats was a scatter of dots across the grid instead of the one hover header every other widget gets. The band is named now — the head reads **📊 Trackers** on hover, the same object the Stats card draws — and no part of a widget bar is a drag source anywhere: the bar is one head, not many. The bar carries no grip of its own because its lines live inside a `# chronoanvil:trackers:start`/`end` region that a line-range drag would carry its cells out of; the Section Editor is the surface that moves it.

## [5.16.0] - 2026-09-02

### Changed

- **Compact, mobile-friendly tracker cell proportions.** Scaled down tracker cell heights from 86px to 66px with 7px/10px padding and 3px gap, aligning the logging grid with the proportions of surrounding diary note sections. Scale rating face glyphs, habits chips, and sleep buttons have been proportionally refined for comfortable finger taps on mobile and compact desktop layouts.

### Fixed

- **Dropping a field on an entry no longer means "take it out of the entry".** A diary entry is one fence, and 5.14 gave each of its seven fields two places of its own: above this field, below it. It drew them with the numbers a widget in a *column* uses — a strip a fifth of the card high at each end, because in a column the middle is the fifth place, a swap. A stack has no swap, so the middle 60% of every field belonged to nobody, and underneath it lay the block's own two halves, which tile the whole fence and mean *beside all of it*. Aim at the middle of Highlights, which is where anyone aims, and what lit up was the accent bar on the entry's top edge. The two strips now tile the card, half each, so nowhere on a field means anything but that field; and the block's own bands move to its edges, the same reversal 4.54 made for rows when a group's cards had the same problem. Lifting a field out of the fence is still there — it is asked for at the strip above the block or below it, which is where "out here" is.
- **Seven fields, one gap.** The rhythm of an entry depended on which kind each field was: `tasks:` and the capture log had their wrappers stood down in 5.14 and sat 10px apart, while `note:`, `list:` and `attach:` kept a `0.9em` margin from when each was a bare box in a fence and sat 24px apart — and any field that happened to be last sat 10px again. Two fields dragged past each other swapped gaps as well as places, so the page re-spaced itself around every drop. All five wrappers stand down on the same condition now, and the gap between two fields is the block's, the same one between any two widgets anywhere else.
- **A diary entry no longer has a dragger for all seven of its fields at once.** An entry composes one fence holding Focus, Highlights, Challenges, Notes, Attachments, Tasks and Captured, and 5.14 gave each of those seven a grip of its own. The block's grip stayed, and it had nowhere to be: a group hangs its grip on its head and a section on its bar, but a bare fence has neither, so it fell back to the block's top edge — which is the first field's top edge. The result was two sets of dots at the top of the page, one meaning *Today's focus* and the other, silently, meaning all seven. It is withheld now rather than parked to one side. A fence holding a single widget keeps its grip, where the block genuinely is that widget, and the entry's fence is still somewhere other blocks can be dropped above and below.

## [5.15.0] - 2026-09-02

### Changed

- **Tracker cells are spacious, numberless, and uniform in height.** The logging grid cells now use an extra spacious, balanced height (`86px`) and increased top/bottom padding (`10px 12px`). Scale rating widgets (`Mood`, `Focus`, `Energy`) render clean, prominent, numberless face glyphs without cramped sub-numbers, while tooltips preserve numeric rating values.
- **Sleep tracker features dynamic time buttons with live sleep/wake duration.** Bedtime and Wake-Up sit side by side as dynamic buttons that morph from `[ 🌙 Bed ]` / `[ ⏰ Wake ]` into the selected time (`[ 🌙 20:57 ]` / `[ ⏰ 20:01 ]`) upon being set, with full-button clickability invoking the native time picker dialog and right-click to clear. The live duration readout (`😴 8h 15m / 15h 45m awake ☀️`) sits comfortably beneath with no clipping or crowding.
- **Tags tracker flows cleanly across two full rows.** The Tags container utilizes full vertical cell height without clipping, displaying up to 5 tag chips directly across two rows before spawning a compact `+N` overflow badge.

### Fixed

- **Date header navigator fallback.** Added fallback to filename ISO date in the date navigation trigger so the date label never collapses to an empty badge while frontmatter cache indexing is pending.

## [5.14.0] - 2026-09-02

### Added

- **The second cell of a row can be drawn as a widget too.** 5.12 gave the Section Editor's **how this is drawn** question to every journal section without an action row; the diary and journals dashboards never got it, and the sections it skipped were all the same shape — *⏳ Open tasks* on a period overview and on the journals dashboard, *🏷️ Tags* and *😴 Sleep* on the diary dashboard. That shape is why they were missed and why they needed it most: each is the SECOND cell of a row, and a cell that does not open a row composes no title, so it read as a section that had never had one rather than one that could take its title off. Each has a title of its own for whenever it stands alone, and now the toggle that decides whether to draw it. Inside a group the box is still ticked and disabled — a widget in a group is drawn as a widget by definition — so the question is about the cell left standing alone, which is the only place it has an answer. *📊 Trends and statistics* is still not offered it on either page, for the reason the rule names: **+ Add chart** lives in that bar and has nowhere to go without it. Neither is *🏷️ Tags* on the home page or a period dashboard, and that one is a limit rather than a policy: a Tags block is a `header:` line and a `tag-index` under it, and a section whose title is part of what it renders has an extent the editor can only guess at.

### Changed

- **Every field in a diary entry wears the same head.** An entry composes one fence — Focus, Highlights, Challenges, Notes, Attachments, Tasks and Captured — with no `header:` line in it, so each of those heads was drawn by the widget under it: four implementations, four heights, and two different sides for the chevron. Captured folded to a bare label, Tasks folded to a head still carrying its Compact toggle and a progress readout, and Highlights could not fold at all. All seven now draw the same head every section on every other surface draws: a card, a full-bleed title bar with the field's name at the section scale, its glyph in the same slot a section's sits in, the chevron on the right, the field's own controls on a strip under the title, and `--ca-sec-bar-h` as the collapsed height — so a closed field is not merely the same height as another closed field, it is the same object as a closed section. The fold is remembered per field per note, so a reader who closes Attachments on Monday's entry finds it closed there and open everywhere else. `note:key#collapse` still parses and no note is rewritten — it simply stopped being the only way to have a chevron.
- **Attachments has a complete frame.** The only box the field drew was the dashed drop zone, with the shelf's name and its ✕ floating above it — a head belonging to nothing over a body whose border said "drop target". The name is now the field's head, the ✕ and the *Add file* / *Add link* buttons sit in it, and the dashed edge stays where it means something: on the zone inside, which is what you drop onto. (The paste hint under it was also being drawn twice; it is drawn once.)
- **Highlights and Challenges are two fields, not one welded box.** They shipped in 2.11 as a single bordered box with a divider and their labels inside it — two fields sharing one border, the only labels inside a box, and the only fields that could not fold. They are two ordinary fields now, grouped by being the same object rather than by being fused into one. They remain two regions on disk, which was the only part of the original argument about storage: a year-in-review digest is still a region read, and no month note changes.
- **Every widget in a bare fence has a grip of its own.** A diary entry composes its seven fields into one fence, so the page drew seven cards and offered one grip — on the block's top edge, which is the first card's top edge, so *Today's Focus* appeared to be the only field that could be picked up and the other six appeared to have lost something. Each widget in a fence that draws no title of its own now carries its own grip, with a landing place above and below every other widget in the same fence: drag a field to reorder it, and the entry's order is the reader's again without a trip to the Section Editor. Nothing changes in a row, where each cell has drawn all five of its places since 4.8.6, and nothing changes in a fence that titles itself — there the lines are a section's body, and putting a table above the head that names it is a question the Section Editor asks properly and a gesture cannot. The block's own grip steps left and up into its margin where the two would otherwise land on the same two pixels.
- **A resources shelf's ✕ is always drawn.** It was invisible until you hovered the shelf, which was right in 3.19.2 when it floated at the end of a bare label row. It sits on the field's own head now, beside *Add file* and *Add link*, and one invisible control in a row of three reads as a control that is missing rather than as a quiet one. Still muted, still red only under the pointer, and still dimmed on a shelf that has files in it — which now says something, because everything around it is lit.
- **A group whose fence has a `header:` bar draws no second head.** *Lately* on a journal dashboard is one fence — `row`, `header:🕒 Lately`, and the two widgets — because a bar in a row fence is drawn once, full width, above the columns: a bar is a section's title strip and a row is one section, which is why the shipped catalogue words that bar for the whole band rather than for the column that happens to write it. The group's own caption therefore restated it — `LATELY · OPEN TASKS` immediately under a bar reading *Lately* — inside a card that was already inside the section's card. The bar is the group's head now, so no caption is drawn under it and no box around it; the group keeps its foot, because the page numbers and the `+` have nowhere to go on a section bar. This is the rule 5.14 gave fields, asked of a row: a head is withheld wherever something already names the thing. A group in a fence that titles nothing — the home page's — is unchanged, and so is a group in a later block of a section run, where the bar above names the section rather than that group.
- **A group is the same box on every surface.** A group under a `header:` bar stood its box down entirely — no border, no ground, no padding — on the argument that a section is already a card and a second border inside one is two borders arguing. That held while the only thing a group said about itself was a 14px strip along its foot. It stopped holding the moment the group grew a head: a caption naming three cards, with the grip on it, announces a container, and then nothing contained anything — the strip floated over two loose cards with no edge under them or beside them, while the identical group on the home page was a framed panel. The box is drawn everywhere now, and the two places it is still withheld are both cases of somebody else already drawing it: a block whose `frame: none` says the reader wants no chrome at all, and a group that drew no head because its fence has a bar.
- **And every group has a foot, with the `+` back in it.** The foot was drawn only where there were page numbers to put in it, which gave a two-page group two strips and a one-page group one — the same object with two silhouettes, decided by something nobody was thinking about. It is drawn on every group now, and the control that splits a page off comes back down into it: on a one-page group that foot is where the first page is *made*, and on a paged one the `+` sits beside the numbers it adds to. The head keeps the caption and the grip — naming the box and picking it up are what a top edge is for. The mark that says which group the page keys will drive is painted on the foot, so it now has somewhere to land on every group rather than only on the ones that already had pages.
- **A widget group has a head, and its grip is on it.** A group drew a box around its columns with a slim strip along the *bottom* carrying the grip and the `+`, and nothing at all along the top — so the homepage's three cards read as three blocks, and the one control that picks the group up was somewhere a reader had to hover to find. The group now opens with a caption naming what is in it, derived from the cards themselves (*TODAY · OPEN TASKS · LOGBOOK*) and re-derived when you switch pages, with the grip centred on it like every other grip on the page and the `+` at its right. The foot is drawn only where there are pages to number; a one-page group no longer carries an empty strip.

### Fixed

- **A section broken out of a group comes back with its title.** **Break up group** on *📖 Inside this week* moves *Open tasks* into a fence of its own, and that fence arrived empty of any title — so a section the reader had never toggled rendered as a loose widget, and the page asserted an answer nobody had given. A cell that stops being a cell is now handed the title its catalogue declares, at the moment it stops being one, which is the same line the composer would have written had the section been asked for alone. A fence that titles itself is left exactly as the reader has it, in their words or through `frame: section`; a section that was already alone is not offered a second bar; and a cell moved back INTO a group has the borrowed title taken off again, so the round trip is the note it started as.
- **The missing-title repair no longer argues with the new toggle.** 5.12 taught the repair to stay quiet wherever a section offers the widget form, and named *⏳ Open tasks* in that release's notes as a section that has no such form and is therefore still offered its line. Those sections have one now — and the repair had a second rule that outranked the first: a section declaring a title to take back when it leaves a row was offered that title whatever it answered. The two could not collide until this release, because no section did both. The question wins now, on every surface: a section that can be asked to be a widget is left with whatever the reader answered, and only a section that cannot be asked is offered the bar it is missing.

## [5.13.0] - 2026-09-02

### Changed

- **"What's below this note" is one section again.** On the deepest level of a note type — a Study topic, a Recipe book's book — the index composed one full-width title bar per kind of note under it, so a topic opened with *📖 Lessons* and *🛠️ Practice* stacked as two section-tier heads inside a single fence that the Section Editor lists, correctly, as one section. Two bars of the same rank in one card, and no name for the card itself: the page read as sections nested inside a section. The fence now opens with one bar that names the whole — *🗂️ What's below* — and each kind under it takes a quieter group head, uppercase and muted, hairline above rather than below, with its own create button inline in it. The section bar carries no action of its own, because there is no action left for it to carry: every one of them adds rows to a group, so every one of them sits beside that group's name. One card, one name, one fold. A note type with a single kind is unchanged in every byte: its section bar keeps that kind's own name (*📖 Lessons*), because a name a reader recognises beats a generic one and there is no second head for it to be confused with.

### Fixed

- **A second title in one block no longer draws a second section.** `header:` has parsed an explicit level since the bar existed (`header:2:🛠️ Practice` folds only its own body and keeps its actions inline), but nothing said what a *bare* second `header:` in the same fence meant, so it took level 1 like the first. It now takes level 2: a bare head that is not the first titled head of its fence is a group inside that section, and an explicit `header:1:` is still left exactly alone. The rule is stated once and read by the renderer, so a note already in a vault reads right on the next repaint without its file being touched.
- **A page composed before this release is offered the one line it is missing.** The 5.10 missing-title repair could not reach this shape: a fence full of `header:` lines answers "is this a section fence?" yes, so the repair saw a titled block and stayed quiet, while the line it lacked was the bar naming the section over the groups. The Section Editor now counts instead of guessing — a run whose group heads are all present, and whose titled heads number exactly those groups, is missing its section bar and is offered it as a single line at the top. A bar you renamed is left alone, a fence short a head declines, and a second pass is a no-op.
- **The section's own bar no longer offers to rename a note type.** The title box over *🗂️ What's below* asked to rename a kind, because the one `header:` in a fence used to be both the section's name and the kind's. Where a fence carries several heads, only a group head names a kind; a fence with one head still renames from it, which is what a single-kind index and every 5.11 note rely on.

## [5.11.0] - 2026-09-01

### Added

- **A journal note's groups are in the Section Editor.** The Study subject page has shipped a two-column row since 4.70 — *🔁 Due and open* holding the review queue beside the open-task table — and the editor could not see it: no group card, no **Break up group**, and both columns labelled *Section* in the list. Journal notes now answer the same two questions every other surface answers, so a group on the page is a group in the window: it can be broken apart, cells can be moved between rows, and a new one can be made.
- **Any journal section that is a title over one widget can be drawn as a widget.** The Section Editor's **how this is drawn** question — *a section of its own, with a foldable bar* or *show as a widget, so it can sit in a row* — now reaches *🔎 Find*, *🔁 Review*, *⏳ Open tasks*, *📈 Progress*, *🔢 Stats*, *🧮 Status* and *🏷️ Tags* on every journal note. A section is not offered it where the answer would be a lie: a title over an action row, a region the plugin writes into between markers, or a fence of another kind. This is what makes grouping possible at all — a fence that titles itself is a section, and a section cannot be a column, so a section had to be able to take its title off before it could join a row.

### Fixed

- **The 5.10 missing-title repair no longer overwrites an answer you gave.** A block with no title above it has two causes once the toggle exists — a page composed before the title, and a reader who asked for the widget form — and the repair could not tell them apart, so it offered the title back and the next save took the answer away. It now stays quiet wherever the section offers the choice, on journal notes, dashboards, the home page and every period dashboard. A section that has no widget form, such as *⏳ Open tasks*, is still offered its missing line.
- **An empty strip of card hung under the last section on a page.** A section owns the blocks after its bar, and the blocks that store a section's own data — the three `<!--chronoanvil:res-*-->` regions under *📚 Resources*, and the graph link at the foot of every note — draw nothing at all. Those got the section's background and its two side borders while the rounded bottom edge sat on the last block a reader could actually see, so the card closed and then a second, open-ended band of surface hung below it. It went away when the section was collapsed, which is why it read as a rendering artifact. The surface now stops at the last visible block; the invisible tail still belongs to the section and still folds with it.
- **A page banner could be grouped.** The rule that keeps a page's own header out of rows named the flat notes' `title` keyword only, so a journal note's `journal-header` and a diary entry's `entry-header` were treated as ordinary one-line widgets: each could be reported as a column and a cell could be moved into it. All three heads are now known by the same rule.

## [5.12.0] - 2026-09-01

### Added

- **Any journal section without an action row can be drawn as a widget.** The Section Editor's **how this is drawn** question now reaches *📊 Trackers*, *🔎 Find*, *🔁 Review*, *⏳ Open tasks*, *📈 Progress*, *🔢 Stats*, *🧮 Status* and *🏷️ Tags*. The rule is exactly the one it sounds like: a section is offered the choice unless something in it is anchored INTO its title bar — *🗂️ Topics* has **New Topic** there, *📊 Charts* has **+ Add chart**, *📚 Resources* has **Add category**, and those buttons have nowhere to go once the bar does. The tracker grid's **+ Add tracker** is a tile in the grid rather than a button in the bar, so it travels with the widget. This is what makes grouping possible at all — a fence that titles itself is a section, and a section cannot be a column, so a section had to be able to take its title off before it could join a row.

### Changed

- **The section/widget toggle says "Show as widget".** It read *"Show as a widget, so it can sit in a row"* — a paragraph in a row of eight sections, where the questions beside it are a phrase. The reason it was spelling out is now something the window itself does: a group can be made here, so a reader who wants one meets the answer where they make it.

### Fixed

- **A section with a logging grid swallowed the block under it.** `📊 Trackers` and its marked region are one fence, so the section ends with its own block — but a `header:` bar takes the fence's widget row INTO its own actions slot, so the tracker cells render inside the bar rather than beside it, and the rule that asks "did this fence draw its body?" looked past the bar and found nothing. Trackers therefore behaved like a title with no body: on a Study topic index it drew the untitled stats band under it inside its own card, and collapsing Trackers folded the stats band away with it. A section's controls still do not count as its body — *📖 Lessons* keeps **New Lesson** in that slot and keeps owning its table below.

## [5.10.0] - 2026-09-01

### Added

- **Unified section framing & collapsible headers for Recall and Tasks.** Standardized Recall (`🧠 Recall`) and Tasks (`✅ Tasks`) sections with first-class collapsible section header bars and full-width card framing matching all other sections in custom journal notes.

### Fixed

- **Anchored drag grabber handle in section header bars.** Fixed an issue where the 6-dot drag handle (`.ca-jbd-handle`) on sections such as `Trends and statistics` and `Open tasks` floated into the empty margin above section cards, anchoring it cleanly at the top-center of the section header bar.
- **De-nested Recall and Tasks card surfaces.** Stood down duplicate inner card backgrounds, borders, and private fold headers when Recall and Tasks are rendered within section block frames.
- **Two chart sections drew their header under their own content.** *Trends and statistics* on the home page and *Charts* on a journal note built their title bar into the block rather than into the box they had just filled, so the section rendered upside down: *"No charts yet — use Add chart above."* printed above the header, with the **+ Add chart** button below the sentence pointing at it. Collapsing such a section closed nothing, because a fold hides what comes after the bar and nothing did. Both are the shared renderers, so the repair reaches journal notes, the journals dashboard, the home page and every period dashboard at once.
- **Trackers and Recall each drew a second header.** Both grew a private fold bar of their own — chevron on the left, no hairline, no glyph slot — while the section they sit in already had one, and the stylesheet was left hiding whichever bar lost. On the tasks region the bar that lost was the one carrying the **Compact** toggle and the progress readout, so both controls silently disappeared from every Study note. Each section now has exactly one header, the shared one, and the tasks controls sit in its actions row.
- **The Journals card and bridges folded differently from everything else.** Both wrote their own fold: a chevron on the LEFT, their own click handling, their own collapsed rules. Their chevrons now sit on the right with every other section's, and a collapsed one hides its actions like the rest.
- **Sections collapse to one height.** A closed section is its title row and nothing else, so what it happens to carry — a count pill, a muted phrase, an actions strip — no longer decides how tall it is.
- **A tally said nothing about itself.** `journal-tally:<tracker>|Label` drew that label nowhere, and two tallies on one page were two unlabelled strips of numbers. A tally now names what it counts wherever nothing else names it, and stays quiet under a section bar that does.
- **A note written before a section had a title gets offered the missing line.** Any section whose composed form opens with a header bar, on a note that has the block but not the bar, is now reported by the Section Editor as needing a title — writing it adds exactly one line and changes nothing else. `📊 Trackers` and `🔢 Stats` are the sections this reaches today.

## [5.9.0] - 2026-09-01

### Added

- **Section header bars for Trackers and Stats Band.** Trackers and Stats Band sections now consistently feature standard collapsible section header bars (`📊 Trackers`, `🔢 Stats`) across journal and dashboard templates, ensuring visual unity with Open tasks, Review queue, and other section surfaces.

### Fixed

- **Status tally section frame size & header alignment.** Replaced the inner nested foldable card with direct card rendering inside the standard outer section frame, matching the full width, collapsible chevron, and drag grabber alignment of other sections.
- **Review Queue drag grabber visibility.** Restored hover drag handle visibility on the Review Queue section.
- **Remnant section drag handle positioning.** Fixed section drag handles (`.ca-jbd-handle`) overflowing into the margin above section headers on dashboard and overview notes, anchoring them cleanly inside the header bar.
- **Deduplicated Trackers card surface.** Eliminated double card backgrounds and inner border padding when the Trackers section is rendered within a section block frame.
- **A row's surviving cell keeps a title.** Sections that share a row are titled once, by the cell that opens the row — so unticking that opener left the cell beside it drawn as a loose widget with no header bar. Open tasks was the visible case (beside Review on a journals dashboard, beside the rollup on a period dashboard), and Tags, Sleep and the diary's own task table had the same shape. A cell that is left alone in its row now composes its own title, on every path: composing a page without the opener, cutting the opener out of a page you have, and adding the cell back afterwards. Pages already written this way are repaired in place — the Section Editor reports the block as needing a title and adds the one line, which no gesture could do before. A fence you titled yourself, or one framed as a section, is left exactly as it is.
- **The journal tally wears the section frame.** The tally drew a private fold bar — a label and a chevron on the left, with no hairline under it — which is the bar a `note:` field wears, not a section. Sitting between Find and Charts, both of which wear the section frame, it read as a widget left loose on the page. It now uses the same collapsible frame as every other section: hairline divider, glyph in its slot, chevron on the right. It still titles itself from the tracker it names, and a tally you had collapsed stays collapsed.

## [5.8.0] - 2026-08-31

### Added

- **Harmonized note section headers & collapsible tracker section.** Standardized section header styling, typography, and container padding across Trackers, Recall, and Tasks note sections. The Trackers section now includes an interactive chevron fold toggle with persistent per-note fold state.

### Changed

- **Compact Pages section layout.** Replaced the oversized empty callout in the Pages table with a slim, subtle inline empty state and refined list row spacing for a balanced vertical rhythm.
- **Streamlined tracker card.** Removed the redundant "Subject" / context strip from the trackers card to keep tracker items prominently visible and uncluttered.

## [5.7.0] - 2026-08-31

### Added

- **Recall widget surface framing and collapsible header.** The Recall widget now renders with full surface styling and a collapsible chevron toggle, providing visual consistency across study note widgets.

### Fixed

- **Resilient active note resolution on page creation.** Resolved an issue where creating a new page or converting a note into a dashboard immediately after using the Section Editor could trigger a spurious "Open a note first" notice. The plugin now resolves active markdown files across four tiers (active file, active MarkdownView, open markdown workspace leaves, and last open files) with regex frontmatter parsing fallbacks.
- **Prose skeleton persistence across section moves.** Resolved a bug where moving the prose skeleton (`headings`) after sections with body-backed region comments (`recall`, `tasks`) or before the banner caused it to be absorbed into adjacent raw segments and disappear when reopening the Section Editor.
- **Section ordering preservation on Save as Default.** Fixed template default persistence so saving a reordered note as the default properly updates both `order` and `sections` in storage, ensuring custom placements (such as prose skeleton at the bottom of pages) persist reliably across new page and note creation.

## [5.6.0] - 2026-08-31

### Added

- **Time-grid filter toggles state persistence.** The time-grid widget now remembers which source filter chips are active or toggled off across reloads, note navigation, and workspace restarts.
- **Logbook widget reactive updates on capture.** Capturing thoughts into a logbook via Quick Capture immediately updates and re-renders both single-book and multi-book logbook widgets on screen without requiring a reload.
- **Dedicated Edit column in Trackers settings.** Replaced the redundant "Surface" column with a clean "Edit" column across Built-in Diary, Built-in Journals, and Custom trackers tables, eliminating action button and toggle switch collisions.
- **Improved Timegrid resize hit-targets and context actions.** Enlarged the resize drag hit-area with hover affordances and added right-click and long-tap gestures to quickly open/edit blocks and chips.
- **The prose skeleton can be removed, and removing it keeps what you wrote.**
  It was the one section a journal note would not let go of, and the reason was
  honest as far as it went: the skeleton is real `##` markdown, so the plugin
  could not tell its `## Notes` from one you typed. It says so at the block, and
  every surface downstream agreed — the row's subtitle read *"delete it by hand"*
  and the change list refused to plan a removal. What was actually true is
  narrower: prose with nothing around it cannot be identified. The headings now
  sit between two HTML comments, invisible in reading view and in any renderer,
  and everything downstream started answering differently without being told to
  — `sectionRemovable` derives removability from the block kinds and was not
  amended, exempted or special-cased.

  Removal is by heading rather than wholesale, because your writing is not in a
  container of its own — it is under the headings, interleaved with them. A
  heading with nothing beneath it is scaffolding and goes; a heading with a word
  beneath it stays, with everything under it, and the change list names each one
  it is keeping before you press Save. Untick the skeleton on a note you have
  not written in yet and nothing is left behind — no headings, no markers, no
  gap where they were. The rule is about emptiness rather than authorship: a
  heading you retitled and wrote under is kept even though no layout has ever
  mentioned it, and an untouched `## Overview` goes even though every layout
  does.

- **You can write the heading list yourself, in the section editor.** The row
  now carries a box holding the note's headings, one per line. Reorder them,
  rename one, add one, delete one — the change list previews it and Save writes
  it, and **Save as layout…** then makes that list the one every note of the
  kind opens with. Editing the headings in the note itself has written them
  into the layout since 4.33 and nothing on screen had ever mentioned it; now
  the gesture is a control, and the section's own line names the layout save
  beside it.

  The list is applied to the headings you already have rather than composed
  from scratch, so a heading keeps everything written under it while it moves.
  A heading you take out of the list but have written under is not deleted — it
  survives at the end, and the change list says so before you press Save. One
  taken out that only holds the wording the template shipped does go: the test
  is whether the words under it differ from the ones ChronoAnvil put there,
  which is also now the test removal uses, so untick and relist can never
  disagree about whose paragraph it was.

- **Saving a layout carries the skeleton's headings and no others.** The same
  markers give that save an extent. A `## Scratch` typed at the bottom of one
  Lesson, below everything the template wrote, used to be baked into every
  Lesson made afterwards — there was nothing on the page that said where the
  skeleton stopped, so the save took every `##` in the file.

### Fixed

- **A note written before this release keeps the old answer, and says why.**
  Its skeleton has no markers, so the plugin still cannot delimit it — the
  section is reported as kept, the box is not drawn, and the row says why
  instead of stopping at *"delete it by hand"*: **Reload this page** composes
  the skeleton again, this time bracketed, and both come back. Nothing migrates
  a vault, and no note changes under anybody.
- **The settings tab no longer throws you back to the top on every change.**
  Twenty-five handlers end in a full repaint, which is the right shape — a
  change to one setting can change what another one says — but repainting
  empties the container, and emptying it collapses the scroll height, so the
  page snapped back to the masthead. Reordering a custom tracker made the cost
  plain: the arrow buttons sit three quarters of the way down the Trackers
  group, so moving a tracker two places meant scrolling back twice. Handlers
  now go through a repaint that finds the scrolling element, redraws, and puts
  it back where it was. The scroller is found rather than assumed — walking up
  while `scrollTop` is zero cannot pick the wrong element, and hard-coding
  Obsidian's would have made the fix silently do nothing anywhere else.
- **A repaint keeps your search and your category.** Both lived in locals
  inside the draw, so any change wiped the search box and put the pill back to
  All Settings. They are the tab's state now, and the tab is drawn already
  filtered rather than drawn and then filtered — so a group your query has
  hidden never flashes in before being taken away again.
- **Searching no longer leaves groups permanently expanded.** A search opens a
  group to reveal a match; it does not re-decide whether that group is open,
  but the fold listener could not tell the two apart, so one search for a word
  that appears in Paths left Paths — and every other group the word reached —
  expanded in `data.json` for good. Clearing the search now puts every fold
  back to your own answer. Implemented as a marker on the element rather than a
  flag around the loop, because `toggle` on a `<details>` is queued rather than
  dispatched and a flag would have been lowered before the first event arrived.
- **Picking a longer value no longer shifts every row below it.** A settings
  row's control was sized to its own contents, so a longer answer widened the
  control, narrowed the description beside it, re-wrapped the description and
  moved everything under it down the page — changing **Aesthetic preset** from
  "3. Technical HUD (Monospace Telemetry)" to "1. Editorial Monastic (Default —
  Serif & Warm Parchment)" shifted the four settings below by 9 px. The control
  column has a fixed width now. Its right edge has not moved; what stopped
  moving is the left edge, which is the one the description is measured
  against. Narrow panes, where the description sits above the control rather
  than beside it, release the width as before.
- **The three tracker tables share one column grid.** Built-in diary, built-in
  journal and custom carry the same five headings and stack in the same group,
  and each sized its own columns from its own rows: "Surface" started at x=1057
  in the first table and x=1017 in the third, so scanning down the group meant
  re-finding the grid three times. All three are handed the same set of column
  widths. Below the width at which the longest shipped content still fits, the
  wrapper scrolls rather than the columns crushing.
- **The capture matrix's headings sit over the switches they name.** A `th`
  inherited the table's left alignment while the cell centred its content, and
  centring stopped at the outer wrapper — Obsidian's own control justifies to
  its far end — so every switch but the first sat 9 px left of the column's
  middle. Both ends of the column are told the same thing now, and the five
  grains share the width evenly instead of each taking its heading's.
- **The derived paths under a root line up.** The label column was a minimum
  width, which aligns the values of every row whose label is shorter than it
  and ragged-edges the rest: under **02 · Diary**, "Quarterly entries" and
  "Period dashboards" started their paths 10 px right of the other eight. It is
  a grid track measured against the labels it actually has.
- **A wizard's footer stays where you aimed.** Obsidian centres a modal, so a
  step 200 px shorter than the one before it does not just shrink — the window
  moves up and takes Back/Next with it. On the journal wizard, Next sat at
  y=700 and the pair that replaced it at y=588. The body is now floored at the
  tallest step drawn so far: measured rather than declared, because no number
  written in a stylesheet knows how tall a step comes out on a reader's font
  and pane, and grow-only, so the frame can still expand for a later step and
  can never snap back.
- **The calendar heatmap now fits the tile it is drawn in.** Both layouts sized
  their cells from one flat token — 13 px for the year strip, 26 px for the
  short calendar — so the graph's surface and the tile's had nothing to do with
  each other. Measured on a 1050x450 tile, a 30-day window drew a 182x156 block
  of squares marooned in the middle of it and a year strip drew 109 px of cells
  in the same box; both read as a rendering fault rather than as thin data. The
  cell size is now solved against the tile on **both** axes with container
  units (`container-type: size` on the tile body), so a heatmap grows to fill the
  room it was given and stays a grid of squares while doing it. The calendar
  fits on both axes at once — neither is fixed, so it can honestly satisfy both;
  the strip fits on height alone. No resize listener was added — the fit is
  intrinsic, for the same reason the journals activity strip's is.
- **A heatmap that cannot fit now scrolls instead of clipping.** The tile body
  was `overflow-x: auto; overflow-y: hidden`, so a quarter's worth of week rows
  taller than the tile were cut off with nothing to say so. It is `overflow:
  auto` on both axes, and the cell size clamps to a legible floor (14 px short,
  8 px year) rather than shrinking to specks — the floor is what turns "too
  small" into a scrollbar. Centring is `safe`, so the overflowing start edge
  stays reachable and a year too wide for its tile can still be scrolled back
  to January.
- **The grid's orientation is now chosen by the period.** A week or a month is
  a *calendar* — seven weekday columns, one row per week, the shape a month is
  read in. A quarter or longer is a *strip*, transposed so the weeks run left to
  right beneath seven fixed weekday rows. The crossover is a quarter, and it is
  a measurement rather than a taste: ninety days as a calendar is thirteen rows
  of seven squares, which on a 1050x411 tile drew a 210 px column of cells with
  800 px of empty tile beside it; the same window as a strip is fourteen columns
  of seven and fills that tile at twice the cell size. The threshold is exported
  as `HEAT_TRANSPOSE_DAYS` and read by both the renderer and the tile-size rule,
  so the two cannot disagree again — 5.5.0 transposed at a year while the size
  rule went on saying `tall`, handing a seven-row shape the one axis it cannot
  spend.
- **The strip sizes itself from the height and scrolls sideways.** Fitting it to
  the *width* — which the first cut of this work did — makes a year land flush
  against both tile edges at 13 px a cell, and seven 13 px rows is 109 px of
  graph in a 411 px box: the same zoomed-out picture the flat token drew,
  arrived at honestly. Seven rows is a constant, so height is the only thing
  that can make a day legible, and the weeks are a timeline that has always been
  longer than the box. A quarter now fits whole at a 50 px cell; a year fills the
  height and scrolls, rendering already scrolled to the most recent week, with
  drag-to-scroll on the body. Its gap grows with the cell, so the gutter that
  reads as a mosaic between small cells does not read as a hairline between
  large ones.
- **The strip's last weekday row was clipped by its own scrollbar.** The strip
  overflows sideways by design, so on any window worth scrolling a horizontal
  bar is always present and takes its height out of the container — the fit
  sized seven rows for a box that then held eight rows' worth, and Saturday was
  cut off the bottom of every year. The bar's height is now reserved
  unconditionally rather than reacted to, since a term that appears only when
  the bar does is the oscillation the cell floor exists to avoid.
- **The strip opens on the newest day that has a value.** It scrolled to
  `scrollWidth`, which on a window running to the end of the calendar year opens
  on empty autumn cells — and the measurement was taken in a `setTimeout(0)`,
  before the container query had resolved the cell size, so the grid was often
  still at its pre-layout width and the scroll silently did nothing. The same
  chart would land at January or at August depending on timing. It now anchors
  to the last populated cell, measured in a frame that has been laid out.
- **The strip's weekday rail read "T / T / S".** It labelled rows 1, 3 and 5,
  which are Monday, Wednesday and Friday only when the week starts on Sunday; on
  a Monday-start locale the same indices pick Tuesday, Thursday and Saturday,
  and two rows sharing an initial looks like broken initials rather than like
  every other row being labelled. The rows are chosen by weekday now.
- **A transposed heatmap is the one chart that gets a 2×2 tile by default.** It
  is the only shape short of both axes at once — height buys a legible day,
  width buys visible weeks. Measured on a 1080 px dashboard, a `wide` tile is
  181 px tall and yields a 21 px cell, *smaller* than the flat 26 px it
  replaced; `large` yields 50 px. On a narrow pane it collapses to one column
  and keeps its height, which is the axis it cannot give up.
- **Year month labels sat a column off the weeks they name.** The week count
  was set on the grid, and the month-label row is the grid's *sibling* — so it
  fell back to the token's placeholder 53 and laid out 53 tracks under a
  61-week year. Both now read the count from the wrap.
- The short grid padded its last row out to a multiple of **14**, adding a
  whole invisible row to half of all windows. It pads to seven.

### Changed

- 5.5.0's release note claimed shorter windows render "14 days across in wide
  panes". No rule ever selected that variant — `--ca-heat-cols` was 7
  everywhere — and the two-axis fit above supersedes the idea: a wide tile now
  buys bigger squares rather than a fortnight per row.

## [5.5.0] - 2026-08-31

**The calendar heatmap learns to scale.** A year-long heatmap tile in the Trends
dashboard previously ballooned its 7-column day cells to the full container
width (reaching ~120 px in wide mode and ~60 px in normal mode), crowding out
vertical space so only 1–2 weeks fit in the tile before clipping. 5.5.0 introduces
adaptive layout across all ranges: year windows transpose into GitHub-style
horizontal contribution graphs (53 week columns × 7 weekday rows with month
headers) that fit the entire year with zero vertical scrolling, while shorter
windows render 14 days across in wide panes and 7 days across in normal/mobile
panes, always scaling to 100% width.

### Added

- **GitHub-Style Transposed Contribution Heatmap (`src/charts/chart-render.ts`, `styles/20-charts.css`):**
  Year-long heatmap ranges (`1y`, 365 days, and period year dashboards) now render
  as a 53-week horizontal grid across 7 weekday rows. Month labels (`Jan`..`Dec`)
  align along the top and weekday initials (`M`, `W`, `F`) sit on the left. The
  entire year displays cleanly in standard tile height without vertical scrolling.
- **Responsive 14 / 7-Day Calendar Heatmaps for Shorter Ranges:**
  Non-year heatmap ranges (90 days, 30 days, 7 days, period quarters/months)
  automatically render **14 days across (2 weeks per row)** on wide panes (>560px),
  and collapse to **7 days across (1 week per row)** on normal and mobile panes,
  scaling to 100% of the tile width.
- **Heatmap Layout Tokens (`styles/00-tokens.css`):**
  Added `--ca-heat-cols`, `--ca-heat-year-cols`, `--ca-heat-gap`, and
  `--ca-heat-year-gap` to govern grid tracks and spacing across the stylesheet.
- **The Visual Tour Has Its Pictures (`README.md`, `docs/screenshots/`):** The
  gallery had been announced in two changelogs and rendered as broken-image
  icons in both, first against a `dev-screenshots/` directory that never
  existed and then against a `docs/screenshots/` that held only a note saying
  what was owed. Seven captures now sit there: the homepage as a full-width
  hero, then the calendar panel, an entry's tracker row, a Trends section, the
  Study index, a week dashboard, and Obsidian's graph of a seeded vault.
- **The Same Homepage Under Three Themes (`docs/screenshots/themes.png`):** An
  eighth capture, composited rather than taken: three screenshots of one page
  cut on two parallel diagonals, with the boundaries solved so each theme holds
  exactly a third of the canvas.
- **`test/review-checklist.test.ts` Opens the Files:** Asserts every linked capture
  is on disk and every capture on disk is linked.

## [5.4.0] - 2026-08-31

**Two bugs behind one empty heatmap.** A screenshot of the seeded development
vault showed a journal dashboard reporting no activity at all above a section
listing seventeen notes — and the two faults behind it were independent. One is
in the repo's seeding tool and reaches nobody's vault; the other is in shipped
code, and would have printed a sentence contradicting itself for any reader
whose notes were all older than a year. Both are the shape this project keeps
finding: a run reporting success on every number it knew how to check, and a
state nothing had been asked about.

### Fixed

- **A Journal's Activity Strip Said "Last Worked Today" Over a Year of Empty Cells:** The Journals band's status line had two branches — no dated notes at all, and everything else. The second read the last active cell in the 53-week window and **fell back to a gap of zero when there was none**, and a gap of zero prints "today". So a journal whose every note predates the window printed *"0 dated notes over 0 active days — last worked today"*: three numbers saying nothing is here and a fourth saying it happened this morning. There is now a third branch for the state that actually existed — notes, none of them in the window — and it counts them from the **unwindowed** rows, because saying "none in the last 12 months" above a Contents section listing seventeen is the same failure one step quieter. `test/empty-states.test.ts` pins the predicate and the branch order; an earlier `else` would swallow it.
- **The Seeded Vault Put Every Journal Note in the Oldest Two Months (`tools/seed-vault.mjs`):** Journal note dates came from one shared cursor, `dates[cursor++ % dates.length]`, so the Nth journal note in the vault took the Nth active day. Forty notes against thirteen months of dates meant every journal note landed in the oldest two months and nothing was written in the eleven since — and the strip covers 53 weeks back from **today**, so Study's newest note fell 2025-08-24 against a window opening 2025-08-31. One day outside, and its dashboard drew a blank year over seventeen listed notes. The run reported *"402 written, 0 warnings"* every time: every note existed, every date was real, every date was an active day, and the only thing wrong with them was which days — which nothing short of opening a dashboard could see. Dates are now dealt by a **stride, per journal**: each journal spans the whole window on its own, first note on the oldest active day and last on the newest. Per journal is the half a single stride would have missed — four journals dealt in sequence from one cursor each get a contiguous quarter and leave every dashboard blank for the other nine months. `test/seed-vault.test.ts` asserts both halves, and both mutations fail it.

## [5.3.0] - 2026-08-31

**What the first public release was still carrying.** 5.2.0 was cut as the
release that could be handed to a stranger, and then four things were looked at
that only get looked at once: a directive argument nobody had drawn since 4.10,
a set of README images pointing at a directory git would never have taken, the
five functions in this tree that had grown past reading, and the last of a name
that was never released. None of it changes what the plugin does in a reader's
vault — the one behaviour change is which form of the `title` line newly
composed notes are written with, and both forms have always been read.

### Removed

- **The `title:` Directive's Argument, and the Head It Fed:** `title:home,diary,journals` composed a row of links to Home, Diary and Journals under the page's name. It rendered nothing. 4.10 replaced `buildPageTitle` with `livePageHead` and pointed the dispatcher at it; the ids went on being written into eight catalogues' notes for nine releases, and the widget that read them sat in the tree unreferenced by anything. What kept it invisible is the same property this release has been chasing everywhere else: **nine assertions across four suites described that row in detail — its `resolveTarget` call, its `is-here` state, its `--ca-caps-tracking` — and every one of them passed, because they read the source of a module nothing imported and the CSS of a class nothing drew.** Deleted whole: `buildPageTitle`, `renderLink` and `WIDE_CLASS`; thirteen `.ca-jtc-*` rules and the four selectors that named the card in other rules; the dispatcher's mark on that card and the drag list's entry for it; `PAGE_TITLE_IDS` and `BannerSpec.ids`. `page-title.ts` keeps the page cog — the vault banner opens that menu — and is 147 lines instead of 333.
- **A Claim Three Comments Made That Was Not True:** The argument for a bare `title` on the homepage, made in 4.5 and quoted in `note-sections.ts`, `home-sections.ts` and the old head, was that *the launcher already draws those tiles*. It does not: `LAUNCHER_DEFAULT` is `["week", "month", "quarter", "year"]`, the four period dashboards, and no Diary or Journals tile has ever shipped in it unless a reader named one. The row was not redundant with the launcher — it simply was not drawn. The corrected reason is written where each of the three claims was, and `page-head.test.ts` now pins the launcher's actual default so the claim cannot come back.
- **The Last of ChronoForge (R5):** The name between Almanac and ChronoAnvil was never released, so no vault, no reader and no licence has ever referred to it — but `tools/migrate-vault.mjs` carried read-compatibility for it anyway: a `PRERELEASE_RULES` array, three `FILE_RENAMES` rows and a `chronoforge` plugin-folder id, all of it kept until the development vaults were migrated. They are, and the last stale artefact — a `.chronoforge-registry.json` sitting beside the live registry in the dev vault, a 4.84.0 snapshot of settings that 5.3.0 had already superseded — is deleted. The only migration the tool now performs is Almanac's, which is the one a real reader needs. `test/product-name.test.ts` sweeps `tools/migrate-vault.mjs` alongside `LICENSE`, `NOTICE`, `LICENSING.md`, `README.md` and `manifest.json` for the capitalised name, and the file on its own for the lowercase token a folder id or vault marker would wear — so the dead tables cannot come back by symmetry with `RULES`. `CLAUDE.md` states the closed position where it used to carry the instruction to close it.

### Changed

- **The Five Longest Builders Are Sub-Builders Now (M7):** `attachBlockHead` (644), `buildLogList` (603), `buildTasksTable` (371), `layOutRow` (354) and `buildAttachments` (332) were the same shape as each other — inline DOM construction interleaved with listener wiring, several screens of it, with no name on any stretch. Fourteen pieces came out: `buildRowCells`; `buildTasksHead`, `bucketTasks` and `buildTaskRow`; `buildLogDeck`, `filterLogItems` and `buildLogAddBox`; `makeSlot`, `makeSource`, `wireCellSlots` and `wireResizeHandles`; and `buildShelfLabel`, `buildAttachToolbar` and `attachIntake`. **Every extraction keeps its order** — each is called exactly where its code stood, so the DOM is built and the listeners registered in the sequence they always were, and no extraction changes what any of these functions does. What did *not* come out is as deliberate: the swap-measure machinery in `row.ts`, the pan-and-drop physics in `block-drag.ts` and `render` in `log-list.ts` share captured mutable state, and threading that through parameters would be the same coupling written twice at more length. Two closures did get a shape to be passed by: `LogFilters`, the four questions the deck sets and `render` reads, and `LogAddIO`, what the add box needs from the list above it — including `file` as a getter/setter pair, because a logbook's note may not exist until the first item creates it. Four structural assertions in `block-move`, `cell-move` and `page-head` were repointed, each carrying a note saying what it used to read; the gate test now asserts the line that *makes* a grip factory rather than the `attachGrip` call inside it, which is the fact it was always about. Non-comment counts: 133, 195, 142, 132, 157.
- **Nothing in a Reader's Vault Is Rewritten:** `locateTitle` has always matched both forms — the optional group was there because the homepage was bare from 4.5 — and repair is additive-and-retired-only, so a dashboard written by any earlier release keeps the line it has and renders exactly as it did. Only newly composed notes get the bare form. The legacy spelling stays in the migration and cell-move fixtures on purpose: those describe notes that exist.
- **`test/page-head.test.ts` and `test/page-widgets.test.ts` Describe the Head That Ships:** Both were essays about the deleted card, down to its 2em title and its container query. They now assert `.ca-journal-page-head` — the ground it takes, the face it borrows from Obsidian's inline title, the `is-fixed` cursor on a name the reader did not type — plus the one line that decides which head renders at all: `case "title"` → `livePageHead`. Eight more assertions across `appearance`, `block-move`, `empty-states`, `entry-footer`, `page-wide` and `banner-weld` were repointed the same way, each carrying a note saying what it used to describe.
- **The README's Visual Tour Is Back, Pointing Somewhere Git Will Follow:** Five captures under `docs/screenshots/`, with `docs/screenshots/README.md` naming each file and what it should show. The ignore rule that covers `docs/` is now written `docs/*` with a negation for that one directory — **git cannot re-include a file whose parent directory is excluded**, so `docs/` plus a negation is a rule that looks right and silently ignores the images anyway. `test/review-checklist.test.ts` asserts all three halves: that the README links at least five images, that every one of them is under that path, and that the ignore rule is written the way that lets them be committed. *The images themselves are still owed — until they land the section renders as five broken icons, which is the state R3 named.*

## [5.2.0] - 2026-08-31

**The first public release.** Everything through 5.1.0 was built and archived
privately; this is the version that goes to a GitHub release and to the
community-plugin listing, so the work below is largely the difference between a
plugin that runs and a plugin that can be handed to a stranger: a release
pipeline, a README that describes what it ships, documentation that covers what
is on screen, and a ledger that describes this plugin rather than its
predecessor. Two of the fixes are ordinary bugs that the maintenance pass found
because it went looking — one of them had been shipping a diary card with two
missing buttons since 4.13.2.

### Added

- **`.github/workflows/release.yml`:** CI has run the full gate on every push for a while, and nothing has ever turned a passing tree into a release. Obsidian resolves a plugin version by reading a GitHub release whose **tag is the bare version** — `5.2.0`, never `v5.2.0` — and downloading `main.js`, `manifest.json` and `styles.css` from it as three individual assets; the installer never reads the repository tree, which is why those files are generated rather than committed. The workflow now fires on such a tag and refuses to publish before it has checked the things that are only checkable at release time: that the tag agrees with `manifest.json` *and* `package.json`, and that the version is actually in `versions.json` — the one rule `check:versions` deliberately relaxes, because a build the ledger does not list is a build that has not shipped. It then runs the suite, the typecheck and the linter, builds, verifies all three assets exist and are non-empty, and lifts the release notes out of this file's section for that version.
- **The Settings Tab Explains Itself in the Vault Documentation:** `assets/documentation.md` gained a **Finding a setting** section covering the search box, the five category pills and the repair button on the toolbar row — all shipped in 5.1.0 and, until now, described nowhere the reader could see them. The same pass corrected three references to a `📖` ribbon icon that stopped being the ribbon icon in 5.0.0.
- **Thirteen Widgets That Had Never Been Documented:** With the parity check able to run for the first time, it immediately named thirteen keywords a page can be given that the shipped reference did not mention: `launcher`, `links`, `upcoming`, `time-grid`, `logbook`, `quarter-summary`, `year-summary`, `period-recap`, `tracker-stat`, `stats-band`, `level-index`, `journal-card` and `journal-recent`. Each now has a row carrying its arguments and defaults.
- **An Eighth Assertion in `test/obsidian-yaml.test.ts`:** The bundled-dependency list is now checked in the two places it is written as prose, not only in `NOTICE` and the `main.js` banner. See **Fixed** below for what that caught.
- **A Focus Ring and a Pressed State on the Settings Category Pills:** The pills said which of them was chosen entirely in CSS, so the selection did not exist for a screen reader, and five keyboard-reachable buttons shared no visible focus indicator. Each now carries `aria-pressed`, kept in step with `.is-active`, and `:focus-visible` draws an accent outline outside the border so it survives the active state recolouring it.
- **Coverage Tooling, Reported and Not Gated:** `npm run test:coverage` writes an HTML and a summary report from `@vitest/coverage-v8`. It measures `src/` only — `generated/` is compiled and `tools/` is build machinery — and carries **no thresholds**, deliberately: a large part of this suite asserts the *shape* of the source rather than running it, so line coverage understates what is pinned and a threshold would either assert nothing or fail the build for tests doing their job. Today's number is 41.6% of lines, and it is a map of where runtime exercise is thin rather than a target. It is also what found the module below.
- **Three New Invariants, Each Written From a Bug It Would Have Caught:** `test/dead-code.test.ts` asserts that every module under `src/` is reachable from `src/main.ts` by the import graph esbuild walks, that every `__`-prefixed test-only hook has a caller in `test/`, and that no exported symbol is referenced nowhere at all. `test/frontmatter-reads.test.ts` asserts that `core/util.ts` is the only file that spells out the metadata-cache call. All five assertions were mutation-tested by reverting the fix each was written for.
- **A Runtime Test for the Note-Write Debounce:** `NoteWriteScheduler` is the timer between a reader typing and their note being rewritten, and its header describes a data-loss bug — a per-file rather than per-field timer makes the second field's edit discard the first's. Nothing checked it. Seven cases now run the class: coalescing, both halves of the key, the pending flag the `note:` field reads to tell its own write from an external one, and that a flush cancels what was queued rather than racing it.

### Changed

- **Searching the Settings No Longer Ignores the Category You Picked:** The filter computed whether a group belonged to the active category and then dropped that answer on every path where a query existed. Choosing **Trackers & Capture** and typing a word that matched something under **Appearance & Banner** opened the Appearance group — expanded — while the Trackers pill went on rendering as active. The interface offers two controls that visibly compose and did not. They compose now, and an empty result inside a category says which category it searched and points at **All Settings**, because "no matches" and "no matches *here*" are different facts and only one of them was being reported.
- **`versions.json` Describes This Plugin, Not Its Predecessor:** The ledger carried 284 entries reaching back to 1.9.0, of which 206 had no changelog section and 70 changelog versions had no ledger entry — a disagreement in both directions that never mattered because nothing was public. What made the cut obvious is that `versions.json` belongs to a **plugin id**, and the id changed at 5.0.0: every entry below it describes `ahrymx.almanac`, which is not this plugin and was never listed. The ledger now starts where the id does. The full 284-entry file is in the source archives, and `CHANGELOG.md` keeps the whole narrative — this is the ledger Obsidian resolves against, not the history.
- **One 5.0.0 Instead of Two:** The release landed in two passes on the same day — the rename, then the store-readiness work — and was written up as two separate sections under the same number, each describing "the fold" with a different figure. They are merged, with a note saying so. The two figures were never in conflict: 419 selectors is the rename's pass over `--am-*` and `.almanac-*`, ~910 classes is the sweep afterwards that found forty more ad-hoc prefixes the rename never touched, and the combined result is 1,455.
- **The README Leads With What the Plugin Is:** The **Visual Tour** section pointed at five files in a `dev-screenshots/` directory that does not exist in this repository and never did, so a gallery announced as shipped in 5.1.0 rendered as five broken-image icons. It is removed until the captures exist. The README gained a link to `assets/documentation.md` — 95 KB of reference that shipped into every vault and could not be read before installing — and a **Support** section naming the Ko-fi link the manifest has declared since 5.1.0 and the page never mentioned.
- **One Reader for a Note's Frontmatter:** `app.metadataCache.getFileCache(file)?.frontmatter ?? {}` was written out by hand at thirty-four sites across twenty-one files, alongside a `frontmatterOf` helper that already was that expression. They now go through it, and the eight sites that read the `type:` property go through a new `noteTypeOf` beside it. See **Fixed** for the bug the second one closes.
- **The Widget Reference Is Checked Against a File That Exists:** `test/widget-registry.test.ts` asserted parity between the registry and `docs/reference.md` behind an `existsSync` gate — and `docs/` is gitignored, so in a fresh clone, in CI and on the development machine the file was absent and the whole block reported as skipped. Those were the three skips this suite has carried for releases. The check now reads `assets/documentation.md`, which is the reference that actually ships into a reader's vault. **The suite has no skipped tests.**
- **The Diary Card's Documentation Describes the Card:** The `diary[:N]` entry still described the accent-washed hero band — greeting, status line, four numbers, five pills — that 4.13.1 removed.

### Fixed

- **The Diary Card Stopped Drawing Its Actions Strip, and Everything Around It Went On Passing:** `buildDiaryActions` draws **Capture** and **Search** above the diary card's month navigator. Somewhere between 4.13.2 and 5.1 the one `appendChild` that put it on the page was lost, and nothing noticed for two minor versions: `opts.header` and `opts.ctx` stayed on `CalendarOptions`, `header: true` stayed at the call site, `.ca-jc-actions` and its `:has()` rule stayed in the stylesheet, `diary-header.ts` stayed in the tree, and the assertions in `appearance.test.ts` that check the module's contents and the rule's declarations all went on passing — because every one of them asks what the source *says*. No file imported `diary-header.ts` at all. The call is restored, and the reachability assertion described above is the thing that would have caught it on the day.
- **A Folder Note Written `type: Lesson` Was Not the Same Note as `type: lesson`:** `isContainerFolder` compared the raw frontmatter value against a set of lowercase kind ids, so capitalisation decided whether a note was a container or a leaf. Seven other readers of the same property normalised; this one did not, and `entry-trackers.ts` already carried the account of the identical bug the last time it happened one property over. `noteTypeOf` is now the only reader and it normalises.
- **A Test That Was Reading Two Thousand Lines It Did Not Mean To:** `journal-chart.test.ts` bounded a negative assertion by slicing to a comment three functions further down. Deleting the unused helper that comment belonged to sent `indexOf` to `-1`, the slice ran to the end of the module, and a test whose whole job is a `not.toContain` started reading code that legitimately mentions the term. It is bounded by the function now.
- **The Source Archive Was Carrying a Coverage Report:** `tools/archive.mjs` skips `node_modules/`, `dist/`, `.git/` and `docs/` when it snapshots the tree, and the coverage reporter added in this release writes a two-hundred-file HTML report the list did not know about. The first 5.2.0 source zip came out at 6.4 MB against 5.1.0's 3.7 MB, nearly all of it one run's report of a tree the zip already contains. `coverage/` is on the list now, and the assertion that pins the list names it.

- **Two Licence Documents Credited a Library That Is Not in the Build:** js-yaml left `main.js` in 5.0.0, and `NOTICE`, the esbuild banner and the lockfile were all corrected together and held there by `test/obsidian-yaml.test.ts`. The same claim is written out twice more in prose — the README's licence paragraph and `LICENSING.md`'s dependency FAQ — and no test read either, so both went on attributing a parser the build does not contain. A sentence naming what is bundled is an attribution statement rather than a description. Both are corrected, and the test now derives the expected list from the lockfile's production closure and checks it against **all four** documents, so the next dependency change breaks in four places at once instead of two.

### Removed

- **Twenty-Six Exports Nothing Referenced, and the Two Stale Test Hooks:** Six predicates in `trackers.ts` whose comments each said "three places ask" with no place asking; `buildConfidenceSummary`, the builder for a widget retired in 3.11, exported with no caller for two majors, and its orphaned CSS rule with it; `scatterableType`, `buildDiaryLinks`, `eventSummary`, `noteRequiredNotice` and the rest. `__resetSessionSort` and `__clearIndexCache` were exported "for the test that pins the session rule" and for cache isolation — and no test called either, which is worse than having neither: the next person to add a case reads the export and believes isolation is handled.
- **The Pre-Release Migration Rules:** Between Almanac and ChronoAnvil the plugin briefly carried a third name that never left the development machine — no release, no repository, no copy in anyone else's hands. `tools/migrate-vault.mjs` carried a separate `PRERELEASE_RULES` table for it, three `FILE_RENAMES` rows and a second plugin-folder id, kept only until the development vaults had been through one `--write` pass. They have. The tool is down to the one migration a reader can actually need, and the assertion that the name appears in no shipped document stays exactly where it was.

## [5.1.0] - 2026-08-30

**Redesigned the settings interface with category navigation tabs, real-time keyword search, header links card, and an integrated repair vault toolbar button.**

### Added

- **Settings Category Tabs Navigation**: Added quick-filter category pills (**All Settings**, **Trackers & Capture**, **Journals & Logs**, **Appearance & Banner**, **Vault & System**) reducing vertical scroll depth and improving settings discoverability.
- **Settings Real-Time Keyword Search**: Instant live filtering across all setting options, titles, descriptions, and tracker items with automatic expansion of matched `<details>` groups.
- **Settings Masthead Card & Repository Links**: Styled top configuration card featuring title, subtitle, and direct icon links to the GitHub repository and Ko-fi sponsor page.
- **Integrated Repair Vault Action**: Placed a compact, dedicated "Repair vault" button directly in the search toolbar row beside the search input.
- **Visual Tour in README**: Added a screenshot gallery showcasing native dashboards, multi-grain calendars, heat maps, study journals, and chart visualizations.
- **Themed Activity Ramp Tokens**: Added `--ca-act-ink-dark` and `--ca-act-ink-light` custom properties to ensure text contrast across light and dark themes.

### Changed

- **Clean Section Hierarchy**: Restructured README and documentation to surface visual tours and features first.
- **Plugin Manifest Metadata**: Added `fundingUrl` pointing to Ko-fi and updated `authorUrl` to GitHub profile.

## [5.0.0] - 2026-08-29

**Initial major public release under the ChronoAnvil identity, establishing a unified journaling and study system with native calendars, heat maps, charts, trackers, dashboards, and automated vault scaffolding.**

> **Vault Compatibility:** Builds on the complete 4.x foundation with the new `chronoanvil` plugin id, unified `--ca-*` styling architecture, and updated vault tokens. Vaults created in pre-release versions remain fully compatible via automatic dual-reading and the built-in migration tool (`npm run migrate:vault` or **ChronoAnvil: Maintenance: set up / repair vault**).

> **One number, two passes.** 5.0.0 landed on 2026-08-29 as the rename, then as the
> store-readiness work that followed it the same day, and the two were written up as
> separate sections under the same version. This is those two merged. The selector
> counts they each quoted — 419 and ~910 — were never in conflict: they count the two
> passes of the same fold, and the combined result is stated below.

### Changed

- **Product Rename — Almanac is now ChronoAnvil:** The display name, every user-facing string, the documentation and the licence's section 7 attribution now read ChronoAnvil. The plugin id changed from `ahrymx.almanac` to `chronoanvil` — the previous id contained a period, which the community-plugin manifest charset does not allow, so this had to change before any public release regardless of the rename.
- **Vault Format Tokens Renamed:** Fenced blocks are now ` ```chronoanvil `, ` ```chronoanvil-charts ` and ` ```chronoanvil-journal-charts `; body regions open `<!--chronoanvil:<key>`; the tracker region markers are `# chronoanvil:trackers:start` / `:end`; the graph marker is `%% chronoanvil-graph %%`; the events frontmatter property is `chronoanvil-events`. The settings mirror is `.chronoanvil-registry.json`, per-journal manifests are `.chronoanvil-journal.json`, and the vault map is `ChronoAnvil.canvas`.
- **A Mark of Its Own:** The ribbon button drew Lucide's `book-open` — an icon three other plugins also use, on the button whose whole job is to say which plugin this is — and the banner tile drew the vault's initials. Both now draw the ChronoAnvil mark, an anvil whose waist is an hourglass — the name and the mark say the same thing — authored on Lucide's 24-unit grid so it sits correctly beside the built-ins. The banner tile's **Tile** setting still takes a letter or an emoji; leaving it empty now gives the mark rather than initials.
- **A Single CSS Namespace, in Two Passes:** The stylesheet carried two prefixes — `--am-*`/`.am-*` and a second `.almanac-*` family that had grown alongside it — and the rename folded both into `--ca-*` / `.ca-*`, 419 selectors. That turned out to be the smaller half: a sweep afterwards found ~910 more classes under about forty ad-hoc prefixes the rename never touched, the largest being 315 `.journal-*`, none of them namespaced at all. A plugin's stylesheet loads into one flat scope beside the reader's theme, their snippets and every other plugin, so the prefix is the only collision protection there is. Both passes are done: **1,455 selectors and 1,260 applied classes now sit under `ca-`**, the only unprefixed names being Obsidian's own and `almanac-wide`, which is written into readers' frontmatter and cannot be renamed retroactively. `test/css-namespace.test.ts` holds it from both directions — a new unprefixed rule fails, and applying a prefixed class by its old bare name fails. **Any custom CSS snippet targeting `.am-*`, `.almanac-*`, `.journal-*` or `.cal-*` needs updating.**
- **The Stylesheet No Longer Ships Its Own Commentary:** `tools/build-css.mjs` concatenated `styles/*.css` verbatim, and 58.6% of the 885 KB that produced was comment text — the design arguments, which run to paragraphs and are the most valuable thing in the directory. Every byte of it was parsed by every vault on every launch, phones included, and none of it was legible where it landed: whoever reads a design argument has the repository open, and whoever opens the plugin folder has a generated file they were told not to edit. The sources keep every word; the shipped `styles.css` goes from **882 KB to 358 KB**. This is still not a minifier — selectors, declarations, whitespace inside rules and the order of everything are untouched, so the stylesheet stays readable in devtools and diffable between releases. A comment that must reach the shipped file says so with `/*!`, which is the convention esbuild already applies to `main.js`; one such notice now carries the licence that the twenty-five stripped SPDX headers used to, and each source file leaves a `/*! <filename> */` marker so a rule seen in devtools can be traced back to the file whose comments explain it.
- **No Default Keyboard Shortcut:** **Search everything** declared `Mod K` as a `hotkeys` default. The argument for it was reasonable on its own terms — a declared default is rebindable, and Obsidian surfaces the clash with core's *Insert Markdown link* in its own Hotkeys pane — but claiming a binding in every vault that installs the plugin is a different act from choosing it in one, and the review guidelines are explicit that a plugin should not. The command is unchanged and one row away in **Settings → Hotkeys**; the README now says so, because nothing in the interface can. The vault banner's search field drew a `⌘ K` / `Ctrl K` chip spelling the old default and no longer does — with no default to spell, that chip would name a key that does nothing, and it cannot be taught to read your actual binding without reaching into Obsidian's internals.
- **The Settings Tab No Longer Repeats Its Own Name:** Obsidian draws "ChronoAnvil" above the settings body, and the tab drew it again as an `<h2>` immediately underneath — the word you are already looking at, on the screen twice. The tagline stays.

- **YAML Goes Through Obsidian Instead of a Bundled Copy:** `Diary.base` is the one file the plugin reads and rewrites as YAML, and it carried `js-yaml` into `main.js` to do it — 52 KB of parser for two calls, and a runtime dependency with two open advisories and no fixed version on any line, in a plugin about to be listed publicly. Both calls now use Obsidian's own `parseYaml` and `stringifyYaml`, which are the same library reached through the host. **`main.js` drops from 1,117 KB to 1,065 KB, and `npm audit --omit=dev` goes from one high-severity advisory to none.** `js-yaml` stays installed as a development dependency, where it backs the test suite's stand-in for Obsidian and serves as an independent parser in the vault-seeding tests — a role it is better suited to now that it is not also the parser under test.

  The one thing given up is `{ lineWidth: -1 }`: `stringifyYaml` takes no options, so whether a long value is folded across lines is Obsidian's decision rather than the plugin's. Nothing depends on it. `Diary.base` has exactly one value long enough to fold — the 210-character `formulas.Type` expression — and the tests run the file through both line widths and assert the same document comes back, because YAML folds at a space and reads the break back as that space. What line width can change is how the file looks after a sync, not what Bases reads out of it.

### Added

- **`tools/migrate-vault.mjs`:** Rewrites a vault written under the old name in a single pass — note tokens, file names, and the plugin folder so `data.json` moves with it. Dry-run by default; `--write` applies, and it takes a full vault backup first unless given `--no-backup`. Idempotent, and it deliberately leaves `.obsidian/` alone apart from the plugin folder.
- **Read-Compatibility for Pre-Rename Vaults:** The plugin writes only the new spellings but reads both at every point where failing to find a token would cost content rather than merely look wrong: body regions (a region it cannot see renders empty and the next save would append a second one beside it, orphaning what the reader wrote), tracker region markers, journal manifests, the settings mirror, the events property, and all three fence languages. Legacy `` `almanac:` `` inline spans still render.
- **Settings Survive the Id Change:** Because the plugin id changed, the first launch finds no `data.json`. `Registry.read()` now falls back to the pre-rename mirror filename and version key, so trackers, journals and paths are restored rather than silently reset to defaults.
- **`tools/build-assets.mjs`:** Compiles `assets/` into `generated/bundled-assets.ts`, on the same footing as `tools/build-css.mjs` — generated, gitignored, and rebuilt by `npm run build`, `npm run typecheck`, `npm test` and `npm run dev`, which also watches `assets/` so an edit to the documentation is picked up without a restart. The markdown stays markdown: `assets/` is still where these notes are written and reviewed.
- **`test/bundled-assets.test.ts`:** Five assertions holding the fix in place — every asset `scaffold.ts` names is in the bundle, each matches `assets/` byte for byte, nothing in `assets/` is skipped by the extension filter, a `Scaffold` with no app and no plugin folder still serves every note, and `scaffold.ts` does not read assets through the vault adapter again.
- **`test/css-build.test.ts`:** Six assertions over the comment strip, the first of them written against a deliberately different implementation than the build's — a regex normalisation where the build is a character walk — so that the two agreeing is evidence rather than a function being compared to itself. It also asserts the one thing the stripper assumes: that no string in `styles/` contains a comment delimiter — the inline SVG data URIs being exactly where such a thing would arrive unnoticed.
- **`test/review-checklist.test.ts`:** The Obsidian review checklist as assertions that run on every commit rather than once per submission. Each finding above had been true for releases, because all of them are invisible from inside the vault the plugin was developed in. The listener check sweeps every file under `src/` for a `document` or `window` listener with no matching removal — per file rather than per module, since a module-level count let one file's leak be covered by another file's `once: true` from three hundred lines away.
- **`no-restricted-globals` for `app` and `moment`:** The review guidelines forbid the global `app` and `moment` in favour of `this.app` and Obsidian's own import. Nothing here used either, but a text search cannot tell a global from a parameter of the same name, and nearly every file in this project takes `app` as a parameter or reads `plugin.app` into a const. ESLint resolves scopes, so the question is now answered by `npx eslint src test` on every commit instead of by grep on submission day.
- **`test/obsidian-yaml.test.ts`:** Seven assertions around the YAML swap. The round-trip checks run `Diary.base` through both line widths so that a question about a host which cannot be run from a test — does Obsidian fold long lines? — stops mattering rather than being guessed at. The rest close the door behind the change: no module under `src/` may import `js-yaml`, it may not return to `dependencies`, and the third-party lists in `NOTICE` and in the `main.js` banner must both match the lockfile's production closure. That last one is a licence obligation rather than tidiness, and the banner is the only notice a community-store install carries at all, since the installer writes three files and `NOTICE` is not one of them.
- **`test/product-name.test.ts`:** Five assertions that the product has one name. It does not check the spelling — it derives the name from `manifest.json`, the one place Obsidian itself reads, and requires `package.json`, the repository URL, `LICENSE`, `NOTICE`, `README.md`, `LICENSING.md` and the `main.js` banner to agree with it. The attribution string in particular is a term of the licence rather than a description, and four documents quote it; nothing but a side-by-side reading would have caught them disagreeing.

### Fixed

- **Bundled Assets Travel Inside `main.js`:** `Scaffold.readAsset` resolved `manifest.dir + "/assets/<name>"` through the vault adapter at runtime. Obsidian's community installer writes `manifest.json`, `main.js` and `styles.css` into the plugin folder and creates no subdirectories, so `assets/` did not exist for anyone who installed the ordinary way — the plugin loaded and rendered perfectly, and then **Maintenance: set up / repair vault** built the folder tree, silently skipped `Diary.base`, `Staging.md` and the in-vault documentation README, and finished on a notice about three missing assets. The three files are now compiled into `main.js` at build time and read from there, so every install route carries them. Hand-installs from the release zip were never affected, which is why this survived the whole of 4.x: every build tested here was a zip.
- **A Click Listener That Outlived Every Log Widget:** The log list's type filter attached an anonymous `document` click handler to dismiss its dropdown, once per widget render, with no reference kept — so it could not be removed even in principle. It survived the note being closed and the plugin being disabled, and a vault with several log widgets accumulated one per render for the length of the session. The handler is now attached when the menu opens and removed when it closes.

## [4.84.0] - 2026-08-29

**Added hierarchical green color groups for diary grains in Obsidian Graph View, discrete star scale pickers with progressive hover trails, single-row sleep duration ratio metrics, and retired canvas node pruning.**

### Added

- **Hierarchical Green Spectrum for Diary Grains in Graph View:** Obsidian Graph View color group generation now colors diary entries across 5 distinct shades of green reflecting chronological depth — Years (brightest light emerald `#86efac`), Quarters (vibrant spring green `#4ade80`), Months (lush green `#22c55e`), Weeks (forest green `#16a34a`), and Days (darkest deep pine `#166534`).
- **Discrete Star Scale & Scale Picker UI:** Scale and star trackers now render discrete single-emoji interactive buttons (`[★][★][★][★][★]`) with monospace numeric values underneath and progressive star trail hover fills.
- **Top-Right Context Note Badge:** Repositioned the tracker scale note badge to the top-right corner to avoid colliding with numeric value sub-labels.

### Changed

- **Compact Single-Row Sleep Ratio Readout:** Redesigned the sleep tracker's duration readout into a compact, single-line format (`😴 7:35hrs / 16:25hrs ☀️`) with refined monospace and tabular time figures.
- **Simplified Sleep Tracker Name:** Renamed the built-in Sleep tracker setting row title from compound descriptions to `"Sleep"`.

### Fixed

- **Phantom Link & Retired Node Pruning in `ChronoAnvil.canvas`:** `mergeCanvas` now cleanly discards retired plugin-generated `node-*` and `group-*` IDs during canvas regeneration, preventing legacy references (such as `node-journals` or `node-staging`) from persisting as phantom nodes or duplicate links in Graph View.

## [4.83.0] - 2026-08-29

**Added surface card framing and collapse support to From the journals bridge sections, routed journal note captures to diary daily entries, and preserved unrowed layouts in section edits.**

### Added

- **Bridge Section Card Surface & Collapse Support:** The `bridge-notes` ("From the journals") directive now renders inside a styled section card surface matching Tasks, Captured, and Attachments. Includes an inline collapsible chevron toggle and persistent fold state via note section settings.
- **Journal Note Capture Routing to Diary Subsystem:** Capturing tracker scale notes initiated from journal notes now seamlessly routes to the corresponding diary daily note under `02 - Diary/Entries/` without polluting the journal leaf with capture regions or logs.

### Fixed

- **Preserved Unrowed Fences in Entry Section Edits:** Fixed `tidyRowLine` to prevent injecting unwanted multi-column `row` keywords into unrowed shared entry fences when applying section changes in the Section Editor.

## [4.82.0] - 2026-08-29

**Added automated Obsidian Graph View color group configuration for ChronoAnvil vaults, matching workbenches, dashboards, diary entries, journals, logbooks, and infrastructure.**

### Added

- **Automated Graph View Color Groups:** ChronoAnvil can now automatically configure and synchronize `.obsidian/graph.json` color groups based on your active vault paths, visually distinguishing Workbenches (Amber), Dashboards (Coral Red), Diary Entries (Emerald Green), Journals (Indigo Blue), Logbooks (Purple), and Infrastructure (Slate Grey) in Obsidian's global graph.
- **Graph Group Maintenance Action & Settings Control:** Added `ChronoAnvil: Maintenance: configure graph view color groups` to the command palette and a **Set up graph groups** button under **Appearance & Themes** in Settings.
- **Non-Destructive Graph Configuration Merge:** Color group setup automatically adapts to custom or renamed folder paths while preserving custom user-defined graph groups, force physics, and display settings.

## [4.81.0] - 2026-08-29

**Reorganized period entries into `02 - Diary/Entries/` with nested year containment, rebuilt the infrastructure canvas, and restructured graph links to isolate period entries, journal trees, and the homepage workbench.**

### Added

- **Hierarchical Period Nesting under `02 - Diary/Entries/`:** Period entries are now organized into nested folders on disk (`02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Day-2026-08-29.md`), matching chronological containment and keeping the diary root clean.
- **Infrastructure Canvas Isolation:** `00 - Infrastructure/ChronoAnvil.canvas` now houses only infrastructure nodes (`README.md` documentation hub, `Diary.base` database, and diary templates), completely decoupled from user-facing workspace notes.

### Changed

- **Graph Link Separation:** Diary entries now start from their respective `Year-...` nodes as roots of the chronological period tree, without artificial links to `02 - Diary` or `Homepage`. Journal notes start directly from each journal's named dashboard (e.g. `Study.md`), detached from the general `03 - Journals` overview.
- **Homepage Workbench Hub:** `Homepage.md` cleanly connects to the primary dashboards and workbenches (`02 - Diary`, `03 - Journals`, `Search`, and `Staging`), without pulling in all dated entries or journal trees into a dense graph cluster.

## [4.80.0] - 2026-08-28

**Added three aesthetic presets with temporal grain accents, nineteen selectable page ground textures, and moved the banner's background art out of the vault and into the plugin.**

### Added

- **Aesthetic Presets:** Three design archetypes applied across ChronoAnvil notes and surfaces, chosen under **Appearance & Themes** — Modern Fluent (clean sans and glass), Editorial Monastic (serif and parchment), and Technical HUD (monospace and instrument panel). Each carries its own typography suite, surface treatment and border language.
- **Temporal Grain Accents:** Daily, Weekly, Monthly, Quarterly and Yearly entries each carry a semantic accent colour (Solar Daily, Emerald Weekly, Indigo Monthly and their siblings), bound through `data-ca-grain` on page heads and vault banners, with custom journal spines tinted from the same palette. A **Grain accent intensity** setting steps the whole scheme between vibrant, subtle and monochrome.
- **Page Grounds:** Nineteen background textures for ChronoAnvil's markdown surfaces, selectable under **Appearance & Themes** and grouped by family — Paper (dot grid, graph paper, ruled lines, crosshatch, isometric), Weave & tile (checkerboard, argyle, zigzag, carbon fibre), Print & screen (halftone, scanlines, pinstripe, candy stripe), Ground & light (topographic, wave scales, aurora, stardust) and Crystal (facets, smoke). Every ground is drawn from CSS gradients and a shared grain film over the theme's own colours, so it follows dark and light mode and the chosen aesthetic preset rather than sitting on top of them. A **Ground strength** setting picks faint, standard or full.

### Changed

- **Banner Background Art Is Built In:** The six banner textures (Topography, Dot Matrix, Constellations, Aurora Mesh, Isometric Grid, Minimal Waves) are now data URIs inside ChronoAnvil's own stylesheet, selected by preset id. The patterns themselves are unchanged — a banner set to Topography draws exactly what it drew before.
- **Removed the `00 - Infrastructure/Art/` Folder:** ChronoAnvil no longer scaffolds an Art folder, and the settings dropdown no longer lists image files found inside one. That scan had turned a scaffolded vault folder into an informal styling API, which is not something ChronoAnvil asks of anyone. Existing folders are left exactly as they are — repair does not delete them — and a banner still set to a file added by hand falls back to no texture rather than silently substituting a pattern that was never chosen.

## [4.79.0] - 2026-08-28

**Fixed period-scoped Open Tasks discovery on diary dashboards, resolved lint test issues, and streamlined mobile week group headers.**

### Added

- **Smart Diary Default Scoping for Open Tasks:** Bare `tasks-table` directives on diary overview notes (Weekly, Monthly, Quarterly) now automatically resolve to the configured diary root (`02 - Diary`), collecting daily entries and custom journal notes inside the period rather than looking only inside the overview's subfolder.
- **Robust Frontmatter Date Matching:** Broadened `buildTasksTable` period date filtering across `journal-date`, `date`, `week-start`, `month`, `quarter-start`, `year-start`, and date-based note basenames (`YYYY-MM-DD`).

### Changed

- **Compact Week Congregation Headers:** Streamlined week bucket titles to `🗓️ Week N` (omitting redundant date ranges), keeping headers clean and single-line on mobile devices while preserving note day labels.

## [4.78.0] - 2026-08-28

**Upgraded group swipe navigation with button drag disambiguation, mobile edge guards, and live edge tint feedback, and enforced single-line inline priority pill layout on Open Tasks.**

### Added

- **Swipe Over Interactive Controls:** Enhanced `attachGroupSwipe` to permit swiping to start over buttons, links, chips, and calendar cells. When a horizontal drag intent is recognized, trailing click events are automatically intercepted and cancelled while taps continue to click normally.
- **Mobile Sidebar Edge Guard & Isolation:** Added an 18px screen edge deadzone so intentional mobile sidebar pulls work seamlessly without conflicting with group page switching.
- **Live Swipe Edge Tint Overlays:** Introduced dynamic edge tint feedback (`--ca-swipe-tint-left`, `--ca-swipe-tint-right`) that illuminates the destination edge during horizontal drags.

### Fixed

- **Open Tasks Inline Priority Layout:** Enforced strict single-line flex row layout on Open Tasks rows (`.journal-tasks-table .jtt-row`), ensuring priority badges, due dates, and tags always align inline on the right side without wrapping onto a secondary line in narrow columns or viewports.

## [4.77.0] - 2026-08-28

**Upgraded Open Tasks section with collapsible ISO week groups, journal congregation, and right-aligned tags, and restored "+ New journal" card on empty vaults.**

### Added

- **Collapsible Week Groups in Open Tasks:** Daily note tasks are now congregated into ISO week buckets (e.g. `🗓️ Week 35 · 24–30 Aug 2026`) with smooth chevron collapse/expand accordions, aggregate open counts, and overdue warning badges.
- **Journal Name Congregation:** Tasks originating from registered custom journals (e.g. Study, Projects) are aggregated under dedicated journal header bars with journal glyphs, names, and note sub-group links.
- **Inline Right-Hand Tags:** `#tags` in task lines are parsed and rendered neatly on the right-hand metadata cluster alongside priority badges and due dates, maintaining high-density 32px task rows without secondary line wrapping.

### Fixed

- **Homepage Journals on Empty Vaults:** Restored the `+ New journal` card on vaults without registered journals, ensuring the creation flow is immediately accessible from the homepage without being hidden behind an empty callout.
- **Empty Card Below Resources:** Prevented graph link comments from leaking visible text that caused empty cards under Resources sections, and hardened header bar render detection against zero-width characters.

## [4.76.0] - 2026-08-28

**Implemented Proposal A Micro-Ring Ribbon on Stats Bar, established uniform 2nd-position placement for Trackers across all Journal presets, repositioned Diary Tasks section, and excluded docs from release archives.**

### Added

- **Micro-Ring Ribbon Stats Bar (`ca-stats`):** Redesigned the stat strip into a space-efficient ~38px horizontal telemetry ribbon featuring SVG circular progress micro-rings (`ca-stat-ring-svg`), metric icons, uppercase labels, and inline value/sub rows.
- **Micro-Ring Progress Support:** Extended `StatCard` and `statStrip` to dynamically compute and render circular progress rings for rating averages and scale completion ratios.

### Changed

- **Uniform Tracker Section Placement:** Standardized the `trackers` section to always render at position 2 directly underneath `banner` across all Journal presets (`Study`, `Projects`, `Exercise & Diet`, `Media`) and layout configurations.
- **Diary Grain Templates Task Placement:** Moved the Tasks section (`todo`) to the second-to-last position (directly above the captured log) in Diary grain templates (`daily`, `weekly`, `monthly`, `quarterly`, `yearly`).
- **Release Packaging Exclusions:** Excluded the `docs` directory from distribution packages and source archives.

## [4.75.0] - 2026-08-27

**Redesigned Tasks and Learning Path sections with Compact Mode, collapsible progress headers, priority-tinted cards, and fixed Focus and Notes line-break duplication.**

### Added

- **Tasks Compact Mode (`☵ Compact`):** Added a compact single-line view toggle button in the Tasks header next to the progress badge. In compact mode, task rows collapse to a streamlined 32px single line, inlining due date and time metadata on the right while hiding redundant priority tags and delete buttons.
- **Priority-Tinted Backgrounds:** Applied soft priority-tinted background colors (`color-mix`) and border accents across task cards for High (red), Low (teal), and Normal priorities on both single-note Tasks and multi-note rolled-up Tasks tables.
- **Responsive Mobile Date & Time Icons:** In compact mode on mobile viewports, due date and time controls collapse into touch-friendly calendar (`📅`) and clock (`⏱`) icon triggers that open the native date/time pickers.
- **Diary Tasks Collapsible Header:** Implemented collapsible fold header bar for Diary tasks (`tasks:`) with animated chevron, uppercase label, progress counter (`0/2 done`), and persistent fold state.

### Changed

- **Flush Learning Path Surface Layout:** Streamlined Journal Learning Path (`path:`) widget styling to render flush directly onto the Journal section card surface without nested container borders or duplicate headings.

### Fixed

- **Focus and Notes Line Break Text Duplication:** Fixed a race condition in `buildNote` / `NoteFieldWatcher` where pressing Enter or typing new lines in free-text prose fields (Focus, Notes, log fields) caused the file-watcher to falsely identify the user's own keystrokes as an external append and duplicate text in the textarea.

## [4.74.0] - 2026-08-26

**Enhanced mobile Time-Grid gestures and controls, optimized responsive header bar navigation, and fixed section surface background rendering on initial page load.**

### Added

- **Mobile Time-Grid Touch Event Creation:** Added support for long-press drag gestures on touch devices to draw new events directly on the Time-Grid, locking scrollbar movement during drawing gestures and prompting the creation dialog upon release.
- **Enabled Mobile Overlay Controls by Default:** Configured the bottom-left floating mobile overlay controls toggle to be enabled by default for new installations.

### Changed

- **Responsive Header Bar Block Buttons:** Increased header bar destination and action buttons (`home`, `capture`, `diary`, `journals`, `overviews`) by ~15% on compact mobile widths and increased button spacing for touch ergonomics.
- **Time-Grid All-Day Row Sizing:** Doubled the default minimum height of the all-day row on Time-Grid (from 30px to 60px) to provide ample touch targets.
- **Header Art and Surface Scoping Simplification:** Unified Tracker and Entry Header layouts to use the modern pattern across all note types, removing legacy art definitions and confining path-based surface scoping strictly to page headers, spacers, and note properties.

### Fixed

- **Section Surface Background Loading Fix:** Initialized `HeaderBar` dataset attributes (`data-headerKey` and `data-headerLevel`) synchronously in constructor, preventing premature paint passes by sibling observers from misidentifying titled section blocks (such as *Trends and statistics*) as untitled bars and stripping their card background and border styling on initial page load.

## [4.73.0] - 2026-08-24

**Upgraded Logbooks settings with interactive Emoji Picker, and removed redundant Special Events settings section.**

### Added

- **Interactive Emoji Picker Modal (`EmojiPickerModal`):** Added a dedicated icon button to each logbook row that opens a categorized emoji picker modal (*Productivity & Work*, *Personal & Lifestyle*) plus custom emoji input support.

### Changed

- **Compact Dense Logbooks Table:** Redesigned the Logbooks configuration section into a clean tabular matrix featuring icon picker buttons, inline editable logbook names, styled monospace note paths, color dropdowns, and remove actions.
- **Removed Special Events Settings Section:** Removed the redundant "Special events" section from plugin settings, keeping event creation and editing in-context via calendar views and event notes.

## [4.72.0] - 2026-08-24

**Rich Cards and interactive Viewmode toggle for Journal Bridges, and streamlined Quick Capture settings.**

### Added

- **Rich Cards for Journal Bridges (`bridge-notes`):** Upgraded notes bridge rendering to display rich, interactive cards showcasing entry title, tag badges, open task counters, and ISO date stamps.
- **Interactive Viewmode Toggle:** Added an interactive viewmode toggle button to the bridge widget header (and context menu) allowing seamless switching between modern **Cards view** and compact **List view**.

### Changed

- **Streamlined Quick Capture Settings:** Consolidated diary capture inbox configuration into a dedicated **Quick capture** settings card with a clear 5-grain stream matrix, automatic safe template synchronization, default fold toggles, and draft management.
- **Decoupled Journal Rollups Configuration:** Removed the redundant settings table for journal rollups in favor of on-demand in-context configuration via the note Section Editor (*"Edit this note's sections…"*) and template saves.

## [4.71.0] - 2026-08-24

**Daily entry visual touchup, compact responsive daily trackers, and the Overview Navigator.**

### Changed

- **Overview Navigator (`launcher`):** Renamed the section and widget from "Go to" to **"Overview navigator"** and updated its default destination tiles to link directly to the four diary overviews (`week`, `month`, `quarter`, `year`).
- **Compact Responsive Daily Trackers:** Redesigned the daily note tracker bar to a compact layout displaying 3 trackers per row on desktop and 2 on mobile/narrow panes. Reduced cell minimum height to 50px with compact padding, refined Mood emoji rating pickers, streamlined Sleep time inputs and live duration readouts, and matching compact "+ Add tracker" button.
- **Single-Column Daily Entry Layout:** Removed multi-column row pairing from daily entry templates so entry sections stack in a clean, consistent single column.
- **Retrospective List Borders:** Refined border geometry for Highlights and Challenges cards so all 4 borders remain intact with proper border radii, preventing unsightly fused connections to parent cards.
- **Captured Log Styling:** Enhanced the captured logbook with a clean background surface card matching other diary sections.

### Fixed

- **Captured Logbook Collapse:** Fixed collapsible capture and note sections so that inner logbook elements (`.journal-logbook-deck`, `.journal-capture-scroll`, `.journal-logbook-footer`, and `.journal-capture-add`) properly hide when folded.

## [4.70.1] - 2026-08-24

**`Take out of the group` was greyed out on every period dashboard's row.**

### Fixed

- **A cell of a composed row could not be taken back out of it.** On a weekly, monthly or quarterly overview, *What the entries said* showed **Take out of the group** and **Start a page here** disabled, with the tooltip *"This widget's lines can't be told apart from the others in its block, so it can't be split out."* Both controls read whether a section's extent is known, which is answered by rendering it in **both** forms — a section is separable if either form is a single line, because a `header:` bar belongs to the band and not to the section under it. The adapter that lets a dashboard's sections through the flat machinery was dropping the form argument, so both probes came back with the bar attached and every section that composes one answered "two lines".

  Present since 4.58.0 and unreachable until now: a section alone in its block is always separable, so the question was only ever asked of a shared block, and 4.70 is the first release in which a dashboard composes one.

  The gate is the property rather than the line — every block a composed dashboard holds more than one section in must report every one of them separable, on all four grains, and the write must perform the split the button offers.

## [4.70.0] - 2026-08-24

**The default page layouts catch up with the layout grammar version 4 built: rows reach the three catalogues that could not compose one, three new widgets fill the holes the fresh vault showed, and a separate opt-in tick offers to regroup the pages you already have.**

Version 4 added a great deal of page furniture — `row`/`cell` groups, per-cell heights, `frame:` chrome, the merged stats band, the time grid, the section/widget toggle — and almost none of it reached a reader who had just run `Set up / repair vault`. A freshly scaffolded vault used `row` **once** in the whole vault and `cell` once, both on the homepage; `tab`, cell weights and `height:` appeared **zero** times; and five shipped page widgets appeared in no default layout at all. The structural cause was that only flat notes could compose a row: the period dashboards, the five entry templates and every journal template are written by catalogues that had **no way to say "these two are one block"**, so they could only ever ship a column of stacked cards however much the renderer supported.

### Added

- **`upcoming[:N]` — the next `N` events**, with a relative *in 3 days* / *day 2 of 5* readout. It has been dispatching as `events:upcoming` since 2.13.1 and was unreachable from the section editor, because `events` is registered with no argument. Its own keyword rather than an argument on `events`, on the `level-index` → `level-cards` precedent: the add list carries one name, one glyph and one sentence per keyword, and "the special-events manager, with an Add button" and "the next five events" are not one row.
- **`tracker-stat:<tracker>` — one tracker's numbers and its streak.** The latest reading, the mean over the series, and either the current run of true days or the range low–high, over a thirty-day density strip shaded across the series' own minimum and maximum. `sleep-summary` generalised, and neither replaces the other. Distinct from `tracker:<id>`, which is the inline control that *writes* a reading — one records, one reports.
- **A `trackers` vault source for the section window**, which is what `tracker-stat` needed and what the 4.15 deferral asked for by name. That comment held trackers back over "what an id means when the thing is renamed"; the answer was already in the data — a `TrackerDef.id` **is** the frontmatter property it writes, so it survives a relabel, and editing it makes a new tracker rather than renaming this one.
- **`journal-recent[:<folder>|all][|N]` — what you wrote lately.** The notes under this scope, newest first, each with the journal and container it lives in, how long ago its `date` was, and its rating where its kind declares one. The journals' answer to `timeline`: every other journal widget asks about structure, asks what is due, or waits for a word to be typed into it, and none of them said what you last did — which is what a dashboard opened cold is being asked.
- **Rows in the three catalogues that could not compose one.** `DiarySection`, `EntrySection` and `JournalSection` gained `row`/`cell`, and all four catalogues now share one `rowRuns` helper rather than four copies of the rule. `JournalSection.row` is a *predicate* on the note's shape, because a container index and a leaf index are not the same page.
- **An opt-in regroup migration**, in `Set up / repair vault → Run format migrations`. See *Migration* below.

### Changed

- **The homepage.** The top row is now `diary:3 | launcher + upcoming + tasks-table`, and the **time grid is composed** rather than merely offered — it shipped in 4.55 and a reader who never opened *Edit this note's sections…* had no way to find out it existed. `on-this-day` leaves this page and stays on the two that are *about* retrieval: Search and the diary dashboard.
- **The diary dashboard** is two rows where it was four stacked blocks: `tasks-table | tag-index` under one *Across the diary* bar, and `on-this-day | sleep-summary` under *Looking back*. **`sleep-summary` is composed**, which is the first default layout it has ever appeared in.
- **The four period dashboards.** `entry-rollup` and `tasks-table:,period` are now one row under an *Inside this week / month / quarter* bar. The **time grid is composed on the weekly** overview, full width, under the summary. **`period-recap` is composed on the quarterly and yearly** overviews, and **`entry-rollup:month` on the quarterly** — the Yearly overview was a summary and a charts region, the thinnest page the plugin shipped.
- **The five entry templates.** The shared band composes as **two rows** — `note:focus | tasks:todo`, then `list:highlights | list:challenges` — with `log`, `attachments` and `capture` full width below. `todo` moves up beside `focus` on every grain, in `DIARY_FIELDS` as well as in the templates, so what a rollup gathers and what the page shows stay in the same order.
- **The journals dashboard and each journal's own.** `review-queue:all | tasks-table` share a *Due and open* band on the journals dashboard, with `journal-recent:all` under it; each journal's dashboard gains a composed **stats band** and a *Lately* row pairing `journal-recent` with its open tasks. The band was opt-in until now for a reason that did not hold — a bare `stats-band` resolves to the scope's own default, so it arrives drawing something on a journal of any shape.
- **The index journal templates** compose `review-queue | tasks-table` under a *Due and open* bar where the note has containers below it, and the single-cell *Review* and *Open tasks* sections where it does not. Leaf templates stay stacked: only a section rendering exactly one fence block can become a column, and `path`, `resources`, `headings`, `recall`, `checklist` and `prose` emit regions or markdown.
- **A row that falls to one cell stops being a row.** `row` and `cell` lines are dropped from a fence holding a single widget, in every catalogue, which reverses 4.4 §3 — that release left the lines in place deliberately, and shipping rows in four catalogues turned the argument around.

### Fixed

Five engine defects that only became reachable once these catalogues composed rows, all of them present before this release:

- **`applyDiarySections` did nothing when one cell of a row was removed.** Removing a section that shared a fence with another left the fence untouched, so the section editor reported a change it had not made.
- **Removing a cell from a row and adding it back did not restore the file** — on flat notes since 4.2, and on diary dashboards as soon as they could compose a row. The section came back in a fence of its own beside the row it had been cut from. It now rejoins the row it left, on the correct side of the existing `cell` divider.
- **`assetUnits` read `row`, `cell`, `frame:`, `tab:`, `height:` and `wide` as content directives.** Its list of modifier keywords had exactly one entry (`header`), complete when it was written and silently wrong from 4.1 — a `frame:` line was read as a widget the note was missing, and the reconciler would splice one in.
- **`fenceKeywords` and `ownerOf` in the journal planner had the same partial list**, and the same consequence. All of these now read one `MODIFIER_KEYWORDS` set.
- **A fence holding two sections was attributed to neither.** The journal planner assumed one fence meant one section, so a row fence was foreign to the plan and `isHandEdited` called a freshly composed template edited. Runs and chunks now carry every section id in the fence.

### Migration

Repair stays **additive**: a section that stops being optional is spliced into a page you already have, at its catalogue position, and nothing already there moves. The `period-recap`, `entry-rollup`, `time-grid`, `sleep-summary` and `stats-band` flips above arrive that way — stacked, not grouped, because an additive reconciler cannot reach a group.

Grouping is a **separate tick**: `Set up / repair vault → Run format migrations` now offers, per page and with the diff shown, to weld the blocks this release groups into the rows it writes. It is the only thing in the plugin that moves your blocks relative to each other, which is why it is never done unasked. It declines outright rather than guessing whenever a cell is missing from the page, written twice, or carrying a `tab:`, `height:`, `frame:` or `wide` you set yourself. Your own arguments come through untouched; a band's header does not, because a row draws one bar above both of its columns and a bar that named one cell is not true of two. The 4.68.1 gate covers it — every format migration is exercised against every note this release writes, and none may fire.

`tab` is deliberately **not** composed anywhere. A page is a gesture you make in the section editor; a shipped page that hides half its content behind a tab on first open is a worse default than a column.

## [4.69.0] - 2026-08-23

**Distraction-free mobile view with customizable floating toggle button, swipe gesture isolation, responsive button wrapping, and streamlined narrow Logbook layout.**

### Added

- **Distraction-free mobile view toggle.** A floating quick-toggle button allows hiding Obsidian's mobile overlays (navigation bar, view header, toolbar, and status bar) with a single tap, maximizing reading and dashboard space.
- **Mobile settings section.** Configurable in settings under "📱 Mobile", allowing customization of floating button placement (`off`, `left`, `right`) and default hide behavior on startup.
- **System status bar safe area clearance.** Dedicated top safe-area padding ensures the phone's glance bar (time, cellular, wifi, battery) never collides with vault banner controls.
- **Group tab swipe isolation.** Horizontal swipe gestures across multi-page widget cards are isolated with gesture direction locking and event propagation stops, preventing accidental Obsidian sidebar opens during page changes.
- **Streamlined narrow Logbook layout.** Action chips collapse into compact icon buttons on narrow viewports to preserve single-line header hierarchy, status filter pills stretch full-width for balanced touch interaction, and the quick-capture box is unified into a cohesive card container with a top selector/timestamp bar and borderless input.

## [4.68.1] - 2026-08-23

**`Set up / repair vault` no longer offers format migrations for notes the current release just wrote.**

### Fixed

- **The diary dashboard was offered a format migration on a freshly created vault.** The period summary migration asked whether the fence carried a `header:` line, but the composer titles that fence with `frame: section` instead — so the repair window proposed inserting a header into a note the scaffolder had written minutes earlier. It now asks `isSectionFence`, the same predicate the drag and the section editor use, which is the union of both ways a fence titles itself.
- **The documentation was read as a live widget page.** `assets/documentation.md` prints an example fence by wrapping it in a longer, four-backtick fence; the fence scanner matched the three-backtick ```chronoanvil opener inside it and treated the illustration as a widget block, so repair offered to rewrite the docs. Fences now follow the markdown rule that a closing run must be at least as long as the opening one, and a code block this plugin does not own is skipped whole rather than walked into.
- **A gate against the whole class.** Every format migration the repair window runs is now exercised against every note the release writes, and none may fire. A migration exists to carry an older note forward, so one that fires on current output is a defect whichever side is wrong.

## [4.68.0] - 2026-08-23

**The generated vault map is rebuilt from one spec and one layout engine, and the graph view drops from two hubs to one.**

### Added

- **`ChronoAnvil.canvas` regeneration preserves your arrangement.** `Maintenance: generate vault canvas map` now merges rather than overwrites: a node you dragged keeps the position and size you gave it and takes only its rebuilt meaning, a node you added yourself is never touched, and the notice reports how many were kept versus placed.
- **Subsection-free vault map with full coverage.** Six branches grouped by role rather than by folder, covering all four vault roots — `00 - Infrastructure` and `01 - Material` were previously unrepresented, and the events workbench was absent entirely.
- **Four node size classes.** `hub` 560×720, `board` 460×600, `panel` 380×480 and `table` 940×360, each sized for what its note actually embeds rather than a flat 320×180 that clipped every dashboard to its title bar.
- **Canvas nodes use the plugin's own palette.** `CANVAS_HUE` mirrors `--ca-ev-*` from `styles/00-tokens.css`, so a logbook's node on the map and its colour in the time grid are the same fact. A registered logbook's panel takes its own colour.

### Fixed

- **Two vault map nodes pointed at files that have never existed.** The quarterly and yearly nodes hardcoded `04 - Quarterly.md` and `05 - Yearly.md`; the dashboards have been folder notes since 2.57. Both now come from `quarterOverviewPath()` / `yearOverviewPath()`, and a test asserts every surface the map draws is a note the scaffold writes.
- **Overlapping groups on a populated vault.** The Search group was positioned from the hub while every other group was positioned from its neighbour's width — two coordinate systems on one canvas, colliding as soon as the diary held about twelve entries.
- **Six hidden graph links named notes that do not exist.** Entry templates linked to `02 - Weekly`, `03 - Monthly`, `04 - Quarterly` and `05 - Yearly` — the diary's pre-2.57 folder names — logbook notes to `06 - Logbooks`, and journal notes to a level *noun* such as `[[Lesson]]`. An unresolved wikilink still draws a node, so every vault's graph carried phantom notes for folders it does not have.
- **The graph view had two hubs.** Every composed note carried a hidden `[[Homepage]]` while `ChronoAnvil.canvas` linked to the same surfaces, drawing the same star twice. Notes now name their parent only — an entry names its grain's dashboard, which names the diary, which names the homepage — so the graph shows depth instead of a second wheel. Three notes still name the homepage: the diary dashboard, the journals dashboard and Search.
- **Dated entries no longer pinned to the map.** The prototype placed the twelve *alphabetically first* daily notes — the twelve oldest days in the vault — on a structural diagram that was stale by the next morning.
- **Logbooks on the map come from the registry.** A folder scan picked up stray notes and missed a registered logbook whose note had not been written yet, so the map disagreed with the settings tab in both directions.

## [4.67.0] - 2026-08-23

**Universal horizontal drag-to-tab navigation across multi-widget groups and redesigned Style A segmented floating pill footers.**

### Added

- **Universal horizontal drag-to-tab gesture.** Groups of widgets with multiple tabbed pages can now be swiped/dragged horizontally from anywhere across the group surface to switch between pages. Direction locking preserves uninterrupted vertical scrolling within cards.
- **Style A segmented floating pill footers.** Group footers feature a modern floating pill container (`.journal-group-tabs`) with pill buttons (`--ca-radius-pill`), elevated active accent fills, smooth hover transitions, and an integrated `+` add-page button.

## [4.66.0] - 2026-08-23

**Section editor form toggles allow seamless two-way switching for standalone widgets, logbook widgets in groups support custom drag-height resizing and tab paging, and tooltips are refined.**

### Added

- **Custom drag-height resizing for grouped logbooks.** Grouped logbook widgets in multi-cell cards now seamlessly expand and contract using the bottom card drag handle (`--ca-card-h`), unlocking heights beyond the default 440px limit.
- **Logbook group paging and extraction.** Registered 1-line widget form extent for convertible widgets (`w:logbook`, `diary`, `tasks`), enabling the "Start a page here" tab delimiter and "Take out of the group" actions within multi-widget cards.

### Fixed

- **Standalone widget / section toggle lock.** Fixed an issue in the Section Editor where toggling a standalone section into a widget incorrectly classified it as being inside a multi-cell group, locking the toggle into a disabled state. Standalone sections remain interactive and reversible at all times.
- **Group control tooltip phrasing.** Corrected tooltip descriptions across group split and page break buttons to consistently refer to `widget's` / `widgets'`.

## [4.65.0] - 2026-08-23

**Logbook widgets gain unified multi-type aggregation, an interactive category dropdown, collapsible search, segment status controls, and rich tag formatting.**

### Added

- **Unified multi-type logbook widget.** A bare `logbook` or `logbook:all` directive aggregates items from all registered logbooks in the vault, supporting in-widget filtering by category, status, and search query.
- **Log type filter dropdown selector.** Replaced static titles and wrapping pills with an integrated dropdown picker on the top-left of the logbook header, displaying live entry counters per category.
- **Collapsible search bar.** Added an animated collapsible search toggle (`🔍 Search`) to the toolbar deck with real-time text matching, keyword highlighting (`<mark class="jcl-highlight">`), and instant clear button.
- **Segmented status control.** Grouped status filters (`All`, `Open`, `Done`, `Timed`) into a segmented pill control matching native Obsidian design aesthetics.
- **Enhanced tag and inline code typography.** Log cards format `#tags` as styled pill capsules (`.jcl-text-tag`) and ``` `code` ``` as monospace blocks (`.jcl-text-code`).
- **Contained scrollable viewport.** Logbook cards are contained in a max-height scrollable viewport (`440px`), preventing long logs from expanding notes indefinitely.
- **Section editor "Show as widget" toggle.** Added `formQuestion` support for logbook sections and widgets, allowing users to toggle between a foldable section header and a bare embeddable widget.

### Fixed

- **Sticky widget header banner bug.** Fixed `:focus-within` trigger on `.journal-widget-card` that caused the top drag header banner to stick open whenever any button or control inside a widget was clicked.
- **Timestamp editor duplication.** Fixed click handler on the log item timestamp button to correctly detect and dismiss the active timestamp/duration editor rather than appending duplicate editor rows.
- **Live reactivity for new entries.** New entries added to unified multi-logbook views are immediately written to their target note and reloaded into the active view without requiring a page reload.

## [4.64.0] - 2026-08-23

**Search surfaces gain quick filter chips, bracketed tracker operators, and keyword highlighting, while the diary calendar header navigators are streamlined.**

### Added

- **Unified bracket filter syntax across search surfaces.** The query parser now supports bracketed expressions such as `[mood>=5]`, `[mood<=2]`, `[mood>3]`, and `[mood=4]`, evaluating against numerical trackers and frontmatter.
- **Quick filter chips & year selector.** Entry Timeline, Diary Search, and the main Vault Search Modal (`Ctrl/⌘ K`) now provide 1-click Year selector pills (`All`, `2026`, `2025`, etc.) and attribute quick chips (`Tasks`, `Files`, and `Monthly`).
- **Search match keyword highlighting.** Search terms are highlighted using `<mark class="jdr-highlight">` in both note titles and excerpt snippets.
- **Compact view toggle.** Added compact single-line mode for high-density scanning across timeline and search results.

### Fixed

- **Timeline search icon text collision.** Fixed placeholder text overlapping the magnifying glass icon by switching to a modern flex container layout.
- **Sticky timeline month header gap.** Eliminated top bleed gap on the scroll container so sticky month headers dock flush against the scroll boundary.
- **Streamlined Diary Calendar header.** Removed the redundant top action strip (`Capture` and `Search` buttons).
- **Diary Calendar navigators redesign.** Redesigned the calendar's year steppers into standalone square navpills (`<` and `>`), a centered standalone year pill trigger (`📅 2026 ↗`), and an interactive Today pill with an accent dot indicator, matching the visual language of diary entry tracker headers.

## [4.63.0] - 2026-08-23

**Period summaries adapt cleanly to rows and groups, static sections gain the widget form, and the capture dialogue is refined.**

### Added

- **Show as a widget across static sections.** Static-sized sections (`recap`, `time-grid`, `journals`, `on-this-day`, `activity`, and `contents`) now offer the "Show as a widget" (`form: widget`) question in their section editors, allowing them to render without an outer section heading.
- **Tight square radius token.** Added `--ca-radius-xs` (3px) for badges, squared-off controls, and compact time indicators.

### Fixed

- **Period summary layout inside groups and multi-column rows.** The overview summary and its action buttons are now unified into a single `.journal-overview-card` container. Grouped or tabbed period summaries no longer split into unintended columns, span their full page width, and preserve complete card chrome.
- **All-day lane event display.** Fixed one-off and multi-day events rendering in the all-day header cells of the time grid.
- **Capture dialogue visuals.** Increased spacing across the modal body, label columns, and textarea. Squared off the edges of the timestamp button and time editor fields, and fixed the dropdown chevron background repeat on the destination selector.

## [4.62.0] - 2026-08-23

**The time grid tells the time, takes a drag, and writes back — and capture says when and where.**

### Added

- **A now line.** The grid draws the current minute across every column, capped with a dot on today, and moves it every minute. The window widens to hold the current hour when the week being drawn is this one, and the line is removed rather than pinned to an edge when the clock leaves the window — a line at the top of an 08:00 grid at 06:15 would be a legible falsehood. A grid opens scrolled to the line, once, rather than at the top.
- **Draw a meeting.** Dragging down an empty column opens the event editor seeded with the day, the hour and the length you drew; a click is one quarter-hour slot. Nothing is written until you save it, because a block on an empty Thursday has no title yet.
- **Drag to reschedule.** Events, logbook items and captures move by dragging and resize by their bottom edge, snapped to the quarter hour, written straight back to the events note or the logbook region. The arrow keys do the same thing more accurately: Up/Down move, Shift+Up/Down resize, Left/Right change day. A ghost shows where the block is going while the block itself stays where the file still says it is.
- **A grid that fits its pane.** `time-grid:events|3` now takes a day count as well as its sources — the whole week, three days around today, or one day — and a pane too narrow for the count it was asked for narrows further on its own, keeping the days around today rather than the first ones of the week. Source chips in the bar fold events, logbooks, tasks or captures away without editing the note.
- **Captures on the grid.** `time-grid:captures` draws the day's captured thoughts against the clock. Nameable and never part of the default, so every grid already in a vault draws exactly what it drew.
- **An events workbench.** The `events` manager splits into Recurring, Coming up and a folded Earlier with a count, prints the hour and the length rather than only the day, gains a filter box past eight events, and puts turn-off, duplicate and delete on the row. The editor is still the only place a field is edited.
- **Weekly events.** An event can now repeat on a weekday — "every Wednesday at 09:30" — with an optional first and last week. Weekly recurrence requires a time, takes one row in the agenda rather than fifty-two, and is deliberately all there is: no nth-weekday, no intervals, no monthly, no skipped occurrences.
- **Capture says when.** The capture box shows the stamp it is about to write as a button; pressing it opens the same day/time/length fields the log card has. A thought at 15:40 about the 09:00 stand-up can now say 09:00.
- **Capture into a logbook.** The destination list gains every region-backed logbook, so a work-log line and a captured thought are the same keystroke. A logbook destination stamps the day as well as the minute, because its note spans months.

### Fixed

- **The last hour of the grid is no longer clipped.** The scroller now scrolls in both directions explicitly with a height of its own, and the grid reserves the half-line the final hour label hangs into.
- **A narrow grid no longer squeezes its columns past legibility.** The grid keeps a minimum width per drawn column and scrolls sideways within its pane instead.
- **The all-day lane label no longer wraps.** "all day" stayed on one line at every gutter width, which is also narrower now in a narrow pane.

### The example vault gets charts, logs and events

`tools/seed-vault.mjs` wrote a year of tracker readings and not one chart drawn
from them, three empty logbooks, an empty events note and an empty capture region
in every entry — because everything it wrote was a file that did not exist yet,
and all four of those live in notes the SCAFFOLD already created. A create-only
seeder skipped every one of them.

It now runs two passes. Files first, as before; then **patches** — in-place edits
that fill a chart fence holding no charts, a logbook region holding no items, and
a `chronoanvil-events: []` holding no events. Each one declines a target that is
already answered, which is the same rule the file pass has always followed and
the same `--force` escape: a seeded vault re-seeded stays a no-op.

- **Charts on all six surfaces.** Nineteen directives across the homepage and the
  five diary dashboards — a mood calendar, sleep against mood as a scatter, the
  day's start and end on one axis pair — each surface's plan matched to its
  range. Dashboards are found by the folder-note rule rather than by filename, so
  a renamed diary folder still gets them. A chart is dropped, with a warning, when
  its tracker is declared in settings but absent from the Daily template's
  frontmatter block: it would have no readings, and an empty tile teaches a reader
  less than no tile.
- **Three logbooks with three different shapes.** A dense work log stamped with
  `[mins:: N]`, seven focus lines across thirteen months, and a review list half
  crossed off — because seeding all three alike would render three identical
  widgets and teach a reader that the distinction is decorative. The region is
  created where the widget has not made one yet.
- **Twelve events**, resolved against the run's own `--today`: annual birthdays
  and holidays, two trips, a weekly stand-up, and a week of timed meetings. The
  Meetings logbook is not seeded and does not need to be — it reads the events
  note.
- **Captures in the entries.** Stamped thoughts, ascending through the day, in
  about three fifths of them. Beyond the entry they are what 4.62's
  `time-grid:captures` draws, so a vault seeded without them showed that source
  permanently empty.

A run against a vault that declares **no journals** now says so instead of
reporting a silent success. The corpus's four journals cannot be written until
the vault has somewhere to put them — the shape comes from `customJournals` and
the bodies from the journal's own templates, and both appear when a reader adds
one in Obsidian. Before this, such a run wrote a diary, nothing else, and no
warnings, which reads as complete.

Every one of these is a second spelling of a format the plugin owns, in a file
that cannot import the plugin's serialisers — which is exactly how an earlier
version of this tool came to write recall cards in the task format. So none of the
new tests assert on a string: each feeds the seeder's output to `parseLogItems`,
`parseChartDirectives` or `parseEvents` and asserts on what comes back.

## [4.61.0] - 2026-08-23

**Groups on Diary overviews and folder note, widget-mode grouping, and layout refinements.**

### Added

- **Row and tab groups on Diary Overviews and Diary Dashboard.** The Section Editor now supports creating row and tab groups on all period overview notes (Weekly, Monthly, Quarterly, Yearly) as well as the Diary folder note (`02 - Diary`).
- **Groupable Period Summary and Today/This Month in Widget Mode.** When switched to widget form ("As a widget, so it can sit in a row"), the Period Summary (with inline creation button), Today, and This Month can now join rows, columns, and tabbed pages alongside other widgets.

### Fixed

- **Eliminated nested outer borders in groups containing period summaries.** Single-block composite chrome (`.journal-overview-card`) is now withheld from the outer container whenever a block is rendered as a row/group, eliminating multi-layered borders.
- **Trackers section and homepage calendar layout improvements.** Streamlined full-width period navigators, cleaner card borders, and collapsible headers on period sections.

## [4.60.0] - 2026-08-22

**The vault banner grows customizable background art and an always-visible cog wheel.**

### Added

- **Always-visible cog wheel on the vault banner.** Previously hover-revealed, the cog wheel now stays discoverable at a resting opacity (`0.65`) with smooth elevation to `1.0` on hover, keyboard focus, and touch devices.
- **Header background art and texture subsystem (`00 - Infrastructure/Art/`).** A new customizable art directory seeded with 6 starter vector patterns (Topography, Dot Matrix, Constellations, Aurora Mesh, Isometric Grid, and Minimal Waves).
- **Built-in preset map.** Each bundled pattern automatically applies its optimized background size, repetition, and blend mode (`soft-light`, `screen`, `overlay`).
- **Banner customization settings.** Choose active background art, fine-tune pattern opacity with a slider (0–60%), and toggle subtle ambient theme accent glow directly from **Settings → ChronoAnvil → Vault banner** or from the cog menu's new **"Banner art & settings…"** shortcut.

## [4.59.0] - 2026-08-22

**The period summary is a section, and now wears one — or drops the bar and joins a row.**

### Added

- **The period summary has a collapsible header bar.** Every other section on a
  Weekly, Monthly, Quarterly or Yearly overview is a titled bar you can fold —
  Open tasks, What the days said, Tags, Trends — and the one section you cannot
  remove was the one you could not fold either. It now opens with **📅 This
  week** / **month** / **quarter** / **year**, drawn as the summary card's top
  band rather than as a second border inside it, with the chevron in the corner
  and its folded state remembered per note like every other section's.
- **A toggle that turns the section into a widget.** *Edit sections* → the
  summary's row now carries **"As a widget, so it can sit in a row"**. Tick it
  and the bar comes off; the summary is then an ordinary block, which is what
  lets it be a column of a row group — a fence that titles itself cannot be one,
  because the bar would end up below the group it was supposed to title. Untick
  it and the bar comes back. One row in the picker, one directive in the note,
  two ways of drawing it.
- **The bar is yours to rename.** Click the title, as on any other section bar.
  Turning the section off and on again keeps the name you gave it.

### Fixed

- **The summary is one card, not a card inside a card.** Giving the fence a bar
  also makes it a *section surface* — which is itself a card — so the summary's
  own card ended up inset inside it, with the bar bled to the inner one's edges.
  The surface stands down for a block that already draws a card, so the summary
  reads as one object again with the bar as its top band, exactly like every
  other section on the page.
- **Overviews written before this release can get the bar too.** The section is
  already on the page, so ordinary repair has nothing to add. **Set up / repair
  vault → Run format migrations** puts the bar on it, and shows you the diff
  before it does — the same route that welds an older banner. It leaves alone any
  summary already sitting in a row group, because that is the widget form on
  purpose, and any bar you have renamed.

## [4.58.1] - 2026-08-22

**The time grid becomes a section of the week, with the header bar every section has.**

### Fixed

- **The time grid has its collapsible header bar.** Adding it to a page gave you
  a grid under a plain title strip that would not fold, where every section on
  the page above it folded — and the reason was that it had never been a section.
  It was a page widget, and 4.58.0 offering widgets everywhere is what made the
  difference visible on a dashboard. It is now a catalogue section on the two
  pages where it belongs, with the ⏱️ **The week by the hour** bar you can
  collapse like any other.

### Added

- **Time grid, on the weekly overview and the homepage.** It moves out of the
  **Widgets** half of *Edit sections* and into **Sections** on those two pages,
  which means one per page, offered until you have it and withheld once you do —
  and movable and removable like everything else there.
- **Still a widget everywhere else.** A monthly, quarterly or yearly overview
  keeps it in the **Widgets** list, as many as you like. The grid draws the host
  note's week and falls back to the current one, so a week page and the homepage
  can honestly call it theirs — a March page would have shown you this week — but
  a reader who wants one on a year page is not stopped from adding it.
- **It is offered, never composed.** No existing homepage or weekly overview
  grows a grid on upgrade, and repair neither adds one nor takes away one you
  added.

## [4.58.0] - 2026-08-22

**Every page offers the same widgets, and only the banner is fixed in place.**

### Added

- **Period dashboards can hold page widgets.** Opening *Edit sections* on a
  Weekly, Monthly, Quarterly or Yearly overview offered one thing to add; the
  homepage, two clicks away, offered thirty. Nothing had decided that — the four
  overviews got their own section model when dashboards and flat pages turned out
  to compose different markdown, and the widget list arrived later on the other
  side of that seam. The picker on an overview now has the same **Sections** and
  **Widgets** halves the homepage has: events, a time grid, a search box, journal
  cards, a logbook, an activity strip, and the rest.
- **As many copies as you want, here too.** A widget stays in the list however
  many the page already holds, each with its own dropdown and its own Remove —
  the behaviour flat pages got in 4.56, now on all of them.
- **A widget is offered only where nothing already draws it.** A weekly overview
  is not offered a week summary or a tag index, because the page composes both
  already; a yearly overview *is* offered an open-tasks table, because a year
  deliberately ships without one and asking for it back is a reasonable thing to
  want.

### Changed

- **The period summary can be moved.** It was the one row besides the banner that
  could not be, and the reason had expired: 3.2 fused it into a masthead card
  with the date navigator, and 4.19 dissolved that card and moved navigation into
  the banner — leaving the summary alone in a band, and a section alone in a band
  has nowhere to go. It is part of the page below now, so your charts, your
  rollup and the overview itself can sit in whatever order you want them.
- **The banner is the only fixed row on any page.** It stays first because that
  is where a page's own name belongs; everything below it is yours to arrange.
  Nothing became removable that was not removable before — a section the page
  needs still says so, and now says "You can still move it" when that is true.

## [4.57.1] - 2026-08-22

**Fix: the last section on a page was swallowing the widgets added below it.**
Reported on a homepage, where two logbooks added under *Trends and statistics*
came back inside its card after a reload — and would have folded away with it.

A `header:` bar has always owned the blocks that follow it, because a section
used to be written as two fences: a title fence, then a body fence. Obsidian
renders every block separately, so that was the only way a section could have a
body at all. Every page ChronoAnvil composes now welds the two — the bar and its
widgets are one fence — which makes "the blocks after it" not the section's body
but whatever you put next. The page's last section therefore took everything
added below it, and the homepage's last section is *Trends and statistics*.

A fence that drew its own body now ends its section where the block ends. A bar
alone in its fence still owns what follows, so every note written the older way
folds and shades exactly as it did.

## [4.57.0] - 2026-08-22

**The page keeps scrolling while you are holding something.**

### Added

- **Carry a widget to the edge and the pane follows.** Dragging locked the page
  where it stood, so the only landing places were the ones already on screen and
  a note taller than its pane could not be rearranged past the fold at all. Now
  the top and bottom of the pane are live: gently at the inside edge of the
  band, quickly right at the edge, so the speed is controlled by the movement
  you are already making. Every drag in the plugin gets it — widgets on the
  page, rows in the section editor, journal cards, charts, the cells of a stats
  band, an entry's attachments.
- **And the wheel scrolls too, where your platform sends it.** A browser running
  a drag keeps the wheel to itself; some engines pass it on and some do not,
  which is why the edges are the mechanism rather than the fallback. Where the
  wheel does arrive it moves the same pane.

## [4.56.0] - 2026-08-22

**A page can hold as many copies of a widget as you want.**

### Changed

- **Every widget can be added more than once.** It stays in the *Add a section…*
  list however many copies the page already holds, so a homepage can carry the
  work log beside Current focus beside what is scheduled — three logbooks, each
  with its own dropdown, each removable on its own. Three widgets could do this
  before and the other thirty could not, for no reason anyone had decided: the
  limit was a field's default rather than a judgement about any particular
  widget. Reported against the logbook, which is exactly where a page wanting
  several was most obviously right.
- **A section of the page's own still drops out of the list once the page has
  it**, which is the other half of the same rule and is unchanged. The
  difference is what the two do with what you type: a section keeps content in a
  region named after it, and a second copy would claim the first one's region and
  overwrite it on Save. A widget draws something and remembers nothing.

### Fixed

- **A second copy written by hand is a row in the editor, not an untouchable
  block.** Two `events` fences used to be one section and one *block nobody
  owns* — reported, unmovable and impossible to remove from the window, because
  ChronoAnvil managed only the first fence holding a given widget. Each occurrence
  has its own row now, and removing one leaves the other exactly as it was.

## [4.55.0] - 2026-08-22

**The week, laid against the hours — and a way to say when something happened.**

ChronoAnvil has drawn three calendars and every one of them was a day grid: a cell
per day, with what happened listed inside it. Two of its stores have carried an
hour since 4.52 and nothing could show it. This is the view that can, and the
controls that let a reader set the hour in the first place.

### Added

- **`time-grid` — seven day columns and an hour rail.** Timed events, logbook
  items and tasks that are due, each drawn where it sits in the day. Write
  `time-grid` for all three or `time-grid:events,tasks` for the ones you want; an
  unknown source word is refused by name rather than quietly dropped. On a note
  with `week-start` in its frontmatter it draws that week, so `period-nav:week`
  already moves it; anywhere else it draws this one, starting on the day your
  settings say a week starts on.
  - **The hours it draws are the hours the week uses.** A day is 1,440 minutes
    and nobody uses them all; drawn whole, a week is a wall of empty night with a
    thin band of content in it. The rail covers the earliest start to the latest
    end, padded to whole hours and never tighter than eight, and it grows
    downward first so a 9am meeting stays near the top rather than sinking under
    six hours of empty morning.
  - **Two things at the same time sit side by side.** Everything whose times
    touch is treated as one cluster and shares one width, so three meetings in a
    row do not draw at three different widths — a width means *these clash*, and
    it should mean that consistently.
  - **A moment is drawn as a moment.** An item with no length is a fact about a
    minute, and it gets a flat foot and a floor height instead of a block
    pretending to a duration nobody recorded. Nothing invents a length for it.
  - **An all-day lane above the rail** for tasks due with no hour on them.
  - **Click a block to open what it came from** — the event editor, the logbook,
    the note the task lives in.
- **A length on a timed event.** The event editor shows a minutes field beside
  the time, and only when there is a time: a length with no start is not a span.
- **A length on a logbook item or a capture**, written as `[mins:: 45]` on the
  stamp line.
- **An hour on a task that is due.** Beside the date, and hidden until there is a
  date to hang it on: an hour on no day is not a time.
- **A colour per logbook,** chosen in Settings → ChronoAnvil → Logbooks from the same
  eight the events use — because the grid draws both, and two palettes in one
  view would be two designs in one view. Work, Current focus, Review and Meetings
  ship with four different ones.

### Changed

- **A logbook's add box can say when.** The clock button beside it opens a day, an
  hour and a length; the defaults are still *now* with no duration, so type,
  Enter, done is unchanged. On a capture the same control offers the hour and the
  length but never the day — a capture lives in a dated entry, and the day is the
  note's.
- **The timestamp on a logged item is a button now.** It was dead text, which
  meant an item logged at 17:00 about something that happened at 14:00 said 17:00
  forever. Click it to correct the day, the hour, or how long it took.

## [4.54.0] - 2026-08-22

**A widget can be dropped above the top one in a column.**

The first of a run of patches on the drag gestures themselves, and both of these
are geometry: what a slot covers, and where its bar is drawn.

### Fixed

- **The top of a card in a group means the top of that card again.** Reported
  from a screenshot mid-drag: the pointer is on the head of the first widget in
  the right-hand column and the whole group lights up as *above this block*, so
  the one place a widget could not be put was above the widget at the top. Two
  things had to be true at once for it, and both were.
  - **The band was four fingertips deep.** *Above this block* and *below it* are
    bands along a group's top and bottom edges, and they grew from a flat 16px
    to a quarter of the block — up to 72px — so a hand could find them. A
    quarter of a tall group is the whole head of every column in it, and the
    five places a card offers are inside that.
  - **And nothing inside a column could reach through it.** A column is a query
    container, which makes it a stacking context, so no number written on a
    card's own slot can rise above a number written on the group's. The band did
    not win the argument; there was never an argument to have.
  - **So the columns are lifted over the bands instead of the other way round.**
    While something is in the air a column outranks the group's own bands, and a
    band keeps exactly what no column covers. The five places on a card work
    everywhere a card is, including the first and last in a column.
  - **And a band is paid back from outside the block rather than from the
    columns.** It now reaches 16px past the block's edge, into the margin
    between it and its neighbour — which is the space between two groups, where
    *out of this group* is what a reader means. Two neighbouring blocks tile
    that space between them, and the bar still draws on the block's own edge.
  - **The gap between two stacked cards is no longer dead.** It used to be
    covered by whichever band reached it. It belongs to the card above it now:
    *below this one* and *above the next* are the same place, and reaching down
    rather than up keeps the top of a column clear for the band above it.
- **The new-column bar is drawn on the seam it names.** A widget dragged to the
  left or right edge of a card opens a column there, and the bar marking it was
  drawn 14px too far out — clear of the gutter and onto the neighbouring card.
  The two edges naming one boundary put their bars 20px apart, one on each side,
  neither on the line between them. The bar was placed correctly against the
  card and then the hit area around it was widened without the bar being told;
  it is written as the sum of the two now, so they cannot come apart again.

## [4.53.2] - 2026-08-21

**A section can be put into a group it is not next to.**

### Added

- **Make a group is a link icon, under the row's arrows.** The opposite of
  **Take out of the group**, in the slot **Take out of the group** moved to one
  patch ago — and it is one slot, not two, because a row is in a group or it is
  not and exactly one of the two icons is ever drawn on it. Up, down, in and out
  are four answers to *where does this row sit*; the actions line keeps the
  controls that answer something else.
- **It reaches any group on the page, not only the block above it.** That was
  the real limit and it was easy to miss, because the control looked complete:
  a widget three rows under the group it belonged beside had no way in except
  pressing an arrow at it until the two were touching — walking it past
  everything in between, one press at a time. It can now name the group and go.
  - **You are asked which, when there is more than one.** With a single
    destination it just does it: the page has already answered, and a dialog
    there is a keystroke charged for nothing. So the ordinary case — a page with
    one group, or none — is the one press it always was.
  - **It arrives at the near edge.** Joining from above makes it the group's
    first column and joining from below its last, which is **Take out of the
    group** read backwards: take a member out to look at it, put it back, and
    the group is as you left it rather than reordered behind you.
  - **A lone section is still not offered another lone section further off.**
    Those two are not a group yet, so joining them is not *put this in that* —
    move one under the other and the block-above rule has it. Offering it would
    have made a page of eight ungrouped widgets ask a question with seven
    answers before it could make its first group.

### Fixed

- **A section at the very top of a page can be put in a group.** There is no
  block above it, so the old control was not drawn there at all, whatever sat
  underneath. This is the row the homepage's diary card becomes the moment it is
  taken out of the top row, so 4.53.1 and this patch met on it.

## [4.53.1] - 2026-08-21

**The homepage's diary card is yours to remove, and the split control moved
under the arrows.**

Both reported from the same screenshot of 4.53.0's rebuilt editor.

### Changed

- **The homepage's diary card can be unticked.** It was a required section from
  4.2 until now, and the row said so: a *can't be removed* pill, a subtitle
  where its blurb should be, and no Remove toggle. The lock was argued on the
  homepage having no `links:` row of its own — the card's destination pills ARE
  that page's time navigation — which is true of the page and was never true of
  the vault. The ribbon, the command palette and the diary dashboard are all
  still doors into the diary, so the lock was not holding the only one open; it
  was refusing a reader a homepage of journals and charts for nothing. The card
  is still what a fresh homepage composes with, and it now moves, groups and
  goes like every other row.
  - **The diary dashboard's own copy stays locked.** *A page about the diary
    with no way into the diary* is the stronger claim, and it is the one that
    survives. So is the banner, on every surface, for its own reason.
- **Take out of the group is an icon under that row's arrows.** Up, down and out
  are three answers to *where does this row sit*; the actions line answers *what
  is this row for* — a dropdown, a field, Remove. Sorting the controls by the
  question they answer also keeps every mover away from the remove toggle, which
  is what the arrows' column was for in the first place, and stops the longest
  label in the window from setting the wrap of every actions line carrying it.
  The refusal it shows on a member whose lines cannot be told apart from its
  neighbours' is now on hover, and the button is named for a screen reader
  rather than being an unlabelled glyph.

## [4.53.0] - 2026-08-21

**The group controls in the section editor, rebuilt.**

Reported from a vault: *"the group editing controls in the section editor is a
buggy mess"*, with one case named — a section below a group, moved upward.

One sentence explains nearly all of it. The editor held its arrangement as a flat
list of rows plus one bit each — *this row is with the one above it* — and every
control moved a row by **swapping it with its neighbour in that flat list**. A
group is a RUN of rows, a swap is blind to where a run ends, and the bit that
opens a group is the *absence* of a bit. So the neighbour of the row below a
group is that group's last column, and trading places with it left the group's
members no longer next to each other with a bit now pointing at the arrival: one
press, and the group you had was gone and one you had never asked for was in its
place.

### Fixed

- **A section below a group moves over it, not into it.** The list has two levels
  now and the arrows follow them: a section on its own is a block and moves past
  the block above or below it, whole group or single row; a section inside a
  group moves among that group's columns and cannot leave through an arrow. Each
  arrow says which it is about to do before you press it.
- **A group can be moved.** The card carries its own up and down arrows and is
  the handle for dragging the whole group somewhere else. There was no way to
  move one before: you pressed an arrow on each member in turn and watched it
  come apart doing it.
- **Moving a group's first column no longer swallows what is above it.** Same
  cause, other end — that row's membership was recorded as the absence of a bit,
  and absence does not travel with a swap.
- **Take out of the group** no longer takes the columns after it as well. It used
  to cut the group in two at that row rather than removing the row from it, so
  taking the middle one of three out left a group of the two you did not name.
  The section now leaves through the nearest edge — below the group, or above it
  where it is the one the group starts with — and the rest of the group closes up.
- **Break up the group** takes the group's page divisions with it. Leaving them
  behind meant rebuilding the group brought back boundaries you had asked for
  once, a while ago, on a different arrangement.
- **A section you have just added can be grouped.** Whether a section may be a
  column was read once, from the file as it was opened, so a widget staged in the
  same session had no answer — **Make a group** came up disabled wearing a
  sentence about title bars that was not true of it and was not why. It is now
  asked of the file the Save would write.
- **Add to group names the block above, not the row above.** Where the row above
  is the last column of a group, a join is into the whole group; where it is
  being removed, it is not there at Save. Both used to read the screen and mean
  something else.
- **A drag can no longer land in the middle of a group.** Dragging is scoped the
  way the arrows are: a column may be dropped only on another column of its own
  group, and a section dropped anywhere on a card lands beside the group.
- **A struck-through row stops pretending to be in a group.** It is not in the
  file the Save writes, so it is not in the blocks it writes: a card whose kept
  members come down to one is no longer drawn as a group, and a removed member no
  longer disables **Break up the group** or divides the card into pages.
- **Every refusal says why.** **Make a group** was simply absent where the
  destination could not hold a column, and where the section was still waiting on
  its own question. Both now draw the button disabled with the reason, which is
  what the rule about a section's own title bar has done since 4.12.

### Internal

- **`src/core/row-order.ts`** owns the arrangement — the two bits, the blocks they
  cut, and every operation over them. `keptBlocks` moved there from
  `section-model.ts` beside its new sibling `keptPages`, which keeps a group's
  page boundaries where they are when two of its columns trade places. The window
  is now a drawing of it: nothing there reorders a list or writes a bit.

## [4.52.1] - 2026-08-21

**A group holds two columns.**

Reported from a vault: *"the groups can be easily broken and don't reflect what
is shown in the editor."* Four widgets in one `row` fence. Three fitted across
the note and the fourth wrapped onto a line of its own, where it stretched to the
full width of the group — so a column stopped reading as a column, and the file,
the section editor and the page all said something different. The row had been
able to ask for more columns than a pane can hold since 4.2; a three-column row
does the same thing in a half-width pane.

### Fixed

- **A row draws at most two columns.** A column asks for 320px, so two plus the
  gap need 650px and three need 980px — which a sidebar, a split pane and a good
  many windows have not got. Past that, whatever the wrap did, the shape of a
  group depended on how wide the reader's sidebar happened to be.
- **A fence that asks for more is dealt, not truncated.** Nothing is dropped and
  nothing is hidden: the third widget goes under the first and the fourth under
  the second, so four are a 2×2 read across and then down. Notes written before
  this release draw two columns straight away, and the next time the section
  editor saves one the file says what the page has been drawing.
- **Nothing offers you a third column any more.** The left and right edges of a
  card in a full group are no longer landing places — its top, bottom and middle
  are how a widget joins one — and **Add to group** stacks the arrival at the
  foot of whichever column is holding fewer.
- **A page added and removed leaves the group it found.** Starting a page inside
  a group and then joining it back used to leave a column boundary behind where
  there had never been one, because taking a page away turns its line back into
  a `cell`. That is right where the page began at a widget with a column of its
  own, and wrong where it began at one stacked under another — the homepage came
  back with three columns after two clicks that should have cancelled out.

## [4.52.0] - 2026-08-21

**Logbooks — the diary's undated layer.**

The diary has had two layers and both are dated: an entry says what a day was
like, an event says what a day *is*. Everything else you keep — what you worked
on, what you are focused on now, links to come back to, the meetings ahead — had
nowhere to go, because it belongs to the diary and to no single day.

- **A logbook is a standing note.** Four ship — **Work log**, **Current focus**,
  **Review links** and **Meetings** — each a note under `02 - Diary/Logbooks/`,
  listed together on that folder's own note, and written by *Set up / repair
  vault* alongside everything else it writes.
- **Add your own** in Settings → ChronoAnvil → **Logbooks**. Removing one there
  leaves its note where it is: the list says which logbooks ChronoAnvil draws, not
  which files you keep.
- **`logbook:<id>` draws one anywhere.** It shows the logbook's own note rather
  than the note it sits on, so `logbook:work` on the homepage shows — and takes
  — items in `Work log.md`. Type into the box to add one, tick to cross it off,
  edit or delete on the card.
- **Items are stamped with the day and the minute.** A capture is the same kind
  of item stamped only with the minute, because its note already knows which day
  it is; both are one grammar now, so nothing about an existing capture region
  changed.
- **A meeting is an event with a time on it.** Events gained an optional hour,
  which is what the Meetings logbook lists — so a meeting added there lands on
  the month grid and in *coming up* as well, instead of living in a second
  calendar that the first one knows nothing about. Two events on one day now
  order by the hour rather than alphabetically.
- **The head knows what a logbook is.** A work log used to read *DAILY ENTRY*
  over its filename, because a note under the diary root that is in no grain
  folder was assumed to be a day.

## [4.51.9] - 2026-08-21

- **The destination tiles are outlined again.** 4.51.8 read *"punchout cards"* as
  being about the border and the ground together and took both, which left
  nothing to say where one target ends and the next begins. It was the fill: a
  hairline on the bar's own ground is a button's outline; a hairline around a
  second ground is a card on a card. The page you are on takes the accent on its
  outline as well as its label.
- **The search field fills the bar.** The cap is gone — on a wide pane it was
  leaving several hundred pixels of nothing between the field and the tiles.

## [4.51.8] - 2026-08-21

**The bar's row of destinations, and the Properties window's spacing.**

- **Home · Capture · Diary · Journals.** *Today* is off the bar and *Diary* has
  taken a slot: the bar goes to places, and the two halves of the vault should
  be one press each. Today's entry is still on the command palette and one press
  away on any diary calendar.
- **The destination tiles are not cards.** They had a border and a ground each,
  which read as four punched-out boxes on a bar that is already a box. The
  target is the same size; what says "pressable" now appears under the pointer,
  and the page you are on is marked in the accent rather than boxed.
- **The search field is longer** — it now runs to 620px before it stops growing.
- **The Properties window has room again**: air under its head *and* on the
  first field (4.51.7 gave it one and took the other), the note's name clear of
  Obsidian's close button, the buttons below the list rather than on its last
  row, and wider value fields.

## [4.51.7] - 2026-08-21

**The first vault render of the page head, across six surfaces.** Almost
everything it found is one of two shapes: two places saying one thing, or a fact
that never arrived.

- **The head repaints itself again.** It carries the note's title, its kind and
  its date — all properties — and 4.51.6 dropped the live wrapper the banner it
  replaced had. On a note Obsidian had not finished indexing, the head drew no
  kind at all and never filled it in. Editing a property in the Properties
  window now repaints the head under it too.
- **The date is no longer printed twice on an entry.** The head names an
  untitled entry by its date; the caption over the tracker grid was saying it
  again a centimetre below. Same for a journal note's level: the head reads
  *Study · Subject* and the card below no longer repeats *Subject*.
- **Every page the bar draws on has an eyebrow now.** *Journals*, *Study ·
  Journal*, *Diary*, *Diary · Monthly Overview* — the four dashboards had none,
  because they carry no `type` property of their own. The homepage and Search
  still have none, on purpose: their titles already say what they are.
- **A period overview names its period.** The head reads *August 2026* rather
  than *Monthly*, the folder note's filename — and the big month name in the
  card below is a navigator again, at a control's size.
- **The bar names the journal on its own dashboard.** It read *Journal* on
  `Study/Study.md` and *Study* on every note inside it.
- **Obsidian's centred note path is hidden** with its title and property panel,
  under the same setting — it was a third naming of the note, between the bar's
  trail and the page head. The arrows, the mode toggle and Obsidian's own ⋯ stay.
- **In the Properties window**, the head no longer sits on the first field, and
  *Add a property…* has its words back — it was rendering as a bare `+`.
- **No `0` on the Properties button** where a note has no properties.

## [4.51.6] - 2026-08-20

**The note's title and its properties are ChronoAnvil's now.** Obsidian draws a
filename in a large face and six rows of properties above everything you opened
the note to write in; on the notes the bar appears on, both are replaced.

- **Every note opens with its own head.** What used to be the Banner section is
  now the page's name — in a page's face, click-to-edit — over a small line
  saying what kind of note it is: *Daily entry*, *Study · Lesson*, *Maths ·
  Topic*. On a dated entry the pencil writes the `title` property, not the
  filename, so renaming an entry does not move it out of its folder.
- **Properties live behind a button on the bar**, with a count on it. It opens a
  window with one field per property: a switch for a checkbox, a number field
  for a number, commas for a list. Add a property, empty one, or remove it.
  Nested values are shown and left alone — edit those in the note itself.
- **Obsidian's inline title and property panel are hidden** where ChronoAnvil draws
  its own. The setting is now *Use ChronoAnvil's title and properties* (Settings →
  ChronoAnvil → Vault banner) and it is **on** by default — it was *Hide Obsidian's
  note title*, off by default, when it took something away without replacing it.
- **The bar's trail ends in plain text.** It is a breadcrumb again — where you
  are — now that the head below carries the name and the pencil.
- **The `links:` card is the only block the bar still silences.** The three
  banner directives draw the head instead of nothing.

## [4.51.5] - 2026-08-20

**The navigation row is gone from diary entries, and a few things stopped being
said twice.**

- **The links card is gone** from diary entries and from the diary dashboard. It
  was Home and Today — both on the bar, six lines above — drawn again in a card
  of their own.
- **Overviews moved onto the bar.** On diary notes the destinations now end with
  a scope control: Week, Month, Quarter, Year, All entries, labelled with the
  one you are on. Nothing the old row offered was dropped.
- **One title on an entry, not two.** The strip over the tracker grid used to
  carry its own *Add a title…* — the same property the bar edits. It keeps the
  navigator between entries, which is the part the bar does not have.
- **The date is no longer printed twice** on an entry with no title of its own.
- **The search field is capped** rather than growing with the window, so the bar
  reads as one object instead of three groups pinned to opposite edges.
- **New setting: *Hide Obsidian's note title*** (Settings → ChronoAnvil → Vault
  banner). Off by default. On the notes the bar appears on, it hides the large
  heading Obsidian draws under it — which the bar already names at the end of
  its trail.

## [4.51.4] - 2026-08-20

**Fix: a journal note's tracker grid was being drawn inside the section above
it.** Reported on a Study topic, where the grid landed inside *Resources* —
sharing its surface, and disappearing when *Resources* was collapsed.

The grid has had a card and a caption of its own since 4.21, but it was the one
block of that kind the section walk did not recognise as its own structure, so
any section still open above it swallowed it. On notes written before 4.20 the
grid lives inside the banner's own fence and inherited the banner's answer —
which is why turning the vault banner on is what made it visible.

It is a section boundary in its own right now, on every note, whether or not the
vault banner is on.

## [4.51.3] - 2026-08-20

**Fix: the bar sometimes didn't appear — and now it lives between the toolbars.**

- **It sits above the note's toolbar**, between the tab strip and the note,
  spanning the whole pane — where the reference design puts it. It no longer
  scrolls away with the note.
- **It always draws.** It used to be mounted inside the note's own scroll area,
  which does not exist yet when Obsidian restores a workspace at startup — so on
  some opens you got no bar *and* no in-note header, which looked like nothing
  rather than like a fault.
- **The diary's and the journals' own pages have it now.** `02 - Diary`,
  `03 - Journals` and the Search note were outside the bar entirely — and the
  journals one affected every vault with no journal set up yet, which is every
  new vault.
- **A dashboard's name is edited as its filename.** Only a dated diary *entry*
  writes to its title property; the diary's own pages and the four period
  overviews do not.
- The diary dashboard no longer shows itself in its own trail.

## [4.51.2] - 2026-08-20

**The bar, drawn the way it was meant to look.** A second vault render beside
the reference design it was asked to follow.

- **The note is named once.** The bar drew a trail *and* a large title under it,
  and Obsidian draws the note's name itself just below — three copies of
  *Homepage* in four centimetres. The title is still on the bar and still
  click-to-edit; it is now the last step of the trail, where you were already
  looking for it.
- **The mark has the vault's name beside it**, with a second line saying which
  part of the vault you are in — *Diary*, *Home*, or the journal's own name.
  Pressing any of it opens ChronoAnvil's settings, as before.
- **The four destinations are proper buttons** — the icon above the word, in a
  row you can hit without aiming, instead of four small links.
- **The bar looks like a toolbar.** It has a ground, a border and its own edge,
  so it reads as furniture above the note rather than as the note's first
  paragraph.
- Below 330px the vault's name drops with the destinations' words; the mark and
  the four icons stay.

## [4.51.1] - 2026-08-20

**Fix: the first vault render of the bar, reported with a screenshot.** Four
faults, all in how 4.51 met notes that already existed.

- **The old banner was still there.** The homepage drew its own name twice — once
  on the bar, once on the card six lines below it. A dashboard's banner is a
  different directive from a journal note's, and only two of the three were
  being silenced. All three are now, from the one list the plugin already kept.
- **Two of the four destinations were missing.** *Today* and *Capture* do not go
  to a note — they open the day's entry and the capture window — and the bar was
  only drawing destinations that were notes. All four again, and *Today* creates
  the entry if it is not there yet.
- **A doubled rule under the bar.** The thin "ChronoAnvil" line at the top of each
  note was a top boundary, and the bar is a louder one right above it. It keeps
  its line — that is where your cursor lands when a note opens — and gives up the
  rule and the wordmark.
- **The dashboard cog lost *Wide page*.** The bar's cog now opens the same menu
  the old card's cog opened, on dashboards as well as on journal notes.

## [4.51.0] - 2026-08-20

**Every ChronoAnvil note now opens with one bar.**

Search, the four places you go most, where this note sits, and its title —
above the note's content, scrolling with it. It replaces the header block that
used to be built into each note.

**What is on it**

- **The tile.** Your vault's initials, or a letter or emoji of your own. Press
  it to open ChronoAnvil's settings.
- **Search everything.** One list over your diary *and* every journal —
  `Ctrl K`, or press the field. Sort by relevance, date, title or open tasks;
  `Tab` cycles, arrows move, `Enter` opens.
- **Home, Today, Capture, Journals.** A destination that does not exist in your
  vault is not drawn, rather than drawn and dead.
- **Where this note sits**, and **its title**, which you can click to edit. On a
  journal note that renames the file; on a diary entry it sets the entry's
  title property, because the filename is the date your diary finds it by.
- **A cog**, offering what the old banner's cog offered on the same notes.

**It appears on ChronoAnvil's notes only** — your diary, your journals, your home
page. A note outside all three gets nothing.

**Nothing is rewritten.** The header block is still in every note; while the bar
is on it draws nothing. Turn the bar off in *Settings → Vault banner* and every
note is exactly as it was.

**Narrow leaves.** Below 330px of bar, the destinations drop their words and
keep their icons, and the search takes a row of its own.

## [4.50.2] - 2026-08-20

**Fix: a binned note stayed in the list, and pressing it again binned it twice.**

Reported with a screenshot showing the giveaway —
`Moved to 00 - Infrastructure/Bin/The Avengers-2026-08-20-2026-08-20.md`. Two
dates is one note binned twice, because the row was still on screen after the
first move.

**The table was not listening for a note MOVING.** ChronoAnvil's live tables rebuild
when a note's *contents* change, and a move changes no contents — so every
folder-scoped table in the plugin (what's below this note, the page index, the
note-type tables) drew its rows once and then sat there while notes were moved,
renamed or deleted underneath it. That has been true since those tables were
written; the bin is simply the first control that moves a file.

They now repaint the moment anything in their folder is created, renamed, moved
or deleted — so dragging a note between folders in the file explorer updates
them too.

**And a row now acts on the note it was drawn for, or on nothing.** If the note
has moved since the list was drawn, the ⋯ says so instead of acting on whatever
is at the end of a stale handle.

**The two bin entries are one.** *Move to bin* and *Move pages to bin* were one
action at two scopes sitting as two rows; there is a single **Move to bin** now,
and the window it opens is where you choose:

- **Note and pages** — the whole thing.
- **Pages only** — keeps the note, moves its pages.

The second button appears only when the note has pages. Cancel is focused, so
pressing Enter on a window you haven't read agrees to nothing.

## [4.50.1] - 2026-08-20

**Fix: *Move to bin* went to Obsidian's trash, which you may not have one of.**

Reported from a vault the same day 4.50.0 shipped. Obsidian's *Deleted files*
setting can be set to delete permanently, or to a `.trash` folder the file
explorer does not show you — so "moved to your vault's trash" was, depending on
your settings, either a place you could not find or not a place at all.

**ChronoAnvil already had a bin and this now uses it.** A binned title goes to
`00 - Infrastructure/Bin/`, the same folder a deleted journal's folders have gone
to since 4.17 — an ordinary folder you can open, look inside, drag a note back
out of, and empty when you mean to. Nothing is deleted, and links from your other
notes are updated to follow what moved.

Two things that got better on the way:

- **A note with pages moves as one folder**, so its pages come with it arranged
  the way they were, rather than being collected up file by file.
- **Loose pages bin together**, into a folder named after the note they came out
  of. *Roots* and *Graphs* mean something under their parent and nothing sitting
  beside another note's *Graphs* next week.

The confirmation now names the folder it is moving things to, and its button is
no longer red — it was overstating what it does. *(4.50.2 merges the two bin
entries into one — see above.)*

Deleting an **attachment** is unchanged and still uses your Obsidian trash
setting: that is a file you attached rather than a note you wrote.

## [4.50.0] - 2026-08-20

**A new title asks what it is built from *and* what its pages are built from —
and every title in the list below a note now has a ⋯.**

The *New title* window used to show one field. It shows both templates now, and
it shows them whether or not you have saved any layouts, because the second one
is how you find out a title has a page default at all:

- **Layout** — what this note starts with.
- **Page layout** — what pages added to it later start with. Saved as a property
  on the note, so it travels with it.

**Adding a page is the same window now.** It was a bare "what shall I call it?"
box; it asks for a layout too, and opens on whatever the title chose. Change it
there and only that page is different — the title's own default is untouched.

**Every row of *what's below this note* carries a ⋯,** faint until you hover it,
always visible on a touchscreen. It holds:

- **The page layout for that title**, ticked on the one actually in use.
- **Move to bin** — the note *and* its pages, so a folder of pages is never left
  behind pointing at a note that has gone.
- **Move pages to bin** — the pages only, keeping the note. Shown only when
  there are some.

Both bins ask first and name what they are about to take. *(4.50.0 sent them to
your Obsidian trash; 4.50.1 corrects that to ChronoAnvil's own bin — see above.)*

## [4.49.0] - 2026-08-20

**Drag one number in a stats band onto another and the two swap places.**

Pick up any cell of a band and drop it on another cell of the same band. The two
trade positions and nothing else moves — the numbers you did not touch stay
exactly where they were, which is what makes it a swap rather than a reshuffle.

The line in your note is rewritten in the new order, keeping any title you typed
after a `|`, and an older `topic-stats` or `journal-totals` block moves onto the
current spelling the same way the ⋯ menu moves it.

A few things it deliberately will not do:

- **A band with one cell cannot be dragged**, so you never get a grab cursor for
  a gesture that has nowhere to go.
- **Two cells that came from one choice cannot trade.** *One per note type* and
  *Every quantity this journal totals* each fill several cells, drawn in the
  plugin's own order — dropping one on another of the same group says so rather
  than doing nothing.
- **A cell from a different band on the same page is refused**, rather than
  rewriting the band you dropped it on.

Dragging needs a mouse. On a touchscreen the ⋯ still does everything else —
change a cell, add one, remove one.

## [4.48.0] - 2026-08-20

**The stats band is edited on the band. Hover a cell, click its ⋯, and pick what
that number is.**

### The four boxes left the section editor

4.47 put *First*, *Second*, *Third* and *Fourth* dropdowns on the band's row in
*Edit this note's sections…* — four controls modelling a row of four cells, in a
window whose job is which sections a note has rather than what is inside one.

Now each cell of a rendered band carries its own **⋯**, faint and only while you
are hovering the cell (always visible on a touchscreen). It holds:

- every number that page can honestly answer, ticked on the one you are looking
  at — including your own note types by name, *how many Lessons*;
- **Add cell**, which adds one right after the cell you opened, showing
  something the band is not already showing;
- **Remove cell**.

The band's row in the section editor is now just its name and a Remove button,
like every other section.

**Nothing about your notes changed.** The menu writes the same directive the
dropdowns wrote, including moving an old `topic-stats` or `journal-totals` block
onto the current spelling the first time you pick something, and keeping any
title you typed after a `|`.

**The last cell has no Remove.** A band with no cells written on it falls back to
the page's own arrangement, so removing the last one would silently bring back
the four cells you had just replaced. Remove the section itself if that is what
you want.

### Fixed: the card's fourth number did nothing

Choosing a **Fourth number** from a journal card's ⋯ ticked the new row, saved
it, and left the card showing the old number until you reopened the note. The
setting was being stored correctly the whole time — nothing on screen was told
about it. Cards now update as soon as you choose.

## [4.47.0] - 2026-08-19

**Every cell of a stats band is now yours to pick, and so is the fourth number
on a journal card.**

### Four boxes instead of one dropdown

4.46 let you choose the band's *arrangement* from a list of four. That was the
wrong shape for the question — a band is a row of cells, and what you actually
want to say is what goes in each one.

*Edit this note's sections…* now shows **First**, **Second**, **Third** and
**Fourth** beside the stats band. Each one is a list of the numbers that page
can honestly answer, and each one can be left empty:

- **Notes** — how many are here
- **What is below** — one level down
- **Open tasks**
- **Last worked**
- **Average rating** — where the journal grades something
- **How many Lessons** (or Practices, or Books — your own note types, by name)
- **One per note type**
- **Every quantity this journal totals**

Clearing a box removes that cell; the ones after it close up.

**The presets did not go away — they became shorthand.** A block that says
`stats-band:progress`, or the older `topic-stats`, opens with **Kinds**,
**Rating** and **Open** already in the first three boxes. Change any one of them
and the block is written out in full. Nothing you have is rewritten until you
choose something.

**Your own note types are new here.** "One per note type" fills as many cells as
you have kinds, which is right when you want all of them and wrong when you
wanted to say *how many Lessons*. Now you can say that.

### The fourth number on a journal card

A journal card shows four numbers, and the fourth was chosen for you: the
average rating where the journal had one, and the count of what is inside it
otherwise.

Open the **⋯** on any card and there is now a **Fourth number** submenu — the
rating, the count of what is below, or how many notes of one of your own kinds.
The row you are currently seeing is ticked, whether you picked it or not.

The choice is stored on the journal, so every page that draws that card agrees.
Picking the row that is already ticked puts the card back to choosing for
itself. **A journal you have not touched is exactly as it was.**

The first three cells stay fixed, because a grid of cards is read across and
cards with different numbers in different places stop being a grid.

## [4.46.1] - 2026-08-19

**4.46 added a way to choose what your stats band shows, and on every page you
already had, there was no way to get at it. Reported within the hour.**

### The dropdown was missing on every existing page

4.46 merged two bands into one and gave it four presets, picked from a dropdown
in *Edit this note's sections…*. On a page **written by 4.46** that worked. On
every page written before it — which is every page anyone actually has — the
row for the band showed the words *"set when added"* where the dropdown belongs,
and the tooltip suggested removing the block and adding it back.

Two separate faults, both from the same cause:

- **The control was not drawn.** The window looks for the answer in your note by
  the block's name. Your note says `topic-stats` or `journal-totals`; the
  question was asking about `stats-band`, found nothing, and concluded the
  answer was unreadable.
- **And if it had been drawn, picking a preset would have saved nothing.** The
  save path finds the line to rewrite the same way, so the answer went nowhere.
  Silently.

Now the question knows the two older names and what each of them draws — a
`topic-stats` block shows **Progress** in the dropdown, a `journal-totals` block
shows **Totals**, because that is what each is drawing. Change it, and the line
is updated to the current spelling with your choice on it. Any title you typed
after a `|` is kept.

**Nothing is rewritten unless you change the preset.** Opening the window and
closing it again touches nothing, exactly as before.

### The box was labelled "Which"

The field beside the dropdown read **Which**, because the question behind it was
worded as a question rather than as a noun. It reads **Numbers** now, like
*Folder* and *Journal* on the rows near it. Small, and it is half of why the
control was hard to spot even on the pages that had it.

### Under the hood

What each old name draws was written down in two places and needed by a third,
which is why the third one could not be built. It is one table now, and the
block renderer, both catalogues' locators and the section editor's question all
read it.

## [4.46.0] - 2026-08-19

**Your journal pages drew two bands of numbers where they meant one, and you
could not change what either of them said. Now there is one band, and you pick
what it shows.**

### Two bands became one

A Media shelf looked like this, top to bottom:

> **3** titles · **4.7/5** avg stars · **1** open tasks
> **753 pages** — PAGES READ

Two strips of numbers, stacked, about the same shelf. They came from two
separate blocks — a **Stats band** and a **Totals** band — which the *Edit
sections…* window listed as two separate things to add, and which folded to two
rows at slightly different pane widths so they never quite lined up.

They were answering the same question. One picked counts and an average, the
other picked sums, and neither could be told to pick anything else.

**There is now one Stats band**, and the two facts above are one strip:
*titles · avg stars · open tasks · pages read*.

### And you choose what it shows

The band takes a **preset** — pick one from the dropdown in *Edit sections…*:

- **Activity** — how many notes, when you last worked here, what is still open,
  and what is below.
- **Progress** — one count per note type, the average rating, what is open.
  *This is exactly what the old Stats band showed.*
- **Totals** — every quantity this journal adds up. *This is exactly what the
  old Totals band showed.*
- **Summary** — how many, how well, what is open, and what it all adds up to.

You can leave it alone: an unpicked band shows the one the page would have
picked for you.

### It knows where it is

The same preset says different things in different places, because it reads the
page it is on rather than being told:

- On a **journal's own page**, *Activity* counts the subjects (or areas, or
  blocks) inside it.
- On a **subject page**, it counts the topics.
- On the **deepest page**, where there are no folders left, it drops that cell
  rather than printing a nought.
- On a page **outside every journal** — your homepage — it counts your journals.

A number a page cannot honestly answer is left out, not shown as a dash or a
zero. That is why one Media directive still shows *Pages read* on a Books shelf
and *Minutes* on a Film shelf.

### Nothing to run, and nothing changes on pages you already have

Pages written before this release keep working exactly as they did — the old
`topic-stats` and `journal-totals` blocks still draw, and each draws the preset
it always drew. Repair will not rewrite them and will not offer you a second
band beside them. If you want the merged version on an existing page, swap the
block yourself from *Edit sections…*.

**Two new journals compose differently.** A new *Media* journal now gets one
band showing all four numbers instead of two bands showing three and one, and a
new *Exercise & Diet* journal gets its Totals through the same one section.
Journals you already have are untouched.

### Under the hood

The two bands were not only two blocks, they were two sets of styling rules —
one hand-written, one shared — that looked alike and folded at different widths.
The hand-written set is gone; there is one strip, one fold, and one place to fix
it. A band is capped at four cells, which is what makes it readable in a narrow
pane; a journal with more quantities than that names the rest in the strip's
tooltip.

## [4.45.1] - 2026-08-19

**Two things a reader found within minutes of 4.45: dragging a chart onto the
chart below it did nothing, and a wide dashboard went narrow when you scrolled
to the bottom of it.**

### A drop landed one place short, on three surfaces

Dragging a chart onto the one directly below it changed nothing at all. Dragging
it two down worked, and looked like a swap. Both are the same defect seen from
two distances.

Three surfaces let you drag one thing onto another to reorder a list — the chart
grid (4.45), the journal cards (4.40) and the section editor's rows (4.8) — and
all three had written the same four lines: lift the dragged item out, then insert
it **before** the target. Each carried a comment explaining that the arithmetic
was safe because both indices are read *after* the lift. That is true, and it
answers a different question. Reading the destination after the removal stops the
index drifting; it does not decide which **side** of the destination the arrival
belongs on.

Insert-before is right for a drag going up and wrong for a drag going down, and
for the adjacent case it is not merely wrong but invisible: lift a chart out, put
it back before the chart that has just moved up into its place, and the list you
get is the list you started with. **So the commonest drag on the grid wrote
nothing.**

The rule now: **the thing you dropped on moves aside towards where you dragged
from.** Down onto it, you land after it; up onto it, you land before it. Dropping
on your neighbour swaps the two, which is what anyone trying it expects to see.
It is still lift-and-insert rather than swap — dragging a card three places up
moves it three places — and only the adjacent case looks like a trade, because
with one place between them the two descriptions agree.

One function, `core/drop-onto.ts`, called by all three. Three copies of a
four-line splice were three chances to get the side wrong, and it was wrong in
all three.

**Two of those three had tests, and both tests asserted the defect underneath a
comment describing the rule they meant.** The journal cards' read *"dropping
Study onto Media means Study goes where Media is"* — and then asserted an
arrangement in which Study stops one place short of Media. A comment is not a
test.

*This changes how the journal cards and the section editor's rows respond to a
drag, not only the charts.* Both now do what their own comments always said.

### A wide page went narrow when you scrolled

A dashboard set to **Wide page** rendered wide, and then collapsed to Obsidian's
own width — every widget in it dropping to its narrow layout — when you scrolled
to the bottom, or when the page grew long enough to scroll after charts were
added.

The width lives on Obsidian's sizer, which is an ancestor of everything a
post-processor can reach, so 4.11 marked the page's title card and reached up
for it from the stylesheet with `:has(.jtc-wide)`. **A reading view does not keep
the whole note in the DOM.** It renders sections as they approach the viewport
and drops them again when they leave — and the title card is the *first* block on
the page. Scroll far enough and the marker the width depended on is unloaded, so
the rule stops matching. Nothing was wrong with the note; the evidence had
scrolled away.

The width is derived from the **file** now — the same `pageIsWide` the cog writes
with — and marked on the view, re-derived for every open note whenever a file is
opened, the layout changes, the active leaf changes, or that note itself changes.

This is not the thing `HOME_CSS_CLASS` refuses. That refusal is of a class put on
the view *at render time*, which outlived the note that caused it because Obsidian
reuses a leaf across file switches. This one is re-read from whichever file the
leaf is showing, so a leaf showing a narrow note has the class removed on the same
pass that adds it elsewhere. Nothing about the declaration changed: it is still
one `wide` line in the block you are looking at, deleting it still narrows the
page, and no part of ChronoAnvil writes it back.

The `:has()` rules are gone rather than kept alongside — two carriers of one
decision would disagree for exactly as long as it takes a card to be unloaded,
which is the whole of this bug. `cssclasses: ca-wide` still works, because
that is Obsidian's own class applied by Obsidian from the file, and it is what
keeps a homepage composed before 4.11 wide.

### Tests

`test/drop-onto.test.ts` — 13 cases over the shared rule, including the adjacent
drop in both directions and a tripwire that fails if any surface writes the old
splice again. The three existing tests that pinned the old behaviour were
corrected rather than deleted, and the correction is named in each. Six
single-token mutations were confirmed to turn the set red; the "changed nothing"
guard was found to be unreachable once the direction is right, and removed rather
than left as a passing line no test could reach.

## [4.45.0] - 2026-08-19

**A line chart can plot two trackers, the grid can be put in the order you
dragged it into, and a chart can be called what you want to call it.**

### Two trackers on a line

A scatter has been able to hold two trackers since 2.19, and it answers one
question: do these two move *together*? The question people actually had was the
other one — sleep dipped in March, **what did mood do?** — and it needs both
series against **time**, which the scatter cannot draw.

So the line chart now takes a second tracker, picked in the same control the
scatter uses, and set back to **— none —** to drop it again. They are aligned by
**date, not by pairing**: a day that logged mood and not sleep is a mood reading
with a gap beside it, not a day that did not happen. Reusing the scatter's own
pairing here would have quietly truncated both lines to the days they share — a
chart plotting a subset of what it says it plots, which looks entirely plausible
on screen — so the join is a named function with its own tests.

**Each tracker gets its own Y axis**, the first on the left and the second on
the right. Minutes of sleep and a 1–5 mood share no scale, and one axis would
flatten the smaller series into a line along the floor. The consequence is
stated in the editor rather than left to be discovered: *the two axes are
independent, so where the lines cross means nothing — read each line against its
own side.* The legend appears by itself once there are two series to tell apart,
and each series reads back in its own unit in the tooltip.

### The rolling average is withheld while a second tracker is set

Not disabled — **withheld, with the reason in its place**. A trailing mean is a
guide through the noise of *one* trend; drawn through two, on two axes, it is a
third dashed line belonging visibly to neither. A greyed toggle would teach
nothing here, because the thing to change is a field two rows up rather than the
toggle itself, so the row says so and names the way back: clear the second
tracker and the control returns, with the setting you had.

The model enforces it as well as the form, so a directive hand-written with both
flags renders as the chart it says it is rather than a fourth line nobody asked
for.

### Drag a chart to reorder the grid

Pick up a tile anywhere on its face and drop it on another, and it lands
**before** that chart — the same promise dragging a journal card makes, and the
same rule: **the gesture is the consent**, so it writes on drop with no
confirmation to click. The charts visibly move, which is the confirmation. A
chart cannot be dragged into another note's grid; the drop refuses rather than
moving something invisible.

**The grid stopped backfilling to make this true.** It was laid out with
`grid-auto-flow: dense`, which lets a small chart hop *upwards* past a wide one
to fill a hole — helpful when nothing owns the order, and directly opposed to an
order you just dragged. Two charts of unequal size could swap themselves back
the moment you let go. Dense packing is gone; sizes still work exactly as they
did, a wide tile just no longer has anything backfilled above it.

### A chart can be called what you want

The editor's **Title** field starts empty with the name the chart would take
anyway as its placeholder — the tracker's name, *Sleep vs Mood* for a scatter,
*Sleep and Mood* for a two-tracker line. Leaving it alone is therefore not a
blank tile, and the placeholder is never pre-filled into the box: seeding it
would write the derived name into your note as though you had chosen it, and a
later rename of the tracker could never reach that chart again.

It is stored after a `|` at the end of the chart's line. **A bar rather than
another `+flag`**, because a title is free text and the tracker field is greedy:
`+title=` would have let `chart:c1:Mood:line:30+title=mood:line:all` parse as a
tracker called `Mood:line:30+title=mood` — a different chart, silently, with
nothing on screen to say so. The bar cannot appear before the fields are read.
An untitled chart writes no bar at all, so every chart already on disk
round-trips byte for byte.

The bar is also **the spelling this plugin already had**: a journal note's
`jchart:` line has carried `|Label` since 2.35, and `journal-chart:<tracker>|Label`
longer than that. One name per idea, so a reader who has titled one kind of chart
knows how to title the other.

### Tests

`test/chart-series.test.ts` — 41 cases over the alignment, the titles, the
reorder and the drag payload, plus the byte-identity clauses. Seven single-token
mutations were confirmed to turn them red, including the one that matters most:
inner-joining the two series instead of outer-joining them.

## [4.44.1] - 2026-08-19

**Two controls in the section editor wrote their change, re-drew the list to
show it, and left Save disabled over "No changes": reordering a row inside a
group, and Start a page here.**

`regroup` does four things to a note, and the pane that reports it could see
one of them. Everything below is one silence with two victims.

### Start a page here wrote a bit nobody counted

The same seam, one question further along, and the reason it survived 4.44.1's
first pass: a `tab` line moves nothing between blocks **and nothing between
columns**, so a page break was invisible to the opener diff and to the cell-order
diff alike. The button wrote its bit, the card re-drew with `Page 1` and `Page 2`
bands and its bar said *Group — 2 pages*, and the footer said there was nothing
to save. `regroupFlatNote`'s phase four had been placing the boundary correctly
since 4.34.2; as with the reorder, nothing at the bottom was missing.

`pageBreakOps` is `cellMoveOps`' sibling and reports both directions —
*"Open tasks starts a new page of its group"*, *"Open tasks joins the page before
it"* — because **Join the page before** is the only way to unmake a page from
this window, and a change that can be made and not unmade is half a control.
Blocks are matched by members here too, and a block whose membership changed is
left to the regroup ops that already name it.

**Every phase of `regroup` is now named by the dry run**, which is the property
that was missing rather than any one of these calls.

*Unmaking a page still leaves a column*, exactly as 4.34.2 states — "a page break
is a column break that was promoted, and unmaking it returns it to what it was".
Where the reader started a page inside a *stack*, the boundary it returns to is a
column that was not there before. That is unchanged behaviour and is now
reachable for the first time, so it is stated rather than left to be found.

### The refusal was speaking for a write that was never asked

Every reorder in the section editor goes through the same list of rows, and a
grouped row is an ordinary member of it: it has arrows, it is a drag source and
it is a drop target. Dragging one re-drew the list in the new order — and the
footer read **No changes**, with Save disabled, because the plan had answered:

> Go to is in one block with Diary, Open tasks and On this day and moves with it.
> Split the block to move them apart.

That sentence is right about **leaving** a block. It was being asked about two
cells of one row trading places, which leaves nothing: no fence is created,
emptied or crossed, and every `row`, `cell`, `tab` and `frame` line stays where
it is. On the homepage four of the seven rows are in one group, so the commonest
reorder on the commonest page was the refused one — and the refusal is in the
Changes tab, which nobody opens when the button says there is nothing to save.

**And the write had been able to do it since 4.8.** `regroupFlatNote`'s *phase
three — order, inside a block* settles exactly this. Nothing was missing at the
bottom; what was missing is that no pass **named** the change, and the pass that
refused it was speaking on behalf of a write that was never going to be asked.

So the plan now says nothing about a move that stays inside its block
(`cellOrderIn` is the test: every member staying, placeable, unpinned, and
contiguous in the requested order), and the dry run names it. Three ops for one
drag was the other way to get this wrong.

### `layoutOps` asked which block, and never which column

The Changes pane is a **dry run**: it applies the write to a copy and reports
what came back, which is the only way it can promise exactly what Save does. It
was comparing each section's *opener* — which block it is in — so a reorder
inside one block came back identical and was reported as nothing.

`cellMoveOps` asks the same question one level in, through the same `moveOps`
the plan uses, so a reorder gets the wording every other move gets ("moves above
Open tasks") and is minimal in the same way: dragging one cell past three names
one move, not four. **Blocks are matched by their members, not by their opener** —
the opener is one of the rows that can move — and a block whose membership
changed is left to the regroup ops, which already name it.

### Phase three turned a stack into a column

Found by running it rather than reading it. The move used a `cell` target, which
**opens a column**: right for a section arriving from another block, wrong for
two that are already there. The homepage's aside stacks three widgets in one
cell, and reordering them came back as

```
row / diary:3 / cell / tasks-table / cell / launcher / on-this-day:always
```

— a two-column row silently becoming three. It uses `swap`, the target built for
this and documented for it: *nothing is inserted and nothing is removed, so the
row keeps exactly the columns it had and each one keeps its count.*

### The one bit a reorder could not survive

`joined` is one bit per row — *this row is with the one above it* — and the
editor argues, correctly, that a block is a run of consecutive rows so one bit
says the whole of it. It also claimed the bit "survives a reorder for free". It
does, for every row except the one that **opens** a block: that row is described
by the *absence* of a bit, and absence does not travel.

Move the homepage's Diary card below Go to and the list handed to the write said:
Go to is joined, so it joins the block above it — **the banner** — and Diary,
unjoined, opens a block of its own. One drag, two wrong blocks, on the one block
that holds the page title and that nothing may join.

`keptBlocks` restores boundaries **by position**: a block whose members are still
consecutive keeps its first row as its opener and the rest joined to it, whichever
rows those now are. A block the move genuinely broke up — a row dragged out of it,
or another dropped through it — is left exactly as the bits describe, because
that reader is regrouping and the bits are how they say so. One rule, asked by
both reorder paths, because a fix in one of them is a window where the arrows are
safe and the drag is not.

### Tests

`test/section-reorder.test.ts` — 26 cases, and they run the model: what these
controls produce is a file, and the file is what was wrong. Reverting each of the
four fixes independently was confirmed to turn them red (4, 2, 1 and 1 case). The
byte-identical clauses are asserted rather than described: every block outside
the group unchanged, one `cell` line before and after, and the note restored
exactly when the reorder is undone.

## [4.44.0] - 2026-08-19

**The homepage's Open tasks widget scoped itself to the vault root, and the
vault root is the one folder no scope test in this plugin could match.**

### `//` is a prefix nothing starts with

Every folder-scoped widget here answers "is this note in scope?" the same way:
`path.startsWith(folder + "/")`. Obsidian's root folder carries the path `/`, so
`file.parent.path` on a top-level note is `/`, so the test became
`path.startsWith("//")` — **false for every path in every vault, forever.**

The homepage's `tasks-table` is the widget whose entire scope is the root. Its
catalogue entry has said since 4.2 that bare means the whole vault; the composer
wrote the bare line; the reader saw **"No notes here yet — open tasks from notes
under `/` collect here"** on a vault holding 135 open tasks across 98 notes. The
empty state was even printing the defect, in the one place a reader would read it
as a folder name.

`core/util.ts` now owns the question. `isVaultRoot` knows the **four spellings**
the root arrives in, because four different things produce them: `""` from a path
cut at its last slash, `/` from Obsidian's own root `TFolder`, and `.` / `./`
from a reader typing "from here down". `folderPrefix` returns the prefix a scope
implies — and at the root that is `""`, which every path in the vault starts
with. `filesUnder` is one line over it, so **every folder-scoped widget in the
plugin can be pointed at the root**, not only the one that reported this.

Three more call sites asked the same question in their own words and each had the
bug independently:

- **`liveScopedWidget` watched `//`**, so a root-scoped widget refreshed for its
  own host note and nothing else. This is the silent half: had the read worked,
  the table would have painted correct rows once and then sat there while tasks
  were ticked underneath it.
- **`readOpenTasks`' cache sweep** never matched a root-scoped path, so a
  since-deleted note's entry was kept rather than dropped.
- **`readFolders`' sweep** in `diary-index.ts`, which the journal search and
  the journal index read through, for the same reason.

And one that failed by being *falsy* rather than by not matching:
`journalFolderScope` ended `return hostFolder ? [hostFolder] : []`, so a host
folder spelled `""` — a real, known folder — read as "this note is nowhere" and
the widget drew **nothing at all** rather than an empty state. It is `!= null`
now, which keeps the one case that genuinely means absent: a journal **template**,
composed once and used in every folder of its level, still resolves to nothing.

### The homepage was the only `tasks-table` in the plugin with no folder box

The diary dashboard, the journals dashboard and every journal index have declared
the folder question over this directive since 3.15. The homepage's copy did not —
so *Edit sections* drew a row with a Remove button and nothing to answer, and
"the whole vault" was a scope the reader could neither confirm nor change. It is
declared now, and needed no new machinery: `withAnswers` splices into the
directive's own span, so the answer lands on the `tasks-table` line and the diary
card, the launcher and On this day it shares a fence with come out byte-identical.

**The box says "the whole vault", not "This note's folder".** The ordinary
placeholder is *true* on this page — the homepage's own folder is the root — and
tells the reader nothing, leaving them unable to tell a vault-wide widget from
one pointed at a folder that happens to be empty. `emptyLabel` is 4.16.1's field,
already built for `level-index`'s sibling fallback, and this is the same failure
from the other side: a box describing a rule it does not follow.

### A spelling for "the whole vault", from anywhere

`""` means the **host's** folder, and `ArgSuggest` deliberately omits the root
from its folder list because `""` already spells something else there — so a
reader on a note *inside* a folder had no way to say "the vault" at all. The
`tasks-table` argument now offers **`./` — The whole vault** as a named
suggestion, drawn by its name rather than as a path. It is nothing like the `all`
keyword this argument still refuses: `all` names several journal roots and
`buildTasksTableRegion` takes `folders[0]`, so it would promise a scope the widget
truncates. `./` names one folder.

The scope cycle in the table's corner carries it like any other written scope,
under the name **Vault** rather than *Path* — and the *Below* hint on a top-level
note now reads "Tasks in every note in the vault" instead of naming the path `/`.
Both empty states do the same: **"Open tasks from every note in the vault collect
here"**, and **"No open tasks anywhere in the vault"**.

### The tests run the resolvers rather than reading them

`test/vault-root-scope.test.ts` builds a five-note vault and asserts **which
files come back** from each of the four spellings, because a test that pinned
`normalizePath(folderPath) + "/"` would have been green for three releases while
the homepage rendered nothing — it would have been pinning the defect. Sixteen
tests; reverting `folderPrefix`, the homepage's question and
`journalFolderScope`'s `!= null` each turns them red, which was checked rather
than assumed.

Two assertions are on source text, and both name behaviour no unit test in this
suite can reach: the callout built inside an async `.then`, and the predicate a
`LiveWidget` is constructed with.

`test/widget-sections.test.ts`'s `emptyLabel` tripwire — "a THIRD widget, or
either of these two drifting, still fails" — fired exactly as designed. It now
names three members with their words rather than looping over one string, and a
fourth still fails it.

## [4.43.0] - 2026-08-18

**An engine that fills a scaffolded vault with example content, so the vault a
stranger downloads shows the plugin instead of showing its empty states.**

### `npm run seed -- <vault>`

`tools/seed-vault.mjs` writes a year of diary entries and a populated journal
tree into an already-scaffolded vault. Every widget in ChronoAnvil renders somebody's
notes, and on an empty vault every one of them renders its empty state — an
honest picture of nothing and a useless picture of the plugin.

**It derives; it does not restate.** Nothing about the vault's shape is written
into the tool. Paths come from the vault's own
`.obsidian/plugins/chronoanvil/data.json`; each journal's levels, kinds and
template filenames come from that same file; note bodies come from the vault's
templates, edited in place rather than reproduced. A preset that gains a level, a
template that gains a section, or a reader who renamed `02 - Diary` are all
handled by reading rather than by editing the tool. The one thing written down is
the prose, in `tools/seed-corpus.mjs`, and that is the whole point of it.

**Deterministic, with one honest exception.** A seeded PRNG drives every choice,
so the same seed and vault give the same 323 files; nothing consults the clock
except the end of the date window, and `--today` pins that too. Left off, the
history ends today so the example looks current rather than abandoned.

**It refuses to overwrite.** A vault is somebody's notes. Every write declines a
path that already exists unless `--force` is given, and the run reports what it
skipped — so re-running it after a release is a no-op rather than a silent
double-write. `--dry-run` reports the plan and writes nothing.

The history is shaped rather than uniform: runs of consecutive days with short
breaks between them, and one deliberate two-to-three-week lapse in the middle
third, because the thing a year of activity is supposed to make visible is
precisely that you can look back and see where you fell off. A default run over
13 months writes 273 active days with a longest streak of 12.

### Four format bugs the first real seed found, and one it did not

Four different things live in `<!--chronoanvil:… -->` regions and they look alike
from a distance. **The region's name does not say which format it holds, and
nothing warns when the wrong one goes in** — the write succeeds, the file looks
plausible, and the widget renders rubbish.

- **Recall cards were written in the task format.** `- ( ) question` into
  `<!--chronoanvil:recall-->`: it parsed, it produced a card, and the card's prompt
  read `- ( ) What makes an atom a stereocentre?` with nothing behind the reveal.
  Fifty notes, zero warnings. Recall is `question :: answer`, and the corpus now
  carries answers rather than questions alone — a card with a blank reveal
  demonstrates the widget without demonstrating the feature.
- **The daily's prose was appended under the note instead of put in it.** The
  daily template declares `note:focus`, `list:highlights`, `list:challenges`,
  `note:log` and `tasks:todo`, each backed by a region. The first version wrote
  `## Title` and a line at the end of the file, so every seeded day rendered a
  column of empty prompts with a stray heading below them — which teaches a
  reader opening the example vault that ChronoAnvil's daily note does not work.
- **Not every day gets every field**, now that they are filled. A year where all
  five regions are full every single day is a year nobody lived, and it hides the
  thing an example should show: a half-filled entry is a normal entry.
- **Bulleted sections lost their bullets**, because a template's `- **Definition:** `
  lines were replaced with bare text. Fixed by marking unmarked lines — and then
  fixed again, because `**Definition:**` starts with `*` and the first marker test
  read it as a list item, so the corpus's most heavily used shape was the one that
  came out unbulleted.

### The tests run the tool rather than reading it

The other tool tests in this suite assert on source text, because what they pin
is a build contract with no return value to look at. This one is a pile of pure
string and date transforms, and the transforms are where every defect above
lived — so `test/seed-vault.test.ts` imports and runs them.

**The region tests do not check a string shape.** They feed the seeder's output
to the plugin's own `parseTaskLine`, `parseRecall` and `parseEntries` and check
what comes back out, because a test that knew the format would have agreed with
the recall bug. Twenty-four tests; ten single-token mutations of the tool were
confirmed to turn them red, and the one that stays green — a global regex on a
string already sliced to the frontmatter — is recorded in the test as genuinely
equivalent rather than quietly dropped.

## [4.42.1] - 2026-08-18

**Two corrections to 4.42, both of which its own tests had passed.**

### The add tile was placed in the last track, not across the row

4.42 wrote `grid-column: auto / -1` and described it as "auto-placed as early as
it fits, ending at the last line". It does not do that. **An item with an `auto`
start and a definite end is given a span of 1** (Grid §8.1.1), so `auto / -1`
means *one track, ending at the last line* — which is always the last track.

Measured on `20260818_21h25m06s_grim.png`: four empty journals, every one
drawing its slot in track 2 with **track 1 bare** — a gap in front of the tile
rather than behind it. Study and Projects had looked right by luck, because with
two tracks and one card the last track is also the next free one.

**CSS cannot say "from where I land to the end of the row"** — there is no value
for it, and the track count comes from `auto-fill` and the container's width, so
no rule can name it either. What is left is two honest cases: alone in the grid,
`1 / -1`; beside cards, nothing at all, because **ordinary auto-placement already
fills the next free track** and was doing so before 4.42 touched it. The case
that remains unsolved is stated in the stylesheet rather than left to be
rediscovered: a grid whose last row is exactly full puts the tile alone on a new
row in one track.

**And the test could not have caught it**, because it asserted the declaration
(`grid-column: auto / -1`) rather than what the declaration had to achieve — it
could only ever confirm the wrong value was still there. It asserts the two cases
by selector now.

### The hue spread was checked against an id no vault has

4.42 changed `hueOf` to step its sum by the golden angle and reported the four
presets moving from 33° minimum separation to 55°. Both numbers were wrong: the
test measured `"exercise"`, and **the preset's id is `exercise-diet`**. On the ids
that actually exist the un-stepped sums were **26°** apart at their closest, and
the stride 4.42 introduced put Projects at 278° and Exercise & Diet at 261° —
**17°**. The change made the shipped vault worse and its test said it was fine.

The stride is **59** now: coprime to 360 like 137, and putting the four presets at
88°, 146°, 207° and 301° — 58° minimum. **It was fitted**, by trying every coprime
stride against the four real ids and taking the best, and the source says so: a
hash cannot promise separation, so a green suite means these four are arranged
well and not that collisions are prevented. The alternative that would have
guaranteed it — fixed hues for the shipped presets — was offered and declined.

Coprimality is the part that is *not* fitted, and it is what the second test
holds: any stride sharing a factor with 360 visits only 360/gcd hues and collides
in cycles. That test now asks the property through the public function rather than
naming the constant — the stride has already changed once, and a test naming the
number would have had to change with it while proving nothing.

**The preset ids come from `JOURNAL_PRESETS` itself now**, not from a literal
beside the assertion. A fixture that restates a value the source already holds
can only ever be checked against the fixture.

## [4.42.0] - 2026-08-18

**The white card border is finally fixed, at its actual cause; journal titles
open their dashboards; and three smaller things off the same screenshot.**

### The `:root` fault, third diagnosis and the one that holds

**`--ca-border-inner` had never drawn since 4.35.2 introduced it.** Every card
reading it came back `#dadada` — `currentColor`, the initial `border-color`,
which is what an element gets when the colour it asked for is invalid. 4.40
blamed the border shorthand (real, fixed, not the cause). 4.40.1 blamed `:root`
and moved the `color-mix` to `body` — right about the placement, and the next
screenshot still measured `#dadada`.

**The rule is broader than 4.40.1 wrote it.** Obsidian declares its colours on
`body` (`.theme-dark` / `.theme-light` are classes on `body`); `:root` is the
`html` element and has none of them. And a custom property's `var()` references
are substituted **on the element that declares it** — which has nothing to do
with `color-mix`. 4.40.1 asserted that a lone `var()` was somehow lazier; it is
not. `--ca-surface-inset: var(--background-primary-alt)` on `:root` was broken by
exactly the same mechanism, and the mix on `body` was reading *it*.

**Nine tokens were affected**, and all nine are on `body` now:
`--ca-surface-card`, `--ca-surface-raised`, `--ca-surface-inset`,
`--ca-border-subtle`, `--ca-border-hover`, `--ca-border-focus`, `--ca-bar-ink`,
`--ca-sec-title-ink`, and the seam itself. **`--ca-border-inner` is a plain
`rgba` rather than a mix** — the mix was the better idea and has never once
drawn, and an adaptive value that renders as `currentColor` is not adaptive.

**A visible consequence beyond the borders.** `.jjs-group-name` asks for
`--ca-bar-ink`, so with that token invalid the subject titles fell through to
Obsidian's `.internal-link` — chem and Maths measured `#a68af9` on the
screenshot. They read as the bar's own voice now, which is what 4.13 designed
and what has never rendered.

**And a test from 4.13 already knew the rule, then exempted the one token it
caught.** It said, correctly, that *"a token whose value reads
`--interactive-accent` or its siblings MUST be declared on `body`"* — and then
argued these four read `--text-muted`, *"the theme's ordinary inherited ink"*, so
`:root` was fine. `--text-muted` is a theme variable on `body`, the same as
`--interactive-accent`. The replacement guard asks the structural question
instead — does `:root` define what this token reads — which has no room for a
judgement call about which theme variables are really theme variables.

### A journal's name is the way into it

The head named the journal and went nowhere, while every card below it has linked
to its own folder note since 4.13.3 — so the page's shallowest object was the
only one you could not enter. The title is a link now, through `folderLink`,
which stops propagation as well as preventing the default: **a card's head is a
fold target**, and a click that opened the journal and also folded it would do
two things for one press. The title navigates and the rest of the band still
folds, matching the rank below rather than inverting between them.

`folderLink` gained a display-name override, because a journal has a name in
settings — "Exercise & Diet" — over a folder that may be called something else,
and without it the title would have renamed itself the moment it became a link.
A journal whose folder note is missing stays plain text.

### The add slot fills the rest of its row

Study had two subjects in a three-track grid, so the slot took track 1 of row 2
and left two tracks bare; Exercise & Diet and Media had none, so one 260px slot
sat in a row two-thirds empty. Same fault — the slot was sized like a card when
what it marks is *the space a card goes into*. `grid-column: auto / -1` says
exactly that: auto-placed as early as it fits, ending at the last line, so it
completes a partial row and spans a whole empty one. No track count appears in
the rule, which matters because `auto-fill` decides that from the container's
width. Its height floor drops to 64px, following `.jld-grid.is-paired`'s own
reasoning that a full-row tile as tall as a card is a large empty box.

### Two smaller things

**The add tile no longer repeats itself in a tooltip.** A bubble reading "New
project" was open under a tile whose visible label reads "New project" — nothing
for a pointer user, and a name announced twice by a screen reader. The head ＋
keeps its `title`, because there the two strings differ ("Topic" / "New topic")
and that button collapses to icon-only under 460px.

**Journal hues are spread across the wheel.** `hueOf` summed code points, and a
sum spreads nothing: study landed on 359° and media on 32° — **33° apart**, so
two of the four bands were near-identical warm reds. The sum is an index now,
stepped by the golden angle, so consecutive indices land 137° apart. **137 and
not the closer 138**: 138 shares a factor of six with 360 and would visit only
sixty hues, while 137 is prime and coprime to it, so the map is a bijection and
no two ids are pushed onto one colour that were not already equal. Minimum
separation across the four presets goes from 33° to 55°. Every existing vault's
journal colours change once, which is the cost and was accepted.

## [4.41.0] - 2026-08-18

**Each journal on the Journals page is now a card that holds its own subject
cards, and its head carries the journal's colour — as its cards already did.**

**What this replaces was a rule between two bars.** A journal's name was a bare
title band on the section's ground with its subject cards loose underneath, and
the only thing binding a journal to its cards was the gap before the next title
— **the same gap that separates two cards inside one journal**. Four journals
read as four lines ruled across one surface rather than as four objects. They are
boxes now, and the line between them is gone: a list of bars needs a rule to be
read as separate sections, a list of cards is separated by the gap, and both at
once is the boundary drawn twice.

**The hue was already there and was only ever drawn by the children.**
`hueOf(type.id)` is set on the journal by `buildType` and tints every subject
card's head one level down — which is why **chem and maths wear the same red**:
the colour is the *journal's*, said once per card and never by the journal
itself. It is on the journal's own band now.

**And the cards keep theirs**, on the maintainer's call. Saying it once at the
top would be tidier, and it was declined for a reason worth recording: a subject
card read on its own — at the bottom of a scroll, or lifted into a narrow pane —
still has to say which journal it belongs to.

**Which makes the two strengths the whole decision, and the number is derived
rather than picked.** The bands mix into different grounds — `#282828` out here,
`#232323` in there — and that five-unit difference is diluted by the tint to
nothing: at 30% both ways they compute to `#4b2e2e` and `#472a2b`, four units of
red apart, which is not a hierarchy but a smudge. `hsl(359 45% 42%)` is
`rgb(155, 59, 61)`; at **40%** over `#282828` the journal's band lands on
`#563030` against the card's `#472a2b` — fifteen units, a step you can see
without it becoming a second colour. Both numbers are fixed and only the hue
varies, so every journal keeps the same parent-to-child relationship.

**A folded journal drops its head's under-edge.** The body is `display: none`
when collapsed, so that border would otherwise land one pixel inside the card's
own — the doubled boundary again, in the one state where it is guaranteed rather
than possible.

Drawn as four variants first (`dev-mockups/journals-superset-cards.html`, palette
sampled from the screenshots) so the arrangement could be judged before it cost a
release; the file now records which one was chosen and why the other three were
not.

## [4.40.1] - 2026-08-18

**The white outline on every card is gone, and 4.40's explanation for it was
wrong.**

**What the new screenshots showed.** 4.40 split the border shorthands into
longhands, which stopped the 3px rope — and the edge came back as **1px
`#dadada`** instead. Still `currentColor`, still the initial value an element
gets when the colour it asked for is invalid. The longhands were right and did
not touch the cause.

**And the `@supports` guard proved the theory wrong rather than fixing it.** If
`color-mix` had been unsupported, the guard would not have applied and the token
would have fallen back to a real grey. The guard applied and the border was still
white — so `color-mix` works fine here, and the mix was failing for another
reason. It is deleted rather than left standing as a wrong explanation with a
passing test on top of it.

**The actual cause: `--ca-border-inner` was declared on `:root`.** Obsidian's
colour variables live on **`body`** — `--background-modifier-border` comes from
`.theme-dark` / `.theme-light`, which are classes on `body`, and the `html`
element has none of them. And a `color-mix()` inside a custom property is
resolved **at the element the property is declared on**, eagerly, because a mix
must produce a colour. So this one asked `:root` for a variable `:root` has never
had, got nothing, and was invalid for every element that inherited it. It had
been doing that since 4.35.2 introduced it — every `.jjs-card`, every
`.jld-pair`, every `.jld-card`.

**A lone `var()` does not behave that way, and that asymmetry is what hid it.** A
custom property whose value is just `var(--x)` is a *pending-substitution value*:
it is substituted where it is **used**, so `--ca-surface-inset:
var(--background-primary-alt)` on the same `:root` works perfectly. Wrap the
identical reference in `color-mix()` and it resolves at the declaration instead.

The proof was in the same file the whole time: `--ca-surface-accent-subtle` is
the same construct — a `color-mix` over two theme variables — declared on `body`,
and it has always worked.

**The fix, and the guard that would have caught it.** The mix moves to `body`,
beside the token that proves the mechanism; `:root` keeps a real grey as the
floor, so anything rendering above `body` gets an edge rather than
`currentColor`. A new test refuses any `:root` declaration that **computes** with
a variable `:root` does not itself define — which passes the spacing scale, seven
`calc()`s over a unit declared four lines above them, and would have failed this
token on the day it was written.

**Three tests changed to record the reversal** rather than being quietly
repointed, and one of them tripped the same trap for the third time this session:
an absence assertion reading the comment that documents the thing it forbids.
The rule is now stated flatly beside it — strip comments before asserting a
string is absent, every time, without first checking whether this particular file
happens to mention it.

## [4.40.0] - 2026-08-18

**Journals can be put in the order you want them, and a rope that had been
around the add tile since the token was introduced is gone.**

### Reorganising journals

**Two surfaces, one write.** The homepage draws each journal as a card and the
Journals page draws it as a full-width section with its contents inside, and
4.40 gives each the affordance its shape can carry rather than the same one
twice. **Drag a card onto another** on the homepage and it takes that card's
place; on the Journals page a **Reorganise** button sits on the header bar
beside Refresh and opens a short window with ↑/↓ on each row and a Save.

Both end in `journal-order.ts`, which is the point of it: two gestures that
became two implementations would drift, in the way `journal-actions.ts` is on
record as having drifted.

**There is no order field, and that is the good news.** `registeredJournalTypes`
has always been `settings.customJournals.map(buildJournalType)` — the array *is*
the order, and every surface that lists journals already draws them in it. So
this is a permutation of a list the plugin owns: no new setting, no migration,
nothing that a folder renamed outside ChronoAnvil could fall out of. Study is not a
special case; it is the first entry.

**Nothing moves on disk, and the window says so before you touch anything.**
Reordering a list that also names folders invites "does this move my notes?",
and that answer belongs on the window rather than in a changelog.

**4.8.1's argument had to be answered rather than ignored.** That release
*removed* whole-block dragging, because a drag and a dialog doing one job meant
"every block on every page carrying a permanent invitation to the weaker one".
That is an argument about two controls on **one** surface — which is why the
button is not also on the card grid and the drag is not also on the sections. A
reader on either page is offered exactly one way to reorder journals. The drag
writes on drop with no confirmation, which is that file's other rule: the gesture
is the consent.

The window is the opposite and deliberately so — nothing is written until Save,
so four nudges are one plan and not four repaints. **Arrows rather than drag
there**, on the maintainer's call ("drag is for cards only"); the section editor
pairs both and argues each is right, so what is dropped is the half the other
surface already has, not the half a keyboard can reach.

### The dashed edge, and the fault underneath it

**Toned down, as asked.** The add tile and the empty add card now draw their
edge in `--ca-slot-edge` — a hair above the surface rather than against it. A
dashed border is already the loudest edge in the vocabulary (it is broken, so it
flickers as the eye travels it) and it does not also need contrast: it marks
*where* a card would go, and the label inside says what pressing it does. A plain
`rgba`, not a mix, with a light-theme twin — for the reason the rest of this
section is about.

**And the rope was not a styling choice; it was a fault.** Measured on the
reader's screenshot, the add card's edge came back **3px wide in `#dadada`** —
neither number written in any rule. Both are CSS *initial values*:
`border-width: medium` computes to 3px, and the initial `border-color` is
`currentColor`, which under a journals widget is `--text-normal`. Two initial
values at once is a signature, not a coincidence.

**A `var()` that does not resolve invalidates the whole shorthand.** Not just
the colour — `border-width`, `border-style` and `border-color` all revert,
because a shorthand containing an unresolvable `var()` is invalid at
computed-value time as one declaration. `.jjs-card` read
`border: 1px solid var(--ca-border-inner)`, so wherever that token failed the
card lost its border *entirely* (`border-style: none`), and the one place a
style was stated separately — `.jjs-card-add`'s `dashed` — inherited the 3px
`currentColor` rope as the only survivor of the three.

Two independent fixes, because only one of them survives being wrong about the
cause:

- **Longhands.** Every use of `--ca-border-inner` is now `border-*-width` /
  `-style` / `-color`. A colour that cannot be computed costs the colour and
  nothing else.
- **An `@supports` guard on the token.** A custom property *cannot* fall back by
  being re-declared — it accepts any token stream at parse time, so a `color-mix`
  written second always wins and fails later, at the point of use. `var(--x,
  fallback)` does not help either: the fallback is for a property that is **not
  set**, and this one is set, to something unusable. `@supports` is the only
  guard that works.

**Three tests had pinned the shorthand** and reported this fix as a regression.
They were asserting the *shape* of a rule rather than what it guarantees — the
trap 4.39.0 already recorded as *a test that pins the workaround blocks the fix*
— and now ask for a 1px solid edge in that ink on that side, however it is
spelled.

**And one absence assertion read its own documentation.** The token guard scraped
the raw stylesheet, so a comment explaining *why a fallback would not have
helped* reported itself as the offence it was warning about. Comments are
stripped before the scrape now, which is the rule `home-sections.ts` learned in
4.38.3 arriving in the stylesheet suite.

## [4.39.1] - 2026-08-18

**The add tile actually looks like a tile, three words become the right words,
and an empty section stops saying one thing three times.**

**The tile was rendering as a grey button.** 4.39.0 wrapped the dashed "＋ New
subject" slot in `.jjs-card` chrome so it would read as an empty card offering to
be filled; on the render it came back as a solid grey rectangle. Sampling the
screenshot settled it rather than guessing: the tile measured `#333333` border on
`#3c3c3c` fill — *pixel-identical to the Refresh button two rows up*. It was not
a spacing problem or a wrapper problem. The theme paints a bare `button` element
at specificity (0,1,1), `.jld-add` asked at (0,1,0), and the dashed border and
transparent ground had never landed in any build.

The fix names the three properties that carry "this is a slot, not a control" —
border, background, box-shadow — and forces them, with the hover state that a
forced background otherwise kills. `.jjs-card-add` is the dashed edge now and the
inner tile is stripped of chrome entirely, so there is one dashed rectangle
instead of two nested ones. **A second defect surfaced underneath it**: an add
card alone in its grid collapsed to a 29px pill, because `min-height: 0` on the
tile is correct when the card body has a stated height from its neighbours and
meaningless when there are no neighbours. A `:only-child` floor covers that case
without touching the populated one.

**`plural()` learned the few words the rules get wrong.** The Media preset's
empty state read *"Mediums appear here automatically."* Crude was always the deal
for this helper — it is four ending rules — but "Mediums" is not crude, it is
wrong. It now consults a short irregular list first: medium, index, appendix,
criterion. Not a dictionary, and the entry condition is written down beside it —
**a noun someone would plausibly name a folder level after, that the rules
mangle**. "Child" and "Person" are deliberately absent and tested as absent, so
the list cannot quietly grow into a general English pluraliser. The lookup
carries the caller's case rather than a stored capital, because half the call
sites lowercase for prose.

**An empty journal section is now the tile alone.** It drew three things that
said one thing: a title *"No subjects yet"*, a sentence *"Subjects appear here
automatically."*, and then a card-shaped dashed tile reading *"＋ New subject"*.
An empty card in an otherwise empty grid already says the level is empty — that
is the whole reason 4.38.4 gave the tile card chrome — so the two lines restating
it are gone.

The sentence's fact survives being unsaid, and it is worth saying why rather than
treating the deletion as pure tidying: it told the reader that a folder made in
the file explorer gets picked up here. The only reader that reaches is one who
has already made such a folder, and that reader is not looking at an empty
section. **Both lines do survive on the far side of one return**, in the branch
where the journal is registered but its root folder does not exist yet — there
the tile cannot be drawn at all, and words are the only thing on offer. The test
asserts that as an ordering rather than an absence, because both strings are
still in the function and a `not.toContain` would have asserted the opposite of
the truth.

**Declined, and recorded as declined.** A ＋ on each subject card's own head was
offered and turned down: the homepage is read-only for topics. It lists what is
in a journal; making things belongs to that journal's dashboard and to the
command palette. Pinned in both the source and the test so the obvious "fix" is
known to have been considered rather than missed.

## [4.39.0] - 2026-08-18

**Four visual asks off the 4.38.3 render, and one wording defect found on the
way.**

**The Progress rail fills its section.** Three fixed 172px month panels in a
wrapping flex row ended at x=650 in a section running to x=780 — the rail sat in
the left two-thirds of a box it was the only occupant of. It is three equal grid
tracks now, which is the journals heatmap's answer one level up: that widget asks
for `minmax(cell, 1fr)` and lets the container decide how much each track gets.
The day columns do the same, capped at 34px so a 1050px dashboard does not turn a
month into a scatter of loose squares.

What makes flexible columns safe here is worth recording, because the comment
they replaced warned against exactly this: an early version used `1fr` columns
and `aspect-ratio: 1` on the cell, which inflated each square to ~46px so one
month towered over the section. **The cell states its own size now**, so a wider
track is wider *spacing* and not a bigger square — the same arrangement
`.jjh-cell` has inside its `minmax()` tracks. The test moved from pinning the
column to pinning the cell, which is where the mechanism actually lives.

**The activity eyebrow says "Last 12 months".** It read `Last 12 months · Study ·
Projects · Exercise & Diet · Media` — a line that gets *longer* the more journals
a reader has, which is the case it is most likely to be read in. The roster was
also the half a reader did not need: the band is the whole section's, the section
is titled Journals, and every journal in the vault is in it by definition. The
period is what narrows it, and nothing else on the page says it.

**The add tile is an empty card.** It was a naked 135×90px dashed button on the
section's ground, standing where a card would go and looking nothing like one. It
wears `.jjs-card`'s chrome now with the dashed affordance inside — which is what
an empty subject card already looks like one column over.

The wrapper also fixed a height bug 4.38.1 thought it had closed. `.jjs-grid` has
been `align-items: stretch` since then and the tile *still* sat at 96px beside
160px cards, because **Obsidian gives form controls a definite height and
`align-self: stretch` is ignored on any item whose height is not `auto`** — a
`<button>` cannot stretch. A `div` can.

**The journal title bars lost their remaining ＋.** `＋ Topic` / `＋ Project` were
kept in 4.38.1 on the argument that nothing else offered a second child; the
maintainer's call is that a second control on every journal's title bar is noise
the page does not earn. Recorded beside the code and here, because it is a real
gap rather than a tidy-up with no downside: **a subject that already has topics
now has no ＋ on the homepage.** An empty one shows the tile, and the journal's
own dashboard carries a ＋ on every card head, but from the homepage a second
topic is the command palette or the dashboard. Closing it properly means a ＋ on
the subject card's own head — the level cards already work that way — which is a
separate change.

### And one the screenshots gave away

> **"No study journals yet"** sat above **"Subjects appear here automatically."**
> The two disagreed about what was absent and the title was the wrong one: the
> journal is not missing, it is right there and titled two lines up. What is
> missing is a *subject*. It reads "No subjects yet" now, and `splitGlyph` — which
> existed only to keep the emoji out of "No 🎓 study journals yet" — went with it.

## [4.38.3] - 2026-08-18

**The duplicate Journals section, at its actual source — and it was never repair.**

A reader installed on a clean vault, added the Study journal, and opened the
repair window: it offered to delete five lines from the homepage. There should
have been nothing to delete on a vault minutes old.

Adding a journal calls `rebuildJournalHome`, which calls `ensureJournalsBlock`,
which asked whether the homepage already carried a Journals section like this:

```ts
source.split("\n").some((l) => l.trim() === JOURNALS_DIRECTIVE)
```

An exact comparison against `"journals"` — and the homepage has composed
`journals:cards` since 4.37. So it saw no Journals section, and appended a
second one. Its own comment states the rule it was breaking: *"adding a second
copy above it would be worse than leaving the note alone."* **Every symptom
reported over the last two patches was downstream of this line**, including the
duplicate render and the migration offering to remove a block; the repair loop
fixed in 4.38.2 was a second instance of the same mistake, not the cause.

### The root cause: one question, four answers

*"Does this note already carry the Journals section?"* was asked in four places,
each with its own spelling, and 4.37's `journals:cards` broke three of them:

| Where | Asked | Result |
|---|---|---|
| `ensureJournalsBlock` | `l.trim() === "journals"` | appended a duplicate when a journal was created — **this release** |
| the dashboard's `locate` | `/^journals\s*$/m` | repair grew a section on every run — 4.38.2 |
| the homepage's `locate` | `/^journals\S*\s*$/m` | correct by luck; would also have matched `journals-header:study` |
| the migration | its own inline literal | correct, and the fourth copy |

Each of the last two patches corrected one caller and left the others to be found
by a reader running into them. **There is one definition now** — 
`isJournalsDirective` and `JOURNALS_DIRECTIVE_LINE` in `constants.ts` — and a test
asserts that no caller keeps a private copy of the pattern, because a second
literal is exactly how the four came to disagree.

The shared predicate matches the directive **whole**, with an optional
`:argument`, and never by prefix: `journals-header:study` is a different widget
that shares seven letters and sits on every journal dashboard.

An argument is an *arrangement* of a section, not a different section. Every
"is it here?" answers yes to both spellings now.

## [4.38.2] - 2026-08-18

**The repair loop that grew a Journals section every time it ran, and the card
list that clipped a fifth row.**

### Repair alternated between two answers and duplicated a section on each pass

With 4.38.1's fix in place repair applied — and then did this: one run offered
*"draw the Journals section as one card per journal"*, the next offered *"adds
journals"*, and the journals dashboard gained a second identical Journals
section. Run it three times, get three.

The cause is a false claim in a comment I shipped in 4.37. The migration that
rewrites a bare `journals` directive to `journals:cards` said of itself: *"it
only ever matches one page in the vault, which is why it can sit in this loop
rather than needing a walk of its own."* **The journals dashboard composes a bare
`journals` too** — it is that page's main section — and the migration walked
every shipped note, so it rewrote the dashboard's block as well. That page's
`locate` probe is `/^journals\s*$/m`, strict, so on the next repair it could no
longer find its own section, and `reconcileLayouts` did the correct thing with
the wrong input: it added one. Which the migration then rewrote in turn.

Fixed in three places, because one alone would have left the vaults that already
ran it broken:

- **The target is the caller's.** The homepage wants `journals:cards`; the
  dashboard wants `journals`. `scaffold` now picks the spelling from the path
  instead of a text function guessing at a page it cannot see.
- **Duplicates collapse.** `collapseJournalsBlocks` keeps the first journals
  fence on a page and removes the rest, with the blank line that separated them.
  The first, not the composed position — a reader who moved their section up the
  page moved it deliberately.
- **The dashboard's probe matches both spellings**, as the homepage's has since
  4.37. This is the belt to the other two's braces: with it the growth stops even
  before the migration runs. An argument is an *arrangement* of a section, not a
  different section, so a probe asking "is it here" should say yes to either.

Also fixed while there: `journals-header:study` is a different widget that shares
seven letters with `journals`, and it sits on every journal dashboard. The
directive is matched whole now, with an optional `:argument`, rather than by
prefix.

### The subject card no longer clips a fifth row

A card showed enough of row five under row four to read as a clipped letter
rather than as a scroll. The arithmetic was right and the box model was not:
**`overflow` clips at the padding box, not the content box.** Four rows are
exactly 115px and the content box was exactly 115px — but the body's 10px of
bottom padding sits *inside* the scroller, so it was a 10px window onto whatever
came next. A scroll container whose height is stated in rows cannot carry bottom
padding, because the padding is a partial row. The height counts the top padding
only now, and the breathing room moved out to the card — which is where it always
meant to be: space between the last row and the card's edge, not part of the
list.

## [4.38.1] - 2026-08-18

**A repair that reported changes and applied none, and the visual tidy-up 4.38.0
still owed.**

### Repair silently did nothing, and the cause was a dotfile

A reader ticked two groups in the repair window, pressed *Apply repair (7
items)*, and got no writes and no notice — not even an error. The migration the
window named was innocent; the group **above** it was the problem, and the chain
is worth writing down because every link was individually reasonable.

A journal's manifest is `.chronoanvil-journal.json`, and **Obsidian keeps dotfiles
out of the vault index**. `journal-manifest.ts` has said so since manifests
existed — *"the adapter while the rest of the plugin talks to the vault"* — and
`writeManifest` obeys it. The repair planner did not:

1. It asked `getFile()` whether the manifest existed. The vault always answers
   *no* for a dotfile, whatever is on disk — so **every manifest was listed as
   "create this file" on every repair, forever.** The reported window shows four
   identical `.chronoanvil-journal.json` rows on a vault that already had all four.
2. Applying then called `vault.create()` on a path that was already there, which
   throws *"File already exists"*.
3. The create loop was the one group in `applyRepair` with **no `try`**, so the
   throw escaped, took every later group with it — including the migrations the
   reader had actually ticked — and skipped the closing notice, which is the only
   thing that tells a reader the command finished.

Fixed at all three points: the planner reads hidden files through the adapter (so
a manifest that matches is no longer offered, and one that has drifted is offered
once), the write path writes them through the adapter, and a file that cannot be
written is now counted, logged and named in the notice instead of ending the run.

### One create is not two buttons

Every journal on the homepage drew `＋ Subject` on its section head **and** a
"New subject" tile at the end of its grid, about 40px apart — four journals, four
duplicated buttons. 4.38 added the tile without noticing the button it made
redundant. The tile is what survives, and on its own merits rather than because
it is newer: it sits where the thing it makes will appear, at the end of the list
of them, which is the argument `journal-tracker-add` made and 4.37 applied to the
level cards. The child button (`＋ Topic`, `＋ Project`) stays, because only an
*empty* subject card carries a tile and nothing else offers it. The top-level
button comes back where the tile cannot be drawn — a registered journal whose
folder has never been made — so no journal is left with no create path.

### Two 4.38 changes that did not actually land

Both were caught by measuring the render, and both had passing tests.

> **The subject grid's row was still ragged.** `.jjc-grid` was corrected to
> `align-items: stretch` in 4.38 and `.jjs-grid` was missed, so a row showed a
> 163px card, a 163px card and a 90px tile — the tile falling back to its
> `min-height` and reading as a small button rather than as an empty slot. The
> tile's own `align-self: stretch` did not carry it, so the container states it
> now. `.jld-grid` deliberately keeps `start`: its tile spans the full row and
> sits alone on it.

> **The tile's ＋ never became 20px.** 4.38 added `.jld-add-icon { --jld-add-glyph:
> 20px; … }` and the glyph did not change, because `.jld-add .svg-icon` was
> already sizing the SVG to a flat 15px — two classes against one class and one
> element, so the older rule outranked the newer one. The 4.38 test asked whether
> the new rule said 20px; it did not ask whether anything outranked it. Both rules
> read the same custom property now.

## [4.38.0] - 2026-08-17

**Sixteen visual-fidelity findings off the 4.37.0 render, closed in four
batches.** The whole release is measured rather than reasoned: the palette, the
band heights and the two overflow bugs were all read out of the PNGs in
`dev-screenshots/`, and two of the sixteen findings turned out to be *wrong* when
checked that way — see the corrections at the end, which are the most useful part
of this entry.

**A pair of cards has one head, not one per pane.** The left head was a
container's name and a link; the right was a level noun that goes nowhere. Same
size, same weight, same band, one of them clickable, and nothing about them said
which. The pair now carries a single head — the container's name, its glyph, and
the ＋ that adds to it — and what each pane holds is said inside the pane as a
caps caption, "SUBJECT" over the numbers and "TOPICS" over the list. That is a
change of *type*, not just of position: a caption names a region and cannot be
mistaken for a destination. Both panes take one, which is also what gives the two
halves a shared first line — the mismatched vertical rhythms were a separate
finding and this closes it.

**A card head states its own height.** Measured: 37px on the left pane and 42px
on the right, so a hue band whose whole argument is that it reads as one strip had
a 5px step in it. The cause was the ＋ — a 13.6px icon with 6px of vertical
padding is taller than the title's 24.84px line box, and a flex item taller than
its siblings grows the container, so a control was deciding how tall a head was.
The band now takes a floor derived from the title's own line box, the button is
constrained not to exceed it, and on a phone the band takes the 40px tap floor
instead — on every head, which is the part that matters. The step inside a pair is
now impossible, but the floor stays: a grid row can hold a pair beside a single
card, and only one of those heads has a ＋.

**Every card in a row ends on one line.** `.jjc-grid` was `align-items: start`, so
Study's card was 15px taller than Media's beside it — Study declares a rating, its
fourth cell's label wrapped, and the card ended where its content did. One
label's length was deciding a row's alignment. And the label was the wrong length
for what it says: the rating cell now reads the tracker's bare noun, because the
three cells beside it are "notes", "last" and "open" and none of them explains how
it was computed either.

**The journal hue reaches all three card families.** The journals-section subject
cards still had a `#282828` head — the same value as the section card around
them, the exact defect 4.37.0 fixed one family over. They take the same mix into
the same base, set once per journal so a card cannot disagree with its siblings.

**Both empty states became the control they were describing.** *"add one from this
journal's row above"* and *"Create one from the buttons on the row above"* both
named a row that 4.36–4.37 deleted, and one of them had already gone stale once
before. The empty body is a dashed add tile now — the same one the level grid ends
with — so there is no sentence about chrome left to rot. What survives as prose is
the half that was never about chrome: new containers appear on their own.

**Both card grids end in the slot for the next card**, and neither had its tracks
narrowed. The obvious reading of "half the section is bare" is that the columns
are too wide, and it is wrong: `auto-fill` had already made more tracks than there
were cards, so a smaller minimum would have made *more* empty tracks. The gap is a
count, and the honest thing at the end of a list is what adds to it. The journal
grid's tile is not the shared one — a journal is a declared type, not a folder, so
its tile opens Settings, where journals are actually made.

**A journal's create controls sit on its title line.** They were a full-width
second row with a hairline over it, on a band whose right half was empty — ~34px
per journal, and the same arrangement the level cards left behind in 4.37. Scoped
to this section rather than fixed in the level-1 rule every section reads.

**A card carried three controls for two actions.** The homepage journal card had a
⋯ menu on its banner *and* a footer row holding *Open* and ＋ — where *Open* is
what the title link does and ＋ is the menu's own second entry. The row is gone,
which is 4.36.3's deletion applied to the other card family; it survived this long
only because the two are built by two widgets.

**Both ＋ glyphs state their size.** The head's was 12.24px and nothing said so —
`--ca-text-sm` at 0.85em, then 0.9em of that — which is why it was the smallest
mark on the card while being the tallest thing in its band. It is 15px now, the
title's cap height beside it; the tile's is 20px, because on an empty surface the
＋ *is* the content. Two named values, so nobody later "fixes" them into
agreement.

**The activity legend no longer rides the year.** The strip scrolls to its recent
end on load, which is right and stays — a year read from the wrong end is worse
than a year that scrolls. But the legend was built *inside* the scroller four
lines after that scroll, so the key to the colours was dragged off to the left and
"Less" rendered as "ss" on exactly the panes narrow enough to need it. A legend is
not part of the year.

### Two findings that were wrong, and how

Both were mine, both were stated confidently in a list of sixteen, and both
dissolved on contact with the actual pixels and the actual source. They are
recorded because the *method* that caught them is the transferable part.

> **"The activity strip overflows its section and clips its cell labels."** The
> stat band fits and clips nothing. What clips is the legend, for the unrelated
> reason above. The fix that had been agreed for the stated problem — collapse a
> tier earlier — would have reversed two documented decisions (3.12 §14.5 and
> 4.13.3) on the strength of a misreading.

> **"Narrowing the grid tracks will fix the empty space."** It would have made it
> worse: both grids already create more tracks than they have cards, so a smaller
> minimum adds empty tracks. Checked by arithmetic on the measured section widths
> before implementing, not after.

> A third correction is smaller but the same shape: `.jjs-group-name` was recorded
> as already using `--text-accent`, which is why the card title was moved to it
> "for consistency". It does not — it is `--ca-bar-ink`, and `.jjs-row-link` is
> `--text-normal`. The move stands on Obsidian's own link colour and on
> `.jsh-crumbs a.jn-pill`, the plugin's other link to a container's folder note.
> The wrong justification was in a code comment and a test; both now say what is
> actually true, and record that three link treatments across two card families is
> still open.

## [4.37.0] - 2026-08-17

**The journal cards get their colour, their create control moves into the head,
and the homepage stops enumerating every journal's contents.** Four decisions,
all four chosen from mockups rather than from a build — `dev-mockups/journal-
dashboard-cards.html` drew six card heads and `dev-mockups/homepage-journal-
cards.html` drew four homepage cards, and both are kept as the record of what the
others were and what each traded.

**A card head wears its journal's own hue.** It was `--background-secondary` on a
`--background-primary-alt` body, which measured, in a real vault, as `#282828` on
`#232323` — a 5/255 step, *and the same colour as the section card around it*. A
head the colour of the thing surrounding it does not read as a lid; it reads as
the section showing through a hole. It now takes 30% of `hueOf(journal.id)` mixed
into the card's ground: the plugin's only per-journal identity colour, the same
material the homepage card's banner already wears, so a reader arriving from that
card meets the same colour. Mixed into a theme surface rather than stated as a
literal, so one definition serves both themes with no override.

**"New topic" moved from a row in the table to a ＋ in the card head.** The
dashed row at the end of a contents card spent one of the four rows a card gets —
a card holding two topics showed two topics and a control — on a body whose every
other row is a topic. `sectionFrame` has always returned a slot for a section's
own controls, and at level 2 it sits inline on the title line; both cards had been
discarding that return value, which is the whole reason the control had nowhere to
go. The ＋ **draws its label and hides it**, opening on hover of the card, so the
button costs a glyph's width at rest and still answers *add what?* — with
`aria-label` and `title` carrying the same word for keyboards, screen readers and
touch, where the label is simply shown.

**The add tile is the size of the slot it opens.** It always took one track, so on
a grid drawing pairs it wrapped alone onto the next row and left half a row of
nothing. It now spans a pair's footprint where the cards are pairs and one track
where they are singles — decided from `hasLevelBelow`, the same predicate the
pairing itself uses, so the tile cannot disagree with the cards beside it.

**The homepage draws one card per journal, with its numbers.** `journals` drew
every journal, every top-level container and every child of each — three levels on
the homepage. **4.1 §2.2 refused a per-journal dashboard on exactly those
grounds**, and 4.36 built the dashboard, so the argument now runs the other way:
enumerating a journal's contents on the homepage is the duplication that release
existed to remove. The homepage composes `journals:cards`, whose card is a name
that opens that journal's dashboard over four figures about it — notes, last
worked, open tasks, and either an average rating or a count of what is inside.
`journals` is untouched and is still what the journals dashboard composes.

None of those figures is new arithmetic: each comes from the function the
dashboard's own cards already read, scoped to the journal's root, so a card and
the page it opens cannot disagree. The card also became a query container, so its
strip collapses against the card rather than the pane — 4.36.3's fix applied to
the family that had the same defect.

### Migrated

**An existing homepage is upgraded, and it is opt-in.** Repair is additive and the
journals section is already on the page, so reconciliation correctly does nothing
— and the section's locator was widened to match both spellings precisely so
repair would not add a *second* journals block beside yours. Correct, and it would
have left every existing homepage on the old arrangement forever. So this is a
one-off migration beside the Trends pair and the banner weld: one word on one
line, ticked separately in **Set up / repair vault**, and it touches only a bare
`journals` inside a `chronoanvil` fence — never your prose, and never an argument you
chose yourself.

### Internal

`hueOf` moved from `journals-cards.ts` to `journal.ts`. Two surfaces read it now
and the first cannot be imported by the second — it imports `tables.ts` for the
strip's numbers, so the edge would close a cycle in one hop. Same wall 4.36 hit
sharing `childRow`, same answer: the shared thing moves to the module both already
depend on. `ratingDefOf` and `ratingWord` are exported for the same reason.

`countLabel` is deleted with its last caller. It survived 4.13.2 on the one
distinction that mattered — a card saying "4 subjects" about a list it does not
show is a reading, not a tally of visible rows — and that reading is still drawn,
as the strip's fourth cell. A stat cell splits the number from the noun, so there
is nothing left for a function returning the formatted phrase to fill.

**A test that could not fail, and the correction above it.** See the 4.36.3 entry:
the assertion holding "the rule under the head is gone" asked whether one rule
mentioned a property rather than whether a border landed. It now pins which rule
is in charge. One new assertion in this release survived its own mutation check
first time round — hiding the ＋'s label with `display: none` satisfied a
`max-width` assertion while removing the label from layout entirely — and pins the
laid-out box instead.

## [4.36.3] - 2026-08-17

**The dashboard's cards get their cleanup, and the create controls move into the
surfaces they create into.**

**A pair is now one box, not two.** 4.36.1 drew a container and its contents as
two separately bordered cards with the grid's gap between them — two unrelated
objects that happen to be adjacent, on a section whose whole claim is that they
belong together. The border, the radius and the clipping belong to the **pair**;
the cards inside give theirs up and a single divider separates them. Under 560px
the pair stacks and the divider turns with it, because a vertical rule between
two stacked boxes is a line down the side of the lower one.

**Fewer edges.** The section card's border, the card's border, a rule under the
card's head and the stat strip's own hairlines were four lines of the same ink
within about 20px of each other. The strip stops drawing hairlines inside a card,
dividing its cells with a gap instead, and its reserved sub-line — which no card
uses — no longer holds space under every number.

> **Correction, added in 4.37.** This entry originally said *"the rule under the
> head is gone"*. **It was not.** The `border-bottom` declaration was removed from
> `.jld-card > .journal-sec`, and `.journal-sec`'s base rule went on painting one
> on every card head in the plugin; nothing cancelled it. So this release removed
> three of the four lines it described, not four. The line is still there in 4.37
> and now stays deliberately, under a coloured head where it marks where the
> colour stops. The test that was supposed to hold this asked whether one rule
> *mentioned* the property rather than whether a border landed, and passed
> throughout — it is rewritten in 4.37.

**Create where you are looking.** Every card carried an action row — an *Open*
button beside a bare **＋** opening a menu — and both halves answered questions
the card had already answered: the card's **name is the link that opens it**, and
a ＋ on a card is ambiguous about what it adds, which is the only reason it had
to be a menu. The row is gone. In its place, **each surface that lists things
ends with a dashed control that adds one of them**: a card-shaped tile closes the
grid, and a row closes each contents card, in the same empty-slot vocabulary the
tracker bar's *Add tracker* already uses. A brand-new journal's empty state now
points at the tile under it instead of sending you to the Journals section.

### Fixed

**The stat strip was collapsing against the wrong thing.** It drops from four
cells to two below 480px, measured against the nearest query container — which
was the whole section, and never that narrow on a desktop. A card is around
330px inside it, so four cells sat at roughly 80px each and `AVG CONFIDENCE`
rendered as *"AVG CONFIDEN / CE"* with its value pushed onto a third line. The
card is a query container now, so the existing rule measures the box the cells
actually have to fit in. This is 4.3.1's lesson one level down: `@media` was
wrong because it measured the window rather than the pane, and the block was
wrong here because it measures the pane rather than the card.

### Internal

`enclosingQuery` in the widget's suite took the nearest `@container` *before* a
selector without checking that its block was still open, and read a commented-out
query in `05-inline-widgets.css` as structure. It counts braces over
comment-stripped CSS now. The suite's source scrapes were bounded by the name of
the *next* function, which silently became "the rest of the file" the moment that
function was deleted — they find the end structurally instead, and one assertion
counts occurrences rather than testing for presence, because the grid has two
exits and both have to close with the tile.

## [4.36.2] - 2026-08-16

**A journal note's trail names its journal.** It reads
`Journals › Study › Maths › Algebra` where it used to read
`Journals › Maths › Algebra` — the journal was skipped because the trail is
derived from the path *below* the journal's root and there was nothing at that
root to link to. That was a missing file rather than a decision, and the rule the
trail states about itself has always included it: *a trail names a note's
ancestors, never the note itself*, and a journal is an ancestor of every note in
it.

A crumb whose page does not exist yet is **withheld rather than drawn dead**, so
a vault gains the crumb when **Set up / repair vault** writes the page. And both
dashboards drop their own crumb when they are the page you are on, which is the
same rule one level up.

**The documentation catches up** with the pages, the widget and the argument:
`docs/reference.md`'s composed-pages table (whose opening count was already wrong
— it said six notes over a table of eight pages), its `level-cards` and
`journals-header` rows, and the Folder notes section of the in-vault README.

### Internal

`journalCrumbPath` is a pure sibling of `rootCrumbPath` rather than a widening of
`journalAncestors`, which answers a different question — which CONTAINER folders
a note is inside, read by the folder rollups, the banner's date line and the
level index. A journal is not a container, and widening it would have changed
four readers to give one a crumb.

## [4.36.1] - 2026-08-16

**A journal's dashboard draws its contents as cards.** Each folder in the
journal gets a card carrying its numbers — notes, when it was last worked, open
tasks, and the average rating where the journal rates anything — over **Open**
and a **＋**. Where the journal has a second level, that card is joined by one
beside it listing what is inside, so a two-level journal reads as pairs and a
flat one as singles.

**The ＋ is a menu rather than a named button**, and that is what makes one card
work for both shapes: it offers *New topic* on a journal that has a level below,
and one item per note type on a journal that does not. A named button would have
had to become one button per note type on a flat journal — which is exactly what
4.13.4 deleted from the journals card, for putting the same control on every
card in the grid.

**`level-cards:<journal>[/<folder>]`** is the widget, and it can go on any page.
It takes `level-index`'s two arguments verbatim and resolves them through the
same function, so the two are one question in two arrangements and an unknown
journal gets the same sentence from either. At the deepest level it declines and
names `level-index`, because a card is a container and what is below a deepest
folder is notes.

**Whether a container is paired is a question about the journal's shape, not
about what is in the folder today.** A subject with no topics yet draws its pair
with an empty list rather than being mistaken for a deepest level — the same
correction 4.16 made to `level-index`, inherited by using the same predicate
rather than by remembering.

**A dashboard written by 4.36.0 keeps its table.** The Contents section
recognises both spellings and repair is additive, so nothing is rewritten under
a reader who preferred the table — or who has a journal with forty subjects, on
which a table is the better page. Swapping is a one-word edit.

### Internal

**The card row has one implementation.** `topicRow` and `folderLink` move from
`journals-section.ts` to `tables.ts` as `childRow` and `folderLink`, because two
widgets draw that line now and `journals-section.ts` already imports from
`tables.ts` — the only home the two can share without a cycle. What is shared is
the row and the numbers, not the card: 4.13.4 decided a flat card is its head and
4.13.3 traded a subject's fold for its card, and neither is reopened here.

**The pairing test pins the call site, and says why.** The assertions that
`hasLevelBelow` answers correctly went on passing when the builder was mutated to
read the folder's current contents instead — the exact misreading 4.16 was
written to correct. With no DOM in the suite, the honest instrument is the call
site, labelled as the mechanism assertion it is.

## [4.36.0] - 2026-08-16

**Every journal now has a page about it.** Clicking a journal's folder — Study,
Media, whatever you have made — opens a dashboard composed for it: the journal's
name, a twelve-month activity band scoped to that journal alone, everything
inside it, and its open tasks. A **Review** queue, a **Totals** band, a **Tally**,
a **Tags** cloud and a **charts** region are offered in *Edit this note's
sections…* rather than written for you, because each of them draws nothing on a
journal that has not got the thing it counts.

**Three controls that never did anything now work.** `journals:cards` and
`journal-card:<journal>` have given each journal a title link, an *Open ✕* menu
item and an *Open ✕* button since 4.2, and all three open the journal's folder
note — which nothing in the plugin had ever created. The same note is where a
`banner:` property is read from, so a journal card can finally wear an image.

**The activity band can be pointed at one journal.** `journals-header:study`
covers Study; bare — which is what every note carrying it today has — still
covers every enabled journal, and `journals-header:all` is that said out loud.
An id this vault does not have draws the list of the ones it does, rather than
an empty band that looks like the widget not being there.

Run **Set up / repair vault** to get the pages. They are written only where they
are missing; a journal you make afterwards gets one as it is created, and a
journal adopted from a folder gets one when its manifest is read.

### Internal

**`shippedNotes` takes the registered journals, and takes them as a required
argument.** Four walks read that list — the one that creates missing pages, the
one that converges existing ones, and the migration's dry run and write — and a
defaulted parameter would have compiled at all four while silently omitting the
new pages from two. The compiler enumerates the callers instead.

**The journal dashboard is a third row in the flat-dashboard test table**, not a
fourth copy of it: locating what it composes, planning no foreign runs, pinning
its banner and restoring a file exactly on remove-then-re-add are properties of a
flat note, and a page that met them only by having been written on the same day
as the assertions is the drift that table exists to catch.

## [4.35.3] - 2026-08-16

**A button holding an open menu looks pressed.** "Presets" and the Events
menu wore the accent on `:hover` and nothing else — so the moment the pointer
left the button to travel into the menu it had just opened, nothing said which
control that menu belonged to. They hold the same treatment while the menu is
up, cleared on the menu's own `onHide` so a pick, an Escape and a click
elsewhere all end it. They report `aria-expanded` too, which was absent in both
directions before.

**Deliberately unchanged:** the empty-journal activity band still draws its
zeros and its empty year, because the grid staying in one place is what stops
the page moving when the first note lands. The "+ Add tracker" tile still takes
a full grid cell, for the rhythm reason its own comment gives. And the tracker
card's "Tracking:" keeps its colon — the grid below it is what the colon
introduces.

### Internal

**A CSS assertion can no longer pass by finding nothing.** Thirty-odd tests
reach for a rule as `slice(indexOf(sel), indexOf("}", …))`, which fails two ways
that both end in a green suite: an unanchored match reads a DIFFERENT rule when
one selector ends with another (`.ca-section-title` inside
`.ca-head-fold .ca-section-title`), and a renamed selector returns an
empty string on which every negative assertion succeeds while asserting
nothing. `cssRule` walks the stylesheet by brace depth, compares whole
selectors, reaches inside `@container` blocks, and **throws** when there is no
match. It has its own test file, because everything downstream of a test helper
inherits its bugs as passes.

## [4.35.2] - 2026-08-16

**A journal card no longer draws its section's edge a second time.** The card
sits inside the section card, and both used the same border ink — so one
boundary was stated twice, twelve pixels apart. It takes a new
`--ca-border-inner` now: the same colour mixed toward the surface the card sits
on, so the outer edge reads as the boundary and the inner one as a seam. The
grounds already differed, which is what the stylesheet's own note says makes a
card inside a card deliberate; what changed is that the two edges are no longer
the same weight.

**The two columns on a card row say what they are.** A row reads
"ChronoAnvil — —" on a journal you have just made: the columns explain themselves
once there is data ("3d ago", "2 ◻") and say nothing at all before then. Both
carry a name now, so hovering explains them and a screen reader reads them —
it heard "dash dash" in either state before, since neither cell had ever
carried a label. No header row, because the card body's height is stated in
rows and a header would cost one of the four notes a card can show.

**Deliberately unchanged:** the card body stays four rows tall whatever is in
it. A card holding one note is mostly empty, and that is the stated price of a
grid whose cards are all one height — 4.13.4 chose it, and the vault check that
would test it (one, four and nine notes side by side) has still never been
walked. It should be, before that decision is revisited.

## [4.35.1] - 2026-08-16

**A journal that is not Study stopped being told to add lessons.** The activity
band's empty state read *"activity appears here as you add lessons and
entries"* on every journal, so a Projects journal — whose notes are Updates and
Decisions — was given Study's vocabulary. It names the journal's own note types
now, up to three of them, and falls back to the plain word past that. This is
the same leak 2.27 and 3.19.1 closed everywhere else; it is the copy those
sweeps did not reach, and nothing found it until there was a journal that is
not Study to render.

**The Settings section count is a themed chip.** It was drawing three
hard-coded colours — a light chip on a dark theme, legible by luck. 4.27
converted exactly these literals on the pills beside it and recorded that it
had; this rule sat in the same file and was missed. **A test now sweeps every
stylesheet for a colour written outside the theme**, so the claim holds going
forward rather than on the day it was made.

**Two buttons on a section header sit together.** "Presets" was laid out
equidistant from the section title and from "Add journal" — a header built for
one button, given a second in 3.20.1 and never revisited — so the first action
floated into the middle of the row. Presets now sits directly left of "Add
journal", which is also what the code always claimed it did.

**And a preset names itself once.** Every row in the Presets menu carried the
same sparkles icon beside the emoji that actually identifies it, so one of the
two glyphs was the same on all four rows.

## [4.35.0] - 2026-08-16

**Three more journals to start from.** *Settings → Journals → Presets* has
offered exactly one entry since Study stopped being built in, so the machinery
underneath it — recipe, wizard, scaffold, manifest — had never had a second
instance to prove it generalises. It has three now, and each is a different
shape rather than three journals that differ only in their nouns.

**🚀 Projects** — Area → Project, with dated Updates and the Decisions you go
back to. It scores nothing, deliberately: the only thing a project tracks is
Status, and a second vocabulary for it is the split Status was unified to end.
It is the preset that proves a journal need not be graded.

**🏋️ Exercise & Diet** — one folder per training block, so a day's food and its
training are read together rather than split across two journals. Ships
Intensity, Duration, Distance, Calories and Protein.

**🍿 Media** — one shelf per medium: books, film, TV, games, sport. One note
type and one Stars rating across all of them, because a book, a film, a season
and a match are all *a thing I got through and rated*; what differs per shelf
is the quantities, and the Books shelf bands *Pages read* where Film bands
*Minutes* out of the same directive.

**A preset can bring its own measurements now.** It could not before: a note
type's rating is an id into the tracker registry and nothing more, so a preset
naming one the vault does not define rendered *"Unknown tracker"* on every
note — Study was safe only because Confidence and Accuracy are built-ins. A
preset's trackers are seeded when you save, they **never overwrite an id your
vault already defines** (if you have your own Distance, yours is kept), and
they are written into the journal's own manifest, so they survive a settings
wipe and come back with the folder. Adoption has applied exactly that rule
since 3.18; both paths share one function now rather than holding it twice.

**Two widgets, because two of the three would be hollow without them.**
`journal-totals` bands what the notes below add up to — one cell per quantity,
with no argument, because it reads the registry for whatever declares *chart by
month: total*. That control existed on journal trackers and did nothing at all
until now. `journal-tally` counts how many of the things below sit at each
value of a dropdown — the question a chart cannot ask, since charts refuse
`select` by design, so nothing in the plugin could count *how many finished*.
An Area tallies its Projects; a Project tallies its Updates.

**And the wizard stopped throwing away the arrangement a preset ships.** The
section rail seeded itself from the catalogue's defaults **without the
preset's layout**, and the Create step then wrote that back over it — so
installing Study through the Presets button produced a Topic Index in
catalogue order rather than in Study's own, at the one moment that arrangement
is used. Both functions involved had accepted a layout all along; the wizard
had never passed one. Nothing else in this release would have survived the
trip in.

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
```chronoanvil
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
and the column count in the foot. Every dashboard ChronoAnvil ships is one of those
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
all.** A journal note's charts live in a block ChronoAnvil treats as opaque, so the
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
- **Recessed Tracker Cells**: Tracker widgets (`.journal-tracker-cell`) now use the semantic recessed inset surface (`--ca-surface-inset`), giving the logging grid crisp visual containment that no longer punches through to the note page ground.
- **Accent-Washed Captured Cards**: The captured log cards (`.journal-capture-card`) now sport a subtle accent background wash, crisp border, accent left spine, and refined elevation.
- **Global Surface Token Harmony**: Standardized `--ca-surface-card` and `--ca-surface-inset` tokens across Settings tables, notes, icon tokens, and groups for consistent depth across light and dark themes.

## [4.31.0] - 2026-08-15

**Now the whole lot at once.** 4.30 gave you one page on the clipboard. There is
now **Maintenance: export as plain markdown**, which writes every diary entry and
every journal note into one folder — `ChronoAnvil Export` by default, and you can
move it in Settings → Paths — as ordinary markdown anybody can read.

**You see the full list before a single file is written.** The same window a
vault repair uses: every file it would create, every one it would refresh, and
the line-by-line difference for anything already there. Say no and nothing
happens. Files that already match are not listed at all, so running it a second
time on an unchanged vault tells you so and stops.

**Your properties come with the note, written into the page.** This is the one
place the export differs from the clipboard copy, and it matters: a copy that
kept its properties as properties would still say `journal: Daily Notes`, and
ChronoAnvil would read it as a second Tuesday — in your calendar, your rollups and
every chart. So the properties become a short block at the top of the page
instead. Nothing is lost, everything is visible, and no copy can be mistaken for
the entry it came from.

**It only ever writes inside the export folder.** Nothing else in your vault is
touched, read back, or changed by any of it — the copies are copies, and ChronoAnvil
never reads them again.

**Entries and journal notes only.** Dashboards, the homepage and Search are
views built out of those pages rather than pages you write on, so exporting them
would just fill a folder with empty scaffolding.

Two things it deliberately does not do: it does not delete an exported copy when
you delete the note it came from, and it does not copy your images and
attachments — an exported note's `![[picture.png]]` still points into the vault.

## [4.30.0] - 2026-08-15

**Your writing can leave.** ChronoAnvil keeps what you type in two places a reader
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
copy uses **your** name for it, not the one ChronoAnvil shipped.

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
grain you tick *Captured* for in **Settings → ChronoAnvil → Diary entries**, plus
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
is the heading ChronoAnvil uses to *find* your chart section, not only to show it,
and renaming it would have quietly unhooked two old repairs from the notes that
still need them. ChronoAnvil now remembers every spelling a heading has shipped
under, so the words could change without anything losing track of the section.

**Nothing on your pages changes until you say so.** Existing dashboards keep
reading "Trends and Statistics" and keep working exactly as they do — the charts
draw, the toolbar appears, the section folds. To take the new spelling, run
**ChronoAnvil: Maintenance: set up / repair vault** and tick *migrations*; you get
the usual line-by-line preview first, and declining costs you nothing but a
capital S.

**A Trends bar you renamed yourself is left alone.** If your chart section is
called "My numbers", it stays "My numbers". ChronoAnvil only rewrites headings it
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
behind you. To take the new wording, run **ChronoAnvil: Maintenance: set up / repair
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
- **Surface Elevation**: Defined a structured 3-tier surface depth system (`--ca-surface-card`, `--ca-surface-raised`, `--ca-surface-inset`) with subtle top-edge highlights (`--ca-edge-highlight`) across all callouts, cards, and section blocks.
- **Card Frames & Boundaries**: Standardized 1px borders with smooth 10px radius (`--ca-radius-md`) and seamless hover transitions.
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
on it. ChronoAnvil has hidden Obsidian's copy on its dashboards since 4.5.1; the rule
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
entry was the one ChronoAnvil page whose banner did not show its own file name, and
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
  second is reported as a block ChronoAnvil does not manage.

## [4.18.2] - 2026-08-13

**Renaming something now updates it everywhere it is on screen, not just in the
tab you are reading.** ChronoAnvil blocks can be drawn outside an ordinary note tab —
by a dashboard or homepage plugin that embeds your notes, or anywhere else a note
is rendered inside another view. Until now those copies kept whatever words they
were drawn with: rename a note type from *Lessons* to *Seminars* and the heading
in your note updated while the same section, embedded in a dashboard beside it,
still said *Lessons* until something happened to redraw it.

**This includes the buttons.** The per-topic buttons ChronoAnvil writes into table
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
- **Inline `chronoanvil:` widgets repaint too**, including the table-cell buttons
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
  six journals a vault has. It is the first widget ChronoAnvil lets you repeat: add
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
  the box is. Only the sections editor changes; every other list in ChronoAnvil is
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
  works — and the three places ChronoAnvil draws one now agree, where two of them used
  to disagree on the same screen.

- **A section's emoji sits in a fixed slot on every page.** On the homepage the
  emoji was part of the title text, so five titles started their words at five
  different positions. They line up now.

- **One appearance for "there's nothing here yet".** A single page could show four:
  a bordered box with a coloured heading, a bare line with a small tick, another
  bordered box, and a third with centred grey text. Inside a section, none of them
  draws its own border any more — the section is already a card, and a box inside a
  box was the plugin saying the same thing twice. Outside one, the box stays.

  **And the heading is ChronoAnvil's colour now.** It had never set one, so it took
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

Every widget ChronoAnvil can draw is now something you can add from the section
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
  a second copy of a widget by hand, ChronoAnvil manages the first and leaves yours
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
  first's. ChronoAnvil now manages the first block holding a given widget and leaves
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
- **Wide page, on every dashboard's cog.** ChronoAnvil's pages are 1100px wide when
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

Every ChronoAnvil dashboard now opens with its own name, the places it can go, and
the control that edits it. Your existing pages are updated in place the next time
repair runs; nothing you wrote is touched.

### Added
- **A page head on every dashboard.** Search, the diary and journals folder
  notes, and the weekly, monthly, quarterly and yearly overviews each open with
  a card carrying the page's name, a row of destinations — **Home**, **Diary**,
  **Journals** — and the cog that opens **Edit sections…**.

  **The cog is the point.** It has existed since 4.5 and was drawn on the
  homepage only, so on every other ChronoAnvil page the section editor was reachable
  only through the command palette. It now sits where the page is.

  The head is drawn as the page rather than as another card: the name is set in
  a book face on a faintly hatched ground, which is the one place in ChronoAnvil
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
  **Settings → ChronoAnvil → Paths**.

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
- **A head on every block ChronoAnvil can name.** A slim bar across the top of the
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
  as, including anything of your own sitting between two ChronoAnvil blocks.

  **A whole block moves, with everything in it.** A row goes with its columns and
  each column with its widgets. That is the rule the section editor already
  states — a section sharing a block with another cannot be taken out of it — so
  a drag adds a way to arrange a page and no new rules about what may be
  arranged.

  **To undo a move, drag it back.** Two blocks trading places is undone by
  trading them again, which is why nothing pops up to offer it.

  **Reading mode only, which is how ChronoAnvil's pages now open.** In editing mode
  you are looking at the text itself, where the blocks can be moved by cutting
  and pasting them.

  **No grip where the move cannot be made.** A block rendered inside another note
  — an embed, an export, a preview — cannot be located in the file it came from,
  so it gets no grip rather than one that fails.
- **The section editor is unchanged and is still the complete interface.**
  Dragging is the quick way to reorder. Adding a section, removing one and
  changing what one does are still its job, and it can still reorder too.

## [4.6.0] - 2026-08-08

ChronoAnvil's own pages open in reading mode. Nothing in your vault is rewritten and
there is nothing to run — this applies to the notes you already have, not only to
new ones.

### Changed
- **A ChronoAnvil page opens in reading mode rather than editing mode.** The
  homepage, Search, the diary and journals dashboards, the four period
  dashboards, every journal note and every diary entry. These are pages of
  widgets: in editing mode they also show the Properties block, and clicking
  near a block puts a cursor in the raw directive behind it. Nothing is lost by
  reading them — the section editor, the cog on the title card, click-to-rename,
  and every button, tracker and field work exactly the same in reading view.

  **Ctrl+E still wins.** Switching an open note to editing mode is never undone;
  ChronoAnvil only acts when a note is *opened*. Switching tabs away and back counts
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
  whose sections ChronoAnvil has nothing to say about, you get the name and no cog
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
- **Your existing homepage keeps the layout you have.** ChronoAnvil writes that note
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
  ```chronoanvil
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
- **Your existing homepage keeps the layout you have.** ChronoAnvil writes that note
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
- **Your existing homepage keeps the layout you have.** ChronoAnvil writes that note
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
- **`row` — widgets side by side.** A line you can put in any `chronoanvil` block
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
  property, and ChronoAnvil gives that class a width wider than Obsidian's
  *readable line length* — and a limit where that setting has none. Readable
  line length is a setting about how many characters read comfortably in a line
  of prose, and a homepage of rows is a calendar and a card, so it no longer
  decides how much room each widget gets. **A homepage you already have is not
  touched** and keeps following your own setting. To give it the new width, add
  `cssclasses: ca-wide` to its properties; to take it off a new one, delete
  that line and nothing will put it back.

### Fixed
- **The section window called a homepage's own properties a stray block.**
  Opening "Edit this note's sections…" on a homepage with any properties on it
  reported that a block in the file wasn't ChronoAnvil's and had been left alone —
  about the properties themselves. Your own blocks are still reported, as they
  should be; the note's properties no longer are. The message also said "1 block
  … aren't", which now agrees with itself.
- **Unticking one of two widgets that share a block did nothing, after saying it
  would.** If you had put two sections in one `chronoanvil` block, the preview
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
  ordinary ChronoAnvil page are unchanged.

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
- **The review list on the journals dashboard showed a red *Unknown ChronoAnvil
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
- **`frame:`** — a line you can put in any `chronoanvil` block saying what its
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
