// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Concatenates styles/*.css into the styles.css that Obsidian loads.
//
// WHY A CONCATENATION AND NOT A BUNDLER
//
// styles.css was a single 9,794-line file. It was split in 2.56.25 along the
// section banners it already carried, which is the whole of the change: no
// rule was rewritten and no selector renamed. The build puts it back together
// in filename order.
//
// A CSS bundler would have been the wrong tool. Obsidian loads styles.css from
// the plugin folder as plain CSS, there are no imports to resolve and no
// modules to scope, and the cascade means the ONLY thing the build must get
// right is order. A plain ordered concatenation is trivially correct about
// order in a way that a tool with its own opinions about hoisting and
// deduplication is not.
//
// Filenames carry a numeric prefix for exactly that reason. The order is
// load-bearing — 00-tokens.css defines the custom properties every later file
// reads — so it is spelled out in the names rather than left to a list in a
// config file that can drift from the directory.
//
// styles.css is therefore GENERATED and gitignored. Edit styles/, never the
// root file: it is overwritten on every build.
//
// WHY THE COMMENTS COME OUT
//
// This concatenated verbatim until 5.0.1, and 58.6% of the 885 KB it produced
// was comment text: the design arguments in styles/, which run to paragraphs
// and are the most valuable thing in the directory. Shipping them was not a
// choice anyone made — it was what "concatenate and change nothing" happened
// to do.
//
// Every one of those bytes is parsed by every vault on every launch, on phones
// included, and NOT ONE OF THEM IS LEGIBLE WHERE IT LANDS. The reader of a
// design argument has the repository open; the reader of the plugin folder has
// a generated file they were told not to edit. So the sources keep every word
// and the artefact keeps none.
//
// THIS IS STILL NOT A MINIFIER, and the distinction is the point. Selectors,
// declarations, whitespace inside rules and the order of everything are
// untouched — the output is the same stylesheet, still readable in devtools and
// still diffable against itself between releases. What is removed is the one
// category of content that has no reader on this side of the build.
//
// `/*!` SURVIVES, which is the convention esbuild already applies to main.js
// (see esbuild.config.mjs). A comment that must reach the shipped file — a
// licence notice, an attribution — says so with a bang, and the two artefacts
// then spell "keep this" the same way.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "styles");
const OUT = join(ROOT, "styles.css");

// The notice that survives the strip.
//
// The same argument esbuild.config.mjs makes for main.js, and it applies here
// for the same reason: styles.css is a file a reader HOLDS, the per-file SPDX
// headers in styles/ are ordinary comments and are now removed, and a conveyed
// copy that carries no notice is a compliance gap rather than an untidy one.
// One `/*!` at the top replaces twenty-five that were scattered through it.
const BANNER = `/*!
 * ChronoAnvil — a self-contained journaling and study-journal system for Obsidian
 * Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
 *
 * @license AGPL-3.0-or-later
 *
 * Licensed under the GNU Affero General Public License, version 3 or later,
 * with attribution and naming terms under its section 7. See LICENSE.
 *
 * Source: https://github.com/AhryMX/ChronoAnvil.Obsidian
 *
 * GENERATED from styles/*.css — do not edit. The design arguments behind these
 * rules are comments in those files and are stripped from this one; read them
 * in the repository, where they have a reader.
 */`;

