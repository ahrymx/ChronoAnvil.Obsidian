// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  addTag,
  hasTag,
  normaliseTag,
  readTags,
  removeTag,
  renameTag,
  tagsValue,
  TAGS_PROPERTY,
} from "../src/trackers/tags";
import {
  anySurface,
  diarySurface,
  diaryClassOf,
  diaryClassesOf,
  describeSurfaceLabel,
  isJournalSurface,
  journalSurface,
  normalizeTrackers,
  surfaceAcceptsType,
  surfaceAdmits,
  surfaceKey,
} from "../src/trackers/trackers";
import { readSrc } from "./sources";
import { fitTagChips } from "../src/ui/widgets/tracker-controls";

const tagsDef = () =>
  normalizeTrackers([], false).find((t) => t.builtin === "tags");

// ── what a tag is ─────────────────────────────────────────────────────────

describe("normaliseTag", () => {
  it("takes what a reader types out of a note", () => {
    // They are copying `#reading` off the page, so the hash comes with it.
    expect(normaliseTag("#reading")).toBe("reading");
    expect(normaliseTag("  #reading  ")).toBe("reading");
  });

  it("converts spaces rather than refusing them", () => {
    // The thing a reader will type is English. A dialogue that rejects "deep
    // work" without saying what it wanted is worse than one that shows what it
    // is about to write.
    expect(normaliseTag("deep work")).toBe("deep-work");
    expect(normaliseTag("deep   work")).toBe("deep-work");
  });

  it("keeps nesting, and keeps case", () => {
    // Obsidian nests on `/` and matches case-insensitively while preserving
    // what you wrote. Folding case here would silently rewrite the reader's
    // spelling on every save.
    expect(normaliseTag("year/2026")).toBe("year/2026");
    expect(normaliseTag("Reading")).toBe("Reading");
  });

  it("refuses what Obsidian's parser would not claim", () => {
    // An all-numeric tag is a number in running text; the parser skips it, so
    // writing one would produce a frontmatter entry the tag pane never shows.
    expect(normaliseTag("2026")).toBeNull();
    expect(normaliseTag("#2026")).toBeNull();
    // Punctuation Obsidian does not allow in a tag.
    expect(normaliseTag("read:ing")).toBeNull();
    expect(normaliseTag("what?")).toBeNull();
    expect(normaliseTag("")).toBeNull();
    expect(normaliseTag("#")).toBeNull();
  });
});

// ── what a note carries ───────────────────────────────────────────────────

