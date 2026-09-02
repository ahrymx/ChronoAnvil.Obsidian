// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One grammar for a directive line, and the span inside it that holds an
// argument a reader may be asked for.
//
// WHY THIS EXISTS (3.15 §9.8, promoted to patch 0)
//
// The grammar was written three times in three places and agreed by accident.
// `buildFromSpec` splits the label off at the first `|` before any directive
// sees its argument; `PERIOD_FLAG_RE` strips a trailing `,period` and lived
// module-private in `directive-regions.ts`; `keywordOf` takes everything before
// the first `:` and does not know about labels at all. A fourth copy — written
// beside them for the section editor — is how a plugin re-creates a bug that
// already has a paragraph explaining it, which is the argument `OBSIDIAN_DOM`
// and `MANAGED_ARGS` each made for their own one-table-one-test shape.
//
// So `directive-regions.ts` now imports `PERIOD_FLAG_RE` from here rather than
// declaring it, and the section editor computes its spans with the same
// functions the renderer parses with.
//
// THE GRAMMAR, WHOLE
//
//   keyword[:argument][,period][|label]
//
// read right to left, because that is the order the readers apply:
//
//   `|label`   split FIRST, at the FIRST `|`, by `buildFromSpec`
//              (widgets/index.ts). Everything after it is display text and no
//              directive ever sees it.
//   `,period`  a TRAILING SUFFIX MATCH, not a split on the comma. The Subject
//              Index template ships `tasks-table:{{folder}}` and a subject
//              named "Reading, Writing" resolves to a folder path containing a
//              comma, so a `split(",")` reads half a path as a flag. Only
//              `tasks-table` accepts it; on every other directive the comma is
//              part of the argument.
//   `:argument` everything left, verbatim, including spaces and commas.
//
// `#` also appears — `links:home,today,scopes#diary`,
// `note:capture#collapse:…|Captured` — and is deliberately NOT handled here.
// It is a per-directive sub-grammar of the argument rather than a layer above
// it, no folder-scoped directive uses one, and no section that declares a
// question does either. A parser that guessed at it would be inventing a rule
// nothing in the vault follows.
//
// WHAT A SPAN IS FOR
//
// The section editor has to show a reader the answer already written in their
// note and put a changed one back. It does NOT re-render the line: composing a
// directive over a line somebody typed makes the editor a formatter, which
// 3.15 §2.3 forbids and §8 names as the risk that destroys work. So the
// inverse of `directive()` is not a parser returning options — it is a SPAN,
// and everything outside it survives untouched: the label they wrote, the
// `,period` flag, the spacing, and any spelling the catalogue would not have
// chosen.

// A `,period` suffix means "follow the host note's period" rather than a fixed
// window. MOVED HERE FROM directive-regions.ts, where it was module-private and
// correct; it is re-exported there so every existing reader is unchanged.
export const PERIOD_FLAG_RE = /\s*,\s*period\s*$/;

// The scope keyword `journalFolderScope` accepts in place of a folder: every
// registered journal type's root, deduped by prefix (journal.ts::journalFolderScope).
// `journal-search` and `review-queue` route through it; `tag-index` and
// `tasks-table` do not, and giving them one is a widget change rather than a
// dialog one (3.14 §6).
export const SCOPE_ALL = "all";

// The scope keyword meaning "the root of the journal THIS note is in". 3.18 §5.
//
// A FOURTH STATE, AND A SEPARATE WORD FROM `all` ON PURPOSE. The obvious label
// for a control offering "everything in this journal" is *All*, and `all`
// already means something else and broader — every registered journal's root at
// once, which `review-queue` and `journal-search` both offer by that name. Two
// meanings for one word in a grammar three widgets share is how a grammar
// acquires two answers to one question, so the new state got its own word and
// the button says "Journal".
export const SCOPE_JOURNAL = "journal";

// ── the block modifier ────────────────────────────────────────────────
//
// WHO SUPPLIES THE CHROME, as one line read before the directives rather than
// as a second name for widgets that already have names. 4.1 §3.
//
// A MODIFIER ON THE BLOCK, NOT A NEW KEYWORD. The alternative was a `widget:`
// namespace — `widget: calendar` beside the existing `calendar` — and it fails
// three ways at once: it is a synonym for a directive that already exists, and
// this project spends whole releases removing second names for one idea; it
// needs a second parser, which is a second grammar; and it does not compose,
// because a widget written after it gets a frameless mode only if somebody
// remembers to add it to a switch. A modifier gives every existing directive
// the option for free, including the ones not written yet.
//
// THREE VALUES, BECAUSE THERE ARE THREE HOSTS (§3.1), and this is the part
// worth arguing rather than assuming. `none` alone would fix the canvas and
// leave markdown worse than it found it: the card is not a wrapper, it is a
// modifier class on the block, so withholding it leaves `.ca-journal-widget-block`
// and nothing else. In a canvas node that is exactly right, because the node IS
// the frame. In a markdown note nothing replaces it and the widget becomes
// loose content in the note's flow — inconsistent with every section around it,
// which is a different problem from the one the modifier was reached for.
export type FrameValue = "card" | "section" | "none";

export const FRAME_KEYWORD = "frame";

// A fence with no `frame:` line renders exactly as it did before this existed.
// That is what makes the modifier a minor rather than a breaking change, and it
// is asserted rather than merely intended — see test/frame.test.ts.
export const DEFAULT_FRAME: FrameValue = "card";

const FRAME_VALUES: readonly FrameValue[] = ["card", "section", "none"];

const isFrameValue = (v: string): v is FrameValue =>
  (FRAME_VALUES as readonly string[]).includes(v);

// What a fence's `frame:` line says, or why it cannot be honoured.
//
// AN ERROR RATHER THAN A RESOLUTION, which is §3.3's decision and the one place
// this grammar refuses instead of choosing. `header:` and `frame: section`
// answer the same question — who titles this section — and a fence carrying
// both is a fence that asked twice. A silent precedence rule would be the kind
// of thing nobody can find later, so the contradiction is caught here, at the
// point of writing, where the reader is looking at the two lines.
export interface FrameSpec {
  frame: FrameValue;
  // Null when the fence is fine. A sentence for the reader when it is not.
  error: string | null;
}

// Whether this line is the block modifier rather than a directive.
//
// EXACT, so a future `frame-something` directive is not swallowed by it, and so
// the dispatcher can drop this one line from the loop without a prefix test
// that might drop a widget.
export function isFrameLine(line: string): boolean {
  return splitDirective(line).keyword === FRAME_KEYWORD;
}

// ── who titles this block ─────────────────────────────────────────────
//
// 4.12 §A. THREE PREDICATES OVER ONE IDEA, and they are here rather than beside
// their callers because `parseFrame` below already had to compute the hardest
// of them as a local. Two copies of "does this fence title itself" is exactly
// how the grammar's refusal and the drag's refusal come to disagree about one
// fence — and disagreeing about THIS one means the editor offering a gesture
// that corrupts the page.

export const HEADER_KEYWORD = "header";

// Whether this line opens a header bar.
//
// EXACT, on `isFrameLine`'s argument: a future `header-something` directive
// must not be swallowed, and the dispatcher intercepts this keyword before
// `buildFromSpec` on the same test.
export function isHeaderLine(line: string): boolean {
  return splitDirective(line).keyword === HEADER_KEYWORD;
}

// Whether any line opens a bar with a name on it.
//
// THE HALF `parseFrame` COMPUTES, extracted. This is the one that answers "does
// this fence say twice who titles it", so it requires a non-empty argument: a
// bare `header:` renders the anchored control row and no title, which does not
// contradict `frame: section`.
export function hasTitledBar(lines: readonly string[]): boolean {
  return lines.some((l) => isHeaderLine(l) && splitDirective(l).argument.trim() !== "");
}

