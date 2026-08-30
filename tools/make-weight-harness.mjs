// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Show the rule-weight scale at every candidate value, side by side.
//
// WHY THIS EXISTS. §6 of the 3.6 plan names "how much heavier is slightly" as
// one of two items with no defensible answer in advance, and the reason it
// gives is correct: 1px against a hairline is a doubling on some themes and
// invisible on others, and ChronoAnvil renders inside whatever theme the reader
// has. That is an argument for not deciding it from a stylesheet — it is not an
// argument for deciding it from one screenshot of one vault either, which is
// the only alternative the plan had.
//
// So this holds the weight still and varies everything else. Each candidate
// value of `--ca-rule` is rendered against BOTH a quiet theme border and a loud
// one, because those are the two ends of the range the number has to survive,
// and no single vault can show both.
//
// IT PREVIEWS PATCH 5 WITHOUT COMMITTING IT. The stylesheet does not consume
// the scale yet — patch 4 is tokens only. The override block below is what
// patch 5 would write, kept here so the decision can be made before the sweep
// rather than after it.
//
//   node tools/make-weight-harness.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "styles.css"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

// The candidates. 1px is the current state and is included as the control —
// half the question is whether "heavier" is an improvement at all.
//
// NO 1.5px. Chromium floors border-width to whole CSS pixels at every device
// pixel ratio, so a 1.5px divider draws at 1px while the cell rings beside it,
// being box-shadows, draw at 1.5px. The half step is not a middle option that
// was rejected on taste; it is not expressible by half the surfaces the scale
// governs. That leaves three candidates, which is the whole ballot.
const WEIGHTS = ["1px", "2px", "3px"];

// The two ends of the range. A theme's --background-modifier-border is the one
// value this decision depends on and the one value the plugin cannot see.
const THEMES = [
  { id: "quiet", label: "quiet border (low-contrast theme)", border: "#2b2932", ring: "5%" },
  { id: "loud", label: "loud border (high-contrast theme)", border: "#4d4958", ring: "12%" },
];

// ── what patch 5 would write ────────────────────────────────────────────
// Two families, because the cells do not draw borders: a day cell, a month
// cell and a quarter tile each draw an inset ring, since a box-shadow takes no
// layout space and a border does. Converting them would resize every cell in a
// fixed-height grid, so the scale has to be readable from both.
const patch5 = `
/* §4.3 — dividers between a card's bands, and between one card and the next. */
.journal-overview-banner,
.journal-overview-card > .journal-links-card,
.journal-entry-banner .journal-entry-header {
  border-bottom-width: var(--ca-rule);
}
.journal-overview-card > .journal-widget-bar.journal-overview-actions {
  border-top-width: var(--ca-rule);
}
.jq-section,
.jq-coverage {
  border-top-width: var(--ca-rule);
  border-bottom-width: var(--ca-rule);
}
/* §4.4 — cells. The ring family, not the border family. */
.cal-cell {
  box-shadow: inset 0 0 0 var(--ca-rule)
    color-mix(in srgb, var(--text-normal) var(--ca-ring-alpha), transparent);
}
.journal-week-table td {
  border-bottom-width: var(--ca-rule);
}
.jq-month,
.jyr-stat {
  border-width: var(--ca-rule);
}
`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">${body}</svg>`;
const notebook = svg(
  `<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/>`
);

// A month grid — 31 day cells, the surface §4.4 says reads as a texture.
const dayGrid = () => {
  let cells = "";
  for (let i = 0; i < 35; i++) {
    const day = i - 4;
    if (day < 1 || day > 31) {
      cells += `<div class="cal-cell cal-cell-out"><span class="cal-num">${
        day < 1 ? 27 + day + 4 : day - 31
      }</span></div>`;
      continue;
    }
    const logged = [1, 2, 3, 6, 7, 10, 14, 15, 18, 21, 22, 25, 28, 29].includes(day);
    cells += `<div class="cal-cell"><span class="cal-num">${day}</span>${
      logged ? `<span class="cal-dot"></span>` : ""
    }</div>`;
  }
  return `<div class="journal-calendar"><div class="jc-weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div class="jc-grid">${cells}</div></div>`;
};

// The quarter tiles — three bordered cards in a row, one level up from cells.
const tiles = () =>
  `<div class="jq-months">${["July", "August", "September"]
    .map(
      (m, i) => `<div class="jq-month${i === 0 ? " is-written" : ""}">
    <div class="jq-month-head"><span class="jq-month-name">${m}</span><span class="jq-month-dot${
      i === 0 ? " is-logged" : ""
    }"></span></div>
    <a class="jq-month-link"><span class="jq-month-icon">${notebook}</span><span>${
      i === 0 ? "Entry" : "Start the entry"
    }</span></a>
  </div>`
    )
    .join("")}</div>`;

