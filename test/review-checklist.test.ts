// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ROOT, readCode, readSrc, repoFile } from "./sources";

// ── the Obsidian plugin review checklist, as assertions ───────────────────
//
// WHY THESE ARE TESTS AND NOT A NOTE SOMEWHERE. Each of the four below was
// found in the 5.0.0 store-readiness pass, and every one of them had been true
// for releases without anyone noticing — because they are all invisible from
// inside the vault this plugin was developed in. A duplicated heading is
// invisible to whoever wrote the settings tab; a hotkey default is invisible
// until it takes a key you use; a leaked listener is invisible always.
//
// A reviewer notices in one pass. So the check moves here, where it runs on
// every commit rather than once per submission.

describe("no default hotkey", () => {
  // 4.51 shipped `Mod K` as a `hotkeys` default on the search command, and the
  // argument for it was good on its own terms — a declared default is
  // rebindable, and Obsidian surfaces the clash with core's *Insert Markdown
  // link* in its own Hotkeys pane. It was still the wrong call for a plugin
  // about to be listed: `Mod K` is a binding most people already have muscle
  // memory for, and claiming it in every vault that installs this is a
  // different act from choosing it in one.
  it("does not claim a keyboard shortcut in the reader's vault", () => {
    expect(readCode("main")).not.toContain("hotkeys:");
  });

  it("does not draw a key chip for a binding that no longer exists", () => {
    // The banner's search field spelled the default for the platform. With no
    // default to spell, a chip there would name a key that does nothing — and
    // it cannot be taught to read the reader's ACTUAL binding, because that is
    // not on the public API and reaching for the internal one is its own
    // review finding.
    const banner = readCode("vault-banner");
    expect(banner).not.toContain("avb-kbd");
    expect(banner).not.toContain("Ctrl K");
    expect(banner).not.toContain("⌘");
  });

  it("still offers the command, so the shortcut is one row away", () => {
    // The point is that the reader chooses, not that the feature is gone.
    expect(readSrc("main")).toContain('id: "ca-search-everything"');
    expect(readSrc("main")).toContain('name: "Search everything"');
    // And the README has to say so, since nothing in the UI can.
    expect(repoFile("README.md")).toMatch(/Settings\s*→\s*Hotkeys/);
  });
});

describe("the settings tab does not repeat its own name", () => {
  it("draws no heading carrying the plugin name", () => {
    // Obsidian renders "ChronoAnvil" above the tab body. The tab drew it again
    // as an `<h2>` until 5.0.1 — the word the reader is already looking at, on
    // the screen twice.
    //
    // ASSERTED AS "NO HEADING WITH THE NAME IN IT" rather than as the absence
    // of one exact line, because the failure recurs by being retyped in a
    // slightly different shape: an `h1`, a `setHeading()`, a div styled to look
    // like one. Modals are a different question and keep their `h3` titles —
    // those name the modal, which nothing else on screen does.
    const settings = readCode("settings");
    for (const tag of ["h1", "h2", "h3", "h4"]) {
      const calls = [...settings.matchAll(new RegExp(`createEl\\("${tag}"[^)]*\\)`, "g"))];
      for (const call of calls) {
        expect(
          call[0],
          `the settings tab creates a <${tag}> naming the plugin: ${call[0]}`
        ).not.toContain("ChronoAnvil");
      }
    }
    expect(settings).not.toContain("setHeading()");
  });
});

describe("no listener outlives the thing it belongs to", () => {
  // `document` and `window` listeners are the ones that leak, because nothing
  // tears them down when the element they were opened for goes away. The one in
  // log-list.ts was added once per widget render, anonymously, with no
  // reference kept — so it could not be removed even in principle, and it
  // survived the note being closed and the plugin being disabled.
  //
  // ORDINARY ELEMENT LISTENERS ARE NOT THIS PROBLEM and are not swept: a
  // listener on a node the render child owns dies with the node. There are 400+
  // of those and converting them to `registerDomEvent` would be churn, not a
  // fix.
  //
  // SWEPT PER FILE, NOT PER MODULE, and that distinction is the whole test.
  // `allSrcNames()` reports a split module as one name — src/ui/widgets/ is 24
  // files answering to "widgets" — and a per-module count sums them. Written
  // that way first, this suite went GREEN against a deliberately reintroduced
  // log-list leak: the directory's totals were 4 adds against 4 removes and one
  // `once: true`, so the spare `once` covered the missing removal from a file
  // three hundred lines away. Balanced books, one real leak. A path is also the
  // thing a failure has to name to be actionable.
  const GLOBAL_ADD = /(?:document|window)\.addEventListener\(/g;
  const GLOBAL_REMOVE = /(?:document|window)\.removeEventListener\(/g;

  const tsFiles = (dir: string): string[] =>
    readdirSync(dir)
      .sort()
      .flatMap((entry) => {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) return tsFiles(p);
        return entry.endsWith(".ts") ? [p] : [];
      });

  // COMMENT LINES OUT, as `readCode` does for a module. This file's own prose
  // names the call it forbids, and so does log-list.ts's, which is a record of
  // the bug and should stay.
  const codeOf = (path: string): string =>
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");

  it("pairs every document or window listener with a way to take it off", () => {
    let swept = 0;

    for (const path of tsFiles(join(ROOT, "src"))) {
      const rel = path.slice(ROOT.length + 1);
      const code = codeOf(path);
      const adds = [...code.matchAll(GLOBAL_ADD)].length;
      if (adds === 0) continue;
      swept++;

      const removes = [...code.matchAll(GLOBAL_REMOVE)].length;
      // `{ once: true }` is self-removing and needs no partner.
      const once = [...code.matchAll(/once:\s*true/g)].length;

      expect(
        removes + once,
        `${rel} adds ${adds} document/window listener(s) but only accounts ` +
          `for ${removes + once} of them (${removes} removed, ${once} once:true). ` +
          `A global listener with no way off outlives the element it was opened ` +
          `for — see log-list.ts, which held one open per widget render. Attach ` +
          `it when the menu opens and remove it when the menu closes, the way ` +
          `periodnav.ts and entryheader.ts do.`
      ).toBeGreaterThanOrEqual(adds);
    }

    // The sweep states how much it expects to see, so that a refactor which
    // renames the call — or a walk that stops finding these files — fails here
    // rather than going quiet while asserting nothing. Six files today:
    // entryheader, periodnav, time-grid-view, block-drag, log-list, row.
    expect(swept).toBeGreaterThanOrEqual(6);
  });
});

describe("the global app and moment stay out of reach", () => {
  it("is enforced by lint rather than by reading", () => {
    // NOT A SOURCE SWEEP, DELIBERATELY. A text search for `app.` cannot tell
    // the global from a parameter of the same name, and nearly every file here
    // takes `app` as a parameter or reads `plugin.app` into a const — during
    // the 5.0.0 pass a grep reported nine global reads and every one of them
    // turned out to be a local. ESLint resolves scopes, so it answers the
    // question the grep only appeared to.
    //
    // What this asserts is that the rule is still configured. `npx eslint src
    // test` is what actually runs it, in CI and in the verification cycle.
    const config = repoFile("eslint.config.mjs");
    expect(config).toContain("no-restricted-globals");
    expect(config).toMatch(/globals:\s*\{[^}]*app:\s*"readonly"/);
    expect(config).toMatch(/globals:\s*\{[^}]*moment:\s*"readonly"/);
  });
});
