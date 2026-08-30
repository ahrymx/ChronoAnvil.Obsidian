// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Build a standalone reproduction of the four overview mastheads.
//
// It exists because 3.6 patch 1 asks whether the accent edge is actually
// painting, and a screenshot from a vault cannot answer that: it conflates the
// plugin's CSS with the reader's theme, their snippets, and whether the
// installed files are the ones in this tree.
//
// It had a sibling, tools/make-calendar-harness.mjs, removed in 3.17.1. That
// one had gone stale — it still drew the `jc-mcell-icon` the month cell lost in
// 3.9, whose stylesheet rules a test asserts are gone — so it reproduced a
// calendar the plugin no longer draws, which is worse than no harness at all.
// The lesson generalises to this file: a harness mirrors DOM it does not
// import, so it only stays honest while someone keeps it in step.
//
// This writes one .html file carrying the masthead's exact DOM (mirroring
// buildOverviewBanner + buildPeriodNav + the widgets.ts card wiring) and this
// tree's exact styles.css, plus a stub of the Obsidian theme variables. It prints its own measurements at the top: the computed
// border-left of each band, whether it is non-zero, and how the three parts of
// the navigator measure against each other.
//
//   node tools/make-masthead-harness.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(resolve(root, "styles.css"), "utf8");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon">${body}</svg>`;
const chevronLeft = svg(`<path d="m15 18-6-6 6-6"/>`);
const chevronRight = svg(`<path d="m9 18 6-6-6-6"/>`);
const chevronDown = svg(`<path d="m6 9 6 6 6-6"/>`);
const chevronsUpDown = svg(`<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>`);
const calendar = svg(
  `<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>`
);
const home = svg(`<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>`);
const notebook = svg(
  `<path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/>`
);
const plus = svg(`<path d="M5 12h14"/><path d="M12 5v14"/>`);
const square = svg(`<rect width="18" height="18" x="3" y="3" rx="2"/>`);
const checkSquare = svg(`<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>`);

// ── the links band (src/core/links.ts::wrapInCard + buildLinks) ──────────
const linksCard = (leaf) => `
<div class="journal-links-card journal-links-card-diary">
  <div class="ca-titlebar ca-titlebar-diary">
    <span class="ca-titlebar-icon">${notebook}</span>
    <span class="ca-titlebar-name">Diary</span>
    <span class="ca-titlebar-trail">
      <a class="ca-titlebar-crumb">Diary</a>
      <span class="ca-titlebar-sep">${chevronRight}</span>
      <a class="ca-titlebar-crumb ca-titlebar-crumb-leaf">${leaf}</a>
    </span>
  </div>
  <div class="journal-nav journal-links journal-links-bar">
    <a class="internal-link jn-pill" href="#"><span class="jn-icon">${home}</span><span>Home</span></a>
    <a class="internal-link jn-pill" href="#"><span class="jn-icon">${calendar}</span><span>Today</span></a>
    <span class="jn-right"><a class="jn-pill jn-scopes is-here" href="#"><span class="jn-icon">${calendar}</span><span>${leaf}</span><span class="jn-caret">${chevronDown}</span></a></span>
  </div>
</div>`;

// ── the band (src/diary/calendar.ts::buildOverviewBanner + periodnav.ts) ──
const banner = (unit, span, value, stats) => `
<div class="journal-overview-banner job-${unit}">
  <div class="job-head">
    <div class="job-text">
      <div class="job-span">${span}</div>
      <div class="journal-period-nav-stack">
        <div class="journal-period-nav jeh-nav jeh-seg">
          <a class="jeh-navpill jeh-seg-start" aria-label="Previous ${unit}">${chevronLeft}</a>
          <div class="jeh-datenav">
            <button class="jeh-datenav-trigger jeh-seg-mid jpn-value" type="button" aria-label="Select period">
              <span class="jpn-value-label">${value}</span>
              <span class="jeh-datenav-caret">${chevronsUpDown}</span>
            </button>
          </div>
          <a class="jeh-navpill jeh-seg-end" aria-label="Next ${unit}">${chevronRight}</a>
        </div>
      </div>
      ${stats}
    </div>
  </div>
</div>`;

const statsLine = (logged, elapsed, soFar, done, open) =>
  `<div class="ca-stats" data-cols="2">${statCard(
    `${logged}/${elapsed}`,
    "Days logged",
    `${Math.round((logged / elapsed) * 100)}% of days${soFar ? " so far" : ""}`
  )}${statCard(String(done), "Tasks done", open > 0 ? `${open} still open` : "")}</div>`;

