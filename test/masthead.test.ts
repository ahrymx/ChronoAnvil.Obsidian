// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patches 5 and 6 of the 3.2 plan: the entry card and the overview masthead.
//
// This is the visual half of the release, and §11 is right that a visual
// release has no green suite to hide behind. What IS checkable is everything
// the look rests on: that the fence the composer writes is the fence the
// renderer expects, that the card is owned by the container rather than by a
// widget inside it, and that the two page kinds are identical above the rule
// and divergent below it. If any of those breaks, the look breaks with it, and
// this file fails first.

import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc } from "./sources";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import type { DashboardGrain } from "../src/diary/diary-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { readFileSync } from "fs";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import { periodSpan, valueLabel } from "../src/diary/periodnav";
import type { Unit } from "../src/diary/periodnav";
import { moment } from "../src/core/util";
import { chromeClasses } from "../src/ui/widgets/index";

const DASHBOARD_GRAINS: DashboardGrain[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

// The first almanac fence of a composed note — the masthead, as of 3.2.
// The masthead's own fence, found by WHAT IT HOLDS rather than by where it sits.
//
// It was `the first ```almanac block`, which was the same thing until 4.10 put
// the page head above it. Position was never what these tests were about — the
// masthead is the fence carrying navigation, and saying so is both more honest
// and immune to the next thing that arrives above it.
//
// ── AND 4.19 SPLIT IT IN TWO ON A DASHBOARD, SO THERE ARE TWO HELPERS ──
//
// The banner is now the fence carrying the navigation row on BOTH surfaces —
// which is this file's thesis arriving in the markup rather than a departure
// from it. What a dashboard keeps in a second fence is the period summary and
// its button, which is a different question and gets a different helper.
//
// An entry has one fence above the rule and both helpers find it, which is the
// honest answer: on an entry the banner IS the masthead, and always was.
const fenceHolding = (text: string, probe: (l: string) => boolean): string[] => {
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```almanac") open = i;
    if (open >= 0 && probe(lines[i])) break;
  }
  const close = lines.indexOf("```", open + 1);
  return lines.slice(open + 1, close);
};

// The fence carrying the navigation row — the banner, on every diary surface.
const banner = (text: string): string[] =>
  fenceHolding(text, (l) => l.startsWith("links:"));

// The fence carrying the period summary. On an entry that is the banner itself
// (its `entry-header` is what a summary is to a dashboard); on a dashboard it is
// the second fence above the rule.
const masthead = (text: string): string[] =>
  fenceHolding(text, (l) => /-summary$/.test(l.trim()) || l.trim() === "entry-header");

describe("above the rule, an entry and an overview are the same object", () => {
  it("both open their masthead with navigation", () => {
    // The release's thesis, and the cheapest possible statement of it. Every
    // diary page of every grain begins its masthead with navigation.
    //
    // ── AND THE TWO ROWS STOPPED BEING THE SAME STRING IN 4.10 ──────────
    //
    // A dashboard gained a page head, which carries Home; the pill left the
    // row rather than being said twice on one page. An entry did NOT gain one —
    // `entry-header` already renames the note, so a head above it would be the
    // page's name twice — so its row keeps Home because nothing else there
    // offers it.
    //
    // THE DIVERGENCE SURVIVED THE FOLLOW-UP, AND STOPPED BEING A SEAM (4.19).
    //
    // 4.19 merged each page's name and its navigation into one Banner section,
    // and the sentence above predicted this assertion would fail "the day an
    // entry gains a head". The entry did NOT gain one, for the reason given
    // above and unchanged: `entry-header` already renames the note. So the two
    // rows still differ by exactly `home`, and the difference is no longer a
    // seam BETWEEN two sections — it is one section's internal shape, stated by
    // each catalogue in one place.
    //
    // The rows are still asserted to differ by that one id and nothing else.
    for (const grain of TRACKER_CLASSES) {
      expect(banner(composeEntryTemplate(grain))[0], grain).toBe(
        "links:home,today,scopes#diary"
      );
    }
    for (const grain of DASHBOARD_GRAINS) {
      const body = banner(composeDiaryDashboard(grain));
      // The dashboard's banner opens with the page's NAME and carries the
      // navigation row beneath it — one block, two directives, which is the
      // whole of what the merge changed here.
      expect(body[0], grain).toBe("title:home,diary,journals");
      expect(body[1], grain).toBe("links:today,scopes#diary");
    }
  });

  it("and the pill an overview gave up is the one its head took over", () => {
    // The other half of the boundary above. A row that lost Home with nothing
    // replacing it would pass every assertion in this file and be a page with
    // no route home.
    for (const grain of DASHBOARD_GRAINS) {
      const text = composeDiaryDashboard(grain);
      expect(text, grain).toContain("title:home,diary,journals");
      // The links row — the second line of the banner now — still has no Home.
      expect(banner(text)[1], grain).not.toContain("home");
    }
    // And an entry has no head, which is what keeps `home` in its row.
    for (const grain of TRACKER_CLASSES) {
      expect(composeEntryTemplate(grain), grain).not.toContain("title:");
    }
  });

  it("and navigation shares the banner's fence rather than having its own", () => {
    // One fence is one container. Two fences can be made to RESEMBLE one card
    // and cannot be made into one — the limit 2.18.4 already hit one row lower
    // down, and the reason this release exists.
    for (const grain of TRACKER_CLASSES) {
      expect(banner(composeEntryTemplate(grain)), grain).toContain("entry-header");
    }
    for (const grain of DASHBOARD_GRAINS) {
      // AND ON A DASHBOARD IT SHARES IT WITH THE PAGE'S NAME (4.19), where
      // before it shared it with the summary. The claim is unchanged — the
      // navigation row never gets a fence of its own — and what it is welded to
      // is now the thing that says which note this is.
      const head = banner(composeDiaryDashboard(grain));
      expect(head.some((l) => l.startsWith("title:")), grain).toBe(true);
    }
  });

  it("and the period button is in the masthead, not loose below the body", () => {
    // It acts on the period, so it belongs with the period's controls. Until
    // 3.2 it floated under the days table with nothing around it.
    const head = masthead(composeDiaryDashboard("weekly"));
    expect(head).toContain("button:new-week");
    expect(head.indexOf("button:new-week")).toBeGreaterThan(
      head.indexOf("week-summary")
    );
  });
});

describe("below the rule they diverge, and nothing forces them together", () => {
  it("an entry has trackers somewhere; an overview has none anywhere", () => {
    // ── AND THEY LEFT THE BANNER IN 4.20 ──────────────────────────────
    //
    // This read `banner(...)` and asserted the grid was IN the entry's banner
    // fence, which was true from 2.18.4 until 4.20 decided what a banner is: the
    // file's name, its navigation and the control that edits it. The grid is
    // content, so it has a block of its own now.
    //
    // The claim this test is for is unchanged and is about the two SURFACES —
    // an entry records ratings and a dashboard reads them — so it is asked of
    // the whole note rather than of one fence.
    expect(composeEntryTemplate("daily")).toContain("tracker:Mood");
    for (const grain of DASHBOARD_GRAINS) {
      expect(
        masthead(composeDiaryDashboard(grain)).some((l) => l.startsWith("tracker:")),
        grain
      ).toBe(false);
    }
  });

  it("and the grains keep the body differences the catalogue recorded", () => {
    // §11: the 2.59 divergences are all BELOW the masthead, which is where the
    // grains are allowed to differ. A yearly dashboard has no Open Tasks; that
    // is a fact about its body and must not have leaked upward.
    const yearly = composeDiaryDashboard("yearly");
    expect(yearly).not.toContain("tasks-table");
    expect(banner(yearly)[1]).toBe("links:today,scopes#diary");
  });
});

describe("the card belongs to the fence, not to a widget in it", () => {
  it("a period summary flags its block as the masthead card", () => {
    // ASSERTED THROUGH THE RULE AS OF 4.1 §3. This read the literal line
    // `container.addClass("journal-overview-card")` out of the source, which
    // was the only handle available while the decision was three `if`s inline
    // in the processor. The `frame:` modifier gave that decision a name and a
    // signature, so the property this test is actually about — a fence holding
    // a period summary takes the card — is now a call rather than a substring.
    //
    // The behaviour is unchanged and the assertion is stronger: it fails if the
    // card stops being applied, where the old one would also have failed on a
    // rename that changed nothing.
    expect(readCode("widgets")).toContain("OVERVIEW_KINDS");
    expect(
      chromeClasses("card", {
        entryBanner: false,
        overviewCard: true,
        studyBanner: false,
      })
    ).toContain("journal-overview-card");
  });

  it("and only the fence's default frame draws it", () => {
    // The other half, which did not exist to be asserted before: a period
    // summary in a block that has given up its frame must NOT take the card,
    // or `frame: section` reintroduces the doubling it was built to remove.
    for (const frame of ["section", "none"] as const) {
      expect(
        chromeClasses(frame, {
          entryBanner: false,
          overviewCard: true,
          studyBanner: false,
        }),
        frame
      ).not.toContain("journal-overview-card");
    }
  });

  it("named explicitly rather than by matching on '-summary'", () => {
    // `sleep-summary` and `confidence-summary` are neither period summaries nor
    // mastheads, and a prefix test would give a journal note a dashboard frame.
    const w = readSrc("widgets");
    expect(w).toContain('"quarter-summary",');
    expect(w).not.toContain('endsWith("-summary")');
  });

  it("and the summary widget gives up the frame it used to draw", () => {
    const css = readCss();
    expect(css).toContain(".journal-widget-block.journal-overview-card");
    expect(css).toContain(".journal-overview-card .journal-overview-summary");
    // DESCENDANT, NOT CHILD, and the test says so because the first cut of this
    // release used `>` and matched nothing: all four summaries are wrapped in a
    // `.journal-live-widget` host, so the summary is a grandchild of the block.
    expect(css).not.toContain(".journal-overview-card > .journal-overview-summary");
  });

  it("while the entry card keeps the one it has and grows a band", () => {
    const css = readCss();
    expect(css).toContain(".journal-entry-banner > .journal-links-card");
    // ── AND THE BAND IS NOT THE TOP EDGE ANY MORE (4.21.1) ──────────
    //
    // It was, from 3.2 patch 5 until then, and the rule that put it there —
    // `> .journal-links-card + .journal-entry-header` — is deliberately GONE
    // rather than adjusted: the name leads on every banner now, so the links
    // card is band 2 and nothing about where it sits is an entry's private
    // arrangement. Asserted as an absence because the adjacency selector is
    // what a re-flip would reach for first, and it would put the arrangement
    // back on one surface only.
    expect(css).not.toContain(
      ".journal-entry-banner > .journal-links-card + .journal-entry-header"
    );
    // The inset, the rule and the bottom-edge handoff belong to the shared band
    // class, which is what makes an entry's row and a leaf's one object.
    expect(css).toContain(".journal-slim-banner .journal-banner-nav");
  });

  it("and the two links bands are styled the same, because they are the same", () => {
    const css = readCss();
    for (const owner of [".journal-entry-banner", ".journal-overview-card"]) {
      expect(css, owner).toContain(`${owner} > .journal-links-card > .journal-links-bar`);
    }
  });
});

describe("the species marker", () => {
  it("is an accent edge on the overview and nothing on the entry", () => {
    const css = readCss();
    const at = css.indexOf(".journal-overview-card .journal-overview-banner");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, at + 400)).toContain("border-left");
    // An entry is a note you write in, and an accent wash there would compete
    // with the entry itself.
    const entry = css.indexOf(".journal-entry-banner > .journal-links-card");
    expect(css.slice(entry, entry + 300)).not.toContain("border-left");
  });

  it("and the token it is drawn in is declared where the theme's own is", () => {
    // 3.6 PATCH 1. The rule above shipped in 3.2 and the edge never painted,
    // because `--am-area-diary: var(--interactive-accent)` was declared in
    // `:root` and Obsidian declares `--interactive-accent` on `body`. A custom
    // property is substituted at its DECLARATION site, so the lookup ran one
    // element above the value it needed, resolved to guaranteed-invalid, and
    // was inherited as invalid by everything below.
    //
    // Asserting the declaration site rather than the rule is the point: the
    // rule was right for four releases and the marker still did not exist. A
    // test that reads `border-left` in the stylesheet cannot tell the
    // difference; this one can.
    const css = readCss();
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    for (const token of ["--am-area-diary:", "--am-area-diary-rgb:"]) {
      expect(root, token).not.toContain(token);
    }
    const body = css.slice(css.indexOf("body {"), css.indexOf("}", css.indexOf("body {")));
    expect(body).toContain("--am-area-diary: var(--interactive-accent)");
  });
});

