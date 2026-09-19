// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A note type that lives on one index page — 1.0.33.
//
// ── THE READER'S ASK, IN TWO PARTS ────────────────────────────────────────
//
// *"adding a new note-type to a table should not add this type to all index
// pages. The only place the defaults should be configured like this is from
// chronanvil's journal settings."*
//
// then, on the build that scoped the WRITE and not the RECORD:
//
// *"test!!! was added directly into Web Design index page, but its appearing on
// the settings page (where only the defaults should be, Lesson & Cheatsheet)"*.
//
// ── WHY IT TAKES TWO FIELDS AND NOT ONE ───────────────────────────────────
//
// `local` on the kind says the journal does not OFFER it, so Settings draws no
// row and `childrenParts` composes no group. `notetypes` on the note says this
// page lists it anyway. Either alone is a defect rather than half a feature:
//
//   the flag alone — the group is composed for nobody, so `strayParts` prunes
//   the `kind-table:` line off the very page that asked for it, which is 1.0.23's
//   repair of a kind that LEFT the journal doing exactly its job;
//
//   the claim alone — `missingParts` goes on offering the group to every other
//   index note in the journal, which is the behaviour being removed.
//
// So the tests below are mostly about the PAIR, and the planner is asked in both
// directions on both kinds of page.

import { describe, expect, it } from "vitest";

import {
  PAGE_TYPES_KEY,
  pageTypesIn,
  withPageType,
  withoutPageType,
} from "../src/journals/kind-tables";
import {
  childrenBar,
  childrenParts,
  listedKinds,
  sectionContext,
  templateTargets,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { buildJournalType } from "../src/journals/journal";
import {
  composeTemplate,
  freshCustomJournal,
} from "../src/journals/custom-journal";
import { planSections, sectionsPresent } from "../src/journals/journal-plan";
import { normaliseKinds } from "../src/core/settings-editors";
import { fnBody, readSrc } from "./sources";

// A journal with one default kind and one page-added one. One level, so depth 0
// is the deepest index and draws the groups.
const JOURNAL = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "design",
  name: "Design",
  root: "Design",
  levels: [{ id: "topic", noun: "Topic", fallbackEmoji: "📁" }],
  kinds: [
    { id: "lesson", emoji: "📖", label: "Lesson" },
    { id: "cheatsheet", emoji: "📋", label: "Cheatsheet" },
    { id: "test", emoji: "📝", label: "Test!!!", local: true },
  ],
});

// An index note of it, with or without the claim in its frontmatter.
const at = (...localKinds: string[]): SectionContext => ({
  ...sectionContext(JOURNAL, { depth: 0 }),
  hostFolder: "Design/Web Design",
  localKinds,
});

// And the template every index note of that level is composed from, which never
// has one.
const template = (): SectionContext =>
  templateTargets(JOURNAL).find((t) => t.key === "index:0")!.ctx;

const probes = (ctx: SectionContext): string[] =>
  childrenParts(ctx).map((p) => p.probe);

describe("what the page says it lists", () => {
  it("reads the ids in the order the note wrote them", () => {
    expect(pageTypesIn({ [PAGE_TYPES_KEY]: ["risk", "test"] })).toEqual([
      "risk",
      "test",
    ]);
  });

  it("takes a lone id written as a scalar", () => {
    // What a reader's property editor leaves behind after removing the second
    // entry, and what every other frontmatter reader in this plugin accepts.
    expect(pageTypesIn({ [PAGE_TYPES_KEY]: "test" })).toEqual(["test"]);
  });

  it("is empty where the note says nothing, and drops what is not an id", () => {
    expect(pageTypesIn({})).toEqual([]);
    expect(pageTypesIn({ [PAGE_TYPES_KEY]: ["  ", 4, "test", "test"] })).toEqual(
      ["test"]
    );
  });

  it("takes an id back out, and declines where it was never in", () => {
    // *"removing a non-default page-kind that happens to have been created on
    // two different index page is getting removed from both on repair"* — one
    // card stops listing it, and the kind stays for the card that still does.
    expect(withoutPageType({ [PAGE_TYPES_KEY]: ["risk", "test"] }, "risk")).toEqual(
      ["test"]
    );
    expect(withoutPageType({ [PAGE_TYPES_KEY]: ["test"] }, "test")).toEqual([]);
    expect(withoutPageType({}, "test")).toBeNull();
  });

  it("declines to rewrite a note that already lists it", () => {
    // `setPageLayout`'s posture: a second press of the same control moves no
    // bytes, so listing a type a page already lists is not a modification.
    expect(withPageType({ [PAGE_TYPES_KEY]: ["test"] }, "test")).toBeNull();
    expect(withPageType({}, "  ")).toBeNull();
    expect(withPageType({ [PAGE_TYPES_KEY]: ["risk"] }, "test")).toEqual([
      "risk",
      "test",
    ]);
  });
});

