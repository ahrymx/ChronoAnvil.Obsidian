// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patch 1 of 2.60 changes nothing, and this is the whole evidence for that.
//
// The catalogue composes each entry template and the result is diffed BYTE FOR
// BYTE against the file that ships today. These templates carry more than the
// dashboards did — frontmatter trackers, the header fence's tracker block, and
// up to seven regions — so the gate matters more here, not less.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readCode, readSrc } from "./sources";
import { resolve } from "node:path";
import {
  ENTRY_SECTIONS,
  composeEntryTemplate,
  sectionsForEntry,
  removableEntrySections,
  entryRemovalRefusal,
  isMovable,
  removableFrom,
  addSectionToNote,
  detectEntrySections,
  addableEntrySections,
} from "../src/diary/entry-sections";
import type { EntrySection } from "../src/diary/entry-sections";
import { regionHasContent } from "../src/core/notestore";
import { isReconcilable } from "../src/core/scaffold";
import { TRACKER_CLASSES, CLASS_DEFS } from "../src/trackers/trackers";
import type { TrackerClass } from "../src/trackers/trackers";

// The byte-for-byte diff that stood here through 2.60.0 is gone with the asset
// files it compared against. It was a MIGRATION gate, not a standing test: its
// job was to prove the catalogue reproduced what shipped before scaffold was
// allowed to switch over. It did that — it caught the composer being one blank
// line short between the widget fence and the first region, in all five
// templates at once.
//
// Keeping the assets so it could keep running would mean maintaining a second
// copy of the same arrangement plus a test whose only job is to notice the two
// drifting apart — the trade STUDY_COMPOSED refused in 2.42 and the dashboards
// refused in 2.59.3. Composing makes drift impossible rather than detectable.

describe("the composer is what scaffold writes", () => {
  it("leaves no template asset behind to drift from", () => {
    for (const g of TRACKER_CLASSES) {
      expect(
        existsSync(
          resolve(__dirname, "..", "assets", `template-${g}.md`)
        ),
        g
      ).toBe(false);
    }
  });

  it("is the source both scaffold paths read", () => {
    // Two of them: the copy loop that creates a missing template, and
    // refreshTemplates, which rewrites them on request. A composed source for
    // one and an asset for the other would be the drift with extra steps.
    //
    // BOTH NOW PASS THE VAULT'S OWN ADDITIONS, as of 3.8 patch 6, and the
    // assertion has to say so or it pins the bug it was written to prevent: a
    // refresh that composed WITHOUT the extras would silently strip every
    // section a reader had added to their grain, on a command whose whole job
    // is to bring the template up to date.
    //
    // AND THE ORDER TRAVELS WITH THEM, as of 4.29. Membership and order are two
    // settings keys, and a path that read one without the other would compose a
    // template differing from the one on disk by a reorder — so the drift
    // survey would offer to undo every save the reader had made. That is the
    // same failure one field over, which is why it is the same assertion.
    const src = readSrc("scaffold");
    expect(
      src.match(
        /composeEntryTemplate\(cls, extras\[cls\] \?\? \[\], bands\[cls\] \?\? \[\]\)/g
      )?.length
    ).toBe(2);
    expect(src).not.toContain("composeEntryTemplate(cls)");
  });

  it("keeps templates out of layout reconciliation, by flag not filename", () => {
    // The exclusion was `asset.startsWith("template-")` — a filename test,
    // which stops answering the moment a template stops being a file. Composed
    // templates have no asset name, so they would silently have become
    // reconcilable and every repair would have rewritten them.
    //
    // ASSERTED ON THE PREDICATE AS OF 4.1.2, not on the line. This read
    // `toContain("if (note.template) continue;")` — the right rule pinned to
    // one of the two places that stated it, which is how the OTHER place came
    // to state it wrongly and go unnoticed (see layout.test.ts). Both walks now
    // ask `isReconcilable`, so the rule can be exercised instead of quoted.
    expect(
      isReconcilable({ dest: "Templates/Daily.md", content: "x", template: true })
    ).toBe(false);
    // …and a note whose NAME looks like the old filename test is reconciled,
    // which is the half a string match could never make.
    expect(isReconcilable({ dest: "template-daily.md", content: "x" })).toBe(true);
    expect(readCode("scaffold")).not.toContain('startsWith("template-")');
  });

  it("still opens each template with its frontmatter and the spacer", () => {
    // What the byte-diff protected, kept as a property rather than a snapshot.
    for (const g of TRACKER_CLASSES) {
      const out = composeEntryTemplate(g);
      expect(out.startsWith("---\n"), g).toBe(true);
      expect(out, g).toContain("`chronoanvil:spacer`");
      expect(out, g).toContain(`journal: ${CLASS_DEFS[g].journalProperty}`);
      expect(out.endsWith("\n"), g).toBe(true);
    }
  });
});

