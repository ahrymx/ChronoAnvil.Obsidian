// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Minimal stand-in for the `obsidian` module so the pure logic in src/ can be
// unit-tested off-platform. Only the surfaces the tested functions actually
// touch are implemented; anything else is a harmless placeholder.

export class TFile {
  path = "";
  name = "";
  stat = { ctime: 0, mtime: 0, size: 0 };

  // The real TFile derives name/basename from the path; the diary index reads
  // `basename` for an entry's fallback title, so mirror that here. The path
  // argument is optional so existing tests that build one field-by-field still
  // work unchanged.
  constructor(path?: string) {
    if (path != null) {
      this.path = path;
      this.name = path.split("/").pop() ?? path;
    }
  }

  get basename(): string {
    return this.name.replace(/\.md$/, "");
  }

  // The real TFile carries this and both util.ts::childFiles and the journal
  // scanner filter on it. Without it every `.extension === "md"` test compared
  // against undefined and silently matched nothing — which is how a scan that
  // should have found five templates found none, and fell back to reading the
  // notes instead.
  get extension(): string {
    const dot = this.name.lastIndexOf(".");
    return dot === -1 ? "" : this.name.slice(dot + 1);
  }
}

export class TFolder {
  path = "";
  name = "";
  children: unknown[] = [];

  // The real TFolder carries a path, and journalChildFolders compares one
  // against each registered type's root to keep a nested journal's root from
  // being read as a container of the type above it. Optional so folders built
  // field-by-field in older tests still work.
  constructor(path?: string) {
    if (path != null) {
      this.path = path;
      this.name = path.split("/").pop() ?? path;
    }
  }
}

export class Notice {
  constructor(_msg?: string) {}
}

export class PluginSettingTab {}

// Enough Plugin for main.ts to be *constructed* and its loadSettings called.
// The managers are all created in onload(), not in the constructor, so
// building one costs nothing and the real settings-loading path — including
// the mirror fallback and every normalisation that follows it — becomes
// testable rather than something a test has to re-implement and hope matches.
export class Plugin {
  app: unknown;
  manifest: { id: string; version: string; dir?: string };
  // Stands in for the plugin's data.json. `null` is what the real loadData
  // returns when the file isn't there, which is the signal the mirror reads.
  _data: unknown = null;

  constructor(app?: unknown, manifest?: { id: string; version: string }) {
    this.app = app;
    this.manifest = manifest ?? { id: "almanac", version: "0.0.0" };
  }

  async loadData(): Promise<unknown> {
    return this._data;
  }
  async saveData(data: unknown): Promise<void> {
    this._data = JSON.parse(JSON.stringify(data));
  }
  addCommand(): void {}
  addRibbonIcon(): void {}
  addSettingTab(): void {}
  registerEvent(): void {}
  registerDomEvent(): void {}
  registerMarkdownCodeBlockProcessor(): void {}
  registerMarkdownPostProcessor(): void {}
  register(): void {}
}
export class MarkdownRenderChild {}

// Importing a src module pulls its whole import graph, so testing anything in
// journal.ts drags in modals.ts, which subclasses these. They need to exist as
// constructors; nothing in the pure-logic tests ever instantiates one.
export class App {}
export class Modal {
  // ASSIGNED, BECAUSE THE REAL ONE DOES. Obsidian's `Modal` sets `this.app`
  // from its constructor argument, and code inside a modal reads it — the
  // journal wizard's folder check asks `this.app.vault` whether a path is
  // already taken. Discarding it here meant any test that constructed a modal
  // and called into such a path failed on `undefined.vault` rather than on
  // whatever it was actually testing.
  app: unknown;
  constructor(app?: unknown) {
    this.app = app;
  }
}
export class SuggestModal<T> {
  constructor(_app?: unknown) {}
  // Referenced as a type parameter site only; the field keeps TS from
  // narrowing T away as unused.
  declare _item: T;
}
export class FuzzySuggestModal<T> extends SuggestModal<T> {}