describe("which kinds a surface lists", () => {
  it("leaves a page-added type off every page but the one that claims it", () => {
    expect(listedKinds(at()).map((k) => k.id)).toEqual(["lesson", "cheatsheet"]);
    expect(listedKinds(at("test")).map((k) => k.id)).toEqual([
      "lesson",
      "cheatsheet",
      "test",
    ]);
  });

  it("leaves it off the template, which is every page's answer at once", () => {
    // `hostFolder`'s reason, one field along: a journal template is composed
    // once and used by every index note of its level, so a page's list written
    // into it would be every page's list.
    expect(template().localKinds).toBeUndefined();
    expect(probes(template())).toEqual([
      "kind-table:lesson",
      "kind-table:cheatsheet",
    ]);
  });

  it("composes the group, its head and its create button where it is claimed", () => {
    expect(probes(at())).toEqual([
      "kind-table:lesson",
      "kind-table:cheatsheet",
    ]);
    const mine = childrenParts(at("test"));
    expect(mine.map((p) => p.probe)).toEqual([
      "kind-table:lesson",
      "kind-table:cheatsheet",
      "kind-table:test",
    ]);
    // A group like any other once it is on the page: its own head, its own
    // create button beside its own rows.
    expect(mine[2].lines).toEqual([
      "header:2:📝 Test!!!s",
      "button:design:new-test",
      "kind-table:test",
    ]);
  });

  it("counts toward the grouping rule, which is what a card looks like", () => {
    // 5.12's "one group is no grouping" asks how many groups this card draws,
    // and that is now a question about the PAGE. A journal whose one default
    // sits beside a page-added type draws a named bar on the page that lists it
    // and the kind's own name on every page that does not — which is the rule
    // working, not an exception to it.
    const solo = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "cooking",
      levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" }],
      kinds: [
        { id: "recipe", emoji: "🍽️", label: "Recipe" },
        { id: "risk", emoji: "⚠️", label: "Risk", local: true },
      ],
    });
    const bare = { ...sectionContext(solo, { depth: 0 }), localKinds: [] };
    expect(childrenBar(bare)).toEqual([
      "header:🍽️ Recipes",
      "button:cooking:new-recipe",
    ]);
    expect(childrenBar({ ...bare, localKinds: ["risk"] })).toEqual([
      "header:🗂️ What's below",
    ]);
  });
});

