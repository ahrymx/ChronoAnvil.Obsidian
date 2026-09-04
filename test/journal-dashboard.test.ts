// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One dashboard per journal, 4.36.
//
// WHAT IS ASSERTED HERE AND WHAT IS ASSERTED NEXT DOOR.
// `test/dashboard-sections.test.ts` carries a table of the three flat dashboard
// pages and puts every STRUCTURAL property to all of them — a catalogue that
// locates what it composes, plans no foreign runs, pins its banner, restores a
// file exactly on remove-then-re-add. Those are properties of a flat note and
// the journal dashboard is a third row there rather than a fourth copy here.
//
// This file is what is true of THIS page and of no other: that there is one per
// journal, that they are in every walk `shippedNotes` feeds, that the editor
// recognises them and hands each the catalogue built from its own type, and
// that the page carries no frontmatter — the last of which is the quiet one, and
// the reason it is asserted rather than assumed is in `surfaceOfNote`.

import { describe, expect, it } from "vitest";
import {
  journalDashboardSections,
  composeJournalDashboardNote,
  journalDashboardSectionModel,
} from "../src/journals/journal-dashboard-sections";
import { modelForSurface, resolveSectionHost } from "../src/ui/section-insert";
import type { JournalHostRef } from "../src/ui/section-insert";
import { STUDY_JOURNAL, JOURNAL_PRESETS, buildJournalType } from "../src/journals/journal";
import type { JournalType } from "../src/journals/journal";
import { shippedNotes, isReconcilable } from "../src/core/scaffold";
import { repairNote } from "../src/core/repair-plan";
import { DEFAULT_PATHS } from "../src/core/constants";
import { SCOPE_ALL } from "../src/core/directive-grammar";
import { WIDGETS } from "../src/core/widget-registry";
import { folderNotePath } from "../src/core/util";
import { journalCrumbPath } from "../src/journals/study-header";
import { isPageWidgetId } from "../src/core/widget-sections";
import { readSrc } from "./sources";

// EVERY PRESET, NOT JUST STUDY. The catalogue is a function of the type, and
// what varies across the four is exactly what would break a per-journal page:
// Projects has two levels and no rating, Exercise & Diet has one level and five
// trackers, Media has one level and pages. A test that only ever built Study's
// page would be asserting a page that happens to be the one the author had open.
const TYPES: JournalType[] = JOURNAL_PRESETS.map((p) => buildJournalType(p.config));

// SIX AND FOUR AS OF 4.70, WHERE IT WAS FOUR AND FIVE. Two sections crossed the
// line, in the release whose subject is what a repaired vault's default pages
// hold:
//
//   `stats`  — the band had been offered since 4.46 on a reason its own comment
//              names as expiring: composing it is a decision worth its own
//              release rather than a side effect of a merge. This is that
//              release, and a bare band resolves to `activity`, which counts
//              notes and dates and so draws honestly on a journal that
//              registers no trackers at all.
//   `recent` — new, and the answer this page had to no question: it counted,
//              grouped and listed what was undone, and could not say what had
//              been written lately.
//
// `totals` BECAME `stats` IN 4.46. The section is the same one — it offers the
// band — and the widget under it merged with `topic-stats`, so Totals is now one
// of the four presets rather than a section of its own.
//
// AND `activity` MOVED BELOW `stats` IN 5.18. The order here is composition
// order, and the band of a whole year was the second block on a page whose job
// is to get the reader into the folder — see `journalDashboardSections`. The
// set is unchanged; only where the reader meets it is.
const COMPOSED = [
  "banner",
  "contents",
  "stats",
  "activity",
  "recent",
  "open-tasks",
];
const OFFERED = ["tally", "review", "tags", "charts"];

