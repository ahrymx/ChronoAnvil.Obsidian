// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The two folder-note dashboards, 4.1 §2.
//
// WHAT THESE ASSERT, AND WHAT THEY DELIBERATELY DO NOT. 4.0.2 set the rule that
// a new test asserts BEHAVIOUR — what a catalogue composes, what a model plans
// — rather than that a given string appears in a given file. So there is
// nothing here checking that `diary-dashboard-sections.ts` contains a word.
// What is checked is the properties the two pages rest on:
//
//   • the composer and the locator agree, so the editor can find what it wrote
//   • the path `shippedNotes` writes is the path the editor recognises
//   • the scope every folder-scoped directive resolves to is the one intended,
//     WITHOUT a path written into the note that could go stale on a rename
//   • the two pages disagree with the homepage where §2 says they should
//
// The last of those is the release's actual thesis, so it has a describe block
// of its own at the bottom.

import { describe, expect, it } from "vitest";
import {
  DIARY_DASHBOARD_SECTIONS,
  composeDiaryDashboardNote,
  diaryDashboardSectionModel,
} from "../src/diary/diary-dashboard-sections";
import {
  JOURNALS_DASHBOARD_SECTIONS,
  composeJournalsDashboardNote,
  journalsDashboardSectionModel,
} from "../src/journals/journals-dashboard-sections";
import {
  journalDashboardSections,
  composeJournalDashboardNote,
  journalDashboardSectionModel,
} from "../src/journals/journal-dashboard-sections";
import { homeSections, composeHomeNote } from "../src/diary/home-sections";
import { ROOT_CRUMB_LABEL, rootCrumbPath } from "../src/journals/study-header";
import { modelForSurface, resolveSectionHost } from "../src/ui/section-insert";
import type { JournalHostRef } from "../src/ui/section-insert";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { shippedNotes } from "../src/core/scaffold";
import {
  DEFAULT_PATHS,
  HEADER_PREFIX,
  RETIRED_WIDGETS,
  TRENDS_HEADING,
} from "../src/core/constants";
import { folderNotePath } from "../src/core/util";
import { planLayout, segment } from "../src/core/layout";
import type { FlatSection } from "../src/core/note-sections";
import { isPageWidgetId } from "../src/core/widget-sections";

const DIARY_HOME = folderNotePath(DEFAULT_PATHS.diaryRoot);
const JOURNALS_HOME = folderNotePath(DEFAULT_PATHS.journalsRoot);

// The two pages, as one table, so every structural property is asserted of both
// rather than of whichever one the author had in front of them.
const PAGES: {
  name: string;
  sections: FlatSection[];
  compose: () => string;
  model: () => ReturnType<typeof diaryDashboardSectionModel>;
  dest: string;
  locked: string;
  // Whether this page COMPOSES its charts region, as opposed to offering it.
  //
  // A FIELD RATHER THAN A THIRD COPY OF THE TABLE (4.36). The two folder-note
  // dashboards ship the region seeded with nothing, which is a working Add
  // button; a journal dashboard offers it instead, because that page is
  // RECONCILED and a composed section is one repair writes into every journal in
  // every vault at the next release. Every other property in this block is true
  // of all three, so the one that is not gets a flag rather than a fork.
  chartsComposed: boolean;
}[] = [
  {
    name: "the diary dashboard",
    sections: DIARY_DASHBOARD_SECTIONS,
    compose: composeDiaryDashboardNote,
    model: () => diaryDashboardSectionModel(DEFAULT_PATHS.diaryRoot),
    dest: DIARY_HOME,
    locked: "today",
    chartsComposed: true,
  },
  {
    name: "the journals dashboard",
    sections: JOURNALS_DASHBOARD_SECTIONS,
    compose: composeJournalsDashboardNote,
    model: () => journalsDashboardSectionModel(DEFAULT_PATHS.journalsRoot),
    dest: JOURNALS_HOME,
    locked: "journals",
    chartsComposed: true,
  },
  // THE THIRD PAGE, 4.36. Added to this table rather than given a block of its
  // own precisely because everything above is structural: a catalogue that
  // locates what it composes, plans no foreign runs, keeps its banner pinned and
  // restores a file exactly on remove-then-re-add. Those are properties of a
  // flat note, and a third page that met them only by having been written by the
  // same author on the same day is the drift this table exists to catch.
  //
  // STUDY IS THE FIXTURE, and any registered journal would do — what varies with
  // the type is two directives' arguments and three blurbs, none of which any
  // assertion here reads. `test/journal-dashboard.test.ts` covers what IS
  // per-journal.
  {
    name: `the ${STUDY_JOURNAL.name} dashboard`,
    sections: journalDashboardSections(STUDY_JOURNAL),
    compose: () => composeJournalDashboardNote(STUDY_JOURNAL),
    model: () => journalDashboardSectionModel(STUDY_JOURNAL, STUDY_JOURNAL.root),
    dest: folderNotePath(STUDY_JOURNAL.root),
    locked: "contents",
    chartsComposed: false,
  },
];