// Whether any line opens a bar at all, named or not.
//
// DELIBERATELY LOOSER THAN `hasTitledBar`, and the looseness is the point. An
// untitled `header:` still renders a `.ca-journal-sec` element, is still refused as
// cell content by `NOT_A_CELL` (`ui/widgets/row.ts`), and therefore still lands
// BELOW a group rather than in it. What matters to a layout is that the bar
// exists, not that somebody named it.
export function hasSectionBar(lines: readonly string[]): boolean {
  return lines.some(isHeaderLine);
}

// Whether this fence draws its own section chrome — 4.12 §A.
//
// THE ONE QUESTION THE DRAG AND THE EDITOR BOTH ASK. A fence that titles itself
// cannot be a column of a group: `layOutRow` inserts the group at the first
// CELL child's index, and a bar is not cell content, so the bar renders below
// the group it was supposed to title, the previous column's bar appears to title
// the whole thing, and `HeaderBar`'s sibling walk folds all of it. A
// `frame: section` fence arrives worse still — the modifier stays behind with
// the block being emptied, so the section loses its bar, its title and its fold
// in one move.
//
// ASKED OF THE WHOLE BODY, not of `widgetRun`'s span, and that is not an
// oversight: `frame:` is not content, so it sits outside the span by
// construction — which is exactly how a `frame: section` block yields a run at
// all today.
//
// A CONTRADICTORY FENCE IS NOT A SECTION FENCE, and it does not need a case
// here. `parseFrame` returns `card` for every error it reports, including
// `frame: section` written under a titled bar, so a fence the grammar has
// already refused is judged by its `header:` line alone — which is what it
// renders as.
export function isSectionFence(body: readonly string[]): boolean {
  return hasSectionBar(body) || parseFrame(body).frame === "section";
}

export function parseFrame(lines: readonly string[]): FrameSpec {
  const frameLines = lines.filter((l) => isFrameLine(l));
  if (frameLines.length === 0) return { frame: DEFAULT_FRAME, error: null };

  // TWO `frame:` LINES IS ALSO A FENCE THAT ASKED TWICE, and it is refused for
  // the same reason rather than by taking the first: a reader who wrote both
  // has an opinion about which one wins, and the grammar does not know it.
  if (frameLines.length > 1) {
    return {
      frame: DEFAULT_FRAME,
      error: `This block has ${frameLines.length} frame: lines. Keep one — ${FRAME_VALUES.join(", ")}.`,
    };
  }

  const raw = splitDirective(frameLines[0]).argument.trim();
  if (!isFrameValue(raw)) {
    return {
      frame: DEFAULT_FRAME,
      error: raw
        ? `frame: ${raw} isn't a frame. Use ${FRAME_VALUES.join(", ")}.`
        : `frame: needs a value — ${FRAME_VALUES.join(", ")}.`,
    };
  }

  return { frame: raw, error: null };
}

// ── the row modifier ──────────────────────────────────────────────────
//
// WHETHER THIS BLOCK'S WIDGETS SIT SIDE BY SIDE. 4.2 §2, and the gap that
// section names: ChronoAnvil composes a single column and has no way to say *these
// blocks are one row*. Three of the four pieces a homepage of rows needs
// already exist — a composed page whose blocks are data, per-block chrome, and
// widths that answer to the pane. This is the fourth.
//
// A SECOND MODIFIER, NOT A SECOND GRAMMAR. `frame:` established the slot: one
// line, read before the directives, dropped from the loop, saying something
// about the BLOCK rather than about a widget. A row is the same kind of
// statement one level out, so it is spelled the same way and every directive —
// including the ones not written yet — gets it for free.
//
// WHY A ROW IS A FENCE AND NOT A GROUP OF FENCES. The obvious reading of "these
// blocks are one row" is a marker spanning several ```chronoanvil fences. It cannot
// work, and the reason is not a preference: in Live Preview each fence is a
// widget CodeMirror lays out in its own vertical flow, and nothing this plugin
// can style makes two of them share a line. In reading view they are siblings of
// a container Obsidian owns and rebuilds. A fence is the largest piece of a note
// this plugin owns outright, so a row is a fence — and a fence already holds as
// many directives as a reader wants to put in it.
//
// NO ARGUMENT ON `row`, BECAUSE THE COUNT IS DERIVED. `row: 3` would be a number
// that has to agree with the directives underneath it, and the first thing a reader does
// after writing one is add a fourth widget. The cells ARE the directives; there
// is nothing left to configure. An argument is therefore refused rather than
// ignored, which is `journals:cards`' rule (4.2 §1.1) one keyword over.
export const ROW_KEYWORD = "row";

// HOW MANY COLUMNS A ROW DRAWS AT MOST. 4.52.1.
//
// ── THE BUG THAT SETTLED THIS, REPORTED FROM A VAULT ─────────────────────
//
// *"the groups can be easily broken and don't reflect what is shown in the
// editor."* Four widgets in one `row` fence, on a note column about 1090px
// wide. A cell asks for a floor of `--ca-row-cell-min` — 320px — so three fit
// across (980px with the gaps) and the fourth wrapped to a line of its own,
// where `flex-grow` stretched it to the full width of the group. The file said
// four columns, the section editor drew four columns, and the page drew three
// and a band. Nothing was wrong with the arithmetic; the row had been asked for
// more columns than a pane can hold since 4.2, and a three-cell row does the
// same thing at 720px.
//
// ── WHY A CAP RATHER THAN A BETTER WRAP ──────────────────────────────────
//
// A wrapped column stops being a column. That is the whole of it: whatever the
// wrap does — stretch the survivor, hold it to a third, deal the four into a
// 2x2 grid — the reader is looking at a row whose shape depends on how wide
// their sidebar happens to be, and no two panes agree. `row` promises *these
// widgets are one row*; a promise a pane can revoke is not one.
//
// TWO, AND NOT THREE, BECAUSE TWO IS THE ONE THAT ALWAYS FITS. Two cells at the
// floor plus the gap is 650px, which is under the width the group-making
// quarters already require of a block (`@container (min-width: 660px)` in
// styles/05-inline-widgets.css, chosen for exactly this sum). Three needs
// 980px, which a split pane does not have. So at two the wrap never fires above
// a phone, and where it does fire — one column per line — that is the collapse
// it was written for rather than a layout falling apart.
//
// ── WHAT IT MEANS FOR A FENCE THAT ASKS FOR MORE ─────────────────────────
//
// It is DEALT, not truncated: run `n` of the fence is drawn in column
// `n % MAX_COLUMNS`, so four widgets read across and then down exactly as they
// did — 1 and 2 on the top line, 3 under 1 and 4 under 2. Nothing is hidden and
// nothing changes place in the reading. `cellPlan` does it on the render so a
// fence somebody typed by hand draws two columns today; `regroupFlatNote`'s
// column phase writes the same answer into the file the next time the section
// editor saves, so the two never disagree for long.
//
// A NUMBER RATHER THAN A CONTAINER QUERY, and 4.3.1 is the release that
// established why: a cell is the block divided by however many cells there are,
// and no `@container` rule can know that count. This is the count.
export const MAX_COLUMNS = 2;

