// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.9 §3.3 — the hover-reveal policy, as a build failure rather than a list.
//
// WHY THIS IS A TEST AND NOT A CONVENTION. The sheet had five
// `@media (hover: none)` branches, each added when someone noticed one more
// hover-revealed control was unreachable on a phone. 3.7 added the fifth
// because the fourth happened to sit next to the thing it was writing. That is
// a list which only ever grows, and it grows a release behind the affordances
// it covers — the failure is silent, because a control at `opacity: 0` looks
// exactly like a control that is not there.
//
// The rule: any affordance revealed by hover has a resting state on touch.
// Stated once, checked mechanically, and it fails the moment the sixth arrives
// without one.
//
// WHAT IT FOUND. The roadmap named three uncovered affordances. There were
// four, and none of them was on its list: §1 had already removed the month
// strip's icon by deleting it, and the tracker cell's remove-× turned out to
// have been covered since 2.x. The real set was two title-edit pencils, an
// event row's edit button, and the attachment chip's `⋯` — which on a phone
// was not merely faint but the only route to that menu at all.

import { describe, expect, it } from "vitest";
import { cssRule, readCss } from "./sources";

// Rules that hide an element outright. `opacity: 0` specifically: a control
// that is `display: none` until a class is toggled is a different mechanism
// with a different reveal, and JavaScript is what shows it on either platform.
function hiddenByOpacity(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    if (!/(^|[;\s])opacity:\s*0;/.test(body)) continue;
    const selector = m[1]
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!selector || selector.startsWith("@")) continue;
    // Only the ones a hover is what brings back — an element hidden at rest
    // and revealed by a state class is not a hover affordance.
    out.push(selector);
  }
  return out;
}

// The last class named in a selector: the thing actually being hidden.
function subject(selector: string): string | null {
  const classes = selector.match(/\.[a-zA-Z][\w-]*/g);
  return classes ? classes[classes.length - 1] : null;
}

describe("a hover-revealed affordance has a resting state on touch", () => {
  it("covers every element hidden at opacity 0 and revealed on hover", () => {
    const css = readCss();

    // Everything a `:hover` rule brings back to full opacity.
    const revealed = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\s+/g, " ");
      if (!sel.includes(":hover")) continue;
      if (!/opacity:\s*(1|0\.\d+);/.test(m[2])) continue;
      const s = subject(sel);
      if (s) revealed.add(s);
    }

    // Everything a `(hover: none)` branch gives a resting state to.
    const covered = new Set<string>();
    for (const block of css.matchAll(/@media\s*\(hover:\s*none\)\s*\{/g)) {
      // Take the branch's body by brace-matching from the opening brace.
      let depth = 0;
      let i = block.index + block[0].length - 1;
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      for (const c of css.slice(start, i).match(/\.[a-zA-Z][\w-]*/g) ?? []) {
        covered.add(c);
      }
    }

    const uncovered = [
      ...new Set(
        hiddenByOpacity(css)
          .map(subject)
          .filter((s): s is string => s != null && revealed.has(s))
      ),
    ].filter((s) => !covered.has(s));

    // If this fails, the fix is a `@media (hover: none)` branch giving the
    // named class a resting opacity — not an exemption here.
    expect(uncovered).toEqual([]);
  });

  it("keeps (hover: none) meaning 'no hover' rather than 'a phone'", () => {
    // The two questions were sharing an answer, which is why the branch list
    // kept growing: every phone-shaped problem arrived at the only mechanism
    // that existed. `body.is-mobile` answers "is this a phone" now (§3.4 Q1),
    // and this stays for the device question it actually asks — a desktop with
    // a touchscreen answers one way and a phone the other.
    const css = readCss();
    const branches = css.match(/@media\s*\(hover:\s*none\)/g) ?? [];
    expect(branches.length).toBeGreaterThan(0);
    // Nothing in a hover branch should be sizing a control: that is the mobile
    // scope's job, and doing it here would put the two questions back together.
    for (const m of css.matchAll(
      /@media\s*\(hover:\s*none\)\s*\{([\s\S]*?)\n\}/g
    )) {
      expect(m[1]).not.toMatch(/min-height|--ca-space-unit/);
    }
  });
});

