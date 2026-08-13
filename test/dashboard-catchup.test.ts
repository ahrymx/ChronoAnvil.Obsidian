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
// it inserts ONLY the missing table — because an offer that quietly rewrote the
// rest of the note would be worse than the silence it replaces.

import { describe, expect, it } from "vitest";
import { studyTemplate } from "./study-template";
import { readCode } from "./sources";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  sectionContext,
  detectSections,
} from "../src/journals/journal-sections";
import { applySections, planSections } from "../src/journals/journal-plan";

// The deepest Study index, which is the surface `children` renders a table per
// kind on — the one place a new kind can leave a dashboard short.
const ctx = () => sectionContext(STUDY_JOURNAL, { depth: 1 });

// A Topic index written before "Practice" existed: its `children` fence carries
// the Lessons header, button and table and nothing else. This is exactly the
// file the follow-up describes, produced by deleting from the shipped one
// rather than by hand, so it cannot drift from what the catalogue composes.
function staleTopicIndex(): string {
  const lines = studyTemplate("topic-index.md").split("\n");
  const from = lines.findIndex((l) => l.trim() === "header:🛠️ Practice");
  expect(from).toBeGreaterThan(-1);
  // Three lines per kind — header, button, table — which is what the fence
  // carries and therefore what a dashboard written before the kind lacks.
  expect(lines[from + 1].trim()).toBe("button:study:new-practice");
  expect(lines[from + 2].trim()).toBe("kind-table:practice");
  return [...lines.slice(0, from), ...lines.slice(from + 3)].join("\n");
}

describe("what the scan finds", () => {
  it("plans an extend on a dashboard missing a kind's table", () => {
    const text = staleTopicIndex();
    const c = ctx();
    // `want` is what the file already has — the same question the section
    // editor asks when a reader opens it and presses Save without touching a
    // row. So the only op this can produce is `extend`.
    const ops = planSections(text, c, detectSections(text, c));
    const extend = ops.filter((o) => o.kind === "extend");
    expect(extend.length).toBe(1);
    expect(extend[0].sectionId).toBe("children");
  });

  it("says which kind is missing, which is what the offer renders", () => {
    // The dialog is the plan rather than a summary of it, so the line a reader
    // reads is this string. "unchanged" was what 3.18.0 said here.
    const text = staleTopicIndex();
    const c = ctx();
    const op = planSections(text, c, detectSections(text, c)).find(
      (o) => o.kind === "extend"
    );
    expect(op?.detail).toContain("Practice");
    expect(op?.detail).not.toBe("unchanged");
  });

  it("finds nothing on a dashboard that is already current", () => {
    // NOTHING TO DO OPENS NOTHING. The common case for a reader who adds a kind
    // to a journal whose dashboards do not exist yet, and the case that would
    // otherwise train them to dismiss the window unread.
    const text = studyTemplate("topic-index.md");
    const c = ctx();
    const ops = planSections(text, c, detectSections(text, c));
    expect(ops.filter((o) => o.kind === "extend")).toEqual([]);
  });

  it("never plans an add, remove or move", () => {
    // The property that makes this safe to offer as one all-or-nothing button:
    // `want` is the file's own section list, so there is nothing to add and
    // nothing to take away.
    const text = staleTopicIndex();
    const c = ctx();
    const ops = planSections(text, c, detectSections(text, c));
    for (const op of ops) {
      expect(["keep", "extend"]).toContain(op.kind);
    }
  });
});

describe("what applying it writes", () => {
  const before = staleTopicIndex();
  const after = applySections(before, ctx(), detectSections(before, ctx()));

  it("inserts the missing table", () => {
    expect(after).not.toBeNull();
    expect(before).not.toContain("kind-table:practice");
    expect(after!).toContain("kind-table:practice");
  });

  it("adds the kind's header and button with it", () => {
    // A table with no header above it and no "new Practice" button beside it
    // would be half a section, which is what the fence carries per kind.
    expect(after!).toContain("header:🛠️ Practice");
    expect(after!).toContain("button:study:new-practice");
  });

  it("leaves every line the file already had", () => {
    // NOTHING IS MOVED OR REWRITTEN — the offer's own words, and the reason a
    // reader can accept it over a dashboard they have edited. Insert-only means
    // the previous text is a subsequence of the new one.
    const from = before.split("\n");
    const to = after!.split("\n");
    let i = 0;
    for (const line of to) if (i < from.length && line === from[i]) i++;
    expect(i).toBe(from.length);
  });

  it("does not append a second copy of the whole section", () => {
    // The failure `extend` exists to avoid: before 3.18 the planner could only
    // say `add`, which appends a duplicate fence beside the short one.
    expect(after!.split("kind-table:lesson").length - 1).toBe(1);
    expect(after!.split("header:📖 Lessons").length - 1).toBe(1);
  });

  it("restores the file the catalogue would have composed", () => {
    // The strongest statement available: catching up a stale dashboard lands on
    // the shipped Topic index exactly, so `extend` inserts in catalogue order
    // rather than at the end of the fence.
    expect(after).toBe(studyTemplate("topic-index.md"));
  });

  it("is a no-op on a dashboard that is already current", () => {
    const current = studyTemplate("topic-index.md");
    const c = ctx();
    expect(applySections(current, c, detectSections(current, c))).toBeNull();
  });
});

describe("where the offer is made", () => {
  const settings = () => readCode("settings-editors");

  it("only after a kind was ADDED", () => {
    // A rename or a removal cannot leave a dashboard short, so offering after
    // one would be a window that appears to say there is nothing to confirm.
    expect(settings()).toContain('changes.some((c) => c.kind === "added")');
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
    expect(settings()).toContain("p.ops.map((o) => `${o.label} — ${o.detail}`)");
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
    const src = settings();
    // `lastIndexOf`, because the import at the head of the file is also a
    // match and would make this pass whatever order the body used.
    const ask = src.indexOf("Add the tables");
    const write = src.lastIndexOf("applyDashboardCatchups");
    expect(ask).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(ask);
    expect(src).toMatch(/if \(!ok\) return;[\s\S]{0,200}applyDashboardCatchups/);
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
