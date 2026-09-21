// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patches 3, 4 and 5 of the 3.0 plan: the editor, on all three surfaces.
//
// The modal itself is DOM and Obsidian's Modal base, which the stub does not
// render. What IS testable is every decision it makes before touching the
// screen — which rows can be moved where, what the footer counts, what Save
// writes, and what it refuses to write — and those are the parts that can lose
// somebody's file.
//
// Each test corresponds to a line in the editor rather than to a function in
// it: the editor is thin over the section models by design, and that is what
// makes it checkable without a browser. The test file it replaces made the same
// argument about the same window when the window was the journals'.

import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc, repoFile } from "./sources";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import { sectionContext } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import {
  composeDiaryDashboard,
  diarySectionModel,
} from "../src/diary/diary-sections";
import {
  composeEntryTemplate,
  entrySectionModel,
} from "../src/diary/entry-sections";
import {
  composeHomeNote,
  homeSectionModel,
} from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { SECTION_CATEGORIES, categoryRank } from "../src/core/sections";
import { idsOf } from "../src/core/section-model";
import type { SectionModel, SectionWant } from "../src/core/section-model";

const editor = (): string => readSrc("section-editor");

const journal = (): { model: SectionModel; text: string } => ({
  model: journalSectionModel(sectionContext(STUDY_JOURNAL, { depth: 1 })),
  text: journalTemplateFiles(STUDY_JOURNAL).find(
    (f) => f.name === "topic-index.md"
  )!.content,
});
const dashboard = (): { model: SectionModel; text: string } => ({
  model: diarySectionModel({ grain: "monthly" }),
  text: composeDiaryDashboard("monthly"),
});
const entry = (): { model: SectionModel; text: string } => ({
  model: entrySectionModel({ grain: "daily" }),
  text: composeEntryTemplate("daily"),
});

// What the footer counts: adds, removes and moves, never keeps.
const changeCount = (
  { model, text }: { model: SectionModel; text: string },
  want: string[]
): number =>
  model
    .plan(text, want)
    .filter((o) => o.kind === "add" || o.kind === "remove" || o.kind === "move")
    .length;

// ── the footer ────────────────────────────────────────────────────────

describe("what the footer counts", () => {
  it("is zero on a file nobody has touched, on every surface", () => {
    // Save is disabled at zero. An editor whose CTA is live before anything has
    // been asked for invites the one click that has no reason to happen.
    for (const surface of [journal(), dashboard(), entry()]) {
      expect(changeCount(surface, surface.model.present(surface.text))).toBe(0);
    }
  });

  it("counts a move, which it did not have to before 3.0", () => {
    // Swapping the first two rows used to be the case here — they are `links`
    // and `entry-header`, and 3.2 §4 makes that swap a no-op. The counted move
    // is now two sections below the rule, which is where an entry still has
    // any: the footer has to keep counting real moves, or the pin would have
    // deleted the feature rather than restricting one row of it.
    const e = entry();
    const present = e.model.present(e.text);
    const shared = present.filter((id) => id !== "banner" && id !== "trackers");
    const want = [
      ...present.filter((id) => !shared.includes(id)),
      shared[1],
      shared[0],
      ...shared.slice(2),
    ];
    expect(changeCount(e, want)).toBe(1);
  });

  it("counts nothing for a move the pin will not perform", () => {
    // The footer is the promise the reader reads before pressing Save, so it
    // has to go quiet on exactly the changes the write declines. "Save 1
    // change" over a plan that writes nothing is the editor lying in the one
    // place a reader trusts it most — the rule the sibling test below states
    // for a refused removal, holding equally for a refused move.
    const e = entry();
    const present = e.model.present(e.text);
    const want = [present[1], present[0], ...present.slice(2)];
    expect(changeCount(e, want)).toBe(0);
    expect(e.model.apply(e.text, want)).toBeNull();
  });

  it("does not count a removal the model refused", () => {
    // The refusal is shown in the row, so the CTA must not offer to save a
    // change that will not happen. A footer reading "Save 1 change" over a plan
    // that writes nothing is the editor lying in the one place a reader trusts
    // it most.
    const d = dashboard();
    const present = d.model.present(d.text);
    expect(changeCount(d, present.filter((id) => id !== "summary"))).toBe(0);
  });

  it("and the disabled state and the write agree about that", () => {
    const d = dashboard();
    const want = d.model.present(d.text).filter((id) => id !== "links");
    expect(changeCount(d, want)).toBe(0);
    expect(d.model.apply(d.text, want)).toBeNull();
  });
});

