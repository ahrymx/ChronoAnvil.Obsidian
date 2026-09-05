// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { STUDY_JOURNAL, JournalType } from "../src/journals/journal";
import {
  buildJournalType,
  composeTemplate,
  freshCustomJournal,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  childrenBar,
  defaultSectionIds,
  detectSections,
  findSection,
  sectionContext,
  sectionsFor,
  surfaceLayout,
  templateKeyFor,
  templateTargets,
  widgetFormBar,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { segment } from "../src/core/layout";
import { wantFromJournalNote } from "../src/journals/journal-template";
import { WIDGETS } from "../src/core/widget-registry";
import { isPageWidgetId } from "../src/core/widget-sections";
import {
  applySections,
  isHandEdited,
  parseSections,
  planSections,
  sectionsPresent,
  splitRawSegments,
} from "../src/journals/journal-plan";

// ── the section planner ───────────────────────────────────────────────────
//
// The read-only half of the designer, and the reason "generates, never
// regenerates" can stop being the rule. What is asserted here is not that the
// module produces nice output — it is that the plan and the write cannot
// disagree, and that nothing the plugin did not write is ever touched. Those
// are the two properties a reader is trusting when they press Save.

const cooking = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "cooking",
  name: "Cooking",
  levels: [
    { id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" },
    { id: "dish", noun: "Dish", fallbackEmoji: "🍲" },
  ],
  kinds: [
    {
      id: "recipe",
      emoji: "🍽️",
      label: "Recipe",
      rating: "confidence",
      pages: true,
    },
    { id: "attempt", emoji: "🔥", label: "Attempt" },
  ],
});
const plain = buildJournalType(freshCustomJournal(new Set()));

// Every template of every fixture type, with the surface it was composed for.
const allTemplates = (): {
  type: JournalType;
  file: string;
  ctx: SectionContext;
  text: string;
}[] => {
  const out = [];
  for (const type of [STUDY_JOURNAL, cooking, plain]) {
    const files = journalTemplateFiles(type);
    for (const target of templateTargets(type)) {
      const f = files.find((x) => x.name === target.file);
      if (f) out.push({ type, file: target.file, ctx: target.ctx, text: f.content });
    }
  }
  return out;
};

// ── THE PLANNER'S FIXTURES ARE COMPOSED, NOT SHIPPED (5.20) ──────────────
//
// Almost every test below reached for the Study Subject or Topic index as the
// generator writes it, because until 5.20 those were the longest templates in
// the tree: eight sections, a row fence welding Review to Open tasks, two
// managed regions, a renameable bar. They are three sections and no row now,
// which is right for a reader opening a fresh index and useless as a fixture
// for a module whose entire job is moving, cutting and retitling sections that
// are there.
//
// SO THE FIXTURES NAME THEIR SECTIONS. Nothing in the planner asks whether a
// section was on by default — it takes a text and a list of ids — so pinning
// the list here loses no coverage, and it means the next change to the defaults
// cannot quietly thin eighteen tests down to assertions about three blocks. It
// nearly did: every one of these failed as a null dereference or a vacuous
// filter rather than as a claim about the planner.
//
// THE STUDY LAYOUT IS STILL PASSED, because two of these tests are about the
// Learning Path's label and Study's three resource shelves — the overrides that
// outlived the arrangement they used to sit beside.
const RICH_INDEX = [
  "banner",
  "trackers",
  "children",
  "review",
  "tasks",
  "progress",
  "path",
  "resources",
  "find",
  "charts",
];

const richIndex = (
  depth: number,
  ids: string[] = RICH_INDEX
): { file: string; ctx: SectionContext; text: string } => {
  const target = templateTargets(STUDY_JOURNAL).find(
    (t) => t.key === `index:${depth}`
  )!;
  return {
    file: target.file,
    ctx: target.ctx,
    text: composeTemplate(
      target.ctx,
      ids,
      STUDY_JOURNAL.layout?.[`index:${depth}`]
    ),
  };
};

const richSubject = () => richIndex(0);
const richTopic = () => richIndex(1);