describe("the period button is welded, not moved", () => {
  it("stays a sibling the postprocessor owns", () => {
    // It cannot live inside the summary. `LiveWidget.rerender()` rebuilds that
    // subtree whenever the diary folders change, so a button parented there
    // survives until the first entry is edited and then vanishes — with the
    // directive still in the file, which is the worst of both. The first cut
    // of patch 6 did exactly that.
    const w = readCode("widgets");
    expect(w).not.toContain("navStack");
    expect(w).toContain('addClass("journal-overview-actions")');
  });

  it("and so does the jump-to-now button, which joined it in 3.6", () => {
    // Same rule, second control. The now-button used to live in the band, in a
    // stack the summary builds — safe there, because a control the LiveWidget
    // BUILDS is rebuilt with it. Moving it to the footer inverts that: the
    // footer bar is never cleared, so a button the summary built and reparented
    // would be appended again on every metadata change and stack forever.
    //
    // So it is built by the bar's owner. Its LOGIC stays in periodnav.ts with
    // the rest of the period logic; only the element's parent changed hands.
    expect(readCode("widgets")).toContain("buildNowButton(this.plugin, ctx, overviewGrain)");
    expect(readCode("periodnav")).toContain("export function buildNowButton");
    // And the strip no longer creates one of its own.
    expect(readCode("periodnav")).not.toContain("outer.createEl(\"button\"");
  });

  it("and the strip still owns the state cue, because only it knows", () => {
    // The button is not rebuilt when the period changes; the strip is. So the
    // "you have navigated away" class is set from inside the strip, scoped so
    // that a bare `period-nav` elsewhere reaches nothing.
    //
    // RETARGETED IN 4.1.2, NOT WEAKENED. This asserted
    // `closest(".journal-overview-card")` — the containment property, pinned
    // through whichever class happened to provide it. `frame: section` withholds
    // that class, so on the diary dashboard the walk found nothing and the cue
    // silently stopped working while this test went on passing: it was pinning
    // the mechanism, and the mechanism was the bug.
    //
    // `.journal-widget-block` is the fence's own container under every frame
    // value (4.1 §4 names keeping it as the rule all three honour), so the
    // search reaches exactly as far as it did — which is what the sentence
    // above was ever about.
    const p = readCode("periodnav");
    expect(p).toContain('closest(".journal-widget-block")');
    expect(p).not.toContain('closest(".journal-overview-card")');
    expect(p).toContain("syncNowButton(outer,");
  });

  it("and borrows the banner's ground rather than its parent", () => {
    const css = readCss();
    const at = css.indexOf(".journal-overview-actions");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(css.indexOf("journal-overview-actions {", at));
    expect(rule.slice(0, 600)).toContain("border-left");
    // And it no longer sits directly on the body above it.
    expect(rule.slice(0, 600)).toContain("border-top");
  });

  it("only inside a masthead, never in an ordinary widget bar", () => {
    // The bar is opened in two places — the habit-chip branch and the general
    // inline branch — and until 3.6 the fourteen-line block that tags it was
    // written out twice, verbatim. Patch 7 had to add a button to it, and a
    // third divergent copy is how the two would start disagreeing about what a
    // masthead footer contains. One function now, so the guard exists once.
    const w = readCode("widgets");
    expect(w).toContain("const openActionsBar =");
    expect(w).toContain("if (!isOverviewCard) return created;");
    expect(w.match(/addClass\("journal-overview-actions"\)/g)).toHaveLength(1);
  });

  it("and the footer, not the band, is where the now-button sits", () => {
    // §4.2: the least important control in the band was the heaviest thing in
    // it. The footer already holds the card's one other whole-card action.
    const css = readCss();
    expect(css).toContain(".journal-overview-actions > .jpn-now-btn");
    // It takes the row's left edge by pushing, not by re-aligning the bar — a
    // footer holding only "Keep this month" must keep it on the right.
    const at = css.indexOf(".journal-overview-actions > .jpn-now-btn");
    expect(css.slice(at, css.indexOf("}", at))).toContain("margin-right: auto");
    // And it is gone from the band's row.
    const stack = css.indexOf(".journal-overview-banner .journal-period-nav-stack {");
    expect(css.slice(stack, stack + 400)).not.toContain("jpn-now-btn");
  });
});