// A SHELL, ON PURPOSE. `ArgSuggest` extends this and the class body is three
// methods Obsidian calls — none of which a stub can exercise without a DOM and
// a vault. What the folder control actually DECIDES lives in `argCandidates`,
// which is a pure function and is tested directly; this exists so that
// importing `section-editor.ts` does not fail at class-definition time, and it
// asserts nothing.
export class AbstractInputSuggest<T> {
  constructor(
    public app: unknown,
    public inputEl: unknown
  ) {}
  close(): void {}
  getSuggestions(_query: string): T[] {
    return [];
  }
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/$/, "");
}

// A small moment shim sufficient for isoDate()/date formatting and the
// chained UTC date math charts.ts uses (clone/add/subtract/startOf/endOf).
//
// startOf/endOf THROW on a unit they do not implement, and that is deliberate
// as of 2.57. They used to return the receiver unchanged, so `startOf("year")`
// was a silent no-op: a year-scoped window resolved to "the anchor date to the
// anchor date" under test and to the real year in Obsidian, and every assertion
// over it passed for the wrong reason. The `year` branches below are the fix;
// throwing is what stops the next missing unit from being quiet instead.
// It parses a "YYYY-MM-DD" input string (the only shape the plugin passes)
// and otherwise falls back to "now". Not a general moment — just enough for
// the pure-logic tests.
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface MomentShim {
  format: (fmt: string) => string;
  isValid: () => boolean;
  clone: () => MomentShim;
  add: (n: number, unit: string) => MomentShim;
  subtract: (n: number, unit: string) => MomentShim;
  startOf: (unit: string) => MomentShim;
  endOf: (unit: string) => MomentShim;
  // Day-of-week (Sun=0..Sat=6) and whole-day differences: the year-strip
  // helpers (util.ts::yearStripBounds / the hero's "last worked N days ago"
  // line) need both, and neither existed here while the only date maths under
  // test was month/quarter bucketing.
  day: () => number;
  diff: (other: MomentShim, unit: string) => number;
  valueOf: () => number;
}

function makeMoment(d: Date, valid: boolean): MomentShim {
  const shift = (n: number, unit: string): Date => {
    const c = new Date(d.getTime());
    if (unit === "days") c.setUTCDate(c.getUTCDate() + n);
    else if (unit === "weeks") c.setUTCDate(c.getUTCDate() + n * 7);
    else if (unit === "months") c.setUTCMonth(c.getUTCMonth() + n);
    else if (unit === "years") c.setUTCFullYear(c.getUTCFullYear() + n);
    return c;
  };
  return {
    isValid: () => valid,
    format(fmt: string): string {
      const MON = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
      ];
      const MON_FULL = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
      ];
      const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      // Longer tokens first so `MMMM` wins before `MMM`, `MMM`/`DD` before
      // `MM`/`D`, and `dddd` before `ddd`. `MMMM` arrived with the quarter
      // view, whose month rollups are labelled with the full month name.
      return fmt
        .replace(/YYYY/g, String(d.getUTCFullYear()))
        .replace(/dddd/g, DOW[d.getUTCDay()])
        .replace(/ddd/g, DOW[d.getUTCDay()])
        .replace(/MMMM/g, MON_FULL[d.getUTCMonth()])
        .replace(/MMM/g, MON[d.getUTCMonth()])
        .replace(/MM/g, pad(d.getUTCMonth() + 1))
        .replace(/DD/g, pad(d.getUTCDate()))
        .replace(/\bD\b/g, String(d.getUTCDate()))
        .replace(/HH/g, pad(d.getUTCHours()))
        .replace(/mm/g, pad(d.getUTCMinutes()))
        .replace(/ss/g, pad(d.getUTCSeconds()));
    },
    clone: () => makeMoment(new Date(d.getTime()), valid),
    day: () => d.getUTCDay(),
    month: () => d.getUTCMonth(),
    // The ISO-8601 week number: weeks start Monday, and week 1 is the one
    // containing the first Thursday of the year. Needed as of 3.6 because
    // `valueLabel` is now asserted against `periodSpan` — the two are only
    // worth declaring side by side if they can also be READ side by side.
    isoWeek() {
      const c = new Date(d.getTime());
      const day = c.getUTCDay() || 7;
      c.setUTCDate(c.getUTCDate() + 4 - day); // the week's Thursday
      const jan1 = Date.UTC(c.getUTCFullYear(), 0, 1);
      return Math.ceil(((c.getTime() - jan1) / 86400000 + 1) / 7);
    },
    valueOf: () => d.getTime(),
    diff(other: MomentShim, unit: string): number {
      const ms = d.getTime() - other.valueOf();
      if (unit === "days") return Math.floor(ms / 86400000);
      return ms;
    },
    add: (n, unit) => makeMoment(shift(n, unit), valid),
    subtract: (n, unit) => makeMoment(shift(-n, unit), valid),
    startOf(unit: string) {
      const c = new Date(d.getTime());
      if (unit === "month") c.setUTCDate(1);
      else if (unit === "year") c.setUTCMonth(0, 1);
      else if (unit === "quarter") {
        // Reachable as of 2.57.0: `period-nav:quarter` used to collapse to a
        // week navigator, so setPeriod was never called with this unit.
        c.setUTCMonth(Math.floor(c.getUTCMonth() / 3) * 3, 1);
      } else if (unit === "isoWeek") {
        // ISO week starts Monday. getUTCDay(): Sun=0..Sat=6.
        const day = c.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        c.setUTCDate(c.getUTCDate() + diff);
      } else throw new Error(`obsidian-stub: startOf("${unit}") not implemented`);
      return makeMoment(c, valid);
    },
    endOf(unit: string) {
      const c = new Date(d.getTime());
      if (unit === "month") {
        c.setUTCMonth(c.getUTCMonth() + 1, 0); // last day of this month
      } else if (unit === "year") {
        c.setUTCMonth(11, 31);
      } else if (unit === "quarter") {
        // Reachable as of 3.6: `periodSpan` states a quarter by its own bounds
        // rather than by its first and last month's names, so it asks for the
        // last day rather than the third month's first. `startOf` has known
        // both of these since 2.57; the two halves were added as each was
        // first needed, which is why they were asymmetric.
        c.setUTCMonth(Math.floor(c.getUTCMonth() / 3) * 3 + 3, 0);
      } else if (unit === "isoWeek") {
        const day = c.getUTCDay();
        c.setUTCDate(c.getUTCDate() + (day === 0 ? 0 : 7 - day));
      } else throw new Error(`obsidian-stub: endOf("${unit}") not implemented`);
      return makeMoment(c, valid);
    },
  };
}

