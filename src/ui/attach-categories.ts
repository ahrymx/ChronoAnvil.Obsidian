// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A Resources section's CATEGORIES, as a model.
//
// `attachments.ts` is the model of one attachment — a line inside a region.
// This is the model of the SHELVES those regions belong to: an
// `attach:<key>|<Label>` line inside the section's fence, paired with a
// `<!--chronoanvil:<key> … -->` region below it holding what the reader dropped
// on it. Two files in a note, one category.
//
// WHY A MODEL AT ALL, when 3.18 and 3.19.2 managed with two async functions in
// the widget. Those were one edit each — append a shelf, remove an empty one —
// and each read the file, did its splice and wrote it back. 1.0.49's categories
// window is a DRAFT: a reader renames two, removes one and adds one, and
// presses Save once. Three separate writes would give three undo steps, three
// chances to half-apply, and a cancelling pair (remove `books`, add `Books`)
// that lands as two writes in whichever order the promises resolved.
//
// So the window hands back the list it is SHOWING and this module works out the
// difference. That is also what keeps the two guards honest, and they are the
// whole reason this is not a `lines.map`:
//
//   • A CATEGORY WITH ANYTHING IN IT CANNOT GO. Its region is where the
//     reader's files and links live, and unlike removing a note kind — which
//     leaves the markdown alone and merely stops recognising it — there is
//     nothing left behind here to recover from. The window only offers the
//     control on an empty one; this checks AGAIN, against the file as it is at
//     the moment of the write, because the window may have sat open while a
//     drop landed. That race is why the diff is computed here rather than in
//     the window.
//   • THE LAST CATEGORY STAYS. A Resources section with no `attach:` line
//     renders an empty header with no way back into it. Removing the section
//     itself is the section editor's job and the refusal says so.
//
// Pure string→string, so the whole of it unit-tests without a vault; the file
// read and write live in `attachment-widgets.ts`.

import { slugify } from "../core/util";
import { splitArgHead, splitDirective } from "../core/directive-grammar";
import {
  readNoteRegion,
  regionHasContent,
  regionLineSpan,
} from "../core/notestore";
import { parseAttachments } from "./attachments";

// ── WHAT SHAPE A CATEGORY DRAWS WHAT IS IN IT (1.0.49 §6) ───────────────
//
// *"now implement format options into the category editor for different ways to
// render the documents/links/images. I'm thinking default (kitchen sink, how it
// is now), image gallery (makes image previews larger), ordered lists (good for
// links)."*
//
// §5 gave a new entry two categories named for two kinds of content — **Files
// & Links** and **Images** — and both drew them the same way: every image
// hoisted into a 120px grid, everything else in a wrapping row of chips. A
// shelf called Images wants its previews bigger; a shelf of links wants to read
// as a list. So the shelf's SHAPE is a property of the category now.
//
// ONE LIST, FIVE DERIVATIONS: the token a format writes, the token a read
// recognises, the class the zone wears, the button's icon and its two
// sentences. Every one of them is a field here rather than a `switch` somewhere
// — a fourth format is a row in this array and nothing else.
//
// `default` WRITES NOTHING, which is the whole reason the token grammar is the
// storage. Every `attach:` line in every vault means `default` already, so
// nothing is migrated and no composed template changes a byte; a format only
// appears in a note where a reader asked for one.
export type AttachFormat = "default" | "gallery" | "list";

export const ATTACH_FORMATS: readonly {
  value: AttachFormat;
  // The `#token` on the category's own line. `null` for the shape that is
  // written by the absence of the others.
  token: string | null;
  // The `is-` class the drop zone wears, or `null` for the unstyled default.
  // Here rather than composed from `value` so the stylesheet's selector and
  // the test that reads it both come off this declaration.
  cls: string | null;
  label: string;
  hint: string;
  icon: string;
  // WHETHER THIS SHAPE IS ONLY OFFERED TO A CATEGORY OF IMAGES. The reader's
  // call: *"check if any files/links other than images are in the category
  // before gallery view can be enabled."* See `offeredFormats`.
  imagesOnly?: true;
}[] = [
  {
    value: "default",
    token: null,
    cls: null,
    label: "Default",
    hint: "Images as thumbnails, everything else as chips",
    icon: "layout-grid",
  },
  {
    value: "gallery",
    token: "gallery",
    cls: "is-gallery",
    label: "Image gallery",
    hint: "Larger image previews",
    icon: "image",
    imagesOnly: true,
  },
  {
    value: "list",
    token: "list",
    cls: "is-list",
    label: "Ordered list",
    hint: "One numbered row per item, no previews",
    icon: "list-ordered",
  },
];

