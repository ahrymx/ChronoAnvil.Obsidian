// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readCode, readSrc } from "./sources";
import { ACTIONS } from "../src/core/actions";
import { journalActions } from "../src/core/journal-actions";
import { pluginWith } from "./journal-action-stub";
// ── discoverability ───────────────────────────────────────────────────────
//
// Roughly eight features had no affordance outside the command palette: the
// section editor, the change preview, the tracker add/remove, converting a note
// to a dashboard. A reader who never opens the palette had none of them, while
// looking at a template with nothing to say it was structurally editable.
//
// The banner menu is DOM inside a click handler, so what is asserted here is the
// shape of the decision rather than the pixels: which surfaces get a control at
// all, which items each offers, and that the palette door stays open.

const header = () => readSrc("study-header");
const settings = () => readSrc("settings");
const main = () => readSrc("main");
const insert = () => readSrc("section-insert");

describe("where the control appears", () => {
  it("draws nothing on a note no journal recognises", () => {
    // The important row. A menu that opens and then explains it cannot help is
    // worse than no menu, and resolveSectionHost already returns null for an
    // unrecognised note — the same answer "Add a section" gives it.
    const t = header();
    expect(t).toContain("contextFor(notePath)");
    expect(t).toMatch(/if \(!ctx\) return;/);
  });

  it("resolves the surface through the existing resolver", () => {
    // Rather than rebuilding the ref list, which is how the longest-folder rule
    // comes to be implemented twice and then to disagree once: a custom
    // journal's root sits inside the journals root Study claims.
    expect(insert()).toContain("contextFor(notePath: string)");
    expect(insert()).toContain("resolveSectionHost(this.refs()");
  });

  it("builds the menu on click, not on render", () => {
    // These banners are on every journal note and every diary entry in the
    // vault, so anything slow or throwing here is visible everywhere at once.
    //
    // MOVED IN 2.56.4, assertion unchanged. The `⋯` control became
    // `overflowButton` in section-frame.ts when the diary entry banner became
    // its second host — the BUTTON is shared even though the MENUS are not (see
    // the note there). So the rule is asserted once, where the button is built,
    // rather than once per banner.
    const t = readSrc("section-frame");
    const click = t.indexOf('button.addEventListener("click"');
    const build = t.indexOf("new Menu()");
    expect(click).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(click);
  });

  it("has both banners going through that one button", () => {
    // The thing the relocation could quietly lose: a banner that kept its own
    // hand-rolled control would still pass the assertion above by not being
    // looked at.
    //
    // `settingsButton` AS OF 4.20, WHERE THIS WAS `overflowButton`. It wraps
    // that one and swaps the glyph for a cog — the control acts on the PAGE, and
    // 4.20 made it the same control on all three banners rather than the page
    // banner's alone. The ⋯ is still right for a row, a cell or a card inside a
    // page, which is why the wrapper exists instead of a change to the base.
    expect(header()).toContain('settingsButton(host, "jsh-more"');
    expect(readSrc("entryheader")).toContain("settingsButton(");
  });

  it("draws one glyph for one meaning, on every banner", () => {
    // THE DEFECT THIS CLOSES. A diary entry and a journal note carried the same
    // menu, opening the same section editor, behind the ⋯ that means "more
    // things about this row" — so a reader who learned the cog on a dashboard
    // had to learn it again on the two surfaces they spend the most time in.
    const frame = readSrc("section-frame");
    expect(frame).toContain("export function settingsButton");
    expect(frame).toContain('setIcon(button, "settings")');
    // And no banner reaches past it to the bare button.
    for (const f of ["entryheader", "study-header", "page-title"]) {
      expect(readSrc(f), f).not.toContain("overflowButton(");
    }
  });
});