describe("the four grains say the same things in the same places", () => {
  it("every dashboard's masthead ends with its own period button", () => {
    // The asymmetry was age, not argument: `new-monthly` predates the scoped
    // buttons 2.57 gave the other three, and monthly was never brought along.
    for (const [grain, directive] of [
      ["weekly", "button:new-week"],
      ["monthly", "button:new-month"],
      ["quarterly", "button:new-quarter"],
      ["yearly", "button:new-year"],
    ] as const) {
      const head = masthead(composeDiaryDashboard(grain));
      expect(head[head.length - 1], grain).toBe(directive);
    }
  });

  it("and a folder note is never mistaken for an entry — where that is still asked", () => {
    // THIS USED TO BE ABOUT THE BREADCRUMB. The monthly dashboard is a folder
    // note inside the monthly ENTRY folder, so every folder-based test claims
    // it, and the trail read "Monthly › Monthly". 4.8.1 deleted the trail, and
    // with it `diaryCrumbs` and the guard this named.
    //
    // The QUESTION did not go with it: `entryContextFor` makes the same
    // distinction for the entry navigator, from the same side, and that is now
    // the only place it is asked. Kept as an assertion rather than deleted,
    // because the failure it guards against — a dashboard treated as an entry —
    // is still reachable and would still be found weeks later.
    const links = readCode("links");
    expect(links).not.toContain("const isEntry =");
    expect(links).not.toContain("diaryCrumbs");
    expect(readCode("section-insert")).toContain("this.diaryContextFor(notePath)");
  });
});

