// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { only } from "../src/ui/modals";

import { readSrc } from "./sources";
// ── controls that aren't decisions ────────────────────────────────────────
//
// A control whose value cannot change spends a reader's attention and returns
// nothing, and teaches that there is a decision where there is none. 2.54.7
// found a required dropdown with one option on every new-note popup in the
// plugin, and it had been there for releases.
//
// What is asserted here is not "always take the only option" — that rule is
// wrong in two places and dangerous in one of them. It is that each picker has
// DECIDED, and that the two which must keep asking say why.

describe("taking the only option", () => {
  it("returns it when there is exactly one", () => {
    expect(only(["03 - Journals/Cooking"])).toBe("03 - Journals/Cooking");
  });

  it("returns null for none, so the caller keeps its own empty message", () => {
    // Every caller already has a better sentence for empty than a helper could
    // — "No folders yet — create one first" beats anything generic.
    expect(only([])).toBeNull();
  });

  it("returns null for several, so the caller asks", () => {
    expect(only(["a", "b"])).toBeNull();
  });
});

describe("which pickers take it", () => {
  const src = (f: string) => readSrc(f);

  it("takes the only parent folder, because the folder is bookkeeping", () => {
    // The reader asked to create a folder. Which parent it goes under is not
    // the request when there is one parent.
    expect(src("journal.ts")).toContain("only(parents)");
  });

  it("takes the only target folder, for the same reason", () => {
    expect(src("journal.ts")).toContain("only(options)");
  });
});

describe("which pickers must not, and say so", () => {
  const src = (f: string) => readSrc(f);

  it("still asks before removing the last tracker from an entry", () => {
    // The branch where the convenient rule is the destructive one. Auto-firing
    // deletes something the reader never confirmed, and a picker is the only
    // confirmation this command has.
    const text = src("entry-tracker-manager.ts");
    expect(text).toContain("KEEPS ASKING AT ONE");
    expect(text).not.toContain("only(present)");
  });

  it("still asks which section to add when one is left", () => {
    // Not destructive, but the section is the substance of the request rather
    // than bookkeeping around it — taking it would write a block into the note
    // without ever naming it.
    const text = src("section-insert.ts");
    expect(text).toContain("KEEPS ASKING AT ONE");
    expect(text).not.toContain("only(options)");
  });

  it("names the rule in one place rather than arguing it at each site", () => {
    // It had been argued three separate ways before this patch — a
    // short-circuit in charts-manager, a `scopes.length > 1` branch in
    // chart-ui, and a hidden field in modals — with no shared statement. The
    // sites keep their comments; the reasoning lives once.
    const text = src("modals.ts");
    expect(text).toContain("worse than no control");
    expect(text).toContain("is not consent");
  });
});

describe("pickers that were already right", () => {
  const src = (f: string) => readSrc(f);

  it("keeps charts-manager's short-circuit", () => {
    expect(src("charts-manager.ts")).toContain("specs.length === 1");
  });

  it("keeps chart-ui's single-scope statement", () => {
    // "Only a question when there are two answers" — the same rule, found
    // independently, kept because the branch is load-bearing rather than
    // superstitious.
    expect(src("chart-ui.ts")).toContain("scopes.length > 1");
  });

  it("keeps the layout field hidden at one layout", () => {
    expect(src("modals.ts")).toContain("this.templates.length > 1");
  });
});
