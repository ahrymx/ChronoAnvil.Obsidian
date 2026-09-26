// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import type ChronoAnvilPlugin from "../main";
import {
  PAGE_GROUND_CLASSES,
  PAGE_GROUND_MARKER,
  groundClass,
  strengthClass,
} from "../core/page-grounds";

/** The class the accent wash is drawn by. Not a `ca-ground-*` name — see apply(). */
const TINT_CLASS = "ca-tinted-ground";

export class AppearanceManager {
  private readonly plugin: ChronoAnvilPlugin;

  constructor(plugin: ChronoAnvilPlugin) {
    this.plugin = plugin;
  }

  register(): void {
    this.apply();
  }

  apply(): void {
    const s = this.plugin.settings.appearance ?? {
      aestheticPreset: "editorial",
      grainAesthetics: "vibrant",
      pageGround: "scanline",
      pageGroundStrength: "standard",
    };

    const body = document.body;

    // Clear previous preset classes
    body.removeClass("ca-preset-modern", "ca-preset-editorial", "ca-preset-technical");
    body.removeClass("ca-grain-vibrant", "ca-grain-subtle", "ca-grain-monochrome");

    // Apply active preset (editorial is the default)
    if (s.aestheticPreset === "modern") {
      body.addClass("ca-preset-modern");
    } else if (s.aestheticPreset === "technical") {
      body.addClass("ca-preset-technical");
    } else {
      body.addClass("ca-preset-editorial");
    }

    // Apply grain intensity
    if (s.grainAesthetics === "subtle") {
      body.addClass("ca-grain-subtle");
    } else if (s.grainAesthetics === "monochrome") {
      body.addClass("ca-grain-monochrome");
    } else {
      body.addClass("ca-grain-vibrant");
    }

    // ── The page ground (4.80) ────────────────────────────────────────────
    body.removeClasses(PAGE_GROUND_CLASSES);

    const ground = s.pageGround ?? "scanline";
    if (ground !== "off") {
      body.addClass(PAGE_GROUND_MARKER);
      body.addClass(groundClass(ground));
      body.addClass(strengthClass(s.pageGroundStrength ?? "standard"));
    }

    // ── The accent wash (1.0.42) ──────────────────────────────────────────
    //
    // OUTSIDE THE `ca-ground-*` FAMILY ON PURPOSE. `PAGE_GROUND_CLASSES` is
    // generated from the ground and strength tables, so a class spelled
    // `ca-ground-tint` would sit next to nineteen names that are ids from a
    // table and be removed by nothing — until somebody adds a texture called
    // "tint" and it is removed by everything. `ca-tinted-ground` cannot collide
    // with either generated name.
    //
    // AND IT IS NOT GATED ON THE GROUND BEING ON. A reader with the texture set
    // to Off still gets the wash, because the two answer different questions —
    // "is there a pattern behind my notes" and "does a note's background say
    // which note it is". `12-grounds.css` clears the opaque surfaces above it
    // for either class, which is what makes the second one work alone.
    body.removeClass(TINT_CLASS);
    if (s.groundTint ?? true) body.addClass(TINT_CLASS);
  }

  unload(): void {
    document.body.removeClass(
      "ca-preset-modern",
      "ca-preset-editorial",
      "ca-preset-technical",
      "ca-grain-vibrant",
      "ca-grain-subtle",
      "ca-grain-monochrome",
      TINT_CLASS
    );
    document.body.removeClasses(PAGE_GROUND_CLASSES);
  }
}
