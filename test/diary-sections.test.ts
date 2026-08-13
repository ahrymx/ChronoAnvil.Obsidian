// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patch 3 of 2.59 changes nothing, and this is the whole evidence for that.
//
// The catalogue composes each dashboard and the result is diffed BYTE FOR BYTE
// against the file that ships today. If any of these fail, the composition is
// wrong somewhere subtle and patch 4 — where scaffold stops copying and starts
// composing — must not start.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readCode, readSrc } from "./sources";
import { resolve } from "node:path";
import {
  DIARY_SECTIONS,
  addableDiarySections,
  composeDiaryDashboard,
  detectDiarySections,
  renderDiarySection,
  isOptIn,
  sectionsForDashboard,
} from "../src/diary/diary-sections";
import type { DashboardGrain } from "../src/diary/diary-sections";

// The byte-for-byte diff that stood here through 2.59.2 is gone with the asset
// files it compared against. It was a MIGRATION gate, not a standing test: its
// job was to prove the catalogue reproduced what shipped before scaffold was
// allowed to switch over, and it did that — it caught the composition building
// frontmatter from `dateProperty` while three of four dashboards passed anyway.
//
// Keeping the assets so it could keep running would mean maintaining a second
// copy of the same arrangement plus a test whose only job is to notice the two
// drifting apart, which is the trade STUDY_COMPOSED already refused in 2.42.
// Composing makes drift impossible rather than detectable.

describe("the composer is what scaffold writes", () => {
  it("leaves no dashboard asset behind to drift from", () => {
    // If one of these comes back, there are two descriptions of a dashboard
    // again and nothing says which wins.
    for (const f of [
      "weekly-overview.md",
      "monthly-overview.md",
      "quarter.md",
      "year.md",
    ]) {
      expect(existsSync(resolve(__dirname, "..", "assets", f)), f).toBe(false);
    }
  });

  it("is the source scaffold reads for all four", () => {
    const src = readSrc("scaffold");
    for (const g of ["weekly", "monthly", "quarterly", "yearly"]) {
      expect(src, g).toContain(`composeDiaryDashboard("${g}")`);
    }
  });

  it("still opens each dashboard with its period property and the spacer", () => {
    // What the byte-diff protected, kept as a property rather than a snapshot:
    // the frontmatter key is what makes the note a dashboard at all, and the
    // spacer is what the banner hangs off.
    for (const [g, prop] of [
      ["weekly", "week-start"],
      ["monthly", "month-start"],
      ["quarterly", "quarter-start"],
      ["yearly", "year-start"],
    ] as const) {
      const out = composeDiaryDashboard(g);
      expect(out.startsWith(`---\n${prop}`), g).toBe(true);
      expect(out, g).toContain("`almanac:spacer`");
      expect(out.endsWith("```\n"), g).toBe(true);
    }
  });
});