const FORMAT_TOKENS = new Set(
  ATTACH_FORMATS.flatMap((f) => (f.token ? [f.token] : []))
);

// The format a category's flags select.
//
// TOKENS RATHER THAN A LINE, because every caller already has them: the window
// reads them off `AttachCategory`, the renderer off `splitArgHead(rest)`. And
// an UNKNOWN FLAG IS IGNORED rather than refused — the grammar's rule
// (`directive-grammar.ts`) — so `attach:attachments#widget#gallery` is a
// gallery and `#widget` still means what it means, in either order.
//
// TWO FORMAT TOKENS ON ONE LINE: the first in this list wins, so the answer is
// this module's rather than the line's accident. `withAttachFormat` cannot
// write that line, but a hand-edited note can hold it.
export function attachFormatOf(tokens: readonly string[]): AttachFormat {
  for (const f of ATTACH_FORMATS) {
    if (f.token && tokens.includes(f.token)) return f.value;
  }
  return "default";
}

// The same flags with this format selected instead.
//
// EVERY OTHER FLAG STAYS, AND IN ITS OWN PLACE. `#widget` on the first category
// of a diary entry is the form answer the section editor wrote, and a Save in
// the Categories window must not be the thing that erases it — which is the
// defect at the top of this file in reverse. The grammar says it too: "a flag a
// later release adds survives this one".
export function withAttachFormat(
  tokens: readonly string[],
  format: AttachFormat
): string[] {
  const want = ATTACH_FORMATS.find((f) => f.value === format);
  // A FORMAT THIS RELEASE DOES NOT KNOW LEAVES THE FLAGS ALONE, which is the
  // carry-through rule pointed the other way: a caller with no opinion — a
  // row composed before this field existed, a value from a later release read
  // back by an earlier one — must not be the thing that erases the answer in
  // the note. The alternative is a row that silently means `default`, and
  // `default` is the one answer that writes by deleting.
  if (!want) return [...tokens];
  const kept = tokens.filter((t) => !FORMAT_TOKENS.has(t));
  return want.token ? [...kept, want.token] : kept;
}

// Which formats a category may be put into, in the cycle's order.
//
// THE GATE IS THE READER'S, and it is about what the shape PROMISES: a format
// called *Image gallery* on a shelf of PDFs is a bigger grid with nothing in
// it. So `imagesOnly` is withheld from a category holding anything that is not
// an image.
//
// EXCEPT THE ONE IT IS ALREADY IN, which is what keeps the cycle reversible. A
// reader sets a shelf to gallery, then drops a PDF on it; the shelf draws that
// PDF as a chip under the grid (nothing is ever hidden), and the next time the
// window opens, gallery is still on the list — because a cycle that cannot
// offer the current answer is a control that changes something the moment it is
// pressed and can never put it back.
export function offeredFormats(
  current: AttachFormat,
  others: number
): AttachFormat[] {
  return ATTACH_FORMATS.filter(
    (f) => !f.imagesOnly || others === 0 || f.value === current
  ).map((f) => f.value);
}

// The next format the button offers. One press, one step, wrapping at the end.
export function nextAttachFormat(
  current: AttachFormat,
  others: number
): AttachFormat {
  const offered = offeredFormats(current, others);
  const at = offered.indexOf(current);
  // A format the gate does not offer and that is not the current one cannot
  // happen — `offeredFormats` always includes `current` — but a caller holding
  // a stale row would otherwise get `offered[0]` twice in a row from -1 + 1.
  return offered[(at + 1) % offered.length];
}

