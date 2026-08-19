// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A widget is a section — 4.12 §C.
//
// WHAT THIS SUITE IS REALLY CHECKING. Almost nothing here is new behaviour: the
// point of generating a `FlatSection` per widget rather than inventing a second
// kind of row is that `present`, `addable`, `plan`, `apply`, `blocks`, `regroup`
// and `withAnswers` all go on working with no change. So these cases assert that
// the OLD machinery answers correctly about the NEW sections — that a widget
// reorders, groups, removes and re-points its argument like anything else — plus
// the two places where generating them needs care of its own: the de-dup probe,
// and a `locate` that must match a directive rather than a substring.

import { describe, expect, it } from "vitest";
import {
  WIDGET_ID_PREFIX,
  isPageWidgetId,
  locateKeyword,
  pageWidgetSections,
  countKeyword,
  instanceId,
  instanceIdOf,
  instanceSectionFor,
  locateNth,
  nextInstanceId,
  repeatableInstances,
} from "../src/core/widget-sections";
import { WIDGETS, NOT_PAGE_WIDGETS } from "../src/core/widget-registry";
import { readCode } from "./sources";
import { flatBlocks, flatNoteModel } from "../src/core/note-sections";
import type { FlatSection } from "../src/core/note-sections";
import {
  composeHomeNote,
  homeSectionModel,
  homeSections,
} from "../src/diary/home-sections";
import { composeSearchNote, searchSectionModel } from "../src/diary/search-sections";
import { DEFAULT_PATHS } from "../src/core/constants";

const ROOT = DEFAULT_PATHS.diaryRoot;
const home = (): string => composeHomeNote(ROOT);
const model = homeSectionModel(ROOT);

// The homepage's catalogue and the same catalogue with the widget tail on it —
// the second is what `flatNoteModel` builds itself from, and the cases that need
// `flatBlocks` or a second model have to be handed the same list or they are
// asking about a different page.
const CATALOGUE = homeSections(ROOT);
const WITH_WIDGETS = [...CATALOGUE, ...pageWidgetSections(CATALOGUE)];
const composedIds = CATALOGUE.filter((s) => !s.optIn).map((s) => s.id);