describe("what the catalogue made visible", () => {
  // Three divergences that were invisible as four separate files and are
  // obvious as one description. None is changed here: two are probably bugs and
  // one is probably a decision, and telling them apart belongs to a patch
  // allowed to change behaviour. Pinned so that patch cannot happen silently.

  it("gives every grain a period button, monthly included", () => {
    // FLIPPED IN 3.3. Monthly was the exception until then — not by argument
    // but by age: `new-monthly` was written when the monthly note was a
    // "review" and the only way to make one was to be asked which month, and
    // the scoped buttons the other three grew in 2.57 never reached it.
    for (const g of [
      "weekly",
      "monthly",
      "quarterly",
      "yearly",
    ] as DashboardGrain[]) {
      expect(composeDiaryDashboard(g), g).toContain("button:new-");
    }
    expect(composeDiaryDashboard("monthly")).toContain("button:new-month");
  });

  it("and the scoped button is not the prompting one wearing its name", () => {
    // `new-monthly` prompts for any YYYY-MM and is what the command palette
    // invokes; `new-month` keeps the month the dashboard is looking at. One
    // directive, one meaning — a kind that read its host and changed both its
    // label and its behaviour is the shape this codebase keeps declining.
    expect(composeDiaryDashboard("monthly")).not.toContain("button:new-monthly");
  });

  it("gives yearly no Open Tasks, and now gives it a chart header", () => {
    // TWO DIVERGENCES, ONE OF WHICH WAS A BUG. 2.59.3 recorded both and changed
    // neither, on the grounds that telling a defect from a decision needed a
    // patch allowed to change behaviour.
    //
    // The absent Open Tasks section is the decision — 2.58.6, a year of open
    // tasks grouped by source note is a page-long list nobody reads.
    //
    // The absent chart header was the defect, fixed in 3.9. Without it the
    // charts processor takes its no-title path — which exists for notes whose
    // Trends title is a separate block above the fence — and the year has no
    // such block, so the section rendered with no title, no fold arrow and no
    // count, just a loose toolbar that read as belonging to the section above.
    const year = composeDiaryDashboard("yearly");
    expect(year).not.toContain("tasks-table");
    expect(year).toContain("header:📊 Trends and Statistics");
  });

  it("titles every grain's charts block the same way", () => {
    // The general form of the above, and the assertion that would have caught
    // it in 2.35. Written over the grains rather than naming the year, because
    // a test that pins "yearly has a header" would pass throughout a future
    // release in which the quarter quietly lost its own.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      expect(composeDiaryDashboard(g), g).toContain(
        "```almanac-charts\nheader:📊 Trends and Statistics"
      );
    }
  });

  it("writes every grain's period property bare", () => {
    // 3.11 §7.4. The yearly dashboard wrote `year-start: ""` and this test
    // pinned it, under 2.59.2's byte-for-byte diff against the shipped assets
    // — a gate 2.59.3 retired in the same patch that introduced it.
    //
    // WRITTEN OVER THE GRAINS rather than naming the year, for the reason the
    // charts-header test one block up gives: a test that pinned "yearly is
    // bare" would pass throughout a release in which the quarter quietly
    // gained a quoted one.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const prop = { weekly: "week", monthly: "month", quarterly: "quarter", yearly: "year" }[g];
      expect(composeDiaryDashboard(g), g).toContain(`${prop}-start:\n`);
      expect(composeDiaryDashboard(g), g).not.toContain('""');
    }
  });
});

