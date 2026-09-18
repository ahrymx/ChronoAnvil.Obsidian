// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  decodeJournalManifest,
  encodeJournalManifest,
  manifestPathFor,
} from "../src/journals/journal-manifest";
import {
  inferJournalFromScan,
  inferTracker,
  parseFences,
  parseFrontmatter,
  scanFile,
} from "../src/journals/journal-infer";
import type { JournalScan } from "../src/journals/journal-infer";
import { buildJournalType, journalTemplateFiles } from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import type { TrackerDef } from "../src/trackers/trackers";
import { readSrc } from "./sources";

// The Cooking journal from the dev vault, stated as the config that made it.
// Two levels, two kinds, one of them paged, both rated on a tracker the vault
// no longer defines — which is the exact shape that came back empty after the
// plugin folder was replaced.
const COOKING: JournalConfig = {
  id: "cooking",
  name: "Cooking",
  emoji: "🍳",
  root: "03 - Journals/Cooking",
  templatesFolder: "00 - Infrastructure/Templates/Cooking",
  levels: [
    { id: "cuisine", noun: "Cuisine", fallbackEmoji: "📚" },
    { id: "dish", noun: "Dish", fallbackEmoji: "📂" },
  ],
  kinds: [
    { id: "recipe", emoji: "📋", label: "Recipe", rating: "difficulty", pages: true },
    { id: "attempt", emoji: "🔥", label: "Attempt", rating: "difficulty" },
  ],
};

const NO_TRACKERS = { trackerIds: new Set<string>(), folderEmojis: {} };

// The templates a config actually generates, as the scan sees them.
function templatesOf(cfg: JournalConfig): JournalScan["templates"] {
  return journalTemplateFiles(buildJournalType(cfg)).map((t) => ({
    name: t.name.toLowerCase(),
    file: scanFile([t.name], t.content),
  }));
}

// A minimal but realistic note tree: one index note per container, one leaf
// note per kind. Enough to state the depths, which is what the templates
// cannot say on their own.
function notesOf(cfg: JournalConfig, rating = "3"): JournalScan["notes"] {
  const [top, sub] = cfg.levels;
  const notes: JournalScan["notes"] = [
    scanFile(["Italian", "Italian.md"], `---\ntype: ${top.id}\nstatus: in-progress\n---\n`),
  ];
  if (sub) {
    notes.push(
      scanFile(
        ["Italian", "Pasta", "Pasta.md"],
        `---\ntype: ${sub.id}\n${top.id}: Italian\nstatus: in-progress\n---\n`
      )
    );
  }
  const leafDir = sub ? ["Italian", "Pasta"] : ["Italian"];
  for (const kind of cfg.kinds) {
    notes.push(
      scanFile([...leafDir, `A ${kind.label}.md`], [
        "---",
        `type: ${kind.id}`,
        `${top.id}: Italian`,
        ...(sub ? [`${sub.id}: Pasta`] : []),
        ...(kind.rating ? [`${kind.rating}: ${rating}`] : []),
        "status: completed",
        "---",
        "```chronoanvil",
        "journal-header",
        ...(kind.rating ? [`tracker:${kind.rating}`] : []),
        "tracker:status",
        "```",
      ].join("\n"))
    );
  }
  return notes;
}

describe("manifest encoding", () => {
  it("lives in the journal's own root", () => {
    expect(manifestPathFor("03 - Journals/Cooking")).toBe(
      "03 - Journals/Cooking/.chronoanvil-journal.json"
    );
  });

  it("round trips a config", () => {
    const decoded = decodeJournalManifest(encodeJournalManifest(COOKING, []));
    expect(decoded?.config.id).toBe("cooking");
    expect(decoded?.config.kinds).toEqual(COOKING.kinds);
    expect(decoded?.config.levels).toEqual(COOKING.levels);
  });

  it("omits the folders, so a copy can't point at where it came from", () => {
    // The whole reason importing works: a manifest carried into another vault
    // must not re-target the type at the sender's paths.
    const raw = encodeJournalManifest(COOKING, []);
    expect(raw).not.toContain("03 - Journals/Cooking");
    expect(raw).not.toContain("00 - Infrastructure");
  });

  it("carries the journal's own trackers", () => {
    const difficulty: TrackerDef = {
      id: "difficulty",
      label: "Difficulty",
      type: "number",
      min: 1,
      max: 5,
      step: 1,
      surface: { kind: "journal", typeId: "cooking" },
      showInTemplate: false,
      showInBase: false,
    };
    const decoded = decodeJournalManifest(
      encodeJournalManifest(COOKING, [difficulty])
    );
    expect(decoded?.trackers).toEqual([difficulty]);
  });

  it("refuses anything that isn't a manifest", () => {
    // Reads a file that may be hand-edited or half-written by a sync, so a
    // bad one has to mean "fall back to inference", never "throw on load".
    expect(decodeJournalManifest("not json")).toBeNull();
    expect(decodeJournalManifest("{}")).toBeNull();
    expect(decodeJournalManifest('{"chronoanvilJournal":1}')).toBeNull();
    expect(
      decodeJournalManifest('{"chronoanvilJournal":1,"config":{"id":"x","name":"X","levels":[],"kinds":[]}}')
    ).toBeNull();
  });
});