// WHICH COLUMN THE NEXT WIDGET IS DEALT INTO, given what each holds now.
//
// THE COLUMN HOLDING FEWER, AND THE FIRST ON A TIE. That is the whole rule, and
// stating it as a function rather than as three copies of a loop is the only
// reason the three places that deal can be trusted to deal the same way:
//
//   • `capColumns` (row.ts) deals a fence that asks for too many columns as it
//     RENDERS it, so a note nobody has saved since 4.52.1 draws two columns.
//   • `regroupFlatNote`'s column phase deals the same fence in the FILE, so the
//     next Save writes down what the page has been drawing.
//   • `joinInto` (note-sections.ts) deals ONE arrival into a row that is
//     already full, which is what **Add to group** does on its third press.
//
// THE FIRST TWO MUST AGREE EXACTLY OR THE PAGE CHANGES SHAPE ON SAVE, which is
// a worse bug than the one this release fixes — a reader would press Save on a
// note they were happy with and watch two widgets swap places. They agree
// because they ask this, one widget at a time, in the same order.
//
// AND IT IS WHAT MAKES FOUR WIDGETS A 2x2 rather than a 1-and-3: the third is
// dealt into a tie and takes the first column, the fourth then finds that one
// heavier and takes the second.
export function dealInto(load: readonly number[]): number {
  let best = 0;
  for (let n = 1; n < load.length; n++) if (load[n] < load[best]) best = n;
  return best;
}

// What a fence's `row` line said, or why it could not be honoured.
//
// `row: false` ON AN ERROR, which is `parseFrame`'s fallback and the same
// argument: the block renders exactly as it did before the modifier existed, so
// a refused line costs a reader their layout and never their content.
export interface RowSpec {
  row: boolean;
  // Null when the fence is fine. A sentence for the reader when it is not.
  error: string | null;
}

// Whether this line is the row modifier rather than a directive.
//
// EXACT, for `isFrameLine`'s reason: a future `row-something` directive must not
// be swallowed by it, and the dispatcher drops this one line from the loop
// without a prefix test that might drop a widget.
export function isRowLine(line: string): boolean {
  return splitDirective(line).keyword === ROW_KEYWORD;
}

export function parseRow(lines: readonly string[]): RowSpec {
  const rowLines = lines.filter((l) => isRowLine(l));
  if (rowLines.length === 0) return { row: false, error: null };

  // TWO `row` LINES IS A READER ASKING FOR TWO ROWS IN ONE FENCE, and it is
  // refused rather than quietly making one row of six — which is exactly the
  // near-miss that reads as the feature not working.
  //
  // The refusal is not a limitation of the layout; it is what `frame:` means. A
  // fence's frame describes the WHOLE fence, so two rows inside one could not
  // wear different chrome — and the reference design's two rows differ in
  // precisely that: bordered widgets above, borderless below. One row per fence
  // keeps the two modifiers describing the same thing, and the error names the
  // way out, which is a second fence.
  if (rowLines.length > 1) {
    return {
      row: false,
      error: `This block has ${rowLines.length} row lines. A block is one row — put the second row in its own \`\`\`chronoanvil block, so each row can carry its own frame:.`,
    };
  }

  const raw = splitDirective(rowLines[0]).argument.trim();
  if (raw) {
    return {
      row: false,
      error: `row takes no value, so \`row: ${raw}\` is refused. A row holds every widget in its block, which means the number of cells is the number of directives you wrote.`,
    };
  }

  return { row: true, error: null };
}

// ── the page head, as a fact about the block holding it (4.11) ────────
//
// NOT A MODIFIER. `title` is a directive — it draws the card — so this is neither
// dropped from the dispatch loop nor read as a flag. What it is for is the one
// question the PAGE gesture has to ask: does this block hold the page's own name,
// because a block that does may not be dragged, dropped into, or split into
// columns. The head is pinned in the section editor, and a page whose gesture
// disagreed with its editor would be a page with two answers.
//
// EXACT, for `isFrameLine`'s reason one keyword over: a future `title-something`
// directive must not be swallowed.
export const TITLE_KEYWORD = "title";

// Whether this fence body line is the page head's directive.
//
// AND IT IS DELIBERATELY LOOSER THAN `locateTitle`, WHICH ANSWERS A DIFFERENT
// QUESTION. That one searches a WHOLE NOTE, frontmatter included, so it has to
// tell `title:home,diary,journals` from a reader's `title: My Page` property —
// hence its *colon with nothing spaced after it* rule. This one is asked of a line
// already known to be inside a ```chronoanvil fence, where a YAML property cannot
// occur and where `splitDirective` is the grammar every other keyword is read
// with. Two questions, two rules, and the looser one is not a weakening: using
// `locateTitle`'s regex here would make the gesture disagree with the dispatcher
// about which lines are directives.
export function isTitleLine(line: string): boolean {
  return splitDirective(line).keyword === TITLE_KEYWORD;
}

// ── AND THE OTHER TWO WAYS A PAGE CARRIES ITS OWN NAME (5.11) ────────────
//
// `title:` is the DASHBOARD head. A journal note's is `journal-header` and a
// diary entry's is `entry-header` — `widget-registry.ts` files all three under
// the same exclusion and calls them "the strip that makes a note a journal
// note", "a second banner is a second answer to which note this is". They are
// three spellings of one fact, and until this release only one of them was
// asked about.
//
// WHAT THAT COST, AND IT WAS REACHABLE BY CLICKING. `cell-move.ts` refuses to
// move the head, to merge anything into its block, or to insert a block above
// it — three refusals, all keyed on `isTitleLine`, all silently inapplicable on
// the two surfaces where the head is a banner instead. `flatBlocks` asks the
// same question to decide whether a block may be a COLUMN, so a journal note's
// banner was reported as groupable the moment that model was given rows.
//
// A LIST RATHER THAN A THIRD PREDICATE, so the next surface that grows a head
// adds a word here rather than a branch at each of the four callers.
export const PAGE_HEAD_KEYWORDS: readonly string[] = [
  TITLE_KEYWORD,
  "journal-header",
  "entry-header",
];

// Whether this fence body line is the page's own name, on any surface.
//
// `isTitleLine`'s NOTE APPLIES UNCHANGED: read with `splitDirective`, exact, and
// asked only of a line already known to be inside a fence body.
export function isPageHeadLine(line: string): boolean {
  return PAGE_HEAD_KEYWORDS.includes(splitDirective(line).keyword);
}

// ── the banner's other half (4.19) ────────────────────────────────────
//
// `links:` HAS BEEN SPELLED AS A STRING LITERAL IN FOUR FILES. `MANAGED_ARGS`
// holds one, `journal-sections.ts` and both diary catalogues each `locate` on a
// regex of their own. That was fine while nothing but a reconciler asked the
// question; 4.19 makes the banner a block that holds a `title:` line AND a
// `links:` line, and the migration that welds an old note's two fences has to
// find the second one inside a fence body — which is `isTitleLine`'s question
// about the other keyword, and wants the same answer shape.
//
// EXACT, and `isTitleLine`'s note applies unchanged: `links-something` must not
// be swallowed, and `splitDirective` is the grammar the dispatcher reads a body
// line with, so a helper that used its own regex could disagree with it.
export const LINKS_KEYWORD = "links";

// Whether this fence body line is a navigation row's directive.
export function isLinksLine(line: string): boolean {
  return splitDirective(line).keyword === LINKS_KEYWORD;
}

// ── how wide the page is (4.11) ───────────────────────────────────────
//
// A THIRD MODIFIER, ON `frame:`'s AND `row`'s SLOT: one line, read before the
// directives, dropped from the loop, saying something about more than the widget
// under it. What is new is the SCOPE — `frame:` describes a block and `row`
// describes a block, and this describes the NOTE.
//
// WHY THE PAGE'S WIDTH IS A LINE IN THE PAGE AT ALL. The homepage has been wide
// since 4.2, through `cssclasses: ca-wide` in its frontmatter, and no other
// dashboard could ask for the same thing: frontmatter is out of a post-processor's
// reach, and repair deliberately never edits it. So the width was a property of
// one composed note rather than a thing a reader could want. This is that setting
// made reachable, and the form it takes is the form every other ChronoAnvil setting
// on a page takes — a line in the note, which a reader can see, copy and delete,
// and deleting it gives them their width back.
//
// WHY IT LIVES IN THE HEAD'S FENCE AND IS REFUSED ANYWHERE ELSE. A page has one
// width, so the line has to have one home, and the head is the block that is
// already about the page rather than about something on it — its name, where it
// can go, and the cog that edits it. A `wide` line in a fence with no `title` is
// therefore not ignored and not honoured: it is refused, in that block, where the
// reader is looking at the line they just typed. That is `parseFrame`'s rule for
// `frame: section` beside a `header:`, applied to a scope rather than to a
// contradiction.
export const WIDE_KEYWORD = "wide";

