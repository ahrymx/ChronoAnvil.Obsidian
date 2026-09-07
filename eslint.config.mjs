// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["main.js", "node_modules/**", "esbuild.config.mjs"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `app` and `moment` ARE GLOBALS IN AN OBSIDIAN PLUGIN, and both are on the
    // review checklist as things a plugin must not read that way: the global
    // `app` is a convenience Obsidian does not promise to keep, and the global
    // `moment` is whatever locale another plugin last configured. Declared here
    // so ESLint resolves a bare reference to the global scope rather than
    // leaving it unresolved — which is what makes the restriction below able to
    // see it at all.
    //
    // A LOCAL OF THE SAME NAME SHADOWS THE GLOBAL AND IS NOT FLAGGED, which is
    // the whole reason this is a lint rule and not a grep. Nearly every file
    // that touches `app` in this codebase takes it as a parameter or reads
    // `plugin.app` into a const, and a text search cannot tell those from the
    // real thing — one was read as a finding during the 5.0.0 store-readiness
    // pass on exactly that mistake. This rule answered the question in one run,
    // and now keeps answering it.
    languageOptions: {
      globals: { app: "readonly", moment: "readonly" },
    },
    // Underscore-prefixed args/vars are intentionally unused (interface
    // conformance, placeholder params). Applies across src and test.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "app",
          message:
            "Use the App this function was given — take it as a parameter, or " +
            "read plugin.app / this.app. The global is not part of Obsidian's " +
            "public API.",
        },
        {
          name: "moment",
          message:
            "Import moment from `core/util`, which re-exports Obsidian's own " +
            "and types it callable. The global carries whatever locale another " +
            "plugin last set.",
        },
      ],
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
