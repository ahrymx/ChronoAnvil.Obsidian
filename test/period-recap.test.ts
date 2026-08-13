// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.9: the month strip stops saying it twice, and the year and quarter banners
// stop being documents.
//
// Two sections of one release, tested together because they share nothing but
// the release — and the alternative was two files of six assertions each.

import { describe, expect, it } from "vitest";
import { readCss, readSrc } from "./sources";
import {
  DIARY_SECTIONS,
  addableDiarySections,
  applyDiarySections,
  composeDiaryDashboard,
  detectDiarySections,
  diaryRemovalRefusal,
} from "../src/diary/diary-sections";
import { planLayout } from "../src/core/layout";

// ── §1: the month strip ───────────────────────────────────────────────

describe("a month says it once, on its own name", () => {
  it("builds a month cell out of one element", () => {
    // The whole of §1. The cell held a label and a lucide `notebook`, and the
    // icon carried two meanings at four opacities: an affordance on the
    // selected cell's hover, a fact at rest. A reader learned the second by
    // noticing the first was sometimes dimmer.
    const t = readSrc("calendar");
    expect(t).not.toContain("jc-mcell-icon");
    expect(t).toContain('cls: "jc-mcell-label"');
  });

  it("keeps the fact, on the label", () => {
    // `has-review` survives — it is a class name rather than a word a reader
    // sees, so it outlived the 2.55 rename that made "monthly review" into
    // "monthly entry" and it outlives this too.
    //
    // The selector is matched loosely as of 3.17: the declaration is shared
    // with the quarter and year marks now, so `.jc-mcell-label` is followed by
    // a comma rather than a brace. Pinning the exact rule text would make the
    // test assert that the month's mark is the month's ALONE, which is the
    // opposite of what 3.17 §2 decided.
    expect(readSrc("calendar")).toContain('toggleClass("has-review"');
    expect(readCss()).toMatch(
      /\.jc-mcell\.has-review \.jc-mcell-label[^{]*\{[^}]*text-decoration: underline/
    );
  });

  it("retires the icon's four opacity rules with it", () => {
    // The markup outliving its stylesheet is the failure 2.56.2 shipped once
    // already (`Quarters0 of 12 entries`), so the two go in one patch.
    const css = readCss();
    expect(css).not.toContain(".jc-mcell-icon");
  });

  it("keeps the tooltip that is now the whole affordance", () => {
    // §1.4: removing the icon does not remove an affordance from a keyboard or
    // screen-reader user, because `title` is the only version they ever had.
    // It does remove the second one mouse users got, which makes this string
    // load-bearing in a way it was not before.
    //
    // WHAT IT PROMISES CHANGED IN 3.17 §1 and the assertion changed with it.
    // The two moods this used to pin — "Open the … entry" / "Start the …
    // entry" — were a click whose DESTINATION depended on whether a file
    // existed, and the rail's second click no longer opens a file. It opens
    // the Monthly Overview either way, so the tooltip states one destination
    // and the existence of an entry is said by the underline instead.
    const t = readSrc("calendar");
    expect(t).toContain("Open the ${name} overview");
    expect(t).not.toContain("Start the ${name} entry");
  });
});

// ── 3.17: the rail's two fixes ────────────────────────────────────────
//
// Both are about the same three-word claim — "this control is one of four" —
// arriving eight releases after the four were built. §1 is where the month
// went somewhere the other three didn't; §2 is where the month SAID something
// the other three didn't.

describe("§1: every period above a day opens its dashboard", () => {
  it("sends the rail's second click to the Monthly Overview", () => {
    const t = readSrc("calendar");
    // The construction, not just the name: a dashboard is reached by setting
    // its period property and revealing the note, and this is the fourth
    // identical instance of that in one file.
    expect(t).toContain("const openMonthOverview");
    expect(t).toMatch(
      /openMonthOverview[\s\S]{0,600}setPeriod\(\s*path,\s*"month-start",\s*"month"/
    );
    expect(t).toMatch(/if \(i === cursor\.month\(\)\) \{\s*openMonthOverview\(key\);/);
  });

  it("leaves the day cell opening the day's entry", () => {
    // The distinction §1 draws is grain, not scope. A day has no dashboard,
    // so its cell is the one place on the card that still opens a note.
    expect(readSrc("calendar")).toMatch(/onOpen: openDay/);
    expect(readSrc("calendar")).toMatch(/openOrCreateDay\(iso\)/);
  });

  it("keeps a route to the month entry, on the jump row", () => {
    // `openMonth` is not dead code: removing it would leave the calendar with
    // no way to reach a monthly entry at all, which §1 did not decide.
    const t = readSrc("calendar");
    expect(t).toContain("const openMonth =");
    expect(t).toMatch(/jumpMonthBtn[\s\S]{0,200}openMonth\(jumpMonth\.value\)/);
  });
});

describe("§2: four scopes, one mark", () => {
  it("reads each grain's entries from its own period property", () => {
    const t = readSrc("calendar");
    expect(t).toContain("buildPeriodEntryKeys");
    for (const prop of ["week-start", "quarter-start", "year-start"]) {
      expect(t, prop).toContain(`"${prop}"`);
    }
  });

  it("excludes the dashboard, which carries the property as a cursor", () => {
    // The failure this prevents is not cosmetic: the dashboards live in the
    // same folders as the entries and hold the same properties, so counting
    // them would make the CURRENT period always claim an entry — and the claim
    // would move as you browsed.
    expect(readSrc("calendar")).toMatch(
      /buildPeriodEntryKeys[\s\S]{0,700}folderNotePath\(folder\)[\s\S]{0,300}continue/
    );
  });

  it("keys weeks by ISO week rather than by date", () => {
    // Entries snap to `isoWeek` (Monday); the grid's rows begin on the
    // LOCALE's first day. Comparing the two dates directly is correct on a
    // Monday-start vault and off by one everywhere else.
    const t = readSrc("calendar");
    expect(t).toContain('m.format("GGGG-[W]WW")');
    expect(t).toMatch(/rowWeekKey[\s\S]{0,200}add\(3, "days"\)/);
  });

  it("marks all four controls", () => {
    const t = readSrc("calendar");
    // The month's was already there; these three are the release.
    expect(t).toMatch(/weekCell[\s\S]{0,200}has-review/);
    expect(t).toContain('quarterLabels[q].toggleClass("has-review"');
    expect(t).toContain('yearCurEl.toggleClass("has-review"');
  });

  it("gives every marked control a span to underline", () => {
    // `text-decoration` on a flex container is not reliably inherited by its
    // anonymous text, which is why the month has had `.jc-mcell-label` since
    // 3.9 and why the quarter letter gained one here.
    const t = readSrc("calendar");
    expect(t).toContain('cls: "jc-qlabel-text"');
    const css = readCss();
    for (const sel of [
      ".jc-qlabel.has-review .jc-qlabel-text",
      ".jc-year-cur.has-review .jc-year-cur-label",
      ".cal-week.has-review .cal-weeknum",
    ]) {
      expect(css, sel).toContain(sel);
    }
  });

  it("says the mark in words, for everyone who cannot see it", () => {
    // A one-pixel rule under a three-letter month is enough to notice and not
    // enough to explain itself, and `title` is the only channel a keyboard or
    // screen-reader user gets.
    expect(readSrc("calendar")).toContain("function entryTip");
    expect(readSrc("calendar")).toContain("has an entry.");
  });
});

// ── §2: the recap ─────────────────────────────────────────────────────

describe("the rollup is a section, and an opt-in one", () => {
  it("ships neither banner a recap", () => {
    for (const g of ["yearly", "quarterly"] as const) {
      expect(composeDiaryDashboard(g), g).not.toContain("period-recap");
    }
  });

  it("offers it on both, and adds it where the catalogue says", () => {
    // Placement is the catalogue's business (`insertionPoint`), so what is
    // asserted is the ORDER rather than an offset: below the masthead card,
    // above the charts fence it used to sit above as part of the banner.
    for (const g of ["yearly", "quarterly"] as const) {
      const fresh = composeDiaryDashboard(g);
      const ctx = { grain: g };
      expect(addableDiarySections(ctx, fresh).map((s) => s.id), g).toContain(
        "recap"
      );

      const next = applyDiarySections(fresh, ctx, [
        ...detectDiarySections(fresh, ctx),
        "recap",
      ]);
      expect(next, g).not.toBeNull();
      const out = next!;
      expect(out.indexOf(`${g === "yearly" ? "year" : "quarter"}-summary`)).toBeLessThan(
        out.indexOf("period-recap")
      );
      expect(out.indexOf("period-recap")).toBeLessThan(
        out.indexOf("```almanac-charts")
      );
    }
  });

  it("round-trips: remove what was added and the file is back", () => {
    // `insertionPoint`'s stated property, and the one worth having because it
    // is the one a test can check.
    const ctx = { grain: "yearly" } as const;
    const fresh = composeDiaryDashboard("yearly");
    const added = applyDiarySections(fresh, ctx, [
      ...detectDiarySections(fresh, ctx),
      "recap",
    ])!;
    const removed = applyDiarySections(
      added,
      ctx,
      detectDiarySections(added, ctx).filter((id) => id !== "recap")
    );
    expect(removed).toBe(fresh);
  });

  it("refuses nothing — the recap holds no writing", () => {
    // Goals, highlights and challenges are READ out of the monthly entries on
    // every render and stored nowhere here, so removing the section costs a
    // view and not a word. That is why it has no `holds` and why this is the
    // one thing §12's risk is not about.
    const recap = DIARY_SECTIONS.find((s) => s.id === "recap")!;
    expect(recap.locked).toBe(false);
    expect(recap.holds).toBeUndefined();
    expect(diaryRemovalRefusal(recap, "period-recap:year")).toBeNull();
  });

  it("is never inserted or deleted by a repair", () => {
    // THE PROPERTY THE OPT-IN DECISION RESTS ON, in both directions.
    //
    // Forward: the section is not in the composed asset, so `reconcileLayouts`
    // has no unit for it and repair never adds it — which is what "off by
    // default" means for a reader who already has these notes.
    //
    // Backward, and this is the one that would have bitten: a reader who opts
    // in and then runs "Set up / repair vault" must not have it taken away
    // again. `planLayout` only ever deletes a RETIRED_WIDGETS keyword, so the
    // block is foreign and left where they put it — but that is a property of
    // another module, and this is the release that starts depending on it.
    const ctx = { grain: "yearly" } as const;
    const asset = composeDiaryDashboard("yearly");
    const withRecap = applyDiarySections(asset, ctx, [
      ...detectDiarySections(asset, ctx),
      "recap",
    ])!;

    expect(planLayout(asset.split("\n"), asset.split("\n"))).toEqual([]);
    const ops = planLayout(withRecap.split("\n"), asset.split("\n"));
    expect(ops.filter((o) => o.kind === "delete")).toEqual([]);
    expect(ops.filter((o) => o.keyword === "period-recap")).toEqual([]);
  });
});

describe("one set of rollup renderers, still", () => {
  it("has the banners calling neither", () => {
    // Patch 3: `year-summary` and `quarter-summary` lose their last lines in
    // the same patch, for §2.4's reason — sectioning one grain alone would put
    // the drift back in the place quarter-view.ts carries a comment warning
    // about it.
    for (const view of ["year-view", "quarter-view"]) {
      const t = readSrc(view);
      expect(t, view).not.toMatch(/^\s*renderGoals\(/m);
      expect(t, view).not.toMatch(/^\s*renderList\(/m);
    }
  });

  it("has the recap calling all three, from quarter-view", () => {
    const t = readSrc("recap-view");
    expect(t).toContain('from "./quarter-view"');
    expect(t).toContain("renderGoals(root");
    expect(t).toMatch(/renderList\(root, data\.months, "Highlights"/);
    expect(t).toMatch(/renderList\(root, data\.months, "Challenges"/);
  });

  it("defines each of them exactly once", () => {
    // §0's last row, and the promise the whole section was measured against:
    // the year having its own copy is how the two would drift.
    const all = ["year-view", "quarter-view", "recap-view"]
      .map(readSrc)
      .join("\n");
    for (const fn of ["renderGoals", "renderList"]) {
      const defs = all.match(new RegExp(`export function ${fn}\\(`, "g")) ?? [];
      expect(defs.length, fn).toBe(1);
    }
  });

  it("leaves the year its door to the quarter", () => {
    // WHERE THE BUILD DISAGREED WITH THE PLAN — the roadmap put these cards in
    // a `period-quarters` section. They stay in the banner because §2's case is
    // against UNBOUNDED content and there are always exactly four of them, and
    // because they are the year's only link to the scope beneath it: `links:`
    // went home, month, search, skipping the quarter entirely until 2.52 added
    // these. Sectioning them behind an opt-in would reopen that for every
    // reader who does not opt in.
    expect(readSrc("year-view")).toMatch(/^\s*renderQuarterCards\(panel/m);
  });
});

describe("the banner says where the rollup went", () => {
  it("draws the notice only when there is something to have lost", () => {
    // §12's mitigation, and the two conditions that keep it from being an
    // advert: the note has no recap block, and the rollup is non-empty. A
    // fresh vault never sees it; a reader who adds the section never sees it
    // again.
    const t = readSrc("recap-view");
    expect(t).toContain("if (!anything) return;");
    expect(t).toMatch(/if \(\/\^period-recap\\b\/m\.test\(text\)\) return;/);
  });

  it("adds the section through the model, not by appending text", () => {
    // So placement, refusals and idempotence are the catalogue's answers here
    // exactly as they are in the editor — 3.0.1's lesson about one command
    // knowing something its neighbour does not.
    const t = readSrc("section-insert");
    expect(t).toContain("async addDiarySectionHere(");
    expect(t).toContain("model.apply(current, [...model.present(current), sectionId])");
  });

  it("is wired to the button both banners draw", () => {
    for (const view of ["year-view", "quarter-view"]) {
      expect(readSrc(view), view).toContain("renderRecapMoved(");
    }
    expect(readSrc("recap-view")).toContain(
      'addDiarySectionHere(ctx.sourcePath, "recap")'
    );
  });
});