// ── bodies ──────────────────────────────────────────────────────────────
const DAYS = [
  ["Mon", "27", "Monday's entry", "3 ✓ / 1 ◻"],
  ["Tue", "28", "Tuesday's entry", "2 ✓"],
  ["Wed", "29", "", ""],
  ["Thu", "30", "Thursday's entry", "5 ✓ / 2 ◻"],
  ["Fri", "31", "", ""],
  ["Sat", "1", "Saturday's entry", "2 ✓"],
  ["Sun", "2", "", ""],
];

const weekBody = `
<div class="journal-overview-body">
  <table class="journal-week-table">
    <thead><tr><th>Day</th><th>Entry</th><th>Tasks</th></tr></thead>
    <tbody>
    ${DAYS.map(
      ([d, n, entry, tasks]) => `
      <tr class="jw-row${entry ? "" : " jw-empty"}">
        <td class="jw-day"><span class="jw-daylabel"><span class="jw-date">${n}</span><span class="jw-dow">${d}</span></span></td>
        <td class="jw-entry">${entry ? `<a class="internal-link jw-entry-link"><span class="jw-entry-title">${entry}</span></a>` : `<span class="jw-create"><span class="jw-create-icon">${plus}</span>Add entry</span>`}</td>
        <td class="jw-tasks">${tasks}</td>
      </tr>`
    ).join("")}
    </tbody>
  </table>
</div>`;

const monthBody = `
<div class="journal-overview-body">
  <div class="journal-calendar jc-compact">
    <div class="jc-weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div>
    <div class="jc-grid">
      ${Array.from({ length: 35 }, (_, i) => {
        const day = i - 4;
        if (day < 1 || day > 31) return `<div class="cal-cell cal-cell-blank"></div>`;
        const logged = [1, 2, 3, 6, 7, 10, 14, 15, 18, 21, 22, 25, 28, 29].includes(day);
        return `<div class="cal-cell${logged ? " cal-cell-logged" : ""}"><span class="cal-num">${day}</span>${
          logged ? `<span class="cal-dot"></span>` : ""
        }</div>`;
      }).join("")}
    </div>
  </div>
</div>`;

const quarterMonthCard = (label, written, focus) => `
<div class="jq-month${written ? " is-written" : ""}">
  <div class="jq-month-head"><span class="jq-month-name">${label}</span><span class="jq-month-dot${written ? " is-logged" : ""}"></span></div>
  <a class="jq-month-link"><span class="jq-month-icon">${written ? notebook : plus}</span><span>${written ? "Entry" : "Start the entry"}</span></a>
  ${focus ? `<div class="jq-month-focus">${focus}</div>` : ""}
</div>`;

const quarterBody = `
<div class="journal-overview-body">
  <div class="jq-coverage">
    <span class="jq-coverage-rate">21 entries · 64% of days</span>
    <span class="jq-coverage-reviews">1/3 entries</span>
  </div>
  <div class="jq-months">
    ${quarterMonthCard("July", true, "Ship the release")}
    ${quarterMonthCard("August", false, "")}
    ${quarterMonthCard("September", false, "")}
  </div>
  <div class="jq-section">
    <div class="journal-sec journal-sec-l2">
      <div class="journal-header-title">Goals</div>
      <span class="journal-header-note">2 of 5 met</span>
      <div class="journal-widget-bar journal-header-widgets"></div>
    </div>
    <div class="jq-group">
      <div class="jq-group-label">July</div>
      <div class="jq-goals">
        <div class="jq-goal is-done"><span class="jq-goal-icon">${checkSquare}</span><span class="jq-goal-text">Finish the styling pass</span></div>
        <div class="jq-goal"><span class="jq-goal-icon">${square}</span><span class="jq-goal-text">Write the release notes</span></div>
      </div>
    </div>
  </div>
</div>`;

const statCard = (value, label, sub) => `
<div class="ca-stat">
  <div class="ca-stat-label">${label}</div>
  <div class="ca-stat-value">${value}</div>
  <div class="ca-stat-sub">${sub || ""}</div>
</div>`;

