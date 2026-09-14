// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.18 follow-ups §4: new entry types should sync live, not on next edit.
//
// `extend` worked in 3.18 and nothing surfaced it, so the reported behaviour —
// "the section must be removed then re-added" — was a reader doing by hand what
// the planner would have done for them. The fix is not a new write path; it is
// a door onto the existing one at the moment the reader is thinking about it.
//
// SO THE TESTS ARE ABOUT TWO THINGS. That the scan finds a stale dashboard and
// says what it would gain (which is what the offer renders), and that applying
// it changes ONLY what the offer named — because an offer that quietly rewrote
// the rest of the note would be worse than the silence it replaces.
//
// ── AND WHAT IT FINDS CHANGED IN 1.0.16 ─────────────────────────────────
//
// *"I think page types can be consolidated on journal index pages."* A journal
// with several note kinds draws ONE table over all of them now, and a table
// that selects rows by frontmatter lists a kind added a minute ago without
// being touched. So on the surface this door was written for — a multi-kind
// journal's dashboards — there is no longer any such thing as a missing table,
// and `extend` has nothing to say.
//
// The promise in `kind-change.ts` is unhedged and unchanged: *"Dashboards will
// offer to list the new type."* What keeps it now is the merge. A reader's index
// notes still carry the per-kind stack every release up to 1.0.15 composed, and
// consolidating it is both the change they asked for and the thing that makes
// the new kind appear. So this door runs `consolidateChildren` first and
// `planSections` second, and these tests are about that pair: what each of the
// two steps has to say on each shape, and that they cannot contradict each
// other about one table.
//
// `extend` ITSELF IS NOT GONE and is still asserted below, on the journal that
// still has a part to be short of: a one-kind type, whose card is bar, button
// and table exactly as 5.11 composed it.

import { describe, expect, it } from "vitest";
import { studyTemplate } from "./study-template";
import { asPerKindTables, perKindStack } from "./legacy-children";
import { readCode } from "./sources";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  buildJournalType,
  freshCustomJournal,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  sectionContext,
  detectSections,
  templateTargets,
} from "../src/journals/journal-sections";
import { applySections, planSections } from "../src/journals/journal-plan";
import { consolidateChildren } from "../src/journals/children-consolidate";

// The deepest Study index, which is the surface `children` renders its table
// on — the one place a new kind could leave a dashboard short.
const ctx = () => sectionContext(STUDY_JOURNAL, { depth: 1 });

// A Topic index as every release up to 1.0.15 wrote it: a head, a create button
// and a table PER NOTE KIND. Produced by ageing the shipped one rather than by
// hand, so it cannot claim a spelling the plugin never composed — see
// `test/legacy-children.ts`.
function legacyTopicIndex(): string {
  return asPerKindTables(studyTemplate("topic-index.md"), STUDY_JOURNAL);
}

// The two steps this door runs, in the order it runs them, with the write taken
// off: consolidate, then plan. Every assertion about what a reader is shown and
// what is written to their note is made through this pair, because the module
// itself needs a vault and these are the only two things in it that decide
// anything.
function scan(text: string): {
  merged: string;
  merge: boolean;
  extend: ReturnType<typeof planSections>;
} {
  const merged = consolidateChildren(text, STUDY_JOURNAL) ?? text;
  const c = ctx();
  return {
    merged,
    merge: merged !== text,
    extend: planSections(merged, c, detectSections(merged, c)).filter(
      (o) => o.kind === "extend"
    ),
  };
}

