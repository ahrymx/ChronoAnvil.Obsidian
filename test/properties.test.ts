// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The properties window — 4.51.6.
//
// WHAT IT REPLACED IS WHY IT IS TESTED THIS WAY. Obsidian's property panel is
// six rows between the note's title and its first block; Almanac now hides it
// (`am-absorb-host-chrome`) and puts the same fields behind a button on the
// bar. That means this window is the ONLY route to a note's frontmatter for a
// reader who never opens the editor — so the rows that matter are the ones
// about *not losing anything on the way*: which values get an editor, which
// are shown and left alone, and that nothing is written per keystroke.

import { describe, expect, it } from "vitest";
import { readCss, readSrc } from "./sources";
import {
  listToText,
  orderedKeys,
  shapeOf,
  textToList,
} from "../src/ui/properties";

describe("which control a value earns", () => {
  it("gives every scalar the editor for its own type", () => {
    expect(shapeOf("Tuesday")).toBe("text");
    expect(shapeOf(7)).toBe("number");
    expect(shapeOf(0)).toBe("number");
    expect(shapeOf(true)).toBe("boolean");
    expect(shapeOf(false)).toBe("boolean");
  });

  it("treats an empty property as a field to fill in, not a refusal", () => {
    // THE COMMON CASE, AND THE ONE THAT WOULD BE MADDENING TO GET WRONG. A
    // template writes `Mood:` with nothing after it, and a reader pressing
    // Properties to fill it in must find a box. `undefined` is the same state
    // read through a different parser.
    expect(shapeOf(null)).toBe("text");
    expect(shapeOf(undefined)).toBe("text");
  });

  it("edits a flat list and refuses a structured one", () => {
    expect(shapeOf(["home", "work"])).toBe("list");
    expect(shapeOf([])).toBe("list");
    expect(shapeOf([1, 2, null])).toBe("list");
    // A LIST OF OBJECTS IS NOT A LIST OF WORDS. Flattening `[{a: 1}]` to text
    // is the one operation in this window that would destroy a reader's data,
    // and it would do it silently — the note would look fine afterwards.
    expect(shapeOf([{ a: 1 }])).toBe("opaque");
    expect(shapeOf({ nested: true })).toBe("opaque");
  });

  it("shows an opaque value rather than hiding it", () => {
    // Hidden would be worse than greyed: a window that silently omits a key is
    // a window that says the note does not have it.
    const t = readSrc("properties");
    expect(t).toContain('row.settingEl.addClass("amp-row-opaque");');
    expect(t).toContain(
      'row.setDesc("A list or object — edit this one in the note itself.");'
    );
    expect(t).toMatch(/if \(shape === "opaque"\) \{[\s\S]{0,400}?return;\s*\n\s*\}/);
  });
});

describe("the round trip through a list", () => {
  it("shows what `tags` already looks like in a vault", () => {
    expect(listToText(["home", "work"])).toBe("home, work");
    expect(listToText([])).toBe("");
    expect(listToText("not a list")).toBe("");
  });

  it("drops the trailing comma rather than saving it as a value", () => {
    expect(textToList("home, work,")).toEqual(["home", "work"]);
    expect(textToList("  home ,work ")).toEqual(["home", "work"]);
    expect(textToList("")).toEqual([]);
  });

  it("survives the trip in both directions", () => {
    const list = ["one", "two", "three"];
    expect(textToList(listToText(list))).toEqual(list);
  });
});

describe("the order a reader meets the keys in", () => {
  it("opens on what Almanac wrote, then the rest alphabetically", () => {
    const fm = { zeta: 1, Mood: 3, created: "x", title: "A day" };
    expect(orderedKeys(fm, ["title", "created"])).toEqual([
      "title",
      "created",
      "Mood",
      "zeta",
    ]);
  });

  it("names no key the note does not have", () => {
    // A window listing `journal-date` on a note without one is a window
    // inventing a property, and the next blur would write it.
    expect(orderedKeys({ a: 1 }, ["title", "journal-date"])).toEqual(["a"]);
  });

  it("keeps every key exactly once", () => {
    const fm = { title: "x", b: 1, a: 2 };
    const keys = orderedKeys(fm, ["title", "a"]);
    expect(keys.sort()).toEqual(Object.keys(fm).sort());
  });
});