// A COMMENT THAT CLOSES EARLY DELETES THE NEXT RULE, SILENTLY.
//
// This cost a release. A paragraph added to the middle of a block comment
// carried its own `*/`, so everything after it up to the real one parsed as a
// selector — and the CSS parser, which never complains, dropped the declaration
// block that followed it: `position: relative` on the widget block. The grip
// that reads it then anchored to whatever WAS positioned above it, which is the
// code-block widget in Live Preview and the note's sizer in reading view. It
// looked perfect in one mode and was gone in the other.
//
// NOTHING ELSE IN THE PROJECT COULD HAVE CAUGHT IT. The stylesheet is not
// parsed by the build (see above — a concatenation is the point), the suite
// reads it as text, and a browser reports nothing. So the walk asserts the one
// property text alone can be wrong about: every `*/` closes a comment that was
// open.
//
// SCANNED PER FILE, so the message names the file a reader has to open. And it
// counts a `/*` inside an already-open comment as nothing, because CSS comments
// do not nest — a second one is text, not a new level.
//
// THE SAME WALK NOW DOES THE STRIPPING, and that is deliberate rather than
// thrifty. A checker and a stripper that disagreed about where a comment ends
// would be the 4.x bug with a second way to happen: the check would pass on
// text the strip then cut in the wrong place. One state machine cannot disagree
// with itself.
//
// A NOTE ON STRINGS, which this does not track. `content: "/*"` and a data URI
// holding `*/` would both fool it. Neither exists in styles/ — asserted by
// `test/css-build.test.ts`, so this stays a fact about the directory rather
// than an assumption — and the cost of a real tokeniser here is a parser to
// maintain for a case the project does not have.
export function stripComments(file, css) {
  let out = "";
  let open = false;
  let start = 0; // where the current comment began, for `/*!` preservation

  for (let i = 0; i < css.length; i++) {
    const two = css[i] + css[i + 1];

    if (!open && two === "/*") {
      open = true;
      start = i;
      i++;
    } else if (open && two === "*/") {
      open = false;
      // `/*!` is a keep. Everything else vanishes, including the newline layout
      // around it — collapseBlankLines below tidies what that leaves behind.
      if (css[start + 2] === "!") out += css.slice(start, i + 2);
      i++;
    } else if (!open && two === "*/") {
      const line = css.slice(0, i).split("\n").length;
      throw new Error(
        `${file}:${line} closes a comment that was not open. A stray "*/" ends ` +
          `the comment early and the CSS after it is parsed as a selector, ` +
          `which silently eats the rule that follows.`
      );
    } else if (!open) {
      out += css[i];
    }
  }

  if (open) {
    throw new Error(`${file} ends inside an unclosed /* comment.`);
  }

  return out;
}

// What removing a comment leaves behind.
//
// A comment on its own line becomes an empty line, and a block comment of forty
// lines becomes forty of them. Trailing spaces are the same story one line
// down. Neither changes what the CSS MEANS — this is tidying the hole, not
// minifying the rule — but a file that is a third blank lines is a worse
// artefact than one that is not, and the whitespace is real bytes.
//
// RUNS COLLAPSE TO ONE rather than to none. A blank line between rules is the
// only structure left once the prose is gone, and a stylesheet with no vertical
// rhythm at all is harder to read in devtools than the one this replaces.
const collapseBlankLines = (css) =>
  css
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .trimEnd() + "\n";

/**
 * The complete text of styles.css, from the parts in filename order.
 *
 * PURE, and separate from buildCss for one reason: `test/css-build.test.ts`
 * asserts that the file on disk is exactly what this returns. That is what
 * catches a hand-edit of the generated file — the failure the old byte-equality
 * assertion in pure-logic.test.ts was written for, which stopped being
 * expressible as `parts.join("\n")` the moment the build did anything at all.
 *
 * @param parts {{ name: string, css: string }[]}
 */
export function composeCss(parts) {
  // ONE MARKER PER FILE, and it earns the ~800 bytes it costs. Twenty-five
  // sources become one stylesheet, and the reader looking at a rule in devtools
  // has otherwise no way back to the file whose comments explain it. `/*!` so
  // that this function's own output survives being run through it again.
  const body = parts
    .map(({ name, css }) => `/*! ${name} */\n${collapseBlankLines(stripComments(name, css))}`)
    .join("\n");

  return `${BANNER}\n${body}`;
}

export function buildCss() {
  if (!existsSync(SRC)) {
    throw new Error(
      `No styles/ directory at ${SRC}. styles.css is generated from it; if you ` +
        `have a styles.css and no styles/, you are on a pre-2.56.25 tree.`
    );
  }

  const names = readdirSync(SRC)
    .filter((f) => f.endsWith(".css"))
    .sort();

  if (names.length === 0) throw new Error("styles/ contains no .css files.");

  const parts = names.map((name) => ({
    name,
    css: readFileSync(join(SRC, name), "utf8"),
  }));

  const text = composeCss(parts);
  const source = parts.reduce((n, p) => n + Buffer.byteLength(p.css, "utf8"), 0);

  writeFileSync(OUT, text, "utf8");
  return { files: parts.length, bytes: Buffer.byteLength(text, "utf8"), source };
}

// Runnable on its own (`node tools/build-css.mjs`) as well as importable.
if (process.argv[1] && process.argv[1].endsWith("build-css.mjs")) {
  const { files, bytes, source } = buildCss();
  const saved = (((source - bytes) / source) * 100).toFixed(0);
  console.log(
    `✅ styles.css ← ${files} files (${(bytes / 1024).toFixed(0)} KB, ` +
      `${saved}% smaller than the sources)`
  );
}