describe("the catalogue, for every journal a reader can start from", () => {
  for (const type of TYPES) {
    describe(type.name, () => {
      it("composes six sections and offers four", () => {
        // THE RELEASE'S OWN ANSWER, ASSERTED RATHER THAN DESCRIBED. Six
        // compose — the page's name, what has been happening, what is in the
        // journal, its numbers, what was written lately and what is still open
        // — and four are offered. Moving one across
        // that line is a decision about what repair writes into every journal in
        // every vault, so it should not be possible to make it quietly.
        const sections = journalDashboardSections(type);
        expect(sections.filter((s) => !s.optIn).map((s) => s.id)).toEqual(COMPOSED);
        expect(sections.filter((s) => s.optIn).map((s) => s.id).sort()).toEqual(
          [...OFFERED].sort()
        );
      });

      it("names the journal in the two directives that need it", () => {
        // The two arguments this page writes, and the only two. Every other
        // directive is bare and resolves to the host note's own folder, which on
        // a folder note is the journal root — so a rename cannot strand them.
        const text = composeJournalDashboardNote(type);
        expect(text).toContain(`journals-header:${type.id}`);
        expect(text).toContain(`level-cards:${type.id}`);
      });

      it("writes no folder path into any directive", () => {
        // THE PROPERTY THE BARE FORM BUYS, stated as behaviour rather than as a
        // reading of the source: rename the journal's folder and nothing on this
        // page has to be remapped. A path written into a directive is a path
        // that does not follow a rename the way a settings read would.
        const text = composeJournalDashboardNote(type);
        expect(text).not.toContain(type.root);
        // And the same for a journal whose root has been pointed somewhere odd,
        // which `customJournals` explicitly permits.
        const moved = { ...type, root: "09 - Elsewhere/Kept Here" };
        expect(composeJournalDashboardNote(moved)).not.toContain(moved.root);
      });

      it("declares no frontmatter, so the journal resolver cannot claim it", () => {
        // THE QUIET ONE. `resolveSectionHost` needs a path under a registered
        // root AND a `type:` value naming a level or a kind. This page sits at
        // the journal root — under it, by that test — so the only thing keeping
        // it out of the journal NOTE catalogue is that it carries no `type:` at
        // all. A page that grew one would silently start being offered a
        // trackers grid and a recall region, and the section editor would be
        // describing this page as the thing it is a page about.
        const text = composeJournalDashboardNote(type);
        expect(text.startsWith("---")).toBe(false);

        const refs: JournalHostRef[] = [
          { type, root: type.root, templatesFolder: type.templatesFolder },
        ];
        const path = folderNotePath(type.root);
        expect(resolveSectionHost(refs, path, undefined)).toBeNull();
        expect(resolveSectionHost(refs, path, "")).toBeNull();
        // Non-vacuous: the same resolver DOES claim a note under this root that
        // carries a level id, so the null above is about the frontmatter rather
        // than about the path.
        expect(
          resolveSectionHost(refs, `${type.root}/Thing/Thing.md`, type.levels[0].id)
        ).not.toBeNull();
      });
    });
  }
});

describe("the contents section takes either spelling of its question", () => {
  // 4.16 §1's rule, reused. 4.36.0 composed `level-index` here and 4.36.1
  // composes `level-cards` — the same question in a card arrangement — so both
  // spellings are on disk in real vaults. A locator that knew only one word
  // would report this section ABSENT on every page composed by the other, mark
  // a LOCKED section missing, and offer to add a second copy of what is there.
  const model = journalDashboardSectionModel(STUDY_JOURNAL, STUDY_JOURNAL.root);
  const cards = composeJournalDashboardNote(STUDY_JOURNAL);
  const table = cards.replace("level-cards:", "level-index:");

  it("finds the section whichever widget draws it", () => {
    expect(model.present(table)).toContain("contents");
    expect(model.present(cards)).toContain("contents");
  });

  it("plans nothing for a page composed either way", () => {
    // The consequence that matters, in both directions: a 4.36.0 page keeps its
    // table rather than being rewritten, and a reader who swapped to the table
    // by hand is not offered the cards back beside it.
    expect(model.apply(cards, model.present(cards))).toBeNull();
    expect(model.apply(table, model.present(table))).toBeNull();
  });
});