describe("what the scan finds", () => {
  it("merges a dashboard written before the consolidation", () => {
    const { merge, merged } = scan(legacyTopicIndex());
    expect(merge).toBe(true);
    // THE STRONGEST STATEMENT AVAILABLE: catching up a note written by an older
    // release lands on the shipped Topic index exactly, byte for byte. Anything
    // short of that is a migration drifting from the composer, which no golden
    // can catch because the golden and the composer move together.
    expect(merged).toBe(studyTemplate("topic-index.md"));
  });

  it("reports no missing table on the note it just merged", () => {
    // THE TWO STEPS CANNOT CONTRADICT EACH OTHER, which is why the merge is
    // read first and the plan second — the order the write runs them in. A note
    // whose tables are about to become one is asked about its parts as the
    // consolidated shape, so nothing can be reported as both merged away and
    // missing, and the offer cannot list one table twice.
    expect(scan(legacyTopicIndex()).extend).toEqual([]);
  });

  it("finds nothing at all on a dashboard that is already current", () => {
    // NOTHING TO DO OPENS NOTHING. The common case for a reader who adds a kind
    // to a journal whose dashboards this release wrote, and the case that would
    // otherwise train them to dismiss the window unread.
    const { merge, extend } = scan(studyTemplate("topic-index.md"));
    expect(merge).toBe(false);
    expect(extend).toEqual([]);
  });

  it("plans no extend on the old shape either, which is why the merge is the offer", () => {
    // THE GAP THE MERGE FILLS, stated as the plan's own answer. The per-kind
    // fence is still attributed to `children` — `superseded` in the catalogue is
    // what keeps that true, and `journal-groups.test.ts` is where it is pinned —
    // so the section is present and short of nothing the catalogue declares.
    // A reader adding a third note type to a journal whose notes carry the 5.12
    // stack would be told nothing whatever without the step above.
    const legacy = legacyTopicIndex();
    const c = ctx();
    const ops = planSections(legacy, c, detectSections(legacy, c));
    expect(ops.find((o) => o.sectionId === "children")?.kind).toBe("keep");
  });

  it("offers a one-kind journal nothing, because it has nothing to merge", () => {
    // A type with ONE note kind composes what it always composed — bar, button,
    // table — and `consolidateChildren` refuses it outright rather than
    // retitling a card that is correctly named after the only thing in it.
    //
    // AND THE `extend` ARM IS NOT REACHABLE FROM THIS DOOR ANY MORE, which is
    // worth stating where a reader will look for it. `want` here is
    // `detectSections`, and `children`'s probe IS its table: a one-kind card
    // short of its table is short of the thing that makes the section findable,
    // so the planner is never asked about it. A multi-kind card has no per-kind
    // part to be short of at all. The op and its write path are live and tested
    // on the surface that can still produce one — `journal-plan.test.ts`, where
    // `want` is the block model's answer rather than a probe's — and the filter
    // below stays because it is what keeps this door to insert-only work if a
    // catalogue ever grows a second part again.
    const plain = buildJournalType(freshCustomJournal(new Set()));
    const target = templateTargets(plain).find((t) => t.key === "index:0")!;
    const text = journalTemplateFiles(plain).find(
      (f) => f.name === target.file
    )!.content;
    expect(consolidateChildren(text, plain)).toBeNull();
    const ops = planSections(text, target.ctx, detectSections(text, target.ctx));
    expect(ops.filter((o) => o.kind === "extend")).toEqual([]);
  });

  it("never plans an add, remove or move", () => {
    // The property that makes this safe to offer as one all-or-nothing button:
    // `want` is the file's own section list, so there is nothing to add and
    // nothing to take away.
    const merged = scan(legacyTopicIndex()).merged;
    const c = ctx();
    for (const op of planSections(merged, c, detectSections(merged, c))) {
      expect(["keep", "extend"]).toContain(op.kind);
    }
  });
});

describe("what applying it writes", () => {
  const before = legacyTopicIndex();
  const { merged } = scan(before);

  it("replaces the per-type headings and buttons with one of each", () => {
    // The window's own words, asserted as the diff they describe: three heads,
    // three create buttons and three tables become one bar, one create and one
    // table.
    for (const kind of STUDY_JOURNAL.kinds) {
      expect(before).toContain(`kind-table:${kind.id}`);
      expect(merged).not.toContain(`kind-table:${kind.id}`);
      expect(merged).not.toContain(`button:study:new-${kind.id}`);
    }
    expect(merged.split("kind-table").length - 1).toBe(1);
    expect(merged).toContain("button:study:new");
  });

  it("leaves every line outside the card exactly where it was", () => {
    // NOTHING ELSE ON THE NOTE IS TOUCHED — the offer's other sentence, and the
    // reason a reader can accept this over a dashboard they have edited. The
    // card is welded into the banner's fence (5.28), so "outside" here includes
    // the stack dividers and the tracker grid above it as well as the sections
    // below.
    // The card's own lines, both spellings of them, derived from the same
    // helper that composed the fixture rather than typed out here — six lines
    // in, two out, and everything else has to be equal.
    const cardLines = new Set([
      ...perKindStack(STUDY_JOURNAL),
      "button:study:new",
      "kind-table",
    ]);
    const kept = (text: string): string[] =>
      text
        .split("\n")
        .filter((l) => !cardLines.has(l.trim()));
    expect(kept(merged)).toEqual(kept(before));
  });

  it("does not append a second copy of the whole section", () => {
    // The failure `extend` exists to avoid, and the one the consolidation could
    // have re-introduced wholesale: a fence the parser cannot attribute reads as
    // ABSENT, and the next write appends a duplicate card beside it.
    expect(merged.split("What's below").length - 1).toBe(1);
    expect(applySections(merged, ctx(), detectSections(merged, ctx()))).toBeNull();
  });

  it("is a no-op on a dashboard that is already current", () => {
    const current = studyTemplate("topic-index.md");
    const c = ctx();
    expect(consolidateChildren(current, STUDY_JOURNAL)).toBeNull();
    expect(applySections(current, c, detectSections(current, c))).toBeNull();
  });

  it("is a no-op the second time it runs", () => {
    expect(consolidateChildren(merged, STUDY_JOURNAL)).toBeNull();
  });
});