describe("parsing a journal note", () => {
  it("reads frontmatter without choking on template tokens", () => {
    // A YAML parser reads `{{subject}}` as a flow mapping; the templates are
    // half of what gets scanned, so this has to stay line-based.
    expect(
      parseFrontmatter("---\ntype: recipe\ncuisine: {{subject}}\n---\nbody")
    ).toEqual({ type: "recipe", cuisine: "{{subject}}" });
  });

  it("keeps each chronoanvil fence separate", () => {
    // The pairing WITHIN a fence is the information — a kind's header sits
    // beside its create button — so flattening would lose the association.
    const fences = parseFences(
      "```chronoanvil\nheader:📋 Recipes\nbutton:cooking:new-recipe\n```\n\n" +
        "```chronoanvil\nheader:🔥 Attempts\nbutton:cooking:new-attempt\n```\n"
    );
    expect(fences).toHaveLength(2);
    expect(fences[0].map((d) => d.key)).toEqual(["header", "button"]);
  });

  it("ignores fences that aren't chronoanvil's", () => {
    expect(parseFences("```base\nfilters:\n  and:\n```\n")).toEqual([]);
  });
});

describe("inferring a journal from its folder", () => {
  const scan = (over: Partial<JournalScan> = {}): JournalScan => ({
    folderName: "Cooking",
    notes: notesOf(COOKING),
    templates: templatesOf(COOKING),
    ...over,
  });

  it("recovers the id the notes already expect", () => {
    // From `button:cooking:*`, not from the folder name: renaming the folder
    // must not silently re-id the type and orphan its trackers.
    const out = inferJournalFromScan(
      scan({ folderName: "Recipes and things" }),
      NO_TRACKERS
    );
    expect(out?.config.id).toBe("cooking");
  });

  it("recovers the levels in depth order", () => {
    const out = inferJournalFromScan(scan(), NO_TRACKERS);
    expect(out?.config.levels.map((l) => l.id)).toEqual(["cuisine", "dish"]);
    expect(out?.config.levels.map((l) => l.noun)).toEqual(["Cuisine", "Dish"]);
  });

  it("recovers the kinds in declaration order, not alphabetically", () => {
    // Both sources are alphabetical by accident (a directory listing, a note
    // walk), and the order is the order of the create buttons and of every
    // table in the index templates. The index's own button sequence settles it.
    const out = inferJournalFromScan(scan(), NO_TRACKERS);
    expect(out?.config.kinds.map((k) => k.id)).toEqual(["recipe", "attempt"]);
  });

  it("recovers each kind's emoji from the fence that creates it", () => {
    const out = inferJournalFromScan(scan(), NO_TRACKERS);
    expect(out?.config.kinds.map((k) => k.emoji)).toEqual(["📋", "🔥"]);
  });

  it("recovers a kind named by a create button and nothing else", () => {
    // ── THE READER'S IMPORT BUG (1.0.23) ─────────────────────────────────
    //
    // A kind has three possible traces in a folder — a `<kind>.md` template, a
    // note carrying `type: <kind>`, and the `new-<kind>` button its index draws
    // — and inference read the first two. The third was parsed already, and used
    // only to SORT what the other two had found.
    //
    // So a kind nobody had written a note of yet, in a vault whose templates
    // folder had moved, was dropped from the config while every trace of it
    // stayed on disk. From the note that is: a `📝 Cheatsheets` group still
    // drawn on the topic index, its button reading `new-cheatsheets` because no
    // kind answered to it, and a red *"Unknown Study note type: cheatsheets"*
    // under it. Reported from a real vault, with that screenshot.
    const withButtonOnly = scan({
      templates: [],
      notes: [
        ...scan().notes,
        scanFile(
          ["Italian", "Pasta", "Pasta.md"],
          "---\ntype: dish\ncuisine: Italian\n---\n" +
            "```chronoanvil\nheader:🗂️ What's below\n" +
            "header:2:📋 Recipes\nbutton:cooking:new-recipe\nkind-table:recipe\n" +
            "header:2:🔥 Attempts\nbutton:cooking:new-attempt\nkind-table:attempt\n" +
            "header:2:📝 Cheatsheets\nbutton:cooking:new-cheatsheet\nkind-table:cheatsheet\n```\n"
        ),
      ],
    });
    const kinds = inferJournalFromScan(withButtonOnly, NO_TRACKERS)!.config.kinds;
    const found = kinds.find((k) => k.id === "cheatsheet");
    expect(found).toBeDefined();
    // AND IT ARRIVES DRESSED, from the same fence: the `header:2:` beside the
    // button carries the emoji and the plural, which is what `kindLabelsFromFences`
    // was already reading for the kinds it did recover.
    expect(found!.emoji).toBe("📝");
    // In DECLARED position — third, where the index draws it — rather than
    // appended because it was found last.
    expect(kinds.map((k) => k.id)).toEqual(["recipe", "attempt", "cheatsheet"]);
  });

  it("believes a button only from this journal, and only about a kind", () => {
    // THE COST OF LETTING A BUTTON DECLARE ONE. While this sweep only sorted, an
    // action naming no kind matched nothing and fell through harmlessly; now it
    // would be believed. Two refusals keep that from happening, and both bit in
    // the writing: Cooking imported a kind called `container` from the
    // `New Cuisine` button its own top-level index composes.
    const out = inferJournalFromScan(
      scan({
        notes: [
          ...scan().notes,
          scanFile(
            ["Italian", "Italian.md"],
            "---\ntype: cuisine\n---\n```chronoanvil\n" +
              // This journal's own level controls, which are not kinds.
              "button:cooking:new-container\nbutton:cooking:new-top\n" +
              "button:cooking:new-journal\nbutton:cooking:new-topic\n" +
              "button:cooking:new-page\n" +
              // And another journal's kind, linked from a Cooking page.
              "button:study:new-lesson\n```\n"
          ),
        ],
      }),
      NO_TRACKERS
    );
    expect(out?.config.kinds.map((k) => k.id)).toEqual(["recipe", "attempt"]);
  });

  it("keeps its reserved list in step with the one that draws the buttons", () => {
    // TWO LISTS, ONE FACT, and this file reads backwards what `button-widgets.ts`
    // writes forwards. A sixth reserved action added there and not here would be
    // imported as a kind named after a control — silently, and only into vaults
    // that happen to have that button.
    const infer = readSrc("journal-infer");
    const drawn = readSrc("button-widgets");
    for (const action of ["journal", "top", "topic", "container"]) {
      expect(infer, action).toContain(`"${action}"`);
      expect(drawn, action).toContain(`sub === "new-${action}"`);
    }
    // `page` is refused a step earlier, by the same rule that refuses a level id.
    expect(infer).toContain('if (k === "page" || levelSet.has(k)) return;');
    expect(drawn).toContain('if (sub === "new-page")');
  });

  it("recovers no paged flag, because there is no longer one to recover", () => {
    // THIS TEST USED TO READ THE PAGES TABLE BACK OFF THE TEMPLATE and set
    // `pages: true` on the kind that had one. The field is gone from
    // `JournalKindConfig` as of 1.0.23 — every kind holds pages — so the table
    // is read back as what it always was: a SECTION in that template's text,
    // which the import keeps by keeping the template.
    const out = inferJournalFromScan(scan(), NO_TRACKERS);
    for (const kind of out!.config.kinds) {
      expect(kind, kind.id).not.toHaveProperty("pages");
    }
  });

  it("recovers what each kind is rated on", () => {
    const out = inferJournalFromScan(scan(), NO_TRACKERS);
    expect(out?.config.kinds.map((k) => k.rating)).toEqual([
      "difficulty",
      "difficulty",
    ]);
  });

  it("takes the heading emoji from the vault's folder pool", () => {
    const out = inferJournalFromScan(scan(), {
      trackerIds: new Set<string>(),
      folderEmojis: { Cooking: "🍳" },
    });
    expect(out?.config.emoji).toBe("🍳");
  });

  it("rebuilds the tracker its notes log but the vault has lost", () => {
    // The half of the failure that is easy to miss: without this the recovered
    // journal renders "Unknown tracker: difficulty" on every note.
    //
    // `status` is in the known set because it always is — it is a journal
    // built-in that a reset data.json restores — so `difficulty` is the only
    // one genuinely missing. That is what the dev vault actually looked like.
    const out = inferJournalFromScan(scan(), {
      trackerIds: new Set(["status", "confidence", "accuracy", "reviewed"]),
      folderEmojis: {},
    });
    expect(out?.trackers).toHaveLength(1);
    expect(out?.trackers[0].id).toBe("difficulty");
    expect(out?.trackers[0].surface).toEqual({ kind: "journal", typeId: "cooking" });
    expect(out?.guesses.join(" ")).toContain("difficulty");
  });

  it("leaves a tracker the vault already defines alone", () => {
    // `status` is a journal built-in. Re-creating it as an inferred select
    // would clobber a definition the user may have tuned.
    const out = inferJournalFromScan(scan(), {
      trackerIds: new Set(["difficulty", "status"]),
      folderEmojis: {},
    });
    expect(out?.trackers).toEqual([]);
  });

  it("works from templates alone when no notes came with the folder", () => {
    const out = inferJournalFromScan(scan({ notes: [] }), NO_TRACKERS);
    expect(out?.config.levels.map((l) => l.id)).toEqual(["cuisine", "dish"]);
    expect(out?.guesses.join(" ")).toContain("no index notes yet");
  });

  it("works from notes alone when the templates weren't copied", () => {
    const out = inferJournalFromScan(scan({ templates: [] }), NO_TRACKERS);
    expect(out?.config.id).toBe("cooking");
    expect(out?.config.levels.map((l) => l.id)).toEqual(["cuisine", "dish"]);
    expect(out?.config.kinds.map((k) => k.id).sort()).toEqual([
      "attempt",
      "recipe",
    ]);
  });

  it("refuses a folder that is just markdown", () => {
    // Everything under the journals root is a candidate, so an ordinary folder
    // of notes must come back null rather than become a journal type.
    expect(
      inferJournalFromScan(
        {
          folderName: "Shopping lists",
          notes: [
            scanFile(["Milk.md"], "# Milk\n\nsemi-skimmed"),
            scanFile(["Bread.md"], "---\ntags: [food]\n---\n# Bread\n"),
          ],
          templates: [],
        },
        NO_TRACKERS
      )
    ).toBeNull();
  });

  it("refuses an empty folder", () => {
    expect(
      inferJournalFromScan(
        { folderName: "Empty", notes: [], templates: [] },
        NO_TRACKERS
      )
    ).toBeNull();
  });

  it("handles a flat journal", () => {
    const flat: JournalConfig = {
      ...COOKING,
      id: "reading",
      name: "Reading",
      levels: [{ id: "shelf", noun: "Shelf", fallbackEmoji: "📚" }],
      kinds: [{ id: "book", emoji: "📖", label: "Book" }],
    };
    const out = inferJournalFromScan(
      {
        folderName: "Reading",
        notes: notesOf(flat),
        templates: templatesOf(flat),
      },
      NO_TRACKERS
    );
    expect(out?.config.levels.map((l) => l.id)).toEqual(["shelf"]);
    expect(out?.config.kinds.map((k) => k.id)).toEqual(["book"]);
  });
});