describe("the ninth op reaches the window (1.0.23)", () => {
  // `prune` is a write, and a write the footer does not count is Save sitting
  // disabled over a plan with something to do. Read off the source for the same
  // reason the `regroup` pair next door is: the real `changeCount` is a private
  // method on a Modal, and the helper above is a replica of it — a replica
  // cannot answer whether the original was updated.
  const editor = readSrc("section-editor");

  it("is counted, so Save is offered for one", () => {
    const at = editor.indexOf("private changeCount()");
    expect(at).toBeGreaterThan(-1);
    expect(editor.slice(at, at + 500)).toContain('o.kind === "prune"');
  });

  it("has a mark of its own on the change list", () => {
    // Every other op kind draws one, and a row with a blank where the mark goes
    // reads as a keep — which is the row this op exists not to be.
    expect(editor).toContain('op.kind === "prune"');
    expect(editor).toContain('"⊖"');
  });

  it("and the mark is coloured like a removal, because it removes", () => {
    // `extend` borrows add's green; this borrows remove's red. The stylesheet
    // is where that is said, and a class with no rule behind it is a mark that
    // renders in the body colour and says nothing.
    expect(readCss()).toContain(".ca-tpl-op-prune .ca-tpl-op-mark");
  });
});

// ── the rows ──────────────────────────────────────────────────────────

describe("what a row offers", () => {
  it("no remove control where the model refuses", () => {
    // `if (refusal) return;` sits before the toggle is built, so the control
    // does not exist rather than existing and declining.
    const body = editor();
    const at = body.indexOf("if (refusal) return;");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(body.indexOf('cls: "ca-tpl-toggle"'));
    // AND COPY IS THE ONE CONTROL ON THE OTHER SIDE OF THAT LINE (1.0.36).
    // It is not a change — it reads a block and writes to the clipboard — so
    // the reason the rest of the row is absent does not reach it, and the
    // first prose block of every journal leaf is locked and is the block a
    // reader most wants out of the window. Its own class is what keeps the
    // assertion above pointed at Remove.
    expect(body.indexOf('cls: "ca-tpl-copy"')).toBeGreaterThan(0);
    expect(body.indexOf('cls: "ca-tpl-copy"')).toBeLessThan(at);
  });

  it("the reason in place, not on Save", () => {
    // §3: "The refusals are shown in place, not on Save." Discovering a refusal
    // after committing to the change is the failure 2.59.7 fixed on the plan
    // side and it must not come back in the UI.
    expect(editor()).toContain("subtitle: refusal ?? section.blurb");
  });

  it("a reason on every locked section of every surface", () => {
    for (const { model, text } of [journal(), dashboard(), entry()]) {
      for (const s of model.sections()) {
        if (s.removable) continue;
        expect(model.refusal(s.id, text), s.id).toBeTruthy();
      }
    }
  });

  it("arrows, and no drag", () => {
    // 1.0.39. The rows and group bars were still draggable, and a row
    // that lifts under the pointer read as a drag-and-replace feature that was
    // never meant to exist — 4.8.1 had already said a section moves from this
    // window's controls. The arrows are the one way to reorder, and the one a
    // keyboard can reach.
    const body = readCode("section-editor");
    for (const gone of [
      "draggable",
      '"dragstart"',
      '"dragover"',
      '"drop"',
      "dataTransfer",
      "panDuringDrag",
      "dropCell(",
      "dropBlock(",
    ]) {
      expect(body, gone).not.toContain(gone);
    }
    expect(body).toContain('setIcon(b, icon)');
    expect(body).toContain('"Move up"');
    expect(body).toContain('"Move down"');
  });
});

// ── direct manipulation is still planned manipulation ─────────────────

describe("a question gated on another (1.0.39)", () => {
  it("is not drawn while the other says otherwise", () => {
    const body = readCode("section-editor");
    const loop = body.indexOf("for (const q of questions) {");
    expect(body.indexOf("if (!this.shows(section, q)) continue;", loop)).toBeGreaterThan(loop);
    // Read the way the tick itself is read, so the two cannot disagree.
    expect(body).toContain("value === FLAG_OFF ? FLAG_OFF : FLAG_ON");
  });

  it("drops its answer when the tick hides it, so Save never writes a hidden box", () => {
    // The planner writes a Headings answer on an unticked block, so a reader who
    // ticked, typed and unticked again would have had the invisible list saved.
    const body = readCode("section-editor");
    expect(body).toContain("dep.shownWhen?.key === q.key && !this.shows(section, dep)");
    expect(body).toContain("this.answer(section.id, dep.key, undefined)");
  });
});

describe("nothing is written until Save", () => {
  it("the only write is in commit, behind a re-read", () => {
    const body = readCode("section-editor");
    expect(body.match(/vault\.modify/g) ?? []).toHaveLength(1);
    // RE-READ rather than writing back the copy taken when the window opened.
    // A window a reader can leave open is a much longer gap than a suggester —
    // and on a diary entry what would be dropped is a day's writing.
    const read = body.indexOf("await this.app.vault.read(this.spec.file)");
    expect(read).toBeGreaterThan(0);
    expect(read).toBeLessThan(body.indexOf("vault.modify"));
  });

  it("and refuses outright when the file moved under it", () => {
    expect(editor()).toContain("changed while the window was open");
  });
});

