// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The vault root is a folder — 4.44.0.
//
// WHAT WENT WRONG, IN ONE LINE. Every scope test in this plugin asks whether a
// path starts with `folder + "/"`, and the root's path is `/`, so a root-scoped
// widget watched for the prefix `//` — which no path in any vault begins with.
// The homepage's `tasks-table` is the widget whose whole scope is the root, so
// it is the one that showed it: "No notes here yet", on a vault holding 135
// open tasks across 98 notes.
//
// THE TESTS RUN THE RESOLVERS RATHER THAN READING THEM, which is 4.43.0's
// lesson taken from the other side. A suite that asserted `filesUnder` contains
// `normalizePath(folderPath) + "/"` would have been green for three releases
// while the homepage rendered nothing — it would have been pinning the defect.
// So the vault below is real enough to be read, and what is asserted is which
// files come back.

import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";

import { filesUnder, folderPrefix, isVaultRoot } from "../src/core/util";
import type { App } from "obsidian";
import { homeSectionModel, composeHomeNote } from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { WIDGETS } from "../src/core/widget-registry";
import { argCandidates } from "../src/ui/arg-suggest";
import { journalFolderScope } from "../src/journals/journal";
import { readSrc } from "./sources";

const ROOT = DEFAULT_PATHS.diaryRoot;

// A vault as `filesUnder` sees one: markdown files by path, and nothing else.
const vaultOf = (paths: readonly string[]): App =>
  ({
    vault: { getMarkdownFiles: (): TFile[] => paths.map((p) => new TFile(p)) },
  }) as unknown as App;

const VAULT = [
  "Homepage.md",
  "02 - Diary/02 - Diary.md",
  "02 - Diary/Daily/Day-2026-08-19.md",
  "03 - Journals/Study/Study.md",
  "03 - Journals/Study/Maths/Algebra.md",
];

describe("the vault root, and its four spellings", () => {
  it("knows each of them, and mistakes no folder for one", () => {
    // FOUR, BECAUSE FOUR THINGS PRODUCE THEM. `""` is a path with no slash cut
    // at its last slash; `/` is what Obsidian's root TFolder carries and so what
    // `file.parent.path` hands every widget on a top-level note; `.` and `./`
    // are what a reader types when they mean "from here down".
    for (const spelling of ["", "/", ".", "./", "  ", " / "]) {
      expect(isVaultRoot(spelling), JSON.stringify(spelling)).toBe(true);
    }
    for (const folder of ["02 - Diary", "/02 - Diary", "./02 - Diary", "..", "a/."]) {
      expect(isVaultRoot(folder), folder).toBe(false);
    }
  });

  it("has no prefix at all, which is what every path in the vault starts with", () => {
    // THE BUG, STATED AS THE ARITHMETIC IT WAS. `normalizePath("/") + "/"` is
    // `"//"`, and `"Homepage.md".startsWith("//")` is false — so is every other
    // path, in every vault, forever.
    expect(folderPrefix("/")).toBe("");
    expect(folderPrefix("")).toBe("");
    expect(folderPrefix("./")).toBe("");
    expect(VAULT.every((p) => p.startsWith(folderPrefix("/")))).toBe(true);
    expect(VAULT.some((p) => p.startsWith("//"))).toBe(false);

    // AND A FOLDER IS STILL A FOLDER. The fix is the root case, not a widening
    // of what "under" means: a trailing slash on the prefix is what stops
    // `02 - Diary` from claiming `02 - Diary Archive/…`.
    expect(folderPrefix("02 - Diary")).toBe("02 - Diary/");
    expect(folderPrefix("02 - Diary/")).toBe("02 - Diary/");
  });

  it("reads the whole vault under the root and a subtree under a folder", () => {
    const app = vaultOf(VAULT);
    const paths = (folder: string): string[] =>
      filesUnder(app, folder).map((f) => f.path);

    for (const spelling of ["", "/", ".", "./"]) {
      expect(paths(spelling), JSON.stringify(spelling)).toEqual([...VAULT]);
    }
    expect(paths("02 - Diary")).toEqual([
      "02 - Diary/02 - Diary.md",
      "02 - Diary/Daily/Day-2026-08-19.md",
    ]);
    // Recursive, and the host note's own folder note comes with it — which is
    // what a folder-scoped rollup on a folder note has always meant.
    expect(paths("03 - Journals/Study")).toHaveLength(2);
    expect(paths("03 - Journals/Nothing")).toEqual([]);
  });
});

