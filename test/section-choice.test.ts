// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.8 patches 4–6 and 8: a section can carry the reader's answer to its own
// question, and the diary gets the bridge the journal already had.
//
// WHAT THE EXISTING SUITE COULD NOT SEE. Every assertion over the three section
// catalogues is about ids — `expect(ids.slice(0, 2)).toEqual(["links",
// "entry-header"])` and forty more like it. An option is not an id, so the whole
// of patch 4 is invisible to them by construction: they stayed green through
// the interface widening, which is the property that made it reviewable and
// also the reason it needs assertions of its own.
//
// The round trip is the one that matters. Add a section with an option, read
// the file back, get the same option — and press Save again and change nothing.

import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc } from "./sources";
import {
  asChoices,
  fieldLabelOf,
  idsOf,
  optionsFor,
} from "../src/core/section-model";
import {
  ENTRY_SECTIONS,
  addableEntrySections,
  applyEntrySections,
  composeEntryTemplate,
  detectEntrySections,
  entryRemovalRefusal,
  entrySectionMatrix,
  entrySectionModel,
  offerableEntrySections,
  sectionsForEntry,
} from "../src/diary/entry-sections";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { TRACKER_CLASSES } from "../src/trackers/trackers";

const bridge = ENTRY_SECTIONS.find((s) => s.id === "bridge")!;

describe("patch 4: an id is a choice with no options", () => {
  it("accepts both spellings and means the same thing by them", () => {
    expect(asChoices(["log", { id: "todo" }])).toEqual([
      { id: "log" },
      { id: "todo" },
    ]);
    expect(idsOf(["log", { id: "todo", options: { x: 1 } }])).toEqual([
      "log",
      "todo",
    ]);
  });

  it("and the shorthand is why no existing caller had to be rewritten", () => {
    // The forty-odd `applyEntrySections(text, ctx, ["links", "log"])` call
    // sites in this suite are the evidence, and they are still written that
    // way. A required `{ id }` everywhere would have been the same statement at
    // greater length, in a diff nobody could read.
    expect(optionsFor(["log"], "log")).toBeUndefined();
    expect(optionsFor([{ id: "log", options: { a: 1 } }], "log")).toEqual({ a: 1 });
    expect(optionsFor([{ id: "log", options: { a: 1 } }], "todo")).toBeUndefined();
  });

  it("and the shared layer never reads a key out of them", () => {
    // THE RULE THAT KEEPS 3.0's INTERFACE HONEST. `section-model.ts` exists so
    // the editor cannot learn which surface it is on; the moment this module
    // knows an option's NAME it has learned exactly that.
    const src = readCode("section-model");
    for (const key of ['"target"', '"tracker"', '"fields"', '"headings"']) {
      expect(src, key).not.toContain(key);
    }
  });

  it("and the id is still an id", () => {
    // The cheap alternative was `bridge-notes:meal` AS the id. `present()`
    // returns ids, `refusal(sectionId, …)` takes one, a saved layout names
    // them, and `longestCommonSubsequence` diffs them — so an id carrying an
    // argument makes a saved variant stop matching the day a reader renames
    // their journal kind.
    expect(bridge.id).toBe("bridge");
    expect(bridge.id).not.toContain(":");
  });
});

