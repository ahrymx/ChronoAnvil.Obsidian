// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The section/widget toggle on a diary entry. 1.0.42.
//
// *"I think the diary sections should have the widget toggle."* Three
// catalogues have offered it since 4.59.0 and the entry never has. The reason it
// could not simply be declared is structural, and it is what every assertion
// here is about:
//
//   ON EVERY OTHER SURFACE ONE SECTION IS ONE FENCE, titled by a `header:` line
//   above it, so the toggle writes that line in or out and `formOf` reads the
//   fence back.
//
//   AN ENTRY'S SHARED BAND IS ONE FENCE HOLDING SEVEN SECTIONS, each titling
//   itself from the `|Title` after its own directive. A bar written into that
//   fence titles all seven; a read asked of the fence answers for all seven.
//
// So the answer lives on the section's own line — `FormQuestion.titled` — and
// the property that matters most below is the one the fence-level read could
// never have: SEVEN SECTIONS IN ONE FENCE, EACH WITH ITS OWN ANSWER.

import { describe, expect, it } from "vitest";
import {
  applyEntrySections,
  composeEntryTemplate,
  detectEntrySections,
  entrySectionModel,
  planEntrySections,
} from "../src/diary/entry-sections";
import { FIELD_KEYWORDS, labelOf, withLabel } from "../src/core/directive-grammar";
import { readCode, readCss, readSrc } from "./sources";

const DAILY = { grain: "daily" } as const;

const formOn = (text: string, id: string): string | undefined =>
  entrySectionModel(DAILY)
    .sections(text)
    .find((s) => s.id === id)?.answered?.form;

const save = (text: string, changed: Record<string, string>): string => {
  const want = detectEntrySections(text, DAILY).map((id) =>
    changed[id] ? { id, options: { form: changed[id] } } : id
  );
  return applyEntrySections(text, DAILY, want) ?? text;
};