describe("what the generator makes", () => {
  const tail = pageWidgetSections([]);

  it("makes one section per page widget and nothing else", () => {
    // EXCEPT THE ONES A PAGE MAY REPEAT (4.15 §4), which are supplied per
    // occurrence by `repeatableInstances` and must NOT also be supplied once
    // here. Generating both puts `w:journal-card` and `w:journal-card#1` over
    // the same first fence, and `parseFlatSections` resolves a contested run by
    // giving it to whichever id it reaches first and reporting the other as
    // nobody's — the one-anchor rule broken by the thing written to keep it.
    const once = Object.values(WIDGETS).filter((w) => !w.repeats);
    expect(tail).toHaveLength(once.length);
    expect(once.length).toBeLessThan(Object.keys(WIDGETS).length);
    expect(tail.every((s) => isPageWidgetId(s.id))).toBe(true);
    expect(new Set(tail.map((s) => s.id)).size).toBe(tail.length);
    for (const excluded of Object.keys(NOT_PAGE_WIDGETS)) {
      expect(tail.map((s) => s.id), excluded).not.toContain(
        `${WIDGET_ID_PREFIX}${excluded}`
      );
    }
  });

  it("gives each one a label, a blurb and a glyph from the registry", () => {
    for (const s of tail) {
      const spec = WIDGETS[s.id.slice(WIDGET_ID_PREFIX.length)];
      expect(s.label).toBe(spec.label);
      expect(s.blurb).toBe(spec.blurb);
      expect(s.icon).toBe(spec.glyph);
      expect(s.locked).toBe(false);
      expect(s.pinned).toBeUndefined();
    }
  });

  it("keeps every one of them out of anything a composer writes", () => {
    // `optIn` IS THE MECHANISM AND THE SEAM IS THE BELT. Every generated section
    // declares it, and `composeFlatNote` is never handed the tail in the first
    // place — `flatNoteModel` widens the spec and the composers take the bare
    // exported array. Two independent reasons the composed note cannot change,
    // and this asserts the outcome rather than either of them.
    expect(tail.every((s) => s.optIn === true)).toBe(true);
    expect(home()).toBe(composeHomeNote(ROOT));
    for (const line of home().split("\n")) {
      expect(isPageWidgetId(line)).toBe(false);
    }
  });

  it("renders exactly one line, which is what makes it a column", () => {
    // `hasKnownExtent` IS "RENDERS ONE LINE", so this is the property that gives
    // a widget section everything the rejected design wrote off: it can be cut
    // out of a shared fence, it is `loose`, and it is a legal column of a group.
    for (const s of tail) {
      expect(s.render().lines, s.id).toHaveLength(1);
      expect(s.render().fence, s.id).toBe("almanac");
    }
  });

  it("ignores an answer for a widget that declares no argument", () => {
    // `render` AND `questions` CANNOT DISAGREE. A count is not a question this
    // window has a control for, so `timeline` declares no `arg` — and a
    // hand-built `want` carrying one must not compose `timeline:6` behind a row
    // that shows nothing to change it.
    const timeline = tail.find((s) => s.id === "w:timeline") as FlatSection;
    expect(timeline.questions).toBeUndefined();
    expect(timeline.render({ arg: "6" }).lines).toEqual(["timeline"]);
  });

  it("writes the answer into the directive, and nothing when there is none", () => {
    const tasks = tail.find((s) => s.id === "w:tasks-table") as FlatSection;
    expect(tasks.render().lines).toEqual(["tasks-table"]);
    expect(tasks.render({ arg: "02 - Diary" }).lines).toEqual([
      "tasks-table:02 - Diary",
    ]);
    // A blank answer is the folder question's DEFAULT — the host note's own
    // folder — and composes the bare directive rather than a trailing colon.
    expect(tasks.render({ arg: "   " }).lines).toEqual(["tasks-table"]);
  });

  it("asks one question, only where the registry says there is one", () => {
    const spec = { hostFolder: "02 - Diary" };
    for (const s of tail) {
      const arg = WIDGETS[s.id.slice(WIDGET_ID_PREFIX.length)].arg;
      const qs = s.questions?.(spec as never) ?? [];
      expect(qs, s.id).toHaveLength(arg ? 1 : 0);
      if (!arg) continue;
      // NAMES ITS OWN DIRECTIVE, which is what lets `withAnswers` splice the
      // answer in and `answerIn` read it back out of the reader's line.
      expect(qs[0].directive, s.id).toBe(s.id.slice(WIDGET_ID_PREFIX.length));
      // A `vault` ARGUMENT BECOMES A `choice`, AND THAT IS THE DESIGN (4.15 §4).
      // The registry names WHICH of this vault's lists the answers come from;
      // the caller that holds the vault resolves it; and what arrives here is an
      // ordinary choice question that nothing downstream can tell from a fixed
      // one. `questionIsRequired` reads the kind, the "needs …" pill is drawn
      // from the same field, and `withAnswers` splices into the same directive —
      // none of which had to learn a third kind.
      expect(qs[0].kind, s.id).toBe(arg.kind === "vault" ? "choice" : arg.kind);
    }
  });

  it("offers a vault question the vault's own answers, and says so when there are none", () => {
    const card = repeatableInstances([], "")[0];
    expect(card.id).toBe("w:journal-card#1");
    const q = card.questions?.({
      vault: { journals: [{ value: "study", label: "Study" }] },
    } as never)[0];
    expect(q?.kind === "choice" && q.values).toEqual([
      { value: "study", label: "Study" },
    ]);
    // NOTHING TO CHOOSE FROM IS A SENTENCE, NOT AN EMPTY MENU — the rule
    // `ChoiceQuestion.empty` was written for, and the first widget that can
    // actually reach it. A caller with no vault in hand is the same case as a
    // vault with no journals, and gets the same answer.
    const none = card.questions?.({} as never)[0];
    expect(none?.kind === "choice" && none.values).toEqual([]);
    expect(none?.kind === "choice" && none.empty).toMatch(/Settings/);
  });

  it("resolves a folder question against the note the window opened on", () => {
    const tags = tail.find((s) => s.id === "w:tag-index") as FlatSection;
    const q = tags.questions?.({ hostFolder: "02 - Diary" } as never)[0];
    expect(q?.kind === "folder" && q.hostFolder).toBe("02 - Diary");
    const none = tags.questions?.({} as never)[0];
    // Null leaves the control inert rather than promising a default the caller
    // could not name — `FolderQuestion.hostFolder`'s own rule.
    expect(none?.kind === "folder" && none.hostFolder).toBeNull();
  });
});