describe("one page per journal, in every walk that reads the list", () => {
  it("adds exactly one entry per registered type, at its folder note", () => {
    const none = shippedNotes(DEFAULT_PATHS, [], []);
    const one = shippedNotes(DEFAULT_PATHS, [STUDY_JOURNAL], []);
    expect(one.length).toBe(none.length + 1);
    const added = one.filter((n) => !none.some((m) => m.dest === n.dest));
    expect(added.map((n) => n.dest)).toEqual([
      folderNotePath(STUDY_JOURNAL.root),
    ]);
    // AND NOTHING ELSE IN THE LIST MOVES. The parameter adds entries; it must
    // not change what the six fixed pages are or where they go.
    expect(one.slice(0, none.length).map((n) => n.dest)).toEqual(none.map((n) => n.dest));

    // NOTHING FIXED IS JOURNAL-SENSITIVE, and that is stronger than it was.
    // 4.68 allowed one exception here — `ChronoAnvil.canvas` is a map OF this vault,
    // so registering a journal put a node on it — and 4.81's shrink to four
    // cards removed even that: the map draws the journals TREE, not its types,
    // so the baseline is the same bytes either way. Anything appearing here is
    // a fixed page quietly becoming journal-dependent, which is what the
    // assertion above was written to catch.
    const shifted = one
      .slice(0, none.length)
      .filter((n, i) => JSON.stringify(n) !== JSON.stringify(none[i]))
      .map((n) => n.dest);
    expect(shifted).toEqual([]);
  });

  it("writes them as composed notes rather than assets or templates", () => {
    // Composed, so `repairNote` can converge them; not `template: true`, so
    // they are not excluded from `reconcileLayouts`. Both halves matter — a
    // template flag here would buy permanent drift the moment a directive is
    // renamed.
    const note = shippedNotes(DEFAULT_PATHS, TYPES, []).find(
      (n) => n.dest === folderNotePath(STUDY_JOURNAL.root)
    );
    expect(note?.content).toBe(composeJournalDashboardNote(STUDY_JOURNAL));
    expect(note?.asset).toBeUndefined();
    expect(note?.template).toBeFalsy();
  });

  it("puts them in all four walks, which is what `isReconcilable` decides", () => {
    // THE ONE PREDICATE, TWO READERS (4.1 §6.1). `reconcileLayouts` and both
    // migration walks filter on this; `planCreate` writes whatever is missing.
    // A journal dashboard failing it would be silently absent from three of the
    // four, which is the hole the required `types` parameter exists to close on
    // the other side.
    for (const type of TYPES) {
      const note = shippedNotes(DEFAULT_PATHS, TYPES, []).find(
        (n) => n.dest === folderNotePath(type.root)
      );
      expect(note, type.name).toBeTruthy();
      expect(isReconcilable(note!), type.name).toBe(true);
    }
  });

  it("carries the surface the editor will be handed", () => {
    // The row that matters, and the failure it guards is 3.11 §1's: if
    // `shippedNotes` writes a path with one surface and `modelForSurface` is
    // given another, repair composes a page the section editor opens as
    // something else.
    const note = shippedNotes(DEFAULT_PATHS, [STUDY_JOURNAL], []).find(
      (n) => n.dest === folderNotePath(STUDY_JOURNAL.root)
    );
    expect(note?.surface).toEqual({
      kind: "journal-dashboard",
      ctx: { type: STUDY_JOURNAL },
    });
  });

  it("follows a renamed journal folder with nothing to remap", () => {
    // §2.5's property, one level in from the two folder notes: the path is
    // DERIVED, so there is no key in `DEFAULT_PATHS` to update and no entry in
    // `remapConfiguredPaths` to add.
    const moved = { ...STUDY_JOURNAL, root: "09 - Notebooks/Learning" };
    expect(shippedNotes(DEFAULT_PATHS, [moved], []).map((n) => n.dest)).toContain(
      "09 - Notebooks/Learning/Learning.md"
    );
    expect(Object.keys(DEFAULT_PATHS)).not.toContain("journalDashboard");
  });
});