// A category as the note has it.
//
// `tokens` AND `tail` ARE CARRIED, NOT INTERPRETED (1.0.49 §6). This module
// rewrites the whole `attach:` run on every save — `applyAttachCategories` says
// why — so anything on one of those lines that is not read here is dropped
// unless it is held. The format is read off `tokens` by `attachFormatOf` rather
// than stored beside them, so there is one answer and not two.
export interface AttachCategory {
  key: string;
  label: string;
  tokens: readonly string[];
  tail: string;
}

// A row of the window's list. `key` is null for one the reader has just typed —
// it has no storage yet, and the key it gets is this module's to choose.
//
// `format` IS REQUIRED AND NOT OPTIONAL (1.0.49 §6). The window draws a control
// for it on every row, so it always has an answer — and a field whose absence
// is itself an answer is the mistake `entry-widget-toggle-1-0-42` records: it
// costs the field its name, and nothing can then tell "the reader chose the
// default" from "this caller did not say".
export interface AttachCategoryRow {
  key: string | null;
  label: string;
  format: AttachFormat;
}

// What a save would do to the file.
//
// `kept` and `floor` are the two refusals, carried out rather than thrown: a
// save that renames two categories and is refused one removal should land the
// renames and say what it did not do. Both are reported to the reader by the
// caller, which is the half of this that needs a `Notice`.
export interface AttachCategoryPlan {
  // THE DIRECTIVE RUN AS IT SHOULD READ AFTERWARDS, in the reader's order and
  // with every label already final (1.0.49). It is the only thing the write
  // needs for the half of the file that lives inside the fence — the four
  // lists below describe what a save MEANS, and this describes what it writes.
  //
  // WHY ORDER IS THE PLAN'S AND NOT A FIFTH LIST. Renaming, adding and removing
  // can each be stated as an edit to one line; reordering cannot — moving one
  // category moves every category between it and where it landed, so a list of
  // moves is a list that has to be replayed in order against a file that is
  // shifting under it. Stating the ANSWER instead makes the write a single
  // assignment per slot and makes a reorder cost exactly what a rename costs.
  order: AttachCategory[];
  renames: AttachCategory[];
  removes: AttachCategory[];
  adds: AttachCategory[];
  // Categories whose FLAGS come out different — a format the reader changed
  // (1.0.49 §6). Its own list for the same reason `renames` has one: `order`
  // differs from the file whenever anything at all changed, and the write's
  // "is there anything to do" question needs the narrow answer. On `renames`'
  // rule too — a format equal to the one the line already carries is not a
  // change, so opening this window and pressing Save writes no bytes.
  formats: AttachCategory[];
  kept: (AttachCategory & { items: number })[];
  // Whether the surviving categories come out in a different order than the
  // file has them. Carried separately from `order` because `order` differs
  // from the file whenever ANYTHING changed, and the write's "is there
  // anything to do" question needs the narrow answer.
  moved: boolean;
  floor: boolean;
}

const DIRECTIVE = /^\s*attach:/;

// Every category in a note's Resources fence, in document order.
//
// THE WHOLE FILE, NOT ONE FENCE, which is the behaviour `addAttachCategory` has
// had since 3.18 — it appended after the last `attach:` line in the note — and
// is kept rather than extended. A note with two separate Resources sections
// would see them as one list. That is a limitation to fix in the renderer, where
// a fence is a thing with boundaries; fixing it here would mean this module
// deciding what a fence is, and the two answers would then disagree.
// THROUGH THE GRAMMAR, AS OF 1.0.49 §6, AND THIS WAS A DEFECT. The parse was a
// `|` split with everything before it as the key, which is right up to the
// moment a `#token` appears on the head — and one already did: a diary entry
// whose Attachments is drawn as a widget carries
// `attach:attachments#widget|Files & Links`, written by the form toggle. For
// that entry this read answered `attachments#widget`, and every question asked
// of that key was asked about a region nothing writes. Measured, before the
// fix: the first category reported `empty` with an invoice in it, so the ✕
// beside it went live, and the save deleted its directive line and left the
// region orphaned below the fence — the files still in the note and no shelf
// left to reach them.
//
// `splitDirective` then `splitArgHead` is the one parse the rest of the plugin
// uses (`noteKeyOf` is the same read under the store's name), so there is no
// second definition of what a key is to drift.
export function readAttachCategories(text: string): AttachCategory[] {
  const out: AttachCategory[] = [];
  for (const line of text.split("\n")) {
    if (!DIRECTIVE.test(line)) continue;
    const { argument, label } = splitDirective(line.trim());
    const { key, tokens, tail } = splitArgHead(argument);
    if (!key) continue;
    out.push({ key, label: label?.trim() || key, tokens, tail });
  }
  return out;
}