describe("what the reconciler does with it", () => {
  const compose = (ctx: SectionContext): string =>
    composeTemplate(ctx, ["banner", "children"], undefined);

  it("offers the group to the page that claims it, and to no other", () => {
    const bare = compose(at());
    const offered = (ctx: SectionContext): string[] =>
      planSections(bare, ctx, sectionsPresent(bare, ctx))
        .filter((o) => o.kind === "extend")
        .map((o) => o.detail);
    // The page that asked for it is short of a group and is told so.
    expect(offered(at("test")).join(" ")).toContain("Test!!!");
    // Every other index note in the journal is not — *"adding a new note-type
    // to a table should not add this type to all index pages."*
    expect(offered(at())).toEqual([]);
  });

  it("leaves the claiming page's own group alone rather than pruning it", () => {
    // THE HALF THE FLAG ALONE GETS WRONG. `strayParts` removes a `kind-table:`
    // line whose id is not among the section's parts — 1.0.23's repair for a
    // kind that LEFT the journal — so a group composed for nobody is pruned off
    // the very page that asked for it, one reconcile later.
    const mine = compose(at("test"));
    expect(mine).toContain("kind-table:test");
    const ops = planSections(mine, at("test"), sectionsPresent(mine, at("test")));
    expect(ops.filter((o) => o.kind === "prune")).toEqual([]);
    expect(ops.filter((o) => o.kind === "extend")).toEqual([]);
  });

  it("prunes it off a page that stopped claiming it", () => {
    // The reader took the id out of `notetypes` by hand. The group goes, by the
    // same route a kind removed from the journal goes — nothing here learns a
    // second way to take a table off a page.
    const mine = compose(at("test"));
    const ops = planSections(mine, at(), sectionsPresent(mine, at()));
    expect(ops.some((o) => o.kind === "prune")).toBe(true);
  });
});

describe("where the flag has to survive", () => {
  it("is carried by the builder, like every other stored field", () => {
    // A kind that lost it on the way through would be composed onto every index
    // note in the journal the next time one was reconciled.
    expect(readSrc("journal")).toContain("...(k.local ? { local: true } : {})");
    expect(JOURNAL.kinds.find((k) => k.id === "test")?.local).toBe(true);
  });

  it("survives a round trip through the Settings editor", () => {
    // 3.20.1's `plural` scar, and the field most exposed to it is the one with
    // no box on screen: `normaliseKinds` rebuilds every row from what the editor
    // knows about, so an uncarried `local` is deleted by pressing Save — and
    // every page-added type in the vault would be composed everywhere.
    const rows = normaliseKinds(
      [
        { id: "lesson", emoji: "📖", label: "Lesson" },
        { id: "test", emoji: "📝", label: "Test!!!", local: true },
      ],
      { preserveIds: true }
    );
    expect(rows.map((r) => r.local)).toEqual([undefined, true]);
  });

  it("draws no row in Settings → Journals, which is the reader's ask", () => {
    // *"its appearing on the settings page (where only the defaults should be,
    // Lesson & Cheatsheet)"*.
    const paint = fnBody("paintKinds", "core/settings-editors");
    expect(paint).toContain("if (kind.local) return;");
    // FILTERED INSIDE THE LOOP, because `i` is the index `del` splices out of
    // `this.draft.kinds` — a `.filter()` first and this window deletes the wrong
    // kind on any journal that has a page-added one.
    expect(paint).toContain("this.draft.kinds.forEach((kind, i) => {");
    expect(paint).toContain("this.draft.kinds.splice(i, 1);");
    // And "the last one" is counted over what the journal offers, so a default
    // beside two page-added types is still the last thing anyone can create.
    expect(paint).toContain("const offered = this.draft.kinds.filter((k) => !k.local).length;");
    expect(paint).toContain("del.disabled = offered <= 1;");
  });

  it("is read off the note and never off the template", () => {
    // `indexSurfaces` builds both contexts. Only the note branch — the one that
    // already adds `hostFolder` — gains the page's list.
    const src = fnBody("indexSurfaces", "journals/dashboard-catchup");
    expect(src).toContain("localKinds: pageTypesOf(app, file),");
    expect(src.indexOf("localKinds")).toBeGreaterThan(
      src.indexOf('hostFolder: file.parent?.path ?? ""')
    );
    // The template branch builds its context with nothing added to it.
    expect(src).toContain("out.push({ file, ctx: sectionContext(type, { depth }) });");
  });

  it("is set by the door that hands a note, and by no other", () => {
    const src = fnBody("addKindToJournal", "journals/kind-create");
    expect(src).toContain("...(host ? { local: true } : {})");
  });
});