// ── the rule a move may not cross ─────────────────────────────────────

describe("a section cannot be moved across the rule", () => {
  it("because the band is the only list a row can move inside", () => {
    const body = editor();
    expect(body).toContain("private bandOf(");
    // The arrows read it, so a row can only ever be moved among its own band.
    expect(body).toContain("this.bandOf(section.id)");
  });

  it("and an entry really does report two bands", () => {
    const e = entry();
    const bands = new Map<string | null, string[]>();
    for (const s of e.model.sections()) {
      bands.set(s.group, [...(bands.get(s.group) ?? []), s.id]);
    }
    // TWO AS OF 1.0.10, WHERE IT WAS THREE. 4.20 gave the grid a band of its own
    // so it could not be moved back into the card it had just left, and the
    // move is still refused — the banner is pinned and the grid is alone among
    // the movable rows of the group, so there is no slot and no arrow. What one
    // group buys is the weld: a block cannot span two of these strings, and the
    // whole of the arrangement this surface gained is a block holding both.
    expect(bands.size).toBe(2);
    expect(bands.get("The banner")).toEqual(["banner", "trackers"]);
    expect(bands.get("The page below")?.[0]).toBe("focus");
  });

  it("and a dashboard reports two, one row in the top one", () => {
    // It reported one until 3.2 §3 fused navigation and the period summary into
    // a masthead; 4.10 added the page head above both, and the editor needed no
    // change to show either — which is this describe block's whole claim,
    // demonstrated twice rather than once.
    const bands = new Map<string | null, string[]>();
    for (const s of dashboard().model.sections()) {
      bands.set(s.group, [...(bands.get(s.group) ?? []), s.id]);
    }
    // AND THREE BECAME TWO IN 4.58.0, WHICH THE EDITOR ALSO NEEDED NO CHANGE
    // FOR. "The overview" held one section and existed only to keep it out of
    // the body, which is the restriction that release removes. The banner keeps
    // its band, alone, because that is what stops a section landing above the
    // page's own name.
    expect(bands.size).toBe(2);
    expect(bands.get("The banner")).toEqual(["banner"]);
    expect(bands.get("The page below")).toContain("summary");
  });

  it("while a journal note still reports one, so nothing changes there", () => {
    expect(new Set(journal().model.sections().map((s) => s.group))).toEqual(
      new Set([null])
    );
  });

  it("and a new section lands in its own band, not at the bottom of the list", () => {
    // Appending blindly would put a section below the rule at the end of a list
    // whose last rows are also below the rule — right by accident on an entry
    // and wrong the moment a band is ever added anywhere else.
    //
    // Reworded in 4.15 §3 and NOT weakened: the answer used to come off a
    // `<select>`'s value and now comes off the suggester's, so the expression
    // changed and the rule did not. The band lookup is what is being pinned.
    expect(editor()).toContain("const band = this.view(id)?.group");
  });
});

// ── what Save writes ──────────────────────────────────────────────────

describe("what Save writes", () => {
  it("only what the plan named, on every surface", () => {
    for (const { model, text } of [journal(), dashboard(), entry()]) {
      const present = model.present(text);
      for (const id of present) {
        const want = present.filter((x) => x !== id);
        const removed = model
          .plan(text, want)
          .some((o) => o.kind === "remove" && o.sectionId === id);
        const next = model.apply(text, want);
        if (!removed) expect(next, id).toBeNull();
      }
    }
  });

  it("never a region with the reader's writing in it", () => {
    // §9's risk, and the guarantee under it. Patch 5 edits notes with months of
    // writing in them; a removal that would take any of it is refused by the
    // model before the editor can offer it.
    const text = composeEntryTemplate("daily").replace(
      "<!--chronoanvil:log\n-->",
      "<!--chronoanvil:log\nSix months of this.\n-->"
    );
    const model = entrySectionModel({ grain: "daily" });
    const want = model.present(text).filter((id) => id !== "log");
    expect(model.refusal("log", text)).toContain("Clear it first");
    expect(model.apply(text, want)).toBeNull();
  });

  it("and reports what it kept when it kept something", () => {
    expect(editor()).toContain("keepsContent");
    expect(editor()).toContain("kept ${keptLines} line");
  });
});

// ── one pane at a time ────────────────────────────────────────────────

