// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "test/obsidian-stub.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // `src/` only. `generated/` is compiled from `assets/` and `tools/` is
      // build machinery — neither ships inside `main.js` as authored code, and
      // counting them would move the number without moving the risk.
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "html", "json-summary"],
      reportsDirectory: "coverage",
      // NO THRESHOLDS, DELIBERATELY. A large part of this suite asserts the
      // SHAPE of the source (`readSrc` structural checks, 460-odd of them)
      // rather than running it, so line coverage understates what is actually
      // pinned. A threshold here would either be set so low it asserts
      // nothing, or would fail the build for tests that are doing their job.
      // The number is a map of where runtime exercise is thin — read it, do
      // not gate on it.
    },
  },
});