const MONTH_COUNTS = [18, 14, 22, 19, 25, 21, 24, 2, 0, 0, 0, 0];
const yearBody = `
<div class="journal-overview-body">
  <div class="jyr-stats-wrap">
    <div class="ca-stats" data-cols="4">
      ${statCard("145", "Diary entries", "68% of days")}
      ${statCard("21", "Longest streak", "3 May – 23 May")}
      ${statCard("37", "Lessons completed", "4 still in progress")}
      ${statCard("512", "Tasks done", "63 still open")}
    </div>
    <div class="jyr-density">
      <div class="journal-sec journal-sec-l2">
        <div class="journal-header-title">Entry density</div>
        <span class="journal-header-note">145 of 214 days</span>
        <div class="journal-widget-bar journal-header-widgets"></div>
      </div>
      <div class="jyr-months">
        ${MONTH_COUNTS.map((c, m) => {
          const future = m > 7;
          const peak = Math.max(...MONTH_COUNTS);
          return `<div class="jyr-month"><div class="jyr-month-track${
            future ? " is-future" : c === 0 ? " is-empty" : ""
          }">${c > 0 && !future ? `<div class="jyr-month-bar" style="height:${Math.round((c / peak) * 100)}%"></div>` : ""}</div><div class="jyr-month-label">${
            "JFMAMJJASOND"[m]
          }</div></div>`;
        }).join("")}
      </div>
    </div>
  </div>
  <div class="jq-section">
    <!-- THE DEFECT, verbatim: renderQuarterCards still builds the three
         classes 2.56.2 retired. -->
    <div class="journal-sec journal-sec-l2"><div class="journal-header-title">Quarters</div><span class="journal-header-note">1 of 12 entries</span><div class="journal-widget-bar journal-header-widgets"></div></div>
    <div class="jq-months jyr-quarters">
      ${[1, 2, 3, 4]
        .map(
          (q) => `<div class="jq-month${q > 3 ? " is-future" : ""}">
        <div class="jq-month-head"><div class="jq-month-dot${q < 4 ? " is-logged" : ""}"></div><div class="jq-month-name">Q${q}</div></div>
        <div class="jq-month-meta">${q > 3 ? "Not yet" : `${[54, 65, 26, 0][q - 1]} entries · ${[3, 3, 1, 0][q - 1]}/3 written`}</div>
      </div>`
        )
        .join("")}
    </div>
  </div>
</div>`;

// ── the four cards ───────────────────────────────────────────────────────
const card = (unit, leaf, summaryCls, bannerHtml, bodyHtml, action, nowLabel) => `
<div class="journal-widget-block journal-overview-card" data-unit="${unit}">
  ${linksCard(leaf)}
  <div class="journal-live-widget">
    <div class="${summaryCls} journal-overview-summary">
      ${bannerHtml}
      ${bodyHtml}
    </div>
  </div>
  <div class="journal-widget-bar journal-overview-actions">
    <button class="journal-btn-subtle jpn-now-btn" type="button">${nowLabel}</button>
    <button class="journal-btn" type="button">${action}</button>
  </div>
</div>`;

const cards = [
  card(
    "week",
    "Weekly",
    "journal-week-summary",
    banner(
      "week",
      "27 Jul – 2 Aug 2026",
      "Week 31",
      statsLine(4, 7, false, 12, 3)
    ),
    weekBody,
    "Keep this week",
    "This Week"
  ),
  card(
    "month",
    "Monthly",
    "journal-month-summary",
    banner(
      "month",
      "1 – 31 August",
      "August 2026",
      statsLine(2, 2, true, 4, 1)
    ),
    monthBody,
    "Keep this month",
    "This Month"
  ),
  card(
    "quarter",
    "Quarterly",
    "journal-quarter-summary",
    banner(
      "quarter",
      "1 Jul – 30 Sep",
      "Q3 2026",
      statsLine(21, 33, true, 88, 12)
    ),
    quarterBody,
    "Keep this quarter",
    "This Quarter"
  ),
  card(
    "year",
    "Yearly",
    "journal-year-summary",
    banner(
      "year",
      "1 January – 2 August · 214 days elapsed",
      "2026",
      ""
    ),
    yearBody,
    "Keep this year",
    "This Year"
  ),
];