describe("a field's own line is the bar", () => {
  it("reports every field of a fresh entry as a section", () => {
    // WHAT THE READER IS LOOKING AT WHEN THE WINDOW OPENS. Unanswered has to
    // read as the form the catalogue composes, or every box in the list opens
    // unticked over an entry whose fields all draw their titles.
    const text = composeEntryTemplate("daily");
    for (const id of ["focus", "highlights", "challenges", "log", "attachments", "todo", "capture"]) {
      expect(formOn(text, id), id).toBe("section");
    }
  });

  it("marks one field as a widget and leaves the other six sections", () => {
    // THE WHOLE POINT, AND THE THING A FENCE-LEVEL READ CANNOT DO. All seven of
    // these directives are in ONE fence, so an answer stored as "does this fence
    // carry a bar" is one answer for seven sections.
    //
    // AND THE TITLE STAYS. For one build the answer WAS the missing title, and
    // the screenshots that ended it are quoted at `withFormTitle`: a widget
    // draws its name on a hover of its top edge, and this line is the only
    // place that name exists.
    const text = composeEntryTemplate("daily");
    const next = save(text, { log: "widget" });
    expect(next).toContain(
      "note:log#widget:Notes, reflections & learnings…|Notes, reflections & learnings\n"
    );
    expect(formOn(next, "log")).toBe("widget");
    for (const id of ["focus", "highlights", "challenges", "attachments", "todo", "capture"]) {
      expect(formOn(next, id), id).toBe("section");
    }
  });

  it("changes that one line and nothing else in the file", () => {
    // A section's REGION is the reader's writing, and the toggle is about the
    // head over it. Diffed rather than spot-checked: the failure this guards is
    // a write that takes the label off and moves, renames or empties something
    // else in the same pass.
    const text = composeEntryTemplate("daily");
    const next = save(text, { focus: "widget" });
    const was = text.split("\n");
    const now = next.split("\n");
    expect(now.length).toBe(was.length);
    const differ = was.map((l, i) => (l === now[i] ? null : i)).filter((i) => i !== null);
    expect(differ).toHaveLength(1);
    expect(was[differ[0] as number]).toContain("|Today's focus");
    expect(now[differ[0] as number]).toBe(
      "note:focus#line#widget:What are you focusing on today?|Today's focus"
    );
    // TWO TOKENS ON ONE HEAD, WHICH IS THE GRAMMAR RATHER THAN A CASE. `#line`
    // is the renderer's and `#widget` is the editor's, and `splitArgHead` reads
    // a list — the reason 1.0.42 moved this parse out of `buildNote` in the
    // first place.
    // And the region the field writes into is untouched, which is where the
    // reader's own words live.
    expect(next).toContain("<!--chronoanvil:focus");
  });

  it("takes the token off again, byte for byte", () => {
    const text = composeEntryTemplate("daily");
    const off = save(text, { attachments: "widget" });
    expect(off).toContain("attach:attachments#widget|Attachments\n");
    const on = save(off, { attachments: "section" });
    expect(on).toBe(text);
  });

  it("keeps the reader's own wording when it is drawn as a widget", () => {
    // THE DEFECT THE TOKEN REPAIRED, AND THE REASON IT IS NOT ONLY ABOUT THE
    // HEAD. While the answer was the absence of the title, drawing a renamed
    // field as a widget deleted the rename — and toggling back put the
    // CATALOGUE's word where the reader's had been. A silent edit of the one
    // thing on the line that was theirs.
    const text = composeEntryTemplate("daily").replace(
      "|Highlights",
      "|The good bits"
    );
    const off = save(text, { highlights: "widget" });
    expect(off).toContain("|The good bits");
    expect(formOn(off, "highlights")).toBe("widget");
    expect(save(off, { highlights: "section" })).toBe(text);
  });

  it("reads a line the cut-label build wrote, and repairs it on the next save", () => {
    // ONE BUILD WROTE THE ANSWER BY CUTTING THE TITLE, and a reader who ran it
    // has those lines. They read as what they look like — a field with no name
    // draws no head — so nothing is mis-drawn; and the first Save that touches
    // the row puts the catalogue's title back beside the token, which is
    // `withLabel`'s rule rather than a migration.
    const text = composeEntryTemplate("daily").replace(
      "attach:attachments|Attachments",
      "attach:attachments"
    );
    expect(formOn(text, "attachments")).toBe("widget");
    const next = save(text, { attachments: "widget" });
    expect(next).toContain("attach:attachments#widget|Attachments\n");
    expect(formOn(next, "attachments")).toBe("widget");
  });

  it("leaves a title the reader renamed alone", () => {
    // `withAnswers`' rule for the fence bar, spelled for a label: answering
    // "section" over a section that is already one must not replace the reader's
    // wording with the catalogue's. The same Save is a no-op here.
    const text = composeEntryTemplate("daily").replace(
      "|Highlights",
      "|The good bits"
    );
    expect(save(text, { highlights: "section" })).toBe(text);
    expect(formOn(text, "highlights")).toBe("section");
  });

  it("reads a bare trailing bar as no title, the way the page draws it", () => {
    // The renderer's own rule — *"a bare trailing `|` names nothing, so it falls
    // back rather than producing a nameless pill"* — and `fieldHead` draws no
    // head at all for a field with no label. A read that called this a section
    // would tick a box over a field that is plainly bare on the page.
    const text = composeEntryTemplate("daily").replace("|Tasks", "|");
    expect(formOn(text, "todo")).toBe("widget");
  });
});

