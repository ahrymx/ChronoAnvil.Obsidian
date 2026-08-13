// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// 3.9 patch 6 — the interactive controls read the spacing scale.
//
// A ONE-OFF, KEPT IN THE TREE BECAUSE THE AUDIT IS THE REVIEW. §12's third
// risk is that a token pass is a redesign wearing a refactor's clothes:
// snapping literals onto a scale moves some of them, and every moved pixel is
// a design change nobody asked for shipped inside a diff described as
// mechanical. The mitigation is that this script PRINTS every move it makes,
// against an explicit list of class names, so the diff is readable as a list of
// deliberate decisions rather than a wave of incidental ones.
//
// BOUNDED TO CONTROLS, per §4.3: "a pass that replaces literals with them in
// the interactive-control rules only — leaving layout paddings alone until
// there is a reason beyond tidiness". The allow-list below is that boundary and
// it is written out rather than inferred, because a regex over selector names
// matched banner bands and title bands too — layout, not controls.
//
// Run: node tools/space-pass.mjs [--apply]

import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

// Every interactive control whose padding this pass owns. A control is
// something a reader clicks, types into or taps: buttons, pills, chips, inputs,
// selects, steppers, tabs and toggles. NOT a band, a card, a row container or
// an empty state — those are layout and keep their literals.
const CONTROLS = [
  ".journal-tracker-add-btn",
  ".jcr-range",
  ".jsh-title-input",
  ".jrc-grade button",
  ".jeh-title-input",
  ".journal-header-widgets .journal-btn",
  ".jjs-type-btn",
  ".journal-time input",
  ".journal-date input",
  ".journal-select select",
  ".jdh-nav-actions .journal-btn",
  ".journal-btn-ghost",
  ".jjs-group-head .journal-btn",
  ".jjs-actions .journal-btn",
  ".journal-note-input",
  ".journal-attach-chip",
  ".journal-attach-btn",
  ".journal-tasks-add-input",
  ".journal-path-add-input",
  ".journal-habit-chip-btn",
  ".journal-sleep-field input",
  ".journal-btn-quiet",
  ".journal-icon-btn",
  ".almanac-section-action",
  ".almanac-list-pill",
  ".almanac-kind-chip",
  ".almanac-picker-row",
  ".jn-pill",
  ".jc-today-btn",
  ".journal-btn-subtle",
  ".jq-recap-moved-btn",
  ".jw-taskpill",
  ".jc-jump-row input",
  ".jc-jump-row button",
  ".jpn-now-btn",
  ".jtt-pill",
  ".jt-tag-pill",
  ".jer-pill",
  ".almanac-tpl-toggle",
  ".almanac-tpl-tab",
  ".jsh-crumb",
  ".jca-action",
];

// The scale, as defined in 00-tokens.css. `--am-space-N` is 2N px.
const SCALE = new Map([
  [2, "var(--am-space-1)"],
  [4, "var(--am-space-2)"],
  [6, "var(--am-space-3)"],
  [8, "var(--am-space-4)"],
  [10, "var(--am-space-5)"],
  [12, "var(--am-space-6)"],
  [14, "var(--am-space-7)"],
]);

// ODD VALUES ROUND UP, NEVER DOWN. The scale is even and 110 uses in this sheet
// are odd, so a rule is needed and this is it. Up rather than down because §3's
// whole complaint is that nothing here asserts a touch target: rounding a
// control's padding down would make the smallest targets smaller, which is the
// one direction this release must not move them in. The cost is at most 1px per
// side, on a control.
function snap(px) {
  if (px === 0) return { px: 0, out: "0" };
  const up = px % 2 === 1 ? px + 1 : px;
  const tok = SCALE.get(up);
  // Off-scale values keep their literal. 16px, 22px and 26px appear on three
  // controls and none of them is spacing: two are the inset a dropdown arrow
  // or a remove-× needs on one side, and the third is a deliberately wide
  // button. Tokenising an icon offset as though it were rhythm is how a scale
  // acquires a step that means nothing.
  if (!tok) return { px, out: `${px}px`, offScale: true };
  return { px: up, out: tok, moved: up !== px };
}

const apply = process.argv.includes("--apply");
const audit = [];
let changed = 0;

for (const file of globSync("styles/*.css").sort()) {
  if (file.endsWith("00-tokens.css")) continue;
  const css = readFileSync(file, "utf8");
  let out = "";
  let last = 0;

  for (const m of css.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const selector = m[1];
    const body = m[2];
    const flat = selector.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
    if (!CONTROLS.some((c) => flat.includes(c))) continue;

    const bodyStart = m.index + m[1].length + 1;
    let newBody = body.replace(
      /(padding(?:-[a-z]+)?)\s*:\s*([^;]*?)\s*;/g,
      (decl, prop, value) => {
        if (!/\d+px/.test(value)) return decl;
        if (/var\(/.test(value)) return decl;
        const parts = value.trim().split(/\s+/);
        const next = parts.map((p) => {
          const n = /^(\d+)px$/.exec(p);
          if (!n) return p;
          const s = snap(Number(n[1]));
          if (s.moved) changed++;
          return s.out;
        });
        const result = `${prop}: ${next.join(" ")};`;
        audit.push({
          file: path.basename(file),
          selector: flat.trim().slice(0, 58),
          from: `${prop}: ${value.trim()}`,
          to: `${prop}: ${next.join(" ")}`,
          moved: value.trim() !== next.join(" ").replace(/var\([^)]*\)/g, (v) => v),
        });
        return result;
      }
    );

    if (newBody !== body) {
      out += css.slice(last, bodyStart) + newBody;
      last = bodyStart + body.length;
    }
  }
  out += css.slice(last);
  if (apply && out !== css) writeFileSync(file, out);
}

// The audit, which is the point of the script.
const movedRows = [];
for (const a of audit) {
  const fromPx = (a.from.match(/\d+px/g) ?? []).map(Number.parseFloat);
  const toTokens = a.to.match(/--am-space-(\d)/g) ?? [];
  const toPx = toTokens.map((t) => Number(t.slice(-1)) * 2);
  const literalsKept = (a.to.match(/\d+px/g) ?? []).map(Number.parseFloat);
  const before = fromPx.join(",");
  const after = [...toPx, ...literalsKept].join(",");
  if (fromPx.some((v, i) => v !== (toPx[i] ?? v))) movedRows.push({ ...a, before, after });
}

console.log(`${audit.length} control padding declarations tokenised`);
console.log(`${movedRows.length} of them move at least one pixel:\n`);
for (const r of movedRows) {
  console.log(`  ${r.file.padEnd(26)} ${r.selector.padEnd(58)} ${r.from}  ->  ${r.to}`);
}
console.log(`\n${apply ? "APPLIED" : "DRY RUN — pass --apply to write"}`);
