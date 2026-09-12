// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Starting from a preset failed on the Identity step, silently. 3.21.1.
//
// TWO BUGS, AND THEY HID EACH OTHER. The wizard refused the Study preset before
// the reader had touched anything — and then showed the refusal as a red bar
// with no text in it, because `--background-modifier-error` and `--text-error`
// resolve to the same red in Obsidian's current default themes. So the visible
// symptom was a blank error, which is the one shape of failure that tells a
// reader nothing at all: something is wrong, and not a word about what.
//
// Worth writing down that the second bug is the more serious one. The first
// made one preset uninstallable; the second would have made ANY validation
// message in this window invisible — every "give the journal a name", every
// folder collision, every duplicate id — on a default install.

import { describe, expect, it } from "vitest";
import { JournalEditModal } from "../src/core/settings-editors";
import { presetAsNewJournal } from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import { STUDY_PRESET } from "../src/journals/journal";
import type ChronoAnvilPlugin from "../src/main";
import { readCss } from "./sources";

const PATHS = {
  journalsRoot: "03 - Journals",
  templates: "00 - Infrastructure/Templates",
};

// Only what the validation path reads. `getAbstractFileByPath` is the vault
// probe `occupiedFolders` uses, and `occupied` is the list of paths this fake
// vault claims already exist.
//
// `notes` MAPS A NOTE PATH TO ITS `type:`, and it is what makes the adoption
// half of the refusal testable at all. The old fake had no notes in it, so the
// test below that claimed to check the adoption route "when that folder is
// already a journal's" was checking a folder that held nothing — it passed for
// every collision, including the ones where adoption is not on offer, which is
// the bug it was supposed to be guarding.
const fakePlugin = (
  journals: JournalConfig[] = [],
  occupied: string[] = [],
  notes: Record<string, string> = {},
  dismissed: string[] = []
): ChronoAnvilPlugin => {
  const files = Object.keys(notes).map((path) => ({ path }));
  return {
    settings: {
      customJournals: journals,
      paths: PATHS,
      dismissedJournalFolders: dismissed,
    },
    app: {
      vault: {
        getAbstractFileByPath: (p: string) =>
          occupied.includes(p) ? ({} as never) : null,
        getMarkdownFiles: () => files,
      },
      metadataCache: {
        getFileCache: (f: { path: string }) => ({
          frontmatter: notes[f.path] ? { type: notes[f.path] } : {},
        }),
      },
    },
  } as unknown as ChronoAnvilPlugin;
};

class Probe extends JournalEditModal {
  identityProblem(): string | null {
    return this["validateIdentity"]();
  }
  stepProblem(): string | null {
    return this.stepList()[0].validate?.() ?? null;
  }
}

const wizard = (plugin: ChronoAnvilPlugin, draft: JournalConfig): Probe =>
  new Probe(
    (plugin as unknown as { app: never }).app,
    plugin,
    draft,
    "create",
    -1,
    async () => {}
  );

const studyDraft = (): JournalConfig => presetAsNewJournal(STUDY_PRESET, PATHS);

