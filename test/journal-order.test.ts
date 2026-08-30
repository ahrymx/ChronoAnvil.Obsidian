// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Reordering the journals. 4.40.
//
// TWO GESTURES, ONE WRITE, and that is what most of this file is about. The
// homepage's cards are dragged and the Journals page's list is reordered from a
// window; if those ever become two implementations they will drift, in the way
// `journal-actions.ts` is on record as having drifted. So the behaviour is
// asserted once against `journal-order.ts`, and each surface is asserted only to
// REACH it.

import { describe, expect, it, vi } from "vitest";
import {
  applyJournalOrder,
  journalOrder,
  moveJournalOnto,
} from "../src/journals/journal-order";
import { cssRule, readCode, readSrc } from "./sources";
import type ChronoAnvilPlugin from "../src/main";

// The three things the write touches, and nothing else — which is itself worth
// noticing: reordering journals reads no file, so a stub with no vault in it is
// not a shortcut, it is the whole surface.
const stub = (ids: string[]) => {
  const saveSettings = vi.fn(async () => {});
  const notifyJournalTypesChanged = vi.fn();
  const plugin = {
    settings: { customJournals: ids.map((id) => ({ id, name: id.toUpperCase() })) },
    saveSettings,
    notifyJournalTypesChanged,
  } as unknown as ChronoAnvilPlugin;
  return { plugin, saveSettings, notifyJournalTypesChanged };
};

