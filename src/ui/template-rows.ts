// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One rule the two Template windows both need, and neither may own.
//
// `journal-template-modal.ts` and `entry-template-modal.ts` are near-twins and
// their headers say why they are not one file: the journals and the diary have
// different catalogues, different nouns and different stores, and a builder
// taking a flag that selects between two disjoint lists is the shape 4.3
// declined. What they do share is the DECISION below — and a modal importing
// it from its twin would be the merge those headers refuse, arrived at
// sideways. So it lives beside both and is owned by neither, which is the same
// placement `summariseLoss` took in `core/reload-loss.ts` for the box above
// these rows.

// ── A BUTTON WHOSE JOB IS DONE IS NOT DRAWN (1.0.46) ───────────────────
//
// A ⭐ row naming the current default said so from the moment this window became
// a manager — *"IT IS ALREADY THE DEFAULT. A 'use as default' on this row is a
// button whose job is done, which is the control this window declines to draw"*
// — and then only that row was held to it. Every other row was
// `settable: true` unconditionally,
// including 🔒 on a journal that had never been changed from what it shipped:
// pressing it wrote the same config back, the template file needed no change,
// and the only thing the reader saw was the vault-wide refresh command's
// *"journal templates are already current"*. Reported from the diary twin,
// where the 🔒 row is often the ONLY settable row a reader has — there are no
// 🧩 rows until they save one.
//
// SO THE RULE IS ASKED OF THE BYTES, not of which row it is. A row is settable
// when what it composes differs from what this target builds from now, which
// is the same question the ⭐ row used to answer by construction.
//
// AND THEN IT WAS THE ONLY THING SAYING WHICH ROW IS CURRENT (1.0.46). The ⭐
// row is gone — two rows at the top of a window, one of them unable to do
// anything but describe itself, and both describing themselves with the same
// list of nouns. What it told the reader, this now tells them: the row drawing
// no *Use as default* is the one the target is already on. That makes this
// rule load-bearing rather than tidy, and it is why it is asked of every row on
// both surfaces rather than of the rows a window happens to think are eligible.
//
// EXPORTED AND SHARED WITH THE DIARY, because the two windows disagreeing
// about when a button is dead is the drift this pair keeps being split to
// avoid.
export function settableRows<T extends { settable: boolean; compose: () => { text: string } }>(
  rows: T[],
  current: string
): T[] {
  return rows.map((r) =>
    r.settable && r.compose().text === current ? { ...r, settable: false } : r
  );
}