describe("resolving a bare directive on a note at the top of the vault", () => {
  // `journalFolderScope` is the one grammar `tasks-table`, `review-queue` and
  // `journal-search` share, so what it calls "nowhere" all three believe.
  const scope = (arg: string, host: string | null): string[] =>
    journalFolderScope({} as never, arg, host);

  it("answers with the root rather than with nothing", () => {
    // TRUTHY WAS THE TEST AND THE ROOT IS FALSY WHEN IT IS SPELLED `""` — so a
    // bare directive on a top-level note resolved to NO folder, and the widget
    // did not draw an empty state, it did not draw at all.
    expect(scope("", "")).toEqual([""]);
    expect(scope("", "/")).toEqual(["/"]);
    expect(scope("", "02 - Diary")).toEqual(["02 - Diary"]);
  });

  it("still says nothing where there is genuinely no host", () => {
    // `null` is the one value that means the caller has no host to offer — a
    // journal TEMPLATE, composed once and used in every folder of its level.
    // Widening the root case must not widen that one.
    expect(scope("", null)).toEqual([]);
  });

  it("takes a written root spelling as the folder it is", () => {
    expect(scope("./", "02 - Diary")).toEqual(["./"]);
  });
});

describe("the homepage's open tasks widget", () => {
  const model = homeSectionModel(ROOT, "");
  const home = composeHomeNote(ROOT);
  const tasks = model.sections(home).find((s) => s.id === "tasks");
  const question = tasks?.questions?.find((q) => q.key === "folder");
  const composed = model.present(home);

  it("asks which folder to collect tasks from, as every other copy of it does", () => {
    // THE MISSING FIELD, WHICH IS HALF THE REPORT. The diary dashboard, the
    // journals dashboard and every journal index have declared this question
    // over this directive since 3.15. The homepage's copy did not, so the
    // section editor drew a row with a Remove button and nothing to answer —
    // and "the whole vault" was a scope the reader could not confirm or change.
    expect(question?.kind).toBe("folder");
    expect(question?.directive).toBe("tasks-table");
    expect(question?.label).toBe("the folder to collect tasks from");
    // NOT INERT. A folder question with a null `hostFolder` is drawn as the old
    // fixed wording — that is the template surface, which has no host folder to
    // fall back to. The homepage has one: the vault root, spelled `""`, which
    // is a KNOWN folder and not an absent one.
    expect(question && "hostFolder" in question ? question.hostFolder : null).toBe("");
  });

  it("says what empty means here, because 'this note's folder' does not", () => {
    // The homepage's own folder IS the vault root, so the ordinary placeholder
    // is true and tells the reader nothing — they cannot tell this widget from
    // one pointed at a folder that happens to be empty.
    expect(
      question && "emptyLabel" in question ? question.emptyLabel : undefined
    ).toBe("the whole vault");
  });

  it("writes an answer into its own line and leaves the rest of the row alone", () => {
    // The tasks table shares a fence with the diary card, the launcher and
    // Coming up (which took On this day's cell in 4.70). A splice into the
    // directive's own span is what keeps the other three byte-identical.
    const out = model.apply(home, [
      ...composed.filter((id) => id !== "tasks"),
      { id: "tasks", options: { folder: "02 - Diary" } },
    ]) as string;
    expect(out).toContain("tasks-table:02 - Diary");
    expect(out.split("\n").filter((l) => l.startsWith("tasks-table"))).toHaveLength(1);
    for (const untouched of ["diary:3", "launcher", "logbook"]) {
      expect(out).toContain(untouched);
    }

    // AND READS IT BACK OFF THAT LINE, which is what seeds the box next time.
    const back = model.sections(out).find((s) => s.id === "tasks");
    expect(back?.answered?.folder).toBe("02 - Diary");
  });

  it("goes bare again when the box is emptied, rather than trailing a colon", () => {
    const pointed = model.apply(home, [
      ...composed.filter((id) => id !== "tasks"),
      { id: "tasks", options: { folder: "02 - Diary" } },
    ]) as string;
    const cleared = model.apply(pointed, [
      ...composed.filter((id) => id !== "tasks"),
      { id: "tasks", options: { folder: "" } },
    ]) as string;
    expect(cleared).toContain("tasks-table\n");
    expect(cleared).not.toContain("tasks-table:");
    // The bare form is what the composer writes, so clearing the box gets the
    // page back exactly — the property "a directive with no argument never
    // needs updating" is worth nothing if the round trip does not close.
    expect(cleared).toBe(home);
  });

  it("still composes bare, so the shipped page names no path", () => {
    expect(home).toContain("\ntasks-table\n");
    expect(home).not.toContain("tasks-table:");
  });
});