describe("what the toggle is offered on", () => {
  it("is every field, and not the three lines that are not fields", () => {
    const rows = entrySectionModel(DAILY).sections();
    const asks = (id: string): boolean =>
      (rows.find((s) => s.id === id)?.questions ?? []).some((q) => q.kind === "form");
    for (const id of ["focus", "highlights", "challenges", "log", "attachments", "todo", "capture"]) {
      expect(asks(id), id).toBe(true);
    }
    // THE BANNER AND THE GRID COMPOSE NO LABEL AT ALL — `entry-header` and a
    // marker line — so there is no title for an answer to take off or put back.
    expect(asks("banner")).toBe(false);
    expect(asks("trackers")).toBe(false);
    // AND THE BRIDGE IS THE CASE THAT PROVES THE GATE DOES WORK. It carries a
    // `|From the journals` and is NOT a field: `bridge-notes` is in
    // `SECTION_TITLES`, so a line stripped of its label still takes a head from
    // there and the tick would be a control that changes nothing.
    expect(asks("bridge")).toBe(false);
    expect(FIELD_KEYWORDS.has("bridge-notes")).toBe(false);
  });

  it("asks it of the grain's own wording, borrowed where the grain has none", () => {
    // Captured ships on daily and is OFFERED on all five. A weekly entry that
    // adds one borrows the daily wording — `probeFor`'s rule — so it has to be
    // offered the same toggle, over the title it actually got.
    const weekly = { grain: "weekly" } as const;
    const base = composeEntryTemplate("weekly");
    const added = applyEntrySections(base, weekly, [
      ...detectEntrySections(base, weekly),
      "capture",
    ])!;
    expect(added).toContain("|Captured");
    expect(
      entrySectionModel(weekly)
        .sections(added)
        .find((s) => s.id === "capture")
        ?.answered?.form
    ).toBe("section");
  });

  it("honours the answer on the add, not only on the next save", () => {
    // `directiveFor` composes the catalogue's line, which is titled, and knows
    // nothing of this question — so a reader who adds a field and unticks
    // **Show as section** in the same Save would have the tick dropped in
    // silence. That is the failure `reconfigure` exists to end, arriving by the
    // other door.
    const weekly = { grain: "weekly" } as const;
    const base = composeEntryTemplate("weekly");
    const added = applyEntrySections(base, weekly, [
      ...detectEntrySections(base, weekly),
      { id: "capture", options: { form: "widget" } },
    ])!;
    expect(added).toContain(
      "note:capture#collapse#widget:Captured thoughts land here…|Captured\n"
    );
    expect(
      entrySectionModel(weekly)
        .sections(added)
        .find((s) => s.id === "capture")
        ?.answered?.form
    ).toBe("widget");
  });

  it("says what it will do before it does it", () => {
    const text = composeEntryTemplate("daily");
    const ops = planEntrySections(
      text,
      DAILY,
      detectEntrySections(text, DAILY).map((id) =>
        id === "todo" ? { id, options: { form: "widget" } } : id
      )
    );
    const op = ops.find((o) => o.sectionId === "todo")!;
    expect(op.kind).toBe("reconfigure");
    expect(op.detail).toBe("how this is drawn → Show as widget");
  });
});