describe("the editor opens on it, as that journal's page", () => {
  const own = (ids: readonly string[]): string[] =>
    ids.filter((id) => !isPageWidgetId(id));

  it("hands each journal the catalogue built from its own type", () => {
    for (const type of TYPES) {
      const { model } = modelForSurface({
        kind: "journal-dashboard",
        ctx: { type },
      });
      expect(own(model.sections().map((s) => s.id)), type.name).toEqual(
        journalDashboardSections(type).map((s) => s.id)
      );
    }
  });

  it("names the journal rather than the page kind", () => {
    // A vault has one diary and N of these. "journal dashboard" would be the
    // one noun in the plugin that cannot tell a reader which page they are on,
    // which is the whole reason `ResolvedSurface` carries a ctx here.
    for (const type of TYPES) {
      const { noun } = modelForSurface({
        kind: "journal-dashboard",
        ctx: { type },
      });
      expect(noun).toBe(`${type.name} dashboard`);
    }
  });

  it("is a page the journal NOTE resolver refuses, which is why the cog needed a fallthrough (5.20)", () => {
    // THE ASYMMETRY THAT HID THE DOOR FOR FOUR RELEASES. `bannerSurfaceOf`
    // answers "journal" for anything under a journal root, so the vault
    // banner reached for `journalBannerMenu` on this page too — and that
    // builder asks `contextFor`, which is `resolveSectionHost`: a journal NOTE,
    // resolved from a `type:` value against the journal's own levels and kinds.
    // This page writes no frontmatter at all (asserted below), so the answer is
    // null, and null was read as "there is no menu here". The cog opened on
    // *Banner art & settings…* alone on every journal's front page.
    //
    // The refusal itself is CORRECT and stays: there is no Template…, no
    // tracker and no Convert to a dashboard to offer on a page that is not a
    // note of any kind. What was wrong is what the caller did with it.
    const refs: JournalHostRef[] = TYPES.map((type) => ({
      type,
      root: type.root,
      templatesFolder: type.templatesFolder,
    }));
    for (const type of TYPES) {
      const dash = folderNotePath(type.root);
      // No `type:` to resolve, and nothing resolves without one.
      expect(composeJournalDashboardNote(type).startsWith("---")).toBe(false);
      expect(resolveSectionHost(refs, dash, undefined), type.name).toBeNull();
      // And the surface that DOES claim it hands over this journal's own
      // catalogue — the door the fallthrough opens.
      const { model, noun } = modelForSurface({
        kind: "journal-dashboard",
        ctx: { type },
      });
      expect(noun).toBe(`${type.name} dashboard`);
      expect(own(model.sections().map((s) => s.id)), type.name).toEqual(
        journalDashboardSections(type).map((s) => s.id)
      );
    }
  });

  it("says which page a refusal is about", () => {
    const model = journalDashboardSectionModel(STUDY_JOURNAL, STUDY_JOURNAL.root);
    const why = model.refusal("contents", composeJournalDashboardNote(STUDY_JOURNAL));
    expect(why).toContain(`the ${STUDY_JOURNAL.name} dashboard`);
    expect(why).toContain("can't be removed");
  });

  it("offers the five it does not compose, and none of the four it does", () => {
    const ids = journalDashboardSectionModel(STUDY_JOURNAL, STUDY_JOURNAL.root)
      .addable(composeJournalDashboardNote(STUDY_JOURNAL))
      .map((s) => s.id);
    for (const id of OFFERED) expect(ids, id).toContain(id);
    for (const id of COMPOSED) expect(ids, id).not.toContain(id);
    // AND NOT A SECOND COPY THROUGH THE WIDGET DOOR. The page writes
    // `tasks-table`, so the widget half must not offer it again under its own
    // prefix — which is the de-dup `addable` exists for.
    expect(ids.filter((id) => id.startsWith("w:tasks-table"))).toEqual([]);
  });
});