describe("every other surface that lists a journal's kinds", () => {
  it("draws no table for it on a level-index card that does not list it", () => {
    // `level-index` is the RENDER-TIME form of the same list `childrenParts`
    // composes — one table per kind, decided when the note is drawn rather than
    // when it was written. Filtering the composer alone would leave the leak
    // open on every note carrying this widget instead of the composed groups.
    const src = fnBody("buildLevelIndex", "ui/tables");
    expect(src).toContain(
      "const listed = pageTypesOf(plugin.app, getFile(plugin.app, ctx.sourcePath));"
    );
    expect(src).toContain("if (kind.local && !listed.includes(kind.id)) continue;");
  });

  it("is not in the Structure column of the journals list either", () => {
    // *"custom note-kinds are now hidden from the journal settings edit window,
    // but not from the structure column."* Two lists of the same thing that
    // disagree is worse than either, and this is the one a reader sees first.
    const row = fnBody("renderJournalRow", "core/settings");
    expect(row).toContain("const kindNames = cfg.kinds");
    expect(row).toContain(".filter((k) => !k.local)");
  });

  it("claims no command in the palette", () => {
    // The one place it would reach everywhere — and a note made from it while
    // standing somewhere else lands under an index listing no table for it.
    expect(fnBody("journalActions", "core/journal-actions")).toContain(
      "if (kind.local) continue;"
    );
  });
});

describe("the cache is one event behind, so the write says what it wrote", () => {
  // The reader's report: *"adding a new-note type no longer automatically
  // updates the table (the user has to repair vault for it to show)"*.
  //
  // `frontmatterOf` reads Obsidian's metadata cache, which is filled from a file
  // event AFTER the write returns. So claiming the kind and then reconciling
  // asked the planner about a page that had already claimed it and was told, by
  // a stale cache, that it had not: nothing was composed, and the reader's next
  // Repair vault did it instead.
  it("resolves both writers to the list now in the file", () => {
    // `fnBody` reads top-level functions and these are methods on
    // `JournalManager`, so the module is read whole and the lines are the ones
    // only these two write — see the helper's own rule about not widening it.
    const src = readSrc("journal");
    expect(src).toContain(
      "async listKindOnPage(file: TFile, kindId: string): Promise<string[]> {"
    );
    expect(src).toContain(
      "async unlistKindOnPage(file: TFile, kindId: string): Promise<string[]> {"
    );
    // The list as written, not as the cache will eventually report it — and the
    // same answer where the write was declined as a no-op.
    expect(src).toContain("const next = withPageType(now, kindId);");
    expect(src).toContain("const next = withoutPageType(now, kindId);");
    expect(src).toContain("if (!next) return pageTypesIn(now);");
    // And an empty list is a key deleted rather than a row saying nothing.
    expect(src).toContain("else delete front[PAGE_TYPES_KEY];");
  });

  it("lets the caller hand that answer to the planner", () => {
    const src = fnBody("catchUpIndexNote", "journals/dashboard-catchup");
    // Not a delta and not a hint: where it is given it IS the page's list, so
    // the one argument serves adding and removing alike.
    expect(src).toContain("? { ...found.ctx, localKinds: [...listing] }");
    expect(src).toContain(": found.ctx;");
    // A caller with nothing to say still gets the cache's answer.
    expect(readSrc("dashboard-catchup")).toContain(
      "listing?: readonly string[]"
    );
  });

  it("is what every caller that just wrote the claim hands over", () => {
    const add = fnBody("addKindToJournal", "journals/kind-create");
    expect(add).toContain(
      "const listing = await plugin.journals.listKindOnPage(host, added.id);"
    );
    expect(add).toContain("await catchUpIndexNote(app, type, host, listing);");
    const off = fnBody("unlistKindHere", "journals/kind-create");
    expect(off).toContain(
      "const listing = await plugin.journals.unlistKindOnPage(host, kind.id);"
    );
    expect(off).toContain(
      "await catchUpIndexNote(app, buildJournalType(cfg), host, listing);"
    );
  });
});