describe("locating a widget, which must be the directive and not a word inside one", () => {
  it("matches the keyword bare and with an argument", () => {
    expect(locateKeyword("events")("events")).toBe(0);
    expect(locateKeyword("events")("events:upcoming:5")).toBe(0);
    expect(locateKeyword("events")("events|Coming up")).toBe(0);
  });

  it("does not match a longer keyword that starts with it", () => {
    // THE FAILURE A REGEX WITH `\b` MAKES, and the homepage shipped one until
    // 4.12: `/^diary\b/m` matches `diary-search`, so the Diary card claimed the
    // search block. `splitDirective` is the grammar the dispatcher itself reads
    // with, so a section matches what a line DRAWS.
    expect(locateKeyword("diary")("diary-search")).toBe(-1);
    expect(locateKeyword("tasks")("tasks-table:Work")).toBe(-1);
    expect(locateKeyword("topic-stats")("topics-table")).toBe(-1);
  });

  it("returns the start of the line, which is what a line number is counted from", () => {
    const text = "`almanac:spacer`\n```almanac\nevents\n```\n";
    const at = locateKeyword("events")(text);
    expect(at).toBeGreaterThan(0);
    // `cellLineIn` turns this into a line number by counting the newlines before
    // it, and states that every flat catalogue's `locate` is a `^`-anchored
    // match. An offset pointing into the middle of a line would be off by one
    // in a way nothing else would notice.
    expect(text[at - 1]).toBe("\n");
    expect(text.slice(at, at + "events".length)).toBe("events");
  });

  it("ignores leading whitespace, as the dispatcher does", () => {
    expect(locateKeyword("events")("  events  ")).toBe(0);
  });

  it("finds nothing in a note that does not hold it", () => {
    expect(locateKeyword("events")(home())).toBe(-1);
  });
});

describe("the de-dup probe, which runs both ways", () => {
  it("withholds a widget the catalogue writes as a section of its own", () => {
    const ids = pageWidgetSections(CATALOGUE).map((s) => s.id);
    for (const claimed of ["diary", "launcher", "tasks-table", "on-this-day", "journals", "tag-index"]) {
      expect(ids, claimed).not.toContain(`${WIDGET_ID_PREFIX}${claimed}`);
    }
  });

  it("withholds one the catalogue writes INSIDE another section's fence", () => {
    // DIRECTION (b), AND IT IS NOT OPTIONAL. The Search note's search fence holds
    // `links:today,scopes#diary`, and no `SEARCH_SECTIONS` entry locates a
    // `links` line — so asking only "does the catalogue claim what this would
    // write?" says no, `w:links` is generated, its `locate` finds the composed
    // note, and `present()` reports a section the reader never added. The second
    // direction — "would this widget claim a line the catalogue writes?" — is
    // what catches it. This was found by running the first draft against Search.
    const search = searchSectionModel();
    expect(composeSearchNote()).toContain("links:");
    expect(search.present(composeSearchNote())).not.toContain("w:links");
    expect(search.addable(composeSearchNote()).map((s) => s.id)).not.toContain(
      "w:links"
    );
  });

  it("catches a catalogue that finds a keyword it does not itself write", () => {
    // WHAT DIRECTION (a) IS FOR, AND IT IS NOT LOAD-BEARING ON ANY CATALOGUE
    // SHIPPED TODAY — mutating it away leaves the suite green, because every
    // section in the tree renders the keyword its `locate` matches, so (b) sees
    // all of them. Said plainly rather than left as a comfortable assumption.
    //
    // The two directions ask different questions, and this is the shape only the
    // first can answer: a section whose `locate` is BROADER than its `render`.
    // `render` is what the catalogue writes into a fresh note; `locate` is what
    // it will claim in the reader's, and a catalogue is free to match a form it
    // no longer composes — an older spelling, an argument it stopped writing.
    // Probing with `render` alone would generate a widget that then fights that
    // section for the same fence.
    const legacy: FlatSection[] = [
      {
        id: "legacy",
        label: "Legacy",
        blurb: "Matches an events fence it no longer writes.",
        icon: "📦",
        locked: false,
        render: () => ({ fence: "almanac", lines: ["header:📦 Legacy"] }),
        locate: (text) => text.search(/^events\b/m),
      },
    ];
    expect(pageWidgetSections(legacy).map((s) => s.id)).not.toContain("w:events");
  });

  it("still offers everything neither direction claims", () => {
    // THE POINT OF THE DOOR, stated as a case: the value is the keywords no
    // catalogue has an opinion about.
    const ids = pageWidgetSections(CATALOGUE).map((s) => s.id);
    expect(ids).toContain("w:events");
    expect(ids).toContain("w:timeline");
    expect(ids).toContain("w:activity-chart");
  });

  it("answers the same for any diary root, because it reads locate and not render", () => {
    // `homeSections(root)` varies exactly one section's `render` — the Tags
    // section, which composes the root into its directive — and the probe reads
    // `locate`, which is invariant. Worth pinning rather than assuming: the day a
    // parameter changes a `locate`, this is the case that says so.
    const a = pageWidgetSections(homeSections("02 - Diary")).map((s) => s.id);
    const b = pageWidgetSections(homeSections("Journal/Days")).map((s) => s.id);
    expect(a).toEqual(b);
  });
});