describe("reading a template back", () => {
  it("agrees with detectSections on every composed template", () => {
    // The inverse of composeTemplate, cross-checked against the detector that
    // was already trusted. detectSections asks each section's own `locate`
    // regex; sectionsPresent asks the block model. Two independent routes to
    // the same answer is worth more than either checked against a fixture,
    // and it is what makes replacing the older one later a measurable step
    // rather than a leap.
    for (const { type, file, ctx, text } of allTemplates()) {
      const viaBlocks = [...sectionsPresent(text, ctx)].sort();
      const viaLocate = [...detectSections(text, ctx)].sort();
      expect(viaBlocks, `${type.id}/${file}`).toEqual(viaLocate);
    }
  });

  it("attributes every block of a freshly composed template", () => {
    // Zero foreign runs on a file the plugin just wrote. A non-zero count here
    // means the parser cannot recognise something the composer emits, and the
    // preview would tell a reader their own template contains blocks that
    // aren't the catalogue's.
    for (const { type, file, ctx, text } of allTemplates()) {
      const foreign = parseSections(text, ctx).filter(
        (r) => r.sectionId === null && !r.filler
      );
      expect(foreign.map((f) => f.from), `${type.id}/${file}`).toEqual([]);
    }
  });

  it("does not count blank separators or frontmatter as content", () => {
    // Every template has both, and reporting them would have each clean file
    // announce "two blocks here aren't the catalogue's" — true, useless and
    // alarming.
    for (const { ctx, text } of allTemplates()) {
      const runs = parseSections(text, ctx);
      expect(runs.some((r) => r.filler)).toBe(true);
    }
  });

  it("calls a freshly composed template unedited", () => {
    for (const { type, file, ctx, text } of allTemplates()) {
      expect(isHandEdited(text, ctx), `${type.id}/${file}`).toBe(false);
    }
  });

  it("calls a template with an added widget edited", () => {
    const { ctx, text } = allTemplates()[0];
    const hacked = text + "\n```chronoanvil\ntag-index\n```\n";
    expect(isHandEdited(hacked, ctx)).toBe(true);
  });

  // ── THE ROW FENCE, WHICH IS TWO SECTIONS IN ONE BLOCK (4.70) ──────────
  //
  // A subject index composes `row / header:🔁 Due and open / review-queue /
  // tasks-table`. Every property this describe block asserts about a template
  // was written when one fence meant one section, so the row is the first thing
  // that could break any of them — and the three cases below are the ones that
  // only a row can reach.
  it("attributes both cells of a row fence", () => {
    const subject = richSubject();
    const present = sectionsPresent(subject.text, subject.ctx);
    expect(present).toContain("review");
    expect(present).toContain("tasks");
    // And in file order, which is what the reorder pass is measured against.
    expect(present.indexOf("review")).toBeLessThan(present.indexOf("tasks"));
  });

  it("cuts one cell out of a row and leaves the other exactly as it was", () => {
    // The case `applySections` could not reach before this release: a fence
    // that loses SOME of its sections has to be rewritten rather than dropped
    // or kept. Both directions are checked, because the cell that opens the row
    // composes the band's bar and the one after it composes none — so removing
    // the first takes a `header:` line with it and removing the second does
    // not, and each has to leave a fence that is still valid grammar.
    const subject = richSubject();
    const ids = sectionsPresent(subject.text, subject.ctx);

    const noReview = applySections(
      subject.text,
      subject.ctx,
      ids.filter((id) => id !== "review")
    );
    // AND THE SURVIVOR IS TITLED, WHICH IT WAS NOT UNTIL 5.6. The bar came out
    // with Review — it is Review's line — and what was left was a fence of
    // rows with nothing above it: the one shape on these pages that reads as an
    // unfinished widget rather than as a section. `soloBar` puts the section's
    // own name back, and it is the string the catalogue already writes when
    // this section stands alone on a leaf index.
    expect(noReview).toContain(
      "```chronoanvil\nheader:⏳ Open tasks\ntasks-table\n```"
    );
    expect(noReview).not.toContain("review-queue");
    expect(noReview).not.toContain("Due and open");
    // A ROW OF ONE IS NOT A ROW — the `row` line goes with the second-to-last
    // cell, or the editor draws a group over a section grouped with nothing.
    expect(noReview).not.toContain("\nrow\n");

    const noTasks = applySections(
      subject.text,
      subject.ctx,
      ids.filter((id) => id !== "tasks")
    );
    expect(noTasks).toContain("```chronoanvil\nheader:🔁 Due and open\nreview-queue\n```");
    expect(noTasks).not.toContain("tasks-table");
  });

  it("leaves a barless cell alone once the reader can answer for it (5.21)", () => {
    // ── THE PAGE THAT IS ALREADY WRONG, AND IS NO LONGER CORRECTED ──────
    //
    // This asserted the opposite until 5.21. Composition and the cut both give
    // a lone cell a title, neither reaches a note WRITTEN BEFORE THEY DID, and
    // the plan used to report the difference as an `extend` and add the line.
    //
    // WHAT TOOK IT AWAY IS 5.11'S RULE, NOT A NEW ONE. `declaredBar` goes quiet
    // for any section carrying a form toggle, because a barless fence under one
    // has two causes — behind the catalogue, or answered — and nothing in the
    // file tells them apart. Open tasks gained that toggle when `widgetFormBar`
    // learned to report the bar a CELL wears alone, so it joined the sections
    // this repair has always declined to touch.
    //
    // THE READER IS NOT LEFT WITHOUT THE LINE, which is the whole trade: the
    // control that adds it is the toggle, in the same window that would have
    // offered the repair, and it takes it off again afterwards — which the
    // repair never could.
    const subject = richSubject();
    const ids = sectionsPresent(subject.text, subject.ctx).filter(
      (id) => id !== "review"
    );
    const stale = applySections(subject.text, subject.ctx, ids)!.replace(
      "header:⏳ Open tasks\n",
      ""
    );
    expect(stale).toContain("```chronoanvil\ntasks-table\n```");

    const ops = planSections(stale, subject.ctx, ids.map((id) => ({ id })));
    expect(ops.find((o) => o.sectionId === "tasks")?.kind).not.toBe("extend");
    expect(
      applySections(stale, subject.ctx, ids.map((id) => ({ id })))
    ).toBeNull();

    // AND THE ANSWER PUTS IT BACK, on the gesture that says so out loud.
    const titled = applySections(
      stale,
      subject.ctx,
      ids.map((id) => (id === "tasks" ? { id, options: { form: "section" } } : { id }))
    );
    expect(titled).toContain(
      "```chronoanvil\nheader:⏳ Open tasks\ntasks-table\n```"
    );
  });

  it("leaves a fence the reader titled themselves alone", () => {
    // `isSectionFence` is the gate, so a bar the reader wrote — under any
    // wording — answers the question and the repair does not fire. The plugin
    // is filling a gap, not enforcing a name.
    const subject = richSubject();
    const ids = sectionsPresent(subject.text, subject.ctx).filter(
      (id) => id !== "review"
    );
    const mine = applySections(subject.text, subject.ctx, ids)!.replace(
      "header:⏳ Open tasks",
      "header:🔨 What is left"
    );
    expect(
      applySections(mine, subject.ctx, ids.map((id) => ({ id })))
    ).toBeNull();
  });

  it("titles every barless section a template already carries (5.10)", () => {
    // ── AND NOT ONLY A ROW'S CELL ────────────────────────────────────────
    //
    // The pair above is 5.9's, and its scope was drawn around the one way a
    // barless block was then known to arise. `trackers` and `stats` gained a
    // `header:` line in the catalogue afterwards, which puts every note
    // composed before that in exactly the same state and for exactly the same
    // reason — the file says one thing, the catalogue says another, and no
    // gesture reconciles them.
    //
    // A PROPERTY OVER THE TEMPLATE rather than three named sections, because
    // the failure this guards against is a catalogue entry gaining a bar and
    // nobody remembering this file exists. Strip any section's title, and the
    // plan must offer it back and the write must restore the file byte for
    // byte.
    for (const t of allTemplates()) {
      const ids = sectionsPresent(t.text, t.ctx);
      const want = ids.map((id) => ({ id }));
      // THE RUN'S OWN COORDINATES. `from`/`to` index the split segments, which
      // is what the planner segments with — a bare `segment(...)` numbers the
      // file differently the moment a frontmatter block is followed by content.
      const segs = splitRawSegments(segment(t.text.split("\n")));
      const all = t.text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => /^header:\S/.test(l));
      // ONE SECTION TO A RUN. A row fence carries ONE bar for the BAND, worded
      // by the cell that opens it, and a run of two is not the solo case —
      // `header:🔁 Due and open` names Review and Open tasks together, so
      // stripping it is a different repair with a different answer (5.9's cut
      // path, two tests up). The scan asks the parser rather than the text.
      const bars = parseSections(t.text, t.ctx)
        .filter((r) => r.sectionIds.length === 1)
        .flatMap((r) => {
          const lines: string[] = [];
          for (let i = r.from; i <= r.to; i++) lines.push(...segs[i].lines);
          const heads = lines
            .map((l) => l.trim())
            .filter((l) => /^header:\S/.test(l));
          // AND ONE BAR TO A FENCE. `children` composes a bar per kind —
          // `📖 Lessons` over the lesson table, `🛠️ Practice` over the practice
          // one — so a fence that has lost the first still carries the second,
          // and `isSectionFence` reads it as titled because it is. That is a
          // different loss with a different answer; this repair is only ever
          // about a block with no title of any kind over it.
          // AND NOT A SECTION THE READER COULD HAVE MEANT TO BE BARE (5.11).
          // A section that offers the widget form has TWO reasons to carry no
          // bar — a page written before the catalogue grew one, and an answer
          // the reader gave in the section editor — and nothing in the file
          // tells them apart. `declaredBar` declines the ambiguous case rather
          // than overwriting an answer; this is the same rule, said from the
          // test's side, and the assertion below it is the half that keeps the
          // decline honest.
          const only = findSection(r.sectionIds[0], t.ctx);
          if (only && widgetFormBar(only, t.ctx)) return [];
          return heads.length === 1 ? heads : [];
        });
      for (const bar of new Set(bars)) {
        // A title the file carries twice is not this repair's case: removing
        // one leaves the fence titled, which `isSectionFence` reads as titled.
        if (all.filter((b) => b === bar).length > 1) continue;
        const stale = t.text.replace(`${bar}\n`, "");
        if (stale === t.text) continue;

        const op = planSections(stale, t.ctx, want).find(
          (o) => o.kind === "extend" && o.detail?.includes("no title over it")
        );
        expect(op, `${t.file} / ${bar}`).toBeTruthy();
        expect(applySections(stale, t.ctx, want), `${t.file} / ${bar}`).toBe(
          t.text
        );
        // AND ONLY ONCE. A repair that fires on its own output is a note that
        // never stops being offered a change.
        expect(applySections(t.text, t.ctx, want), `${t.file} / ${bar}`).toBeNull();
      }
    }
  });

  it("leaves a widget-form section's missing bar alone (5.11)", () => {
    // THE OTHER HALF OF THE NARROWING ABOVE, and the reason it is a narrowing
    // rather than a hole. Dropping the bar off a section that can be drawn as a
    // widget is what the section editor's toggle DOES, so a plan that read the
    // result as a page behind the catalogue would offer — and a save would
    // make — a write undoing the reader's own answer, under a sentence saying
    // the block has no title over it.
    //
    // ASSERTED OVER EVERY TEMPLATE, so the property survives a catalogue entry
    // gaining or losing its toggle.
    let checked = 0;
    for (const t of allTemplates()) {
      const want = sectionsPresent(t.text, t.ctx).map((id) => ({ id }));
      for (const id of sectionsPresent(t.text, t.ctx)) {
        const section = findSection(id, t.ctx);
        const bar = section && widgetFormBar(section, t.ctx);
        if (!bar) continue;
        const stale = t.text.replace(`${bar}\n`, "");
        if (stale === t.text) continue;
        checked++;
        const op = planSections(stale, t.ctx, want).find(
          (o) => o.kind === "extend" && o.detail?.includes("no title over it")
        );
        expect(op, `${t.file} / ${bar}`).toBeUndefined();
        expect(applySections(stale, t.ctx, want), `${t.file} / ${bar}`).toBeNull();
      }
    }
    // The templates really do carry sections with a toggle — a rule that
    // checked nothing would pass this file silently.
    expect(checked).toBeGreaterThan(0);
  });

  it("puts a cut cell back into its row, not beside it", () => {
    // THE PROPERTY THE CUT EXISTS FOR: remove a section, put it back, and the
    // file is the file you started with. The ordinary add path composes a
    // BLOCK, and a cut cell came out of a fence somebody else is still in — so
    // without `joinRowChunk` this restores a template whose row has become two
    // stacked blocks, and nothing tells the reader their page changed shape.
    const subject = richSubject();
    const ids = sectionsPresent(subject.text, subject.ctx);
    for (const drop of ["review", "tasks"]) {
      const without = applySections(
        subject.text,
        subject.ctx,
        ids.filter((id) => id !== drop)
      );
      expect(without, drop).not.toBeNull();
      expect(applySections(without as string, subject.ctx, ids), drop).toBe(
        subject.text
      );
    }
  });

  it("keeps a retitled header attributed to its section", () => {
    // Headers are retitleable, which layout.ts settled for dashboards. A
    // reader who renamed a section's bar still has that section, and a parser
    // that disagreed would offer to add a second copy.
    const topic = richTopic();
    const renamed = topic.text.replace("header:🔁 Review", "header:🔁 Come back to");
    expect(sectionsPresent(renamed, topic.ctx)).toContain("review");
  });
});

