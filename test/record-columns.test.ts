// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The data lines up with the header — 1.0.31.
//
// The reader's ask, after they had ruled everything else out: *"the only thing
// wrong is that the data does not always line up with the header. Mobile looks
// good as it is."*
//
// WHAT WAS ACTUALLY WRONG, because the cause is not visible in the symptom.
// The heading strip and every row carried the SAME TRACK LIST and were SEPARATE
// GRID CONTAINERS. An `auto` track is sized by the content of its own grid, so
// the strip sized the status column to the word `Status` and the row under it
// sized that column to `In Progress`; `Confidence` went the other way, a
// heading wider than any gauge beneath it. Each column was off by its own
// amount in its own direction — which is why it read as "not always".
//
// Under it sat a second, constant one: the row is a flex box with an 8px gap
// between its slots and the strip is one box with padding, so the whole value
// block sat 8px left of its headings even where the tracks agreed.
//
// The fix is one grid with the strip and the rows as SUBGRIDS of it, so the
// widest date in the table and the word `Date` are measured against each other
// exactly once. These assertions are the parts of that which are easy to undo
// by accident.

import { describe, expect, it } from "vitest";

import { cssRule, readCss, readSrc } from "./sources";

const css = (): string => readCss();

describe("the record list hands the stylesheet one grid", () => {
  it("marks the list and puts the tracks on it", () => {
    // The tracks used to exist only on the strip and on each row — one copy per
    // grid, which is the same as saying there was no shared answer.
    const t = readSrc("tables");
    expect(t).toContain('createDiv({ cls: "ca-list is-record" })');
    expect(t).toContain('list.style.setProperty("--ca-row-cols", tracks);');
    // And still on each row, because that is what the fallback layout reads.
    expect(t).toContain("columns: tracks,");
  });
});

describe("one grid, and everything in it a subgrid", () => {
  it("gives the list every track the row has slots for", () => {
    // Lead and token before the name, actions after the values. A slot that is
    // not a track is a slot the strip cannot reserve for, which is the second
    // half of the bug.
    const rule = cssRule(".ca-list.is-record");
    expect(rule).toContain("display: grid;");
    expect(rule).toContain(
      "grid-template-columns: auto auto var(--ca-row-cols) auto;"
    );
  });

  it("makes the strip and the rows subgrids of it, spanning all of it", () => {
    const rule = cssRule(".ca-list.is-record > .ca-list-heads");
    expect(rule).toContain("grid-template-columns: subgrid;");
    expect(rule).toContain("grid-column: 1 / -1;");
    // The same rule covers the rows — one selector list, because a strip that
    // is laid out differently from the rows is the thing being fixed.
    expect(cssRule(".ca-list.is-record > .ca-list-row")).toContain(
      "grid-template-columns: subgrid;"
    );
  });

  it("subgrids the row's main region across the value tracks only", () => {
    // NESTED, AND IT HAS TO BE. The cells are not children of the row, they are
    // children of `.ca-list-main`, so a subgrid that stopped at the row would
    // leave the cells in a grid of their own — which is the original bug with
    // one more level in it.
    const rule = cssRule(
      ".ca-list.is-record > .ca-list-row > .ca-list-main.is-columned"
    );
    expect(rule).toContain("grid-template-columns: subgrid;");
    // From the name to the last value: past the lead and the token, short of
    // the actions.
    expect(rule).toContain("grid-column: 3 / -2;");
  });

  it("keeps the horizontal padding off both subgrids", () => {
    // THE TRAP THIS FIX CAN FALL INTO ITSELF. A subgrid's own left padding
    // shifts its tracks off its parent's, which is the reported bug again one
    // level down. The 6px each of them used to pay moves to the list.
    expect(cssRule(".ca-list.is-record > .ca-list-row")).toContain(
      "padding: 6px 0;"
    );
    expect(cssRule(".ca-list.is-record > .ca-list-heads")).toContain(
      "padding: 0 0 4px;"
    );
    expect(cssRule(".ca-list.is-record")).toContain("padding: 0 6px;");
  });

  it("spends the column gap as padding instead", () => {
    // A GRID GAP FALLS BETWEEN TRACKS, INCLUDING EMPTY ONES, and two of these
    // are empty on every row of every table: the token, which a record row
    // never fills, and the lead, which only edit mode fills. A 12px column gap
    // would have charged each row 24px of indent for holding nothing twice.
    expect(cssRule(".ca-list.is-record")).toContain("column-gap: 0;");
    const cells = cssRule(".ca-list.is-record .ca-list-cell");
    expect(cells).toContain("padding-left: 12px;");
    // The same 12px on the headings, or the two disagree by a cell's padding —
    // which is this bug with a smaller number.
    expect(cssRule(".ca-list.is-record .ca-list-heads-cell")).toBe(cells);
  });

  it("writes down the alignment the columns used to get by accident", () => {
    // Nothing declared one before and nothing had to: every value track was
    // sized to its own content, so left-aligned text filled its column and READ
    // as right-aligned. Sharing the tracks ends that — a two-character count in
    // a track sized by the word `Activity` would sit at the left of it.
    expect(cssRule(".ca-list.is-record .ca-list-cell")).toContain(
      "text-align: right;"
    );
    // The name column is the exception, as it was and as it looks.
    expect(
      cssRule(".ca-list.is-record > .ca-list-heads > .ca-list-heads-cell:first-child")
    ).toContain("text-align: left;");
  });

  it("undoes the two rules that were compensating for the cause", () => {
    // `has-row-actions` reserved a button's width on the strip and `is-editing`
    // reserved a tick's width on the other side — two paddings standing in for
    // two slots the strip had no way to know about. Under one grid a lead and
    // an actions TRACK reserve their own width by existing, and a padding on
    // top of that is the misalignment back again, mirrored.
    expect(
      cssRule(".ca-list.is-record.has-row-actions > .ca-list-heads")
    ).toContain("padding-right: 0;");
    expect(cssRule(".ca-list.is-record.is-editing > .ca-list-heads")).toContain(
      "padding-left: 0;"
    );
    // The originals stay: they are what the fallback below still needs.
    expect(css()).toContain(".ca-list.has-row-actions .ca-list-heads {");
  });
});

describe("what it is guarded by", () => {
  it("falls back to the previous layout where subgrid is not supported", () => {
    // The first `@supports` in this stylesheet, and it earns itself: subgrid is
    // Chromium 117 and Safari 16, and without the guard an old webview reads
    // `subgrid` as invalid, falls back to `none`, and stacks the whole table
    // into one column. Degrading to yesterday's near-alignment is the worst
    // this may do.
    const sheet = css();
    const guard = sheet.indexOf("@supports (grid-template-columns: subgrid)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(sheet.indexOf(".ca-list.is-record {"));
  });

  it("leaves the phone exactly as the reader found it", () => {
    // *"Mobile looks good as it is."* Below 460px the strip is not drawn and the
    // values are a meta line under the title, so there is no header for the data
    // to line up with and nothing here should reach it. The new layout is inside
    // the complement of that query rather than outside the query altogether.
    const sheet = css();
    const guard = sheet.indexOf("@supports (grid-template-columns: subgrid)");
    const gate = sheet.indexOf("@container (width > 460px)", guard);
    expect(gate).toBeGreaterThan(guard);
    expect(gate).toBeLessThan(sheet.indexOf(".ca-list.is-record {"));
    // And the collapse itself is untouched.
    expect(sheet).toContain("@container (max-width: 460px)");
    expect(cssRule(".ca-list-cell.is-empty")).toContain("display: none;");
  });
});