describe("what the window writes, and when", () => {
  const props = () => readSrc("properties");

  it("writes on blur rather than on every keystroke", () => {
    // `processFrontMatter` REWRITES THE FILE. A write per character is a write
    // per character into the reader's vault and into whatever is syncing it.
    const t = props();
    expect(t).not.toMatch(/onChange\(\(v\) => void this\.write\(key, v\)\)\s*\n?[\s\S]{0,40}addText/);
    const blurs = t.match(/addEventListener\("blur"/g) ?? [];
    expect(blurs.length).toBe(3);
    // The toggle is the exception, and it is not one: a switch has no typing to
    // wait for, and its change IS the reader finishing.
    expect(t).toContain("c.setValue(value === true).onChange((v) => void this.write(key, v))");
  });

  it("empties a property and removes one as two different things", () => {
    // Both are states a reader can mean. An empty `Mood:` is what a template
    // writes; a template field that is GONE is a note that opted out of it.
    const t = props();
    expect(t).toContain("fm[key] = value;");
    expect(t).toContain("delete fm[key];");
  });

  it("refuses a number it cannot parse instead of storing the text", () => {
    // A `Sleep: seven` written through a number field is a property every
    // tracker reading it will silently skip.
    expect(props()).toContain("else notify.info(`${key} needs a number.`);");
  });

  it("rebuilds the list after a change that alters it", () => {
    // A removal and an addition both change WHICH rows exist; a window that
    // patched one row would be showing a list the file no longer has.
    const t = props();
    expect(t).toMatch(/delete fm\[key\];[\s\S]{0,80}this\.render\(\);/);
    expect(t).toMatch(/await this\.write\(name, null\);\s*\n\s*this\.render\(\);/);
  });

  it("will not add a property the note already has", () => {
    expect(props()).toContain("if (name in fm) {");
  });

  it("keeps the words on the button that adds one", () => {
    // IT SHIPPED AS A BARE `+` (4.51.7). `setButtonText(…).setIcon("plus")` —
    // and Obsidian's `setIcon` REPLACES the button's content, so the second
    // call threw the label away. A glyph alone in a window of named fields is a
    // control the reader has to guess at.
    const t = props();
    expect(t).toContain('b.setButtonText("Add a property…")');
    expect(t).not.toMatch(/setButtonText\("Add a property…"\)\s*\.setIcon/);
  });

  it("puts space between the head and the first field", () => {
    // Reported from the vault: the rule under "Properties" landed on
    // `journal-date`, so the window opened with its title welded to a field.
    // The space is on the BODY, so a scrolled list keeps it.
    const css = readCss();
    const at = css.indexOf(".am-props-modal .amp-body {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("margin-top:");
    // AND THE FIRST ROW KEEPS ITS OWN PADDING, which is what 4.51.7 got wrong:
    // it gave up the hairline AND the padding, and a `Setting`'s control is
    // taller than its label — so the words looked spaced and the INPUT sat on
    // the rule. Reported a second time as still cramped.
    const first = css.indexOf(
      ".am-props-modal .amp-body > .setting-item:first-child {"
    );
    expect(first).toBeGreaterThan(0);
    const firstRule = css.slice(first, css.indexOf("}", first));
    expect(firstRule).toContain("border-top: none");
    expect(firstRule).not.toContain("padding-top: 0");
    // And the buttons sit below the list rather than on its last row.
    const foot = css.indexOf(".am-props-modal .amp-foot {");
    expect(foot).toBeGreaterThan(0);
    expect(css.slice(foot, css.indexOf("}", foot))).toContain("border-top:");
  });
});

describe("the button that opens it", () => {
  const banner = () => readSrc("vault-banner");

  it("says how many properties there are, on the bar", () => {
    // WITH OBSIDIAN'S PANEL HIDDEN THIS COUNT EXISTS NOWHERE ELSE, which is
    // why it is on the face of the control rather than in its tooltip.
    const t = banner();
    expect(t).toContain('cls: "avb-props"');
    expect(t).toContain('propsBtn.createSpan({ cls: "avb-props-count", text: String(props) });');
    expect(t).toContain('"aria-label": `Properties (${props})`');
    // …AND SAYS NOTHING WHERE THERE IS NOTHING TO COUNT (4.51.7). `≡ 0` is a
    // figure the reader has to read before learning it was not worth reading.
    // The label keeps the number, because a screen reader has no glyph to see.
    expect(t).toContain("if (props > 0) {");
  });

  it("opens the same window from the keyboard as from the mouse", () => {
    // A `div` given `role="button"` has none of a button's behaviour; every
    // one of them in this plugin has to bring its own Enter and Space.
    const t = banner();
    expect(t).toContain('role: "button", tabindex: "0"');
    expect(t).toContain('propsBtn.addEventListener("click", openProps);');
    expect(t).toMatch(/if \(evt\.key === "Enter" \|\| evt\.key === " "\)/);
  });

  it("counts from the cache the rest of the bar reads", () => {
    expect(banner()).toContain(
      "this.app.metadataCache.getFileCache(file)?.frontmatter ?? {}"
    );
  });

  it("does not fight the cog for the row's slack", () => {
    // Two elements both claiming `margin-left: auto` put a gap between
    // themselves — the button takes it, and the cog beside it gives it up.
    const css = readCss();
    const at = css.indexOf(".am-vault-banner .avb-props ~ .avb-cog {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("margin-left: 0");
  });
});