describe("the plan and the write cannot disagree", () => {
  const topic = richTopic;

  it("returns null when asked for what is already there", () => {
    // Idempotence made structural rather than claimed: applyLayout's and
    // mergeTrendsSection's convention, and the reason a second call is safe.
    for (const { type, file, ctx, text } of allTemplates()) {
      const present = sectionsPresent(text, ctx);
      expect(applySections(text, ctx, present), `${type.id}/${file}`).toBeNull();
    }
  });

  it("changes exactly the sections the plan named", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const want = present.filter((id) => id !== "review");

    const named = planSections(text, ctx, want)
      .filter((o) => o.kind === "remove" || o.kind === "add")
      .map((o) => o.sectionId);
    expect(named).toEqual(["review"]);

    const after = applySections(text, ctx, want)!;
    const before = new Set(present);
    const now = new Set(sectionsPresent(after, ctx));
    const changed = [
      ...[...before].filter((id) => !now.has(id)),
      ...[...now].filter((id) => !before.has(id)),
    ];
    expect(changed).toEqual(named);
  });

  it("is idempotent", () => {
    const { ctx, text } = topic();
    const want = sectionsPresent(text, ctx).filter((id) => id !== "review");
    const once = applySections(text, ctx, want)!;
    expect(applySections(once, ctx, want)).toBeNull();
  });

  it("restores the file exactly when a section is removed and re-added", () => {
    // The round-trip, and the reason insertionPoint stops at the first section
    // that outranks the new one instead of scanning the whole file: Study's
    // Topic index puts `children` after `path`, so a whole-file scan landed a
    // re-added `review` at the bottom.
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const without = present.filter((id) => id !== "review");
    const removed = applySections(text, ctx, without)!;
    expect(applySections(removed, ctx, present)).toBe(text);
  });
});