// ── The strongest statement available ─────────────────────────────────────
//
// buildJournalType names every generated file after an id, and the catalogue
// writes each kind's header beside its create button. Between them, a journal's
// own templates describe the config that produced them — so inference should be
// the inverse of generation, and that is checkable rather than assertable: take
// a config, generate its templates, read them back, and regenerate. If the
// second set of templates is byte-identical to the first, nothing that matters
// was lost on the way round.
//
// Verified against the real dev vault before being written down here: all five
// of the Cooking journal's templates on disk regenerate byte-for-byte from the
// config inferred out of that folder.
describe("inference is the inverse of generation", () => {
  const roundTrip = (cfg: JournalConfig): void => {
    const before = journalTemplateFiles(buildJournalType(cfg));
    const out = inferJournalFromScan(
      {
        folderName: cfg.name,
        notes: notesOf(cfg),
        templates: templatesOf(cfg),
      },
      { trackerIds: new Set<string>(), folderEmojis: { [cfg.name]: cfg.emoji } }
    );
    expect(out).not.toBeNull();
    const after = journalTemplateFiles(
      buildJournalType({
        ...out!.config,
        root: cfg.root,
        templatesFolder: cfg.templatesFolder,
      })
    );
    expect(after.map((f) => f.name)).toEqual(before.map((f) => f.name));
    for (let i = 0; i < before.length; i++) {
      expect(after[i].content, `${before[i].name} differs`).toBe(
        before[i].content
      );
    }
  };

  it("round trips the two-level, two-kind, paged case", () => {
    roundTrip(COOKING);
  });

  it("round trips a flat single-kind journal", () => {
    roundTrip({
      ...COOKING,
      id: "meetings",
      name: "Meetings",
      emoji: "📔",
      levels: [{ id: "team", noun: "Team", fallbackEmoji: "📚" }],
      kinds: [{ id: "minutes", emoji: "📝", label: "Minutes" }],
    });
  });

  it("round trips a kind whose plural the crude rule gets wrong", () => {
    // "Practice" pluralises to "Practices" under the crude rule, so a declared
    // plural is the only way the label survives — and it survives because the
    // header bar carries it.
    roundTrip({
      ...COOKING,
      id: "training",
      name: "Training",
      levels: [{ id: "discipline", noun: "Discipline", fallbackEmoji: "📚" }],
      kinds: [
        { id: "practice", emoji: "🏃", label: "Practice", plural: "Practice" },
      ],
    });
  });
});