describe("open tasks can be drawn bare (5.21)", () => {
  const model = journalDashboardSectionModel(STUDY_JOURNAL, STUDY_JOURNAL.root);
  const shipped = composeJournalDashboardNote(STUDY_JOURNAL);

  const view = (text: string) =>
    model.sections(text).find((v) => v.id === "open-tasks");

  it("offers the toggle at all, which it did not before", () => {
    // THE GAP THIS CLOSED. Open tasks is the second cell of the Lately row, so
    // it composes no bar — Recent notes beside it writes the one the fence
    // gets — and every other section on this catalogue derives its toggle from
    // the bar its own `render` composes. Nothing was reading `bar`, the line it
    // takes back when it stands alone, as the answer to the same question.
    // `diary-sections.ts` closed the identical gap in 5.14 and this catalogue
    // was not swept with it.
    const qs = view(shipped)?.questions ?? [];
    expect(qs.some((q) => q.kind === "form")).toBe(true);
  });

  it("takes its solo title off, and puts it back, through the answer", () => {
    // THE ROUND TRIP IS THE CLAIM. `soloBar` gives a lone cell the title and
    // `withAnswers` is the only gesture that can take it off again, so the two
    // must be spelling the same line — which is why `OPEN_TASKS_BAR` is said
    // once in that catalogue and read by both.
    const alone = model.apply(
      shipped,
      model.present(shipped).filter((id) => id !== "recent")
    ) as string;
    expect(alone).not.toBeNull();
    expect(alone).toContain("header:⏳ Open tasks");
    expect(view(alone)?.answered?.form).toBe("section");

    const bare = model.apply(
      alone,
      model
        .present(alone)
        .map((id) =>
          id === "open-tasks" ? { id, options: { form: "widget" } } : id
        )
    ) as string;
    expect(bare).not.toBeNull();
    expect(bare).not.toContain("header:⏳ Open tasks");
    expect(bare).toContain("tasks-table");
    // Read back off the FILE, which is where the answer lives — there is no
    // second record of it and `formOf` is the one reader.
    expect(view(bare)?.answered?.form).toBe("widget");

    const back = model.apply(
      bare,
      model
        .present(bare)
        .map((id) =>
          id === "open-tasks" ? { id, options: { form: "section" } } : id
        )
    );
    expect(back).toBe(alone);
  });

  it("says the same line in both places it is written", () => {
    // `soloBar` splices `JournalSection.bar` and `withAnswers` splices
    // `FormQuestion.bar`. Two spellings would be two titles for one section,
    // each written by a different gesture and neither able to remove the other.
    const src = readSrc("journal-dashboard-sections");
    expect(src).toContain("const OPEN_TASKS_BAR = ");
    expect(src).toContain("bar: OPEN_TASKS_BAR,");
    expect(src).toContain("formQuestion(OPEN_TASKS_BAR, HEADER_KEYWORD)");
  });
});

describe("repair converges the page without touching what a reader wrote", () => {
  const type = STUDY_JOURNAL;
  const model = journalDashboardSectionModel(type, type.root);
  const shipped = composeJournalDashboardNote(type);

  it("leaves a freshly composed page alone", () => {
    // Idempotence, and it is the property the whole reconciliation rests on: a
    // repair that rewrote this page every time it ran would touch every
    // journal's dashboard on every setup command.
    const { ops, next } = repairNote(model, shipped, shipped);
    expect(next).toBeNull();
    expect(ops).toEqual([]);
  });

  it("puts back a section the reader removed, and only that", () => {
    const without = model.apply(
      shipped,
      model.present(shipped).filter((id) => id !== "open-tasks")
    );
    expect(without).not.toBeNull();
    const { ops, next } = repairNote(model, without as string, shipped);
    expect(ops.map((o) => o.kind)).toEqual(["add"]);
    expect(next).toBe(shipped);
  });

  it("never removes a block it did not write", () => {
    // The rule `repairNote` is built on — `remove` is FORBIDDEN — asserted on
    // this page because it is the first page a reader will put their own charts
    // and prose on that is ALSO written per journal.
    const mine = `${shipped}\n## My own notes\n\nSomething I wrote.\n`;
    const { ops, next } = repairNote(model, mine, shipped);
    expect(ops.filter((o) => o.kind === "remove")).toEqual([]);
    expect(next).toBeNull();
    expect(mine).toContain("Something I wrote.");
  });
});