describe("nothing the plugin did not write is touched", () => {
  const topic = richTopic;

  it("leaves a hand-added block exactly where it was", () => {
    const { ctx, text } = topic();
    // `entry-header` RATHER THAN `on-this-day` SINCE 5.26, AND IT IS THE THIRD
    // TIME THIS FIXTURE HAS HAD TO MOVE — `tag-index` until 3.11 §6 gave the
    // journal catalogue a Tags section, `on-this-day` until this release gave
    // every journal surface the page-widget door. Each time the reason is the
    // same: the plugin learned to own a directive that had been chosen for
    // being unowned.
    //
    // `entry-header` cannot move again for that reason. It is in
    // `NOT_PAGE_WIDGETS`, so it is not a page widget and cannot be offered by
    // the door; and it is the directive that makes a note a DIARY ENTRY, which
    // no journal catalogue will ever claim.
    const mine = "```chronoanvil\nentry-header\n```";
    const hacked = `${text}\n${mine}\n`;
    const want = sectionsPresent(hacked, ctx).filter((id) => id !== "review");
    const after = applySections(hacked, ctx, want)!;
    expect(after).toContain(mine);
  });

  it("reports foreign blocks rather than removing them", () => {
    const { ctx, text } = topic();
    // `entry-header`, for the reason spelled out on the test above: the
    // assertion is about what happens to a block the catalogue does NOT own,
    // and 5.26's widget door made every PAGE WIDGET a block some journal
    // surface owns. What is left unowned is what the registry excludes and the
    // diary keeps, which is exactly this directive.
    const hacked = `${text}\n\`\`\`chronoanvil\nentry-header\n\`\`\`\n`;
    const ops = planSections(hacked, ctx, sectionsPresent(hacked, ctx));
    const foreign = ops.find((o) => o.kind === "foreign");
    expect(foreign?.detail).toContain("left alone");
  });

  it("refuses to remove a section that has the reader's writing in it", () => {
    // WAS "keeps a region…", which took the fence and left the text. The rule
    // it served is unchanged and is the reason this changed: NEVER DELETE A
    // NON-EMPTY REGION. Keeping the orphan satisfied it; refusing satisfies it
    // more strongly, and leaves the note in a state where every region still
    // has an owner.
    //
    // What tipped it: an orphaned region is INVISIBLE in reading mode, so after
    // the one report that mentions it the reader cannot see it exists — and
    // re-adding the section later silently resurrects the old text.
    const { ctx, text } = topic();
    const written = text.replace(
      "<!--chronoanvil:path\n-->",
      "<!--chronoanvil:path\nStart with quadratics, then factorising.\n-->"
    );
    const want = sectionsPresent(written, ctx).filter((id) => id !== "path");
    const ops = planSections(written, ctx, want);
    const remove = ops.find((o) => o.sectionId === "path")!;
    expect(remove.kind).toBe("keep");
    expect(remove.detail).toContain("has your writing in it");
    // The refusal names what is in the way and what to do about it — a refusal
    // that only says no sends someone looking for a setting that does not exist.
    expect(remove.detail).toContain("path");
    expect(remove.detail).toContain("clear it first");

    // And the write is a NO-OP, not a partial one. `applySections` returns null
    // for "nothing to change", so a plan whose only change was refused leaves
    // the file untouched rather than rewriting it identically — which matters
    // because a rewrite would still bump the note's mtime and, on the diary
    // side, mtime is the source of truth for what is stale.
    expect(applySections(written, ctx, want)).toBeNull();
  });

  it("takes an empty region with the section that owns it", () => {
    // The other half: an untouched region is the plugin's own scaffolding and
    // leaving it behind would litter the file with dead comments.
    const { ctx, text } = topic();
    const want = sectionsPresent(text, ctx).filter((id) => id !== "path");
    const after = applySections(text, ctx, want)!;
    expect(after).not.toContain("<!--chronoanvil:path");
  });

  it("never offers to remove a section that writes ordinary markdown", () => {
    // Derived from the block model rather than special-cased here. `banner`
    // emits a bare `markdown` spacer, which is indistinguishable from the
    // reader's own prose, so removal is refused and said so rather than
    // silently ignored.
    //
    // `headings` USED TO BE THE SECOND NAME IN THIS TEST, and 5.6 moved it: its
    // `## ` markdown is bracketed now, so it is findable and the plan offers a
    // real `remove`. The claim here is about unprovable markdown, not about
    // prose — see "removing a bracketed section" below for what replaced it.
    const lesson = allTemplates().find((t) => t.file.includes("lesson"))!;
    const present = sectionsPresent(lesson.text, lesson.ctx);
    const ops = planSections(lesson.text, lesson.ctx, []);
    for (const op of ops) {
      if (op.sectionId === "banner") {
        expect(op.kind).toBe("keep");
        expect(op.detail).not.toBe("unchanged");
      }
    }
    expect(present).toContain("banner");
  });

  it("takes out an empty heading and leaves one with writing under it", () => {
    // THE WHOLE OF WHAT REMOVAL PROMISES, on a note built to hold both cases.
    // The unit is the heading because the reader's writing is not in a
    // container of its own — it is under a `## `, interleaved with the
    // catalogue's — so "keep the whole section" and "drop the whole section"
    // are both wrong and the choice has to be made one heading at a time.
    const lesson = allTemplates().find((t) => t.file.includes("lesson"))!;
    const note = lesson.text
      .replace("What is this lesson about, and why does it matter?", "")
      .replace("- **Definition:** \n- **Example:** ", "- **Definition:** ohms law");

    // ONLY THE SKELETON IS UNTICKED. Asking for an empty note would remove
    // every section at once, and the blank lines four removals leave between
    // them would say nothing about this one.
    const want = sectionsPresent(note, lesson.ctx).filter(
      (id) => id !== "headings"
    );
    const op = planSections(note, lesson.ctx, want).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent?.map((k) => k.key)).toContain("Key Concepts");
    expect(op.keepsContent?.map((k) => k.key)).not.toContain("Overview");

    const after = applySections(note, lesson.ctx, want)!;
    expect(after).toContain("## Key Concepts");
    expect(after).toContain("ohms law");
    expect(after).not.toContain("## Overview");
    // No marker survives a removal, and no gap opens where the empty headings
    // were: `tidyBlanks` is what stops a note growing a blank line every time
    // somebody unticks something.
    expect(after).not.toContain("chronoanvil-skeleton");
    expect(after).not.toMatch(/\n\n\n/);
  });

  it("refuses to remove a required section and says why", () => {
    const { ctx, text } = topic();
    const ops = planSections(text, ctx, []);
    const banner = ops.find((o) => o.sectionId === "banner")!;
    expect(banner.kind).toBe("keep");
    expect(banner.detail).toContain("required");
  });
});

describe("adding", () => {
  // ONE SECTION SHORT ON PURPOSE. The fixture is the rich index with `find`
  // held back, so there is something for the add to be about; before 5.20 the
  // shipped template happened to lack it and the tests read that as a fact
  // about the surface rather than about the arrangement of the day.
  const topic = () => richIndex(1, RICH_INDEX.filter((id) => id !== "find"));

  it("puts a new section where this surface would have", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    expect(present).not.toContain("find");
    const after = applySections(text, ctx, [...present, "find"])!;
    const order = sectionsPresent(after, ctx);
    expect(order).toContain("find");
    // WHERE THE TEMPLATE WOULD HAVE, WHICH IS THE CATALOGUE'S ANSWER WHEREVER
    // THE SURFACE DECLARES NO ORDER — and as of 5.20 no surface of any preset
    // declares one, so this is now the catalogue's answer everywhere. The
    // ranking still goes through `surfaceLayout`, because the mechanism is what
    // is under test: a layout that DID name an order would rank the arrival
    // against it and put the unnamed section after the named ones, which is
    // `TemplateLayout.order`'s own rule.
    expect(order).toEqual(
      sectionsFor(ctx, surfaceLayout(ctx))
        .map((s) => s.id)
        .filter((id) => order.includes(id))
    );
    // AND IT IS NOT AN APPEND, which is what makes the two answers the same
    // claim rather than a coincidence on a page whose layout happens to end
    // where the arrival goes. On a Lesson — a surface whose layout carries
    // options and no order — the same add lands Find where the CATALOGUE puts
    // it, between the sections that flank it there.
    const lesson = sectionContext(STUDY_JOURNAL, {
      kind: STUDY_JOURNAL.kinds[0],
    });
    expect(surfaceLayout(lesson)?.order).toBeUndefined();
    const leaf = sectionsFor(lesson, surfaceLayout(lesson)).map((s) => s.id);
    expect(leaf.indexOf("resources")).toBeLessThan(leaf.indexOf("headings"));
  });

  it("separates what it adds with one blank line", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const after = applySections(text, ctx, [...present, "find"])!;
    expect(after).not.toMatch(/\n{3,}/);
  });

  it("names the addition in the plan", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const op = planSections(text, ctx, [...present, "find"]).find(
      (o) => o.kind === "add"
    )!;
    expect(op.sectionId).toBe("find");
    expect(op.label).toBe(findSection("find")!.label);
  });
});