describe("inferring a lost tracker", () => {
  it("reads a number's range off the readings", () => {
    const { tracker } = inferTracker("difficulty", ["1", "3", "5"], "cooking");
    expect(tracker.type).toBe("number");
    expect(tracker.min).toBe(1);
    expect(tracker.max).toBe(5);
    expect(tracker.step).toBe(1);
  });

  it("says so in the guess, rather than passing it off as recovered", () => {
    const { guess } = inferTracker("difficulty", ["2", "4"], "cooking");
    expect(guess).toContain("2");
    expect(guess).toContain("4");
  });

  it("keeps a fractional scale fractional", () => {
    const { tracker } = inferTracker("hours", ["1.5", "2"], "cooking");
    expect(tracker.step).toBeUndefined();
  });

  it("spots a date", () => {
    expect(inferTracker("sat", ["2026-01-02"], "x").tracker.type).toBe("date");
  });

  it("spots a time", () => {
    expect(inferTracker("started", ["07:30"], "x").tracker.type).toBe("time");
  });

  it("turns a small set of words into a dropdown", () => {
    const { tracker } = inferTracker("method", ["fried", "baked", "fried"], "x");
    expect(tracker.type).toBe("select");
    expect(tracker.options).toContain("fried=Fried");
    expect(tracker.options).toContain("baked=Baked");
  });

  it("falls back to a 1-5 number when nothing has been logged yet", () => {
    const { tracker, guess } = inferTracker("rating", [], "x");
    expect(tracker.type).toBe("number");
    expect(tracker.min).toBe(1);
    expect(tracker.max).toBe(5);
    expect(guess).toContain("no readings");
  });

  it("scopes what it builds to the journal that lost it", () => {
    expect(inferTracker("difficulty", ["3"], "cooking").tracker.surface).toEqual(
      { kind: "journal", typeId: "cooking" }
    );
  });

  it("never seeds a journal tracker onto templates or Diary.base", () => {
    const { tracker } = inferTracker("difficulty", ["3"], "cooking");
    expect(tracker.showInTemplate).toBe(false);
    expect(tracker.showInBase).toBe(false);
  });
});

describe("values a dropdown grammar can't hold", () => {
  // Options are one comma-separated `value=Label` string (widgets.ts::
  // buildSelect), and the grammar has no escape — so a reading containing a
  // separator can't be offered as a dropdown at all.
  it("refuses a set containing a comma", () => {
    const { tracker } = inferTracker("style", ["Pasta, fresh", "Baked"], "x");
    expect(tracker.type).toBe("number");
    expect(tracker.options).toBeUndefined();
  });

  it("refuses a set containing an equals sign", () => {
    expect(inferTracker("style", ["a=b", "c"], "x").tracker.type).toBe("number");
  });

  it("still allows repeats of safe values", () => {
    // The guard is about separators, not uniqueness — an earlier cut of it
    // demanded every reading be distinct and quietly refused every real set.
    const { tracker } = inferTracker("method", ["fried", "baked", "fried"], "x");
    expect(tracker.type).toBe("select");
  });
});