// A label the directive line can hold, or null if there is nothing usable in it.
//
// `|` IS THE SEPARATOR, so a label carrying one would be read back as a shorter
// label — "Books|Films" becomes "Books" on the next render and the rest is lost
// without a message. It is dropped rather than escaped: there is no escape in
// this one-line format, inventing one would have to reach every reader of it,
// and a reader typing a pipe into a category name has not asked for anything.
// Backticks go with it, for the fence they could close.
export function normaliseCategoryLabel(raw: string): string | null {
  const clean = raw.replace(/[|`]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  // The same test the key has to pass: a name made only of punctuation
  // slugifies to nothing, and a category with no key has nowhere to store what
  // is dropped on it.
  if (!slugify(clean)) return null;
  return clean;
}

// The key for a new category: slugified, de-duplicated against `taken`.
//
// TWO CATEGORIES NAMED "Books" IS TWO CATEGORIES — a reader who does that wants
// two, not an error — so a collision suffixes rather than refuses. The same
// repair every other id in this plugin gets.
//
// AND IT CANNOT FAIL, which is why it returns a string where `addAttachCategory`
// returned through an `isValidNoteKey` gate and a Notice. `slugify`'s output
// alphabet IS the key grammar — `[a-z0-9-]` either side — so that gate could
// not reject anything this function can produce, and a branch no input reaches
// is one clause pretending to be two. What CAN break is the two definitions
// drifting apart, and a check here would not notice: `test/attach-categories`
// runs the nastiest labels it can through both and is the test that bites.
export function newCategoryKey(label: string, taken: Set<string>): string {
  const stem = slugify(label) || "resources";
  let key = stem;
  let n = 2;
  while (taken.has(key)) key = `${stem}-${n++}`;
  return key;
}

// What the window's list means for this file. Null when there is no Resources
// fence to edit — no `attach:` line, or one with no fence close after it.
export function planAttachCategories(
  text: string,
  rows: readonly AttachCategoryRow[]
): AttachCategoryPlan | null {
  const lines = text.split("\n");
  const anchors = fenceAnchors(lines);
  if (!anchors) return null;

  const present = readAttachCategories(text);
  const live = new Map(present.map((c) => [c.key, c.label]));
  // The flags each surviving category's line carries, so a save puts back the
  // ones it did not come to change (1.0.49 §6).
  const flags = new Map(present.map((c) => [c.key, c] as const));
  // Which existing categories the window is still showing. A row naming a key
  // the file no longer has needs no filtering HERE — it can never equal a key
  // in `present`, so it cannot save one from removal — and is dropped by the
  // rename loop below, which is where it would otherwise be visible.
  const asked = new Set(
    rows.flatMap((r) => (r.key == null ? [] : [r.key]))
  );

  const removes: AttachCategory[] = [];
  const kept: (AttachCategory & { items: number })[] = [];
  for (const cat of present) {
    if (asked.has(cat.key)) continue;
    if (regionHasContent(text, cat.key)) {
      kept.push({ ...cat, items: categoryItemCount(text, cat.key) });
      continue;
    }
    removes.push(cat);
  }

  const renames: AttachCategory[] = [];
  for (const row of rows) {
    if (row.key == null) continue;
    // THE FILE IS THE AUTHORITY ON WHAT EXISTS. The window may have been open
    // while the note changed under it, so a row naming a category that is no
    // longer there is dropped rather than re-added — a directive with no region
    // behind it is a shelf that cannot store anything.
    const was = live.get(row.key);
    if (was == null) continue;
    const label = normaliseCategoryLabel(row.label);
    // A rename to nothing usable keeps the old name rather than dropping it —
    // the tags window's rule, and the same reasoning: silently losing a name
    // the reader meant to keep is the failure worth avoiding. A rename to the
    // name it already has is not a rename, so a reader who opens the window and
    // presses Save does not get a modified note in their sync history.
    if (label == null || label === was) continue;
    renames.push({ ...(flags.get(row.key) as AttachCategory), label });
  }

  // ── WHAT THE FORMAT CONTROL CHANGED (1.0.49 §6) ────────────────────────
  //
  // `renames`' pass, one question over: the file is the authority on what
  // exists, a row naming a category that is gone is dropped, and a format equal
  // to the one the line already carries is not a change.
  const formats: AttachCategory[] = [];
  for (const row of rows) {
    if (row.key == null) continue;
    const was = flags.get(row.key);
    if (!was) continue;
    const tokens = withAttachFormat(was.tokens, row.format);
    if (tokens.join("#") === was.tokens.join("#")) continue;
    formats.push({ ...was, tokens });
  }

  const taken = new Set(present.map((c) => c.key));
  const adds: AttachCategory[] = [];
  for (const row of rows) {
    if (row.key != null) continue;
    const label = normaliseCategoryLabel(row.label);
    if (label == null) continue;
    const key = newCategoryKey(label, taken);
    taken.add(key);
    adds.push({
      key,
      label,
      tokens: withAttachFormat([], row.format),
      tail: "",
    });
  }

  // THE FLOOR, and it abandons every removal rather than keeping an arbitrary
  // one. Which category a reader would have wanted left behind is not a
  // question this can answer, and picking the first would leave them looking at
  // a list they did not ask for.
  let floor = false;
  if (present.length - removes.length + adds.length < 1) {
    floor = true;
    removes.length = 0;
  }

  // ── THE ORDER THE SAVE WRITES (1.0.49) ─────────────────────────────────
  //
  // BUILT AFTER THE FLOOR, because the floor can put a removal back and a
  // category that is staying has to be somewhere in the run.
  const gone = new Set(removes.map((c) => c.key));
  // Every surviving key's label after this save: what the file has, with the
  // renames laid over it. Read rather than recomputed, so a rename and a move
  // in one save cannot disagree about the name.
  const labelOf = new Map(present.map((c) => [c.key, c.label]));
  for (const rename of renames) labelOf.set(rename.key, rename.label);
  // And the same for the flags, which `formats` has already decided. Read
  // rather than recomputed, for the reason the labels are: a format change and
  // a move in one save must not disagree about what the line says.
  const tokensOf = new Map(present.map((c) => [c.key, c.tokens]));
  for (const f of formats) tokensOf.set(f.key, f.tokens);

  const order: AttachCategory[] = [];
  const placed = new Set<string>();
  let nextAdd = 0;
  for (const row of rows) {
    if (row.key == null) {
      // The adds were produced from the same rows in the same pass order, so
      // the n-th keyless row is the n-th add — except for rows whose label was
      // unusable, which produced none and are skipped here by the same test.
      if (normaliseCategoryLabel(row.label) == null) continue;
      order.push(adds[nextAdd++]);
      continue;
    }
    // A row naming a key the file no longer has, a duplicate row, or one the
    // save is removing: the window's picture is not the authority on what
    // EXISTS, only on where things go.
    const label = labelOf.get(row.key);
    if (label == null || placed.has(row.key) || gone.has(row.key)) continue;
    order.push({
      key: row.key,
      label,
      tokens: tokensOf.get(row.key) ?? [],
      tail: flags.get(row.key)?.tail ?? "",
    });
    placed.add(row.key);
  }

  // A CATEGORY THE WINDOW DROPPED AND THE SAVE KEPT GOES BACK WHERE IT WAS,
  // not on the end. Both refusals land here — a non-empty category and the
  // floor — and a reader who was told "that one isn't empty any more" should
  // find it in the place they have been reading it, not shuffled to the
  // bottom as a side effect of a removal that did not happen.
  for (const cat of present) {
    // `gone` as well as `placed`: a category the save IS removing was skipped
    // by the rows pass on purpose and must not be put back by this one.
    if (placed.has(cat.key) || gone.has(cat.key)) continue;
    let at = 0;
    for (let i = present.indexOf(cat) - 1; i >= 0; i--) {
      const j = order.findIndex((c) => c.key === present[i].key);
      if (j !== -1) {
        at = j + 1;
        break;
      }
    }
    order.splice(at, 0, {
      ...cat,
      label: labelOf.get(cat.key) ?? cat.label,
      tokens: tokensOf.get(cat.key) ?? cat.tokens,
    });
    placed.add(cat.key);
  }

  // THE NARROW QUESTION: do the categories the file already has come out in a
  // different sequence? Adds and removes change `order` on their own and are
  // already reported by their own lists, so they are taken out of both sides.
  const added = new Set(adds.map((c) => c.key));
  const moved =
    order
      .filter((c) => !added.has(c.key))
      .map((c) => c.key)
      .join("\n") !==
    present
      .filter((c) => !gone.has(c.key))
      .map((c) => c.key)
      .join("\n");

  return { order, renames, removes, adds, formats, kept, moved, floor };
}

// Apply a plan. Returns the new text, or the text unchanged when the plan does
// nothing — so a caller can skip the write.
export function applyAttachCategories(
  text: string,
  plan: AttachCategoryPlan
): string {
  if (
    !plan.renames.length &&
    !plan.removes.length &&
    !plan.adds.length &&
    !plan.formats.length &&
    !plan.moved
  ) {
    return text;
  }
  const out = text.split("\n");
  const anchors = fenceAnchors(out);
  if (!anchors) return text;

  // ONE LIST OF SPLICES, APPLIED FROM THE BOTTOM UP. A category owns two lines
  // far apart in the file — a directive inside the fence and a region below it
  // — and a save can be removing three of them while adding two. Splicing as
  // we went would mean every later index was measured against an array that had
  // already moved; sorting by descending position means each splice only ever
  // touches lines nothing left to do is measured against.
  const ops: { at: number; del: number; ins: string[] }[] = [];

  for (const cat of plan.removes) {
    const span = regionLineSpan(out, cat.key);
    if (!span) continue;
    let from = span.from;
    // The blank line `adds` writes with a region, so adding and removing a
    // category leaves the file as it found it rather than gaining a blank
    // line per cycle.
    if (from > 0 && out[from - 1].trim() === "") from--;
    ops.push({ at: from, del: span.to - from + 1, ins: [] });
  }

  if (plan.adds.length) {
    ops.push({
      at: anchors.close + 1,
      del: 0,
      ins: plan.adds.flatMap((c) => ["", `<!--chronoanvil:${c.key}`, "-->"]),
    });
  }

  // ── THE DIRECTIVE RUN IS WRITTEN AS A RUN (1.0.49) ───────────────────
  //
  // It used to be three kinds of edit: a rename replaced its own line in
  // place, a removal deleted its own line, an add appended after the last one.
  // Reordering cannot be said that way — moving one category moves every
  // category it passes — so the run became the unit instead, and the other
  // three fell out of it: `plan.order` already carries the final labels, the
  // final membership and the final sequence.
  //
  // INTO THE SLOTS THE FILE ALREADY HAS. The `attach:` lines of an entry band
  // are not contiguous — `note:log` and `tasks:` sit between them — so the run
  // is a list of POSITIONS, not a span. Each position takes the n-th category;
  // a longer list spills in after the last position, a shorter one leaves the
  // leftovers to be deleted. Nothing else in the fence moves.
  //
  // THE INDENT IS THE SLOT'S OWN, because a fence inside a callout or a list
  // item carries one and a rewritten line that loses it leaves the fence.
  const slots: number[] = [];
  for (let i = 0; i < out.length; i++) if (DIRECTIVE.test(out[i])) slots.push(i);
  const indentOf = (at: number): string => /^\s*/.exec(out[at])?.[0] ?? "";
  // THE FLAGS AND THE ARGUMENT TAIL GO BACK ON (1.0.49 §6). This line is
  // rewritten from the model on every save, so everything the line said that
  // this module does not read has to be carried through `AttachCategory` and
  // put back here — a `#widget` the section editor wrote, a flag a later
  // release adds, and a `:tail` nothing reads today.
  const written = (cat: AttachCategory, at: number): string =>
    `${indentOf(at)}attach:${[cat.key, ...cat.tokens].join("#")}${cat.tail}|${
      cat.label
    }`;
  const shared = Math.min(slots.length, plan.order.length);
  for (let i = 0; i < shared; i++) {
    const line = written(plan.order[i], slots[i]);
    if (line !== out[slots[i]]) ops.push({ at: slots[i], del: 1, ins: [line] });
  }
  if (plan.order.length > shared && slots.length) {
    ops.push({
      at: slots[slots.length - 1] + 1,
      del: 0,
      ins: plan.order
        .slice(shared)
        .map((cat) => written(cat, slots[slots.length - 1])),
    });
  }
  for (let i = shared; i < slots.length; i++) {
    ops.push({ at: slots[i], del: 1, ins: [] });
  }

  // A DELETION BEFORE AN INSERTION AT THE SAME LINE. The only pair that can
  // collide is a region being removed where the first new one is being written
  // — both at `close + 1`. Deleting first leaves the insertion where the reader
  // would expect it; inserting first would shift the deletion onto the lines it
  // had just written.
  ops.sort((a, b) => b.at - a.at || b.del - a.del);
  for (const op of ops) out.splice(op.at, op.del, ...op.ins);
  return out.join("\n");
}

// The last `attach:` line and the fence close after it. The close is where a new
// category's REGION goes, and the pair together is the proof that there is a
// Resources fence here to edit at all — `null` is what makes a save on a note
// with no such fence a refusal rather than a write into nothing.
//
// `last` IS NO LONGER AN INSERTION POINT (1.0.49). A new directive goes after
// the last `attach:` SLOT, which the run rewrite finds for itself; this pair is
// now the guard and the region anchor. The two numbers are kept together
// because the search for one is the search for the other.
function fenceAnchors(lines: string[]): { last: number; close: number } | null {
  let last = -1;
  for (let i = 0; i < lines.length; i++) {
    if (DIRECTIVE.test(lines[i])) last = i;
  }
  if (last === -1) return null;
  let close = -1;
  for (let i = last; i < lines.length; i++) {
    if (lines[i].trim() === "```") {
      close = i;
      break;
    }
  }
  return close === -1 ? null : { last, close };
}

// `directiveLine` RETIRED (1.0.49). It found one category's line so a rename
// could replace it and a removal could delete it, and both of those are now the
// run rewrite above — which addresses lines by POSITION rather than by key,
// because a reorder has no key to look up: every slot can be holding a
// different category than it did.

// How many things a category is holding, for the message that says why it
// cannot go, and for the count the window puts beside each row.
//
// THROUGH `parseAttachments`, which is the number the shelf itself shows. A
// line count would be close and would disagree on exactly the note a reader
// would write in about — a region carrying prose from the days when
// `attachments` was a plain `note:` textarea is ONE free-text attachment, not
// four lines of them.
//
// It is not the emptiness GUARD, and the two are deliberately different
// questions. `regionHasContent` is the one definition of empty in this plugin
// (notestore.ts says so) and whitespace-only counts as empty there, because
// every region ships with a blank line between its markers. This counts what
// the reader would see.
export function categoryItemCount(text: string, key: string): number {
  return parseAttachments(readNoteRegion(text, key)).length;
}

// How many of them are not images, for the gallery gate (1.0.49 §6).
//
// BESIDE THE COUNT AND THROUGH THE SAME PARSE, because the two numbers answer
// to the same list and a second definition of "an image" would be the thing
// that disagreed. `AttachmentKind` is DERIVED from the target by
// `parseAttachments` — the line never stores it — so this is the same question
// the shelf answers when it decides which lane an item goes in.
export function categoryNonImageCount(text: string, key: string): number {
  return parseAttachments(readNoteRegion(text, key)).filter(
    (a) => a.kind !== "image"
  ).length;
}