describe("starting from a preset", () => {
  it("passes the Identity step untouched", () => {
    // THE REPORT. `idIsFree` reserved the literal id "study", which was right
    // while Study lived outside `customJournals` and invisible to the loop that
    // checks for collisions — and became a rule that the one journal ChronoAnvil
    // ships is the one journal it will not let you install.
    const p = wizard(fakePlugin(), studyDraft());
    expect(p.identityProblem()).toBeNull();
    expect(p.stepProblem()).toBeNull();
  });

  it("keeps the id the preset carries", () => {
    // Not incidental: `type: lesson` in a reader's notes is matched through the
    // journal that declares it, so a preset installed under a re-slugged id
    // would classify none of them.
    expect(studyDraft().id).toBe("study");
  });

  it("still refuses a second journal with the same id", () => {
    // The collision the reserved clause was standing in for. It is caught by
    // the ordinary loop now, because Study is in the list the loop reads.
    const p = wizard(fakePlugin([studyDraft()]), studyDraft());
    expect(p.identityProblem()).toContain("already uses the id");
  });

  it("still refuses to claim a folder that already exists", () => {
    const p = wizard(fakePlugin([], ["03 - Journals/Study"]), studyDraft());
    expect(p.identityProblem()).toContain("already exists");
  });

  it("points at adoption when that folder is already a journal's", () => {
    // The right route since 3.21: removing a journal no longer reserves its
    // folder, so a reader putting Study back should adopt those notes rather
    // than create a second journal beside them. The old wording offered only
    // the two answers that lose them.
    //
    // THE NOTES ARE THE POINT OF THE FIXTURE. This is the route being offered
    // because the folder holds notes that say what they are, which is the same
    // question discovery asks before offering the folder under "Found in the
    // vault". Without one, the test below is what happens instead.
    const p = wizard(
      fakePlugin([], ["03 - Journals/Study"], {
        "03 - Journals/Study/Maths/Surds.md": "topic",
      }),
      studyDraft()
    );
    expect(p.identityProblem()).toContain('can import "03 - Journals/Study"');
  });

  it("does not point at adoption for a folder of ordinary notes", () => {
    // THE REPORTED DEAD END. The refusal closed with "adopt it from Settings →
    // Journals if those notes are already a journal's" for every collision,
    // and discovery ignores a folder of ordinary notes on purpose — stated as
    // an invariant in journal-discovery.test.ts. So a reader who copied a
    // folder of plain notes into the journals tree was refused, sent to a
    // section that was not on the page, and left with no route at all.
    const p = wizard(
      fakePlugin([], ["03 - Journals/Study"], {
        "03 - Journals/Study/Notes from last term.md": "",
      }),
      studyDraft()
    );
    const problem = p.identityProblem() ?? "";
    expect(problem).toContain("already exists");
    expect(problem).not.toContain("can import");
  });

  it("does not point at adoption for a folder the reader has set aside", () => {
    // "Not a journal — stop offering it" is the reader saying so out loud. The
    // refusal must not then tell them to go and import it.
    const p = wizard(
      fakePlugin(
        [],
        ["03 - Journals/Study"],
        { "03 - Journals/Study/Maths/Surds.md": "topic" },
        ["03 - Journals/Study"]
      ),
      studyDraft()
    );
    expect(p.identityProblem() ?? "").not.toContain("can import");
  });

  it("counts what claiming the folder would take in", () => {
    // "14 notes" is a thing a reader pictures; "everything in it" is not.
    const p = wizard(
      fakePlugin([], ["03 - Journals/Study"], {
        "03 - Journals/Study/Maths/Surds.md": "topic",
        "03 - Journals/Study/Maths/Logs.md": "topic",
        "03 - Journals/Physics/Optics.md": "topic",
      }),
      studyDraft()
    );
    // Two, not three: the note under a sibling folder is not this folder's.
    expect(p.identityProblem()).toContain("the 2 notes in it");
  });

  it("names both folders at once rather than one refusal each", () => {
    // THE REPORTED TRIP. The check stopped at the notes root, so a reader who
    // had copied a journal in with its templates moved the folder it named,
    // pressed Next, and was refused a second time over a templates folder the
    // first refusal had never mentioned.
    const p = wizard(
      fakePlugin([], [
        "03 - Journals/Study",
        "00 - Infrastructure/Templates/Study",
      ]),
      studyDraft()
    );
    const problem = p.identityProblem() ?? "";
    expect(problem).toContain("03 - Journals/Study");
    expect(problem).toContain("00 - Infrastructure/Templates/Study");
    expect(problem).toContain("already exist.");
  });

  it("describes a templates collision as a templates collision", () => {
    // One string used to cover both paths, because the check only ever
    // returned one of them — so a templates folder that was in the way was
    // described as a claim on notes that are not in it.
    const p = wizard(
      fakePlugin([], ["00 - Infrastructure/Templates/Study"]),
      studyDraft()
    );
    const problem = p.identityProblem() ?? "";
    expect(problem).toContain("templates would be written into it");
    expect(problem).not.toContain("trackers and crumbs");
  });
});

describe("a validation message a reader can read", () => {
  const css = (): string => readCss();

  it("does not put red text on a red panel", () => {
    // `--background-modifier-error` and `--text-error` resolve to the same red
    // in Obsidian's current default themes, so the bar rendered as a solid
    // block with its message invisible inside it.
    // DECLARATIONS ONLY, comments stripped — the rule explains what it stopped
    // doing, and a naive substring check trips on its own explanation.
    const rule = css().slice(
      css().indexOf(".ca-editor-error {"),
      css().indexOf(".ca-editor-error:empty")
    );
    const declarations = rule
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(":"));
    expect(declarations).not.toContain(
      "background: var(--background-modifier-error);"
    );
    expect(declarations.some((d) => d.includes("--color-red-rgb"))).toBe(true);
    expect(declarations).toContain("color: var(--text-error);");
  });

  it("still follows the theme rather than a fixed colour", () => {
    // The tint is composed from the theme's own red, which is what the rule it
    // replaces was trying to do.
    const rule = css().slice(css().indexOf(".ca-editor-error {"));
    expect(rule).toMatch(/rgba\(var\(--color-red-rgb\)/);
  });

  it("takes up no room when it has nothing to say", () => {
    // An empty message is a bug rather than a state, but it rendered as a bare
    // red bar — which is precisely the symptom that got reported.
    expect(css()).toContain(".ca-editor-error:empty");
  });
});