// A card with three bands, which is what §4.3 is about.
const bands = () => `
<div class="journal-widget-block journal-overview-card">
  <div class="journal-links-card journal-links-card-diary">
    <div class="ca-titlebar ca-titlebar-diary">
      <span class="ca-titlebar-icon">${notebook}</span>
      <span class="ca-titlebar-name">Diary</span>
    </div>
    <div class="journal-nav journal-links journal-links-bar">
      <a class="jn-pill" href="#"><span>Home</span></a><a class="jn-pill" href="#"><span>Today</span></a>
    </div>
  </div>
  <div class="journal-live-widget"><div class="journal-month-summary journal-overview-summary">
    <div class="journal-overview-banner job-month">
      <div class="job-head"><div class="job-text">
        <div class="job-span">1 – 31 August</div>
        <div class="journal-period-nav-stack">
          <div class="journal-period-nav jeh-nav jeh-seg">
            <div class="jeh-datenav"><button class="jeh-datenav-trigger jeh-seg-mid jpn-value" type="button"><span class="jpn-value-label">August 2026</span></button></div>
          </div>
        </div>
        <p class="journal-period-stats"><strong>14</strong>/31 days logged</p>
      </div></div>
    </div>
    <div class="journal-overview-body">${dayGrid()}${tiles()}</div>
  </div></div>
  <div class="journal-widget-bar journal-overview-actions"><button class="journal-btn" type="button">Keep this month</button></div>
</div>`;

const panels = THEMES.map(
  (t) => `
<h2>${t.label}</h2>
<div class="row">
${WEIGHTS.map(
  (w) => `<div class="col" style="--ca-rule:${w};--ca-ring-alpha:${t.ring};--background-modifier-border:${t.border}">
  <h3>--ca-rule: ${w}${w === "1px" ? " (today)" : ""}</h3>
  ${bands()}
</div>`
).join("")}
</div>`
).join("");

const html = `<!doctype html>
<html lang="en" class="theme-dark">
<head>
<meta charset="utf-8">
<title>ChronoAnvil ${manifest.version} — rule-weight scale</title>
<style>
body{
  --background-primary:#1a1820; --background-secondary:#1e1c26;
  --background-secondary-alt:#181620;
  --background-modifier-border:#35323f; --background-modifier-border-hover:#45414f;
  --background-modifier-hover:rgba(255,255,255,.06);
  --text-normal:#dcd9e6; --text-muted:#9a96a8; --text-faint:#6b6779;
  --text-on-accent:#fff; --interactive-accent:#7f6df2; --interactive-accent-rgb:127,109,242;
  --interactive-normal:#2a2733; --interactive-hover:#332f3d;
  --font-interface:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  --input-height:30px;
  --ca-ring-alpha:5%;
  margin:0;padding:24px;background:#141219;color:#dcd9e6;
  font-family:var(--font-interface);font-size:15px;
}
button{height:var(--input-height);font-family:inherit;font-size:inherit;
       color:var(--text-normal);background:var(--interactive-normal);
       padding:0 12px;border:0;border-radius:5px;cursor:pointer}
.svg-icon{width:1em;height:1em}
h1{font-size:15px;font-weight:600;color:#9a96a8;margin:0 0 6px}
.note{font:12.5px/1.6 ui-monospace,Menlo,monospace;color:#6b6779;margin:0 0 22px;max-width:70em}
h2{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
   color:#6b6779;margin:30px 0 10px}
h3{font:600 12px/1 ui-monospace,Menlo,monospace;color:#9a96a8;margin:0 0 8px}
.row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:start}
.col{min-width:0}
</style>
<style>${css}</style>
<style>/* what patch 5 would write */${patch5}</style>
</head>
<body>
<h1>ChronoAnvil ${manifest.version} — the rule-weight scale, three candidates against two themes</h1>
<p class="note">Left column is today. The cells are inset rings, not borders, so the ring alpha
moves with the theme as it does in a real one — a weight decision on the day grid is partly a
contrast decision, and separating them here would flatter every candidate equally.</p>
${panels}
</body>
</html>`;

mkdirSync(resolve(root, "dist"), { recursive: true });
const out = resolve(root, "dist/weight-harness.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