describe("patch 5: the option reaches the catalogue that understands it", () => {
  it("is read on an add, and on a keep only where the window said so", () => {
    // THIS TEST ASSERTED THE OPPOSITE UNTIL 3.15, and the inversion is
    // deliberate rather than a repair. It read: "changing an option is
    // remove-then-add", which was true while the editor could not read an
    // answer back out of a note. It now can, so an answer can change in place —
    // and the property the old test was really protecting is the one below,
    // which is unchanged and now has two cases instead of one.
    const base = composeEntryTemplate("daily");
    const added = applyEntrySections(base, { grain: "daily" }, [
      ...detectEntrySections(base, { grain: "daily" }),
      { id: "bridge", options: { target: "meal" } },
    ])!;
    expect(added).toContain("bridge-notes:meal");

    const hand = added.replace("bridge-notes:meal", "bridge-notes:lesson");
    const present = detectEntrySections(hand, { grain: "daily" });
    // Saving with no change at all is a no-op…
    expect(applyEntrySections(hand, { grain: "daily" }, present)).toBeNull();
    // …and a kept section carrying NO options is still copied out verbatim,
    // which is what a row the reader never touched sends.
    expect(
      applyEntrySections(hand, { grain: "daily" }, [...present])
    ).toBeNull();
    // A kept section that DOES carry options is one the window reported as a
    // reconfigure, and its answer moves.
    const again = applyEntrySections(hand, { grain: "daily" }, [
      ...present.map((id) =>
        id === "bridge" ? { id, options: { target: "meal" } } : id
      ),
    ])!;
    expect(again).toContain("bridge-notes:meal");
  });

  it("and a reconfigure splices the answer without touching the label", () => {
    // The line is the reader's. `withAnswers` replaces the span the answer
    // occupies and nothing else, so a retitled `|…` survives a Save that
    // repoints the section — which is §8's risk, tested rather than intended.
    const base = composeEntryTemplate("daily");
    const added = applyEntrySections(base, { grain: "daily" }, [
      ...detectEntrySections(base, { grain: "daily" }),
      { id: "bridge", options: { target: "meal" } },
    ])!;
    const hand = added.replace(
      "bridge-notes:meal|From the journals",
      "bridge-notes:meal|My journals"
    );
    expect(hand).toContain("|My journals");
    const present = detectEntrySections(hand, { grain: "daily" });
    const next = applyEntrySections(hand, { grain: "daily" }, [
      ...present.map((id) =>
        id === "bridge" ? { id, options: { target: "lesson" } } : id
      ),
    ])!;
    expect(next).toContain("bridge-notes:lesson|My journals");
  });

  it("and the journal side takes the reader's answer over the preset's", () => {
    // A layout's `SectionOverrides` is what the journal TYPE declares; a
    // `SectionChoice` is what this reader asked for on this note. The preset is
    // a default and the choice is an answer.
    const src = readCode("journal-plan");
    const at = src.indexOf("renderSection(section, ctx, {");
    expect(at).toBeGreaterThan(0);
    const call = src.slice(at, src.indexOf("});", at));
    expect(call.indexOf("sectionOverrides(ctx, id)")).toBeLessThan(
      call.indexOf("optionsFor(requested, id)")
    );
  });
});