describe("saying 'the whole vault' from a note that is not at the top of it", () => {
  it("offers the spelling, because empty cannot mean this anywhere else", () => {
    // `""` means the HOST's folder, and `vaultFolders` deliberately leaves the
    // root out of its list for exactly that reason — so before this there was
    // no answer a reader could give that meant the vault.
    const keywords = WIDGETS["tasks-table"].arg?.keywords ?? [];
    expect(keywords).toEqual([{ value: "./", label: "The whole vault" }]);
    // AND STILL NO `all`, which names several journal roots and would resolve to
    // the first one alone. `./` names one folder, which is the difference.
    expect(keywords.map((k) => k.value)).not.toContain("all");
  });

  it("draws it by its name rather than as a path", () => {
    const shown = argCandidates("", ["02 - Diary"], [
      { value: "./", label: "The whole vault" },
    ]);
    expect(shown[0]).toEqual({ value: "./", label: "The whole vault", keyword: true });
  });
});

// ── the wording, and the watcher ──────────────────────────────────────────
//
// Two source assertions, and both are about text a running plugin produces that
// no unit test in this suite can reach: the callout inside an async `.then`, and
// the predicate a LiveWidget is constructed with.
describe("what a root-scoped table says and watches", () => {
  const tables = readSrc("tables");

  it("names the vault instead of printing the path `/`", () => {
    expect(tables).toContain("Open tasks from every note in the vault collect here");
    expect(tables).toContain("No open tasks anywhere in the vault");
    // The folder is still printed where it IS a folder — this is a second
    // sentence for the root, not a replacement of the one that was right.
    expect(tables).toContain("Open tasks from notes under ${folder} collect here");
  });

  it("said 'Vault' in the cycle too, for as long as there was one", () => {
    // 4.44.0 fixed this wording in two places: the empty-state callouts above,
    // and the scope button, where a carried `tasks-table:./` was labelled
    // "Path" over a scope that is not a path.
    //
    // THE BUTTON WENT IN 5.21 AND THIS HALF WENT WITH IT. Asserted as an
    // absence rather than deleted, because the surviving half is the same
    // wording rule and a control reintroduced here would have to answer it
    // again: at the root, name the vault, do not print `/`.
    expect(tables).not.toContain('label: argAtRoot ? "Vault" : "Path"');
    expect(tables).not.toContain("argAtRoot");
    // `./` is still a scope a reader can WRITE — the keyword above offers it —
    // so what it renders at the root still has to say "the vault".
    expect(tables).toContain("in the vault");
  });

  it("watches every note in the vault when the scope is the root", () => {
    // THE SILENT HALF OF THE BUG. `shouldRefresh` compared against `"//"`, so a
    // root-scoped widget refreshed for its own host note and for nothing else:
    // it would paint correct rows once and then sit there while tasks were
    // ticked underneath it.
    const live = readSrc("live-widgets");
    expect(live).toContain("const prefixes = folders.map(folderPrefix);");
    expect(live).not.toContain('const prefixes = folders.map((f) => normalizePath(f) + "/");');
  });
});