describe("both catalogues are data, which is the point", () => {
  for (const page of PAGES) {
    describe(page.name, () => {
      it("gives every section an id, a label, a blurb and an icon", () => {
        for (const s of page.sections) {
          expect(s.id, s.id).toBeTruthy();
          expect(s.label, s.id).toBeTruthy();
          expect(s.blurb, s.id).toBeTruthy();
          expect(s.icon, s.id).toBeTruthy();
        }
      });

      it("has no duplicate ids", () => {
        const ids = page.sections.map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("locates each of its own sections in the note it composes", () => {
        // The property every catalogue rests on: a section it WROTE must be a
        // section it can FIND, or the editor offers to add a second copy of
        // something already there.
        const text = page.compose();
        for (const s of page.sections.filter((x) => !x.optIn)) {
          expect(s.locate(text), s.id).toBeGreaterThanOrEqual(0);
        }
      });

      it("reports every composed section as present", () => {
        const composed = page.sections.filter((s) => !s.optIn).map((s) => s.id);
        expect(page.model().present(page.compose())).toEqual(composed);
      });

      it("composes nothing the catalogue cannot account for", () => {
        // No foreign runs in a freshly composed note. A `foreign` op on the
        // page the plugin just wrote would mean the composer and the parser
        // disagree about where a section starts.
        const ops = page.model().plan(
          page.compose(),
          page.sections.filter((s) => !s.optIn).map((s) => s.id)
        );
        expect(ops.filter((o) => o.kind === "foreign")).toEqual([]);
      });

      it("separates every fence with exactly one blank line", () => {
        // `appendSectionMarkdown` and the section walk both read these, so a
        // note that gains or loses one reads as a section boundary moving.
        expect(page.compose()).not.toContain("```\n\n\n```");
        expect(page.compose()).not.toContain("```\n```");
      });

      it("opens with the spacer and declares no frontmatter", () => {
        // The spacer stops a click at the top of the note landing inside the
        // first widget. No frontmatter, because unlike a period dashboard
        // neither page is scoped to a period — that is the whole difference
        // between these and the four notes nested under the diary.
        expect(page.compose().startsWith("`almanac:spacer`\n")).toBe(true);
        expect(page.compose().startsWith("---")).toBe(false);
      });

      it("returns null when nothing would change", () => {
        const composed = page.sections.filter((s) => !s.optIn).map((s) => s.id);
        expect(page.model().apply(page.compose(), composed)).toBeNull();
      });

      it("restores the file exactly on remove-then-re-add", () => {
        // Insertion is anchored to the sections the file has rather than to an
        // absolute position, so a reader who rearranged the page keeps their
        // arrangement.
        const ids = page.sections.filter((s) => !s.optIn).map((s) => s.id);
        const droppable = ids.find(
          (id) => id !== page.locked && id !== "charts" && id !== "banner"
        );
        expect(droppable, "a page needs one freely removable section").toBeTruthy();
        const without = page.model().apply(
          page.compose(),
          ids.filter((id) => id !== droppable)
        );
        expect(without).not.toBeNull();
        expect(page.model().apply(without as string, ids)).toBe(page.compose());
      });
    });
  }
});

describe("what each page refuses to lose", () => {
  it("locks the diary card on the diary dashboard and nothing else", () => {
    // A page about the diary with no way into the diary is worse than no page
    // at all — `home-sections` makes the same call about the same widget.
    // AND THE BANNER, AS OF 4.19 — locked on every surface, which
    // `bannerSection` argues and this records for this page.
    const locked = DIARY_DASHBOARD_SECTIONS.filter((s) => s.locked).map((s) => s.id);
    expect(locked).toEqual(["banner", "today"]);
  });

  it("locks the journals card on the journals dashboard and nothing else", () => {
    const locked = JOURNALS_DASHBOARD_SECTIONS.filter((s) => s.locked).map((s) => s.id);
    expect(locked).toEqual(["banner", "journals"]);
  });

  it("says why, in a sentence about the reader's page", () => {
    for (const page of PAGES) {
      const why = page.model().refusal(page.locked, page.compose());
      expect(why, page.name).toContain(page.name);
      expect(why, page.name).toContain("can't be removed");
    }
  });

  it("keeps a locked section movable, because the lock is on existence", () => {
    // 2.60.2's distinction, and it holds without qualification on a flat note:
    // one band, so nothing can be stranded by arithmetic.
    for (const page of PAGES) {
      const view = page.model().sections().find((v) => v.id === page.locked);
      expect(view?.removable, page.name).toBe(false);
      expect(view?.movable, page.name).toBe(true);
    }
  });

  it("fixes the banner in place on both, and no longer lets it go", () => {
    // 4.11 asked the two flags separately because the head was the one section
    // on either page that was immovable AND removable — a single assertion could
    // have passed while the model collapsed the two rules into one, which is
    // exactly the collapse `diaryRemovalRefusal` had made since 4.10.
    //
    // 4.19 REMOVED THAT COMBINATION FROM EVERY SURFACE, so the flags now agree.
    // They are still asked separately: the collapse this guards against would be
    // just as invisible now, and the day a removable-but-fixed section returns
    // this is the test that has to still be looking.
    for (const page of PAGES) {
      const view = page.model().sections().find((v) => v.id === "banner");
      expect(view?.movable, page.name).toBe(false);
      expect(view?.removable, page.name).toBe(false);
      expect(page.model().refusal("banner", page.compose()), page.name).not.toBeNull();
    }
  });

  it("keeps the head at the top even when every other section is reversed", () => {
    // The write side rather than the editor's. `bandOf` already declines to offer
    // the drag, so what is checked here is a `want` that arrives from anywhere
    // else — and the promise is not merely that the head is reported as staying
    // but that the note still OPENS with it.
    for (const page of PAGES) {
      const ids = page.sections.filter((s) => !s.optIn).map((s) => s.id);
      const reversed = [...ids].reverse();
      const ops = page.model().plan(page.compose(), reversed);
      expect(
        ops.filter((o) => o.kind === "move").map((o) => o.sectionId),
        page.name
      ).not.toContain("title");
      const out = page.model().apply(page.compose(), reversed) ?? page.compose();
      const firstFence = out.split("```").find((c) => c.startsWith("almanac\n"));
      expect(firstFence, page.name).toContain("title:");
    }
  });

  it("lets charts go when there are none, and refuses when there are", () => {
    // The one section on each page where "not locked" and "freely removable"
    // are different answers. A reader who wants no charts should be able to say
    // so; a reader with nine configured must not lose them to an untick.
    for (const page of PAGES.filter((p) => p.chartsComposed)) {
      expect(page.model().refusal("charts", page.compose()), page.name).toBeNull();
      // OFF THE CONSTANT, NOT A LITERAL — see home-sections.test.ts for what
      // this cost when the heading was renamed in 4.26.
      const bar = `${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`;
      const withCharts = page.compose().replace(bar, `${bar}\nchart:mood`);
      const why = page.model().refusal("charts", withCharts);
      expect(why, page.name).toContain("1 chart");
    }
  });
});

describe("where the pages live, and who agrees about it", () => {
  it("puts each dashboard at its folder's own folder note", () => {
    expect(DIARY_HOME).toBe("02 - Diary/02 - Diary.md");
    expect(JOURNALS_HOME).toBe("03 - Journals/03 - Journals.md");
  });

  it("scaffolds exactly those two paths", () => {
    // THE ROW THAT MATTERS. If `shippedNotes` writes one path and
    // `surfaceOfNote` recognises another, repair composes a page the section
    // editor will not open — which is the failure 3.11 §1 fixed for the
    // homepage, and the one worth pinning before it can recur twice.
    //
    // `[]` FOR THE JOURNALS, throughout this block. These four cases are about
    // the TWO FIXED folder notes and nothing else; the per-journal dashboards
    // 4.36 adds are a separate population with their own file, and mixing them
    // in here would make an assertion about "those two paths" depend on how many
    // journals the fixture happens to carry.
    const dests = shippedNotes(DEFAULT_PATHS, [], []).map((n) => n.dest);
    expect(dests).toContain(DIARY_HOME);
    expect(dests).toContain(JOURNALS_HOME);
  });

  it("scaffolds them as composed notes rather than assets or templates", () => {
    // Composed, so repair can converge them; not `template: true`, so they are
    // not excluded from `reconcileLayouts`. Both halves matter — a template
    // flag here would buy permanent drift the moment a directive is renamed.
    for (const dest of [DIARY_HOME, JOURNALS_HOME]) {
      const note = shippedNotes(DEFAULT_PATHS, [], []).find((n) => n.dest === dest);
      expect(note?.content, dest).toBeTruthy();
      expect(note?.asset, dest).toBeUndefined();
      expect(note?.template, dest).toBeFalsy();
    }
  });

  it("writes each catalogue into its own page", () => {
    const byDest = new Map(
      shippedNotes(DEFAULT_PATHS, [], []).map((n) => [n.dest, n.content])
    );
    expect(byDest.get(DIARY_HOME)).toBe(composeDiaryDashboardNote());
    expect(byDest.get(JOURNALS_HOME)).toBe(composeJournalsDashboardNote());
  });

  it("adds no settings key for either path", () => {
    // §2.5 and §11: the paths are DERIVED from the two roots, so a folder note
    // moves with its folder and there is nothing to add to `PATH_LABELS`,
    // `ROOT_CHILDREN`, `remapConfiguredPaths` or the registry mirror. A key
    // here would exist to point "the diary dashboard" at a note outside the
    // diary folder, which is what the folder-note convention prevents.
    expect(Object.keys(DEFAULT_PATHS)).not.toContain("diaryDashboard");
    expect(Object.keys(DEFAULT_PATHS)).not.toContain("journalsDashboard");
  });

  it("converges to itself, so repair leaves a freshly composed page alone", () => {
    // `reconcileLayouts` runs `planLayout` over every composed note with a
    // markdown destination, and these two have no `asset` to be skipped by. A
    // page that did not converge to itself would be rewritten on every repair.
    for (const page of PAGES) {
      const lines = page.compose().split("\n");
      expect(planLayout(lines, lines), page.name).toEqual([]);
    }
  });

  it("composes no directive that repair would then delete", () => {
    // `planLayout` deletes a keyword the note has and the shipped layout does
    // not ONLY when `RETIRED_WIDGETS` names it. Composing a retired directive
    // would produce a page that repair strips the moment it is created — which
    // is silent, and would look like the widget being broken.
    for (const page of PAGES) {
      for (const s of page.sections) {
        for (const line of s.render().lines) {
          const keyword = line.split("|")[0].split(":")[0].trim();
          expect(
            Object.keys(RETIRED_WIDGETS),
            `${page.name}: ${s.id} writes ${keyword}`
          ).not.toContain(keyword);
        }
      }
    }
  });

  it("is not claimed by the journal resolver it sits above", () => {
    // ORDERING, ASSERTED RATHER THAN ASSUMED. `surfaceOfNote` asks the journal
    // question first, and the journals dashboard sits at the journals ROOT with
    // every journal's own root one level below it. If a journal type claimed
    // this path, the editor would open a journal's section list on a page
    // composed from a different catalogue.
    //
    // Study's root is `${journalsRoot}/Study` as of 2.45 — it WAS the journals
    // root before that, which is exactly why this is worth pinning rather than
    // reasoning about from the current constant.
    const refs: JournalHostRef[] = [
      {
        type: STUDY_JOURNAL,
        root: STUDY_JOURNAL.root,
        templatesFolder: STUDY_JOURNAL.templatesFolder,
      },
    ];
    expect(STUDY_JOURNAL.root.startsWith(`${DEFAULT_PATHS.journalsRoot}/`)).toBe(
      true
    );
    expect(resolveSectionHost(refs, JOURNALS_HOME, undefined)).toBeNull();
    expect(resolveSectionHost(refs, DIARY_HOME, undefined)).toBeNull();
  });

  it("follows a renamed root without remapping anything", () => {
    // The property the derived path buys, stated as behaviour: change the root
    // and the dashboard is somewhere else, with no settings write in between.
    const moved = { ...DEFAULT_PATHS, journalsRoot: "09 - Notebooks" };
    expect(folderNotePath(moved.journalsRoot)).toBe(
      "09 - Notebooks/09 - Notebooks.md"
    );
    expect(shippedNotes(moved, [], []).map((n) => n.dest)).toContain(
      "09 - Notebooks/09 - Notebooks.md"
    );
  });
});

describe("the editor opens on both, as the right page", () => {
  // ITS OWN CATALOGUE FIRST, THEN THE WIDGETS (4.12 §C). Every flat model now
  // answers with the catalogue it was built from plus every page widget that
  // catalogue has no opinion about — so what these two cases are really pinning
  // is that the diary dashboard is handed the DIARY catalogue and not the
  // journals one, which is the drift `modelForSurface` exists to prevent. The
  // prefix is what tells the two halves apart, and the widget half gets its own
  // cases below.
  const own = (ids: readonly string[]): string[] =>
    ids.filter((id) => !isPageWidgetId(id));

  it("hands the diary dashboard its own catalogue", () => {
    const { model, noun } = modelForSurface({ kind: "diary-dashboard" });
    expect(noun).toBe("diary dashboard");
    expect(own(model.sections().map((s) => s.id))).toEqual(
      DIARY_DASHBOARD_SECTIONS.map((s) => s.id)
    );
  });

  it("hands the journals dashboard its own catalogue", () => {
    const { model, noun } = modelForSurface({ kind: "journals-dashboard" });
    expect(noun).toBe("journals dashboard");
    expect(own(model.sections().map((s) => s.id))).toEqual(
      JOURNALS_DASHBOARD_SECTIONS.map((s) => s.id)
    );
  });

  it("offers each page the widgets it does not already write", () => {
    const diary = modelForSurface({ kind: "diary-dashboard" })
      .model.addable(composeDiaryDashboardNote())
      .map((s) => s.id);
    // THE DE-DUP, CHECKED AS BEHAVIOUR RATHER THAN AS A LIST. This dashboard
    // writes `tasks-table`, `on-this-day` and `tag-index`, so none of the three
    // is offered a second time — and it does not write `events`, which is the
    // whole reason to want a widget door.
    // ASKED ON THE KEYWORD, NOT THE ID (4.56). Every widget is offered as an
    // instance now, so `not.toContain("w:tasks-table")` would pass against a
    // list holding `w:tasks-table#1` — an assertion that had stopped being able
    // to fail.
    expect(diary).not.toContain("w:tasks-table#1");
    expect(diary).not.toContain("w:on-this-day#1");
    expect(diary).not.toContain("w:tag-index#1");
    expect(diary.filter((id) => id.startsWith("w:tasks-table"))).toEqual([]);
    expect(diary).toContain("w:events#1");

    const journals = modelForSurface({ kind: "journals-dashboard" })
      .model.addable(composeJournalsDashboardNote())
      .map((s) => s.id);
    expect(journals).not.toContain("w:journals#1");
    expect(journals).not.toContain("w:review-queue#1");
    expect(journals).not.toContain("w:tasks-table#1");
    // `w:topics-table` WAS THE POSITIVE HERE UNTIL 4.16 §3. That word is now an
    // alias for `level-index` and is withheld from the add list for the reason
    // `alias` states — offering both would be a choice between two names for one
    // thing. The widget door is still open; it opens on the word that replaced
    // it, which is what this half of the assertion is really about.
    expect(journals).not.toContain("w:topics-table#1");
    // `#1`, NOT THE BARE ID: every widget repeats, so what the add list offers
    // is an instance — the first free one — and never the un-numbered form,
    // which nothing generates. See `widgetInstances`.
    expect(journals).toContain("w:level-index#1");
  });

  it("names each page as a reader would, so a refusal reads as a sentence", () => {
    // The noun is not decoration: every message the two commands write names
    // the thing being edited, and a surface with no noun sends the picker out
    // saying "this note", which is what the reader is looking at rather than
    // what they need told.
    for (const kind of ["diary-dashboard", "journals-dashboard"] as const) {
      expect(modelForSurface({ kind }).noun).not.toContain("note");
    }
  });

  it("resolves an empty folder answer to the page's own folder", () => {
    // A folder question on a folder note resolves to the folder itself, which
    // is the scope the composed directive already has. Passing the root through
    // is what makes "leave it as it is" mean the same thing in the window as it
    // means in the note.
    const q = diaryDashboardSectionModel(DEFAULT_PATHS.diaryRoot)
      .sections()
      .find((s) => s.id === "open-tasks")?.questions?.[0];
    expect(q?.kind).toBe("folder");
    expect(q?.hostFolder).toBe(DEFAULT_PATHS.diaryRoot);
  });
});

describe("what each directive scopes to, and how it says so", () => {
  const diary = composeDiaryDashboardNote();
  const journals = composeJournalsDashboardNote();

  it("writes no folder path into either page", () => {
    // §2.1 PROPOSED `tasks-table:<diaryRoot>` AND `tag-index:<diaryRoot>` AND
    // THE BUILD DISAGREED. Both directives already default to the host note's
    // own folder, and a folder note's own folder IS the root in question — so
    // the bare form composes to exactly the intended scope.
    //
    // The reason to prefer it is the cost `home-sections` states against
    // itself: "a path written into a directive is a path that does not follow a
    // later rename the way a settings read would." Rename `02 - Diary` and
    // these pages follow their folders with nothing to remap. Pinned as a test
    // because the obvious edit — spelling the scope out "for clarity" — is
    // exactly the regression.
    expect(diary).not.toContain(DEFAULT_PATHS.diaryRoot);
    expect(journals).not.toContain(DEFAULT_PATHS.journalsRoot);
  });

  it("still scopes tasks to the page's own folder on both pages", () => {
    // The other half of the assertion above: bare, not absent.
    expect(diary).toContain("\ntasks-table\n");
    expect(journals).toContain("\ntasks-table\n");
  });

  it("holds the space for on this day, where the homepage let it vanish", () => {
    // §2.1's TABLE SAYS `on-this-day`; ITS ARGUMENT SAYS THE SECTION BELONGS
    // HERE BECAUSE THIS IS WHERE IT STOPS BEING A SURPRISE. Those disagree and
    // the argument wins. Bare, the widget renders nothing until the reader has
    // a year of entries — the "invisible in year one, then appears unannounced"
    // failure 3.13 §11 took it off the homepage FOR. `:always` makes an empty
    // band an ANSWER, which is `search-sections`' reasoning for the same call.
    expect(diary).toContain("on-this-day:always");
    expect(diary).not.toContain("\non-this-day\n");
  });

  it("reviews every journal rather than one folder", () => {
    // §2.2's TABLE SAYS `review-queue`; ITS ARGUMENT SAYS "recall across every
    // journal ... nowhere to see the whole vault's queue at once". Bare would
    // resolve to the host folder and silently miss a custom journal rooted
    // outside the journals root, which `customJournals` permits.
    expect(journals).toContain("review-queue:all");
  });

  it("keeps the queue's keyword out of the task table", () => {
    // `buildTasksTableRegion` takes `folders[0]`, so a keyword naming several
    // roots resolves to the FIRST rather than to all of them. Offering "Every
    // journal" there would put a control on the page promising a scope the
    // widget silently truncates — which is why `journal-sections.ts` offers
    // `SCOPE_JOURNAL` for that directive and never `SCOPE_ALL`.
    const q = journalsDashboardSectionModel(DEFAULT_PATHS.journalsRoot)
      .sections()
      .find((s) => s.id === "open-tasks")?.questions?.[0];
    expect(q?.keywords ?? []).toEqual([]);
    const review = journalsDashboardSectionModel(DEFAULT_PATHS.journalsRoot)
      .sections()
      .find((s) => s.id === "review")
      ?.questions?.find((q) => q.kind === "folder");
    expect(review?.keywords?.map((k) => k.value)).toEqual(["all"]);
  });
});

describe("no card sits under a header bar", () => {
  // 4.1 §3.1's doubling, avoided by composition rather than by code. A
  // `header:` and a composite widget in ONE fence give that fence's container
  // both a section bar and a card modifier class, so the page draws two
  // borders, two paddings and two backgrounds arguing.
  //
  // Part III's `frame:` modifier is the general fix and is not built. Until it
  // is, a card-drawing directive stands in a bare fence of its own — which is
  // what `diary:3` already does on the homepage and what the period summaries
  // already do in a dashboard masthead.
  //
  // THE LIST IS THE DISPATCHER'S. `entry-header` takes `journal-entry-banner`,
  // `OVERVIEW_KINDS` take `journal-overview-card`, and `journals` draws its own
  // card. If a directive joins them, this test is where the new pairing has to
  // be argued.
  // `title` JOINED THE LIST IN 4.10, which is this comment's own instruction
  // followed: the page head draws `.jtc-card`, so a `header:` bar over it would
  // be the two-borders-arguing pairing described above — and, worse than
  // elsewhere, a title bar over the page's own title.
  // `title` JOINS THE LIST IN 4.19, and it always belonged: the page-title
  // widget draws its own card, and 4.19 is simply the release where the section
  // holding it renders on a page this test walks. A header bar over it would be
  // a title bar over the page's own title, which is the pairing this whole
  // describe block exists to refuse.
  // `journals-header` JOINS THE LIST IN 4.36, and it has always belonged —
  // 60-heroes-and-banners.css says so at `.jjs-hero .jjh-root`, which cancels
  // the band's shell inside the journals card and states the rule in the same
  // breath: *"The `journals-header` directive still renders the bordered card
  // version wherever it's used on its own."* A `header:` bar over a bordered box
  // is 4.1 §3.1's doubling exactly, and the journal dashboard is the first
  // catalogue to compose the band standalone — so this is the release where the
  // pairing became reachable rather than the release where it became wrong.
  const CARD_DRAWING = ["diary", "month-summary", "journals", "week-summary",
    "quarter-summary", "year-summary", "entry-header", "journal-header",
    "banner", "title", "journals-header"];

  const keywordOf = (line: string): string =>
    line.split("|")[0].split(":")[0].trim();

  for (const page of PAGES) {
    it(`keeps ${page.name}'s cards out of titled fences`, () => {
      for (const s of page.sections) {
        const { lines } = s.render();
        const keywords = lines.map(keywordOf);
        const card = keywords.find((k) => CARD_DRAWING.includes(k));
        if (!card) continue;
        expect(keywords, `${s.id} pairs ${card} with a header bar`).not.toContain(
          "header"
        );
      }
    });
  }

  it("titles every non-card widget, so none is loose content", () => {
    // The other half: a widget with no bar is untitled content in the note's
    // flow, inconsistent with every section around it.
    //
    // TWO WAYS TO BE TITLED, NOT ONE. This asserted `header:` alone, and its own
    // comment said why — *"that is the case `frame: section` exists for, and
    // until it lands a `header:` is how a section titles itself"*. It has
    // landed. The two are alternatives rather than a preference: `header:` puts
    // a bar above a widget that has no chrome of its own, `frame: section` takes
    // the chrome away from one that does, and the grammar REFUSES a fence
    // carrying both (see the frame block in `ui/widgets/index.ts`) precisely
    // because they are two answers to one question.
    //
    // So the property is that a section is titled, and asserting the mechanism
    // instead is the trap `RESUME.md` §2.2 names as 4.18's own lesson.
    //
    // COMPOSED SECTIONS ONLY, WHICH IS WHAT "LOOSE CONTENT" MEANS. An `optIn`
    // section is not on the page, and the two ways of titling one that is are
    // not the only two that exist: a fence holding exactly one keyword
    // `SECTION_TITLES` can name gets a head with no modifier at all
    // (`journal-totals`), and `journal-tally` titles itself at render time from
    // the tracker it names — which is why it is deliberately absent from that
    // table. Widening the rule to cover sections that are not composed would
    // mean restating both of those here, and a second copy of `SECTION_TITLES`
    // in a test is the drift `blockTitle` exists to prevent.
    //
    // Nothing changes for the two folder-note dashboards: neither has an `optIn`
    // section, so this walks exactly what it walked before.
    for (const page of PAGES) {
      for (const s of page.sections.filter((x) => !x.optIn)) {
        const { fence, lines } = s.render();
        // The chart fence carries its header INSIDE itself — the charts
        // processor reads it and makes the whole section self-titled.
        if (fence !== "almanac") continue;
        const keywords = lines.map(keywordOf);
        if (keywords.some((k) => CARD_DRAWING.includes(k))) continue;
        const titled =
          keywords.includes("header") || lines.some((l) => /^frame:/.test(l));
        expect(titled, `${page.name}: ${s.id} is untitled`).toBe(true);
      }
    }
  });
});

describe("the homepage becomes a place to start", () => {
  const home = composeHomeNote(DEFAULT_PATHS.diaryRoot);

  it("stays a short page, and every block on it is one you navigate from", () => {
    // §0's measure, which was "three blocks" and is now four: the title card
    // 4.5 added names the page, and 4.4's row folded what used to be separate
    // blocks into one. The COUNT was always a proxy — what §0 wanted is a
    // homepage that is not the page containing everything — so it is asserted
    // as a bound plus the identity of what is there, which is what would
    // actually be violated by the page growing back.
    const fences = segment(home.split("\n")).filter((f) => f.kind === "fence");
    expect(fences.length).toBeLessThanOrEqual(4);
    const composed = homeSections(DEFAULT_PATHS.diaryRoot)
      .filter((x) => !x.optIn)
      .map((x) => x.id);
    expect(composed).toEqual([
      "banner",
      "diary",
      "launcher",
      "tasks",
      "on-this-day",
      "journals",
      "charts",
    ]);
  });

  it("moves the tag cloud to the page that is about the diary", () => {
    // Not deleted from the homepage's catalogue — `optIn`, which is 3.13 §11's
    // mechanism reused. An existing homepage keeps its block AND keeps a
    // catalogue that recognises it, so the editor can still move or remove it.
    const tags = homeSections(DEFAULT_PATHS.diaryRoot).find((s) => s.id === "tags");
    expect(tags?.optIn).toBe(true);
    expect(home).not.toContain("tag-index");
    expect(composeDiaryDashboardNote()).toContain("tag-index");
  });

  it("shows on this day on both pages, in the shape each one has room for", () => {
    // 3.13 §11 took this off the homepage for being about the past, and the
    // diary dashboard took it up because a page about the diary is allowed to
    // be about the past. 4.2 §2 put it back on the homepage — not by reversing
    // that argument but by changing what "on the page" costs: it is a cell of
    // the top row there, and a block of its own here.
    //
    // The two are still different answers to different questions, which is what
    // this row has always asserted; what changed is that the homepage's answer
    // is now a position rather than an absence.
    const otd = homeSections(DEFAULT_PATHS.diaryRoot).find(
      (s) => s.id === "on-this-day"
    );
    expect(otd?.optIn).toBeFalsy();
    expect(otd?.row, "on the homepage it is a cell, not a block").toBeTruthy();
    const here = DIARY_DASHBOARD_SECTIONS.find((s) => s.id === "on-this-day");
    expect(here?.optIn).toBeFalsy();
  });

  it("does not duplicate the journals card's lock", () => {
    // The same widget, locked on one page and not the other, and the
    // difference is the argument: a vault can reasonably have no journals, so a
    // HOMEPAGE without the section is coherent — but the journals dashboard IS
    // that section.
    const onHome = homeSections(DEFAULT_PATHS.diaryRoot).find(
      (s) => s.id === "journals"
    );
    expect(onHome?.locked).toBe(false);
    const onPage = JOURNALS_DASHBOARD_SECTIONS.find((s) => s.id === "journals");
    expect(onPage?.locked).toBe(true);
  });
});

describe("the study header's root crumb", () => {
  it("points at the journals dashboard rather than the homepage", () => {
    // §2.5. `journalCrumbs` states its own rule — "a trail names a note's
    // ancestors, never the note itself" — and it seeded that trail with
    // `Homepage.md`, which is an ancestor of nothing. The journals root's
    // folder note IS the ancestor the rule asks for.
    expect(
      rootCrumbPath(DEFAULT_PATHS.journalsRoot, "03 - Journals/Study/Maths/Maths.md")
    ).toBe(JOURNALS_HOME);
    expect(rootCrumbPath(DEFAULT_PATHS.journalsRoot, "anything.md")).not.toBe(
      DEFAULT_PATHS.home
    );
  });

  it("drops itself when the dashboard is the open note", () => {
    // The `isIndex` rule, reaching one crumb further than it used to: a trail
    // ending in the name of the page you are on is a step to nowhere.
    expect(rootCrumbPath(DEFAULT_PATHS.journalsRoot, JOURNALS_HOME)).toBeNull();
  });

  it("follows a renamed journals root", () => {
    expect(rootCrumbPath("09 - Notebooks", "09 - Notebooks/Study/A.md")).toBe(
      "09 - Notebooks/09 - Notebooks.md"
    );
  });

  it("changes its label with its destination", () => {
    // "Home" appeared in exactly two places in the tree, and leaving the word
    // on a crumb that goes somewhere else would give one name two
    // destinations — the pattern `RETIRED_WORDS` exists to delete.
    expect(ROOT_CRUMB_LABEL).toBe("Journals");
  });
});

// ── every block on either page is a section (4.1.2) ──────────────────────
//
// The property the two pages were BUILT for and did not have until now: a
// dashboard is a column of foldable titled sections, and a block that is none
// of those things reads as the page failing to render rather than as a choice.
// §3.1 states both halves — a `header:` above a card-drawing widget doubles the
// chrome, and a bare fence "becomes loose content in the note's flow,
// inconsistent with every section around it" — and the first cut of 4.1 took
// the second failure to avoid the first on three blocks. Two were reported and
// fixed in 4.1.0; the third was on the page nobody had opened.
describe("no block on either dashboard is loose content", () => {
  const pages: [string, string][] = [
    ["diary", composeDiaryDashboardNote()],
    ["journals", composeJournalsDashboardNote()],
  ];

  const fences = (note: string): string[][] => {
    const out: string[][] = [];
    let open: string[] | null = null;
    for (const line of note.split("\n")) {
      if (line.startsWith("```")) {
        if (open) out.push(open);
        open = line.length > 3 ? [] : null;
        continue;
      }
      open?.push(line);
    }
    return out;
  };

  it("titles every fence, by a header bar or by frame: section", () => {
    // ONE OR THE OTHER, NEVER NEITHER AND NEVER BOTH. "Never both" is already
    // asserted (the grammar refuses it); "never neither" is the half that was
    // missing, and it is the half a reader sees.
    for (const [name, note] of pages) {
      for (const fence of fences(note)) {
        // THE HEAD IS THE TITLE, so it is the one fence that cannot take one
        // (4.10). A `header:` bar over the page's own name is the doubling this
        // rule exists to catch, arriving from the other direction — and
        // `frame: section` would put the page's name inside a collapsible
        // section of the page. It is not loose content either, which is what
        // the rule is really about: it is the thing that says what the page is.
        if (fence.some((l) => l.startsWith("title"))) continue;
        const titled =
          fence.some((l) => l.startsWith("header:")) ||
          fence.some((l) => l.replace(/\s/g, "") === "frame:section");
        expect(titled, `${name}: untitled fence — ${fence.join(" / ")}`).toBe(
          true
        );
      }
    }
  });

  it("frames the journals card, which shipped bare in 4.1.0 and 4.1.1", () => {
    // The specific regression. `SECTION_TITLES` has carried `journals` since
    // the modifier was built, so this was one line the whole time — what was
    // missing was looking at the page, which is §2.3's entire argument.
    expect(composeJournalsDashboardNote()).toContain(
      "frame: section\njournals"
    );
  });

  it("puts the modifier on the card widgets and nowhere else", () => {
    // The inverse, so "frame everything" is not how the test above passes.
    // `tasks-table`, `review-queue`, `tag-index` and `on-this-day` draw no card
    // of their own, so a `header:` above them doubles nothing and is the
    // cheaper, older mechanism — §3.3's "a composed dashboard keeps `header:`
    // above the fence".
    for (const [name, note] of pages) {
      for (const fence of fences(note)) {
        if (!fence.some((l) => l.replace(/\s/g, "") === "frame:section")) continue;
        const kinds = fence
          .filter((l) => !l.startsWith("frame:"))
          .map((l) => l.split("|")[0].split(":")[0].trim());
        for (const kind of kinds) {
          expect(
            ["diary", "month-summary", "journals"],
            `${name}: ${kind} takes frame: section but draws no card`
          ).toContain(kind);
        }
      }
    }
  });

  it("allows Today and This month in widget mode to be grouped on diary dashboard", () => {
    const model = diaryDashboardSectionModel();
    const shipped = composeDiaryDashboardNote();

    // In section mode (frame: section), Today cannot be grouped
    const blocksSection = model.blocks!(shipped);
    const todayBlock = blocksSection.find((b) => b.ids.includes("today"));
    expect(todayBlock?.column).toEqual([]);

    // In widget mode (no frame: section), Today and This month can be grouped
    const widgetMode = shipped
      .replace("frame: section\n", "")
      .replace("frame: section\n", "");
    const blocksWidget = model.blocks!(widgetMode);
    const todayWidgetBlock = blocksWidget.find((b) => b.ids.includes("today"));
    expect(todayWidgetBlock?.column).toEqual(["today"]);
    const monthWidgetBlock = blocksWidget.find((b) => b.ids.includes("this-month"));
    expect(monthWidgetBlock?.column).toEqual(["this-month"]);

    // Regrouping Today with This month in widget mode succeeds
    const regrouped = model.regroup!(widgetMode, [["today", "this-month"]]);
    expect(regrouped).not.toBeNull();
    expect(regrouped).toContain("row\ndiary:3\ncell\nmonth-summary");
  });

  it("allows on-this-day, journals, activity, and contents to switch to widget form", () => {
    const diaryModel = diaryDashboardSectionModel();
    const diaryBase = composeDiaryDashboardNote();
    expect(diaryBase).toContain("header:🕘 On this day\non-this-day:always");

    const onThisDayWidget = diaryModel.apply(
      diaryBase,
      diaryModel.present(diaryBase).map((id) =>
        id === "on-this-day" ? { id, options: { form: "widget" } } : id
      )
    );
    expect(onThisDayWidget).not.toContain("header:🕘 On this day");
    expect(onThisDayWidget).toContain("on-this-day:always");

    const journalsModel = journalsDashboardSectionModel();
    const journalsBase = composeJournalsDashboardNote();
    expect(journalsBase).toContain("frame: section\njournals");

    const journalsWidget = journalsModel.apply(
      journalsBase,
      journalsModel.present(journalsBase).map((id) =>
        id === "journals" ? { id, options: { form: "widget" } } : id
      )
    );
    expect(journalsWidget).not.toContain("frame: section\njournals");
    expect(journalsWidget).toContain("journals\n");

    const studyModel = journalDashboardSectionModel(STUDY_JOURNAL);
    const studyBase = composeJournalDashboardNote(STUDY_JOURNAL);
    expect(studyBase).toContain("frame: section\njournals-header:study");
    expect(studyBase).toContain("frame: section\nlevel-cards:study");

    const studyWidget = studyModel.apply(
      studyBase,
      studyModel.present(studyBase).map((id) =>
        id === "activity" || id === "contents" ? { id, options: { form: "widget" } } : id
      )
    );
    expect(studyWidget).not.toContain("frame: section\njournals-header:study");
    expect(studyWidget).toContain("journals-header:study");
    expect(studyWidget).not.toContain("frame: section\nlevel-cards:study");
    expect(studyWidget).toContain("level-cards:study");
  });
});