describe("3.5: the span above, the value as a control", () => {
  it("keeps the masthead fence to navigation, summary and button", () => {
    // 3.4's `period-nav:` directive is withdrawn. Moving the navigator to the
    // nav row was right about the redundancy and wrong about the destination:
    // that row is a wrapping flex of pills and the navigator is a two-part
    // stack, so it broke the row onto its own line.
    for (const grain of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      const head = masthead(composeDiaryDashboard(grain));
      expect(head.some((l) => l.startsWith("period-nav:")), grain).toBe(false);
      // THE SUMMARY OPENS THE FENCE AS OF 4.19, where the navigation row used to
      // and the summary was second. The claim is what the fence holds, and it
      // holds one section's two lines now instead of two sections' three.
      expect(head[0], grain).toMatch(/-summary$/);
      expect(head[1], grain).toMatch(/^button:new-/);
      expect(head, grain).toHaveLength(2);
    }
  });

  it("builds the navigator inside the band rather than moving it there", () => {
    // The distinction 3.2 paid for: a control PARENTED INTO a LiveWidget's
    // subtree is destroyed on the next rebuild; a control the widget BUILDS is
    // rebuilt with it.
    const c = readCode("calendar");
    expect(c).toContain("textCol.appendChild(buildPeriodNav(plugin, ctx, unit))");
    const w = readCode("widgets");
    expect(w).not.toContain("linksBar");
  });

  it("prints the span, and never a title of its own", () => {
    const c = readCode("calendar");
    expect(c).toContain('cls: "job-span"');
    expect(c).not.toContain('cls: "job-title"');
    expect(c).not.toContain("job-eyebrow");
  });

  it("makes the picker trigger the headline, so it is already a button", () => {
    // The reason to enlarge the existing trigger rather than make the old
    // title clickable: focus, keyboard operation and the announced role come
    // with the element instead of having to be added to a div.
    const p = readCode("periodnav");
    expect(p).toContain("valueLabel(unit, cur)");
    expect(p).toContain('cls: "jpn-value-label"');
    expect(p).toContain('createEl("button"');
  });

  it("and the value is short at every grain, which is what makes it fit", () => {
    const p = readSrc("periodnav");
    for (const bit of ["`Week ${at.isoWeek()}`", '"MMMM YYYY"', "Math.floor(at.month() / 3) + 1"]) {
      expect(p, bit).toContain(bit);
    }
  });

  it("lays the strip and the now-button on one row", () => {
    // It was a vertical stack, which is what broke the nav row in 3.4.
    const css = readCss();
    expect(css).toContain(".journal-overview-banner .journal-period-nav-stack");
    expect(css).toContain(".journal-overview-banner .jpn-value-label");
  });

  it("so the page's own head is what names the page type", () => {
    // 3.4 moved the label from the band's eyebrow to the breadcrumb, on the
    // grounds that one of the two had to go and the crumb was already at the
    // top. 4.8.1 removed the crumb — the head above it says "📅 THIS WEEK",
    // which is the same sentence in the page's own voice — so the destination
    // that argument chose is now the block head.
    expect(readCode("links")).not.toContain("${base} overview");
    expect(readCode("widgets")).toContain('"week-summary": "📅 This week"');
  });
});