describe("a widget added from the window behaves like any other section", () => {
  const withEvents = model.apply(home(), [
    ...composedIds,
    "w:events",
  ]) as string;

  it("lands in one fence at the end, after everything the page has an opinion about", () => {
    expect(withEvents).not.toBeNull();
    expect(withEvents.trimEnd().endsWith("```")).toBe(true);
    const fences = withEvents.split("\n").filter((l) => l.startsWith("```almanac"));
    expect(fences).toHaveLength(
      home().split("\n").filter((l) => l.startsWith("```almanac")).length + 1
    );
    // `insertionPoint` ranks by catalogue position and the tail is last, so this
    // costs no rule of its own.
    expect(withEvents.split("\n").filter((l) => l === "events")).toHaveLength(1);
  });

  it("is reported as present, and reported last", () => {
    const present = model.present(withEvents);
    expect(present).toContain("w:events");
    expect(present[present.length - 1]).toBe("w:events");
  });

  it("is no longer offered once it is there", () => {
    // `addableFlatSections` withholds what is present, which is what makes "one
    // of each widget per page" true without a rule of its own.
    expect(model.addable(withEvents).map((s) => s.id)).not.toContain("w:events");
  });

  it("restores the file exactly when it is removed again", () => {
    // THE PROPERTY `insertionPoint` PROMISES, asked of a section the catalogue
    // never wrote. The fence goes with the blank line that follows it and
    // nothing else moves.
    const back = model.apply(withEvents, composedIds);
    expect(back).toBe(home());
  });

  it("is loose, is a column, and can therefore be grouped", () => {
    const block = flatBlocks(withEvents, WITH_WIDGETS).find((b) =>
      b.ids.includes("w:events")
    );
    expect(block?.loose).toContain("w:events");
    expect(block?.column).toContain("w:events");
  });

  it("re-points its argument in place, without touching anything else", () => {
    const m = flatNoteModel({
      sections: CATALOGUE,
      noun: "the homepage",
      heldUnit: "chart",
    });
    const composed = composedIds;
    // ON A WIDGET THAT DECLARES AN ARGUMENT. `timeline:N` takes one and the
    // registry deliberately does not ask about it — a count is not a question the
    // window has a control for — so `render` ignores an answer it never asked
    // for, which is what keeps `render` and `questions` from disagreeing.
    const added = m.apply(home(), [...composed, { id: "w:review-queue", options: { arg: "all" } }]) as string;
    expect(added).toContain("review-queue:all");
    // RECONFIGURE, NOT REWRITE. `withAnswers` splices into the directive's own
    // span, so a settled row's answer can be changed after the fact — which the
    // rejected design listed as out of reach.
    const repointed = m.apply(added, [
      ...composed,
      { id: "w:review-queue", options: { arg: "03 - Journals/Study" } },
    ]) as string;
    expect(repointed).toContain("review-queue:03 - Journals/Study");
    expect(repointed).not.toContain("review-queue:all");
    expect(
      repointed.split("\n").filter((l) => l.startsWith("review-queue"))
    ).toHaveLength(1);
  });
});

