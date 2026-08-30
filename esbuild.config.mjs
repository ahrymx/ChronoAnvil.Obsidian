// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";

import { watch } from "node:fs";
import { buildCss } from "./tools/build-css.mjs";
import { buildAssets } from "./tools/build-assets.mjs";

const production = process.argv[2] === "production";

// styles.css is generated from styles/*.css — see tools/build-css.mjs. Built
// here rather than as a separate npm script so that there is no ordering a
// caller can get wrong: every path that produces main.js produces the
// stylesheet beside it, and `npm run dev` picks up a CSS edit without a
// restart.
const css = buildCss();
console.log(`styles.css \u2190 ${css.files} files (${(css.bytes / 1024).toFixed(0)} KB)`);

// generated/bundled-assets.ts is generated from assets/ — see
// tools/build-assets.mjs. Here for the same reason as the stylesheet and one
// more: this one is an INPUT to the bundle rather than a sibling output, so a
// build that skipped it would fail to resolve scaffold.ts's import rather than
// merely ship something stale. Running it before esbuild is what lets assets/
// stay ordinary editable markdown.
const assets = buildAssets();
console.log(
  `bundled-assets.ts \u2190 ${assets.files} assets (${(assets.bytes / 1024).toFixed(0)} KB)`
);

// The notice that survives minification.
//
// esbuild drops ordinary comments, and only keeps ones it recognises as legal —
// `/*!`, `@license`, `@preserve`. The per-file SPDX headers in src/ are plain
// `//` comments, so every one of them is stripped from main.js. That left the
// shipped bundle carrying Chart.js's MIT banner (it uses `/*!`) and NOT
// ChronoAnvil's own, which is exactly backwards.
//
// main.js is the artefact a user actually installs, and for most users it is
// the ONLY form of ChronoAnvil they will ever hold. The licence it came under has
// to be legible from the file itself rather than only from a repository they
// may never visit, and the section 7 attribution terms bind only someone who
// has been given them — so the build has to put them there.
//
// This comment described a dual licence until 3.17.1, with a commercial tier
// and per-copy certificates. That was an early plan the project reversed; the
// licence files have said "one licence, no tiers, no paid edition" since. The
// comment was the last place still claiming otherwise, in a build script
// anyone reading the repository would see.
const banner = `/*!
 * ChronoAnvil — a self-contained journaling and study-journal system for Obsidian
 * Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
 *
 * @license AGPL-3.0-or-later
 *
 * Licensed under the GNU Affero General Public License, version 3 or later,
 * with attribution and naming terms under its section 7. See LICENSE.
 *
 * Source: https://github.com/AhryMX/ChronoAnvil.Obsidian
 * Contact: contact@ahrymx.dev
 *
 * This bundle also contains third-party code under the MIT licence
 * (Chart.js, @kurkle/color); their notices appear below and must be
 * preserved. See the NOTICE file distributed with this plugin.
 */`;

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: production,
});

if (production) {
  await context.rebuild();
  process.exit(0);
} else {
  // A CSS edit has to regenerate styles.css itself: esbuild is watching the
  // TypeScript graph and styles/ is not in it, so without this a stylesheet
  // change in dev would appear to do nothing at all.
  watch(new URL("styles", import.meta.url), { recursive: true }, () => {
    try {
      const { files } = buildCss();
      console.log(`styles.css rebuilt from ${files} files`);
    } catch (err) {
      console.error("CSS rebuild failed:", err.message);
    }
  });

  // assets/ is not in the TypeScript graph either, for the same reason — but
  // what it produces IS, so this watcher only has to regenerate the module and
  // esbuild's own watch picks the change up and rebuilds main.js. Without it,
  // editing the in-vault documentation during a dev session would appear to do
  // nothing until the next full build.
  watch(new URL("assets", import.meta.url), { recursive: true }, () => {
    try {
      const { files } = buildAssets();
      console.log(`bundled-assets.ts rebuilt from ${files} assets`);
    } catch (err) {
      console.error("Asset rebuild failed:", err.message);
    }
  });

  await context.watch();
}
