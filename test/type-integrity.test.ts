// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  TrackerDef,
  danglingTypeIds,
  diarySurface,
  journalSurface,
  resolveOrphanedTrackers,
  trackersScopedToType,
} from "../src/trackers/trackers";

// Deleting a journal type used to be a bare splice out of customJournals, which
// left every tracker scoped to it as a zombie: still in the registry, offerable
// nowhere, described by a raw id because describeSurface falls back to one.
// These cover the resolution, not the UI that calls it.

const t = (
  id: string,
  surface: TrackerDef["surface"]
): TrackerDef =>
  ({
    id,
    label: id,
    type: "number",
    surface,
    showInTemplate: false,
    showInBase: false,
  }) as TrackerDef;

const registry = (): TrackerDef[] => [
  t("Mood", diarySurface("daily")),
  t("confidence", journalSurface(null)),
  t("plating", journalSurface("cooking")),
  t("spice", journalSurface("cooking")),
  t("confidence-study", journalSurface("study")),
];

describe("finding the trackers a type owns", () => {
  it("names only the trackers scoped to that type", () => {
    expect(trackersScopedToType(registry(), "cooking").map((x) => x.id)).toEqual([
      "plating",
      "spice",
    ]);
  });

  it("never counts the all-journals wildcard", () => {
    // `typeId: null` means "every registered journal type", so it survives any
    // one of them going away — that is the whole point of the wildcard.
    for (const id of ["cooking", "study", "anything"]) {
      expect(trackersScopedToType(registry(), id).map((x) => x.id)).not.toContain(
        "confidence"
      );
    }
  });

  it("never counts a diary tracker", () => {
    expect(trackersScopedToType(registry(), "daily")).toEqual([]);
  });
});

describe("resolving them when the type goes", () => {
  it("widens them to every journal when asked to keep them", () => {
    const out = resolveOrphanedTrackers(registry(), "cooking", "widen");
    expect(out).toHaveLength(5);
    for (const id of ["plating", "spice"]) {
      expect(out.find((x) => x.id === id)!.surface).toEqual(journalSurface(null));
    }
  });

  it("removes them when asked to delete them", () => {
    const out = resolveOrphanedTrackers(registry(), "cooking", "delete");
    expect(out.map((x) => x.id)).toEqual([
      "Mood",
      "confidence",
      "confidence-study",
    ]);
  });

  it("leaves every other tracker untouched either way", () => {
    for (const how of ["widen", "delete"] as const) {
      const out = resolveOrphanedTrackers(registry(), "cooking", how);
      expect(out.find((x) => x.id === "Mood")!.surface).toEqual(
        diarySurface("daily")
      );
      expect(out.find((x) => x.id === "confidence")!.surface).toEqual(
        journalSurface(null)
      );
      expect(out.find((x) => x.id === "confidence-study")!.surface).toEqual(
        journalSurface("study")
      );
    }
  });

  it("is a no-op for a type that owns nothing", () => {
    const before = registry();
    expect(resolveOrphanedTrackers(before, "gardening", "delete")).toBe(before);
  });

  it("does not mutate the list it was given", () => {
    const before = registry();
    resolveOrphanedTrackers(before, "cooking", "widen");
    expect(before.find((x) => x.id === "plating")!.surface).toEqual(
      journalSurface("cooking")
    );
  });
});

describe("reporting scopes that name a type nobody provides", () => {
  it("names each unregistered type once", () => {
    const out = danglingTypeIds(registry(), new Set(["study"]));
    expect(out).toEqual(["cooking"]);
  });

  it("says nothing when every scope resolves", () => {
    expect(danglingTypeIds(registry(), new Set(["cooking", "study"]))).toEqual(
      []
    );
  });

  it("never reports the wildcard or a diary surface", () => {
    // The wildcard names no type, so there is no type for it to dangle from.
    const out = danglingTypeIds(registry(), new Set());
    expect(out.sort()).toEqual(["cooking", "study"]);
  });
});
