// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Which pages open in reading mode — 4.6.
//
// THE RULE IS PURE AND THE PLUMBING IS NOT, which is the whole reason
// `opensInReadingMode` takes two facts rather than a plugin: the suite has no
// workspace, so a hook that reads a view state and writes another cannot be
// exercised here at all. What CAN be pinned is the decision — three cases, two
// inputs — and the shape of the hook around it.

import { describe, expect, it } from "vitest";
import {
  EDITING_MODE,
  READING_MODE,
  VIEW_MODE_KEY,
  opensInReadingMode,
} from "../src/core/viewmode";
import { readCode, readSrc } from "./sources";

describe("what opens in reading mode", () => {
  it("puts a page ChronoAnvil recognises into reading mode", () => {
    // A journal note, a diary entry, a period dashboard, the homepage, Search,
    // the two folder-note dashboards, a managed template — `surfaceOfNote`
    // answers for all of them, and this is what that answer is used for.
    expect(opensInReadingMode(undefined, true)).toBe(true);
  });

  it("leaves a note it does not recognise alone", () => {
    expect(opensInReadingMode(undefined, false)).toBe(false);
  });

  it("lets the reader opt out in their own note, and that wins", () => {
    // THE CASE THAT MAKES THIS THE READER'S DECISION. A note ChronoAnvil composed
    // and recognises is still left alone when it says so.
    expect(opensInReadingMode(EDITING_MODE, true)).toBe(false);
  });

  it("honours an explicit ask on a note it has never heard of", () => {
    // Honouring the convention only on our own pages would be honouring half a
    // convention: `obsidianUIMode: preview` is what the plugin a reader may
    // already have reads, and it means the same thing here.
    expect(opensInReadingMode(READING_MODE, false)).toBe(true);
  });

  it("reads what a reader actually types", () => {
    expect(opensInReadingMode("  Source  ", true)).toBe(false);
    expect(opensInReadingMode("PREVIEW", false)).toBe(true);
    // A value that is neither falls through to recognition rather than being
    // guessed at in either direction.
    expect(opensInReadingMode("yes please", true)).toBe(true);
    expect(opensInReadingMode("yes please", false)).toBe(false);
    // And a key someone set to a non-string is not a string.
    expect(opensInReadingMode(true, false)).toBe(false);
    expect(opensInReadingMode(42, true)).toBe(true);
  });

  it("borrows the key rather than inventing one", () => {
    // 4.2 §1.3's argument for `banner:`, one release over: the convention a
    // reader may already have costs nothing to honour and buys them a plugin
    // they do not have to install.
    expect(VIEW_MODE_KEY).toBe("obsidianUIMode");
    expect(READING_MODE).toBe("preview");
    expect(EDITING_MODE).toBe("source");
  });
});

describe("the hook is narrow on purpose", () => {
  const main = readCode("main");

  it("listens to file-open and to nothing else", () => {
    // IT MUST NEVER UNDO A CTRL+E. `active-leaf-change` and `layout-change`
    // both fire when a reader is working inside an open note, and either would
    // turn "opens in reading mode" into "cannot be edited".
    expect(main).toContain('this.app.workspace.on("file-open"');
    expect(main).not.toContain('workspace.on("active-leaf-change"');
    expect(main).not.toContain('workspace.on("layout-change"');
  });

  it("does nothing to a note already in reading mode", () => {
    // Otherwise every tab switch writes a view state, with a history entry
    // behind it, to set the mode the note already had.
    expect(main).toContain('if (state.state?.mode === "preview") return;');
  });

  it("acts only on the view showing the file that was opened", () => {
    // `file-open` reports the workspace's active file; a stale or mismatched
    // leaf would be a page flipped because a different one was opened.
    expect(main).toContain("view.file?.path !== file.path");
  });

  it("asks the rule rather than re-deciding which notes are ChronoAnvil's", () => {
    expect(main).toContain("wantsReadingMode(this, file)");
    // And the recognition is `surfaceOfNote`'s, through the one-line predicate
    // — not a second list of paths.
    expect(readCode("viewmode")).toContain(
      "plugin.sections.canEditSections(file.path)"
    );
    expect(readSrc("viewmode")).not.toContain("settings.paths.home");
  });

  it("writes nothing into any note", () => {
    // The rule READS. No composer changed for this, no template gained a key,
    // and no note in the vault is rewritten — which is what makes it work on a
    // vault that already exists.
    const src = readCode("viewmode");
    expect(src).not.toContain("vault.modify");
    expect(src).not.toContain("processFrontMatter");
    expect(src).not.toContain("composeFlatNote");
  });
});