describe("fence signatures", () => {
  it("gives no two sections on one surface the same signature", () => {
    // What makes parseSections a match rather than a guess. Two sections with
    // identical directive sets would be indistinguishable in a file, and the
    // parser would attribute both runs to whichever it checked first.
    for (const type of [STUDY_JOURNAL, cooking, plain]) {
      const surfaces = [
        ...type.levels.map((_l, i) => sectionContext(type, { depth: i })),
        ...type.kinds.map((k) => sectionContext(type, { kind: k })),
      ];
      for (const ctx of surfaces) {
        const seen = new Map<string, string>();
        for (const s of sectionsFor(ctx)) {
          const f = s.render(ctx).find((b) => b.kind === "fence");
          if (!f || f.kind !== "fence") continue;
          const sig = `${f.info}|${f.lines
            .map((l) => l.split(":")[0])
            .filter((k) => k && k !== "header")
            .sort()
            .join(",")}`;
          const prev = seen.get(sig);
          expect(prev, `${type.id}: ${s.id} collides with ${prev}`).toBeUndefined();
          seen.set(sig, s.id);
        }
      }
    }
  });
});

describe("reordering", () => {
  const topic = richTopic;

  it("returns null when the order is unchanged", () => {
    const { ctx, text } = topic();
    expect(applySections(text, ctx, sectionsPresent(text, ctx))).toBeNull();
  });

  it("swaps two sections", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const i = present.indexOf("review");
    const j = present.indexOf("charts");
    const want = [...present];
    [want[i], want[j]] = [want[j], want[i]];

    const after = applySections(text, ctx, want)!;
    expect(sectionsPresent(after, ctx)).toEqual(want);
  });

  it("names only the sections that actually moved", () => {
    // A move shifts the index of everything between, so a plan that reported
    // those would say "moves Charts, Path, Resources" when the reader nudged
    // Review once. The minimal set comes from a longest common subsequence.
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const want = present.filter((id) => id !== "review");
    want.push("review");

    const moved = planSections(text, ctx, want)
      .filter((o) => o.kind === "move")
      .map((o) => o.sectionId);
    expect(moved).toEqual(["review"]);
  });

  it("says where a section is going", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const want = present.filter((id) => id !== "review");
    want.push("review");
    const op = planSections(text, ctx, want).find((o) => o.kind === "move")!;
    expect(op.detail).toBe("moves to the end");
  });

  it("is idempotent", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const want = [...present].reverse();
    const once = applySections(text, ctx, want)!;
    expect(applySections(once, ctx, want)).toBeNull();
  });

  it("restores the file exactly when a swap is undone", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const want = [...present];
    [want[1], want[2]] = [want[2], want[1]];
    const swapped = applySections(text, ctx, want)!;
    expect(applySections(swapped, ctx, present)).toBe(text);
  });

  it("leaves a hand-added block where the reader put it", () => {
    // The one undecidable case, decided out loud: a reader's own fence between
    // two sections being swapped has no correct destination, so it keeps its
    // index and the sections trade the slots they had.
    //
    // FOREIGN, WHICH `tag-index` IS NOT — see the correction one describe up.
    const { ctx, text } = topic();
    const mine = "```chronoanvil\non-this-day\n```";
    const hacked = `${text}\n${mine}\n`;
    const present = sectionsPresent(hacked, ctx);
    const want = [...present].reverse();
    const after = applySections(hacked, ctx, want)!;
    // Still there, and still the last block: nothing moved it.
    expect(after).toContain(mine);
    expect(after.trimEnd().endsWith("```")).toBe(true);
  });

  it("keeps a section's regions with it", () => {
    // A section is a contiguous run — fence plus the regions its fields write
    // to — so permuting chunks moves the whole thing. A region left behind
    // would orphan the reader's text.
    const { ctx, text } = topic();
    const written = text.replace(
      "<!--chronoanvil:path\n-->",
      "<!--chronoanvil:path\nQuadratics first.\n-->"
    );
    const present = sectionsPresent(written, ctx);
    const want = [...present].reverse();
    const after = applySections(written, ctx, want)!;
    const fenceAt = after.indexOf("path:path");
    const regionAt = after.indexOf("<!--chronoanvil:path");
    expect(fenceAt).toBeGreaterThanOrEqual(0);
    expect(regionAt).toBeGreaterThan(fenceAt);
    expect(after).toContain("Quadratics first.");
  });

  it("does not drop a section the reorder never mentioned", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    // A `want` missing `resources` entirely — not unticked, just absent from
    // the list. It must survive rather than being read as a removal.
    const partial = present.filter((id) => id !== "resources").reverse();
    const after = applySections(text, ctx, [...partial, "resources"])!;
    expect(sectionsPresent(after, ctx)).toContain("resources");
  });
});

// ── extending a section that is present and short of a part (3.18 §1) ──────
//
// `children` emits one header, button and table PER NOTE KIND, so a dashboard
// written before a journal gained a kind is present, wanted, and missing a
// table. Until 3.18 the planner could not say that: exact keyword matching
// called the short fence nobody's, the section read as ABSENT, and the plan
// said `add` — which appends a SECOND copy of the whole section beside the
// short one. The roadmap predicted a silent `keep`; the tree did something
// worse, and it wrote. These tests pin the fixed behaviour and, first, the
// property that makes the fix trustworthy.