describe("patch 6: the setting `extra` has been describing since 2.60.1", () => {
  it("exists, and starts empty", () => {
    // It was a parameter no caller supplied. Its own comment read "it is a
    // setting the composer reads", and there was no such setting — so adding a
    // section to every future entry of a grain was not possible by any route:
    // the editor refuses a managed template, correctly, because "Refresh entry
    // templates" would overwrite it.
    expect(DEFAULT_SETTINGS.entrySections).toEqual({});
  });

  it("and both scaffold paths compose WITH it", () => {
    // The failure this guards is quiet and total: a refresh that composed
    // without the extras would strip every section a reader had added, on a
    // command whose whole job is to bring the template up to date.
    const src = readSrc("scaffold");
    expect(
      src.match(
        /composeEntryTemplate\(cls, extras\[cls\] \?\? \[\], bands\[cls\] \?\? \[\]\)/g
      )?.length
    ).toBe(2);
  });

  it("and it is additive rather than a stored ordering", () => {
    // A full ordering would freeze the shipped set at the moment someone first
    // customised theirs, so a later release adding a section to daily entries
    // would never reach them. Adding one extra must not remove the nine that
    // ship.
    const plain = composeEntryTemplate("daily");
    const withBridge = composeEntryTemplate("daily", [
      { id: "bridge", options: { target: "meal" } },
    ]);
    for (const shipped of ["note:focus", "note:log", "tasks:todo"]) {
      expect(withBridge, shipped).toContain(shipped);
      expect(plain, shipped).toContain(shipped);
    }
    expect(plain).not.toContain("bridge-notes");
  });

  it("and a surface can now set it, which is what §8 said patch 6 was", () => {
    // THE HALF THAT DID NOT SHIP. The field existed, both scaffold paths
    // composed with it, and nothing could write it — so "add a section to every
    // future entry" was reachable only by hand-editing data.json. A setting no
    // surface can set is the same "built and unreachable" shape §1 of the plan
    // opens on, one release later and in the release that quotes it.
    const src = readCode("settings");
    expect(src).toContain("renderCapture");
    expect(src).toContain("s.entrySections[grain] = list");
    // Sparse by grain, so a vault that has customised nothing stores nothing
    // and the default stays `{}` in fact rather than only in name.
    expect(src).toContain("delete s.entrySections[grain]");
  });

  it("offers more than the bridge, which is what §8 claimed for it", () => {
    // Worth pinning because it is the sentence §8 uses to justify the patch:
    // the setting improves existing sections and not only the bridge. The
    // offer is "what this grain could be given" minus "what its template
    // already writes".
    //
    // ON WEEKLY SINCE 3.11 §4.1, AND THE MOVE IS THE FINDING. This asked
    // daily, where `challenges` and `attachments` were both offerable and
    // unshipped. §4.1 and §4.2 gave daily its own of each, so daily's offer is
    // now `bridge` alone — the grain went from eight addable sections to one,
    // because it now ships everything a day can hold.
    //
    // That is the release working rather than the test breaking, and it is
    // worth saying where the assertion lives: what the setting is FOR did not
    // change, but the grain that best demonstrates it did.
    const ships = new Set(sectionsForEntry({ grain: "weekly" }).map((s) => s.id));
    const offer = offerableEntrySections({ grain: "weekly" })
      .filter((s) => !ships.has(s.id) && s.fence === "shared")
      .map((s) => s.id);
    expect(offer).toContain("bridge");
    expect(offer).toContain("capture");
    expect(offer.length).toBeGreaterThan(1);
  });

  it("leaves the daily template with only the bridge to add", () => {
    // The other half of the above, stated rather than left implicit: after
    // §4.1 and §4.2 a daily entry ships every shared section the catalogue has
    // for it except the one that has to be asked a question first.
    const ships = new Set(sectionsForEntry({ grain: "daily" }).map((s) => s.id));
    const offer = offerableEntrySections({ grain: "daily" })
      .filter((s) => !ships.has(s.id) && s.fence === "shared")
      .map((s) => s.id);
    expect(offer).toEqual(["bridge"]);
  });

  it("and answers §6's open question with silence, plus a sentence", () => {
    // §6: "Whether 'add it to today too' is an offer, a command, or silence is
    // a UX decision with no obvious answer." Silence — a settings toggle that
    // reached into a note the reader is not looking at would be Settings
    // writing to the vault, which is the line layout.ts draws in its own
    // header, and a command would be a third way to do a thing that has two.
    //
    // What the plan is right about is that silence alone reads as the feature
    // not working. So the group says where existing entries are and names the
    // path that does reach one — which is built, tested and cannot remove
    // anything.
    const src = readSrc("settings");
    expect(src).toContain("Entries you already have keep what they have");
    expect(src).toContain('Edit this note\'s sections…');
    // And nothing in Settings writes to an entry.
    expect(readCode("settings")).not.toContain("addSectionToNote");
  });

  it("and the answer stays editable there, unlike in the editor", () => {
    // The asymmetry is real and is the one a reader might notice. A template is
    // COMPOSED from this setting every time it is refreshed, so rewriting the
    // answer costs nothing; an entry is the reader's file and its directive
    // line is copied out verbatim on Save. Same field, two surfaces, and the
    // difference is who owns the bytes.
    const src = readCode("settings");
    expect(src).toContain("d.onChange");
    // ACCUMULATES RATHER THAN REBUILDING FROM THE STORED CHOICE. `[q.key]: v`
    // over `chosen?.options` was the first spelling and it could not survive a
    // second question: an incomplete set is not stored, `display()` re-reads
    // from the setting, and the first answer is gone before the second can be
    // given. The pending map is what makes the row answerable more than once.
    expect(src).toContain("const options = { ...held };");
    expect(src).toContain("this.pendingSectionAnswers");
    // Stored only once every question is answered — the editor's patch 7 rule,
    // stated on the other surface.
    expect(src).toContain("questions.every((other) => options[other.key])");
  });

  it("and a half-answered row is held by the window, not by the setting", () => {
    // A stored half-choice would compose a directive the catalogue already
    // knows will refuse, and `composeEntryTemplate` cannot tell one from a
    // finished one. So the storage stays complete-or-absent and the partial
    // lives exactly as long as the settings window does.
    const src = readCode("settings");
    const at = src.indexOf("const complete =");
    expect(at).toBeGreaterThan(0);
    const after = src.slice(at, at + 400);
    expect(after).toContain("pendingSectionAnswers.delete(pendingKey)");
    expect(after).toContain("pendingSectionAnswers.set(pendingKey, options)");
    expect(after).toContain("write(complete ? { id: section.id, options } : null)");
  });
});