export function moment(input?: unknown): MomentShim {
  if (typeof input === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
    if (m) {
      const d = new Date(
        Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      );
      return makeMoment(d, true);
    }
    return makeMoment(new Date(), false);
  }
  const d = input instanceof Date ? input : new Date();
  return makeMoment(d, true);
}

// ── Menu ──────────────────────────────────────────────────────────────────
// Enough of Obsidian's Menu for the banner overflow control (2.55.2). Records
// what was added rather than rendering it, because what the tests care about is
// WHICH items a surface offers — a menu that offers "convert to dashboard" on a
// kind with no pages is the defect, and that is assertable without a DOM.
export class MenuItem {
  title = "";
  icon = "";
  handler: (() => void) | null = null;
  setTitle(t: string): this {
    this.title = t;
    return this;
  }
  setIcon(i: string): this {
    this.icon = i;
    return this;
  }
  onClick(fn: () => void): this {
    this.handler = fn;
    return this;
  }
  // RECORDED RATHER THAN RENDERED, like the rest of this class. A checked item is
  // how Obsidian spells a setting that is on, and 4.11's "Wide page" is the first
  // one a test builds — `links.ts` has used `setChecked` since 4.5 but nothing
  // executed that menu, so the stub could go without it. Now something does.
  checked: boolean | null = null;
  setChecked(v: boolean): this {
    this.checked = v;
    return this;
  }
  disabled = false;
  setDisabled(v: boolean): this {
    this.disabled = v;
    return this;
  }
}

export class Menu {
  items: MenuItem[] = [];
  separators = 0;
  shown = false;
  addItem(fn: (item: MenuItem) => void): this {
    const item = new MenuItem();
    fn(item);
    this.items.push(item);
    return this;
  }
  addSeparator(): this {
    this.separators++;
    return this;
  }
  showAtMouseEvent(): void {
    this.shown = true;
  }
  showAtPosition(): void {
    this.shown = true;
  }
  // Every Menu built in a test run, so a test can inspect the last one without
  // the production code needing a seam for it.
  static built: Menu[] = [];
  constructor() {
    Menu.built.push(this);
  }
}