describe("the window is tabbed, not columned", () => {
  it("has four panes and shows one", () => {
    // The two-column grid put the list in about 250px inside a ~560px modal,
    // which is not enough for a row carrying a reorder control, a token, a
    // title, a subtitle, a pill and a Remove button — titles wrapped mid-word.
    // The halves are never read at once, so splitting the width bought nothing.
    const body = editor();
    expect(body).toContain('tab("sections", "In this file")');
    expect(body).toContain('tab("markdown", "Markdown")');
    expect(body).toContain('tab("layout", "Layout")');
    for (const dead of ["ca-tpl-cols", "ca-tpl-preview", "ca-tpl-col-title"]) {
      expect(readCode("section-editor"), dead).not.toContain(dead);
    }
  });

  it("and the stylesheet no longer lays them side by side", () => {
    expect(readCss()).not.toContain(".ca-tpl-cols");
  });

  it("opens on the arranger, not on the summary", () => {
    // With the list always visible, opening on Changes was right: it was the
    // half you could not see. Now it is a pane like the others, and the reader
    // came here to arrange.
    expect(editor()).toContain('private pane: Pane = "sections"');
  });

  it("puts the pending count on the tab, since the pane is usually hidden", () => {
    // A reader who moves three rows and never opens Changes should still be
    // able to see that three things are pending.
    expect(editor()).toContain("`Changes (${n})`");
  });

  it("keeps every pane reachable without scrolling past the list", () => {
    // The tab strip is rendered before the pane, so it sits at a fixed place
    // regardless of how many rows the surface has. A diary entry has nine.
    const body = readCode("section-editor");
    expect(body.indexOf("this.renderTabs(wrap)")).toBeLessThan(
      body.indexOf('createDiv({ cls: "ca-tpl-pane" })')
    );
  });
});

// ── the arrangement sink ──────────────────────────────────────────────