describe("parts and the extend op", () => {
  // The Study Topic index — the deepest index, where children is per-kind.
  const topic = richTopic;
  const want = (ctx: SectionContext): string[] => sectionsPresent(topic().text, ctx);
  // A file written before `practice` existed.
  const dropPractice = (text: string): string =>
    text
      .split("\n")
      .filter(
        (l) =>
          // `header:2:` SINCE 5.12 — a kind's head is a group inside the
          // section's bar. Both spellings, so the fixture keeps deleting the
          // same three lines whichever release composed the template.
          !/^(header:(?:2:)?🛠️|button:study:new-practice|kind-table:practice)/.test(
            l.trim()
          )
      )
      .join("\n");

  it("composes its fence out of exactly the parts it declares", () => {
    // A TRIPWIRE, NOT A CHECK, and the difference is worth stating because it
    // is easy to read this as stronger than it is.
    //
    // Today `children.render` and `children.parts` both call `childrenParts`,
    // so this assertion CANNOT fail: a mutation to that helper moves both sides
    // together. That is the point — the invariant is held by the code's shape
    // rather than by this test, which is what §11.1 asked for. What this
    // catches is the refactor that gives a section its own second `parts`
    // implementation and lets the two start disagreeing; that is the day the
    // planner would report a gap that filling could not close, and the day this
    // line goes red.
    //
    // It is stronger than "no gaps in fresh output" below, which only pins the
    // PROBES: a `parts` whose `lines` had drifted would still report nothing
    // missing, and would then splice the wrong lines into a file.
    for (const t of allTemplates()) {
      for (const s of sectionsFor(t.ctx)) {
        const parts = s.parts?.(t.ctx) ?? [];
        if (!parts.length) continue;
        const rendered = s
          .render(t.ctx)
          .flatMap((b) => (b.kind === "fence" ? b.lines : []));
        // ── PLUS WHAT THE FENCE OPENS WITH (5.12) ────────────────────
        //
        // `children` composes a bar of its own now — the section's name, and the
        // primary kind's create button anchored into it — and the parts are the
        // GROUPS under it. The tripwire is unchanged in what it guards: the
        // rendered fence is still exactly the parts, in order, with nothing
        // between them; it is now allowed a head, and the head is derived from
        // the same catalogue rather than written out here, so a drift in either
        // still shows up as a disagreement.
        const head = rendered.slice(
          0,
          rendered.length - parts.flatMap((p) => p.lines).length
        );
        expect(
          [...head, ...parts.flatMap((p) => p.lines)],
          `${s.id}'s parts and render disagree on ${t.file}`
        ).toEqual(rendered);
        expect(head, `${s.id} opens its fence with more than a bar`).toEqual(
          s.id === "children" && head.length ? childrenBar(t.ctx) : []
        );
        // And the probe closes its group, which is what makes "insert after
        // the preceding part" land between groups rather than inside one.
        for (const p of parts) {
          expect(p.lines[p.lines.length - 1]).toBe(p.probe);
        }
      }
    }
  });

  it("reports no missing parts on anything it just composed", () => {
    // THE PROPERTY THAT KEEPS `parts` AND `render` FROM DRIFTING (§11.1).
    //
    // `missing` says which pieces are absent and `render` composes all of them.
    // If the two disagree about what a piece IS, a file gains a duplicate or
    // keeps a gap the editor claims to have filled — and the plan would report
    // a change that saving cannot close, so Save would never disable. A section
    // that cannot say this about its own fresh output has the bug already.
    for (const t of allTemplates()) {
      const ops = planSections(t.text, t.ctx, sectionsPresent(t.text, t.ctx));
      expect(
        ops.filter((o) => o.kind === "extend"),
        `${t.file} reports a gap in what it was just composed with`
      ).toEqual([]);
    }
  });

  it("no two sections can be confused by the sub-multiset fallback", () => {
    // Attribution falls back to a sub-multiset match for extensible sections
    // only, and only after every exact match has failed. That is safe exactly
    // while no OTHER section's keywords are a sub-multiset of an extensible
    // one's — otherwise a `tasks-table` fence could be read as a short
    // `children` and get note tables spliced into it.
    for (const t of allTemplates()) {
      const sections = sectionsFor(t.ctx);
      const extensible = sections.filter(
        (s) => (s.parts?.(t.ctx) ?? []).length > 0
      );
      for (const ext of extensible) {
        const full = new Set(
          (ext.parts?.(t.ctx) ?? []).flatMap((p) =>
            p.lines.map((l) => l.split(":")[0]).filter((k) => k !== "header")
          )
        );
        for (const other of sections) {
          if (other.id === ext.id) continue;
          const kws = other
            .render(t.ctx)
            .flatMap((b) => (b.kind === "fence" ? b.lines : []))
            .map((l) => l.split(":")[0])
            .filter((k) => k !== "header");
          if (!kws.length) continue;
          expect(
            kws.every((k) => full.has(k)),
            `${other.id} would be mistaken for a short ${ext.id} on ${t.file}`
          ).toBe(false);
        }
      }
    }
  });

  it("calls a short fence an extend, not an add", () => {
    const { ctx, text } = topic();
    const stale = dropPractice(text);
    const ops = planSections(stale, ctx, want(ctx));
    const children = ops.find((o) => o.sectionId === "children")!;
    expect(children.kind).toBe("extend");
    expect(children.detail).toContain("Practice");
    // The failure this replaces: a second copy of the whole section.
    expect(ops.filter((o) => o.kind === "add")).toEqual([]);
  });

  it("writes exactly the file the catalogue would have composed", () => {
    const { ctx, text } = topic();
    const out = applySections(dropPractice(text), ctx, want(ctx));
    expect(out).toBe(text);
  });

  it("is idempotent, and a pristine file is not a write at all", () => {
    const { ctx, text } = topic();
    // Nothing to do on a file that already has every part — the property that
    // stops this becoming a formatter that changes a file every time it runs.
    expect(applySections(text, ctx, want(ctx))).toBeNull();
    const once = applySections(dropPractice(text), ctx, want(ctx))!;
    expect(applySections(once, ctx, want(ctx))).toBeNull();
  });

  it("keeps a reader's order and a reader's retitled header", () => {
    // The rule at the top of journal-plan.ts: no reflowing, no reordering
    // blocks it did not move. An extension may INSERT lines; it may not tidy
    // the ones around them.
    const type = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "s3",
      levels: [
        { id: "subject", noun: "Subject", fallbackEmoji: "📚" },
        { id: "topic", noun: "Topic", fallbackEmoji: "📂" },
      ],
      kinds: [
        { id: "lesson", emoji: "📖", label: "Lesson" },
        { id: "quiz", emoji: "❓", label: "Quiz" },
        { id: "practice", emoji: "🛠️", label: "Practice" },
      ],
    });
    const target = templateTargets(type).find((t) => t.key === "index:1")!;
    const ctx = target.ctx;
    const composed = journalTemplateFiles(type).find(
      (f) => f.name === target.file
    )!.content;
    // Practice above Lessons, Lessons retitled by hand, and no Quiz yet.
    const edited = composed.replace(
      /```chronoanvil\nheader:🗂️[\s\S]*?```/,
      [
        "```chronoanvil",
        // The section's own bar, which the reader has left alone, and the two
        // groups under it in THEIR order rather than the catalogue's.
        "header:🗂️ What's below",
        "button:s3:new-lesson",
        "header:2:🛠️ Practice",
        "button:s3:new-practice",
        "kind-table:practice",
        "header:2:📖 My Own Title",
        "kind-table:lesson",
        "```",
      ].join("\n")
    );
    const out = applySections(edited, ctx, sectionsPresent(edited, ctx))!;
    const fence = out.split("\n").map((l) => l.trim());
    expect(out).toContain("header:2:📖 My Own Title");
    // Their order survives: Practice still before Lessons.
    expect(fence.indexOf("kind-table:practice")).toBeLessThan(
      fence.indexOf("kind-table:lesson")
    );
    // And Quiz lands after the kind it follows in the CATALOGUE, expressed
    // against the file's own order rather than imposed on it.
    expect(fence.indexOf("kind-table:lesson")).toBeLessThan(
      fence.indexOf("kind-table:quiz")
    );
  });

  it("never extends a leaf note or a page, whatever the catalogue says", () => {
    // §1.4, and the gate is on the SURFACE rather than on the catalogue.
    // `children` is index-only today, so this arm is unreachable through the
    // shipped sections — which is exactly why it is asserted. A rule that holds
    // by accident of the catalogue stops holding the day somebody adds a leaf
    // section with parts.
    for (const t of allTemplates()) {
      if (t.ctx.noteKind === "index") continue;
      const ops = planSections(t.text, t.ctx, sectionsPresent(t.text, t.ctx));
      expect(
        ops.some((o) => o.kind === "extend"),
        `${t.file} is a ${t.ctx.noteKind} and must never be extended`
      ).toBe(false);
    }
  });
});