describe("a section is data, which is the point", () => {
  it("gives every section an id, a label and a blurb", () => {
    // A picker needs all three. Writing them beside the markdown is what stops
    // the label and what it renders drifting apart.
    for (const s of DIARY_SECTIONS) {
      expect(s.id, s.id).toBeTruthy();
      expect(s.label, s.id).toBeTruthy();
      expect(s.blurb, s.id).toBeTruthy();
    }
  });

  it("gives each section a distinct id", () => {
    const ids = DIARY_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("answers 'does this belong here' per grain", () => {
    // The field that earns the catalogue on its own: as four files, the only
    // way to say "Open Tasks belongs on a week but not a year" was for the two
    // files to be different, and nothing checked that they still agreed.
    const ids = (g: DashboardGrain): string[] =>
      sectionsForDashboard({ grain: g }).map((s) => s.id);
    expect(ids("weekly")).toContain("open-tasks");
    expect(ids("yearly")).not.toContain("open-tasks");
    // `entry-rollup` gained weekly and quarterly in 3.11 §5 and is still
    // absent from the year, which is the assertion that still says something:
    // a year of daily entries is the same page-long list `open-tasks` is kept
    // off it for.
    expect(ids("monthly")).toContain("entry-rollup");
    expect(ids("weekly")).toContain("entry-rollup");
    expect(ids("quarterly")).toContain("entry-rollup");
    expect(ids("yearly")).not.toContain("entry-rollup");
  });
});

// ── 2.59.4: the catalogue answers "what is missing here" ──────────────

describe("what a dashboard already has, and what it could gain", () => {
  it("finds every section in a freshly composed dashboard", () => {
    // The round trip: what the composer writes, the locator finds. If these
    // disagree, an editor offers to add a section the note already has.
    //
    // AGAINST THE SHIPPED SET, NOT THE OFFERED ONE, as of 3.9 §2. This compared
    // against `sectionsForDashboard` — every section that applies here — which
    // was the same list until `optIn` split "may this dashboard have it" from
    // "does a fresh one come with it". Comparing against the offered set now
    // asserts that nothing is opt-in, which is the opposite of what the field
    // is for; comparing against the shipped set still catches the failure this
    // test was written for, which is a composer and a locator disagreeing.
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const ctx = { grain: g };
      const found = detectDiarySections(composeDiaryDashboard(g), ctx);
      expect(found.sort(), g).toEqual(
        sectionsForDashboard(ctx)
          .filter((s) => !isOptIn(s, ctx))
          .map((s) => s.id)
          .sort()
      );
    }
  });

  it("composes no opt-in section, and offers every one of them", () => {
    // THE OTHER HALF OF THE SAME INVARIANT, and the test that would fail if
    // `optIn` ever leaked into `composeDiaryDashboard`.
    //
    // A fresh dashboard is deliberately incomplete now. What it is missing must
    // be exactly the opt-in sections — not fewer (a section that ships and is
    // also offered would let a reader add a second copy) and not more (a
    // section that neither ships nor is offered is unreachable).
    for (const g of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const ctx = { grain: g };
      const optIn = sectionsForDashboard(ctx)
        .filter((s) => isOptIn(s, ctx))
        .map((s) => s.id);
      expect(
        addableDiarySections(ctx, composeDiaryDashboard(g)).map((s) => s.id),
        g
      ).toEqual(optIn);
    }
  });

  it("says what each grain is offered but not given", () => {
    // WAS "gives the year and the quarter a recap to opt into, and nobody
    // else", which was true until 3.11 §5 gave the quarter a second opt-in.
    //
    // Two different reasons for being opt-in now sit side by side, and it is
    // worth being able to read them off one assertion. `recap` is opt-in
    // because 3.9 §2 shortened a banner and would not put the document back by
    // default. `entry-rollup` is opt-in on a quarter alone because a quarter's
    // recap already surfaces its months — an overlap, offered rather than
    // assumed — while a week's and a month's rollup overlap nothing and ship.
    const optIn = (g: DashboardGrain): string[] =>
      sectionsForDashboard({ grain: g })
        .filter((s) => isOptIn(s, { grain: g }))
        .map((s) => s.id);
    //
    // A THIRD REASON JOINED THEM IN 3.14: `tags` is opt-in on all four, and
    // not because of an overlap. A tag cloud reads a folder rather than a
    // period, so it applies to every grain equally — and four dashboards each
    // growing an identical cloud over the same folder would be one view drawn
    // four times.
    expect(optIn("yearly")).toEqual(["recap", "tags"]);
    expect(optIn("quarterly")).toEqual(["recap", "entry-rollup", "tags"]);
    expect(optIn("monthly")).toEqual(["tags"]);
    expect(optIn("weekly")).toEqual(["tags"]);
  });

  it("ships the rollup on a week and a month, and offers it on a quarter", () => {
    // The same fact from the composer's side, which is the side a reader
    // meets. A section that is opt-in at one grain and shipped at another is
    // new in 3.11 §5 and `optIn` had to become a predicate to express it.
    expect(composeDiaryDashboard("weekly")).toContain("entry-rollup");
    expect(composeDiaryDashboard("monthly")).toContain("entry-rollup");
    expect(composeDiaryDashboard("quarterly")).not.toContain("entry-rollup");
    expect(composeDiaryDashboard("yearly")).not.toContain("entry-rollup");
  });

  it("asks the quarter for months and everyone else for days", () => {
    // The widget was hardcoded to daily entries, so this is the half of §5
    // that is real code rather than a wider `applies`. `:month` singular,
    // matching `month-start` rather than the index's `monthly`.
    const roll = DIARY_SECTIONS.find((s) => s.id === "entry-rollup")!;
    expect(roll.render({ grain: "quarterly" }).lines).toContain(
      "entry-rollup:month"
    );
    for (const g of ["weekly", "monthly"] as const) {
      expect(roll.render({ grain: g }).lines, g).toContain("entry-rollup");
      expect(roll.render({ grain: g }).lines, g).not.toContain(
        "entry-rollup:month"
      );
    }
  });

  it("writes the grain into the recap directive", () => {
    // `period-recap` cannot read its own period off the note — a year note and
    // a quarter note both carry a `*-start` property and the rollup shapes
    // differ — so the catalogue writes which one it is. A directive that lost
    // the argument refuses rather than guessing (see buildPeriodRecap).
    const recap = DIARY_SECTIONS.find((s) => s.id === "recap")!;
    expect(recap.render({ grain: "yearly" }).lines).toContain("period-recap:year");
    expect(recap.render({ grain: "quarterly" }).lines).toContain(
      "period-recap:quarter"
    );
  });

  it("offers exactly the one that was removed, plus the one never shipped", () => {
    // The editing case: a reader deleted Open Tasks and wants it back. The
    // other five must not be offered again.
    //
    // `tags` joins it from 3.14 for a different reason and it is worth reading
    // the two off one assertion: Open Tasks is offered because it was REMOVED,
    // and Tags because it is never composed in the first place. An opt-in
    // section is addable on a dashboard that has everything.
    const ctx = { grain: "weekly" } as const;
    const without = composeDiaryDashboard("weekly").replace(
      /```almanac\nheader:⏳ Open Tasks\ntasks-table:,period\n```\n\n/,
      ""
    );
    expect(addableDiarySections(ctx, without).map((s) => s.id)).toEqual([
      "open-tasks",
      "tags",
    ]);
  });

  it("finds a section whose header the reader retitled", () => {
    // `locate` matches the DIRECTIVE, not the header — retitling is what the
    // `header:` argument is for, and matching on it would make a renamed
    // section invisible and then offer a second copy of it.
    const retitled = composeDiaryDashboard("weekly").replace(
      "header:⏳ Open Tasks",
      "header:📋 Things to do"
    );
    expect(
      detectDiarySections(retitled, { grain: "weekly" })
    ).toContain("open-tasks");
  });

  it("renders one section on its own, for adding it back", () => {
    const section = sectionsForDashboard({ grain: "weekly" }).find(
      (s) => s.id === "open-tasks"
    );
    expect(
      renderDiarySection(section as NonNullable<typeof section>, {
        grain: "weekly",
      })
    ).toBe("```almanac\nheader:⏳ Open Tasks\ntasks-table:,period\n```");
  });

  it("offers nothing for a grain that has no dashboard", () => {
    // Daily. A daily entry IS the note, so `DashboardGrain` excludes it and
    // `diaryContextFor` returns null rather than an empty catalogue.
    const src = readSrc("section-insert");
    expect(src).toContain('if (kind.grain === "daily") return null;');
  });

  it("tells a dashboard apart from an entry in the same folder", () => {
    // The grain alone cannot: `Weekly/Week-2026-W30.md` and `Weekly/Weekly.md`
    // are both weekly. Only the folder-note path distinguishes them, and
    // offering dashboard sections to an entry would write a summary widget
    // into someone's week.
    const src = readSrc("section-insert");
    expect(src).toContain("folderNotePath(paths[CLASS_DEFS[kind.grain].folderKey])");
  });

  it("resolves through the one resolver, not a second path test", () => {
    expect(readSrc("section-insert")).toContain("noteKindOf(paths, notePath)");
  });
});

// ── 2.59.6: the refusal names the right reason ────────────────────────

describe("editing sections routes all three surfaces", () => {
  const src = () => readSrc("section-insert");

  it("no longer tells a diary note the editor isn't built", () => {
    // REWRITTEN IN 3.0, and the two sentences it used to assert are gone from
    // the source rather than from this file only. They were correct refusals —
    // 2.59.4 gave a dashboard a catalogue and no caller, and an entry had no
    // editable section list at all — and a correct refusal is worth exactly as
    // long as it takes to build the thing it refuses for. Patches 4 and 5
    // built them.
    expect(src()).not.toContain("section editing isn't available on ");
    expect(src()).not.toContain("the editor for them isn't built yet");
  });

  it("hands each surface a model rather than picking a window", () => {
    // §2's claim made operational: one editor, three models. What varies
    // between the three branches is the argument, not the call.
    for (const model of [
      "journalSectionModel",
      "diarySectionModel",
      "entrySectionModel",
    ]) {
      expect(readSrc("section-insert") + readSrc("template-editor"), model)
        .toContain(model);
    }
    expect(src()).toContain("openSectionEditor");
  });

  it("keeps the journal message for notes that really are unrecognised", () => {
    expect(src()).toContain("isn't one a journal recognises");
  });

  it("asks the one resolver rather than a second path test", () => {
    // Both diary resolvers open the same two lines — read the surface paths,
    // ask `noteKindOf` — so neither can drift from what the entry header and
    // the tracker surfaces believe about the same file.
    const calls = src().match(/noteKindOf\(paths, notePath\)/g) ?? [];
    expect(calls.length).toBe(2);
    expect(src()).toContain("surfacePathConfig(this.plugin)");
  });

  it("refuses a managed entry template, which is generated", () => {
    // The one refusal 3.0 ADDS. An entry template is composed from the
    // catalogue since 2.60.1 and rewritten by "Refresh entry templates", so a
    // section edited into one would survive until the next refresh and then
    // vanish with no explanation.
    expect(src()).toContain("isManagedTemplate");
    expect(src()).toContain("would be overwritten by the next refresh");
  });

  it("resolves the surface once instead of falling down a refusal ladder", () => {
    // REWRITTEN IN 3.0.1. The property this asserted — that the happy path does
    // not sit at the bottom of a growing ladder of refusals — is now structural
    // rather than positional: both commands ask `surfaceOfNote` once and switch
    // on the answer, so there is no ladder for the working case to fall into.
    // Measuring it by string position stopped meaning anything the moment the
    // refusals became named constants at the top of the file.
    const body = src();
    expect(body).toContain("private surfaceOfNote(");
    // ASSERTED PER COMMAND AS OF 4.5, not as a total. The property is that a
    // command asks ONCE and switches on the answer; the total was a proxy for
    // it that broke the moment a third caller appeared which is not a command
    // at all — `canEditSections`, the predicate the page title card asks before
    // drawing a control it might have to apologise for.
    for (const fn of ["async editSectionsHere(", "async addSectionHere("]) {
      const at = body.indexOf(fn);
      expect(at, fn).toBeGreaterThan(0);
      const end = body.indexOf("\n  }", at);
      const asks = body.slice(at, end).match(/this\.surfaceOfNote\(notePath\)/g) ?? [];
      expect(asks, fn).toHaveLength(1);
    }
    // And the third caller is that predicate and nothing else — one line, so it
    // cannot grow a second opinion about which notes are editable.
    expect(body.match(/this\.surfaceOfNote\(notePath\)/g) ?? []).toHaveLength(3);
    expect(body).toContain("return this.surfaceOfNote(notePath) !== null;");
    // And the refusals are written once rather than once per command. Through
    // readCode, which strips comments: the paragraph above `addSectionHere`
    // quotes the message it used to give a diary note wrongly, and a check that
    // cannot tell a line of code from a line describing one is not checking
    // what it claims to.
    expect(
      readCode("section-insert").match(/isn't one a journal recognises/g) ?? []
    ).toHaveLength(1);
  });

  it("gives the add command the same surfaces as the edit command", () => {
    // THE 3.0.1 BUG. `addSectionHere` resolved the journal host and stopped, so
    // on any diary note it answered "this note isn't one a journal recognises"
    // while `editSectionsHere` opened an editor on the very same file. One
    // command knowing about a surface and its neighbour not is exactly the
    // drift a single resolver exists to prevent.
    const body = src();
    const add = body.slice(body.indexOf("async addSectionHere("));
    expect(add).toContain("this.surfaceOfNote(notePath)");
    // The host folder rides along as of 3.15 — the caller is what knows which
    // file it opened — but it is still ONE resolver feeding both commands.
    //
    // AND THE VAULT'S OWN LISTS RIDE ALONG TOO AS OF 4.15 §4, for the identical
    // reason and from the identical place: `this.vault()` is one method on this
    // class, so a widget offered a dropdown of this vault's journals in the
    // editor is offered the same list from the command. Asserted as the pair,
    // because a version of this that passed the vault to one of them would be
    // the 3.0.1 bug again in a new field.
    expect(add).toContain("modelForSurface(");
    expect(add).toContain("this.hostFolderOf(notePath)");
    expect(add).toContain("this.vault()");
    const edit = body.slice(
      body.indexOf("async editSectionsHere("),
      body.indexOf("async addSectionHere(")
    );
    expect(edit).toContain("this.vault()");
    // It reaches the diary through the interface, not through a second copy of
    // the routing.
    expect(add).not.toContain("resolveSectionHost");
  });

  it("and the add command still cannot remove or reorder anything", () => {
    // Non-destructive by construction rather than by being written in terms of
    // an append: the request is everything the note has PLUS one, so the plan
    // it is checked against can contain no remove and no move.
    //
    // THE PLUS-ONE IS A `SectionWant` AS OF 3.8 PATCH 7, where it used to be
    // the picked id. That is the only thing that changed: a section which
    // cannot render without an answer is asked for one here as well as in the
    // editor, so what gets appended is `{ id, options }` rather than `id`. The
    // property this test is about is the SHAPE of the request — everything
    // present, then one more — and it is untouched, which is why this asserts
    // the spread and not the name of what is spread into it.
    const body = src();
    const add = body.slice(body.indexOf("async addSectionHere("));
    expect(add).toContain("[...model.present(current), want]");
  });

  it("tells an entry from its own dashboard, which share a folder", () => {
    // The one thing the third resolver has to get right. `diaryContextFor`
    // answers "is this the folder note"; `entryContextFor` is the same test
    // read the other way round, so the two cannot both claim a note.
    expect(src()).toContain("if (this.diaryContextFor(notePath)) return null;");
  });
});