// What a fence's `wide` line said, or why it could not be honoured.
//
// `wide: false` ON AN ERROR, which is `parseRow`'s and `parseFrame`'s fallback and
// the same argument: the page renders exactly as it did before the modifier
// existed, so a refused line costs a reader their width and never their content.
export interface WideSpec {
  wide: boolean;
  // Null when the fence is fine. A sentence for the reader when it is not.
  error: string | null;
}

// Whether this line is the width modifier rather than a directive.
//
// EXACT, for `isFrameLine`'s reason: a future `wide-something` directive must not
// be swallowed by it, and the dispatcher drops this one line from the loop
// without a prefix test that might drop a widget.
export function isWideLine(line: string): boolean {
  return splitDirective(line).keyword === WIDE_KEYWORD;
}

export function parseWide(lines: readonly string[]): WideSpec {
  const wideLines = lines.filter((l) => isWideLine(l));
  if (wideLines.length === 0) return { wide: false, error: null };

  // TWO `wide` LINES IS A PAGE ASKED FOR TWO WIDTHS. Refused rather than quietly
  // taking the first, which is `parseRow`'s rule for two rows in one fence: a
  // near-miss that renders as the feature working is worse than one that says
  // what is wrong.
  if (wideLines.length > 1) {
    return {
      wide: false,
      error: `This block has ${wideLines.length} wide lines. A page is one width — delete the extra one.`,
    };
  }

  const raw = splitDirective(wideLines[0]).argument.trim();
  if (raw) {
    return {
      wide: false,
      error: `wide takes no value, so \`wide: ${raw}\` is refused. A page is either wide or it is not; delete the line to make it narrow again.`,
    };
  }

  // AND IT HAS TO BE IN THE BLOCK THAT CARRIES THE PAGE'S NAME. Asked of the same
  // `lines` the modifier was found in, so the answer is about this fence and this
  // fence only — the parse never sees the note.
  if (!lines.some((l) => isTitleLine(l))) {
    return {
      wide: false,
      error: `wide is a fact about the page, and it is read from the block that draws the page's title. Move it into that block — the one with the \`title\` line in it.`,
    };
  }

  return { wide: true, error: null };
}

// ── the cell delimiter ────────────────────────────────────────────────
//
// WHERE ONE CELL OF A ROW ENDS AND THE NEXT BEGINS. 4.4 §1.
//
// `row` made each directive a cell, one for one, which is every arrangement a
// page wants except the one it wanted first: two small widgets stacked beside a
// large one. A fence cannot contain a fence, so there is no second level to
// write into — and this is the level, written flat:
//
//   row
//   diary:3
//   cell
//   tasks-table
//   on-this-day:always
//
// A ROW'S CELLS ARE THE RUNS BETWEEN THE DELIMITERS. Two directives with no
// `cell` between them share a cell and stack inside it; a `cell` line starts the
// next one. A block with a `row` line and no `cell` line is exactly what it was
// before this existed, which is what makes this a minor rather than a breaking
// change.
//
// AN EMPTY RUN DRAWS NOTHING, so both spellings a reader might reach for work:
// `cell` before the first directive (every cell opened explicitly) and `cell`
// only between them (the shorter form above) mean the same thing. That is not a
// contradiction being resolved — both say one cell holds `diary:3` — so there is
// nothing here to refuse.
//
// POSITIONAL, WHICH IS WHY IT IS NOT DROPPED LIKE `frame:` AND `row`. Those two
// say something about the whole block and can be read before the loop in any
// order; this one means "here", and the dispatcher has to meet it in sequence.
export const CELL_KEYWORD = "cell";

// What a fence's `cell` lines said, or why they could not be honoured.
export interface CellSpec {
  // Whether this block delimits its cells at all.
  cells: boolean;
  error: string | null;
}

// Whether this line is the cell delimiter rather than a directive.
export function isCellLine(line: string): boolean {
  return splitDirective(line).keyword === CELL_KEYWORD;
}

export function parseCells(lines: readonly string[]): CellSpec {
  const cellLines = lines.filter((l) => isCellLine(l));
  if (cellLines.length === 0) return { cells: false, error: null };

  // A DELIMITER WITH NOTHING TO DELIMIT. `cell` divides a row; in a block that
  // is a column it divides nothing, and a reader who wrote one is describing a
  // layout they have not asked for. Silently ignoring it would leave them
  // looking at a stack and a line that did nothing.
  //
  // Asked of the lines rather than passed in, so this function answers one
  // question completely and no caller has to remember to ask the other first.
  if (!lines.some((l) => isRowLine(l))) {
    return {
      cells: false,
      error:
        "cell divides a row into columns, and this block has no row line. Add row above the directives, or delete the cell line.",
    };
  }

  // A VALUE IS A WIDTH NOW (4.4 §2). `cell: 2` opens a cell two shares wide.
  const bad = cellLines.find((l) => cellWeightOf(l) === null);
  if (bad) {
    const raw = splitDirective(bad).argument.trim();
    return {
      cells: false,
      error: `cell: ${raw} isn't a width. A cell takes a whole number of shares — cell: 2 is twice as wide as a plain cell.`,
    };
  }

  return { cells: true, error: null };
}