describe("3.6 patch 2: the span says what the value cannot", () => {
  // THE ONE PATCH IN THIS RELEASE A TEST CAN HOLD, and §9 is the reason it is
  // written as an invariant rather than as four expected strings. Four literals
  // would pass the day someone changed all four and re-pinned them; the rule is
  // that the two lines must not both carry the year, and that is what fails.
  //
  // Checkable at all only because 3.6 moved the four spans beside the four
  // values. While they lived at four call sites in three files, "does the span
  // repeat the value" was not a question any single module could be asked.
  const AT = moment("2026-08-02");
  const grains: [Unit, ReturnType<typeof moment>][] = [
    ["week", AT.clone().startOf("isoWeek")],
    ["month", AT.clone().startOf("month")],
    ["quarter", AT.clone().startOf("quarter")],
    ["year", AT.clone().startOf("year")],
  ];
  const elapsed = { end: "2026-08-02", days: 214 };

  const lines = (unit: Unit, at: ReturnType<typeof moment>): [string, string] => [
    periodSpan(unit, at, elapsed),
    valueLabel(unit, at),
  ];

  it("prints the year exactly once per grain, across both lines", () => {
    for (const [unit, at] of grains) {
      const [span, value] = lines(unit, at);
      const hits = (`${span} ${value}`.match(/2026/g) ?? []).length;
      expect(hits, `${unit}: "${span}" / "${value}"`).toBe(1);
    }
  });

  it("and the week is the grain that keeps it, because its value cannot", () => {
    // `Week 31` carries neither a year nor a month. Every other value carries
    // the year, so every other span drops it.
    expect(periodSpan("week", grains[0][1])).toContain("2026");
    for (const [unit, at] of grains.slice(1, 3)) {
      expect(periodSpan(unit, at), unit).not.toContain("2026");
    }
  });

  it("never says a month name twice in one span", () => {
    // `1 Aug – 31 Aug 2026` was the one span written for 3.5 rather than
    // reused, and the worst of the four.
    for (const [unit, at] of grains) {
      const span = periodSpan(unit, at, elapsed);
      for (const month of ["Jan", "Aug", "Jul", "Sep"]) {
        const hits = (span.match(new RegExp(month, "g")) ?? []).length;
        expect(hits, `${unit}: "${span}" repeats ${month}`).toBeLessThan(2);
      }
    }
  });

  it("and states the period's own bounds, not how much of it has run", () => {
    // "so far" moved off the span and stayed on the stats line, which is the
    // line with a fraction to qualify. A span that changed shape mid-period is
    // the wobble the 3.5 split removed from the headline; it had simply moved
    // up one row.
    for (const [unit, at] of grains.slice(0, 3)) {
      expect(periodSpan(unit, at), unit).not.toContain("so far");
    }
    // The year is the stated exception: `2026` cannot carry a date range, so
    // its span is the only one reporting elapsed days.
    expect(periodSpan("year", grains[3][1], elapsed)).toContain("214 days elapsed");
    expect(periodSpan("year", grains[3][1], { end: "2027-01-01", days: 0 })).toBe(
      "Hasn't started yet"
    );
  });

  it("uses one dash for all four", () => {
    // Three grains used `–` and the week used `—`, because the week's was
    // written first and nothing since had cause to look at it.
    for (const [unit, at] of grains) {
      const span = periodSpan(unit, at, elapsed);
      expect(span, unit).toContain(" – ");
      expect(span, unit).not.toContain("—");
    }
  });

  it("and no caller writes a span of its own any more", () => {
    // The spans were four template literals in three files. A fifth grain, or
    // a fifth opinion about punctuation, would have gone in beside them.
    for (const module of ["calendar", "quarter-view", "year-view"]) {
      expect(readCode(module), module).not.toContain("yearSpan");
    }
    expect(readCode("quarter-view")).not.toContain("jq-coverage-range");
  });
});