describe("where the offer is made", () => {
  const settings = () => readCode("settings-editors");
  // The window's own source. It was `settings-editors`' until 1.1; see the
  // test below for why it moved.
  const offer = () => readCode("dashboard-catchup");

  it("only after a kind was ADDED", () => {
    // A rename or a removal cannot leave a dashboard short, so offering after
    // one would be a window that appears to say there is nothing to confirm.
    //
    // AND ONLY A KIND, SINCE THE SAME WINDOW STARTED COVERING FOLDER DEPTH.
    // `findDashboardCatchups` looks for an index note that does not list a note
    // type it should. A level added opens a different gap entirely — the notes
    // that were the deepest indexes now need a folder table where they have a
    // note table — and half-answering that here would leave a shape neither the
    // reader nor `previewRepair` expects.
    expect(settings()).toContain(
      'changes.some((c) => c.subject === "kind" && c.kind === "added")'
    );
  });

  it("after the save, so the plan sees the kinds just added", () => {
    const src = settings();
    const save = src.indexOf("await this.onSave(this.draft)");
    const offer = src.indexOf("offerDashboardCatchup(changes)");
    expect(save).toBeGreaterThan(-1);
    expect(offer).toBeGreaterThan(save);
  });

  it("renders the plan rather than a summary of it", () => {
    // Each line is the op's own detail, which is what makes the preview unable
    // to drift from the action.
    //
    // READ FROM `dashboard-catchup` SINCE 1.1, where the window moved when the
    // "Add note type" row on a What's below card became a second door onto it.
    // The gate above stayed in the editor — which changes are worth offering
    // after — and the window itself is shared, so there is one plan, one
    // sentence and one notice however a kind arrives.
    expect(offer()).toContain("p.ops.map((o) => `${o.label} — ${o.detail}`)");
  });

  it("says the merge in the same voice, from the same string", () => {
    // 1.0.16. The merge is not an op — `SectionOpKind` has no member that means
    // it and inventing one would put a word in the shared vocabulary three
    // catalogues can never emit — so it travels as a fact and the sentence comes
    // from `consolidateDetail`. THE SAME FUNCTION THE REPAIR WINDOW CALLS, which
    // is what keeps one change from being described two ways at two doors.
    expect(offer()).toContain("consolidateDetail(type)");
    expect(readCode("scaffold")).toContain("consolidateDetail(type)");
  });

  it("drops the reassurance it cannot make about a rewrite", () => {
    // The old blurb promises *"nothing already in them is moved, rewritten or
    // removed"*. That is exactly true of an `extend` and exactly false of a
    // merge, which deletes a head and a button per kind — so the window holding
    // a merge says something else. Keeping the promise over a rewrite would be
    // the plugin lying in the one place it asks permission.
    const src = offer();
    expect(src).toContain("const merging = pending.filter((p) => p.merge).length");
    const both = src.slice(src.indexOf("merging"));
    const reassure = both.indexOf("nothing already in them is moved");
    const branch = both.indexOf("Merging them into a single");
    expect(reassure).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(reassure);
  });

  it("merges from this door only, and says why in a type", () => {
    // ONE FILE, ONE ROW. The repair window computes this migration itself, with
    // a diff beside it, in the group whose subject is notes an older release
    // wrote — and the `journals` group's blurb promises that *"nothing already
    // in them is touched"*. Reporting the merge from both doors would put two
    // rows about one file in front of a reader who reads one diff per file, and
    // would make that promise false in the row that carries it. So it is a
    // parameter with a default of off, and this door is the one that passes it.
    const src = offer();
    expect(src).toContain("export interface CatchupScope");
    expect(src).toContain("scope: CatchupScope = {}");
    expect(src).toContain("const scope = { merge: true };");
    expect(src).toMatch(/scope\.merge \? consolidateChildren\(text, type\) : null/);
  });

  it("runs the two steps in the same order in both functions", () => {
    // The preview cannot drift from the write because both call one pure
    // function and then one planner. Two orders would be two answers.
    const src = offer();
    for (const fn of ["findDashboardCatchups", "applyDashboardCatchups"]) {
      const body = src.slice(src.indexOf(`export async function ${fn}`));
      const merge = body.indexOf("consolidateChildren");
      const plan = body.search(/planSections|applySections/);
      expect(merge, fn).toBeGreaterThan(-1);
      expect(plan, fn).toBeGreaterThan(merge);
    }
  });

  it("keeps the promise the kind-change window makes", () => {
    // The window has said this since 3.18 and nothing kept it.
    expect(readCode("kind-change")).toContain(
      "Dashboards will offer to list the new type"
    );
  });

  it("writes nothing without an answer", () => {
    // §8 of the roadmap ruled out a background sweep and the ruling stands: the
    // guarantee that survives 3.18 is that nothing is written until accepted.
    const src = offer();
    // `lastIndexOf`, because the import at the head of the file is also a
    // match and would make this pass whatever order the body used.
    const ask = src.indexOf("Add the tables");
    const write = src.lastIndexOf("applyDashboardCatchups");
    expect(ask).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(ask);
    expect(src).toMatch(/if \(!ok\) return 0;[\s\S]{0,200}applyDashboardCatchups/);
  });

  it("scans index surfaces only, never a leaf note", () => {
    // §1.4's gate. A dashboard's content is a rollup and can be wrong about a
    // fact; a leaf note's content is the reader's writing.
    const src = readCode("dashboard-catchup");
    expect(src).toContain("indexSurfaces");
    expect(src).toContain('sectionContext(type, { depth })');
    expect(src).not.toMatch(/sectionContext\(type, \{ kind/);
  });
});