describe("saving an arrangement under a name", () => {
  it("is the caller's vocabulary, not the modal's", () => {
    // "Layout" and "variant" are the journal's words. A modal that hardcoded
    // them would be a modal that knows which surface it is on.
    const body = editor();
    expect(body).toContain("buttonLabel");
    expect(body).not.toContain('"Save as layout…"');
    expect(readSrc("template-editor")).toContain('"Save as layout…"');
  });

  it("hands back ids and lets the caller resolve overrides", () => {
    // Overrides are a journal concept and the modal holds no context to look
    // one up with.
    // Through readCode, which strips comments: the paragraph in the modal
    // explaining why it does not reach for `sectionOverrides` names it, and a
    // check that cannot tell a line of code from a line describing one is not
    // checking what it claims to.
    expect(readCode("section-editor")).not.toContain("sectionOverrides");
    expect(readSrc("template-editor")).toContain("sectionOverrides(ctx, id)");
  });

  it("reads the rows rather than the file", () => {
    // The common case is that you want the variant, not the change: arrange,
    // save the arrangement under a name, leave this file untouched.
    //
    // THROUGH `idsOf` AS OF 3.8 PATCH 7, and the sink's type is unchanged: it
    // still takes `string[]`. An arrangement is a recipe for a note that does
    // not exist yet, and `SectionChoice`'s header is the argument for why it is
    // named in ids — an id is stable, its options are not part of it, and a
    // stored arrangement carrying an option would stop matching the day a
    // reader renamed the thing it named. The one surface with a sink is the
    // journals', whose sections ask nothing, so nothing is dropped here today.
    // The sections argument specifically. Since 3.18 follow-ups §5 the sink also
    // carries WHERE the arrangement applies — which kinds may be created from
    // it — and that is a third argument rather than a change to what the second
    // one is: still ids, still read from the rows.
    expect(editor()).toMatch(
      /await sink\.save\(label\.trim\(\), idsOf\(this\.want\)/
    );
  });
});

// ── the old editor is gone, not shadowed ──────────────────────────────

describe("one editor, not two", () => {
  it("template-editor no longer draws a window", () => {
    // §6 chose replace over beside, and the reason to say so out loud is that
    // it is reversible only before the old one is deleted. It is deleted: what
    // is left builds a model and calls the one editor.
    const t = readSrc("template-editor");
    expect(t).not.toContain("extends EditorModal");
    expect(t).not.toContain("createListRow");
    expect(t).toContain("openSectionEditor");
  });

  it("and its entry point still has the signature its callers use", () => {
    // A rewrite that also rearranged the call sites would have mixed "does the
    // new editor behave like the old one" with "did I update the callers
    // correctly", which are two questions and only one of them is patch 3's.
    const t = readSrc("template-editor");
    expect(t).toContain("export async function openTemplateEditor");
    for (const arg of ["ctx: SectionContext", "onSaved", "onSaveVariant"]) {
      expect(t, arg).toContain(arg);
    }
  });

  it("and only one module in the tree extends the editor frame for sections", () => {
    expect(editor()).toContain("extends EditorModal");
  });
});

// ── 3.2 §4: a fixed row is inert, not refusing ────────────────────────

describe("what a fixed row offers", () => {
  it("is not in any band, which is what makes it inert", () => {
    // The arrow bounds read `bandOf`, so an empty band disables them from one
    // omission — the same shape `group` already uses, where a rule is data the
    // model supplies rather than a check the editor performs.
    expect(editor()).toContain(
      "if (this.view(id)?.movable === false) return [];"
    );
  });

  it("but it IS in the band a weld is cut from, which is a different question", () => {
    // 1.0.10. `bandOf` is the list a row is REARRANGED inside, and a fixed row
    // is left out of it so that three gestures refuse from one omission. A weld
    // moves nothing past anything — it puts one section into the fence of
    // another — and the HOST of every stack this plugin composes is a banner,
    // which is pinned on four of the five surfaces that have one.
    //
    // SO THE BUTTON COULD NOT BE DRAWN AT ALL. `weldInto` and `breakUp` both
    // cut blocks from the band they are handed and both need the host in it,
    // and `blockOf` over a band without it answers `[]`. A diary entry made it
    // visible; Home and Search have had it since 5.30, and the sweep in
    // `journal-stack.test.ts` missed it because it calls `weldInto` directly
    // with a band of its own.
    const body = editor();
    const at = body.indexOf("private stackBand(id: string): string[] {");
    expect(at, "there is no band a weld can be cut from").toBeGreaterThan(0);
    const rule = body.slice(at, body.indexOf("\n  }", at));
    // The one line it does NOT have, which is the whole of the difference.
    expect(rule).not.toContain("movable === false");
    expect(rule).not.toContain("movable !== false");
    // A row on its way out is still excluded: that omission is about the file
    // the Save writes rather than about movement, and is as true of a weld.
    expect(rule).toContain("!this.removed.has(x)");

    // AND BOTH ENDS OF THE GESTURE READ IT. The join and the break-up are one
    // question in two states; a band that differed between them would draw a
    // button whose undo was refused.
    expect(body).toContain("this.renderStackJoin(lead, section, this.stackBand(section.id));");
    expect(body).toContain(
      "this.settle(breakUp(this.arrangement, this.stackBand(group[0]), group[0]));"
    );
    // And the arrows on the same card keep the movable band — moving a block IS
    // moving rows past each other, and a block a fixed row opens does not move.
    expect(body).toContain("const band = this.bandOf(group[0]);");
    expect(body).toContain("canMoveBlock(band, this.joined, group[0], delta)");
  });

  it("still renders, with the reason in place", () => {
    // A row that vanished would take the explanation with it, and "navigation
    // is fixed" is exactly what a reader hunting for the setting needs told.
    const e = entry();
    const banner = e.model.sections().find((s) => s.id === "banner")!;
    expect(banner.movable).toBe(false);
    expect(e.model.present(e.text)).toContain("banner");
    expect(e.model.refusal("banner", e.text)).toContain("removed or moved");
  });

  it("says so on the row, for a fixed row with nothing else to report", () => {
    // 4.11. Until this release every immovable row was also locked, so the
    // removal refusal in the subtitle happened to explain the two disabled arrows
    // as well. The page head is immovable and REMOVABLE, which leaves a row with
    // a control that plainly does not work and no sentence anywhere about it —
    // so the pill is the sentence.
    //
    // ORDERED AFTER THE REFUSAL, asserted as a position in the source rather than
    // as prose: a row that cannot be removed either has the more surprising fact,
    // and two pills about one row is a doubling.
    const body = editor();
    const pill = body.indexOf('{ text: "fixed", tone: "muted" }');
    expect(pill).toBeGreaterThan(0);
    expect(body.indexOf('{ text: "can\'t be removed", tone: "muted" }')).toBeLessThan(
      pill
    );
    expect(body).toContain("section.movable === false");
  });

  it("and the surfaces disagree about which rows are fixed", () => {
    // The flag has to be carrying real information rather than being true
    // everywhere: a journal section is movable, and a diary banner is not.
    expect(
      journal().model.sections().every((s) => s.movable)
    ).toBe(true);
    // On a dashboard exactly ONE row is fixed as of 4.58.0, and it is the banner,
    // by decision. `summary` was the other until its band went — it was never
    // pinned, only stranded — and the body's rows never were.
    const d = dashboard().model.sections();
    expect(d.find((s) => s.id === "banner")!.movable).toBe(false);
    expect(d.find((s) => s.id === "summary")!.movable).toBe(true);
    expect(d.find((s) => s.id === "charts")!.movable).toBe(true);
    expect(d.filter((s) => !s.movable).map((s) => s.id)).toEqual(["banner"]);
  });
});

// ── a row that has to be asked something (3.8 patch 7) ────────────────
//
// The window's own logic, exercised without a DOM the way `changeCount` above
// already exercises the footer: `want` is a getter over three fields, and what
// it returns is the whole of what Save is checked against. Mirroring it here is
// the same trade that helper made — the alternative is a browser, and the part
// that can lose somebody's file is this list rather than the markup around it.

const entryWith = (kinds: { id: string; label: string; dated: boolean }[]) =>
  entrySectionModel({ grain: "daily", journalKinds: kinds });

// section-editor.ts::want, transcribed.
const wantOf = (
  model: SectionModel,
  rows: string[],
  original: string[],
  answers: Map<string, Record<string, unknown>>
): SectionWant[] =>
  rows
    .filter((id) => {
      if (original.includes(id)) return true;
      const given = answers.get(id) ?? {};
      const asked = model.sections().find((s) => s.id === id)?.questions ?? [];
      return asked.every((q) => given[q.key]);
    })
    .map((id) => {
      const options = answers.get(id);
      return options && Object.keys(options).length ? { id, options } : id;
    });

describe("a section may not be added until its question is answered", () => {
  const kinds = [{ id: "meal", label: "Meal", dated: true }];
  const text = composeEntryTemplate("daily");

  it("so an unanswered row plans nothing and writes nothing", () => {
    // THE FAILURE THIS PATCH EXISTS TO REMOVE. Before it, ticking "From the
    // journals" wrote `bridge-notes:` with an empty target and the block
    // rendered a refusal — the plumbing carried an option perfectly and there
    // was no control to put one into it.
    const model = entryWith(kinds);
    const original = model.present(text);
    const want = wantOf(model, [...original, "bridge"], original, new Map());
    expect(idsOf(want)).not.toContain("bridge");
    expect(changeCount({ model, text }, idsOf(want))).toBe(0);
    expect(model.apply(text, want)).toBeNull();
  });

  it("and the answered one writes the target the reader picked", () => {
    const model = entryWith(kinds);
    const original = model.present(text);
    const want = wantOf(
      model,
      [...original, "bridge"],
      original,
      new Map([["bridge", { target: "meal" }]])
    );
    const next = model.apply(text, want)!;
    expect(next).toContain("bridge-notes:meal|From the journals");
    // And no empty region beside it: `ownsRegion` is false, so there is
    // nothing of the reader's here to persist.
    expect(next).not.toContain("<!--chronoanvil:bridge");
  });

  it("and reopening on what was written asks nothing and changes nothing", () => {
    // The round trip patch 4's header asked for. A settled row is never asked
    // again — its answer is in the directive line, and that line is copied out
    // verbatim — so a reader who opens the window and presses Save twice gets
    // the file they already had.
    const model = entryWith(kinds);
    const original = model.present(text);
    const written = model.apply(
      text,
      wantOf(model, [...original, "bridge"], original, new Map([["bridge", { target: "meal" }]]))
    )!;

    const again = entryWith(kinds);
    const present = again.present(written);
    expect(present).toContain("bridge");
    expect(again.apply(written, wantOf(again, present, present, new Map()))).toBeNull();
  });

  it("and a vault with nothing to answer with cannot add it at all", () => {
    // Not a dropdown drawn empty: the question carries the sentence to write
    // instead, and the row stays unanswerable, so Save is never offered a
    // directive that is known in advance to refuse.
    const model = entryWith([]);
    const original = model.present(text);
    const q = model.sections().find((s) => s.id === "bridge")!.questions![0];
    expect(q.values).toEqual([]);
    const want = wantOf(model, [...original, "bridge"], original, new Map());
    expect(idsOf(want)).not.toContain("bridge");
  });
});

describe("the editor carries the defence the add command left it (3.13 §9.1)", () => {
  const src = readSrc("section-editor");

  it("writes nothing until Save", () => {
    // `add-section-to-note` was defended by its own comment: "it is one
    // keystroke for the common case and it cannot remove anything, which is
    // occasionally the reason to reach for it."
    //
    // The editor took that on rather than refuting it. It cannot promise "no
    // removal is reachable from here" — every row has a Remove button and it is
    // one screen, not a wizard — so what it promises instead is the guarantee
    // §9.1 actually names: it SHOWS THE CHANGE BEFORE APPLYING IT. Nothing
    // reaches the note until Save, and the button counts what it is about to
    // do.
    //
    // *Recorded because §9.1 says "the add list is the first screen" and there
    // is only one screen; that sentence describes the deleted command's picker.
    // The property that carries the defence is deferred application, which is
    // what is asserted here.*
    expect(src).toContain("this.model.apply(current, this.want)");
    const at = src.indexOf("private async save");
    expect(at, "save method").toBeGreaterThan(0);
  });

  it("says how many changes are pending, and Save is inert at zero", () => {
    // A reader who opened the editor to add one section and changed their mind
    // must be able to leave without wondering what they did.
    expect(src).toContain('n === 0 ? "No changes" : `Save ${n} change');
  });

  it("still offers the add list the deleted command was", () => {
    // Whatever else the merge cost, it must not have cost the thing the merged
    // command did.
    //
    // THE CONTROL CHANGED IN 4.15 §3 AND BOTH ARGUMENTS ARE KEPT. This pinned a
    // `<select>` whose first option read "Add a section…", and the reason was
    // right: the deleted command's picker must still be reachable from here.
    // What the render settled is that a `<select>` cannot draw the blurb every
    // section carries for exactly this control — so twenty-eight entries showed
    // a glyph and a name, and "Entry rollup" and "Entry timeline" were two
    // labels a reader had no way to tell apart. The picker is now the same
    // modal the deleted command itself used, which is a closer answer to what
    // this test was defending than the dropdown was.
    expect(src).toContain("private renderAdd(");
    expect(src).toContain('text: "Add a section…"');
    expect(src).toContain("promptDetailedSuggester");
  });

  it("keeps offering a widget a page may hold more than one of", () => {
    // EVERY OTHER SECTION LEAVES THE LIST THE MOMENT IT IS STAGED, because there
    // is one of it and the reader now has it. A repeating widget is the one case
    // where "you already added this" is not a reason to stop offering it — and
    // the flag is the model's, so this window still does not know what makes a
    // widget repeatable.
    expect(src).toContain(
      "(s) => s.repeatable || !this.rows.includes(s.id)"
    );
    // OVER `offered()`, WHICH IS `addable` PLUS WHATEVER THE SURFACE OFFERS
    // THAT ITS MODEL CANNOT (5.20). The rule above is unchanged; the list it
    // filters grew a second source. See `StructuralSink`.
    expect(src).toContain("private offered(): SectionView[]");
    expect(src).toContain("const absent = this.offered().filter(");
    // And the id it stages is the model's to mint, because an instance id says
    // WHICH occurrence it is and this window must not learn that spelling.
    expect(src).toContain("this.model.instanceOf(chosen, this.spec.text, this.rows)");
  });

  it("shows the sentence each choice carries, and searches it", () => {
    // THE HALF THE `<select>` COULD NOT DO. `blurb` is one line per section
    // saying what it puts on the page — `WidgetSpec.blurb`'s own comment says it
    // is written for `DetailedChoice.description` — and the add prompt is where
    // a reader chooses between twenty-eight of them.
    expect(src).toContain("description: s.blurb");
    // Searched as well as shown, which is the modal's own behaviour and the
    // reason this is one control rather than two: `addSectionHere` has had both
    // since it was written.
    const modals = repoFile("src/ui/modals.ts");
    expect(modals).toContain("c.description.toLowerCase().includes(q)");
  });

  it("draws a group heading beside its rows, not inside the first one", () => {
    // THE 4.15 §3 BUG, REPORTED FROM A VAULT AND VISIBLE IN THE FIRST RENDER OF
    // IT. The heading was built as a child of the first suggestion in its group,
    // and a suggestion is the element Obsidian paints hover and keyboard
    // selection onto — so "WIDGETS" sat inside the highlight belonging to "Diary
    // search", lit up with it, and was clickable as it. A label for the twenty
    // rows below it was drawn as though it were part of the one row after it.
    //
    // PINNED ON THE INSERTION, not on the class: the class was always right and
    // the parent was the bug, so an assertion that only checked the heading
    // exists is the assertion that let this ship.
    const modals = readCode("modals");
    expect(modals).toContain("el.parentElement.insertBefore(head, el)");
    // The fallback is the OLD behaviour, kept deliberately for the case where
    // the item is not in the tree when it is rendered: a heading in the wrong
    // place beats no heading. It must not be the main path.
    const at = modals.indexOf("if (el.parentElement)");
    expect(at, "the sibling insert is the main path").toBeGreaterThan(0);
    expect(modals.indexOf("el.prepend(head)")).toBeGreaterThan(at);
    // And the styling no longer descends from the row, or a heading that landed
    // beside one would lose it.
    const css = readCss();
    expect(css).toContain("\n.ca-choice-group {");
    expect(css).not.toContain(".ca-choice-detailed .ca-choice-group");
  });

  it("draws the empty state the model named, not the one it assumed", () => {
    // 4.16.1. The folder control hard-coded "this note's folder" into its
    // placeholder, its tooltip and its aria-label, which was true of every
    // folder question there had ever been and false of the one 4.16 added.
    // `emptyLabel` is the model saying otherwise, and all three have to read it
    // — a placeholder that says one thing while the tooltip says another is
    // worse than either being wrong on its own.
    expect(src).toContain('q.emptyLabel ?? "This note\'s folder"');
    expect(src).toContain("q.emptyLabel ?? `this note's own folder (${resolved})`");
    // BOTH READERS NAMED SEPARATELY, because "empty for ${empty}" appears in
    // each and matching it once let a mutant swap the TOOLTIP back to the path
    // while the aria-label went on satisfying the assertion. An anchor that two
    // lines answer is an anchor for neither.
    expect(src).toContain("input.title = `${q.label} — leave empty for ${empty}`;");
    expect(src).toContain('input.setAttribute("aria-label", `${q.label}, empty for ${empty}`);');
    // AND ITS ABSENCE IS THE OLD WORDING EXACTLY, since every other question in
    // the plugin relies on it and none of them changed.
    expect(src).toContain('q.hostFolder ? q.hostFolder : "the vault root"');
  });

  it("groups the add list by subject rather than by kind", () => {
    // 4.12 §C's argument survives — a flat list of twenty-eight buries the two
    // the page was designed around under an alphabet of things it merely
    // permits — but its CUT does not. "Sections" above "Widgets" sorted by a
    // toggle: `formQuestion` flips a section between the two forms on the page,
    // and every one of the 32 `WIDGETS` entries carries a `SECTION_TITLES`
    // heading, so the second heading stood over two dozen rows that are all
    // sections. 5.27 replaces it with the seven subjects.
    expect(src).toContain("categoryRank(a.category) - categoryRank(b.category)");
    expect(src).toContain("group: categoryLabel(s.category)");
    // AND THE OLD CUT IS GONE RATHER THAN RENAMED. Each of these is asserted
    // separately: matching only the partition let a mutant leave the literal
    // headings behind, which is where a reader would still see them.
    //
    // AGAINST `readCode` AND NOT `src`, because the comment above `renderAdd`
    // QUOTES the headings it replaced — that is the record of why they went,
    // and a sweep that could not tell a quotation from a live string would
    // force the argument to be deleted to satisfy the test.
    const code = readCode("section-editor");
    expect(code).not.toContain("[...own, ...widgets]");
    expect(code).not.toContain('"Widgets"');
    expect(code).not.toContain('"Sections"');
    // THE `w:logbook` CLAUSE WENT WITH IT. It only ever existed to put logbook
    // cards on the correct side of a two-way split.
    expect(code).not.toContain('startsWith("w:logbook")');
    // THE WINDOW NOW LEARNS NOTHING ABOUT IDS. `widget-sections.ts` argued at
    // length that the id test was the smallest departure from `SectionView`'s
    // discipline available; the subject on the view is what made it avoidable,
    // so the import going is the substance of the change rather than tidying.
    expect(code).not.toContain("isPageWidgetId");
    expect(code).not.toContain('from "../core/widget-sections"');
  });

  it("sorts before it groups, because the modal never does", () => {
    // `DetailedChoice.group` draws a heading where the value CHANGES and never
    // sorts — modals.ts says so and 4.16's bug was exactly this. So a category
    // that appears twice in the caller's array draws its heading twice, and the
    // sort in `renderAdd` is the whole mechanism rather than a nicety.
    //
    // PINNED ON THE REAL LIST, not on the source: the homepage is the longest
    // one this plugin has — thirty-odd rows once the widget tail is on it — and
    // it is the surface the split was invented for. The text is passed because
    // `sections()` with none lists no widgets (5.26).
    const root = DEFAULT_PATHS.diaryRoot;
    const views = homeSectionModel(root).sections(composeHomeNote(root));
    const ranked = [...views]
      .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
      .map((s) => s.category);
    const runs = ranked.filter((c, i) => i === 0 || ranked[i - 1] !== c);
    expect(new Set(runs).size).toBe(runs.length);
    // And the order is the table's, not the alphabet's — "Writing" before
    // "Diary" is a choice, and a sort that lost it would still be contiguous.
    expect(runs).toEqual(
      SECTION_CATEGORIES.map((c) => c.id).filter((id) => runs.includes(id))
    );
  });
});

// ── how the list reads, 4.34.3 ────────────────────────────────────────────

describe("the list marks where the pointer is, not what a row is", () => {
  const css = (): string => readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("colours a spine on hover rather than on being a section", () => {
    // THE SPINE WAS A PERMANENT ACCENT on every section row, so a list of twelve
    // drew up to twelve accent bars down its left edge — all of them stating a
    // distinction the `Section` pill on the row already makes in words. Emphasis
    // that never varies is texture, and the one thing it could not say was which
    // row the reader is on.
    expect(css()).toContain(".ca-tpl-list .ca-list-row:hover");
    expect(css()).toMatch(
      /\.ca-tpl-list \.ca-list-row \{[^}]*border-left: 3px solid transparent/
    );
    // The section row keeps the SLOT and loses the colour.
    expect(css()).not.toMatch(
      /\.ca-tpl-row-section \{[^}]*border-left: 3px solid var\(--interactive-accent\)/
    );
  });

  it("reserves the spine's width on every row, so nothing shifts", () => {
    // A border that appears on hover moves the row it appears on by its own
    // width. Held transparent, the pointer crossing a row changes one colour and
    // nothing else.
    const rule = css().slice(
      css().indexOf(".ca-tpl-list .ca-list-row {")
    );
    expect(rule.slice(0, rule.indexOf("}"))).toContain("transparent");
  });

  it("gives a group more air than a row", () => {
    // A group is a CARD in a list of rows, and at 6px its border sat almost
    // against the loose rows either side — so "these three are one object" was
    // carried by a 2px rule and nothing else.
    const at = css().indexOf(".ca-tpl-block {");
    expect(at).toBeGreaterThan(-1);
    const block = css().slice(at, css().indexOf("}", at));
    expect(block).toContain("margin: 12px 0");
  });
});