describe("a page-added type on two cards leaves one at a time", () => {
  it("asks the vault which cards claim it", () => {
    // The claim is the record, so the vault is — there is no second register to
    // keep in step, which is what makes it survive a rename and a move.
    const src = fnBody("pagesListingKind", "journals/kind-create");
    expect(src).toContain("pageTypesOf(app, f).includes(kindId)");
    expect(src).toContain("f.path.startsWith(`${root}/`)");
  });

  it("takes the claim off this card and leaves the journal alone", () => {
    const src = fnBody("promptRemoveKind", "journals/kind-create");
    expect(src).toContain("if (host && kind.local) {");
    expect(src).toContain("(f) => f.path !== host.path");
    // ONLY where another card still lists it. The last card's removal is the
    // act this door has always performed, behind the window it always used.
    expect(src).toContain(
      "if (others.length) return unlistKindHere(plugin, cfg, kind, host, others);"
    );
    const off = fnBody("unlistKindHere", "journals/kind-create");
    expect(off).not.toContain("removeKindFromJournal");
    expect(off).not.toContain("saveSettings");
  });

  it("counts the notes under this index rather than the whole journal", () => {
    // Nothing is being declassified — the type, its template and every note of
    // it survive — so the guard asks the narrower question it is actually
    // about: what would this card stop listing.
    const off = fnBody("unlistKindHere", "journals/kind-create");
    expect(off).toContain('const here = host.parent?.path ?? "";');
    expect(off).toContain("countNotesOfKind(app, here, kind.id)");
  });

  it("says where it survives, so 'removed' is not read as everywhere", () => {
    const off = fnBody("unlistKindHere", "journals/kind-create");
    expect(off).toContain("still ${");
    expect(off).toContain("only this card's group goes");
    expect(off).toContain("leaves ${cfg.name} altogether");
  });

  it("hangs on the card the control was drawn on", () => {
    const src = fnBody("removeKind", "ui/widgets/below-edit");
    expect(src).toContain("getFile(plugin.app, path)");
  });
});

describe("a reader on a second page who types the same name", () => {
  it("gets the type listed there rather than a refusal", () => {
    // A `local` kind is offered to nobody and drawn on the pages naming it, so
    // on a card that does not name it there is no group, no row in Settings and
    // nothing at all to find. Refusing the name would be the plugin saying the
    // type exists while showing them nowhere it does — and leaving them no door
    // to it, since the one Settings step that could reach it draws no row.
    const src = fnBody("addKindToJournal", "journals/kind-create");
    expect(src).toContain(
      "if (host && taken.local && !pageTypesOf(app, host).includes(taken.id)) {"
    );
    expect(src).toContain("await plugin.journals.listKindOnPage(host, taken.id);");
    // One `type:` value, one template, two cards that list it — so the kind is
    // returned rather than a second one being made under a suffixed id.
    expect(src).toContain("return taken;");
    // And the refusal still stands for a name the journal OFFERS, which is the
    // duplicate-group case it was written for.
    expect(src).toContain("already has a ${taken.label} note type.");
  });
});

describe("taking one back off", () => {
  it("is never the journal's last note type, and never keeps a default from going", () => {
    // The guard exists because a journal with no note types draws a card with
    // nothing in it and no way to add the next one, so the question it asks is
    // about what every index note has — the defaults.
    const src = fnBody("promptRemoveKind", "journals/kind-create");
    expect(src).toContain("const remaining = kind.local");
    expect(src).toContain("? cfg.kinds.length");
    expect(src).toContain(": cfg.kinds.filter((k) => !k.local).length;");
    // And it is that count the refusal is asked about, not the array's.
    expect(src).toContain("kindRemovalRefusal(");
    expect(src).toContain("remaining,");
    expect(src).not.toContain("cfg.kinds.length,");
  });

  it("does not tell the reader it is coming off every index", () => {
    // It was only ever on the cards listing it, and describing a reach it never
    // had is the kind of sentence a reader checks and finds untrue.
    const src = fnBody("promptRemoveKind", "journals/kind-create");
    expect(src).toContain("const reach = kind.local");
    expect(src).toContain("come off the cards listing it.");
    expect(src).toContain("and every other index in ${cfg.name}.");
  });
});