const html = `<!doctype html>
<html lang="en" class="theme-dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ChronoAnvil ${manifest.version} — overview masthead harness</title>
<style>
/* The handful of Obsidian variables these cards read, on the BODY element — which is
   where Obsidian itself defines them, and the whole point of patch 1. Values
   are a dark
   theme's ballpark; only their presence matters for layout. */
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
}
body{margin:0;padding:28px;background:#141219;color:var(--text-normal);
     font-family:var(--font-interface);font-size:16px}
/* Obsidian's own button reset — included deliberately, as in the calendar
   harness: its fixed height is a thing that has broken this plugin before. */
button{height:var(--input-height);font-family:inherit;font-size:inherit;
       color:var(--text-normal);background:var(--interactive-normal);
       padding:0 12px;border:0;border-radius:5px;cursor:pointer}
.svg-icon{width:1em;height:1em}
.wrap{max-width:760px;margin:0 auto}
.probe{font:12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;background:#1e1c26;
       border:1px solid #35323f;border-radius:8px;padding:12px 14px;margin:0 0 22px}
.probe b{font-weight:600;color:#dcd9e6}
.ok{color:#6bd39a} .bad{color:#f2757a}
.probe p{margin:0 0 3px}
h1{font-size:15px;font-weight:600;color:#9a96a8;margin:0 0 14px}
h2{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
   color:#6b6779;margin:26px 0 8px}
</style>
<style>
/* ── styles.css from this tree, verbatim ─────────────────────────────── */
${css}
</style>
</head>
<body>
<div class="wrap">
<h1>ChronoAnvil ${manifest.version} — overview mastheads, plugin CSS only, no theme, no snippets</h1>
<div class="probe" id="probe">measuring…</div>
${cards.map((c, i) => `<h2>${["Weekly", "Monthly", "Quarterly", "Yearly"][i]}</h2>${c}`).join("\n")}
</div>

<script>
const px = (v) => Math.round(parseFloat(v) || 0);
const rows = [];
const mark = (b) => b ? '<span class="ok">painting</span>' : '<span class="bad">NOT painting</span>';

for (const card of document.querySelectorAll('.journal-overview-card')) {
  const unit = card.dataset.unit;
  const band = card.querySelector('.journal-overview-banner');
  const cs = getComputedStyle(band);
  const w = px(cs.borderLeftWidth);
  rows.push('<p><b>' + unit.padEnd(8) + ' band</b> border-left ' + w + 'px ' + cs.borderLeftColor +
    ' &nbsp;' + mark(w > 0) + ' &nbsp;· band height ' + Math.round(band.getBoundingClientRect().height) + 'px</p>');
}

// The navigator's three parts, on the weekly card.
const nav = document.querySelector('.journal-overview-card .journal-period-nav');
const pill = nav.querySelector('.jeh-navpill');
const trig = nav.querySelector('.jpn-value');
const label = nav.querySelector('.jpn-value-label');
const caret = nav.querySelector('.jeh-datenav-caret svg');
const box = (el) => el.getBoundingClientRect();
const gapL = Math.round(box(trig).left - box(pill).right);
const gapR = Math.round(box(nav.querySelector('.jeh-seg-end')).left - box(trig).right);
rows.push('<p><b>navigator</b> strip ' + Math.round(box(nav).height) + 'px · chevron ' +
  Math.round(box(pill).width) + '×' + Math.round(box(pill).height) + ' · label ' +
  Math.round(box(label).height) + 'px (' + getComputedStyle(label).fontSize + ') · caret ' +
  Math.round(box(caret).width) + 'px</p>');
rows.push('<p><b>gaps</b> left of trigger ' + gapL + 'px · right of trigger ' + gapR +
  'px &nbsp;' + (gapL === gapR ? '<span class="ok">equal</span>' : '<span class="bad">unequal</span>') + '</p>');
rows.push('<p><b>trigger underline</b> ' + getComputedStyle(trig).borderBottom +
  ' · width ' + Math.round(box(trig).width) + 'px vs label ' + Math.round(box(label).width) + 'px</p>');

// The retired-rule defect: two spans with no gap between them.
const qh = document.querySelector('.jq-section-head');
if (qh) {
  const a = qh.querySelector('.jq-section-title').getBoundingClientRect();
  const b = qh.querySelector('.jq-section-note').getBoundingClientRect();
  const gap = Math.round(b.left - a.right);
  rows.push('<p><b>jq-section-head</b> title→note gap ' + gap + 'px &nbsp;' +
    (gap > 2 ? '<span class="ok">separated</span>' : '<span class="bad">"Quarters0 of 12 entries"</span>') + '</p>');
}

document.getElementById('probe').innerHTML = rows.join('');
</script>
</body>
</html>`;

mkdirSync(resolve(root, "dist"), { recursive: true });
const out = resolve(root, "dist/masthead-harness.html");
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