// ── a section's title is a question with an answer in the file (3.18 §3) ───

describe("renameable section titles", () => {
  const topic = richTopic;

  it("writes the answer into the header the section emitted", () => {
    const { ctx, text } = topic();
    const present = sectionsPresent(text, ctx);
    const want = present.map((id) =>
      id === "path" ? { id, options: { label: "🗺️ Route" } } : id
    );
    const ops = planSections(text, ctx, want);
    const path = ops.find((o) => o.sectionId === "path")!;
    expect(path.kind).toBe("reconfigure");
    const out = applySections(text, ctx, want)!;
    expect(out).toContain("header:🗺️ Route");
    // Only that header. The section's own directive and every other section's
    // heading are untouched — a title change is not a licence to reflow.
    expect(out).toContain("path:path");
    expect(out).toContain("header:📚 Resources");
  });

  it("leaves the catalogue's heading when the answer is empty", () => {
    // Empty means "whatever the catalogue writes", which is why the control is
    // a placeholder rather than a pre-filled box: seeding it would freeze
    // today's default into the note as though it had been chosen.
    const { ctx, text } = topic();
    expect(applySections(text, ctx, sectionsPresent(text, ctx))).toBeNull();
  });

  it("survives an extension, because extend never rewrites a header", () => {
    // §3.4. A reader who renamed a heading and then gains a note kind keeps
    // the name: `missing` reports parts by their `kind-table:` probe, and the
    // header above it is neither matched nor re-emitted.
    const { ctx, text } = topic();
    const renamed = text.replace("header:2:📖 Lessons", "header:2:📖 My Lessons");
    const stale = renamed
      .split("\n")
      .filter(
        (l) =>
          // `header:2:` SINCE 5.12 — a kind's head is a group inside the
          // section's bar. Both spellings, so the fixture keeps deleting the
          // same three lines whichever release composed the template.
          !/^(header:(?:2:)?🛠️|button:study:new-practice|kind-table:practice)/.test(
            l.trim()
          )
      )
      .join("\n");
    const out = applySections(stale, ctx, sectionsPresent(stale, ctx))!;
    expect(out).toContain("header:2:📖 My Lessons");
    expect(out).not.toContain("header:2:📖 Lessons\n");
    expect(out).toContain("kind-table:practice");
  });
});

// ── the wizard's chosen order reaches the file (3.18 §2) ──────────────────

describe("a chosen order is composed, and no order is still catalogue order", () => {
  const target = (): { key: string; ctx: SectionContext } => {
    const t = templateTargets(STUDY_JOURNAL).find((x) => x.key === "index:1")!;
    return { key: t.key, ctx: t.ctx };
  };

  it("leaves output byte-identical when nothing was reordered", () => {
    // THE ROW THAT MUST NOT MOVE. Ordering is opt-in: a reader who never
    // touches an arrow gets exactly the templates 3.17.1 wrote, which is what
    // the Study-equivalence check is measuring elsewhere.
    const { ctx } = target();
    const ids = defaultSectionIds(ctx);
    expect(composeTemplateOrdered(ctx, ids, ids)).toBe(
      composeTemplateOrdered(ctx, ids, undefined)
    );
  });

  it("writes the sections in the order the wizard collected", () => {
    const { ctx } = target();
    // RICH_INDEX RATHER THAN THE DEFAULTS (5.20), because a Topic index no
    // longer composes Resources at all and the reordering this test performs is
    // "move Resources to the front". The ids a caller passes are the ids
    // composed — that is `composeTemplate`'s first argument — so naming them
    // here asks the ordering question without also asking the defaults one.
    const ids = RICH_INDEX;
    // Move `resources` to the front — a real reordering, not a no-op.
    const moved = ["resources", ...ids.filter((i) => i !== "resources")];
    const out = composeTemplateOrdered(ctx, ids, moved);
    const at = (needle: string): number => out.indexOf(needle);
    expect(at("attach:")).toBeLessThan(at("kind-table:lesson"));
    // AND THE BANNER IS STILL FIRST, even though the order asked for Resources
    // ahead of it. That is not the composer ignoring the reader: the banner's
    // first block is `chronoanvil:spacer`, which has to be on line 0 of the body or
    // a click at the top of the note renders the fence as raw source. The
    // wizard's arrows cannot express this order; presets and saved variants
    // could, so `sectionsFor` enforces it for every caller.
    expect(at("journal-header")).toBeLessThan(at("attach:"));
    expect(at("`chronoanvil:spacer`")).toBe(
      out.indexOf("\n---\n") + "\n---\n".length
    );
  });

  it("does not freeze which sections exist, only where they go", () => {
    // `order`, not `sections` (§2.4). A layout that named the SET would stop a
    // journal ever gaining a section the catalogue adds later; one that names
    // only positions leaves the set to the catalogue.
    //
    // On `cooking` rather than Study, and the reason is worth recording: Study
    // declares per-section OPTIONS in its layout (three resource shelves), and
    // `sectionsPresent` builds its signatures from those options. Composing
    // with an order but without them yields a one-shelf Resources that the
    // three-shelf signature does not match — an artifact of the fixture, not of
    // ordering. `cooking` has no options, so the two agree.
    const ctx = templateTargets(cooking).find((t) => t.key === "index:1")!.ctx;
    const ids = RICH_INDEX;
    const out = composeTemplateOrdered(ctx, ids, ["resources"]);
    for (const id of ids) {
      expect(sectionsPresent(out, ctx)).toContain(id);
    }
  });
});