describe("a section is a widget and its region", () => {
  it("uses the region key as the section's identity", () => {
    // The key already has to be unique in a note and is already what binds the
    // directive to the reader's text. A separate id would be a second name for
    // one thing.
    // Shared sections only: a locked one is structure and owns no region, so
    // its id is a name rather than a key. That split is the point of `fence`.
    for (const s of ENTRY_SECTIONS.filter((x) => x.fence === "shared")) {
      const daily = s.directive({ grain: "daily" });
      if (daily) expect(daily, s.id).toContain(`:${s.id}`);
    }
  });

  it("gives every section an id, a label and a blurb", () => {
    for (const s of ENTRY_SECTIONS) {
      expect(s.id, s.id).toBeTruthy();
      expect(s.label, s.id).toBeTruthy();
      expect(s.blurb, s.id).toBeTruthy();
    }
  });

  it("gives each section a distinct id", () => {
    const ids = ENTRY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("pairs every directive with a region, and no region without one", () => {
    // The invariant that makes removal coherent: an orphaned region is text
    // nothing owns, and a directive with no region has nowhere to write.
    for (const grain of TRACKER_CLASSES) {
      const out = composeEntryTemplate(grain);
      const shared = sectionsForEntry({ grain }).filter(
        (s) => s.fence === "shared"
      );
      for (const s of shared) {
        expect(out, `${grain}/${s.id}`).toContain(`<!--chronoanvil:${s.id}`);
      }
      const regions = [...out.matchAll(/<!--chronoanvil:([a-z-]+)/g)].map(
        (m) => m[1]
      );
      expect(regions.sort()).toEqual(shared.map((s) => s.id).sort());
    }
  });
});

describe("what the catalogue made visible", () => {
  // Divergences that were invisible as five files and are obvious as one
  // description. None is changed here; each is pinned so a patch that does
  // change it cannot do so quietly.

  it("gives highlights and challenges to every grain, as a pair", () => {
    // 3.11 §4.1. `highlights` shipped on four grains and `challenges` on one,
    // and nothing anywhere said a week has highlights but no challenges —
    // they are one question asked twice. Written as a pair rather than as two
    // tests, because the pairing is the assertion: fixing one without the
    // other would leave the asymmetry pointing the other way.
    for (const g of TRACKER_CLASSES) {
      const ids = sectionsForEntry({ grain: g }).map((s) => s.id);
      expect(ids, g).toContain("highlights");
      expect(ids, g).toContain("challenges");
    }
  });

  it("gives attachments to every grain", () => {
    // 3.11 §4.2. Daily and monthly, with no comment explaining the other
    // three. A weekly entry can have a photo.
    for (const g of TRACKER_CLASSES) {
      expect(
        sectionsForEntry({ grain: g }).map((s) => s.id),
        g
      ).toContain("attachments");
    }
  });

  it("gives daily and monthly a longer Notes label than the rest", () => {
    // "Notes, reflections & learnings" against "Notes". One of them is probably
    // a decision and the other probably an oversight, and as five files there
    // was no way to see they differed at all.
    const label = (g: TrackerClass): string =>
      (ENTRY_SECTIONS.find((s) => s.id === "log")?.directive({ grain: g }) ??
        "").split("|")[1];
    expect(label("daily")).toBe("Notes, reflections & learnings");
    expect(label("weekly")).toBe("Notes");
  });

  it("writes daily's date property first and quoted, unlike the others", () => {
    expect(composeEntryTemplate("daily").startsWith('---\njournal-date: ""')).toBe(
      true
    );
    expect(composeEntryTemplate("weekly").startsWith("---\nweek-start:\n")).toBe(
      true
    );
  });

  it("carries both month and journal-date on a monthly entry", () => {
    const out = composeEntryTemplate("monthly");
    expect(out).toContain("\nmonth:\n");
    expect(out).toContain('\njournal-date: ""\n');
  });

  it("seeds tracker markers on every grain, and values on daily alone", () => {
    // The markers are machine-owned in both places they appear — the tracker
    // system rewrites between them on every settings change — which is why they
    // are not sections here and why §2 counts them as locked.
    for (const g of TRACKER_CLASSES) {
      const out = composeEntryTemplate(g);
      expect(
        (out.match(/# chronoanvil:trackers:start/g) ?? []).length,
        g
      ).toBe(2);
    }
    expect(composeEntryTemplate("daily")).toContain("tracker:Mood");
    expect(composeEntryTemplate("weekly")).not.toContain("tracker:Mood");
  });
});

describe("locked means unremovable, not unmovable", () => {
  it("locks exactly the one structural section", () => {
    // 2.60.0 left these out of the catalogue on the grounds that they own no
    // region. True, and the wrong reason: a section an editor cannot SEE cannot
    // be reordered either, and §2's claim is that the lock is on existence
    // rather than position.
    //
    // TWO BECAME ONE IN 4.19. `links` and `entry-header` composed into a single
    // fence from 3.2 onward, so an entry has drawn one banner and reported two
    // sections for eight releases; the merge closed that. The lock is unchanged
    // and its argument is unchanged — there is one section carrying it now.
    // AND THE TRACKER GRID, AS OF 4.20. It left the banner's fence to become a
    // section, and it carries a lock of its own rather than an inherited one:
    // every diary chart on every dashboard is a view over these cells, so a note
    // with no grid silently empties the pages above it.
    expect(ENTRY_SECTIONS.filter((s) => s.locked).map((s) => s.id)).toEqual([
      "banner",
      "trackers",
    ]);
  });

  it("offers every other section for removal", () => {
    for (const g of TRACKER_CLASSES) {
      const removable = removableEntrySections({ grain: g }).map((s) => s.id);
      expect(removable, g).not.toContain("banner");
      expect(removable, g).toContain("focus");
    }
  });

  it("locks all and only the sections that own no region", () => {
    // The two halves of an entry as an invariant: a section holding the
    // reader's writing is theirs to remove, and a section that is structure has
    // no writing to lose.
    // "OWNS NO REGION" IS THE RULE, AND `fence` STOPPED BEING ITS PROXY IN 4.20.
    // The two coincided while `own` was the only fence above the rule; the
    // tracker grid now has a third, owns no region either, and is locked for its
    // own reason. Asked directly rather than through a fence, which is what the
    // sentence above always meant.
    for (const s of ENTRY_SECTIONS) {
      expect(s.locked, s.id).toBe(s.fence !== "shared");
    }
  });

  it("keeps a locked section above the rule", () => {
    // `fence` is a property rather than a position, so reordering within a half
    // cannot move a section across the rule — which would put a banner among
    // the widgets, or a notes field above it.
    for (const g of TRACKER_CLASSES) {
      const out = composeEntryTemplate(g);
      const rule = out.indexOf("\n---\n", out.indexOf("`chronoanvil:spacer`"));
      expect(out.indexOf("entry-header"), g).toBeLessThan(rule);
      expect(out.indexOf("tasks:todo"), g).toBeGreaterThan(rule);
    }
  });

  it("builds the structural fence from the catalogue, not a skeleton", () => {
    // Was `own.flatMap(ownFence)` while each structural section had a fence of
    // its own; then `own.flatMap(ownLines)` when 3.2 patch 2 made it one fence;
    // now `bandFences(own, …)`, since 4.70 makes it one fence PER ROW RUN. The
    // assertion has followed each rename and what it guards is unchanged: the
    // composer enumerates the catalogue rather than hardcoding two directives it
    // happens to know.
    expect(readSrc("entry-sections")).toContain("bandFences(own, ownLines)");
  });
});


// ── 2.60.3: a section holding your writing cannot be removed ──────────

describe("removal refuses on the reader's writing", () => {
  const fresh = composeEntryTemplate("daily");
  const written = fresh.replace(
    "<!--chronoanvil:log\n-->",
    "<!--chronoanvil:log\nThree paragraphs about March.\n-->"
  );
  const sec = (id: string) =>
    ENTRY_SECTIONS.find((s) => s.id === id) as EntrySection;

  it("allows removing an untouched section", () => {
    // The section someone most wants gone is the one they have never used, so
    // a rule that refused here would make the feature useless.
    expect(entryRemovalRefusal(sec("log"), fresh)).toBeNull();
  });

  it("refuses once there is writing in it", () => {
    const why = entryRemovalRefusal(sec("log"), written);
    expect(why).toContain("Holds your writing");
    expect(why).toContain("Clear it first");
  });

  it("treats a whitespace-only region as untouched", () => {
    // Every region ships as a marker, a blank line and a closing marker — that
    // blank line is where the first keystroke goes. A byte test would refuse to
    // remove a section nobody has touched.
    const spaces = fresh.replace("<!--chronoanvil:log\n-->", "<!--chronoanvil:log\n   \n\n-->");
    expect(entryRemovalRefusal(sec("log"), spaces)).toBeNull();
  });

  it("refuses a locked section for being locked, not for its contents", () => {
    // Order matters: telling someone to clear their notes before removing a
    // banner that was never going anywhere sends them to do pointless work.
    const why = entryRemovalRefusal(sec("banner"), written);
    expect(why).toContain("can't be removed");
    expect(why).not.toContain("Clear it first");
  });

  it("no longer offers a move neither structural section has", () => {
    // Up to 3.1 this asserted "You can move it, though." on `links`, and that
    // sentence was the whole point of 3.0 patch 1. 3.2 §4 pins navigation, so
    // the sentence would be false — and false for `entry-header` too, which is
    // now alone among its band's movable members. A refusal that promises a
    // move nothing performs is the exact defect 3.0 was built to correct, so
    // both messages drop it and the pinned one says what the rule is.
    const banner = entryRemovalRefusal(sec("banner"), fresh)!;
    expect(banner).toContain("Part of every entry");
    expect(banner).not.toContain("You can still move it");
  });

  it("narrows what an editor offers on THIS note", () => {
    const ids = removableFrom({ grain: "daily" }, written).map((s) => s.id);
    expect(ids).not.toContain("log");
    expect(ids).not.toContain("banner");
    expect(ids).toContain("focus");
  });
});

describe("both halves of the vault agree on 'empty'", () => {
  it("shares one definition rather than two spellings", () => {
    // Journal sections have refused on this condition since 2.59.7. Two tests
    // for "is there anything in here" would be two answers waiting to disagree
    // about a stray space.
    expect(readSrc("entry-sections")).toContain("regionHasContent");
    expect(readSrc("notestore")).toContain("export function regionHasContent");
  });

  it("agrees with the journal side that blank lines are not content", () => {
    // journal-plan's regionsIn counts only non-blank lines; regionHasContent
    // trims. Same answer, asserted rather than assumed.
    const region = "<!--chronoanvil:log\n  \n\n-->";
    expect(regionHasContent(region, "log")).toBe(false);
    expect(regionHasContent("<!--chronoanvil:log\n x\n-->", "log")).toBe(true);
  });
});

// ── 2.60.4: add here, or add to every entry of this grain ─────────────

describe("adding a section to every entry of a grain", () => {
  it("is a setting the composer reads, not a file edit", () => {
    // Templates are composed since 2.60.1, so there is no file to edit. Same
    // shape `showInTemplate` already has for trackers: one place that decides
    // what a NEW entry starts with.
    //
    // ON `capture` SINCE 3.11 §4.1, for the reason given at "adding a section
    // to one note": this was `challenges` on a weekly entry, and §4.1 gave
    // every grain its own. `capture` is daily-alone and structurally so, which
    // is what `challenges` accidentally was.
    const plain = composeEntryTemplate("weekly");
    const withIt = composeEntryTemplate("weekly", ["capture"]);
    expect(plain).not.toContain("capture");
    expect(withIt).toContain("note:capture");
    expect(withIt).toContain("<!--chronoanvil:capture");
  });

  it("borrows the wording from the nearest grain that has one", () => {
    // `capture` ships on daily alone, so a weekly entry that wants one has no
    // text of its own. Borrowing is what makes the feature possible at all;
    // walking the class table makes which grain it borrows from a rule rather
    // than an accident.
    expect(composeEntryTemplate("weekly", ["capture"])).toContain(
      "note:capture#collapse:Captured thoughts land here…|Captured"
    );
  });

  it("stays additive, so a later release still reaches a customised grain", () => {
    // A stored full ORDERING would freeze the shipped set at the moment someone
    // first customised, and a section added to daily entries in a later release
    // would never reach them.
    const ids = sectionsForEntry({ grain: "weekly", extra: ["challenges"] }).map(
      (s) => s.id
    );
    for (const shipped of ["focus", "highlights", "log", "todo"]) {
      expect(ids, shipped).toContain(shipped);
    }
  });

  it("ignores an extra the grain already has", () => {
    const twice = composeEntryTemplate("monthly", ["challenges"]);
    expect(twice.match(/list:challenges/g)).toHaveLength(1);
    expect(twice.match(/<!--chronoanvil:challenges/g)).toHaveLength(1);
  });
});

describe("adding a section to one note", () => {
  const daily = composeEntryTemplate("daily");
  // WEEKLY + `capture` IS THE BORROWED-WORDING FIXTURE, as of 3.11 §4.1.
  //
  // These tests used daily + `highlights` — a section that shipped on weekly
  // and up, so a daily entry asking for one borrowed the nearest grain's
  // wording. §4.1 gave every grain its own highlights, which is right for the
  // template and leaves this fixture with nothing to add.
  //
  // `capture` is now the mirror of what `highlights` was: daily alone and
  // structurally so, since capture writes to the day you are on. So a WEEKLY
  // entry asking for one is the same fallback through the same code path, and
  // the tests below exercise what they always did.
  const weekly = composeEntryTemplate("weekly");
  const sec = (id: string) =>
    ENTRY_SECTIONS.find((s) => s.id === id) as EntrySection;

  it("writes the directive and its region together", () => {
    const out = addSectionToNote(weekly, { grain: "weekly" }, sec("capture"));
    expect(out).toContain("note:capture");
    expect(out).toContain("<!--chronoanvil:capture");
  });

  it("returns null when the note already has it", () => {
    // The no-change convention. A rewrite that changes nothing still bumps
    // mtime, and on the diary side mtime is the source of truth for what is
    // stale.
    expect(addSectionToNote(daily, { grain: "daily" }, sec("log"))).toBeNull();
  });

  it("adds at the end rather than in the catalogue's order", () => {
    // A reader who rearranged their entry arranged it. Inserting into the
    // middle of their arrangement to satisfy a canonical order would undo a
    // customisation in the name of adding one.
    const lines = (
      addSectionToNote(weekly, { grain: "weekly" }, sec("capture")) as string
    ).split("\n");
    // The last widget fence: find its opener, then its closer, and assert the
    // new directive is the line immediately above the closer.
    const open = lines.lastIndexOf("```chronoanvil");
    const close = lines.indexOf("```", open + 1);
    // Daily's own wording, borrowed intact — the fallback copies the
    // directive rather than inventing a weekly phrasing for it.
    expect(lines[close - 1]).toBe(
      "note:capture#collapse:Captured thoughts land here…|Captured"
    );
  });

  it("re-adds a directive whose region survived a hand deletion", () => {
    // Checked by DIRECTIVE, not by region: a region outlives its directive when
    // someone deletes the line by hand, and re-adding it is exactly what that
    // reader wants. A region test would refuse them.
    const orphaned = daily.replace("note:capture#collapse:Captured thoughts land here…|Captured\n", "");
    expect(addSectionToNote(orphaned, { grain: "daily" }, sec("capture"))).not.toBeNull();
  });

  it("refuses a locked section, which belongs above the rule", () => {
    expect(addSectionToNote(daily, { grain: "daily" }, sec("banner"))).toBeNull();
  });
});

// ── 3.2 §4: what "fixed" is derived from ──────────────────────────────

describe("immovability is derived, not declared", () => {
  it("pins exactly one section, and it is the banner", () => {
    expect(ENTRY_SECTIONS.filter((s) => s.pinned).map((s) => s.id)).toEqual([
      "banner",
    ]);
  });

  it("makes the banner immovable, and by decision now rather than arithmetic", () => {
    // TWO WAYS TO HAVE NOWHERE TO GO, AND ONLY ONE OF THEM IS A DECISION.
    // `links` was fixed because 3.2 §4 said so; `entry-header` was fixed because
    // the pin left it alone among its band's movable members — arithmetic, not
    // policy, and the reason nobody wrote `movable: false` on it by hand.
    //
    // 4.19 MERGED THE PAIR, SO THE ARITHMETIC HAS NOTHING LEFT TO COMPUTE. The
    // band has one member, it carries the pin the navigation row brought with
    // it, and `isMovable` answers from the flag rather than from the count. Both
    // routes still lead to the same answer, which is what the next test checks.
    const banner = ENTRY_SECTIONS.find((s) => s.id === "banner")!;
    expect(banner.pinned).toBe(true);
    expect(isMovable(banner)).toBe(false);
  });

  it("would still derive immovability if the pin were ever lifted", () => {
    // The test that makes the previous one worth having. `isMovable` must not
    // become "read the flag": a band of one has nowhere to trade places to
    // whatever the flag says, and the day a second structural section arrives
    // the rule has to notice on its own.
    const band = ENTRY_SECTIONS.filter((s) => s.fence === "own");
    expect(band.map((s) => s.id)).toEqual(["banner"]);
    // One unpinned member is what makes it false; the rule reads "more than
    // one", so the day a second arrives it flips on its own.
    expect(readSrc("entry-sections")).toContain("!s.pinned).length >");
  });

  it("leaves everything below the rule movable", () => {
    for (const s of ENTRY_SECTIONS.filter((x) => x.fence === "shared")) {
      expect(isMovable(s), s.id).toBe(true);
    }
  });
});

// ── 3.2 patch 2: one structural fence ─────────────────────────────────
//
// The merge 2.18.4 started and stopped one fence short. Obsidian renders each
// ```chronoanvil fence as its own block, so two fences above the rule can be made
// to RESEMBLE one card and cannot be made into one. These assert the shape, and
// then — more importantly — that the parser still reads the shape every entry
// on disk is currently in.

const structuralFence = (text: string): string[] => {
  const lines = text.split("\n");
  const open = lines.findIndex((l) => l.trim() === "```chronoanvil");
  const close = lines.indexOf("```", open + 1);
  expect(open).toBeGreaterThan(0);
  expect(close).toBeGreaterThan(open);
  return lines.slice(open + 1, close);
};

// A pre-3.2 entry: the same directives, split back into a fence apiece with no
// blank line between them, which is exactly what 3.1's composer wrote.
// A pre-3.2 entry: the same directives, split back into a fence apiece with no
// blank line between them, which is exactly what 3.1's composer wrote.
const legacyEntry = (grain: TrackerClass = "daily"): string => {
  const text = composeEntryTemplate(grain);
  return text.replace(
    "```chronoanvil\nentry-header\n",
    "```chronoanvil\nlinks:home,today,scopes#diary\n```\n```chronoanvil\nentry-header\n"
  );
};

describe("the structural half is one fence", () => {
  it("holds the entry-header directive", () => {
    for (const g of TRACKER_CLASSES) {
      const body = structuralFence(composeEntryTemplate(g));
      expect(body, g).toContain("entry-header");
      expect(body, g).not.toContain("links:home,today,scopes#diary");
    }
  });

  it("and there are exactly two of them above the rule (4.20)", () => {
    // ONE UNTIL 4.20, AND THE SECOND IS THE POINT OF THAT RELEASE. The banner is
    // the file's name, its navigation and the control that edits it; the tracker
    // grid is the note's most-used content and was in that fence only because
    // the fence was the only place above the rule for its markers to live.
    //
    // STILL EXACTLY TWO, not "at least". A third fence above the rule means
    // something has been composed there without an argument, and the rule this
    // guards — that the reader's own writing is what lives below — is easiest to
    // erode by adding structure a line at a time.
    for (const g of TRACKER_CLASSES) {
      const text = composeEntryTemplate(g);
      const rule = text.indexOf("\n---\n", text.indexOf("`chronoanvil:spacer`"));
      const above = text.slice(0, rule);
      expect((above.match(/```chronoanvil/g) ?? []).length, g).toBe(2);
    }
  });

  it("keeps the tracker markers out of the banner and in a block of their own", () => {
    // The inverse of what this asserted until 4.20, and for the argument in the
    // test above. What has NOT changed is that the markers are composed at all
    // and are above the rule — `locateTrackerRegion` needs them to exist and
    // `EntrySection.fence` needs them to be structure rather than writing.
    for (const g of TRACKER_CLASSES) {
      const text = composeEntryTemplate(g);
      expect(structuralFence(text), g).not.toContain("# chronoanvil:trackers:start");
      const rule = text.indexOf("\n---\n", text.indexOf("`chronoanvil:spacer`"));
      const above = text.slice(0, rule);
      expect(above, g).toContain("# chronoanvil:trackers:start");
      expect(above, g).toContain("# chronoanvil:trackers:end");
    }
  });

  it("still puts the reader's own sections below the rule", () => {
    for (const g of TRACKER_CLASSES) {
      const text = composeEntryTemplate(g);
      const rule = text.indexOf("\n---\n", text.indexOf("`chronoanvil:spacer`"));
      expect(text.indexOf("entry-header"), g).toBeLessThan(rule);
      expect(text.indexOf("tasks:todo"), g).toBeGreaterThan(rule);
    }
  });
});

describe("the parser reads both shapes", () => {
  it("finds both structural sections in a merged fence", () => {
    // THE LINE THIS PATCH WOULD HAVE BROKEN SILENTLY. The classifier used to
    // take the FIRST structural directive a fence held, so a merged fence
    // resolved to `links` alone and `entry-header` disappeared from the editor
    // that was about to rewrite around it.
    for (const g of TRACKER_CLASSES) {
      const ids = detectEntrySections(composeEntryTemplate(g), { grain: g });
      expect(ids.slice(0, 1), g).toEqual(["banner"]);
    }
  });

  it("finds both in a not-yet-migrated entry too", () => {
    // Every entry on disk is still two fences until patch 7 runs. A parser that
    // only understood the new shape would make the editor blind to every note
    // somebody already has — which is a worse failure than the one patch 2
    // fixes, and would ship in the same release.
    for (const g of TRACKER_CLASSES) {
      const ids = detectEntrySections(legacyEntry(g), { grain: g });
      expect(ids.slice(0, 1), g).toEqual(["banner"]);
    }
  });

  it("reads the same sections from both shapes", () => {
    const merged = detectEntrySections(composeEntryTemplate("daily"), {
      grain: "daily",
    });
    const legacy = detectEntrySections(legacyEntry("daily"), { grain: "daily" });
    expect(legacy).toEqual(merged);
  });

  it("does not mistake the merged fence for the widget fence", () => {
    // `addSectionToNote` writes into the LAST fence that holds a shared
    // directive and no structural one. The merged fence holds two structural
    // directives, so it must stay ineligible — otherwise adding a section would
    // drop a `note:` line into the banner.
    const text = composeEntryTemplate("daily");
    const addable = addableEntrySections({ grain: "daily" }, text);
    expect(addable.length).toBeGreaterThan(0);
    const next = addSectionToNote(text, { grain: "daily" }, addable[0])!;
    expect(next).not.toBeNull();
    expect(structuralFence(next)).toEqual(structuralFence(text));
  });

  it("and offers nothing structural to add, on either shape", () => {
    for (const text of [composeEntryTemplate("daily"), legacyEntry("daily")]) {
      const ids = addableEntrySections({ grain: "daily" }, text).map((s) => s.id);
      expect(ids).not.toContain("links");
      expect(ids).not.toContain("entry-header");
    }
  });
});

// ── THE PROPERTY THAT MADE THE SHARED BAND SAFE TO SPLIT (4.70) ──────────
//
// Until this release the shared band was ONE fence, on purpose, and the rule was
// argued in this file's header: the band renders as one card (2.18.4). 4.70
// re-opens it, because a `row` divides a single fence into columns and one fence
// cannot hold two independent rows — so Focus|Tasks and Highlights|Challenges
// need the band to be one fence PER ROW RUN.
//
// That is an unbounded-looking change to five shipped templates, and this is the
// bound. The band splits ON ROW IDS AND NOTHING ELSE: take the row ids away and
// the catalogue composes exactly what it composed before, one fence, in one
// order, byte for byte. Every template that declares no rows is therefore
// untouched by the change — which is the whole of the risk, discharged by a
// comparison rather than by a reading.
//
// MUTATES THE CATALOGUE AND PUTS IT BACK, because that is the only way to ask
// the question: `composeEntryTemplate` reads the module's own array, and a copy
// of it would be testing a copy of the rule. The restore is in a `finally` so a
// failing expectation cannot leak a rowless catalogue into the next file.
describe("splitting the shared band is caused by row ids and nothing else", () => {
  const withoutRows = <T>(run: () => T): T => {
    const saved = ENTRY_SECTIONS.map((s) => s.row);
    for (const s of ENTRY_SECTIONS) delete (s as { row?: string }).row;
    try {
      return run();
    } finally {
      ENTRY_SECTIONS.forEach((s, i) => {
        if (saved[i] !== undefined) (s as { row?: string }).row = saved[i];
      });
    }
  };

  const bands = (text: string): string[][] =>
    text
      .split("```chronoanvil\n")
      .slice(1)
      .map((chunk) => chunk.split("\n```")[0].split("\n"))
      .filter((lines) => lines.some((l) => /^(note|list|tasks|attach):/.test(l)));

  for (const grain of ["daily", "weekly", "monthly", "quarterly", "yearly"] as const) {
    it(`composes ${grain} as one shared fence when no section declares a row`, () => {
      const rowless = withoutRows(() => composeEntryTemplate(grain));
      const shipped = composeEntryTemplate(grain);

      // ONE fence, where the shipped template has one per row run.
      expect(bands(rowless)).toHaveLength(1);
      expect(bands(shipped).length).toBeGreaterThanOrEqual(1);

      // And its contents are the shipped fences' contents, in the same order,
      // with only the `row` lines gone. Not "similar" — the same lines.
      expect(bands(rowless)[0]).toEqual(
        bands(shipped)
          .flat()
          .filter((l) => l !== "row" && l !== "cell")
      );

      // The rest of the file — frontmatter, banner, trackers fence, regions, the
      // graph link — is untouched either way, which is the other half of the
      // bound: the split moved a boundary and nothing else on the page.
      const outside = (t: string): string =>
        t.replace(/```chronoanvil\n[\s\S]*?\n```\n/g, "").replace(/\n{2,}/g, "\n").trimEnd();
      expect(outside(rowless)).toBe(outside(shipped));
    });
  }
});
