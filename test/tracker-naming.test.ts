// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  propertyNameFromLabel,
  uniquePropertyName,
} from "../src/trackers/trackers";

// The whole value of deriving the property name from the label is that it is
// PREDICTABLE — a reader types "🏃 KM" and can say, before looking, what key
// their notes are about to carry. A derivation nobody can assert on has none
// of that value, so it gets asserted on here rather than being left to the
// modal that calls it.
describe("propertyNameFromLabel", () => {
  it("drops the leading emoji a label is decorated with", () => {
    // The emoji is decoration on the label; a frontmatter key nobody can type
    // into a Bases filter is not a key.
    expect(propertyNameFromLabel("🏃 KM")).toBe("KM");
  });

  it("keeps a word's own capitalisation rather than title-casing it", () => {
    // "KM" must not come back as "Km": the reader wrote an initialism, and
    // lowercasing the rest of it would be the derivation editing their label.
    expect(propertyNameFromLabel("KM")).toBe("KM");
    expect(propertyNameFromLabel("🩺 BPM resting")).toBe("BPMResting");
  });

  it("joins words in PascalCase instead of keeping the spaces", () => {
    // A spaced key has to be quoted the moment anything touches it
    // programmatically; the built-ins ("Mood", "Sleep") set the precedent.
    expect(propertyNameFromLabel("Beers drunk")).toBe("BeersDrunk");
    expect(propertyNameFromLabel("  weight   in kg  ")).toBe("WeightInKg");
  });

  it("treats punctuation as a word break rather than carrying it through", () => {
    expect(propertyNameFromLabel("Wake-up time")).toBe("WakeUpTime");
    expect(propertyNameFromLabel("Screen time (hrs)")).toBe("ScreenTimeHrs");
  });

  it("keeps digits, which are part of a name and not noise", () => {
    expect(propertyNameFromLabel("5k pace")).toBe("5kPace");
  });

  it("produces a key from a non-Latin label instead of nothing at all", () => {
    // \p{L} rather than [a-z]: a label in Greek or Cyrillic is a label, and
    // silently deriving "" from it would leave the reader staring at an empty
    // field with no idea why.
    expect(propertyNameFromLabel("Στάθμη")).toBe("Στάθμη");
  });

  it("returns empty for a label with nothing derivable in it", () => {
    // The caller treats this as \"leave the id alone\" — validate() should
    // complain about a field the reader emptied, not one the derivation did.
    expect(propertyNameFromLabel("🙂")).toBe("");
    expect(propertyNameFromLabel("   ")).toBe("");
  });
});

describe("uniquePropertyName", () => {
  it("leaves a free name alone", () => {
    expect(uniquePropertyName("Weight", ["Mood", "Sleep"])).toBe("Weight");
  });

  it("suffixes a taken one rather than handing back a clash", () => {
    // Typing a label whose derived key is taken should land on a free key, not
    // on a save the reader has to go and unblock.
    expect(uniquePropertyName("Weight", ["Weight"])).toBe("Weight2");
    expect(uniquePropertyName("Weight", ["Weight", "Weight2"])).toBe("Weight3");
  });

  it("does not count the tracker being edited as a clash with itself", () => {
    // Re-deriving an existing draft's own name must be a no-op, or every
    // keystroke in the label field would walk the id up a counter.
    expect(uniquePropertyName("Weight", ["Weight"], "Weight")).toBe("Weight");
  });

  it("passes an empty base straight through", () => {
    // Nothing derivable means nothing to make unique; the caller decides what
    // to do about it.
    expect(uniquePropertyName("", ["Weight"])).toBe("");
  });
});
