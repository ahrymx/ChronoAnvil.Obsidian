// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import type AlmanacPlugin from "../main";
import {
  PAGE_GROUND_CLASSES,
  PAGE_GROUND_MARKER,
  groundClass,
  strengthClass,
} from "../core/page-grounds";

export class AppearanceManager {
  private readonly plugin: AlmanacPlugin;

  constructor(plugin: AlmanacPlugin) {
    this.plugin = plugin;
  }

  register(): void {
    this.apply();
  }

  apply(): void {
    const s = this.plugin.settings.appearance ?? {
      aestheticPreset: "modern",
      grainAesthetics: "vibrant",
    };

    const body = document.body;

    // Clear previous preset classes
    body.removeClass("am-preset-modern", "am-preset-editorial", "am-preset-technical");
    body.removeClass("am-grain-vibrant", "am-grain-subtle", "am-grain-monochrome");

    // Apply active preset
    if (s.aestheticPreset === "editorial") {
      body.addClass("am-preset-editorial");
    } else if (s.aestheticPreset === "technical") {
      body.addClass("am-preset-technical");
    } else {
      body.addClass("am-preset-modern");
    }

    // Apply grain intensity
    if (s.grainAesthetics === "subtle") {
      body.addClass("am-grain-subtle");
    } else if (s.grainAesthetics === "monochrome") {
      body.addClass("am-grain-monochrome");
    } else {
      body.addClass("am-grain-vibrant");
    }

    // ── The page ground (4.80) ────────────────────────────────────────────
    //
    // CLEARED FROM THE TABLE AND NOT FROM MEMORY. There are nineteen of these
    // and the class that was applied last time is not something this method
    // knows — it may have been applied by a previous session, or by a version
    // that had a ground this one does not. Removing the whole set is the only
    // clear that cannot leave one behind, and it is why `PAGE_GROUND_CLASSES`
    // exists rather than a `groundClass(s.pageGround)` call here.
    body.removeClasses(PAGE_GROUND_CLASSES);

    // `off` is the default and the state of every vault saved before 4.80, so
    // the marker goes on only when there is something to draw. Without it the
    // shared film rules do not match at all, which is what makes Off cost
    // nothing rather than cost a transparent overlay on every note.
    const ground = s.pageGround ?? "off";
    if (ground !== "off") {
      body.addClass(PAGE_GROUND_MARKER);
      body.addClass(groundClass(ground));
      body.addClass(strengthClass(s.pageGroundStrength ?? "standard"));
    }
  }

  unload(): void {
    document.body.removeClass(
      "am-preset-modern",
      "am-preset-editorial",
      "am-preset-technical",
      "am-grain-vibrant",
      "am-grain-subtle",
      "am-grain-monochrome"
    );
    document.body.removeClasses(PAGE_GROUND_CLASSES);
  }
}