describe("a widget fence somebody wrote by hand", () => {
  const byHand = home() + "\n```almanac\nevents\n```\n";

  it("stops being reported as a block nobody owns", () => {
    // THE COMPLAINT ANSWERED FROM THE OTHER SIDE. Before 4.12 this fence was a
    // foreign run — true, and useless: the editor could see it, could not name
    // it, and would not touch it.
    const ops = model.plan(byHand, model.present(byHand));
    expect(ops.filter((o) => o.kind === "foreign")).toEqual([]);
    expect(model.present(byHand)).toContain("w:events");
  });

  it("and a titled one is listed, removable, and not offered a group", () => {
    // A hand-written `header:` over a widget IS a widget row — named by the
    // directive under the bar — and it is not a column, because its bar would
    // render below the group it titles. Listed, removable, not grouped: the
    // complaint answered from the other side.
    const titled = home() + "\n```almanac\nheader:🎉 Events\nevents\n```\n";
    expect(model.present(titled)).toContain("w:events");
    const block = flatBlocks(titled, WITH_WIDGETS).find((b) =>
      b.ids.includes("w:events")
    );
    expect(block?.loose).toContain("w:events");
    expect(block?.column).toEqual([]);
  });

  it("gives the id to the first fence and leaves a second copy alone", () => {
    // `parseFlatSections` attributes an id to its first run only (4.12 §A), so a
    // reader who wants two of one widget keeps the second one — as their own
    // block, reported and untouched — rather than losing its content to the
    // first on the next reorder.
    const twice = byHand + "\n```almanac\nevents:upcoming:9\n```\n";
    const ops = model.plan(twice, model.present(twice));
    expect(ops.filter((o) => o.kind === "foreign")).toHaveLength(1);
    expect(model.present(twice).filter((id) => id === "w:events")).toHaveLength(1);
  });
});