// ── THE WIDGET DOOR, ON A JOURNAL SURFACE (5.26) ─────────────────────────
//
// The journal was the only one of the four surfaces where a hand-written widget
// does not survive: `refreshTemplates` says "Custom edits will be replaced",
// and it means it. The only thing a refresh keeps is what the saved LAYOUT
// names — so on this surface the door is the difference between a widget that
// persists and one that is deleted, and the test that decides whether it worked
// is the recompose at the bottom of this block.
describe("the widget door, on a journal surface (5.26)", () => {
  const lesson = (): SectionContext =>
    sectionContext(STUDY_JOURNAL, {
      kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
    });

  const widgetIds = (ctx: SectionContext): string[] =>
    sectionsFor(ctx)
      .map((s) => s.id)
      .filter(isPageWidgetId);

  it("offers page widgets, one instance each, after the catalogue", () => {
    const ctx = lesson();
    const ids = sectionsFor(ctx).map((s) => s.id);
    const first = ids.findIndex(isPageWidgetId);
    expect(first).toBeGreaterThan(0);
    // A TAIL, NOT A MIXTURE. Everything from the first widget on is a widget,
    // so the catalogue's own order is exactly what it was and `defaultSectionIds`
    // — which reads `locked || default(ctx)` — cannot pick one up.
    expect(ids.slice(first).every(isPageWidgetId)).toBe(true);
    expect(ids.slice(first).every((id) => id.endsWith("#1"))).toBe(true);
    expect(defaultSectionIds(ctx).some(isPageWidgetId)).toBe(false);
  });

  it("and never one the catalogue already claims, on any surface", () => {
    // THE PROPERTY `signaturesFor` DEPENDS ON. Every offered widget gains a
    // single-keyword fence signature, and the parser deals a fence's keywords
    // against signatures all-or-nothing with no instance tally. A widget
    // signature that matched a keyword some catalogue section also writes would
    // be two sections answering for one fence.
    for (const target of templateTargets(STUDY_JOURNAL)) {
      const claimed = new Set(
        sectionsFor(target.ctx)
          .filter((s) => !isPageWidgetId(s.id))
          .flatMap((s) => s.claims)
      );
      for (const id of widgetIds(target.ctx)) {
        const keyword = id.slice("w:".length, id.lastIndexOf("#"));
        expect(claimed.has(keyword), `${target.key}/${keyword}`).toBe(false);
      }
    }
  });

  it("and not the two that need a period a journal note has not got", () => {
    // Part 1's `needs` field. A journal note carries `type:` and its own dates,
    // never `week-start` — so `entry-rollup` would draw its own refusal and
    // `period-nav` would WRITE the property `diaryKindOf` reads.
    const needy = Object.keys(WIDGETS).filter((k) => WIDGETS[k].needs);
    expect(needy.length).toBeGreaterThan(0);
    for (const target of templateTargets(STUDY_JOURNAL)) {
      for (const keyword of needy) {
        expect(widgetIds(target.ctx), `${target.key}/${keyword}`).not.toContain(
          `w:${keyword}#1`
        );
      }
    }
  });

  it("adds one to a note, reads it back, and refuses a second copy", () => {
    const ctx = lesson();
    const base = composeTemplate(ctx);
    expect(sectionsPresent(base, ctx).some(isPageWidgetId)).toBe(false);
    const next = applySections(base, ctx, [
      ...sectionsPresent(base, ctx),
      { id: "w:tasks-table#1", options: { arg: "03 - Journals/Study" } },
    ])!;
    expect(next).toContain("tasks-table:03 - Journals/Study");
    expect(sectionsPresent(next, ctx)).toContain("w:tasks-table#1");
    // Withheld once present, which is `addableSections`' rule for every section
    // and the reason `detectSections` had to learn the tail too.
    expect(detectSections(next, ctx)).toContain("w:tasks-table#1");
    // And a save that changes nothing writes nothing.
    expect(applySections(next, ctx, sectionsPresent(next, ctx))).toBeNull();
  });

  it("and a template composed from a layout that names it keeps it — with its argument", () => {
    // THE WHOLE POINT OF THIS PART, AND THE ONE THING A HAND EDIT CANNOT DO.
    // "Save as layout…" reads the page back into `{sections, options}`, and
    // **Maintenance: refresh journal templates** composes the file from exactly
    // that. So this is the refresh, in the two calls it is made of.
    const ctx = lesson();
    const base = composeTemplate(ctx);
    const edited = applySections(base, ctx, [
      ...sectionsPresent(base, ctx),
      { id: "w:tasks-table#1", options: { arg: "03 - Journals/Study" } },
    ])!;

    const saved = wantFromJournalNote(edited, ctx);
    expect(saved.sections).toContain("w:tasks-table#1");
    expect(saved.options["w:tasks-table#1"]).toEqual({
      arg: "03 - Journals/Study",
    });
    // AND NOTHING IS REPORTED AS DROPPED. The notice this list feeds says which
    // lines a save will not carry; a widget being carried must not appear in
    // it, which is what made the baseline take the options it is about to
    // store.
    expect(saved.drops).toEqual([]);

    const layout = { sections: saved.sections, options: saved.options };
    const refreshed = composeTemplate(ctx, undefined, layout);
    expect(refreshed).toContain("tasks-table:03 - Journals/Study");
    expect(sectionsPresent(refreshed, ctx)).toContain("w:tasks-table#1");

    // AND THE REFRESHED FILE READS AS THE PLUGIN'S OWN. `isHandEdited` composes
    // its baseline from the TYPE's stored config, so the layout has to be ON
    // the type for the question to be asked the way the vault asks it — which
    // is what "save as the default" does one line after `wantFromJournalNote`
    // returns. A journal whose stored layout carries the widget is a journal
    // whose refreshed template is not hand-edited.
    const stored: SectionContext = {
      ...ctx,
      type: {
        ...ctx.type,
        layout: { ...(ctx.type.layout ?? {}), [templateKeyFor(ctx)]: layout },
      },
    };
    expect(isHandEdited(refreshed, stored)).toBe(false);
  });

  it("and a shipped template is untouched by all of it", () => {
    // THE INVARIANT, ON THIS SURFACE. Every preset layout names catalogue ids
    // alone, `defaultSectionIds` cannot tick a widget, and `composeTemplate`
    // writes `ids.has(s.id) || s.locked` — so the tail is invisible to every
    // composer. `test/composed-notes.test.ts` is the byte-level check; this is
    // the one that says why.
    for (const { ctx, text } of allTemplates()) {
      expect(sectionsPresent(text, ctx).some(isPageWidgetId)).toBe(false);
    }
  });
});

// Compose with an explicit `order`, the way the wizard now does on Create.
function composeTemplateOrdered(
  ctx: SectionContext,
  ids: string[],
  order: string[] | undefined
): string {
  return composeTemplate(ctx, ids, order ? { order } : undefined);
}
