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
  applyEntrySections,
  composeEntryTemplate,
  sectionsForEntry,
  removableEntrySections,
  entryRemovalRefusal,
  isMovable,
  offerableEntrySections,
  removableFrom,
  addSectionToNote,
  detectEntrySections,
  addableEntrySections,
  entrySectionModel,
} from "../src/diary/entry-sections";
import { weldEntryFences } from "../src/trackers/entry-trackers";
import { WIDGETS } from "../src/core/widget-registry";
import { isPageWidgetId } from "../src/core/widget-sections";
import { blockTitle, fieldBand } from "../src/ui/widgets/index";
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
    for (const s of ENTRY_SECTIONS.filter((x) => x.band === "shared")) {
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
        (s) => s.band === "shared"
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
      expect(s.locked, s.id).toBe(s.band !== "shared");
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
    // then `bandFences(own, ownLines)`, since 4.70 makes it one fence PER ROW
    // RUN; and now `bandFences(own)` alone, because 5.22 put `ownLines` on the
    // section as `render`. The assertion has followed each rename and what it
    // guards is unchanged: the composer enumerates the catalogue rather than
    // hardcoding two directives it happens to know.
    expect(readSrc("entry-sections")).toContain("bandFences(own)");
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
    const band = ENTRY_SECTIONS.filter((s) => s.band === "own");
    expect(band.map((s) => s.id)).toEqual(["banner"]);
    // One unpinned member is what makes it false; the rule reads "more than
    // one", so the day a second arrives it flips on its own.
    //
    // AND IT COUNTS THE GROUP RATHER THAN THE BAND FIELD (1.0.10). The two
    // stopped being the same thing when the grid's band started displaying as
    // the banner's: what the arithmetic is about is a second SLOT in the list
    // the reader is looking at, and the list is grouped by the string.
    expect(readSrc("entry-sections")).toContain("!s.pinned\n    ).length > 1");
  });

  it("makes the grid movable because it can be welded, not because it can swap", () => {
    // THE THIRD WAY TO HAVE SOMEWHERE TO GO (1.0.10), and the one that is not a
    // slot. `bandOf` in the section editor drops an immovable row out of its own
    // band, and the weld is read off that band — so a grid answering false here
    // is a grid whose weld button cannot be drawn, whatever `WELDS_INTO_BANNER`
    // says about it.
    const grid = ENTRY_SECTIONS.find((s) => s.id === "trackers")!;
    expect(isMovable(grid)).toBe(true);
    // NOT BY THE ARITHMETIC, which is the part worth pinning: the grid shares
    // its group with one pinned section and nothing else, so the count route
    // answers false and the weld clause is the only thing that can be making
    // this true.
    expect(
      ENTRY_SECTIONS.filter((s) => s.band !== "shared" && !s.pinned).map(
        (s) => s.id
      )
    ).toEqual(["trackers"]);
    // AND IT IS STILL NOT A REORDER. The banner is pinned, so the band the
    // arrows read holds this row alone.
    expect(isMovable(ENTRY_SECTIONS.find((s) => s.id === "banner")!)).toBe(false);
  });

  it("leaves everything below the rule movable", () => {
    for (const s of ENTRY_SECTIONS.filter((x) => x.band === "shared")) {
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

// ── THE WIDGET DOOR, ON AN ENTRY (5.26) ──────────────────────────────────
//
// The homepage, the Search note and both logbook notes have offered every page
// widget their catalogue does not already claim since 4.12; a diary entry
// offered none. That was structural rather than decided — an entry's shared
// band IS a widget fence, and a directive typed into it by hand has always
// rendered and always survived a save — so what these tests pin is that the
// door opened onto the fence the reader already had, and onto nothing else.
describe("the widget door, on an entry (5.26)", () => {
  const ctx = { grain: "daily" as const } as const;
  const offered = (): string[] =>
    offerableEntrySections(ctx)
      .map((s) => s.id)
      .filter(isPageWidgetId);

  // The last ```chronoanvil fence in a note, which is the shared band.
  const sharedFence = (text: string): string[] => {
    const fences = text.split("```chronoanvil\n").slice(1);
    return fences[fences.length - 1].split("\n```")[0].split("\n");
  };

  const withWidget = (id: string, keyword: string): string => {
    const base = composeEntryTemplate("daily");
    const next = applyEntrySections(base, ctx, [
      ...detectEntrySections(base, ctx),
      id,
    ]);
    expect(next, keyword).not.toBeNull();
    return next!;
  };

  it("offers page widgets, one instance of each and no more", () => {
    const ids = offered();
    expect(ids.length).toBeGreaterThan(20);
    // `w:<keyword>#1` and never `#2`. The limit is `parseEntry`'s: it
    // attributes a LINE inside the shared fence by probe with no instance
    // tally, so a second `logbook` line would be found by the first section's
    // probe and by that one alone.
    expect(ids.every((id) => id.endsWith("#1"))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    // Every one of them is a registry keyword the entry catalogue does not
    // claim — `focus`, `log` and the rest are `note:`/`list:` directives and
    // are not page widgets at all.
    for (const id of ids) {
      const keyword = id.slice("w:".length, id.lastIndexOf("#"));
      expect(WIDGETS[keyword], keyword).toBeDefined();
    }
  });

  it("and not the two that need a period this note has not got", () => {
    // Part 1's `needs` field, on the surface it was added for. A daily entry
    // carries `journal-date`; `entry-rollup` would draw its own refusal here,
    // and `period-nav` would WRITE `week-start` onto the note, which is the
    // property `diaryKindOf` reads to decide a diary note is a weekly one.
    for (const keyword of Object.keys(WIDGETS).filter((k) => WIDGETS[k].needs)) {
      expect(offered(), keyword).not.toContain(`w:${keyword}#1`);
    }
    expect(Object.values(WIDGETS).filter((w) => w.needs).length).toBeGreaterThan(0);
  });

  it("composes an added widget into the shared fence and nowhere else", () => {
    const base = composeEntryTemplate("daily");
    const next = withWidget("w:tasks-table#1", "tasks-table");
    expect(sharedFence(next)).toContain("tasks-table");
    // ITS DIRECTIVE ONLY. A `header:` line in this fence would title the whole
    // BAND rather than the widget under it — every section of an entry shares
    // the fence — so the one widget that wears a bar on a flat note writes
    // none here.
    expect(next).not.toContain("header:");
    // AND NO REGION. A page widget owns no keyed span, which is the structural
    // rule the whole of `WIDGETS` is built on, so the reader's prose below the
    // fence is exactly what it was.
    const regions = (t: string): string[] =>
      [...t.matchAll(/<!--chronoanvil:([\w-]+)/g)].map((m) => m[1]);
    expect(regions(next)).toEqual(regions(base));
    // The two structural fences above the rule are untouched.
    expect(next.slice(0, next.indexOf("\n---\n\n"))).toBe(
      base.slice(0, base.indexOf("\n---\n\n"))
    );
  });

  it("is found again by the parser, and refused a second copy", () => {
    const next = withWidget("w:tasks-table#1", "tasks-table");
    expect(detectEntrySections(next, ctx)).toContain("w:tasks-table#1");
    // Withheld rather than offered and refused — `addableEntrySections`' rule
    // for every section already in the note.
    expect(addableEntrySections(ctx, next).map((s) => s.id)).not.toContain(
      "w:tasks-table#1"
    );
    // And saving with no change is still a no-op, which is what says the write
    // path and the read path agree about the line.
    expect(applyEntrySections(next, ctx, detectEntrySections(next, ctx))).toBeNull();
  });

  it("and the grain's template carries it when the setting names it", () => {
    // `EntryTemplates.saveDefault` turns the note a reader is looking at into
    // the grain's default: it reads the page's present sections and writes
    // their ids into `entrySections[grain]`. Add a widget, save as default,
    // and the id in that list is a `w:` one — so the composer has to know it.
    const plain = composeEntryTemplate("daily");
    const withIt = composeEntryTemplate("daily", [{ id: "w:tasks-table#1" }], []);
    expect(plain).not.toContain("tasks-table");
    expect(sharedFence(withIt)).toContain("tasks-table");
    expect(sectionsForEntry({ ...ctx, extra: ["w:tasks-table#1"] }).map((s) => s.id))
      .toContain("w:tasks-table#1");
    // NAMED ONLY, NEVER BY DEFAULT — which is why no shipped template moved.
    expect(sectionsForEntry(ctx).map((s) => s.id).some(isPageWidgetId)).toBe(false);
  });

  it("and a pre-3.2 entry's own links fence is still not the widget fence", () => {
    // THE REGRESSION THIS DOOR NEARLY SHIPPED. `links` is a page widget and
    // this catalogue no longer claims it — the banner composes `entry-header`
    // alone since 4.19 — so it is offered here. Every entry written before 3.2
    // patch 2 carries a SEPARATE `links:` fence above the rule with no
    // structural directive in it, and `parseEntry` picks the fence the editor
    // writes into by asking which fences hold a shared directive. A widget
    // probe voting in that question would adopt the reader's navigation row as
    // the band the editor rewrites.
    const legacy = composeEntryTemplate("daily").replace(
      "```chronoanvil\nentry-header\n",
      "```chronoanvil\nlinks:home,today,scopes#diary\n```\n```chronoanvil\nentry-header\n"
    );
    expect(offered()).toContain("w:links#1");
    expect(detectEntrySections(legacy, ctx)).not.toContain("w:links#1");
    // And an add still lands below the rule, in the fence it always did.
    const next = applyEntrySections(legacy, ctx, [
      ...detectEntrySections(legacy, ctx),
      "w:tasks-table#1",
    ])!;
    expect(sharedFence(next)).toContain("tasks-table");
    expect(next).toContain("```chronoanvil\nlinks:home,today,scopes#diary\n```");
  });

  it("and the band it lands in still wears no head of its own (5.26.1)", () => {
    // ── WHAT THE FIRST HAND TEST FOUND ──────────────────────────────────
    //
    // The write above is right and always was: one directive, appended to the
    // band, with every region and both structural fences untouched. What was
    // wrong was one line away, in what the RENDERER then made of that fence.
    //
    // `blockTitle` names a block when the block is one nameable thing, and it
    // decided that by counting the keywords `SECTION_TITLES` knows. A band's
    // fields are not among them — each draws its own head from the `|Title`
    // after it — so a band of seven titled sections plus one page widget counted
    // as ONE, took a head reading "⏳ Open tasks", and with the head took
    // `has-head`'s card: the whole entry welded into a single surface named
    // after the last thing added to it.
    //
    // ASSERTED AGAINST THE COMPOSER'S OWN OUTPUT rather than a hand-written
    // fence, because the defect was in the pairing: either half alone renders
    // correctly, and only the band this file composes puts them together.
    const base = composeEntryTemplate("daily");
    const next = withWidget("w:tasks-table#1", "tasks-table");
    for (const text of [base, next]) {
      const fence = sharedFence(text).filter((l) => l.trim() !== "");
      expect(fieldBand(fence)).toBe(true);
      expect(blockTitle(fence)).toBeNull();
    }
    // AND THE WIDGET IS NOT LEFT NAMELESS FOR IT. The head the block gives up
    // is the card the widget gains — see `fieldBand`'s second caller in the
    // dispatcher, pinned in `block-move.test.ts`.
    expect(sharedFence(next)).toContain("tasks-table");
  });

  it("and every grain's band is one, so no entry can take a widget's name", () => {
    // THE FIX HELD FOR THE GRAIN THE DEFECT WAS REPORTED ON. Asked of all five,
    // because a weekly entry composes a different set of fields and the clause
    // is only true if every band has one — a grain whose band held no field at
    // all would take the head again the day a reader added a widget to it.
    for (const grain of TRACKER_CLASSES) {
      const fence = sharedFence(composeEntryTemplate(grain)).filter(
        (l) => l.trim() !== ""
      );
      expect(fieldBand(fence), grain).toBe(true);
      expect(blockTitle([...fence, "tasks-table"]), grain).toBeNull();
    }
  });
});

// ── the one arrangement an entry has (1.0.10) ─────────────────────────────
//
// The banner and the logging grid can be welded into one card from *Edit
// sections…*, exactly as a journal note's can. Nothing the catalogue composes
// changes: an entry moves only when its reader presses the button, which is
// what every `entry-*` golden above still being byte-identical says.
describe("an entry's blocks and the weld that changes them", () => {
  const model = (grain: TrackerClass = "daily") => entrySectionModel({ grain });

  // The band's fields, in file order — what a composed entry has below the rule.
  const fieldsOf = (grain: TrackerClass): string[] =>
    offerableEntrySections({ grain })
      .filter((s) => s.band === "shared")
      .map((s) => s.id)
      .filter((id) => detectEntrySections(composeEntryTemplate(grain), { grain }).includes(id));

  it("reports the banner and the grid as two blocks, and the band a field at a time", () => {
    // ── WHAT THIS ASSERTED UNTIL 1.0.42 ──────────────────────────────
    //
    // *"and the page below as none"* — the seven fields were withheld from
    // `blocks()` on purpose, so the window could not offer a column of them.
    // A vault asked for the column — *"unable to group tasks and captured log
    // even though they're widgets?"* — and got the wrong refusal on the way,
    // because a capability withheld at its source leaves the window guessing at
    // the reason. The band is read as an arrangement now; see `bandBlocks`.
    //
    // ONE BLOCK PER FIELD, because a composed daily band is ONE UNROWED FENCE
    // and an unrowed fence's members are each their own block. That is
    // `rowRuns(weld: true)` read backwards: an unrowed member joins the run
    // before it, so the fence they happen to share is not a fact about their
    // arrangement.
    const blocks = model().blocks!(composeEntryTemplate("daily"));
    expect(blocks.map((b) => b.ids)).toEqual([
      ["banner"],
      ["trackers"],
      ...fieldsOf("daily").map((id) => [id]),
    ]);
    expect(blocks.every((b) => b.stack)).toBe(false);
    expect(blocks.every((b) => b.pages.length === 0)).toBe(true);
  });

  it("offers every field as loose, and only a widget as a column, on every grain", () => {
    // ── WHAT THIS ASSERTED FOR ONE BUILD OF 1.0.42 ────────────────────
    //
    // *"loose AND a column together, which is the one place those two answers
    // are one answer"* — and the vault said otherwise: *"Sections are being
    // allowed to be placed into groups. As you can see they're not rendering as
    // widgets."* The half that was right is `loose`: `parseEntry` attributes
    // exactly one line to each field, so there is no extent to guess and nothing
    // a split could take by mistake, on any grain and in any form.
    //
    // A COLUMN IS THE OTHER QUESTION, and it is 4.12 §A's — a section that draws
    // its own title bar is not one. A composed entry's fields are all sections,
    // so a fresh entry offers no columns at all; ticking **Show as widget** is
    // what makes one. See `fieldIsWidget`.
    for (const grain of TRACKER_CLASSES) {
      const blocks = model(grain).blocks!(composeEntryTemplate(grain));
      const fields = fieldsOf(grain);
      expect(fields.length, grain).toBeGreaterThan(1);
      for (const id of fields) {
        const block = blocks.find((b) => b.ids.includes(id));
        expect(block?.column, `${grain}: ${id}`).toEqual([]);
        expect(block?.loose, `${grain}: ${id}`).toContain(id);
      }
      // AND THE SAME FIELD, DRAWN AS A WIDGET, IS ONE.
      const shown = applyEntrySections(
        composeEntryTemplate(grain),
        { grain },
        detectEntrySections(composeEntryTemplate(grain), { grain }).map((id) =>
          fields.includes(id) ? { id, options: { form: "widget" } } : id
        )
      )!;
      for (const id of fields) {
        const block = model(grain).blocks!(shown).find((b) => b.ids.includes(id));
        expect(block?.column, `${grain}: ${id} as a widget`).toContain(id);
      }
      // AND THE TWO ABOVE THE RULE ARE STILL NOT COLUMNS. The banner draws the
      // page head and the grid is a region between two markers; neither is the
      // kind of thing a column is, and `flatBlocks` says so for both.
      for (const id of ["banner", "trackers"]) {
        expect(blocks.find((b) => b.ids.includes(id))?.column, `${grain}: ${id}`).toEqual([]);
      }
    }
  });

  it("welds the grid into the banner when the reader asks for a stack", () => {
    for (const grain of TRACKER_CLASSES) {
      const text = composeEntryTemplate(grain);
      const out = model(grain).regroup!(text, [["banner", "trackers"]], [], ["trackers"]);
      expect(out, grain).toBe(weldEntryFences(text));
      expect(model(grain).blocks!(out!).map((b) => b.ids), grain).toEqual([
        ["banner", "trackers"],
        ...fieldsOf(grain).map((id) => [id]),
      ]);
      expect(model(grain).blocks!(out!)[0].stack, grain).toBe(true);
    }
  });

  it("takes it back out again, byte for byte", () => {
    for (const grain of TRACKER_CLASSES) {
      const text = composeEntryTemplate(grain);
      const welded = weldEntryFences(text)!;
      expect(model(grain).regroup!(welded, [["banner"], ["trackers"]], [], []), grain).toBe(
        text
      );
    }
  });

  it("refuses a row, because the file has no spelling for one here", () => {
    // Same partition, no weld named: the reader would be asking for the grid
    // BESIDE the banner, which is not an arrangement this surface composes.
    const text = composeEntryTemplate("daily");
    expect(model().regroup!(text, [["banner", "trackers"]], [], [])).toBeNull();
  });

  it("refuses a block the banner does not open, or one with a second guest", () => {
    const text = composeEntryTemplate("daily");
    // The banner is not on `WELDS_INTO_BANNER`, so a block it does not open
    // offers it as a guest of something else.
    expect(model().regroup!(text, [["trackers", "banner"]], [], ["banner"])).toBeNull();
    expect(
      model().regroup!(text, [["banner", "trackers", "focus"]], [], ["trackers", "focus"])
    ).toBeNull();
    // TWO WELDABLE GUESTS IS STILL REFUSED, and this is the one the guest rule
    // above cannot catch: `children` is on the list, for the journal note it
    // was written for, and the pair here folds one fence into one other.
    expect(
      model().regroup!(text, [["banner", "trackers", "children"]], [], [
        "trackers",
        "children",
      ])
    ).toBeNull();
  });

  it("refuses a second arrangement somewhere else in the note", () => {
    // Asked of a WELDED note, so the refusal is visible: without it the
    // banner's own block reads as "take it apart" and the Save would unweld
    // while quietly dropping the group the reader asked for.
    const welded = weldEntryFences(composeEntryTemplate("daily"))!;
    expect(
      model().regroup!(welded, [["banner"], ["trackers", "focus"]], [], ["focus"])
    ).toBeNull();
  });

  it("leaves the arrangement alone when nobody mentions one", () => {
    // `undefined` is not an empty list — see `SectionModel.regroup`. A caller
    // written before stacks existed must not have this note taken apart.
    const welded = weldEntryFences(composeEntryTemplate("daily"))!;
    expect(model().regroup!(welded, [["banner"], ["trackers"]], [])).toBeNull();
  });
});

// ── grouping a diary entry's fields (1.0.42) ──────────────────────────────
//
// *"Unable to group tasks and captured log even though they're widgets?"* They
// are: a field drawn as a widget is the same kind of thing the homepage groups
// freely. 1.0.10 withheld the whole band from `blocks()` on the argument that
// splitting its fence is a judgement about the reader's writing — and the
// distinction that argument missed is that a field's REGION is their writing and
// its DIRECTIVE is its chrome. So the regions never move, a directive line is
// copied VERBATIM into whichever fence it lands in, and a band holding anything
// this could not re-emit is refused whole rather than rearranged around.
describe("grouping a diary entry's fields (1.0.42)", () => {
  const ctx = { grain: "daily" as TrackerClass };
  const model = entrySectionModel(ctx);

  // The fields of a composed daily entry, in file order. Stated once here and
  // reused, so a change to the daily catalogue fails in one place with a
  // readable diff rather than in nine.
  const fields = ["focus", "highlights", "challenges", "log", "attachments", "todo", "capture"];

  // ── AND THEY ARE ALL DRAWN AS WIDGETS (1.0.42) ──────────────────────
  //
  // *"Sections are being allowed to be placed into groups. As you can see
  // they're not rendering as widgets."* A group takes columns and a field
  // wearing a permanent title bar is not one (4.12 §A), so the entry these
  // cases group is one whose fields have been ticked **Show as widget** — which
  // is the state the reader is in when they reach for the link icon. The
  // refusal for the other state has its own cases at the end.
  const shown = (t: string): string =>
    applyEntrySections(
      t,
      ctx,
      detectEntrySections(t, ctx).map((id) =>
        fields.includes(id) ? { id, options: { form: "widget" } } : id
      )
    ) ?? t;
  const text = shown(composeEntryTemplate("daily"));
  const apart = fields.map((id) => [id]);
  // A whole-note partition: the two blocks above the rule, then the band's.
  const partition = (...groups: string[][]): string[][] => [
    ["banner"],
    ["trackers"],
    ...groups,
  ];
  // The band's fences, as their non-blank lines. The first two fences of an
  // entry are the banner's and the grid's.
  const bandFences = (out: string): string[][] =>
    out
      .split("```chronoanvil\n")
      .slice(3)
      .map((f) => f.split("\n```")[0].split("\n").filter((l) => l.trim() !== ""));

  it("composes them one fence, one block each", () => {
    expect(bandFences(text).length).toBe(1);
    expect(model.blocks!(text).map((b) => b.ids)).toEqual(partition(...apart));
  });

  it("puts two fields in one fence, opened by a `row` line", () => {
    const out = model.regroup!(
      text,
      partition(...apart.slice(0, 5), ["todo", "capture"]),
      [],
      []
    );
    expect(out).not.toBeNull();
    const band = bandFences(out!);
    expect(band.length).toBe(2);
    expect(band[0].length).toBe(5);
    expect(band[0]).not.toContain("row");
    expect(band[1][0]).toBe("row");
    expect(band[1].length).toBe(3);
    expect(band[1][1]).toContain("tasks:todo");
    expect(band[1][2]).toContain("note:capture");
    // AND NOT ONE LINE OF THE READER'S WRITING MOVED. Everything from the first
    // region on is byte-identical: a group is a change to the chrome, and the
    // regions are the note.
    const from = (t: string): string => t.slice(t.indexOf("<!--chronoanvil:focus"));
    expect(from(out!)).toBe(from(text));
  });

  it("reads the group back, and takes it apart byte for byte", () => {
    const want = partition(...apart.slice(0, 5), ["todo", "capture"]);
    const out = model.regroup!(text, want, [], [])!;
    // THE ROUND TRIP IS THE WHOLE SAFETY ARGUMENT. `bandBlocks` and
    // `regroupBand` are two halves of one rule — one fence per block, opened by
    // `row` where the block has more than one member — so what the window reads
    // back is the group the reader made, and ungrouping returns the file it
    // started from rather than something equivalent to it.
    expect(model.blocks!(out).map((b) => b.ids)).toEqual(want);
    expect(model.regroup!(out, partition(...apart), [], [])).toBe(text);
  });

  it("starts a new fence after a row rather than welding a field into it", () => {
    // `rowRuns`' clause, in the writer: an unrowed member joins the run before
    // it only when that run is also unrowed. Without it the first field under a
    // two-cell row becomes its third column — a column nobody asked for, in a
    // fence whose shape the reader cannot see.
    const want = partition(["focus", "highlights"], ...apart.slice(2));
    const out = model.regroup!(text, want, [], [])!;
    const band = bandFences(out);
    expect(band.length).toBe(2);
    expect(band[0][0]).toBe("row");
    expect(band[0].length).toBe(3);
    expect(band[1].length).toBe(5);
    expect(band[1]).not.toContain("row");
    expect(model.blocks!(out).map((b) => b.ids)).toEqual(want);
  });

  it("carries a tab inside a group, and reads it back as a page", () => {
    const want = partition(...apart.slice(0, 4), ["attachments", "todo", "capture"]);
    const out = model.regroup!(text, want, ["capture"], [])!;
    const band = bandFences(out);
    expect(band[1][0]).toBe("row");
    expect(band[1][3]).toBe("tab");
    expect(band[1][4]).toContain("note:capture");
    expect(
      model.blocks!(out).find((b) => b.ids.includes("capture"))!.pages
    ).toEqual(["capture"]);
    // AND THE BOUNDARY GOES WHEN THE READER TAKES IT AWAY, which is what makes
    // the control a toggle rather than a one-way write.
    const flat = model.regroup!(out, want, [], [])!;
    expect(bandFences(flat)[1]).not.toContain("tab");
  });

  it("refuses a band holding a line the catalogue did not write", () => {
    // NO BLOCKS AT ALL, which is how the refusal reaches the reader: the window
    // never learns those ids, `placed` is false for every one of them, and the
    // disabled button says the sentence `whyNotColumn` keeps for this case.
    const foreign = text.replace(
      "attach:attachments#widget|Attachments",
      "attach:attachments#widget|Attachments\nmystery:mine"
    );
    expect(foreign).not.toBe(text);
    expect(model.blocks!(foreign).flatMap((b) => b.ids)).toEqual(["banner", "trackers"]);
    expect(
      model.regroup!(foreign, partition(...apart.slice(0, 5), ["todo", "capture"]), [], [])
    ).toBeNull();
  });

  it("refuses a band holding a modifier it cannot carry", () => {
    // A `height:` belongs to the line UNDER it, and a `cell` divides two
    // columns of one row — neither survives a re-emit built out of directive
    // lines alone, so a band carrying either is left exactly as it is. Nothing
    // on this surface composes a `cell`: no entry section declares one, so
    // `rowRuns`' `divided` set is empty for every grain.
    for (const line of ["height:240", "cell", "frame"]) {
      const odd = text.replace(
        "tasks:todo#widget|Tasks",
        `${line}\ntasks:todo#widget|Tasks`
      );
      expect(odd, line).not.toBe(text);
      expect(model.blocks!(odd).flatMap((b) => b.ids), line).toEqual(["banner", "trackers"]);
      expect(
        model.regroup!(odd, partition(...apart.slice(0, 5), ["todo", "capture"]), [], []),
        line
      ).toBeNull();
    }
  });

  it("refuses a band with a paragraph between two of its fences", () => {
    // The rewrite replaces the span from the first opener to the last closer, so
    // a reader who wrote between two of their rows keeps that writing by keeping
    // their arrangement.
    const split = model.regroup!(
      text,
      partition(...apart.slice(0, 5), ["todo", "capture"]),
      [],
      []
    )!;
    const between = split.replace("```\n\n```chronoanvil\nrow", "```\n\nA note to self.\n\n```chronoanvil\nrow");
    expect(between).not.toBe(split);
    expect(model.blocks!(between).flatMap((b) => b.ids)).toEqual(["banner", "trackers"]);
    expect(model.regroup!(between, partition(...apart), [], [])).toBeNull();
  });

  it("refuses a partition that straddles the rule, loses a field, or names one twice", () => {
    expect(
      model.regroup!(text, [["banner"], ["trackers", "focus"], ...apart.slice(1)], [], [])
    ).toBeNull();
    expect(model.regroup!(text, partition(...apart.slice(0, 6)), [], [])).toBeNull();
    // NAMED TWICE AND ONE LOST, which counts right and is still wrong: without
    // the second check this would write `todo` out twice and drop `capture`,
    // giving two widgets one region.
    expect(
      model.regroup!(text, partition(...apart.slice(0, 6), ["todo"]), [], [])
    ).toBeNull();
  });

  it("keeps a retitled field's own words, inside the group", () => {
    const mine = text.replace("|Highlights", "|The good bits");
    const out = model.regroup!(
      mine,
      partition(apart[0], ["highlights", "challenges"], ...apart.slice(3)),
      [],
      []
    )!;
    expect(out).toContain("|The good bits");
    expect(out).not.toContain("|Highlights");
  });

  it("gives a field added afterwards a block of its own beside the group", () => {
    // THE SAVE PATH, IN ITS OWN ORDER (see `SectionEditor.save`): `apply`
    // decides which sections the note has, and `regroup` decides which of them
    // share a fence. `apply` appends an added directive to the LAST fence of the
    // band — which after a group is the row — so the regroup that runs after it
    // is what keeps the newcomer out of the reader's group. This is the round
    // trip the feature was most likely to get wrong.
    const grouped = model.regroup!(
      text,
      partition(...apart.slice(0, 5), ["todo", "capture"]),
      [],
      []
    )!;
    const added = "w:tasks-table#1";
    const applied = applyEntrySections(grouped, ctx, [
      ...detectEntrySections(grouped, ctx),
      added,
    ]);
    expect(applied).not.toBeNull();
    const want = partition(...apart.slice(0, 5), ["todo", "capture"], [added]);
    const final = model.regroup!(applied!, want, [], [])!;
    const band = bandFences(final);
    expect(band.length).toBe(3);
    expect(band[1][0]).toBe("row");
    expect(band[1].length).toBe(3);
    expect(band[2].length).toBe(1);
    expect(band[2][0]).toContain("tasks-table");
    expect(model.blocks!(final).map((b) => b.ids)).toEqual(want);
    // AND THE PLUGIN CAN STILL FIND IT. A fence with no field in it has nothing
    // to CHOOSE it as part of the band — `sharesCatalogue` gives the widget tail
    // no vote, on purpose — so without the abutting rule this write would have
    // put a widget somewhere `detect` could not see: the editor would offer to
    // add a second one and the first would sit there rendering.
    expect(detectEntrySections(final, ctx)).toContain(added);
    // …and it can be grouped like anything else, and let go of again.
    const withField = model.regroup!(
      final,
      partition(...apart.slice(0, 4), ["attachments", added], ["todo", "capture"]),
      [],
      []
    )!;
    expect(bandFences(withField).length).toBe(3);
    expect(bandFences(withField)[1][0]).toBe("row");
    expect(bandFences(withField)[1][2]).toContain("tasks-table");
    expect(model.regroup!(withField, want, [], [])).toBe(final);
  });

  it("does not adopt a fence that abuts the band and holds the reader's own words", () => {
    // The other half of the abutting rule, and the one that keeps 3.0 §9's
    // narrowing: a fence joins the band only when every line in it is the
    // catalogue's. A pasted example has the reader's own words in it, so it
    // stays theirs however close to the band it sits.
    const pasted = text.replace(
      "\n\n<!--chronoanvil:focus",
      "\n\n```chronoanvil\ntasks-table\nsome example I pasted\n```\n\n<!--chronoanvil:focus"
    );
    expect(pasted).not.toBe(text);
    expect(model.blocks!(pasted).map((b) => b.ids)).toEqual(partition(...apart));
    // AND THE REGROUP LEAVES IT WHERE IT IS, because the band's span stops at
    // the last fence that is the band's.
    const out = model.regroup!(
      pasted,
      partition(...apart.slice(0, 5), ["todo", "capture"]),
      [],
      []
    )!;
    expect(out).toContain("```chronoanvil\ntasks-table\nsome example I pasted\n```");
    expect(detectEntrySections(pasted, ctx)).not.toContain("w:tasks-table#1");
  });

  it("does not adopt a widget fence with a paragraph between it and the band", () => {
    // Blank lines only. A reader who wrote between the band and their own fence
    // has put something there that this must not rewrite around.
    const apartFence = text.replace(
      "\n\n<!--chronoanvil:focus",
      "\n\nSomething I wrote.\n\n```chronoanvil\ntasks-table\n```\n\n<!--chronoanvil:focus"
    );
    expect(apartFence).not.toBe(text);
    expect(detectEntrySections(apartFence, ctx)).not.toContain("w:tasks-table#1");
    expect(model.blocks!(apartFence).map((b) => b.ids)).toEqual(partition(...apart));
  });

  // ── AND WHAT THE GROUP IS CALLED (1.0.42) ──────────────────────────────
  //
  // *"Diary groups do not have the choice for Title Header."* Every other
  // surface titles a group with the opening SECTION'S bar; a band's fields
  // title themselves on their own directives, so the bar over a group of them
  // is a line nobody's form composes and it travels as `regroup`'s fifth
  // argument instead.
  const group = partition(...apart.slice(0, 5), ["todo", "capture"]);

  it("writes a typed name as a `header:` bar under the row line", () => {
    const out = model.regroup!(
      text,
      group,
      [],
      [],
      new Map([["todo", "Evening review"]])
    );
    expect(out).not.toBeNull();
    const band = bandFences(out!);
    expect(band[1][0]).toBe("row");
    // DIRECTLY UNDER THE `row` LINE, which is where `rowRuns` composes a titled
    // row and where `readBand` will look for it.
    expect(band[1][1]).toBe("header:Evening review");
    expect(band[1][2]).toContain("tasks:todo");
    expect(band[1][3]).toContain("note:capture");
    // AND THE CELLS KEEP THEIR OWN NAMES. `fenceTitled && soleField` takes a
    // field's head away only where it is ALONE under the bar, and a group has
    // two by definition — the bar names the group, the cards name themselves.
    expect(band[1][2]).toContain("|Tasks");
    // AND NOT ONE LINE OF THE READER'S WRITING MOVED.
    const from = (t: string): string => t.slice(t.indexOf("<!--chronoanvil:focus"));
    expect(from(out!)).toBe(from(text));
  });

  it("reads the name back on the block, and takes it away again", () => {
    const named = model.regroup!(
      text,
      group,
      [],
      [],
      new Map([["todo", "Evening review"]])
    )!;
    const blocks = model.blocks!(named);
    expect(blocks.map((b) => b.ids)).toEqual(group);
    expect(blocks[blocks.length - 1].title).toBe("Evening review");
    // ABSENT IS NOT AN EMPTY TITLE. Every other block reports no `title` at all
    // rather than "", so a caller can tell *has no bar* from *has a blank one*.
    expect(blocks[0].title).toBeUndefined();
    // AND AN EMPTY MAP CLEARS IT, which is how the tick unticks: `regroupBand`
    // is handed the whole map, so omitting a key removes the bar.
    const bare = model.regroup!(named, group, [], [], new Map())!;
    expect(bandFences(bare)[1]).not.toContain("header:Evening review");
    expect(model.blocks!(bare)[model.blocks!(bare).length - 1].title).toBeUndefined();
  });

  it("leaves a written name alone when nobody asks about titles", () => {
    // `pages`' CONVENTION: absent means *leave it*, not *clear it*. Every caller
    // that only rearranges — `layoutOps` before the control existed, a weld —
    // would otherwise strip a bar the reader typed.
    const named = model.regroup!(
      text,
      group,
      [],
      [],
      new Map([["todo", "Evening review"]])
    )!;
    // The same partition, no titles argument at all: nothing to do, so null.
    expect(model.regroup!(named, group, [], [])).toBeNull();
  });

  it("gives no name to a block of one, and refuses a blank one", () => {
    // A ROW OF ONE IS NOT A ROW, so it is not a group and has no name — and a
    // `header:` over a single field would be read by `fenceTitled && soleField`
    // as that FIELD'S title, taking its own head away.
    expect(
      model.regroup!(text, partition(...apart), [], [], new Map([["todo", "Evening"]]))
    ).toBeNull();
    // AND TICKED-AND-EMPTY IS NOT AN ANSWER. A blank writes no bar, which is
    // what `blockNames` in the editor agrees with by leaving the key out.
    const blank = model.regroup!(text, group, [], [], new Map([["todo", "   "]]))!;
    expect(bandFences(blank)[1].some((l) => l.startsWith("header:"))).toBe(false);
  });

  it("carries the name through an ungroup and back", () => {
    const named = model.regroup!(
      text,
      group,
      [],
      [],
      new Map([["todo", "Evening review"]])
    )!;
    // Broken up, the bar goes with the group — and the file is the one the
    // composer wrote, byte for byte, exactly as the untitled round trip is.
    const back = model.regroup!(named, partition(...apart), [], [])!;
    expect(back).toBe(text);
  });

  // ── AND A GROUP TAKES WIDGETS ONLY (1.0.42) ────────────────────────
  //
  // *"Sections are being allowed to be placed into groups. As you can see
  // they're not rendering as widgets. Disable the link icons and reject cards
  // with the section flag, only allow widgets."* The screenshot is a row whose
  // first cell wears a full title bar and a chevron, with the cell under it
  // shoved out of shape. 4.12 §A has said a section that draws its own title bar
  // is not a column since 4.12; this surface was the one place it was not asked.
  const plain = composeEntryTemplate("daily");

  it("offers no column on an entry whose fields all draw their own bars", () => {
    // WHICH IS WHAT DISABLES THE LINK ICON, and with the right sentence: the
    // window reads `column` off the file and `whyNotColumn` says *draws its own
    // title bar* for a field that is `placed` and not a column.
    for (const b of model.blocks!(plain)) expect(b.column).toEqual([]);
    // AND `loose` IS UNTOUCHED. Take out of the group is the control that
    // repairs a note already holding such a row, so it must stay live.
    for (const id of fields) {
      expect(model.blocks!(plain).find((b) => b.ids.includes(id))?.loose).toContain(id);
    }
  });

  it("refuses to write a group holding a field that draws its own bar", () => {
    // THE SAME RULE WHERE THE WRITE CAN SEE IT. The editor refuses the join
    // already; a fence composed with a titled field in it is a file the renderer
    // draws wrong, so the model must not compose one however it is asked.
    expect(
      model.regroup!(plain, partition(...apart.slice(0, 5), ["todo", "capture"]), [], [])
    ).toBeNull();
    // ONE IS ENOUGH TO REFUSE THE ROW. A group is columns side by side and the
    // one wearing a head is the one with no room for it.
    const half = shown(plain).replace(
      "note:capture#collapse#widget:",
      "note:capture#collapse:"
    );
    expect(half).not.toBe(shown(plain));
    expect(
      model.regroup!(half, partition(...apart.slice(0, 5), ["todo", "capture"]), [], [])
    ).toBeNull();
  });

  it("still takes a hand-written one apart", () => {
    // THE WAY OUT OF THE SCREENSHOT. A row already holding a titled field is
    // refused as a group and is still READ as one — so the window draws the card,
    // **Take out of the group** is live on every cell, and the partition that
    // ungroups it is written.
    const grouped = model.regroup!(
      text,
      partition(...apart.slice(0, 5), ["todo", "capture"]),
      [],
      []
    )!;
    const bad = grouped.replace("tasks:todo#widget|Tasks", "tasks:todo|Tasks");
    expect(bad).not.toBe(grouped);
    expect(model.blocks!(bad).map((b) => b.ids)).toEqual(
      partition(...apart.slice(0, 5), ["todo", "capture"])
    );
    // It cannot be kept as a group…
    expect(
      model.regroup!(bad, partition(...apart.slice(0, 5), ["todo", "capture"]), [], [])
    ).toBeNull();
    // …and it comes apart into blocks of one.
    const out = model.regroup!(bad, partition(...apart), [], [])!;
    expect(model.blocks!(out).map((b) => b.ids)).toEqual(partition(...apart));
  });

  it("refuses a `header:` written anywhere but under a row line", () => {
    // Over the WHOLE band it would title all seven fields at once, which is the
    // head `fieldBand` exists to keep off one. Left alone rather than rewritten.
    const over = text.replace(
      "```chronoanvil\nnote:focus",
      "```chronoanvil\nheader:Today\nnote:focus"
    );
    expect(over).not.toBe(text);
    expect(model.blocks!(over).map((b) => b.ids)).toEqual(partition());
    expect(model.regroup!(over, partition(...apart), [], [])).toBeNull();
  });
});