// ── a widget a page may hold more than one of (4.15 §4) ───────────────
//
// THE TEST ABOVE IS THE CONTRAST, and the two should be read together: a
// widget that does NOT repeat gives its id to the first fence and leaves a
// second copy alone, because two runs answering to one id is the failure that
// swaps a reader's content on Save. A repeating widget does not relax that
// rule — it gives every occurrence an id, so each id still owns exactly one
// run.
describe("a widget a page may hold more than one of", () => {
  const cards = (n: number): string =>
    Array.from(
      { length: n },
      (_, i) => "```almanac\njournal-card:j" + (i + 1) + "\n```"
    ).join("\n\n") + "\n";

  it("spells an instance id so it can be read back without a list", () => {
    expect(instanceId("journal-card", 2)).toBe("w:journal-card#2");
    expect(instanceIdOf("w:journal-card#2")).toEqual({
      keyword: "journal-card",
      n: 2,
    });
    // A widget that does not repeat has no instances, whatever is written.
    expect(instanceIdOf("w:events#2")).toBeNull();
    // Nor does anything that is not one of these at all.
    expect(instanceIdOf("w:journal-card")).toBeNull();
    expect(instanceIdOf("title")).toBeNull();
    // An ordinal below one is not a position in a list, and neither is a word.
    expect(instanceIdOf("w:journal-card#0")).toBeNull();
    expect(instanceIdOf("w:journal-card#x")).toBeNull();
  });

  it("locates the nth line, and nothing when there is no nth", () => {
    const text = cards(3);
    expect(locateNth("journal-card", 1)(text)).toBe(text.indexOf("journal-card:j1"));
    expect(locateNth("journal-card", 2)(text)).toBe(text.indexOf("journal-card:j2"));
    expect(locateNth("journal-card", 3)(text)).toBe(text.indexOf("journal-card:j3"));
    expect(locateNth("journal-card", 4)(text)).toBe(-1);
    expect(countKeyword("journal-card", text)).toBe(3);
  });

  it("offers what the text holds and exactly one more", () => {
    // THE SPARE IS WHAT KEEPS IT ADDABLE. `addableFlatSections` offers what the
    // text does not have, so a widget whose every instance was present would
    // vanish from the add list precisely when another was wanted. The spare's
    // `locate` returns -1 — there is no nth line — which is already what "not
    // present" means, so nothing had to learn a rule to offer it.
    const cardIds = (text: string): string[] =>
      repeatableInstances([], text)
        .map((s) => s.id)
        .filter((id) => id.includes("journal-card"));
    expect(cardIds(cards(2))).toEqual([
      "w:journal-card#1",
      "w:journal-card#2",
      "w:journal-card#3",
    ]);
    expect(cardIds("")).toEqual(["w:journal-card#1"]);
    // AND EVERY REPEATING WIDGET GETS THE SAME TREATMENT, which is what makes
    // the spare a rule rather than one widget's arrangement — `level-index`
    // joined the table in 4.16 and needed no change here.
    const repeating = Object.entries(WIDGETS).filter(([, w]) => w.repeats);
    expect(repeating.length).toBeGreaterThan(1);
    for (const [keyword] of repeating) {
      expect(repeatableInstances([], "").map((s) => s.id)).toContain(
        `w:${keyword}#1`
      );
    }
  });

  it("resolves an id that no list ever contained", () => {
    // A reader staging three new cards on a note that holds none reaches past
    // the spare. The id is parseable, so it is built from its own spelling
    // rather than from a pool whose depth nobody could pick.
    const far = instanceSectionFor("w:journal-card#9");
    expect(far?.id).toBe("w:journal-card#9");
    expect(far?.render({ arg: "study" }).lines).toEqual(["journal-card:study"]);
    expect(instanceSectionFor("w:events#9")).toBeNull();
  });

  it("mints an id nothing holds, counting the window's rows and the file", () => {
    // `taken` IS THE WINDOW'S, NOT THE FILE'S, and that is the whole reason it
    // is a parameter: the text says two cards exist, and a reader who has
    // already staged a third this session must get a fourth.
    const text = cards(2);
    const rows = ["w:journal-card#1", "w:journal-card#2"];
    expect(nextInstanceId("w:journal-card#3", text, rows)).toBe("w:journal-card#3");
    expect(
      nextInstanceId("w:journal-card#3", text, [...rows, "w:journal-card#3"])
    ).toBe("w:journal-card#4");
    // And on a note with none of them, the first.
    expect(nextInstanceId("w:journal-card#1", "", [])).toBe("w:journal-card#1");
  });

  it("gives each occurrence a run of its own, so none is nobody's", () => {
    // THE CONTRAST WITH `events` ABOVE. Three fences, three ids, no foreign
    // block — where three `events` fences would be one section and two blocks
    // the plan declines to touch.
    const text = home() + "\n" + cards(3);
    expect(model.present(text)).toEqual(
      expect.arrayContaining([
        "w:journal-card#1",
        "w:journal-card#2",
        "w:journal-card#3",
      ])
    );
    const ops = model.plan(text, model.present(text));
    expect(ops.filter((o) => o.kind === "foreign")).toEqual([]);
  });

  it("removes the one that was asked for, judged by the lines that remain", () => {
    // ASSERTED ON THE TEXT, NOT ON THE IDS, and deliberately: the ordinals are
    // positions, so removing the middle card renumbers the third to #2. An
    // assertion that the remaining ids are #1 and #3 would be asserting that
    // they are NOT positions. What has to be true is that the reader keeps the
    // two cards they kept.
    const text = home() + "\n" + cards(3);
    const want = model.present(text).filter((id) => id !== "w:journal-card#2");
    const next = model.apply(text, want) as string;
    expect(next).toContain("journal-card:j1");
    expect(next).not.toContain("journal-card:j2");
    expect(next).toContain("journal-card:j3");
    // And what is left renumbers, which is what "derived, never stored" means.
    expect(model.present(next).filter((id) => id.includes("journal-card"))).toEqual([
      "w:journal-card#1",
      "w:journal-card#2",
    ]);
  });

  it("adds a card the file has never held, with the journal it was given", () => {
    const text = home();
    const want = [
      ...model.present(text).map((id) => ({ id })),
      { id: "w:journal-card#1", options: { arg: "study" } },
      { id: "w:journal-card#2", options: { arg: "cooking" } },
    ];
    const next = model.apply(text, want) as string;
    expect(next).toContain("journal-card:study");
    expect(next).toContain("journal-card:cooking");
  });

  it("tells two cards in ONE fence apart, and cuts the line asked for", () => {
    // THE CASE THE RECORDED LINE WAS WRITTEN FOR. A reader may group two cards
    // into one block as columns, and a partial removal then cuts one line out of
    // a fence that is staying. `cellLineIn` used to re-derive that line from the
    // section's own anchor, and an instance's anchor is an ordinal over the
    // whole note — so asked of one fence, both cards answered with the first
    // card's line and removing the second would have deleted the first.
    const row =
      home() +
      "\n```almanac\nrow:cards\njournal-card:study\njournal-card:cooking\n```\n";
    expect(model.present(row).filter((id) => id.includes("journal-card"))).toEqual([
      "w:journal-card#1",
      "w:journal-card#2",
    ]);
    const without = (gone: string): string =>
      model.apply(row, model.present(row).filter((id) => id !== gone)) as string;
    // Each removal takes its own line and leaves the block, its `row` line and
    // the other card exactly as they were.
    expect(without("w:journal-card#1")).toContain("row:cards\njournal-card:cooking");
    expect(without("w:journal-card#2")).toContain("row:cards\njournal-card:study");
  });

  it("reads each card's own journal back, which one directive per note could not", () => {
    // THE SELECTOR IS THE FEATURE, AND THIS IS WHAT KEEPS IT DRAWN. The editor
    // reads an answer back by finding the directive in the whole file and gives
    // up when there are two — the refusal 3.18 added after `header:`, which
    // repeats once per section, handed two boxes one value and drew a control
    // over another section's title. A repeating widget makes its directive
    // plural on purpose, so that refusal would take the dropdown off every card
    // the moment a page had a second one.
    //
    // The model does not have to guess: it located each section, so each reads
    // the line that is its own.
    const vault = {
      journals: [
        { value: "study", label: "Study" },
        { value: "cooking", label: "Cooking" },
      ],
    };
    const m = homeSectionModel(ROOT, "", vault);
    const text =
      home() +
      "\n```almanac\njournal-card:study\n```\n\n```almanac\njournal-card:cooking\n```\n";
    const cards = m.sections(text).filter((s) => s.id.includes("journal-card"));
    expect(cards.map((s) => s.answered?.arg)).toEqual([
      "study",
      "cooking",
      // The spare has no line, so it has no answer — which is what makes it
      // read as "not present, therefore addable" rather than as a copy of the
      // last card.
      undefined,
    ]);
    // And the vault's own journals are what it offers to change them to.
    const q = cards[0].questions?.[0];
    expect(q?.kind === "choice" && q.values.map((v) => v.value)).toEqual([
      "study",
      "cooking",
    ]);
  });

  it("writes the journal's id and shows its name, on both sides of the round trip", () => {
    // WHAT THE DROPDOWN WRITES IS WHAT THE DISPATCHER RESOLVES, and the two
    // halves live in different modules — so this asserts the pair rather than
    // either one, the way the registry and the title table are asserted against
    // each other.
    //
    // THE ID, NOT THE NAME, and the difference is a journal being renamed:
    // `journal-card:study` keeps working and the dropdown reads whatever it is
    // called today. Writing the display name would put a label in the reader's
    // file and break the line the moment they edited it in Settings — and the
    // name is the half that carries the emoji, which is not an identifier.
    expect(readCode("section-insert")).toContain("value: t.id,");
    expect(readCode("directive-regions")).toContain("types.find((t) => t.id === wanted)");
  });

  it("asks two questions into one argument, and neither overwrites the other", () => {
    // NO WIDGET TOOK TWO ARGUMENTS BEFORE `level-index` (4.16 §2), and the trap
    // is `withAnswers`: it splices each question's answer into the span
    // `argSpanIn` finds for that question's directive, so two questions naming
    // one directive is the second answer overwriting the first. The pieces are
    // composed and spliced ONCE.
    const vault = { journals: [{ value: "study", label: "Study" }] };
    const m = homeSectionModel(ROOT, "", vault);
    const at = m.sections("").find((x) => x.id === "w:level-index#1");
    expect(at?.questions?.map((q) => q.key)).toEqual(["arg", "arg2"]);
    expect(at?.questions?.map((q) => q.kind)).toEqual(["choice", "folder"]);

    const line = (text: string | null): string =>
      (text ?? "").split("\n").find((l) => l.startsWith("level-index")) ?? "";
    const blank = "`almanac:spacer`\n";
    expect(
      line(m.apply(blank, [{ id: "w:level-index#1", options: { arg: "study", arg2: "Maths" } }]))
    ).toBe("level-index:study/Maths");
    // A TRAILING SEPARATOR IS NOT AN EMPTY ANSWER — `level-index:study/` reads as
    // a folder that went missing.
    expect(
      line(m.apply(blank, [{ id: "w:level-index#1", options: { arg: "study" } }]))
    ).toBe("level-index:study");
  });

  it("says what an empty folder box falls back to, where it is not the note's folder", () => {
    // THE BOX DESCRIBED A RULE IT DOES NOT FOLLOW (4.16.1). Every folder
    // question in the plugin falls back to the host note's own folder, and the
    // control says so in its placeholder, its tooltip and its aria-label — all
    // three hard-coded, because for years there was nothing else to say.
    // `level-index`'s second piece falls back to the JOURNAL its first piece
    // names, which is a sibling answer and therefore not a path this question
    // can be handed when it is built. So the catalogue supplies the words.
    const vault = { journals: [{ value: "study", label: "Study" }] };
    const m = homeSectionModel(ROOT, "", vault);
    const at = m.sections("").find((x) => x.id === "w:level-index#1");
    const folder = at?.questions?.find((q) => q.key === "arg2");
    expect(folder?.kind).toBe("folder");
    expect(folder && "emptyLabel" in folder ? folder.emptyLabel : undefined).toBe(
      "the whole journal"
    );

    // AND THE SET IS NAMED RATHER THAN COUNTED (4.36). This asserted a length of
    // ONE, on the argument that "a second widget quietly acquiring an override
    // would mean the ordinary wording had stopped being true somewhere else
    // too, and nobody had noticed which." The argument is right and the
    // instrument was a tally: `level-cards` is `level-index`'s card arrangement,
    // takes its two arguments verbatim, and has the same sibling fallback for
    // the same reason — so it is the one case the count was never going to be
    // able to tell apart from the failure it was watching for.
    //
    // Naming them keeps the guard: a THIRD widget, or either of these two
    // drifting to different words, still fails.
    //
    // AND THE WORDS ARE ASSERTED PER MEMBER AS OF 4.44.0, because the set has a
    // second reason to be in it now and a loop over one string could not hold
    // both. The homepage's `tasks-table` falls back to the vault ROOT — which is
    // this note's own folder, so the ordinary wording is TRUE there and says
    // nothing: "This note's folder" on the homepage describes the whole vault
    // without ever using the word. That is the same failure `level-index` had
    // (a box describing a rule it does not follow) arriving from the opposite
    // side, and the same field answers it.
    //
    // The guard the count was standing in for is intact: a FOURTH override, or
    // any of these three drifting, still fails here.
    const overridden = m
      .sections("")
      .flatMap((s) => s.questions ?? [])
      .filter((q) => q.kind === "folder" && "emptyLabel" in q && q.emptyLabel);
    expect(
      Object.fromEntries(
        overridden.map((q) => [
          q.directive,
          "emptyLabel" in q ? q.emptyLabel : undefined,
        ])
      )
    ).toEqual({
      "level-cards": "the whole journal",
      "level-index": "the whole journal",
      "tasks-table": "the whole vault",
    });
  });

  it("reads each piece back into its own box, remainder and all", () => {
    const vault = { journals: [{ value: "study", label: "Study" }] };
    const m = homeSectionModel(ROOT, "", vault);
    const text = "`almanac:spacer`\n\n```almanac\nlevel-index:study/Maths/Algebra\n```\n";
    const view = m.sections(text).find((x) => x.id === "w:level-index#1");
    // THE LAST PIECE TAKES THE REMAINDER, which is what lets a nested folder be
    // the second half of a two-piece argument — split as a list it would be
    // three pieces, two of which nobody asked for.
    expect(view?.answered).toEqual({ arg: "study", arg2: "Maths/Algebra" });

    // AND ANSWERING ONE PIECE LEAVES THE OTHER AS THE READER LEFT IT, which is
    // the promise a single-question splice already makes about the rest of the
    // line, one level in.
    const want = m
      .present(text)
      .map((id) =>
        id === "w:level-index#1" ? { id, options: { arg2: "Physics" } } : { id }
      );
    expect(
      (m.apply(text, want) ?? "").split("\n").find((l) => l.startsWith("level-index"))
    ).toBe("level-index:study/Physics");
  });

  it("lets two cards name one journal, which is what positional ids buy", () => {
    // The case the cheaper design could not express: two `journal-card:study`
    // lines are the FIRST and the SECOND, not one section found twice.
    const text =
      home() +
      "\n```almanac\njournal-card:study\n```\n\n```almanac\njournal-card:study\n```\n";
    const present = model.present(text).filter((id) => id.includes("journal-card"));
    expect(present).toEqual(["w:journal-card#1", "w:journal-card#2"]);
    expect(model.plan(text, model.present(text)).filter((o) => o.kind === "foreign"))
      .toEqual([]);
  });
});
