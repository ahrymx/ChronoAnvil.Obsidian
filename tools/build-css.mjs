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
// rule was rewritten, no selector renamed, nothing minified. The build puts it
// back together in filename order.
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

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "styles");
const OUT = join(ROOT, "styles.css");

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
// reads it as text, and a browser reports nothing. So the concatenation asserts
// the one property text alone can be wrong about: every `*/` closes a comment
// that was open.
//
// SCANNED PER FILE, so the message names the file a reader has to open. And it
// counts a `/*` inside an already-open comment as nothing, because CSS comments
// do not nest — a second one is text, not a new level.
function checkComments(file, css) {
  let open = false;
  for (let i = 0; i < css.length - 1; i++) {
    const two = css[i] + css[i + 1];
    if (!open && two === "/*") {
      open = true;
      i++;
    } else if (open && two === "*/") {
      open = false;
      i++;
    } else if (!open && two === "*/") {
      const line = css.slice(0, i).split("\n").length;
      throw new Error(
        `${file}:${line} closes a comment that was not open. A stray "*/" ends ` +
          `the comment early and the CSS after it is parsed as a selector, ` +
          `which silently eats the rule that follows.`
      );
    }
  }
  if (open) {
    throw new Error(`${file} ends inside an unclosed /* comment.`);
  }
}

export function buildCss() {
  if (!existsSync(SRC)) {
    throw new Error(
      `No styles/ directory at ${SRC}. styles.css is generated from it; if you ` +
        `have a styles.css and no styles/, you are on a pre-2.56.25 tree.`
    );
  }

  const parts = readdirSync(SRC)
    .filter((f) => f.endsWith(".css"))
    .sort();

  if (parts.length === 0) throw new Error("styles/ contains no .css files.");

  for (const f of parts) checkComments(f, readFileSync(join(SRC, f), "utf8"));

  const text = parts
    .map((f) => readFileSync(join(SRC, f), "utf8"))
    .join("\n");

  writeFileSync(OUT, text, "utf8");
  return { files: parts.length, bytes: Buffer.byteLength(text, "utf8") };
}

// Runnable on its own (`node tools/build-css.mjs`) as well as importable.
if (process.argv[1] && process.argv[1].endsWith("build-css.mjs")) {
  const { files, bytes } = buildCss();
  console.log(`✅ styles.css ← ${files} files (${(bytes / 1024).toFixed(0)} KB)`);
}