describe("readTags", () => {
  it("reads the list Obsidian writes", () => {
    expect(readTags(["reading", "deep-work"])).toEqual(["reading", "deep-work"]);
  });

  it("reads a hand-written string, and a comma-separated one", () => {
    // Both are valid YAML for this property and both are what that note MEANS.
    // Only the list is ever written back.
    expect(readTags("reading")).toEqual(["reading"]);
    expect(readTags("reading, deep work")).toEqual(["reading", "deep-work"]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(readTags(["Reading", "reading"])).toEqual(["Reading"]);
  });

  it("drops what it cannot parse from the MODEL, not from the note", () => {
    // Nothing in this module writes. A tag the reader hand-wrote that this
    // cannot read simply is not offered for editing — it is not deleted,
    // because deletion only ever happens through a draft the reader saved.
    expect(readTags(["reading", "2026", 7, null])).toEqual(["reading"]);
    expect(readTags(undefined)).toEqual([]);
    expect(readTags({})).toEqual([]);
  });
});

// ── the three edits ───────────────────────────────────────────────────────

describe("the edits are pure and idempotent", () => {
  it("adds once", () => {
    expect(addTag(["a"], "b")).toEqual(["a", "b"]);
    expect(addTag(["a"], "a")).toEqual(["a"]);
    expect(addTag(["a"], "A")).toEqual(["a"]);
    expect(addTag(["a"], "#b")).toEqual(["a", "b"]);
  });

  it("refuses to add what is not a tag, without disturbing the list", () => {
    expect(addTag(["a"], "??")).toEqual(["a"]);
  });

  it("removes case-insensitively, and removing an absent tag is a no-op", () => {
    expect(removeTag(["a", "b"], "A")).toEqual(["b"]);
    expect(removeTag(["a"], "z")).toEqual(["a"]);
  });

  it("renames in place, keeping the tag's position", () => {
    // A rename is not a removal followed by an addition. If it were, fixing a
    // typo would reshuffle the note's list every time.
    expect(renameTag(["a", "b", "c"], "b", "beta")).toEqual(["a", "beta", "c"]);
  });

  it("merges when renaming onto a tag the note already has", () => {
    expect(renameTag(["a", "b"], "a", "b")).toEqual(["b"]);
    expect(renameTag(["a", "b", "c"], "c", "a")).toEqual(["a", "b"]);
  });

  it("leaves the list alone when the new name is unusable", () => {
    // The dialogue keeps the old tag rather than dropping it: silently
    // deleting a tag somebody meant to keep is the failure worth avoiding.
    expect(renameTag(["a", "b"], "a", "??")).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const before = ["a", "b"];
    addTag(before, "c");
    removeTag(before, "a");
    renameTag(before, "a", "z");
    expect(before).toEqual(["a", "b"]);
  });

  it("answers membership the way Obsidian matches", () => {
    expect(hasTag(["Reading"], "reading")).toBe(true);
    expect(hasTag(["Reading"], "read")).toBe(false);
  });
});

describe("what gets written back", () => {
  it("deletes the key rather than writing an empty list", () => {
    // `tags: []` is YAML noise Obsidian's property editor then offers to fill
    // in forever. A note that had no tags, gained one and lost it again should
    // read exactly as it did before anyone opened the window.
    expect(tagsValue([])).toBeNull();
    expect(tagsValue(["a"])).toEqual(["a"]);
  });

  it("writes Obsidian's own property, not one of ours", () => {
    // The whole point of the tracker: the tag pane, `tag:` search and this
    // plugin's own `tag-index` all key off the property Obsidian defines.
    expect(TAGS_PROPERTY).toBe("tags");
    expect(tagsDef()?.id).toBe("tags");
  });
});

// ── the global surface ────────────────────────────────────────────────────

describe("a third surface kind", () => {
  it("admits every note, of every grain and every journal type", () => {
    for (const note of [
      diarySurface("daily"),
      diarySurface("yearly"),
      journalSurface("study"),
      journalSurface("cooking"),
    ]) {
      expect(surfaceAdmits(anySurface(), note)).toBe(true);
    }
    expect(surfaceAcceptsType(anySurface(), "anything")).toBe(true);
  });

  it("is not a wildcard on both sides", () => {
    // A NOTE is never `any` — `surfaceOf` resolves one concrete grain or one
    // type — so this asymmetry is the guard that stops a daily tracker being
    // admitted to everything by an accidental `any` on the other side.
    expect(surfaceAdmits(diarySurface("daily"), anySurface())).toBe(false);
  });

  it("answers the questions it has no answer to with nothing", () => {
    // It measures no period, so it has no class and is not a journal surface.
    // These are the same empty answers the model already gives for the
    // surfaces that cannot answer them, which is what let the third kind land
    // without a branch in every caller.
    expect(diaryClassesOf(anySurface())).toEqual([]);
    expect(diaryClassOf(anySurface())).toBeNull();
    expect(isJournalSurface(anySurface())).toBe(false);
  });

  it("has its own key and its own label", () => {
    expect(surfaceKey(anySurface())).toBe("any");
    expect(surfaceKey(anySurface())).not.toBe(surfaceKey(diarySurface("daily")));
    expect(describeSurfaceLabel(anySurface())).toBe("Any note");
  });

  it("survives a round trip through normalisation", () => {
    // A built-in's surface is re-asserted from its template on every load, so
    // a `data.json` that was hand-edited to move Tags onto Tuesdays is
    // corrected rather than carried forward.
    const moved = normalizeTrackers(
      [{ id: "tags", label: "Tags", type: "tags", builtin: "tags", surface: diarySurface("daily"), showInTemplate: true, showInBase: true }],
      false
    ).find((t) => t.builtin === "tags");
    expect(moved?.surface).toEqual(anySurface());
  });
});

// ── the built-in ──────────────────────────────────────────────────────────

describe("the Tags built-in", () => {
  it("exists in a fresh vault without being seeded per anything", () => {
    expect(tagsDef()).toBeDefined();
    expect(tagsDef()?.type).toBe("tags");
  });

  it("is global and never automatic", () => {
    // The ask, in one assertion: on every note, on no template, in no column.
    expect(tagsDef()?.surface).toEqual(anySurface());
    expect(tagsDef()?.showInTemplate).toBe(false);
    expect(tagsDef()?.showInBase).toBe(false);
  });

  it("stays off the template and out of the base however data.json arrives", () => {
    const forced = normalizeTrackers(
      [{ id: "tags", label: "Tags", type: "tags", builtin: "tags", surface: anySurface(), showInTemplate: true, showInBase: true }],
      true
    ).find((t) => t.builtin === "tags");
    expect(forced?.showInTemplate).toBe(false);
    expect(forced?.showInBase).toBe(false);
  });

  it("cannot be created by hand in the tracker editor", () => {
    // A second tracker writing a list into `tags` would be two windows editing
    // one property with no way to say which won — the reason `derived` is not
    // creatable either.
    const src = readSrc("settings-editors");
    const at = src.indexOf("export const CREATABLE_TRACKER_TYPES");
    const list = src.slice(at, src.indexOf("];", at));
    expect(list).not.toContain('"tags"');
    expect(src).toContain("for (const value of CREATABLE_TRACKER_TYPES)");
  });

  it("draws no label of its own, because the wrapper draws one", () => {
    // FOUND ON A WEEKLY ENTRY, not in review: the cell read TAGS over "Tags"
    // over a control. `tracker` is not in `SELF_LABELLED_KINDS`, so the
    // dispatcher wraps every tracker widget in `journal-widget-labeled` and
    // puts the eyebrow above it — the comment beside that list warns about
    // exactly this and the first cut of this control did it anyway. Same rule
    // 3.13 §10.2 wrote down for the palette and the ribbon: the group is named
    // once per surface.
    const src = readSrc("tracker-controls");
    const at = src.indexOf("function buildTagsField");
    const body = src.slice(at, src.indexOf("\nexport function buildTracker", at));
    expect(body).not.toContain("journal-tracker-label");
    expect(body).not.toContain("def.label,");
    expect(readSrc("index")).not.toContain('SELF_LABELLED_KINDS = new Set([\n  "tracker"');
  });

  it("is one control in both states, not a readout beside a button", () => {
    // The empty state was two of the cell's three lines saying "None yet" over
    // a full-width Manage button — mostly chrome for the case with nothing to
    // show. A tracker cell with no reading draws its affordance and nothing
    // else, and one with a reading makes the reading itself the target.
    const src = readSrc("tracker-controls");
    const at = src.indexOf("function buildTagsField");
    const body = src.slice(at, src.indexOf("\nexport function buildTracker", at));
    expect(body).not.toContain("None yet");
    expect(body).toContain("Add tags");
    expect(body).toContain('cls: "ca-journal-tags-chips"');
  });

  it("draws a list cell rather than one of the value controls", () => {
    const src = readSrc("tracker-controls");
    expect(src).toContain('case "tags":');
    expect(src).toContain("buildTagsField(deps, def, ctx)");
  });

  it("paints from what it wrote, not from the cache it just raced", () => {
    // REPORTED ON A DAILY ENTRY: adding the first tag left the cell still
    // offering to add one, and adding a second showed the first — exactly one
    // behind. `processFrontMatter` resolves when the file is saved and
    // Obsidian updates its cache on a separate, slightly-delayed pass, so
    // reading the property straight back returns the value from before the
    // write. Every other control in this file keeps a local `known` for that
    // reason and says so in a comment; this one did not.
    const src = readSrc("tracker-controls");
    const at = src.indexOf("function buildTagsField");
    const body = src.slice(at, src.indexOf("\nexport function buildTracker", at));
    expect(body).toContain("let known: string[] | null = null;");
    expect(body).toContain("known = readTags(next);");
    // One reader of the cache, inside `read()`, where the null case documents
    // that the property panel is the authority until this cell has written.
    expect(body.match(/deps\.currentValue\(/g) ?? []).toHaveLength(1);
  });

  it("writes through processFrontMatter rather than widening `write`", () => {
    // `WidgetHost.write` takes `string | number | null`, which is the right
    // contract for a value and cannot express a list. Widening it for one
    // caller would put an array in the signature of every control that will
    // never write one.
    const src = readSrc("controls");
    expect(src).toContain("value: string | number | null");
    expect(readSrc("tracker-controls")).toContain(
      "processFrontMatter(file, (fm)"
    );
  });
});


// ── HOW MANY CHIPS FIT (1.0.46) ────────────────────────────────────────
//
// `const maxVisibleTags = 5` decided this until 1.0.46, and a count is the one
// thing the answer does not depend on. Reported from a daily entry: six short
// tags drew four on the first row and `+2` alone on the second, with room for
// both of them beside it.
//
// THE SUITE HAS NO LAYOUT, so the rows are modelled rather than measured: a
// box of a fixed width, elements of known widths packed into it in order, and
// `offsetTop` derived from where the packing puts each one. That is the only
// thing `fitTagChips` reads, so the model exercises the real decision — which
// is which chips to hide and what the count says — without asserting anything
// about how a browser wraps.
describe("the tags cell fills the rows it has", () => {
  const BOX = 100;
  const ROW = 20;
  // The tallest thing on a line, which is what the others are centred against:
  // a chip, at about 17px. The pencil is `0.8em` and therefore shorter — the
  // fact the first cut of the fitter tripped over, so the model has to carry
  // it or the test cannot see the bug.
  const CHIP_H = 17;
  const PENCIL_H = 10;

  class Fake {
    display = "";
    readonly style = {
      set display(v: string) {
        /* set through the proxy below */
      },
    };
    constructor(
      readonly width: number,
      readonly box: Fake[],
      readonly offsetHeight = CHIP_H,
      public text = ""
    ) {}
    setText(t: string): void {
      this.text = t;
    }
    // `align-items: center`, modelled: a line is CHIP_H tall and every item on
    // it is centred in that, so a short item reports a LARGER `offsetTop` than
    // the chips beside it while sharing their centre.
    get offsetTop(): number {
      let x = 0;
      let row = 0;
      for (const el of this.box) {
        if (el.display === "none") continue;
        if (x > 0 && x + el.width > BOX) {
          row += 1;
          x = 0;
        }
        if (el === this) return row * ROW + (CHIP_H - el.offsetHeight) / 2;
        x += el.width;
      }
      return row * ROW + (CHIP_H - this.offsetHeight) / 2;
    }
  }

  // `style` with the two operations the fitter uses, over the flat `display`.
  const el = (width: number, box: Fake[], height = CHIP_H): HTMLElement => {
    const f = new Fake(width, box, height);
    box.push(f);
    return new Proxy(f, {
      get(t, k) {
        if (k === "style") {
          return {
            set display(v: string) {
              t.display = v;
            },
            get display() {
              return t.display;
            },
            removeProperty: () => {
              t.display = "";
            },
          };
        }
        return Reflect.get(t, k);
      },
      set(t, k, v) {
        return Reflect.set(t, k, v);
      },
    }) as unknown as HTMLElement;
  };

  const shownOf = (chips: HTMLElement[]) =>
    chips.filter((c) => (c as unknown as Fake).display !== "none").length;

  function build(widths: number[]) {
    const box: Fake[] = [];
    const chipEls = widths.map((w) => el(w, box));
    const more = el(20, box);
    const pencil = el(10, box, PENCIL_H);
    const host = { isConnected: true } as unknown as HTMLElement;
    return { box, chipEls, more, pencil, host };
  }

  it("shows every tag when they all land inside the cell", () => {
    // Four 25px chips: two rows of two, and the pencil on the second.
    const { host, chipEls, more, pencil } = build([25, 25, 25, 25]);
    fitTagChips(host, chipEls, more, pencil);
    expect(shownOf(chipEls)).toBe(4);
    expect((more as unknown as Fake).display).toBe("none");
  });

  it("fills the second row before it starts counting", () => {
    // THE REPORTED CASE, in the model's terms: the old cap stopped at four
    // whatever the cell could hold, so a second row with room for two more sat
    // holding `+2` alone. Six 25px chips all fit here and none is counted.
    const six = build([25, 25, 25, 25, 25, 25]);
    fitTagChips(six.host, six.chipEls, six.more, six.pencil);
    expect(shownOf(six.chipEls)).toBe(6);
    expect((six.more as unknown as Fake).display).toBe("none");

    // And where they genuinely do not all fit, more than four still show.
    const ten = build(Array(10).fill(25));
    fitTagChips(ten.host, ten.chipEls, ten.more, ten.pencil);
    const shown = shownOf(ten.chipEls);
    expect(shown).toBeGreaterThan(4);
    expect((ten.more as unknown as Fake).text).toBe(`+${10 - shown}`);
  });

  it("counts every tag it hid, not every tag past a fixed number", () => {
    const { host, chipEls, more, pencil } = build(Array(20).fill(25));
    fitTagChips(host, chipEls, more, pencil);
    const shown = shownOf(chipEls);
    expect((more as unknown as Fake).text).toBe(`+${20 - shown}`);
    expect(shown).toBeGreaterThan(0);
  });

  it("gives back a chip so the count and the pencil have somewhere to land", () => {
    // The `+N` is a chip like the others and the pencil trails it, so both are
    // measured with the rest — under the old cap they were not, and the rows
    // are now filled to the edge.
    const { host, chipEls, more, pencil } = build(Array(8).fill(25));
    fitTagChips(host, chipEls, more, pencil);
    const visible = [
      ...chipEls.filter((c) => (c as unknown as Fake).display !== "none"),
      more,
      pencil,
    ];
    // BY THE CENTRE, which is what a line is under `align-items: center`. The
    // first cut of the fitter counted `offsetTop`, and the pencil — shorter
    // than a chip and therefore centred lower on the same line — read as a row
    // of its own every time. Two real rows measured as three, so the loop kept
    // giving chips back until one row was left: the vault showed three tags
    // and `+3` on a cell with room for two rows of four.
    const mid = (v: HTMLElement) => {
      const f = v as unknown as Fake;
      return f.offsetTop + f.offsetHeight / 2;
    };
    const rows = new Set(visible.map(mid));
    expect(rows.size).toBeLessThanOrEqual(2);
    // And the pencil shares a line with chips rather than owning one.
    expect(new Set(visible.map((v) => (v as unknown as Fake).offsetTop)).size)
      .toBeGreaterThan(rows.size);
  });

  it("keeps both rows when the pencil sits on the second (1.0.46)", () => {
    // THE REGRESSION THE FIRST CUT SHIPPED. Eight 25px chips in a 100px box is
    // four to a row, so seven chips and a `+1` is what fits. Counting
    // `offsetTop` instead of centres gave the pencil a row of its own, the
    // fitter saw three rows where there were two, and it gave chips back until
    // only one row was left — three tags and `+3` in a cell with room for
    // eight.
    const { host, chipEls, more, pencil } = build(Array(8).fill(25));
    fitTagChips(host, chipEls, more, pencil);
    expect(shownOf(chipEls)).toBeGreaterThan(4);
  });

  it("re-measures from everything shown, so a widened cell gets its tags back", () => {
    // The pass that measures its own previous answer keeps hiding chips that
    // now fit. Running the fitter twice on the same arrangement must not shrink
    // it further.
    const { host, chipEls, more, pencil } = build(Array(8).fill(25));
    fitTagChips(host, chipEls, more, pencil);
    const once = shownOf(chipEls);
    fitTagChips(host, chipEls, more, pencil);
    expect(shownOf(chipEls)).toBe(once);
  });

  it("stops at none rather than spinning on a cell nothing fits in", () => {
    const { host, chipEls, more, pencil } = build([95, 95, 95]);
    fitTagChips(host, chipEls, more, pencil);
    expect((more as unknown as Fake).text).toMatch(/^\+\d+$/);
  });

  it("does nothing at all before the cell is in the document", () => {
    const { chipEls, more, pencil } = build(Array(8).fill(25));
    const host = { isConnected: false } as unknown as HTMLElement;
    fitTagChips(host, chipEls, more, pencil);
    expect(shownOf(chipEls)).toBe(8);
  });

  it("asks the layout rather than a number, and disposes of its observer", () => {
    const src = readSrc("tracker-controls");
    // CODE ONLY. The comment beside the fitter names the constant it replaced,
    // which is the record of the decision rather than a use of it — the
    // distinction `vocabulary.test.ts` draws.
    const code = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toContain("maxVisibleTags");
    expect(src).toContain("new ResizeObserver(fit)");
    expect(src).toContain("watch?.disconnect();");
    expect(src).toContain("class TagsFit extends MarkdownRenderChild");
  });
});