describe("patch 8: From the journals", () => {
  it("is off unless the reader asked for it", () => {
    for (const grain of TRACKER_CLASSES) {
      expect(composeEntryTemplate(grain), grain).not.toContain("bridge-notes");
    }
  });

  it("but is offered on every grain that has a period worth joining", () => {
    for (const grain of TRACKER_CLASSES) {
      const text = composeEntryTemplate(grain);
      const offered = addableEntrySections({ grain }, text).map((s) => s.id);
      // A year of journal notes is a page-long list — the same judgement
      // `open-tasks` makes one catalogue over.
      expect(offered.includes("bridge"), grain).toBe(grain !== "yearly");
    }
  });

  it("carries no period navigator, unlike its mirror", () => {
    // The journal-side bridge ships `period-nav:month` beside its directive
    // because a leaf note has no period of its own. An entry IS a period — it
    // declares the very property `bridgeHostFacts` reads — so a navigator here
    // would offer to re-scope a note whose scope is its identity.
    const line = bridge.directive({ grain: "daily", extra: ["bridge"] }, { target: "meal" });
    expect(line).toBe("bridge-notes:meal|From the journals");
    expect(readCode("entry-sections")).not.toContain("period-nav");
  });

  it("owns no region, and the machinery that assumed one now asks", () => {
    // THE ASSUMPTION THREE PIECES OF MACHINERY WERE WRITTEN ON. A region-owning
    // section's directive is `<kind>:<sectionId>` — `note:log`, `tasks:todo` —
    // because the second token IS the region key, which is what lets the probe
    // look for `^note:log\b`. A bridge's second token is its TARGET, so a probe
    // for `^bridge-notes:bridge` would never match the line the section itself
    // writes.
    expect(bridge.ownsRegion).toBe(false);
    const text = composeEntryTemplate("daily", [
      { id: "bridge", options: { target: "meal" } },
    ]);
    // Detected despite the second token being a target rather than its id…
    expect(detectEntrySections(text, { grain: "daily", extra: ["bridge"] })).toContain(
      "bridge"
    );
    // …and no empty region block written for it.
    expect(text).not.toContain("<!--chronoanvil:bridge");
    // …and nothing to refuse removal over, since it holds none of the reader's
    // writing. A frozen snapshot lives in a region keyed by the snapshot, not
    // by this id, and has its own thaw control.
    expect(entryRemovalRefusal(bridge, text)).toBeNull();
  });

  it("and every shipped section still owns its region", () => {
    // `ownsRegion` is absent-means-true so no shipped section had to declare
    // it. If a second one ever answers false, that is a decision worth making
    // out loud rather than discovering.
    const exempt = ENTRY_SECTIONS.filter(
      (s) => s.fence === "shared" && s.ownsRegion === false
    ).map((s) => s.id);
    expect(exempt).toEqual(["bridge"]);
  });

  it("and an unconfigured one is no longer reachable from the editor", () => {
    // PATCH 7, AND THE GAP IT CLOSED. Patches 4–6 built a channel from the row
    // the reader ticks to the directive the catalogue writes, and the editor
    // had no mouth at its end: it could add `bridge` and could not say what to
    // point it at, so it wrote `bridge-notes:` and the block rendered a refusal
    // listing the vault's kinds. The plumbing worked perfectly and nothing
    // could put anything into it.
    //
    // The rule that fixes it is the editor's and is surface-agnostic: a section
    // may not be ADDED until every question it declares has an answer. This is
    // that rule's other half — that there IS a question to declare.
    const view = entrySectionModel({
      grain: "daily",
      journalKinds: [
        { id: "meal", label: "Meal", dated: true },
        { id: "lesson", label: "Lesson", dated: true },
      ],
    })
      .sections()
      .find((s) => s.id === "bridge")!;
    expect(view.questions?.length).toBe(1);
    expect(view.questions?.[0].values.map((v) => v.value)).toEqual([
      "meal",
      "lesson",
    ]);
    // And the answer the control writes is the one the directive reads.
    const key = view.questions![0].key;
    expect(bridge.directive({ grain: "daily", extra: ["bridge"] }, { [key]: "meal" })).toBe(
      "bridge-notes:meal|From the journals"
    );
  });

  it("and offers only the kinds a bridge could actually join", () => {
    // `planBridge` refuses an undated target outright — a page carries no
    // `date`, and joining on ctime would be confidently wrong — so a picker
    // that listed one would be a menu whose entry is known in advance to
    // produce a refusal. The catalogue still NAMES the undated kind when
    // somebody types it, which is a different job: saying why a thing cannot
    // work is not the same as offering it.
    const view = entrySectionModel({
      grain: "daily",
      journalKinds: [
        { id: "meal", label: "Meal", dated: true },
        { id: "page", label: "Page", dated: false },
      ],
    })
      .sections()
      .find((s) => s.id === "bridge")!;
    expect(view.questions?.[0].values.map((v) => v.value)).toEqual(["meal"]);
  });

  it("and says so in a sentence when the vault has nothing to answer with", () => {
    // EMPTY IS A REAL ANSWER, and it is not the same as absent: the section
    // could be configured here and this vault has nothing to configure it
    // with. A dropdown with no entries reads as broken where a phrase reads as
    // "not yet" — the same judgement `bridgeRefusal` makes when it lists what
    // the vault has instead of reciting the syntax.
    const q = entrySectionModel({ grain: "daily" })
      .sections()
      .find((s) => s.id === "bridge")!.questions![0];
    expect(q.values).toEqual([]);
    expect(q.empty).not.toBe("");
  });

  it("and no other section asks anything, on any grain", () => {
    // The `ownsRegion` exempt-list rule applied to the field beside it. Almost
    // every section's directive can be written without asking anybody
    // anything, and that is the healthy state; a second one is not forbidden
    // but must be deliberate, because the editor's "not addable until
    // answered" rule would start applying to a row nobody thought about.
    for (const grain of TRACKER_CLASSES) {
      const asking = entrySectionModel({ grain })
        .sections()
        .filter((s) => s.questions?.length)
        .map((s) => s.id);
      // Not offered on a yearly entry at all, so there is nothing to ask.
      expect(asking, grain).toEqual(grain === "yearly" ? [] : ["bridge"]);
    }
  });

  it("and the editor carries the answer without knowing what it means", () => {
    // §2's rule reaches one level further out than it did. `section-model.ts`
    // must not know an option's NAME; the editor must not know it either, and
    // it is the file with a `<select>` in it, which is where the temptation
    // lives — one `if (section.id === "bridge")` and the whole interface is
    // decoration.
    const src = readCode("section-editor");
    for (const key of ['"target"', '"bridge"', '"tracker"', "journalKinds"]) {
      expect(src, key).not.toContain(key);
    }
    // It reads the declared key out of the question and writes the answer back
    // under it — a string under a string, interpreted nowhere on this side.
    // The write moved into `answer()` in 3.15 so both controls record an answer
    // the same way and both mark the row dirty; the property is unchanged.
    expect(src).toContain("this.answer(section.id, q.key,");
    expect(src).toContain("next[key] = value");
  });

  it("and an unanswered row is shown, not hidden, and adds nothing", () => {
    // The same shape the struck-through removal row already has: visible, in
    // its place, wearing the reason. A row that vanished until it was valid
    // would take the explanation with it — and one that stayed in `want` would
    // let Save write the empty directive this patch exists to prevent.
    const src = readCode("section-editor");
    expect(src).toContain(".filter((id) => this.unanswered(id).length === 0)");
    expect(src).toContain("`needs ${q.label}`");
  });
});