describe("what each surface offers", () => {
  it("offers section editing everywhere it draws at all", () => {
    expect(header()).toContain('setTitle("Edit sections…")');
  });

  it("offers a template the change preview, and returns before the rest", () => {
    // A template can be measured against what the catalogue would write. A note
    // cannot — there is nothing for it to have drifted from — so the template
    // branch shows its menu and stops rather than falling through to tracker
    // items that make no sense on a file with no readings.
    const t = header();
    const branch = t.indexOf("if (isTemplate)");
    const preview = t.indexOf('setTitle("Preview template changes")');
    const trackers = t.indexOf('setTitle("Add a tracker…")');
    expect(branch).toBeGreaterThan(0);
    expect(preview).toBeGreaterThan(branch);
    expect(trackers).toBeGreaterThan(preview);
    expect(t.slice(branch, trackers)).toContain("return;");
  });

  it("offers converting to a dashboard only where it can happen", () => {
    // Three conditions, and each removes a menu item whose only outcome would
    // be an error notice: not already a dashboard, not itself a page, and a kind
    // that actually declares pages.
    expect(header()).toContain('!isIndex && ctx.noteKind !== "page" && ctx.hasPages');
  });
});

describe("the other doors", () => {
  it("keeps every command registered", () => {
    // A second door, not a replacement: the palette is how hotkeys are bound and
    // how anyone who already knows the plugin works.
    //
    // ASSERTED AGAINST THE TABLE SINCE 3.13 §7, not against a string in
    // main.ts. The ids moved to `core/actions.ts` and the point of that move is
    // that this class of claim stops being a grep.
    const ids = new Set(ACTIONS.map((a) => a.id));
    for (const id of [
      "note-edit-sections",
      "maint-sync-trackers",
      "diary-quick-capture",
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it("keeps no command that another one now covers (3.13 §9)", () => {
    // Three merged away, each because a second door had stopped earning itself:
    //
    //   `add-section-to-note` — the editor opens on the add list, so "one
    //   keystroke for the common case" was no longer a difference, and "it
    //   cannot remove anything" is answered by the editor showing the change
    //   before applying it.
    //
    //   `preview-repair` and `preview-journal-templates` — a preview is not an
    //   action, it is the confirm step of one, and both were already computed
    //   by the path that runs anyway.
    const ids = new Set(ACTIONS.map((a) => a.id));
    for (const gone of [
      "add-section-to-note",
      "preview-repair",
      "preview-journal-templates",
      // §9.2: both polarities of one question.
      "add-tracker-to-entry",
      "remove-tracker-from-entry",
    ]) {
      expect(ids.has(gone), gone).toBe(false);
    }
  });

  it("asks about trackers once, with the state in the list (3.13 §9.2)", () => {
    // The two commands were the same question with opposite polarity, so a
    // reader swapping one tracker for another ran both and answered two
    // pickers — neither of which ever showed the other half of the answer.
    // Named for the question rather than either verb, as `edit-note-sections`
    // is.
    const ids = new Set(ACTIONS.map((a) => a.id));
    expect(ids.has("note-edit-trackers")).toBe(true);

    const t = readSrc("entry-tracker-manager");
    const at = t.indexOf("async manageTrackers(");
    expect(at).toBeGreaterThan(0);
    const body = t.slice(at, t.indexOf("\n  // Add a tracker to one entry", at));
    // Present first and marked, then what could be added, then create.
    expect(body).toContain('kind: "remove" as const');
    expect(body).toContain('kind: "add" as const');
    expect(body).toContain('kind: "create" as const');
    // ONE prompt, not a menu in front of two.
    expect(body.match(/await promptChoice\(/g) ?? []).toHaveLength(1);
  });

  it("still asks when an entry has exactly one tracker", () => {
    // `modals.ts::only` takes a lone option rather than charging a keystroke
    // for a non-choice. That rule is deliberately not used here: on an entry
    // with one tracker it would delete it without the reader ever confirming,
    // and "there was only one" is not consent. The remove picker carried that
    // note and the merged picker inherits it.
    const t = readSrc("entry-tracker-manager");
    const at = t.indexOf("async manageTrackers(");
    const body = t.slice(at, t.indexOf("\n  // Add a tracker to one entry", at));
    expect(body).not.toContain("only(");
  });

  it("leaves the widgets' pre-chosen paths alone", () => {
    // The "+ Add tracker" tile, the per-cell remove button and both headers
    // call `addTracker`/`removeTracker` with a directive already chosen. The
    // merged picker is a third door onto the same two rooms, not a replacement.
    const t = readSrc("entry-tracker-manager");
    expect(t).toContain("async addTracker(notePath: string, directive?: string)");
    expect(t).toContain("async removeTracker(notePath: string, directive?: string)");
  });

  it("previews the repair inside the repair, as the plan and not a summary", () => {
    // The property that makes a preview trustworthy is that it cannot drift
    // from the action, BECAUSE it is the action minus the write. The window
    // renders a survey built by the code that does the work, and every group it
    // offers is applied by asking the same set it showed.
    const t = readSrc("scaffold");
    const at = t.indexOf("async setupVault()");
    const head = t.slice(at, t.indexOf("\n  // Do the groups the reader ticked", at));

    // ONE SURVEY FEEDS BOTH the window and the write, so there is no second
    // enumeration for them to disagree over.
    expect(head).toContain("await this.surveyRepair()");
    expect(head).toContain("openRepairWindow(this.app, survey)");
    expect(head).toContain("this.applyRepair(survey, chosen, byType, create, templates)");

    // AND IT OPENS UNCONDITIONALLY (4.18.2). The old rule returned early on a
    // current vault and reported it as a notice; the window now carries that
    // answer itself, so there is no branch here that can decline to open.
    expect(head).not.toContain("pendingGroups");
    expect(head).not.toContain("everything already in place");
    expect(head.indexOf("openRepairWindow")).toBeGreaterThan(
      head.indexOf("await this.surveyRepair()")
    );
    // Declining writes nothing, and so does unticking every group.
    expect(head).toContain("if (!chosen || chosen.size === 0) return;");
  });

  it("does every group it offered, and only the ones that were ticked", () => {
    // THE HALF A PREVIEW CANNOT PROMISE ON ITS OWN. A window that lists five
    // groups and then runs work belonging to a group the reader unticked is
    // worse than no window — so every branch in the apply is gated on the set
    // the window returned, and every group the survey can offer has a branch.
    const t = readSrc("scaffold");
    const at = t.indexOf("private async applyRepair(");
    const body = t.slice(at, t.indexOf("\n  }", t.indexOf("parts.join", at)));

    for (const id of ["create", "pages", "journals", "migrations", "templates"]) {
      expect(body, id).toContain(`chosen.has("${id}")`);
    }
    // And the survey offers exactly those five, so neither list can grow a
    // member the other does not have.
    const survey = t.slice(
      t.indexOf("const survey: RepairSurvey = {"),
      t.indexOf("return { survey, byType, create, templates: templatesDrift.files };")
    );
    for (const id of ["create", "pages", "journals", "migrations", "templates"]) {
      expect(survey, id).toContain(`id: "${id}"`);
    }
  });

  // The window answers a current vault too. 4.18.2.
  //
  // The command is run to ASK at least as often as it is run to fix, so "nothing
  // is wrong" is the answer rather than a reason to stay silent. It used to
  // arrive as a corner notice, which is the same words with less standing and in
  // the one place a reader cannot ask a follow-up.
  it("opens the window even when there is nothing to repair", () => {
    const t = readCode("repair-modal");
    const at = t.indexOf("onOpen(): void {");
    const open = t.slice(at, t.indexOf("private renderNothingToDo", at));
    // The branch is IN the window, so nothing upstream has to decide.
    expect(open).toContain("if (!this.pending().length) {");
    expect(open).toContain("this.renderNothingToDo();");
  });

  it("says what it looked for rather than only that it found nothing", () => {
    // `empty.ts`'s rule: an empty state names what will appear here. "Nothing to
    // do" alone leaves a reader unsure the command examined anything.
    const t = readSrc("repair-modal");
    const fn = t.slice(t.indexOf("private renderNothingToDo"));
    expect(fn).toContain("emptyCallout(");
    expect(fn).toMatch(/add, bring up to date, catch/);
  });

  it("draws one live button rather than a greyed confirm and a cancel", () => {
    // The asking shape greys its button when the answer is momentarily
    // unactionable, which is the narrow case the "nothing dead is drawn" rule
    // allows. There is no question here, so a disabled "Repair 0 things" beside
    // a Cancel would be two dead controls dressed as a choice.
    const t = readCode("repair-modal");
    const fn = t.slice(
      t.indexOf("private renderNothingToDo"),
      t.indexOf("private refreshButton")
    );
    expect(fn).toContain('text: "Close"');
    expect(fn).not.toContain("disabled");
    expect(fn).not.toContain('text: "Cancel"');
    expect(fn).not.toContain("mod-warning");
  });

  it("writes nothing when the empty window is closed", () => {
    // `confirmed` is never set on this path, so it resolves null exactly as
    // Cancel does — and `setupVault` already returns on null.
    const t = readCode("repair-modal");
    const fn = t.slice(
      t.indexOf("private renderNothingToDo"),
      t.indexOf("private refreshButton")
    );
    expect(fn).not.toContain("this.confirmed = true");
    expect(readCode("scaffold")).toContain(
      "if (!chosen || chosen.size === 0) return;"
    );
  });

  it("no longer reports a current vault as a notice", () => {
    // The window carries the answer now; both would be the same sentence twice.
    expect(readCode("scaffold")).not.toContain("everything already in place");
  });

  it("makes cancel the default on the plan dialog", () => {
    // Esc, the backdrop and the close button all decline, and the confirm
    // button is never the focused control.
    const t = readSrc("modals");
    const at = t.indexOf("class PlanModal");
    const body = t.slice(at, t.indexOf("export function confirmPlan", at));
    expect(body).toContain("private confirmed = false;");
    expect(body).toContain("cancel.focus();");
    expect(body).toContain("this.resolve(this.confirmed);");
    expect(body).not.toContain("ok.focus()");
  });

  it("declares every action exactly once", () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("puts nothing on the ribbon that the palette does not also offer", () => {
    // THE RULE §7.5 NAMES: a ribbon item is a convenience, the palette is the
    // interface, and nothing is menu-only. True by construction now — one loop
    // registers the whole table — and asserted because "by construction" is a
    // property of today's `registerCommands`, not of the table.
    const registered = new Set(ACTIONS.map((a) => a.id));
    for (const a of ACTIONS.filter((x) => x.ribbon)) {
      expect(registered.has(a.id), a.id).toBe(true);
    }
    // And the menu draws from the same list the palette registers from, rather
    // than a second one. Since 3.21 that list is the table PLUS the generated
    // per-journal actions — which is what finally puts a reader's own journal
    // under the ribbon's Journals heading, where only Study used to appear.
    const t = main();
    expect(t).toContain("[...ACTIONS, ...journalActions(this)].filter(");
    expect(t).toContain("a.ribbon && a.group === group.key");
    expect(t).toContain("for (const action of [...ACTIONS, ...journalActions(this)])");
  });

  it("consults `when` on both surfaces or on neither", () => {
    // Every gating divergence §7.1 found was one surface asking a question and
    // the other not — four Study commands the palette offered and the ribbon
    // hid, an events item the ribbon hid and the commands ran, six note-scoped
    // commands the palette offered on any note at all.
    const t = main();
    // The palette: a `when` becomes a checkCallback, and its absence a plain
    // callback, so the question is asked exactly where it exists.
    expect(t).toContain("if (!when(this)) return false;");
    // The ribbon: the same predicate, in its filter.
    expect(t).toContain("(!a.when || a.when(this))");
  });

  it("keeps `when` cheap enough to run on every keystroke", () => {
    // `checkCallback` runs for every action on every palette keystroke, so a
    // `when` may read settings and the active file's PATH and nothing else — no
    // vault reads, no metadata-cache walks, no `await`.
    //
    // The rule already bit once in the writing: the obvious basis for the two
    // page commands, `typeOfActive()`, routes through `journalTypeOfNote`,
    // which calls `getFile`. `journalTypeOfPath` underneath it is the pure
    // prefix match, and it is what these use.
    const t = readSrc("actions");
    expect(t).toContain("journalTypeOfPath(refs, path)");
    // Call forms, not mentions: both names appear in the comments that explain
    // why they are not used, which is where that reasoning belongs.
    expect(t).not.toContain("journalTypeOfNote(");
    expect(t).not.toContain("cachedRead(");
    expect(t).not.toContain("getFile(");
    // No `when` may be async: `checkCallback` is synchronous and a promise is
    // always truthy.
    for (const a of ACTIONS) {
      if (!a.when) continue;
      expect(a.when.constructor.name, a.id).toBe("Function");
    }
  });

  it("gates Study on the setting, and events on nothing", () => {
    // Two divergences resolved in opposite directions, which is why they are
    // asserted together.
    //
    // Journals: the palette used to offer four Study commands that opened and
    // then said "🎓 Study journals are turned off". The ribbon was right to
    // hide them. The gate is generated now and applies to EVERY journal, which
    // fixed the mirror-image bug the same divergence had left behind: a custom
    // journal's commands carried no `when` at all, so deleting one in Settings
    // left its commands in the palette pointed at a type that no longer
    // resolved.
    //
    // Events: the ribbon used to hide `New special event…`. The PALETTE was
    // right — `eventstore.ts` owns that rule and puts the gate at the drawing
    // surfaces, because gating creation empties the settings list and the
    // manager widget the moment drawing is turned off, leaving no way to edit
    // an event but to re-enable the feature first.
    for (const a of journalActions(pluginWith(["study", "cooking"]))) {
      expect(a.when, a.id).toBeTypeOf("function");
    }
    for (const id of ["diary-new-event", "diary-open-events"]) {
      expect(ACTIONS.find((a) => a.id === id)?.when, id).toBeUndefined();
    }
  });

  it("offers no note-scoped action on a note it cannot act on", () => {
    // Six of them: four ended in "Open a note first." and two — `new-page` and
    // `convert-to-dashboard` — did nothing at all, no note and no notice (§6).
    for (const a of ACTIONS.filter((x) => x.group === "notes")) {
      expect(a.when, a.id).toBeTypeOf("function");
    }
  });

  it("labels the ribbon's groups and warns on the destructive one", () => {
    // §8.2. `setIsLabel` and `setSection` are both declared in obsidian.d.ts;
    // `setSubmenu` is not, and is deliberately unused — a `setSubmenu` that
    // returned undefined would cost the reader the item and everything under
    // it, silently, and a flat fallback means writing the menu twice.
    const t = main();
    expect(t).toContain("setIsLabel(true)");
    expect(t).toContain("setSection(group.key)");
    expect(t).not.toContain(".setSubmenu(");
    // `Set up / repair vault` writes to notes a reader cannot easily get back
    // and was drawn exactly like "Open today's diary".
    // READ OFF THE TABLE SINCE §10.3. This assertion used to name the id, and
    // the rename in that patch is exactly what would have quietly turned the
    // red item off while this test went on passing.
    expect(t).toContain("if (action.warning) i.setWarning(true);");
  });

  it("opens Settings straight onto the Sections step", () => {
    // Was four clicks — Edit journal, Next, a row, a button — for the thing this
    // release is mostly about.
    const t = settings();
    expect(t).toContain('"Templates and sections"');
    expect(t).toContain("step: 1");
  });

  it("clamps an out-of-range step rather than opening blank", () => {
    // The blank-Edit-window failure mode is the one this modal has form for.
    //
    // MOVED IN 2.55.5, with the assertion unchanged. `startAt` was a method on
    // JournalEditModal until the tracker and chart editors became the second
    // and third stepped windows; it belongs to the frame, not to journals, so
    // it went to editor-modal.ts with the rest of the step machinery. The
    // clamp is still what this is about — a deep link past the end of the flow
    // must land on the last step, never on an empty frame.
    const t = readSrc("editor-modal");
    const at = t.indexOf("startAt(step: number)");
    expect(at).toBeGreaterThan(0);
    expect(t.slice(at, at + 200)).toContain("Math.min");
    // And the deep link itself still exists, on the caller's side.
    expect(readSrc("settings-editors")).toContain(
      "modal.startAt(opts.step)"
    );
  });
});

// ── the diary entry banner (2.56.4) ───────────────────────────────────────
//
// 2.55's §2 set a target of "0 features with no other affordance" and recorded
// it met. It was met on JOURNAL notes: the `⋯` was built in study-header.ts and
// nowhere else, so a reader who lives in the diary still had the palette-only
// commands they had in 2.54, and the release notes said otherwise. This is the
// correction.

describe("the diary entry offers its own commands", () => {
  const entry = () => readSrc("entryheader");

  it("draws the settings control on the entry banner", () => {
    expect(entry()).toContain('settingsButton(host, "jeh-more"');
  });

  it("offers the two tracker commands that name this entry", () => {
    const t = entry();
    expect(t).toContain('setTitle("Add a tracker…")');
    expect(t).toContain('setTitle("Remove a tracker…")');
    expect(t).toContain("entryTrackers.addTracker(notePath)");
    expect(t).toContain("entryTrackers.removeTracker(notePath)");
  });

  it("offers the month's entry on a daily entry and not on a monthly one", () => {
    // A monthly entry already IS its month's entry; offering it there is
    // offering to open the note you are reading.
    const t = entry();
    const at = t.indexOf('setTitle("Open this month\'s entry")');
    expect(at).toBeGreaterThan(0);
    expect(t.slice(0, at)).toContain('if (grain === "daily") {');
  });

  it("does not draw the control on a managed template", () => {
    // §2.2's rule: not drawn where the menu would be empty. Both tracker items
    // refuse on a managed template, and with those gone a monthly template's
    // menu holds nothing. A control that opens a menu to say no is worse than
    // no control.
    const t = entry();
    const fn = t.slice(t.indexOf("function attachEntryMenu("));
    const guard = fn.indexOf("if (isManagedTemplate(plugin, notePath)) return;");
    const draw = fn.indexOf("settingsButton(");
    expect(guard).toBeGreaterThan(0);
    expect(draw).toBeGreaterThan(guard);
  });

  it("does not pretend the two menus are one", () => {
    // §2.3 of the plan assumed `bannerMenu` generalised to two callers. Its two
    // callers share two items out of six — a journal note offers section
    // editing, a template preview and "Convert to a dashboard", none of which a
    // diary entry can do. A builder taking a flag that selects between two
    // disjoint lists is the shape §4.3 declined for the chart models.
    // Code only. Both files explain what they deliberately do NOT share, and
    // an explanation naming the other side's API is the record of the decision
    // rather than a use of it — the distinction vocabulary.test.ts draws.
    const codeOf = (name: string) =>
      readSrc(name)
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .join("\n");
    expect(codeOf("entryheader")).not.toContain("contextFor(");
    expect(codeOf("entryheader")).not.toContain("Convert to a dashboard");
    expect(codeOf("study-header")).not.toContain("openThisMonth");
  });
});