describe("the mobile scope is read once (3.9 §3.4)", () => {
  it("has exactly one body.is-mobile block defining the scale", () => {
    // §3.3: "a single `body.is-mobile` scope in 00-tokens.css that redefines
    // the scale, rather than a growing list of `(hover: none)` branches". One,
    // so there is one place to change the decision — the property the whole
    // section exists to buy.
    const css = readCss();
    const defs = css.match(/body\.is-mobile\s*\{[^}]*--ca-space-unit/g) ?? [];
    expect(defs).toHaveLength(1);
  });

  it("asserts a touch floor on controls and nowhere else", () => {
    // The floor is 40px rather than the published 44px, because this is a
    // dense information app — and it is on tap targets only. A display chip
    // that reports a count is not a target, and growing one to 40px would push
    // a table row half again as tall for nothing.
    const css = readCss();
    expect(css).toMatch(/body\.is-mobile\s*\{[^}]*--ca-control-min:\s*40px/);
    expect(css).toMatch(/min-height:\s*var\(--ca-control-min\)/);
    // Off by default: a pointer device keeps whatever height its content makes.
    expect(css).toMatch(/--ca-control-min:\s*auto/);
  });
});

// 1.0.15 — and the other half of the same split: what the phone loses outright.
//
// `(hover: none)` above is about a control being FINDABLE without a pointer over
// it. This is about a control being USABLE at all, which is a different question
// with a different answer, and the two are one file apart on purpose: the reader
// who widens one has to walk past the other.
describe("a gesture a phone cannot perform draws no control (1.0.15)", () => {
  // The block furniture, and why each one is here:
  //   the grip drags with the HTML5 API, which fires no `dragstart` on touch;
  //   both dividers resize on `pointerdown`, which touch does fire — but with no
  //   `touch-action: none` the browser takes the movement for a scroll.
  const GONE = [
    ".ca-jbd-handle",
    ".ca-journal-group-divider",
    ".ca-journal-card-divider",
  ];

  it("hides the grip and both resize dividers on a phone", () => {
    for (const cls of GONE) {
      expect(cssRule(`body.is-mobile ${cls}`)).toMatch(/display:\s*none/);
    }
  });

  it("keeps the touch resting opacities, because a touchscreen desktop drags", () => {
    // The mistake this guards is the tidy one: seeing `display: none` land on
    // the grip and deleting the `(hover: none)` branch as superseded. It is not
    // superseded — it covers a device that has no hover AND can drag, which is
    // the whole reason §3.4 Q1 stopped the two questions sharing an answer.
    const css = readCss();
    for (const cls of GONE) {
      const branch = css.match(
        new RegExp(`@media\\s*\\(hover:\\s*none\\)\\s*\\{\\s*\\${cls}\\s*\\{[^}]*opacity:\\s*0\\.\\d+`)
      );
      expect(branch, `${cls} lost its (hover: none) resting opacity`).not.toBeNull();
    }
  });

  it("takes nothing else away from a phone", () => {
    // THE LIST IS CLOSED, and this is the assertion that keeps it closed. Every
    // affordance on a card that is not a drag is the reader's only route to the
    // thing it does — the title pencil, the group `+`, a row's `⋯`, *What's
    // below*'s Edit — and this file's own history is the warning: the attachment
    // chip's `⋯` was, on a phone, "not merely faint but the only route to that
    // menu at all". So a `body.is-mobile` rule may hide the three above and
    // nothing more; a fourth is a decision, not a tidy-up.
    //
    // The two exceptions are not controls. They are the LABELS inside controls
    // that stay — a header button and a card's action chip go icon-only where
    // the pane is narrow, which subtracts words rather than reach.
    const LABELS = [".ca-journal-btn-label", ".ca-jcl-action-label"];
    const css = readCss();
    const hidden = new Set<string>();
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!/(^|[;\s])display:\s*none;/.test(m[2])) continue;
      // Comments carry commas and prose, and in the sources they sit inside the
      // capture — strip them before splitting or the first selector of every
      // documented rule is a sentence.
      const selectors = m[1].replace(/\/\*[\s\S]*?\*\//g, " ").split(",");
      for (const sel of selectors) {
        const s = sel.replace(/\s+/g, " ").trim();
        if (!s.startsWith("body.is-mobile")) continue;
        const last = subject(s);
        if (last) hidden.add(last);
      }
    }
    expect([...hidden].sort()).toEqual([...GONE, ...LABELS].sort());
  });
});