describe("the two halves that must agree", () => {
  it("writes the label the way the renderer reads it", () => {
    expect(labelOf("note:focus|Today's focus")).toBe("Today's focus");
    expect(labelOf("note:focus|")).toBe("");
    expect(labelOf("note:focus")).toBe("");
    expect(withLabel("note:focus|Today's focus", null)).toBe("note:focus");
    expect(withLabel("note:focus", "Focus")).toBe("note:focus|Focus");
    expect(withLabel("note:focus|", "Focus")).toBe("note:focus|Focus");
    // ALREADY TITLED IS LEFT ALONE — the reader's wording, not the catalogue's.
    expect(withLabel("note:focus|Mine", "Focus")).toBe("note:focus|Mine");
  });

  it("keeps one table of field keywords, and the dispatcher reads it", () => {
    // ONE DEFINITION, TWO READERS ON OPPOSITE SIDES OF THE TREE: the dispatcher
    // asks whether a FENCE is a band of these, the entry catalogue asks whether
    // a SECTION may be offered the toggle. A second copy is two tables that
    // disagree the day one of them gains a keyword — and the model may not
    // import the renderer to share one, because `entry-sections.ts` builds its
    // catalogue at module scope and would read a half-initialised table.
    const grammar = readCode("directive-grammar");
    expect(grammar.match(/export const FIELD_KEYWORDS/g) ?? []).toHaveLength(1);
    expect(readCode("widgets")).toContain("const FIELD_KINDS = FIELD_KEYWORDS;");
    expect(readCode("entry-sections")).toContain("FIELD_KEYWORDS.has(keyword)");
  });

  it("draws no head for a field with no label", () => {
    // The half of this that lives in the renderer, and the reason the toggle
    // does anything at all. `fieldHead` returns the bare wrap — no frame, no
    // title, no fold — when there is no label to draw one from.
    expect(readCode("note-field")).toContain("if (opts.titled || !label) {");
  });

  it("hangs the widget's name over its top edge, where the homepage's is", () => {
    // *"The title header should appear with the mouse at the top-middle of
    // widgets"*, sent with the homepage's Open tasks beside a diary entry's
    // Captured: one pulls its name down over its top edge, the other drew the
    // drag dots and nothing else.
    //
    // THE TWO FORMS ARE TWO HEADS. A section wears `fieldHead`'s frame — a
    // permanent bar, a chevron, a fold. A widget wears the band every widget on
    // a dashboard wears, and this is the half that draws it: the dispatcher
    // holds the line and the label, so no renderer learns a new word.
    const code = readCode("widgets");
    const at = code.indexOf("const hood =");
    expect(at, "no widget head is hung").toBeGreaterThan(-1);
    const decl = code.slice(at, code.indexOf(";", at));
    // ONLY A FIELD, AND ONLY ON THE TOKEN. Every other keyword's form is a
    // `header:` line beside it, and a `#widget` on one of those would be an
    // answer written where nothing reads it.
    expect(decl).toContain("FIELD_KINDS.has(kind)");
    expect(decl).toContain("hasToken(spec, WIDGET_TOKEN)");
    // AND THE RENDERER IS TOLD NOTHING, which is how it already draws no frame.
    expect(code).toContain("const label = hood ? null : title;");
    expect(code).toContain("buildHead(widget, hood);");
    expect(code).toContain('widget.addClass("ca-journal-widget-field");');

    // The stylesheet's half: the same overlay the card wears, inert until the
    // top strip is reached, and lit together with the grip.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    // BY ARM, NOT BY POSITION IN THE FILE. This host joins groups the card and
    // the bare block already share — and it wears a second, flow-layout form
    // under `@media (hover: none)`, which sits EARLIER in the sheet. A lookup
    // by first occurrence reads the touch rule and asserts the desktop one.
    const ARM = ".ca-journal-widget-field.has-head > .ca-journal-block-head";
    let decls = "";
    for (const m of rules.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const arms = m[1].split(",").map((x) => x.replace(/\s+/g, " ").trim());
      if (arms.includes(ARM) && m[2].includes("position: absolute")) decls = m[2];
    }
    expect(decls, "the field's head is not an overlay").not.toBe("");
    expect(decls).toContain("position: absolute");
    expect(decls).toContain("opacity: 0");
    // INERT AT REST, 4.34.4's rule: nothing opens by crossing the card, so the
    // grip is the trigger for the name as well as the handle for the drag.
    expect(decls).toContain("pointer-events: none");
    for (const back of [
      ".ca-journal-widget-field.has-head:has(> .ca-jbd-handle:hover) > .ca-journal-block-head",
      // AND THE GRIP COMES BACK FROM THE BAND ONCE THE POINTER HAS WALKED DOWN
      // OFF THE DOTS ONTO IT, through the one arm 1.0.42 wrote for every host
      // rather than the `.ca-jbd-loose` one that named this surface alone.
      ".ca-jbd-host:has(> .ca-journal-block-head:hover) > .ca-jbd-handle",
    ]) {
      expect(rules.indexOf(back), `no pairing for ${back}`).toBeGreaterThan(-1);
    }
  });

  it("finds the section by its keyword, not by its title", () => {
    // `probeFor` composes `^note:focus\b`, so a field whose label has been cut
    // is still found — a section the editor cannot locate is one it would offer
    // to add a second time.
    const text = save(composeEntryTemplate("daily"), { focus: "widget" });
    expect(detectEntrySections(text, DAILY)).toContain("focus");
    expect(readSrc("entry-sections")).toContain(
      "new RegExp(`^${keyword}:${escapeForLine(section.id)}\\\\b`, \"m\")"
    );
  });
});