// How many shares this `cell` line asks for, or null when what it says is not a
// width. A delimiter with no value is one share.
//
// ── WHY A WIDTH MAY LIVE HERE AND `row: 3` MAY NOT ───────────────────────
//
// 4.2 refused `row: 3` because a count written above the directives stops
// agreeing with them the first time a fourth is added, and a ratio on the block
// — `row: 1 2` — is the same mistake wearing a fraction: two weights and three
// cells is a fence that disagrees with itself and nothing catches it.
//
// A weight on the CELL cannot disagree with anything, because it is written
// where the cell is. Add a cell and it brings its own share; delete one and its
// share goes with it. That is the whole of 4.4 §2's argument and the reason
// delimiting cells had to come first: §1 created the one place a width can live
// without going stale.
//
// NO UPPER BOUND, AND THAT IS DELIBERATE. The tempting cap is the width at
// which a cell's basis exceeds the page and the row wraps instead — which would
// make the number do nothing. But that width is a fact about the PANE, and
// 4.3.1's whole lesson was that the grammar cannot know it: a breakpoint on the
// block could not describe a cell, and a cap here could not describe a monitor.
// A weight too large for the pane wraps, which is the layout answering
// correctly rather than the grammar guessing.
export function cellWeightOf(line: string): number | null {
  const raw = splitDirective(line).argument.trim();
  if (!raw) return 1;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

// ── the tab delimiter ─────────────────────────────────────────────────
//
// WHERE ONE PAGE OF A GROUP ENDS AND THE NEXT BEGINS. 4.34 §1.
//
// `cell` divides a row into columns; this divides a fence into PAGES, of which
// one is on screen at a time and the group's foot carries a numbered strip to
// switch between them. It is the same delimiter one level up:
//
//   row
//   diary:3
//   cell
//   tasks-table          ← tab [1], two columns
//   tab
//   chart:confidence     ← tab [2], one column
//
// THE SAME WALK, WHICH IS THE WHOLE DESIGN. Every reading in this plugin that
// turns a fence into a layout is "runs between delimiters, empty runs dropped" —
// `cellPlan` over rendered children, `columnsOf` over body lines. A tab does not
// get a second implementation of any of it: `tabSlices` (cell-move.ts) cuts the
// body into one slice per page, and every existing function keeps its exact
// contract INSIDE one slice. A design that taught `cellPlan` about tabs would
// put two levels of delimiter in one loop, and the first bug would be a `cell`
// in tab 2 counted as a column of tab 1.
//
// WHAT THE TWO DELIMITERS MEAN TOGETHER. The `row` line opens tab 1 and its
// first cell, exactly as it opens the first cell today. A `tab` line closes the
// page before it and opens the next one, AND opens that page's first cell — so a
// `cell` immediately after a `tab` opens nothing and is dropped, which is the
// leading-`cell` rule `cellPlan` has honoured since 4.4 §2.
//
// AN EMPTY RUN DRAWS NO TAB, so a trailing `tab`, two in a row, and a `tab`
// above a directive that drew nothing all mean what they already mean for
// `cell`.
//
// AND A BLOCK WITH NO `tab` LINE IS EXACTLY WHAT IT WAS. One page, no strip, the
// column count in the foot. That is what makes this a minor rather than a
// breaking change, and it is the first thing 4.34's verification checks.
export const TAB_KEYWORD = "tab";

// What a fence's `tab` lines said, or why they could not be honoured.
//
// `CellSpec`'s SHAPE, for `CellSpec`'s reason: one function answers one question
// completely, so no caller has to remember to ask the other first.
export interface TabSpec {
  // Whether this block divides itself into pages at all.
  tabs: boolean;
  error: string | null;
}

// Whether this line is the tab delimiter rather than a directive.
//
// EXACT, for `isFrameLine`'s and `isRowLine`'s reason: a future `tab-something`
// directive must not be eaten by the delimiter that shares its first three
// letters.
export function isTabLine(line: string): boolean {
  return splitDirective(line).keyword === TAB_KEYWORD;
}

export function parseTabs(lines: readonly string[]): TabSpec {
  const tabLines = lines.filter((l) => isTabLine(l));
  if (tabLines.length === 0) return { tabs: false, error: null };

  // A DELIMITER WITH NOTHING TO DIVIDE, which is `parseCells`' first refusal one
  // level up. `tab` pages a group; a block that is not a row is a column of
  // widgets and has no group to page, so a reader who wrote one is describing a
  // layout they have not asked for.
  if (!lines.some((l) => isRowLine(l))) {
    return {
      tabs: false,
      error:
        "tab divides a group into pages, and this block has no row line. Add row above the directives, or delete the tab line.",
    };
  }

  // A VALUE IS REFUSED, AND THAT IS A DOOR HELD OPEN RATHER THAN A FEATURE
  // DECLINED. The strip is numbered — `[1] [2] [3]` — so there is nothing for a
  // value to say yet, and `tab: Charts` is the obvious next spelling. A refusal
  // can become an acceptance later without breaking a single file on disk; a
  // value accepted and ignored cannot, because by then files will carry one.
  //
  // This is `row`'s own argument (4.2 refused `row: 3` and says why) applied to
  // the same slot, and it is deliberately NOT `cell`'s — a width on a cell
  // cannot go stale because it is written where the cell is, and a page has
  // nothing of that kind to carry.
  const valued = tabLines.find((l) => splitDirective(l).argument.trim() !== "");
  if (valued) {
    const raw = splitDirective(valued).argument.trim();
    return {
      tabs: false,
      error: `tab takes no value, so \`tab: ${raw}\` is refused. A tab holds every widget between it and the next one, which means the number of pages is the number of tab lines you wrote.`,
    };
  }

  return { tabs: true, error: null };
}

// ── the height of a widget ────────────────────────────────────────────
//
// HOW TALL ONE CARD IN A COLUMN IS. 4.22 §1.
//
// `cell` divided a row and then said how wide each part was. This says how tall
// one part is, and it is the other half of the same sentence: a group's columns
// have been resizable since 4.9 §3 and its rows have not, because there was no
// grammar for a height and a seam with nothing to write is not a control.
//
//   row
//   diary:3
//   cell
//   height: 240
//   on-this-day:always
//
// POSITIONAL, LIKE `cell`, AND FOR A NARROWER REASON. `cell` means "the next
// column starts here"; this means "the widget on the next line is this tall".
// Not the cell, not the column, not the block — the ONE directive under it. That
// is what makes it survivable: a height that named its widget would have to name
// it again every time the reader retitled one, and a height located by counting
// would size the wrong card the first time a directive drew nothing. The line
// below it is the only address that cannot go stale while the file is not edited,
// and `heightAbove` in `cell-height.ts` is where that rule is stated once.
//
// WHY `height` AND NOT `size`. A number in this fence already means a width —
// `cell: 2` — and one keyword must not mean both. `height: 240` says what it sets
// and cannot be read as anything else.
export const HEIGHT_KEYWORD = "height";

// Why a fence's `height` lines could not be honoured, or null when they can.
//
// NO FACT BESIDE THE ERROR, WHICH IS THIS PARSE'S SHAPE AND NOT AN OMISSION.
// `parseCells` answers "does this block delimit its cells at all" because that is
// one answer for the whole fence. A height is not one answer for the fence: there
// are as many as there are cards, each belongs to the line under it, and the
// render reads them one at a time through `heightAbove`. So the only thing this
// can tell a caller that the caller cannot read for itself is whether to refuse.
export interface HeightSpec {
  error: string | null;
}

// Whether this line is the height modifier rather than a directive.
export function isHeightLine(line: string): boolean {
  return splitDirective(line).keyword === HEIGHT_KEYWORD;
}

// How many pixels tall this `height` line asks its widget to be, or null when
// what it says is not a height.
//
// `cellWeightOf`'S RULES, INCLUDING ITS REFUSAL TO CAP. `/^\d+$/`, at least one,
// and no upper bound: a height too large for the pane makes a card taller than
// the window and the page scrolls, which is the layout answering correctly rather
// than the grammar guessing at a monitor it cannot see. That is 4.3.1's lesson,
// and it is the same one twice.
//
// AND THE ONE PLACE THE TWO DIVERGE: a `height:` with no value is not a height.
// A delimiter with no value still delimits, which is why a bare `cell` means one
// share and is the shortest way to say it. A height with no value says nothing at
// all — there is no height a reader could mean by leaving it out — so it is
// refused rather than defaulted to some number this file would have to pick.
export function heightOf(line: string): number | null {
  const raw = splitDirective(line).argument.trim();
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

// `parseCells`' TWO REFUSALS, ASKED ABOUT A HEIGHT, and for its stated reason: a
// line that does nothing is worse than a line that says why.
export function parseHeights(lines: readonly string[]): HeightSpec {
  const heightLines = lines.filter((l) => isHeightLine(l));
  if (heightLines.length === 0) return { error: null };

  // A HEIGHT WITH NOTHING TO SIZE. A height sizes a CARD, and `cardWidget` only
  // builds cards inside a row — outside a group a directive is drawn bare, there
  // is no box around it to be 240 pixels tall, and a reader who wrote one is
  // describing a layout they have not asked for.
  if (!lines.some((l) => isRowLine(l))) {
    return {
      error:
        "height sets how tall one widget's card is, and a card is only drawn inside a row. Add row above the directives, or delete the height line.",
    };
  }

  const bad = heightLines.find((l) => heightOf(l) === null);
  if (bad) {
    const raw = splitDirective(bad).argument.trim();
    return {
      error: `height: ${raw} isn't a height. A widget takes a whole number of pixels — height: 240 is a card 240 pixels tall, with its contents scrolling inside.`,
    };
  }

  return { error: null };
}

export interface DirectiveParts {
  // Everything before the first `:` of the body.
  keyword: string;
  // Between that `:` and the label, verbatim — `,period` included.
  argument: string;
  // After the first `|`, or null when there is none.
  label: string | null;
}

export function splitDirective(line: string): DirectiveParts {
  const bar = line.indexOf("|");
  const body = bar === -1 ? line : line.slice(0, bar);
  const label = bar === -1 ? null : line.slice(bar + 1);
  const colon = body.indexOf(":");
  return {
    keyword: (colon === -1 ? body : body.slice(0, colon)).trim(),
    argument: colon === -1 ? "" : body.slice(colon + 1),
    label,
  };
}

// The argument with any `,period` flag taken off, and whether it was there.
export function splitPeriodFlag(argument: string): {
  arg: string;
  period: boolean;
} {
  const period = PERIOD_FLAG_RE.test(argument);
  return { arg: argument.replace(PERIOD_FLAG_RE, "").trim(), period };
}

// WHERE AN ANSWER LIVES, as coordinates into the lines it was found in.
//
// `keepColon` is the whole of the fiddly part and it earns its field: a span
// that swallows the `:` can be cleared to nothing (`tag-index:X` → `tag-index`,
// which is the bare form and means the host's folder), but a line with a
// `,period` after the argument cannot lose its colon or the keyword absorbs the
// flag (`tasks-table,period` is a directive named `tasks-table,period`). So the
// colon is inside the span when nothing follows the argument and outside it
// when something does, and `spliceArg` reads the flag rather than deciding again.
export interface ArgSpan {
  line: number;
  from: number;
  to: number;
  keepColon: boolean;
}

// The span of `keyword`'s argument within these lines, or null when no line
// carries that directive.
//
// FIRST MATCH WINS. Every content directive is unique per note — the property
// `keywordOf` has turned on since layout.ts was written — and the caller that
// splices is handed one section's lines rather than the file's.
export function argSpanIn(
  lines: readonly string[],
  keyword: string,
  join?: string
): ArgSpan | null {
  return argSpansIn(lines, keyword, 1, join)[0] ?? null;
}

// EVERY span of `keyword`'s argument in these lines, in file order.
//
// `argSpanIn` is this with a limit of one, and the two share a body rather than
// agreeing by inspection — the mistake `directive-grammar.ts` exists to have
// stopped making. `limit` is an optimisation and nothing more: the caller that
// wants the first span should not walk a 300-line note to find six.
export function argSpansIn(
  lines: readonly string[],
  keyword: string,
  limit = Infinity,
  // ── WHEN `|` IS NOT A LABEL, 4.70 ────────────────────────────────────
  //
  // `|` HAS MEANT TWO THINGS SINCE 4.62 AND THIS FUNCTION KNEW ONE OF THEM.
  // Everywhere else in the grammar `keyword:argument|Label` puts a reader's own
  // title after a bar, which is why the argument is cut at the first one. Then
  // `time-grid` declared `argJoin: "|"` — a COMPOUND argument, `events|3` — and
  // this cut it at the join, so:
  //
  //   `time-grid:|3`        read back as an argument of `""`, the `|3` outside
  //                         the span entirely;
  //   `time-grid:events|3`  answered on the day count spliced INSIDE that span
  //                         and left the old tail behind: `events|1|3`.
  //
  // Nothing caught it because 4.62 composed the grid onto no page — the section
  // window could reach the question, and the only surface that could have shown
  // the damage was a homepage nobody had one on. 4.70 composes `time-grid:|3`,
  // so it had to be fixed before it could ship.
  //
  // THE CALLER SUPPLIES THE JOIN, AND THAT IS THE ONLY WAY IT CAN. This file has
  // no imports by design — see the note above `parseHeader` — so it cannot ask
  // the registry which keywords declare one. Every caller that reads a compound
  // argument is holding the question that declares it (`q.part.join`), so the
  // fact travels with the reader rather than being looked up twice.
  //
  // ABSENT MEANS THE OLD BEHAVIOUR EXACTLY, so every one of the twenty callers
  // that pass nothing is untouched: an argument still ends at a label bar.
  join?: string
): ArgSpan[] {
  const out: ArgSpan[] = [];
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const line = lines[i];
    if (splitDirective(line).keyword !== keyword) continue;

    // A DIRECTIVE JOINED ON `|` HAS NO LABEL, which is a consequence of the
    // grammar rather than a rule this file invents: the two spellings are the
    // same character, so a keyword that spends it on a compound has none left
    // to spend on a title.
    const bar = join === "|" ? -1 : line.indexOf("|");
    const end = bar === -1 ? line.length : bar;
    const colon = line.slice(0, end).indexOf(":");

    // A bare directive has no argument and therefore an EMPTY span, sitting
    // where the argument would go. Writing into it inserts the `:` as well,
    // which is why `spliceArg` composes the separator rather than assuming one.
    if (colon === -1) {
      const at = line.slice(0, end).trimEnd().length;
      out.push({ line: i, from: at, to: at, keepColon: false });
      continue;
    }

    const argument = line.slice(colon + 1, end);
    const flag = argument.match(PERIOD_FLAG_RE);
    let to = flag ? colon + 1 + (argument.length - flag[0].length) : end;
    // Trailing whitespace belongs to the line, not to the answer.
    while (to > colon + 1 && /\s/.test(line[to - 1])) to--;
    const keepColon = flag !== null;
    out.push({ line: i, from: keepColon ? colon + 1 : colon, to, keepColon });
  }
  return out;
}

// The span of `keyword`'s argument, ONLY when this note has exactly one of them.
//
// WHY THIS IS A SECOND FUNCTION AND NOT A FLAG ON THE FIRST (3.18 follow-ups §2)
//
// `argSpanIn` takes the first match, and says why in as many words: *every
// content directive is unique per note*. That is true of `tasks-table`,
// `journal-search`, `review-queue` and `tag-index` — every directive the
// mechanism was built for — and it is FALSE of `header:`, which is structural
// rather than content and repeats once per section. Study's Topic index carries
// six.
//
// 3.18 shipped a title control that read its answer with `argSpanIn("header")`,
// so the Task Manager's box and the Resources box both displayed `🔁 Review` —
// the first header in the file — and, because a non-null answer reads as a
// readable one, the editor showed a control confidently over a value belonging
// to another section.
//
// The honest rule is not "titles are special". It is:
//
//   an answer that cannot be told apart from another section's is not an answer
//
// so this returns null on ambiguity rather than guessing, and a caller that
// cannot read an answer says so instead of drawing a control over one. It also
// means the control CORRECTS ITSELF where the ambiguity does not exist: a note
// carrying exactly one `header:` reads and writes it perfectly well, which a
// blanket "title questions are unreadable" rule would have given up on.
export function soleArgSpanIn(
  lines: readonly string[],
  keyword: string,
  join?: string
): ArgSpan | null {
  // Two is all it takes to know; a third changes no answer.
  const found = argSpansIn(lines, keyword, 2, join);
  return found.length === 1 ? found[0] : null;
}

// What is written in that span today. Empty means the directive's own default
// — for all four folder-scoped directives, the host note's own parent.
export function readArg(lines: readonly string[], span: ArgSpan): string {
  const raw = lines[span.line]?.slice(span.from, span.to) ?? "";
  return (span.keepColon ? raw : raw.replace(/^:/, "")).trim();
}

// The same lines with one directive's KEYWORD replaced by another. 4.46.1.
//
// WHY A RENAME EXISTS AT ALL, when this file's whole posture is that a
// superseded spelling is honoured rather than rewritten. It is not repair, and
// it never runs on its own: it is what happens when a reader ANSWERS a question
// on a section whose line still carries an older word for the same widget.
//
// Without it the answer has nowhere to go. `withAnswers` finds the span to
// write into by keyword, so a question naming `stats-band` on a line that says
// `topic-stats` finds nothing and drops the write silently — which is exactly
// what 4.46.0 shipped. The choice is between refusing to let the reader
// configure the block at all and moving their line onto the current spelling at
// the moment they configure it. The second is the one that does what they
// asked.
//
// SOLE, ON `soleArgSpanIn`'s RULE AND FOR ITS REASON: a keyword that appears
// twice cannot be told apart, and renaming the first would move an answer onto
// a block the reader was not looking at.
//
// THE ARGUMENT AND ANY `|Label` SURVIVE, because only the word is replaced —
// which is what makes this safe to run before `spliceArg` rather than instead
// of it.
export function renameSoleKeyword(
  lines: readonly string[],
  from: string,
  to: string
): string[] | null {
  let found = -1;
  for (let i = 0; i < lines.length; i++) {
    if (splitDirective(lines[i]).keyword !== from) continue;
    if (found !== -1) return null;
    found = i;
  }
  if (found === -1) return null;
  const line = lines[found];
  const at = line.indexOf(from);
  const out = [...lines];
  out[found] = line.slice(0, at) + to + line.slice(at + from.length);
  return out;
}

// The same lines with `value` in that span and nothing else touched.
export function spliceArg(
  lines: readonly string[],
  span: ArgSpan,
  value: string
): string[] {
  const line = lines[span.line];
  if (line === undefined) return [...lines];
  const replacement = value ? (span.keepColon ? value : `:${value}`) : "";
  const out = [...lines];
  out[span.line] =
    line.slice(0, span.from) + replacement + line.slice(span.to);
  return out;
}

// ── the header bar's own argument ─────────────────────────────────────
//
// MOVED HERE FROM `util.ts` IN 4.30, unchanged, and re-exported from there so
// every existing caller is untouched. It was always directive grammar; it lived
// in `util.ts` for the accident of having been needed by a caller that already
// imported it. This file has no imports at all, which is what lets a pure
// module read a header's title without pulling Obsidian in behind it.

// Parse a `header:` directive body into its level + title. Grammar:
//   `header:<title>`            → level 1 (a top-level section)
//   `header:<1|2>:<title>`      → explicit level (2 = nested, e.g. a journal
//                                 type inside the Journals container)
// `rest` is everything after `header:` (already trimmed). Returns an empty
// title for a bare `header:` (the legacy title-less anchor variant). Used by
// both the widget renderer (to style/size the bar and drive collapse) and the
// home-page section matchers in journal.ts / charts.ts (so a level prefix
// doesn't stop them recognising "📚 Journals" / "📊 Trends and Statistics").
export function parseHeaderDirective(rest: string): {
  level: number;
  title: string;
  // Whether the LEVEL was written, as against defaulted to. 5.12.
  //
  // Nothing needed the difference while every bare `header:` was a section: the
  // grammar's default and the reader's intent were the same answer. They part
  // company the moment a fence carries several heads — see the demotion rule in
  // the block processor, which reads a bare second head as a GROUP inside the
  // first section rather than as a second section touching it. A head written
  // `header:1:` said which level it wanted and keeps it.
  explicit: boolean;
} {
  // Any leading `<digits>:` is a level, CLAMPED to the two that exist.
  //
  // The pattern was `/^([12]):/`, so `header:3:Sources` matched nothing and
  // fell through to the default — rendering a level-1 bar literally titled
  // "3:Sources". A number the grammar doesn't have should not become part of
  // the text; clamping keeps the title clean and the bar somewhere sensible,
  // and is what a reader reaching for a third level meant.
  //
  // Only digits, so a title that legitimately opens with a word and a colon
  // ("Note: read this") is untouched.
  const m = rest.match(/^(\d+):(.*)$/);
  if (!m) return { level: 1, title: rest.trim(), explicit: false };
  return {
    level: Math.min(2, Math.max(1, Number(m[1]))),
    title: m[2].trim(),
    explicit: true,
  };
}

// The level a `header:` line actually renders at: the one it names, or the one
// its POSITION names when it names none. 5.12.
//
// ONE STATEMENT OF THE DEMOTION RULE, and it is here because three places have
// to agree about it: the block processor that draws the bar, the rename offer
// that asks whether a head names a note kind, and the tests that sweep for a
// second level-1 head in a composed fence. A rule about what the reader SEES,
// re-derived in the module that acts on it, is how a control comes to act on a
// head the page is drawing as something else.
//
// `firstInFence` is asked of the TITLED heads only, on `leadingBar`'s rule: an
// untitled `header:` is a control strip under a markdown heading, it opens no
// section, and counting it would demote the first head that does.
export function headerLevel(rest: string, firstInFence: boolean): number {
  const parsed = parseHeaderDirective(rest);
  return parsed.explicit || firstInFence ? parsed.level : 2;
}

// ── EVERY KEYWORD THAT MODIFIES A BLOCK RATHER THAN BEING ONE (4.70) ─────
//
// The five (six, with `header:`) lines a fence can carry that draw nothing:
// they say something about the block, or about the page, and the dispatcher
// drops each of them from the loop before it reaches a widget's `case`.
//
// WHY IT IS A SET AND NOT SIX PREDICATES. Each `is*Line` answers "is THIS line
// that modifier", which is the right question inside the dispatcher, where the
// answer decides whether to keep walking. The other callers ask the opposite
// question — "which of these keywords are directives" — and were each writing
// their own partial list to do it. `assetUnits` had exactly one entry in its
// (`header`), which was complete when it was written and silently wrong from
// 4.1 onward: a `frame:` or a `row` line read as a widget the note was missing,
// and the reconciler would splice one in.
//
// KEYWORDS, NOT LINES, because that is what the callers hold: `Segment.keywords`
// is the parsed list a fence declares, and asking it about a keyword avoids
// reconstructing a line to hand to a predicate.
export const MODIFIER_KEYWORDS: ReadonlySet<string> = new Set([
  HEADER_KEYWORD,
  FRAME_KEYWORD,
  ROW_KEYWORD,
  CELL_KEYWORD,
  WIDE_KEYWORD,
  TAB_KEYWORD,
  HEIGHT_KEYWORD,
]);

// ── CUTTING ONE CELL OUT OF A ROW FENCE (4.70) ───────────────────────────
//
// THREE CATALOGUES ASK THIS AND THE FOURTH ASKS IT DIFFERENTLY. A diary
// dashboard, a journal template and (through `cutFromRun`) anything else that
// composes a row has to be able to remove ONE of a fence's cells and leave the
// rest exactly as the reader has them. A flat note does not use this: its parser
// records which LINE each section sits on, so it cuts by index and this would be
// re-deriving an answer it already has.
//
// BY KEYWORD, NOT BY LINE TEXT. A directive carries the reader's own argument —
// `tasks-table:Projects,period` where the composer wrote `tasks-table:,period` —
// so matching the composed string would refuse to cut exactly the fences
// somebody had configured. The keyword is what a `locate` matches on and what
// the section actually owns.
//
// A KEYWORD A SURVIVOR ALSO WRITES IS SPARED, which is what `spare` is for. Only
// the cell that opens a row composes the bar, so in every arrangement a
// catalogue makes this is empty — but a reader who added a second `header:` by
// hand must not lose it to a removal somewhere else in the same fence.
//
// AND THE `row` LINE GOES WITH THE SECOND-TO-LAST CELL, which is `rowRuns`' own
// rule read backwards: a run of one composes no `row` line, so a fence that has
// just become a run of one must not keep the one it has. Left behind it renders
// as a full-width block — so it LOOKS right — and then reappears in the section
// editor as a group over a section that is grouped with nothing.
//
// NULL WHERE THERE IS NOTHING TO CUT, so a caller can tell "I removed lines"
// from "I found none of them" and keep the block whole rather than rewrite it
// into the same bytes.
export function cutFromFence(
  lines: readonly string[],
  cutting: ReadonlySet<string>,
  spare: ReadonlySet<string>,
  // The bar the survivor puts on if the cut leaves it alone and barless. See
  // `soloBar`; the caller supplies it because only a catalogue knows the
  // wording, and only when exactly one cell is left to wear it.
  bar?: string
): string[] | null {
  const take = [...cutting].filter((k) => !spare.has(k));
  if (!take.length) return null;
  const takeSet = new Set(take);
  const out = lines.filter(
    (l) => !takeSet.has(splitDirective(l.trim()).keyword)
  );
  if (out.length === lines.length) return null;
  return undoRowOfOne(out, bar);
}

// A fence body with its `row` and `cell` lines dropped when it holds fewer than
// two widgets. See `cutFromFence` for the argument; this is separate because the
// flat-note reconciler cuts by line index and still needs the same tidy-up.
//
// `bar` IS THE TITLE THE SURVIVOR PUTS ON, and it is the other half of undoing a
// row — see `soloBar` directly below for why a cell that has lost its row needs
// one at all. Absent for a caller that has no survivor to name, which is every
// caller that is not undoing a removal.
export function undoRowOfOne(
  lines: readonly string[],
  bar?: string
): string[] {
  const widgets = lines.filter((l) => {
    const t = l.trim();
    if (!t || t.startsWith("```")) return false;
    return !MODIFIER_KEYWORDS.has(splitDirective(t).keyword);
  }).length;
  if (widgets > 1) return [...lines];
  return soloBar(
    lines.filter(
      (l) =>
        !isRowLine(l.trim()) &&
        !isCellLine(l.trim()) &&
        !isTabLine(l.trim())
    ),
    bar
  );
}

// ── THE TITLE A CELL WEARS ONCE ITS ROW IS DOWN TO IT ALONE (5.9) ────────
//
// A row carries exactly one bar, worded for the band and composed by the cell
// that OPENS it — `JournalSection.row` states that rule in full, and the cells
// after the opener therefore compose no title of their own. Every catalogue in
// this plugin has a pair built that way: `review` opens "🔁 Due and open" and
// `tasks-table` follows it barless, `on-this-day` opens "🕘 Looking back" and
// `sleep-summary` follows, and so on for four more.
//
// WHICH IS RIGHT UNTIL THE OPENER IS NOT THERE. Every one of those openers is
// freely removable, and `undoRowOfOne` already knows what happens next: the
// `row` line goes, the fence falls to a single widget — and that widget has no
// bar, because the section that was going to title it has been taken off the
// page. The result renders as a bordered box of content with nothing above it,
// which is the one shape on these pages that reads as an unfinished widget
// rather than as a section. Both composition and reconciliation reach it, so it
// is reachable by unticking the opener OR by composing a page without it.
//
// NEVER OVERWRITES A BAR THAT IS ALREADY THERE, and that is what makes this
// safe to hand to any cell. The opener going solo keeps the band's wording — a
// title that is a shade broad is not the defect — and a reader who titled the
// fence by hand keeps what they typed. It only fills a gap.
// ABOVE THE FIRST LINE THAT IS CONTENT, which is not always index 0: the
// reconciler hands whole fences here, markers included, and a `header:` written
// outside the ``` is not a directive at all. Blank lines are skipped for the
// same reason a composed bar leads its fence — the title goes at the top of what
// the block draws.
export function soloBar(
  lines: readonly string[],
  bar: string | undefined
): string[] {
  // `isSectionFence` RATHER THAN `hasSectionBar`, so a fence that titles itself
  // through `frame: section` is left alone too. A `header:` added under one is
  // the contradiction `parseFrame` already refuses, and this must not be the
  // thing that writes it.
  if (!bar || isSectionFence(lines)) return [...lines];
  return insertBar(lines, bar);
}

// The splice `soloBar` performs, without the policy that decides whether to.
//
// SEPARATED IN 5.12, when a second caller needed the placement and not the
// gate. A fence of GROUP heads — the deepest index's, one `header:2:` per note
// kind — answers `isSectionFence` yes, because it is full of headers, and is
// nonetheless missing the one bar that names the section they sit in. Only the
// catalogue can tell that fence from a titled one (it is the one that knows how
// many groups the section has), so the gate lives there and the placement lives
// here rather than being written a second time beside it.
//
// ABOVE THE FIRST LINE THAT IS CONTENT, which is `soloBar`'s rule and is the
// half both callers share: the reconciler hands whole fences here, markers
// included, so index 0 is usually the ``` and never the title's place.
export function insertBar(lines: readonly string[], bar: string): string[] {
  const at = lines.findIndex((l) => {
    const t = l.trim();
    return t !== "" && !t.startsWith("```");
  });
  const out = [...lines];
  out.splice(at < 0 ? out.length : at, 0, bar);
  return out;
}

// Every titled `header:` line in a fence, in file order.
//
// TITLED ONLY, on `leadingBar`'s rule and for its reason: an untitled `header:`
// is a control strip anchored under a real markdown heading, it names nothing,
// and a count of section heads that included it would be counting a toolbar.
export function titledHeadersIn(lines: readonly string[]): string[] {
  return lines
    .map((l) => l.trim())
    .filter((t) => isHeaderLine(t) && splitDirective(t).argument.trim() !== "");
}

// The title a section would open with, if it opens with one at all.
//
// ── WHY THIS IS ASKED OF THE RENDER (5.10) ──────────────────────────────
//
// A section that composes `header:🏷️ Tags` above its widget has DECLARED that
// title; a note on disk holding the same fence with no bar in it is behind the
// catalogue rather than deliberately bare. Reading the answer off what the
// section would compose today means a catalogue entry that gains a bar needs no
// second edit anywhere — and, more usefully, means a section cannot declare one
// title and draw another, which a separate field would allow on the first
// careless copy-paste.
//
// TITLED ONLY. An untitled `header:` is a control strip anchored under a real
// markdown heading (Study, the custom journals); it names nothing, so there is
// nothing to be missing.
export function leadingBar(lines: readonly string[]): string | undefined {
  const first = lines[0]?.trim();
  if (!first || !isHeaderLine(first)) return undefined;
  return splitDirective(first).argument.trim() ? first : undefined;
}

// `soloBar`'s inverse, and the reason remove-then-re-add is still a round trip:
// a cell rejoining its row gives back the title it took on while it stood
// alone, because the cell arriving beside it composes the band's bar again.
//
// MATCHED AGAINST THE DECLARED STRING, not against "any `header:` line". Only
// the line this module put there comes off, so a bar the reader wrote by hand
// or renamed in place is left exactly as they have it — and a fence that never
// went solo is returned unchanged whatever else is in it.
// Whether a fence is the shape `soloBar` fills: content with no title of any
// kind over it, and a catalogue that named one for it.
//
// THE THIRD DOOR'S GATE. Composition and the cut both know they have just made a
// lone cell; a page ALREADY on disk has to be asked, and three reconcilers ask
// it. `isSectionFence` rather than `hasSectionBar`, so a fence the reader
// titled themselves — under any wording, or through `frame: section` — answers
// yes and is left exactly as they have it.
export function needsSoloBar(
  lines: readonly string[],
  bar: string | undefined
): boolean {
  return bar !== undefined && !isSectionFence(lines);
}

export function dropSoloBar(
  lines: readonly string[],
  bar: string | undefined
): string[] {
  if (!bar) return [...lines];
  const at = lines.findIndex((l) => l.trim() === bar);
  return at < 0 ? [...lines] : lines.filter((_, i) => i !== at);
}