describe("the order journals are drawn in", () => {
  it("is the settings array, with no field of its own", () => {
    const { plugin } = stub(["study", "projects", "media"]);
    expect(journalOrder(plugin)).toEqual(["study", "projects", "media"]);
  });

  it("moves a journal to a slot rather than swapping it with what is there", async () => {
    // LIFT-AND-INSERT IS THE WHOLE SEMANTIC. Dragging Media onto Study should
    // put Media first and push the other three down — a swap would put Media
    // first and STUDY third, which is a move the reader did not ask for and
    // cannot see themselves having made.
    const { plugin } = stub(["study", "projects", "exercise", "media"]);
    expect(await moveJournalOnto(plugin, "media", "study")).toBe(true);
    expect(journalOrder(plugin)).toEqual([
      "media",
      "study",
      "projects",
      "exercise",
    ]);
  });

  it("lands a downward move where it was dropped, on the far side of the target", async () => {
    // WHAT THIS TEST ASSERTED UNTIL 4.45.1, AND WHAT ITS OWN COMMENT SAID, WERE
    // DIFFERENT THINGS. The comment: "dropping Study onto Media means Study goes
    // where Media is". The assertion underneath it put Study at index 2 and left
    // Media at 3 — one place short, every time, in that direction. A comment is
    // not a test, which is this suite's own rule read back to it.
    const { plugin } = stub(["study", "projects", "exercise", "media"]);
    await moveJournalOnto(plugin, "study", "media");
    expect(journalOrder(plugin)).toEqual([
      "projects",
      "exercise",
      "media",
      "study",
    ]);
  });

  it("swaps a card with its neighbour, the drop that used to do nothing at all", async () => {
    // Lift Study out, put it back before the card that has just moved up into
    // its place, and the list is exactly the list you started with. So the
    // commonest drag on the grid wrote nothing and looked broken.
    const { plugin, saveSettings } = stub(["study", "projects", "media"]);
    expect(await moveJournalOnto(plugin, "study", "projects")).toBe(true);
    expect(journalOrder(plugin)).toEqual(["projects", "study", "media"]);
    expect(saveSettings).toHaveBeenCalled();
  });

  it("treats a drop on itself as a reader changing their mind", async () => {
    const { plugin, saveSettings, notifyJournalTypesChanged } = stub([
      "study",
      "projects",
    ]);
    expect(await moveJournalOnto(plugin, "study", "study")).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(notifyJournalTypesChanged).not.toHaveBeenCalled();
  });

  it("declines a move naming a journal that is not there", async () => {
    const { plugin, saveSettings } = stub(["study", "projects"]);
    expect(await moveJournalOnto(plugin, "study", "ghost")).toBe(false);
    expect(await moveJournalOnto(plugin, "ghost", "study")).toBe(false);
    expect(journalOrder(plugin)).toEqual(["study", "projects"]);
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("saving a whole order", () => {
  it("saves and repaints, in that order", async () => {
    // THE REPAINT IS NOT OPTIONAL AND IS EASY TO FORGET. Reordering touches no
    // file in the vault, so nothing a journals widget watches has changed — the
    // grid would keep drawing the old order until the note was reopened. This is
    // the same signal `buildJournalCardsRegion` registers for when a journal is
    // added or Study is turned off.
    const { plugin, saveSettings, notifyJournalTypesChanged } = stub([
      "a",
      "b",
      "c",
    ]);
    expect(await applyJournalOrder(plugin, ["c", "b", "a"])).toBe(true);
    expect(journalOrder(plugin)).toEqual(["c", "b", "a"]);
    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(notifyJournalTypesChanged).toHaveBeenCalledTimes(1);
  });

  it("stays silent when the order it is given is the order already there", async () => {
    // A reader who opened the window, looked, and pressed Save. `saveSettings`
    // is content-compared downstream, but the REPAINT is not — notifying here
    // would rebuild every journals widget on every open note to draw the same
    // thing.
    const { plugin, saveSettings, notifyJournalTypesChanged } = stub(["a", "b"]);
    expect(await applyJournalOrder(plugin, ["a", "b"])).toBe(false);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(notifyJournalTypesChanged).not.toHaveBeenCalled();
  });

  it("keeps a journal the list never mentions, at the end", async () => {
    // THE WINDOW IS A WISH ABOUT ORDER, NOT A CLAIM ABOUT MEMBERSHIP. It can sit
    // open while the settings tab adds a journal, and losing four deliberate
    // moves to one unrelated change would be the wrong trade — as would silently
    // DELETING the new journal because the window had never heard of it.
    const { plugin } = stub(["a", "b", "c"]);
    await applyJournalOrder(plugin, ["c", "a"]);
    expect(journalOrder(plugin)).toEqual(["c", "a", "b"]);
  });

  it("drops an id whose journal has gone, and never produces one twice", async () => {
    const { plugin } = stub(["a", "b"]);
    await applyJournalOrder(plugin, ["b", "ghost", "a", "b"]);
    expect(journalOrder(plugin)).toEqual(["b", "a"]);
  });

  it("keeps the config objects themselves, rather than rebuilding them", async () => {
    // A REORDER MUST NOT BE A REWRITE. Every journal's kinds, levels, trackers
    // and saved layouts hang off these objects; a permutation that mapped them
    // through anything would be one careless spread away from dropping a field
    // that only some journals have.
    const { plugin } = stub(["a", "b"]);
    const before = [...(plugin.settings.customJournals ?? [])];
    await applyJournalOrder(plugin, ["b", "a"]);
    expect(plugin.settings.customJournals[0]).toBe(before[1]);
    expect(plugin.settings.customJournals[1]).toBe(before[0]);
  });
});

describe("the two surfaces reach that one write", () => {
  it("drags on the homepage's cards", () => {
    const src = readCode("journals-cards");
    expect(src).toContain('import { moveJournalOnto } from "./journal-order"');
    expect(src).toContain("attachCardDrag(plugin, card, type.id)");
    expect(src).toContain("card.draggable = true");
    expect(src).toContain("void moveJournalOnto(plugin, from, id)");
  });

  it("carries the dragged id in the payload rather than in a module variable", () => {
    // THE GRID REBUILDS DURING THE GESTURE — that is what the drop causes — so a
    // "currently dragging" variable would be read by handlers belonging to cards
    // that no longer exist. `dataTransfer` is owned by the drag and dies with it.
    const src = readCode("journals-cards");
    expect(src).toContain("e.dataTransfer?.setData(JOURNAL_DRAG_TYPE, id)");
    expect(src).toContain("e.dataTransfer?.getData(JOURNAL_DRAG_TYPE)");
    expect(src).not.toMatch(/^let dragging/m);
  });

  it("lights up for a journal card and for nothing else dragged over it", () => {
    // A note dragged from the file explorer fires `dragover` on whatever is
    // under the pointer. A grid that took the drop would be promising a move it
    // has no way to make.
    const src = readCode("journals-cards");
    expect(src).toContain(
      "if (!e.dataTransfer?.types.includes(JOURNAL_DRAG_TYPE)) return"
    );
    // Lowercase, because the drag-and-drop spec lowercases every type it stores
    // and a mixed-case constant would never match what `types` reports back.
    const type = /JOURNAL_DRAG_TYPE = "([^"]+)"/.exec(src)?.[1];
    expect(type).toBeTruthy();
    expect(type).toBe(type?.toLowerCase());
  });

  it("puts a button on the Journals header bar, ahead of Refresh", () => {
    // AHEAD OF IT, AND NOT BY HABIT: Refresh re-reads what is there and this
    // changes it. The band runs left to right.
    const src = readCode("journals-section");
    const at = src.indexOf('label: "Reorganise"');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(src.indexOf('label: "Refresh"'));
    expect(src).toContain("onClick: () => openReorganiseJournals(plugin)");
  });

  it("does not put both affordances on either surface", () => {
    // 4.8.1's ARGUMENT, WHICH THIS HAD TO ANSWER: a drag and a dialog doing one
    // job on one surface means "every block on every page carrying a permanent
    // invitation to the weaker one". Two surfaces, one affordance each.
    expect(readCode("journals-cards")).not.toContain("openReorganiseJournals");
    expect(readCode("journals-section")).not.toContain("draggable");
  });
});

describe("the journal's name is the way into it (4.42)", () => {
  it("renders the title as a link to the journal's folder note", () => {
    // The head named the journal and went nowhere, while every card BELOW it has
    // linked to its own folder note since 4.13.3 — so the page's shallowest
    // object was the only one you could not enter.
    const src = readCode("journals-section");
    expect(src).toMatch(
      /titleRender: root\s*\?\s*\(slot\) =>\s*folderLink\(plugin, slot, root, ctx\.sourcePath, "ca-jjs-type-name", type\.name\)/
    );
    // NO LINK WHERE THERE IS NO FOLDER — `getFolder` returns null for a preset
    // enabled and never used, and `undefined` leaves the title plain text.
    expect(src).toContain(": undefined");
  });

  it("says the journal's NAME, not its folder's", () => {
    // A container is named by its folder; a JOURNAL has a display name in
    // settings — "Exercise & Diet" — over a folder that may be called something
    // else. Without the override the title would rename itself the moment it
    // became a link, which is worse than the bug being fixed.
    const tables = readCode("tables");
    expect(tables).toContain("const label = text ?? folder.name;");
    expect(tables).toContain("internalLink(parent, plugin.app, file, label, sourcePath)");
    expect(tables).toContain('parent.createSpan({ cls: `${cls} is-orphan`, text: label })');
  });

  it("reuses the helper that stops the click from folding the section", () => {
    // THE WHOLE REASON TO SHARE IT. `folderLink` stops propagation as well as
    // preventing the default, because a card's head is a fold target — "a click
    // that opened the subject and ALSO folded its journal would do two things
    // for one press". A link written inline here would be missing that line.
    const tables = readCode("tables");
    const fn = tables.slice(
      tables.indexOf("export function folderLink("),
      tables.indexOf("export function childRow(")
    );
    expect(fn).toContain("evt.stopPropagation()");
    expect(readCode("journals-section")).not.toContain('createEl("a"');
  });

  it("looks like a title at rest and a link on hover", () => {
    // `color: inherit` IS THE LOAD-BEARING LINE. Without it Obsidian's
    // `.internal-link` paints `--text-accent` — which is exactly what happened
    // one rank down: chem and Maths measured #a68af9 on
    // `20260818_20h59m08s_grim.png`, the theme's link ink winning because
    // `.ca-jjs-group-name`'s own declaration was invalid.
    const name = cssRule(".ca-jjs-type-name");
    expect(name).toContain("color: inherit");
    expect(name).toContain("text-decoration: none");
    // The pointer is the resting affordance; the underline arrives on hover.
    expect(name).toContain("cursor: pointer");
    expect(cssRule("a.ca-jjs-type-name:hover")).toContain("text-decoration: underline");
  });
});

describe("the reorganise window", () => {
  it("plans rather than writes, and only the CTA writes", () => {
    const src = readCode("reorganise-journals");
    // The working order is a copy taken when the window opened, which is what
    // makes Cancel free — nothing outside this array has been touched.
    expect(src).toContain("private ids: string[]");
    expect(src).toContain("this.ids = types.map((t) => t.id)");
    // ONE CALL TO THE WRITE, AND IT IS SAVE'S. An arrow that wrote as it moved
    // would repaint the page under a reader mid-plan and leave no way back.
    expect(src.match(/applyJournalOrder\(/g)?.length).toBe(1);
    expect(src).toContain("await applyJournalOrder(this.plugin, this.ids)");
    expect(src).toContain('import { applyJournalOrder } from "./journal-order"');
  });

  it("reorders with arrows and not with a drag", () => {
    // THE READER'S CALL, VERBATIM: *"Drag is for cards only."* The section
    // editor pairs both and argues each is right; what is dropped here is the
    // half the OTHER surface already has, not the half a keyboard can reach.
    const src = readCode("reorganise-journals");
    expect(src).toContain('nudge(-1, "Move up", "chevron-up")');
    expect(src).toContain('nudge(1, "Move down", "chevron-down")');
    expect(src).not.toContain("draggable");
    expect(src).not.toContain("dragstart");
  });

  it("disables an arrow at the end of the list rather than withholding it", () => {
    const src = readCode("reorganise-journals");
    expect(src).toContain(
      "b.disabled = at + delta < 0 || at + delta >= this.ids.length"
    );
  });

  it("says what it does not do, before the reader moves anything", () => {
    // Reordering a list that also names folders invites "does this move my
    // notes?", and the answer belongs on the window rather than in a changelog.
    expect(readSrc("reorganise-journals")).toContain("Nothing moves on disk");
  });

  it("refuses to open on a list that has no order", () => {
    const src = readCode("reorganise-journals");
    expect(src).toContain("registeredJournalTypes(plugin).length < 2");
  });
});

describe("what a card looks like while it is being carried", () => {
  it("fades the card in hand and edges the one that would receive it", () => {
    // TWO SIGNALS FOR TWO ROLES. One treatment on both would make a grid
    // mid-drag read as two selected cards.
    expect(cssRule(".ca-jjc-card.is-dragging")).toContain("opacity: 0.45");
    const target = cssRule(".ca-jjc-card.is-drop-target");
    expect(target).toContain("inset 0 0 0 2px var(--interactive-accent)");
    // INSET, BECAUSE THE CARD CLIPS. `.ca-jjc-card` is `overflow: hidden` with a
    // 1px border; a second border inside it would move the banner by a pixel as
    // it appeared.
    expect(target).not.toMatch(/^\s*border:/m);
  });

  it("says the card is liftable before it is lifted", () => {
    expect(cssRule('.ca-jjc-card[draggable="true"]')).toContain("cursor: grab");
  });
});