describe("patch 7: an option is set on the way in", () => {
  it("and a section already in the file keeps the answer it has", () => {
    // A kept section's directive line is copied out verbatim — the property
    // patch 5 pins and the one patch 4 was most likely to have cost. So the
    // editor cannot read the stored answer back, and must not pretend to: a
    // live control on a settled row would assert a capability nothing is
    // behind, which is the exact defect 3.0 patch 1 was built to remove.
    const src = readCode("section-editor");
    expect(src).toContain("if (this.original.includes(id)) return [];");
    expect(src).toContain("ca-tpl-choice-fixed");
    // And the row names the route that does work, rather than only saying no.
    expect(readSrc("section-editor")).toContain("add it again to change it");
  });

  it("and the append-only command asks the same question", () => {
    // 3.0.1's lesson: one command knowing something its neighbour does not is
    // the drift that keeps costing a release — `addSectionHere` resolved a
    // journal host and stopped while the editor beside it opened on the same
    // file. An empty `bridge-notes:` that merely moved one menu over would be
    // the same defect with a different door.
    const src = readCode("section-insert");
    const add = src.slice(src.indexOf("async addSectionHere("));
    expect(add).toContain("answers[q.key] = answer.value");
    // Abandoned rather than defaulted at both exits: a dismissed picker is not
    // consent to a half-configured block, and a vault with nothing to answer
    // with gets the catalogue's sentence about what is missing.
    expect(add).toContain("if (!answer) return;");
    expect(add).toContain("new Notice(`ChronoAnvil: ${q.empty}`)");
  });

  it("and the answers come from the one list a refusal also prints", () => {
    // Two walks of `registeredJournalTypes` would be two lists to keep
    // agreeing — and `bridgeCatalogue` already dedupes ids across journals and
    // already knows a page is a kind with no date. The editor offering a kind
    // that a refusal would not name is precisely the disagreement that
    // function's header asks callers not to create.
    const src = readCode("section-insert");
    expect(src).toContain('bridgeCatalogue(this.plugin, otherSurface("diary"))');
  });

  it("and an arrangement is still a list of ids", () => {
    // An id is stable and its options are not part of it. A saved arrangement
    // carrying an answer would stop matching the day a reader renamed the
    // journal kind it named — the failure `SectionChoice`'s header rejects
    // `bridge-notes:meal`-as-an-id for.
    // Still `idsOf(this.want)`, whatever else the sink came to carry — the
    // claim is about what an arrangement IS, not about the call's arity, so it
    // is asserted as the sections argument rather than as the whole line.
    expect(readCode("section-editor")).toMatch(
      /sink\.save\(label\.trim\(\), idsOf\(this\.want\)/
    );
  });
});

describe("patch 8: an unconfigured bridge, if one is reached by hand", () => {
  it("and an unconfigured one refuses by naming what this vault has", () => {
    // The editor can now add a bridge before its target has been chosen, so an
    // empty target is an ordinary first state rather than a typo. A reader
    // looking at it wants the list they can pick from, not the syntax.
    const src = readCode("bridge");
    const at = src.indexOf("if (!target) {");
    const branch = src.slice(at, src.indexOf("  }", at));
    expect(branch).toContain("catalogue.kinds.map");
    expect(branch).toContain("list(options)");
  });
});

describe("patch 7 follow-up: the control is sized for the answer", () => {
  it("asks its question in full, now that the control has a line to do it on", () => {
    // BOTH ARGUMENTS, BECAUSE THIS ASSERTION WAS INVERTED IN 4.15 §2 AND THE
    // ONE IT REPLACES WAS NOT WRONG.
    //
    // It read: `q.label` is a noun phrase written to sit inside a sentence, and
    // the row already puts it in one — the pill two lines above reads "needs a
    // journal to pull from". Spelling it out again inside a <select> sharing
    // its row with two arrows and a Remove button rendered as "Choose a journal
    // to p": a control whose visible text is a truncated fragment of a question
    // answered in full beside it.
    //
    // Every word of that was about the SLOT. The render of the sections editor
    // that opened 4.15 showed the same slot holding a field, a group button and
    // a Remove button beside the title, and the three separate places that had
    // shortened their text to fit it — this one, and the two `max-width: 12em`
    // ceilings. §2 gave the actions a line of their own, so the question is now
    // measured as well as read.
    //
    // WHAT DID NOT CHANGE is that the phrase must still reach a screen reader,
    // which is what the `aria-label` half was really defending.
    const src = readCode("section-editor");
    // THE PHRASE MOVED INTO A CONDITIONAL IN 4.46 AND IS OTHERWISE UNCHANGED.
    // A choice that names a working empty state draws that name in the first
    // row instead of a prompt — `stats-band` is the one, because a bare band is
    // already the scope's own preset — so the prompt is now the branch taken
    // when `emptyLabel` is absent, which is every other choice in the plugin.
    expect(src).toContain("`Choose ${q.label}…`");
    expect(src).toContain("q.emptyLabel ? `${q.emptyLabel} (default)`");
    expect(src).toContain('select.setAttribute("aria-label", `Choose ${q.label}`)');
    expect(src).toContain("select.title = `Choose ${q.label}`");
  });

  it("and the box says what it is, beside the pill that says it is empty", () => {
    // The field label — the half the row could not afford before §2. It is not
    // the pill said twice: "needs a journal to pull from" stops being true when
    // the box is filled and "Journal" does not.
    expect(readCode("section-editor")).toContain("ca-tpl-field-label");
    expect(fieldLabelOf({ kind: "folder", key: "arg", label: "the folder to review" }))
      .toBe("Folder");
    expect(
      fieldLabelOf({
        kind: "choice",
        key: "arg",
        label: "a journal to pull from",
        values: [],
        empty: "",
      })
    ).toBe("Journal");
  });

  it("but the full phrase stays in the modal picker, which has the room", () => {
    // `addSectionHere` asks the same question through a suggester, which is a
    // full-width prompt rather than a slot in a row. Shortening it there would
    // be trading a legible question for nothing.
    expect(readCode("section-insert")).toContain("`Choose ${q.label}…`");
  });

  it("keeps the select's floor and drops its ceiling", () => {
    // THE FLOOR'S REASON SURVIVED §2 AND THE CEILING'S DID NOT, which is why
    // this pins them separately rather than pinning "it is sized".
    //
    // Floor: this is still a flex child, and a <select> with no basis still
    // shrinks to nothing under its siblings. Unchanged since it was written.
    //
    // Ceiling: 12em was cut to stop a truncated placeholder in a slot shared
    // with two arrows and a Remove button. The control now sits on the row's
    // own actions line, so a ceiling kept past its cause would be a control
    // refusing room it has.
    const css = readCss();
    const at = css.indexOf(".ca-tpl-choice {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("min-width");
    expect(rule).not.toContain("max-width");
  });

  it("gives the actions their own line, which is what paid for all of it", () => {
    const css = readCss();
    const at = css.indexOf(".ca-list-row.has-actions-row .ca-list-actions {");
    expect(at, "the actions row rule").toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("width: 100%");
    // OPT-IN, so every other list this component draws is untouched — the
    // settings lists, the template editor and the dense note rows.
    expect(readCode("list-row")).toContain(
      'if (opts.actionsRow) row.addClass("has-actions-row")'
    );
    // And the narrow-viewport rule this promotes is still there for them.
    expect(css).toContain("@media (max-width: 620px)");
  });
});

// ── the offer as a grid, and the table that draws it (4.27 §3) ────────
//
// The Diary entries group was a headed stack per grain and is now one table:
// a row per offerable section, a column per grain. These assert the MATRIX,
// which is where every decision moved to — the renderer above it works nothing
// out for itself, because the suite has no DOM and anything decided in a
// renderer is a rule that rots unwatched.
describe("entrySectionMatrix", () => {
  it("has a row only for a section some grain can be offered", () => {
    // Six of the ten shared sections ship on all five grains, so a row for one
    // would read "Ships" five times — which is what the group's own subtitle,
    // "beyond what its grain ships", already says.
    expect(entrySectionMatrix().rows.map((r) => r.id)).toEqual([
      "bridge",
      "capture",
    ]);
  });

  it("says a grain SHIPS what its template already writes", () => {
    expect(entrySectionMatrix().cell("capture", "daily")).toBe("ships");
  });

  it("OFFERS a section another grain lends the wording for", () => {
    // `capture` has a daily-only directive; `directiveFor` borrows it, which is
    // what makes "add Captured to my weekly entries" reachable at all.
    expect(entrySectionMatrix().cell("capture", "weekly")).toBe("offer");
  });

  it("marks a cell ABSENT where the section cannot exist", () => {
    // `bridge` returns null on yearly AND cannot be borrowed (its directive
    // needs `extra`, which the borrow loop does not pass), so no grain lends
    // it. A year of journal notes is a page-long list — see its own comment.
    expect(entrySectionMatrix().cell("bridge", "yearly")).toBe("absent");
    expect(entrySectionMatrix().cell("bridge", "daily")).toBe("offer");
  });

  it("draws the columns it is given rather than always five", () => {
    // The reason this is a parameter: "a sixth grain is a table edit away; a
    // layout that only works at five breaks silently the moment the table
    // grows" (test/tracker-grains.test.ts).
    const two = entrySectionMatrix(undefined, ["daily", "weekly"]);
    expect(two.grains).toEqual(["daily", "weekly"]);
    expect(two.cell("capture", "monthly")).toBe("absent");
  });

  it("answers for every grain in the class table", () => {
    const m = entrySectionMatrix();
    expect(m.grains).toEqual([...TRACKER_CLASSES]);
    for (const grain of TRACKER_CLASSES) {
      expect(["ships", "offer", "absent"], grain).toContain(
        m.cell("capture", grain)
      );
    }
  });
});

describe("the Quick capture group is a derived table", () => {
  // Scoped to the method body — a bare match over a file this size finds a
  // word somewhere and proves nothing (RESUME §6).
  const renderer = (): string => {
    const src = readCode("settings");
    const at = src.indexOf("private renderCapture(");
    expect(at).toBeGreaterThan(0);
    const end = src.indexOf("\n  private ", at + 1);
    return src.slice(at, end === -1 ? src.length : end);
  };

  it("takes its rows and cells from the matrix", () => {
    expect(renderer()).toContain("entrySectionMatrix(");
    expect(renderer()).toContain("matrix.cell(");
  });

  it("derives its column headings from the class table", () => {
    expect(renderer()).toContain("CLASS_DEFS[");
    // Not five literals. A sixth grain must need no edit here.
    expect(renderer()).not.toContain('"Daily"');
    expect(renderer()).not.toContain('"Weekly"');
  });

  it("reuses the settings table rather than a second one", () => {
    expect(renderer()).toContain("this.createTable(");
  });

  it("keeps the blurb, which is the only thing saying what a section is", () => {
    expect(renderer()).toContain("col-name-sub");
    expect(renderer()).toContain("captureSection.blurb");
  });
});

describe("the settings tables are theme-coloured", () => {
  it("picks no colour by hand in the pill rules", () => {
    // 4.27: every colour in this block was a literal, so the Trackers and
    // Journals tables drew a light-mode chip over whatever the reader's theme
    // was doing. Asserted over the rule bodies rather than the file, so an
    // unrelated hex elsewhere in the stylesheet does not fail this.
    const css = readCss();
    const at = css.indexOf(".ca-settings-table .ca-list-pill {");
    expect(at).toBeGreaterThan(0);
    const end = css.indexOf(".ca-settings-table .ca-col-actions-cell", at);
    expect(end).toBeGreaterThan(at);
    expect(css.slice(at, end)).not.toContain("#");
  });
});