describe("the activity band can be pointed at one journal", () => {
  // 4.36 §3. The band's documented scope is "every registered journal's root
  // folder, unioned", and on a page about ONE journal every number in it would
  // be a plausible figure about something else — which is the worst shape a
  // statistic can take, because nothing about it looks wrong.
  //
  // `journalsHeaderScope` IS TESTED THROUGH A STUB PLUGIN, since it reads only
  // `registeredJournalTypes`. The real resolution lives in `journal.ts` and has
  // its own tests; what is asserted here is the four answers this function gives.
  const plugin = (types: JournalType[]): never =>
    ({
      settings: {
        customJournals: types.map((t) => ({
          id: t.id,
          name: t.name,
          emoji: t.emoji,
          root: t.root,
          templatesFolder: t.templatesFolder,
          levels: t.levels,
          kinds: t.kinds,
        })),
      },
    }) as never;

  it("takes an id, the `all` keyword, and nothing at all", async () => {
    const { journalsHeaderScope } = await import("../src/journals/journals-header");
    const p = plugin([STUDY_JOURNAL]);
    expect(journalsHeaderScope(p, "")).toHaveLength(1);
    expect(journalsHeaderScope(p, SCOPE_ALL)).toHaveLength(1);
    const one = journalsHeaderScope(p, STUDY_JOURNAL.id);
    expect(Array.isArray(one) && one[0].id).toBe(STUDY_JOURNAL.id);
  });

  it("refuses an unknown id by name, rather than drawing nothing", () => {
    // THE FAILURE THIS EXISTS TO CLOSE. The band renders an empty root when it
    // has no journals — correct on a vault that has none, and indistinguishable
    // from a typo on a vault that has four. A widget that renders nothing looks
    // exactly like a widget that is not there.
    return import("../src/journals/journals-header").then(
      ({ journalsHeaderScope }) => {
        const why = journalsHeaderScope(plugin([STUDY_JOURNAL]), "stdy");
        expect(typeof why).toBe("string");
        expect(why).toContain('"stdy"');
        expect(why).toContain(STUDY_JOURNAL.id);
      }
    );
  });

  it("spells its keyword the way every other scope keyword is spelled", () => {
    // `widget-registry.ts` is "a table with no functions in it" and has no
    // imports, so `SCOPE_ALL` is written out there. This is the assertion that
    // keeps the literal and the constant from drifting apart — and it covers
    // the two entries that had it before this release as well as the new one.
    for (const keyword of ["journals-header", "review-queue", "journal-search"]) {
      const arg = WIDGETS[keyword].arg;
      const values = arg && "keywords" in arg ? (arg.keywords ?? []) : [];
      expect(values.map((v) => v.value), keyword).toContain(SCOPE_ALL);
    }
  });
});

describe("the trail gains the journal it has always skipped", () => {
  // 4.36 §4. `journalAncestors` slices the path BELOW the root, so a Study
  // lesson's trail has always read `Journals › Maths › Algebra` — the journals
  // root, then a Subject, with the journal itself missing. That is not what
  // `journalCrumbs` says it does: *"a trail names a note's ancestors, never the
  // note itself"*, and a journal is an ancestor of every note in it.
  //
  // The reason was the absent file, not the rule. There is a file now.
  const root = STUDY_JOURNAL.root;

  it("points at the journal's own dashboard", () => {
    expect(journalCrumbPath(root, `${root}/Maths/Algebra/Algebra.md`)).toBe(
      folderNotePath(root)
    );
  });

  it("drops itself when the dashboard is the open note", () => {
    // The same rule `rootCrumbPath` states one level up, and the reason is the
    // same: a trail ending in the name of the page you are on is a step to
    // nowhere.
    expect(journalCrumbPath(root, folderNotePath(root))).toBeNull();
  });

  it("follows a renamed journal folder", () => {
    // The derived path again: rename the folder in the file explorer and the
    // crumb moves with it, because there is no configured value in between.
    expect(journalCrumbPath("09 - Notebooks/Learning", "09 - Notebooks/Learning/A/A.md")).toBe(
      "09 - Notebooks/Learning/Learning.md"
    );
  });

  it("does not widen `journalAncestors`, which answers a different question", () => {
    // A SEPARATE FUNCTION ON PURPOSE. `journalAncestors` says which CONTAINER
    // folders a note is inside — the question the folder rollups, `metaFor` and
    // the level index all ask — and a journal is not a container. Widening it
    // would change four readers to give one a crumb, and every one of them
    // would then have a row or a heading for the journal itself.
    const src = readSrc("journal").replace(/\/\/.*$/gm, "");
    const at = src.indexOf("export function journalAncestors(");
    expect(at, "journalAncestors is gone").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}", at));
    // Still starts below the root: the slice drops the root prefix and the
    // filename, and nothing prepends the journal back on.
    expect(body).toContain("full.slice(root.length)");
    expect(body).not.toContain("type.name");
  });

  it("withholds the crumb when the page is not there yet", () => {
    // THE CONDITION THAT MAKES THIS SAFE ON A VAULT THAT PREDATES 4.36. The
    // page is written by repair, by the wizard and by adoption, and until one of
    // those has run there is nothing to point at — so the crumb is withheld
    // rather than drawn dead. An unlinked crumb naming a page that does not
    // exist is precisely the step to nowhere this trail's rule is about.
    const src = readSrc("study-header").replace(/\/\/.*$/gm, "");
    expect(src).toContain("if (journalFile) out.push({ label: type.name");
  });
});
