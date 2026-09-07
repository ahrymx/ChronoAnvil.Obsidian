// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  CLASS_DEFS,
  TRACKER_CLASSES,
} from "../src/trackers/trackers";
import { DEFAULT_PATHS } from "../src/core/constants";
import { composeEntryTemplate } from "../src/diary/entry-sections";

// These lock the couplings the class table can't check itself, because the
// other half lives in a file it doesn't import: the shipped template assets,
// and the folders the migration reads. They exist so that adding a class — or
// renaming a template asset, or editing a template's frontmatter — fails here,
// loudly, at the seam, rather than at runtime as a note that won't classify or
// a template that never scaffolds.


// Takes TEXT now, not a filename: the entry templates are composed as of
// 2.60.1 and there is no file to read.
function frontmatterOf(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i === -1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

describe("class table ↔ the templates it composes", () => {
    it("every class composes a template", () => {
      // WAS "every class names an asset that exists". Since 2.60.1 there is no
      // asset: the templates are composed from the entry section catalogue, so
      // what a class must have is a template that BUILDS, not a file that sits
      // on disk. `templateAsset` is gone from the table with the files.
      for (const cls of TRACKER_CLASSES) {
        expect(composeEntryTemplate(cls), cls).toBeTruthy();
      }
    });

  it("each template asset carries the journal property its class classifies on", () => {
    // classifyNote reads a note's `journal` frontmatter to decide its class,
    // so a template whose journal value drifts from CLASS_DEFS.journalProperty
    // would spawn entries the plugin can't classify — the picker would offer
    // them nothing, silently.
    for (const cls of TRACKER_CLASSES) {
      const fm = frontmatterOf(composeEntryTemplate(cls));
      expect(fm.journal, `${cls} template's journal frontmatter`).toBe(
        CLASS_DEFS[cls].journalProperty
      );
    }
  });

  it("distinct classes don't collide on any table field", () => {
    // A shared journalProperty, templateFile or folderKey would make two
    // classes indistinguishable to classifyNote / the sync — a silent
    // merge, not an error.
    for (const field of [
      "journalProperty",
      "templateFile",
      "folderKey",
    ] as const) {
      const values = TRACKER_CLASSES.map((c) => CLASS_DEFS[c][field]);
      expect(new Set(values).size, `duplicate ${field}`).toBe(values.length);
    }
  });

  it("every class's folderKey resolves to a real configured path", () => {
    for (const cls of TRACKER_CLASSES) {
      const key = CLASS_DEFS[cls].folderKey;
      expect(typeof DEFAULT_PATHS[key], `${cls}.folderKey → ${key}`).toBe(
        "string"
      );
    }
  });

  it("derives one scaffold destination per class, under the given folder", () => {
    // `diaryTemplateAssets` is gone with the asset files (2.60.1). The claim it
    // made — one destination per class, derived from the table so a new class
    // needs no second edit — is now scaffold's own map, so it is asserted on
    // `templateFile` directly.
    const names = TRACKER_CLASSES.map((cls) => CLASS_DEFS[cls].templateFile);
    expect(new Set(names).size).toBe(TRACKER_CLASSES.length);
    for (const n of names) expect(n.endsWith(".md")).toBe(true);
  });
});