describe("3.6 patches 5 and 8: what the band stopped saying", () => {
  const css = readCss();
  // The band's own rule, from its opening brace to its closing one.
  const bandRule = (): string => {
    const at = css.indexOf(".journal-overview-banner {");
    return css.slice(at, css.indexOf("}", at));
  };

  it("carries no tint, and the titlebar above it still does", () => {
    // §6's third question, answered by subtraction: wash AND edge AND a tinted
    // lid above is one fact said three ways — and it was only ever said twice,
    // because patch 1 found the edge had never painted. The lid keeps its tint
    // because a lid is supposed to read as one; the band takes the card's own
    // ground so the edge can work alone.
    //
    // This asserts the band's OWN rule rather than searching the sheet, because
    // the tint token is still in legitimate use elsewhere — today's row in the
    // week table, the open-task pill. A grep for the token would fail on those
    // and say nothing about the band.
    expect(bandRule()).not.toContain("background:");
    // AND THE LID IS GONE ALTOGETHER (4.8.1). This read "the lid keeps its tint
    // because a lid is supposed to read as one" — true of a lid, and the whole
    // question was whether the card needed one. It does not: the block's head
    // sits above it saying the same thing without the wash.
    expect(css).not.toContain(".am-titlebar");
  });

  it("and the trigger's affordance is the control, not a text decoration", () => {
    // The dashed underline sat about two pixels above `.jeh-nav.jeh-seg`'s own
    // capsule border, which already meant the same thing — a decoration that
    // had failed rather than a boundary. What replaces it is a ground the whole
    // trigger owns, caret included.
    const at = css.indexOf(".journal-overview-banner .jeh-datenav-trigger.jpn-value {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).not.toContain("dashed");
    // A button that keyboard could always reach could not show that it had
    // been reached: the underline never changed on focus.
    expect(css).toContain(".journal-overview-banner .jeh-datenav-trigger.jpn-value:focus-visible");
  });

  it("and its three parts measure from one number", () => {
    // The headline's size is declared on the STRIP, not on the trigger, because
    // the chevrons are not inside the trigger — declaring it one level down is
    // what left them sized for the 12px segmented control they used to be part
    // of. Every part that has to agree with the headline reads it.
    const at = css.indexOf(".journal-overview-banner .journal-period-nav.jeh-seg {");
    expect(css.slice(at, css.indexOf("}", at))).toContain("--jpn-headline:");
    for (const consumer of [
      ".journal-overview-banner .jeh-navpill svg",
      ".journal-overview-banner .jpn-value-label",
      ".journal-overview-banner .jpn-value .jeh-datenav-caret svg",
    ]) {
      const i = css.indexOf(consumer);
      expect(i, consumer).toBeGreaterThan(0);
      expect(css.slice(i, css.indexOf("}", i)), consumer).toContain("var(--jpn-headline)");
    }
  });
});

describe("3.6 patch 6 (enabling half): one source for the period's figures", () => {
  const src = readCode("calendar");

  it("exposes the numbers without drawing them", () => {
    // §4.1's stated requirement is that the stat cards read FROM
    // `renderPeriodStats` rather than recompute beside it, and until 3.6 that
    // was not possible: it opened a `<p>`, appended to it, and returned the
    // element. There was no way to ask it for figures, so a card strip would
    // have called `periodCoverage` and `sumAlmanacTasks` again and become the
    // second place a dashboard's numbers are decided.
    expect(src).toContain("export function periodStats(");
    expect(src).toContain("export interface PeriodStats");
  });

  it("and the renderer computes nothing of its own", () => {
    // THE ASSERTION THAT MAKES THE SPLIT MEAN SOMETHING. Two functions where
    // the second still does its own arithmetic is not a split, it is a copy —
    // and a copy is exactly what §4.1 was guarding against. Everything the
    // prose line prints must come through `periodStats`.
    const at = src.indexOf("export function renderPeriodStats(");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("periodStats(files, span, app, todayIso)");
    for (const recompute of ["periodCoverage(", "sumAlmanacTasks(", "files.length"]) {
      expect(body, recompute).not.toContain(recompute);
    }
  });

  it("and the task read is one pass, shared", () => {
    // A promise can be awaited any number of times. Handing back a resolved
    // number instead would have made this function async, which would have made
    // both dashboards async, which is how a synchronous frontmatter read ends
    // up queued behind a file read it does not need. So the line and the cards
    // beside it share ONE walk over the entries and cannot disagree.
    const at = src.indexOf("export function periodStats(");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("tasks: sumAlmanacTasks(app, files)");
    // Called from exactly one place in this file. A second call site is the
    // second walk, and the second answer.
    expect(src.match(/sumAlmanacTasks\(/g) ?? []).toHaveLength(1);
  });
});

describe("3.6 patch 6: the stat strip", () => {
  const css = readCss();
  const src = readCode("stat-strip");

  it("takes its column count as data, not as an inline style", () => {
    // THE ONE THAT WOULD HAVE CAUGHT THE BUG. The first cut set
    // `--am-stats-cols` with `style.setProperty`, which reads perfectly and
    // cannot work: an inline declaration is the one thing a stylesheet cannot
    // override, so the container query was silently beaten by the element it
    // was laying out. The strip stayed four across at every width and nothing
    // errored — it just never collapsed.
    //
    // A layout the CSS has to be able to ADAPT cannot be written from
    // JavaScript. JavaScript knows how many cards there are; the stylesheet
    // knows how many fit.
    expect(src).toContain('setAttr("data-cols"');
    expect(src).not.toContain("style.setProperty");
    expect(src).not.toContain("grid-template-columns");
  });

  it("collapses on the pane's width, not the window's", () => {
    // The year's strip collapsed at `@media (max-width: 480px)`, which measures
    // the WINDOW. Almanac renders in a note pane, and a 400px pane in a 1600px
    // window is the ordinary way anyone reads a dashboard beside something
    // else — so a four-up strip in a narrow pane never collapsed unless the
    // whole of Obsidian was phone-width. `.journal-widget-block` has carried
    // `container-type: inline-size` since 2.51 and twelve rules already query
    // it; that one was written before that was true and never revisited.
    //
    // Read from the component's own file rather than the bundle: the bundle
    // carries every other surface's queries too, and this claim is about one.
    const sheet = readFileSync("styles/96-stat-strip.css", "utf8");
    expect(sheet).toContain("@container (max-width: 480px)");
    // At the start of a line, which is where a rule lives. The comment above
    // the query names `@media` twice as the thing this is NOT, and naming the
    // alternative is the opposite of reaching for it.
    expect(sheet).not.toMatch(/^@media/m);
    const at = sheet.indexOf("@container (max-width: 480px)");
    const query = sheet.slice(at, sheet.indexOf("}\n}", at));
    // Four and three collapse to two; one and two are already narrow enough
    // and are deliberately not listed.
    expect(query).toContain('.am-stats[data-cols="4"]');
    expect(query).toContain('.am-stats[data-cols="3"]');
    expect(query).not.toContain('data-cols="1"');
    expect(query).not.toContain('data-cols="2"');
  });

  it("and the rules it replaced are retired, markup included", () => {
    // Same shape as patch 3's fix and the same reason it needs both halves:
    // the year's `.jyr-stat*` rules and the band's `.journal-period-stats` are
    // gone, AND no caller still emits either. A retired rule with live markup
    // is how `Quarters0 of 12 entries` happened.
    // The RULE form, with its opening brace: the retirement notes left in
    // place of these rules name them, and a note is the opposite of the thing
    // being asserted against.
    for (const rule of [
      ".jyr-stat {",
      ".jyr-stat-value {",
      ".jyr-stat-label {",
      ".jyr-stat-sub {",
      ".journal-period-stats {",
    ]) {
      expect(css, rule).not.toContain(rule);
    }
    for (const module of ["year-view", "calendar"]) {
      // `jyr-stats-wrap` survives — it is the frame the strip and the density
      // section share, and it was never part of the cell markup.
      for (const cls of ['"jyr-stat"', '"jyr-stats"', "jyr-stat-", "journal-period-stats", "jms-tasks", "jms-notyet"]) {
        expect(readCode(module), `${module} / ${cls}`).not.toContain(cls);
      }
    }
  });

  it("gives every grain the two figures it can honestly answer", () => {
    // §6's open question, answered as the smallest honest list rather than as
    // four figures per grain. 3.2 deferred the strip because a week cannot
    // answer "longest streak" in a way worth a cell — a week's longest streak
    // is at most seven and usually just its entry count again — and a strip
    // padded to four with zeros is worse than none. Days logged and tasks done
    // are what every grain has, in the year page's own words, so the same fact
    // reads the same at every grain.
    const cal = readCode("calendar");
    const at = cal.indexOf("export function renderPeriodStats(");
    const body = cal.slice(at, cal.indexOf("\n}", at));
    expect(body).toContain('label: "Days logged"');
    expect(body).toContain('label: "Tasks done"');
    expect(readCode("year-view")).toContain('"Tasks done"');
    // And it still computes nothing of its own — patch 6's enabling half.
    for (const recompute of ["periodCoverage(", "sumAlmanacTasks(", "files.length"]) {
      expect(body, recompute).not.toContain(recompute);
    }
  });
});
