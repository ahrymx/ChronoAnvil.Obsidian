// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The two bridge directives, and the vault half of the join.
//
// `core/bridge.ts` decides whether the question can be asked. This asks it:
// gathers the facts about the host note, builds the catalogue of what the vault
// currently defines, and — only if the plan comes back ok — reads the other
// surface and draws the answer.
//
// WHY THIS IS A MODULE AND NOT TWO CASES IN directive-regions.ts
//
// The 2.57 touch list guessed directive-regions.ts, on the grounds that both
// bridges draw a region of a note. That was right about what they are and wrong
// about what they cost. Three things are shared between them and by nothing
// else in that file — the refusal render, the window header that names the
// period, and the host-facts/catalogue pair that has to be assembled before
// either can run — and directive-regions.ts is explicitly a home for cases that
// "close over only `kind`, `rest` and `label`, all plain strings". These close
// over a plan. So they go beside their siblings, which is the same rule
// attachment-widgets.ts and recall-widgets.ts were extracted under.
//
// The switch in index.ts still keeps the routing. What it does not keep is the
// work.

import { MarkdownPostProcessorContext, Menu, setIcon, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import {
  otherSurface,
  planBridge,
  serializeSnapshot,
  serializeSnapshotMeta,
  snapshotKeyFor,
  snapshotMetaKeyFor,
  snapshotState,
} from "../../core/bridge";
import type {
  BridgeCatalogue,
  BridgeDirection,
  BridgeHostFacts,
  BridgePlan,
  SnapshotRow,
} from "../../core/bridge";
import {
  frontmatterOf,
  monthlyOverviewPath,
  weeklyOverviewPath,
  quarterOverviewPath,
  yearOverviewPath,
} from "../../core/util";
import { PAGE } from "../../core/vocabulary";
import {
  readIndex,
  readJournalIndex,
  searchEntries,
} from "../../diary/diary-index";
import type { IndexSurface } from "../../diary/diary-index";
import {
  journalFolderScope,
  journalTypeOfNote,
  registeredJournalTypes,
} from "../../journals/journal";
import type { JournalKind, JournalType } from "../../journals/journal";
import { JOURNAL_DATE_PROPERTY } from "../../core/constants";
import { CLASS_DEFS, getTracker, TRACKER_CLASSES } from "../../trackers/trackers";
import { chartableType } from "../../charts/charts";
import { pointsInWindow } from "../../charts/charts";
import { collectPoints, renderTrackerChart } from "../../charts/chart-render";
import type { ChartTeardown } from "../../charts/chart-render";
import { readNoteRegion, writeNoteRegion } from "../../core/notestore";
import { confirmAction } from "../modals";
import { notify } from "../../core/notify";
import { foldableSection, overflowButton } from "../section-frame";
import type { FoldableSection, FoldStore } from "../section-frame";
import { getFile, today } from "../../core/util";
import { emptyLine } from "../empty";
import { liveScopedWidget } from "./live-widgets";

// ── the vault half of the facts ───────────────────────────────────────

function fileOfCtx(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext
): TFile | null {
  const f = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  return f instanceof TFile ? f : null;
}

// Which side of the line the host note sits on.
//
// Asked of the journal registry first and the diary paths second, because the
// journal answer is positive ("this path is under a registered type's root")
// while the diary answer is the absence of one. A note under neither is treated
// as diary — the same permissiveness `directiveAllowedOn` applies to an
// unclassified dashboard, and the bridge's own refusals will catch anything
// that matters about it.
function hostSurface(
  plugin: ChronoAnvilPlugin,
  path: string
): IndexSurface {
  return journalTypeOfNote(plugin, path) ? "journal" : "diary";
}

export function bridgeHostFacts(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext
): BridgeHostFacts {
  const file = fileOfCtx(plugin, ctx);
  const fm = file ? frontmatterOf(plugin.app, file) : {};
  return {
    // Presence, not truthiness — a dashboard that declares `week-start:` and
    // has not navigated yet is still a weekly dashboard.
    declares: (prop) => prop in fm,
    valueOf: (prop) => fm[prop],
    // The diary's date property. A journal note's own `date` is deliberately
    // not read here: a dated journal *leaf* is a thing a bridge reads, not a
    // period a bridge anchors to, and treating one as a one-day dashboard would
    // let a Lesson note silently bridge to the diary day it was written.
    iso: typeof fm["journal-date"] === "string" ? fm["journal-date"] : null,
    surface: hostSurface(plugin, ctx.sourcePath),
  };
}

// The folders a diary-targeted bridge watches for changes.
//
// ONE LIST, FIVE GRAINS. This was written out twice — verbatim, `[diaryDaily,
// diaryMonthly]` — as the refresh scope for each builder, and both copies were
// stale in the same way `readIndex` was: an edit to a weekly entry did not
// repaint a bridge that had just listed it. Named once so the two cannot
// disagree, and read off the class table so a sixth grain needs no edit.
function diaryFolders(plugin: ChronoAnvilPlugin): string[] {
  const paths = plugin.settings.paths;
  // AND THE DIARY ROOT (4.81), which is where an entry written under the period
  // tree actually is — in no grain folder at all. The five stay for a vault
  // that points a grain outside the diary.
  return Array.from(
    new Set(
      [
        paths.diaryRoot,
        ...TRACKER_CLASSES.map((g) => paths[CLASS_DEFS[g].folderKey]),
      ].filter(Boolean)
    )
  );
}

// What the target surface currently defines, so a refusal can list the
// alternatives rather than only rejecting what was asked for.
export function bridgeCatalogue(
  plugin: ChronoAnvilPlugin,
  target: IndexSurface
): BridgeCatalogue {
  const trackers = plugin.settings.trackers
    .filter(chartableType)
    .map((t) => ({ id: t.id, label: t.label || t.id }));

  if (target === "diary") {
    // ONE WALK, FIVE GRAINS. This was two literals — `daily` and `monthly` —
    // under a comment asserting "the diary has exactly two kinds and both are
    // dated by construction". The second half is still true and the first
    // stopped being true in 2.57.12, which added weekly, quarterly and yearly
    // entries. So a journal note could not name three of the five grains as a
    // bridge target, and asking for one got "no note type called weekly" — a
    // refusal naming a typo the reader did not make.
    //
    // The same shape of staleness 3.7 found in `diaryCrumbs`: a table written
    // when the diary had two grains and never revisited when it grew to five.
    // Read off CLASS_DEFS rather than restated here, so a sixth grain is an
    // entry in that table and nothing else — and a test walks TRACKER_CLASSES
    // rather than listing what this returns, because a listing test would have
    // passed at two just as happily.
    //
    // `dated: true` for all five is still true by construction, and for the
    // reason it always was: DIARY_SPEC sets `requireDate`, so an undated file
    // under the entry folders is not an entry at all.
    return {
      kinds: TRACKER_CLASSES.map((grain) => ({
        id: grain,
        label: `${CLASS_DEFS[grain].label} entry`,
        dated: true,
      })),
      trackers,
    };
  }

  const kinds = registeredJournalTypes(plugin).flatMap((type) =>
    type.kinds.map((k) => ({
      id: k.id,
      label: k.label || k.id,
      dated: kindIsDated(plugin, type, k),
    }))
  );

  // Whether notes of this kind carry a date, read off the templates that make
// them rather than asserted about them.
//
// THIS WAS `dated: true`, FLAT, under a comment saying "every leaf kind is
// dated: its template writes `date`". True of every kind that ships, and the
// sentence names its own evidence — *its template writes it* — while testing
// nothing. A custom journal is a reader's own type whose templates are files in
// their vault, and a reader who edits `date:` out of one gets a kind this
// function still calls dated.
//
// 3.8 §5 logged that and §6 left it open because the consequence was cosmetic:
// `dated` only chose between two refusal messages, and a wrong one named the
// wrong reason. Patch 7 made it structural. The entry bridge's picker offers
// `kinds.filter(k => k.dated)`, so a wrong answer here is now a menu entry that
// is guaranteed to refuse the moment the block renders — the plugin offering a
// choice and then declining it, which is worse than a confusing refusal and is
// worse because of that patch rather than in spite of it.
//
// FROM THE METADATA CACHE, WHICH IS WHY THIS CAN STAY SYNCHRONOUS.
// `planBridge` and every refusal it writes are sync, and `vault.read` is not —
// but `metadataCache.getFileCache` is, and a template is an ordinary note whose
// frontmatter Obsidian has already parsed. So this asks the same question the
// index will ask of the notes themselves, one step earlier.
//
// ANY VARIANT COUNTS. A kind may offer several templates and a reader may have
// edited one; the kind is dated if a note of it CAN carry a date, because the
// picker's question is whether this kind can be joined at all. A variant that
// cannot is a narrower problem than this catalogue is asked about, and the
// per-note refusal still catches it.
//
// A MISSING TEMPLATE IS DATED. `readTemplate` failing is "run Set up / repair
// vault", which is a different fault with its own message; answering `false`
// here would hide it behind a bridge refusal that blamed the note type.
function kindIsDated(
  plugin: ChronoAnvilPlugin,
  type: JournalType,
  kind: JournalKind
): boolean {
  const fmOf = (rel: string): Record<string, unknown> | null => {
    const file = getFile(plugin.app, `${type.templatesFolder}/${rel}`);
    if (!file) return null;
    return (plugin.app.metadataCache.getFileCache(file)?.frontmatter ??
      null) as Record<string, unknown> | null;
  };
  let sawTemplate = false;
  for (const variant of kind.templates) {
    const fm = fmOf(variant.template);
    if (fm == null) continue;
    sawTemplate = true;
    if (JOURNAL_DATE_PROPERTY in fm) return true;
  }
  return !sawTemplate;
}

// A page is indexed with `kind: "page"` and carries no date, deliberately:
  // the standing rule is that index notes hold state and leaf notes hold
  // series, and a page is a slice of a leaf rather than a leaf. So it is the
  // one thing in a shipped vault that `bridge-notes:` can name and must be
  // refused for — which is why it is listed rather than omitted. Omitting it
  // would refuse with "no note type called page", naming a typo the reader did
  // not make instead of the reason.
  const pages = registeredJournalTypes(plugin).some((t) =>
    t.kinds.some((k) => k.pages)
  )
    ? [{ id: "page", label: PAGE, dated: false }]
    : [];

  // Deduped by id: two journals may both define "lesson", and a catalogue
  // listing it twice would print it twice in every refusal.
  const seen = new Set<string>();
  const deduped = [...kinds, ...pages].filter((k) =>
    seen.has(k.id) ? false : (seen.add(k.id), true)
  );
  return { kinds: deduped, trackers };
}

// The four dashboards, whose period is a scroll position rather than an
// identity.
//
// The weekly, quarterly and yearly "overviews" are ONE note each, re-scoped in
// place by rewriting a blank `*-start`. A snapshot frozen into one of them stays
// put when the reader presses next: the block then renders the old period's rows
// under a header naming the new one, which is a block asserting it is a record
// of a period it is not a record of. §8's decay, on day one.
//
// Daily and monthly entries, and the per-week/per-quarter entries added in 2.57,
// are all fine — their period is part of what the note IS.
export function isRescopingDashboard(
  plugin: ChronoAnvilPlugin,
  path: string
): boolean {
  const p = plugin.settings.paths;
  return (
    path === weeklyOverviewPath(p) ||
    path === monthlyOverviewPath(p) ||
    path === quarterOverviewPath(p) ||
    path === yearOverviewPath(p)
  );
}

// ── the shared render ─────────────────────────────────────────────────

// A refusal, in the note. Same class the journal chart's refusal uses, because
// it is the same kind of thing and a second look for the same event would be a
// second thing to style.
function refusalEl(message: string): HTMLElement {
  return createDiv({ cls: "ca-journal-widget-error", text: message });
}

// Every bridge block says which period it covered, always.
//
// Not decorative. A scoped widget that does not name its scope is
// indistinguishable from an unscoped one that has quietly lost most of its rows
// — the argument formatPeriodLabel was extracted for in 2.52, and it binds
// harder here because the reader did not choose this window, the host note did.
function bridgeHeader(
  host: HTMLElement,
  plan: BridgePlan,
  label: string | null,
  count: number | null,
  snap: { frozen: boolean; takenIso: string | null },
  actions: {
    freeze: () => void;
    refresh: () => void;
    thaw: () => void;
    rescoping: boolean;
    toggleMode?: () => void;
    mode?: "cards" | "list";
  },
  fold: { store: FoldStore; key: string }
): FoldableSection {
  // A BRIDGE IS A SECTION. That is what it is to a reader — a titled band with
  // a count and a menu, holding a list — so it is built from the same frame as
  // every other one instead of the bespoke title/window/overflow row it shipped
  // with in 2.57.1.
  //
  // What that buys is not tidiness. The bespoke row needed its own visibility
  // rule, which is how it ended up hidden behind a hover that does not exist on
  // touch; the frame's action slot already had that solved, and the fix is to
  // delete the second mechanism rather than to correct it. Same for the title
  // truncation, the glyph slot and the fold marker — all things this block was
  // quietly re-deciding.
  //
  // It therefore draws its OWN frame rather than a `header:` line above it. A
  // bridge inside a fence that already has a header would be a bar inside a
  // bar, which is the box-in-a-box the empty-state rule names.
  //
  // ── AND ITS FOLD IS THE FRAME'S TOO (5.10) ──────────────────────────
  //
  // The paragraph above says a bridge is a section and then built one and a
  // half: the frame drew the bar, and thirty lines here drew a chevron on the
  // LEFT with `.ca-bridge-chevron`, hung a click handler that repeated the
  // frame's own control-exclusion selector word for word, and hid the body with
  // a private `.ca-bridge.is-collapsed > .ca-bridge-body` rule.
  //
  // Every one of those is a second opinion about a decision `foldableSection`
  // had already taken — including which SIDE the chevron is on, which is the
  // one a reader sees. So the fold moves onto the frame, the chevron moves to
  // the right with every other section's, and the state lands on the wrapper
  // the shared rules already close.
  //
  // `FoldStore` is the seam that makes it possible: an interface rather than
  // the plugin, so a caller with its own persistence — this one writes through
  // `setBridgeFold`, under its own key namespace — supplies two methods instead
  // of a fold.
  const section = foldableSection(
    host,
    {
      title: `🌉 ${label ?? plan.targetLabel}`,
      level: 2,
      // The rows, once they are known. Null while the read is still out,
      // because a pill reading `0` because nothing has counted yet is worse
      // than no pill.
      count,
      // The window, in the slot meant for exactly this: "a short muted phrase
      // after the title", not a quantity. A frozen block appends when it was
      // taken — one phrase, because two muted spans competing beside a title
      // read as two headings.
      note:
        snap.frozen && snap.takenIso
          ? `${plan.window.label} · frozen ${snap.takenIso}`
          : plan.window.label,
    },
    fold.store,
    fold.key
  );
  const frame = section.frame;

  if (actions.toggleMode && !snap.frozen) {
    const viewBtn = frame.actions.createEl("button", {
      cls: "clickable-icon ca-journal-widget-viewmode",
      attr: {
        "aria-label": "Toggle cards / list view",
        title: "Toggle cards / list view",
      },
    });
    setIcon(viewBtn, actions.mode === "cards" ? "list" : "layout-grid");
    viewBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      actions.toggleMode?.();
    });
  }

  const buildMenu = (menu: Menu): void => {
    if (actions.toggleMode && !snap.frozen) {
      menu.addItem((i) =>
        i
          .setTitle(actions.mode === "cards" ? "Switch to list view" : "Switch to cards view")
          .setIcon(actions.mode === "cards" ? "list" : "layout-grid")
          .onClick(actions.toggleMode!)
      );
    }
    // Freezing is not offered where it cannot mean anything — a dashboard that
    // re-scopes in place would keep the snapshot when the reader pressed next.
    if (!snap.frozen && actions.rescoping) {
      menu.addItem((i) =>
        i
          .setTitle("Freeze — needs a week or quarter entry")
          .setIcon("info")
          .setDisabled(true)
      );
      return;
    }
    if (snap.frozen) {
      menu.addItem((i) =>
        i.setTitle("Refresh snapshot").setIcon("refresh-cw").onClick(actions.refresh)
      );
      menu.addItem((i) =>
        i.setTitle("Unfreeze (go live)").setIcon("play").onClick(actions.thaw)
      );
      return;
    }
    menu.addItem((i) =>
      i.setTitle("Freeze this view").setIcon("snowflake").onClick(actions.freeze)
    );
  };

  overflowButton(frame.actions, "journal-widget-more", buildMenu);

  // Long-press, which is what Obsidian mobile turns into `contextmenu` — the
  // route calendar.ts, tracker-controls.ts and attachment-widgets.ts already
  // use. 2.57.4 reached for a `(hover: hover)` media query instead, inventing a
  // second answer to a question this codebase had already answered.
  frame.root.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    const menu = new Menu();
    buildMenu(menu);
    menu.showAtMouseEvent(evt as MouseEvent);
  });

  return section;
}

// Render a frozen region back to the screen.
//
// Parses the wikilinks it wrote rather than storing a parallel structured copy.
// Two copies of the same rows would be two things to keep in step, and the
// markdown is the one that has to be right — it is what survives the plugin
// being uninstalled, and what the reader edits.
// One stored line, back to the row it was written from.
//
// Exported and pure so the round trip can be tested. That is not tidiness: the
// bug this pairing shipped with — a note titled "Lesson [draft]" serialising to
// a malformed wikilink — existed precisely because `serializeSnapshot` and this
// parser were tested separately and never against each other. A writer and a
// reader of the same format are one unit, and testing half of one is testing
// that it is self-consistent with nothing.
export function parseSnapshotLine(line: string): SnapshotRow | null {
  const text = line.replace(/^\s*-\s*/, "").trim();
  if (!text) return null;
  const link = /^\[\[([^\]|]+)\|([^\]]+)\]\]\s*(?:—\s*(.*))?$/.exec(text);
  if (link) {
    return { path: link[1], label: link[2], detail: link[3] ?? "" };
  }
  const plain = /^(.*?)\s+—\s+(.*)$/.exec(text);
  if (plain) return { path: null, label: plain[1], detail: plain[2] };
  return { path: null, label: text, detail: "" };
}

function renderFrozen(body: HTMLElement, content: string): void {
  const list = body.createEl("ul", { cls: "ca-bridge-list" });
  for (const line of content.split("\n")) {
    const row = parseSnapshotLine(line);
    if (!row) continue;
    const el = list.createEl("li", { cls: "ca-bridge-row" });
    if (row.path) {
      el.createEl("a", { cls: "internal-link", text: row.label, href: row.path });
      if (row.detail) el.createSpan({ cls: "ca-bridge-date", text: row.detail });
      continue;
    }
    el.createSpan({ cls: "ca-bridge-date", text: row.label });
    if (row.detail) el.createSpan({ cls: "ca-bridge-value", text: row.detail });
  }
}

// Freeze / refresh / thaw, over the note's own body regions.
//
// REFRESH REPLACES, AND SAYS SO IF THE READER HAS EDITED THE REGION. A snapshot
// someone has annotated is no longer a snapshot, and overwriting it silently is
// the one way this feature can lose work — §3.2. The check is a checksum
// recorded beside the content when it was written, so "edited" means edited
// rather than merely different from what a fresh read would produce.
async function writeSnapshot(
  plugin: ChronoAnvilPlugin,
  path: string,
  key: string,
  rows: readonly SnapshotRow[],
  confirmOverwrite: boolean
): Promise<boolean> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return false;
  const metaKey = snapshotMetaKeyFor(key);

  if (confirmOverwrite) {
    const text = await plugin.app.vault.read(file);
    const state = snapshotState(
      readNoteRegion(text, key),
      readNoteRegion(text, metaKey)
    );
    if (state.frozen && state.edited) {
      const ok = await confirmAction(
        plugin.app,
        "Replace this snapshot?",
        "This snapshot has been edited since it was taken. Refreshing replaces it with a fresh reading, and the edits are not recoverable.",
        "Replace",
        true
      );
      if (!ok) return false;
    }
  }

  const content = serializeSnapshot(rows);
  const meta = serializeSnapshotMeta(today(), content);
  // Through vault.process, which serialises against every other body write —
  // the rule capture already follows, and the reason a read-then-write of the
  // whole file is not done here.
  await plugin.app.vault.process(file, (text) =>
    writeNoteRegion(writeNoteRegion(text, key, content), metaKey, meta)
  );
  return true;
}

async function clearSnapshot(
  plugin: ChronoAnvilPlugin,
  path: string,
  key: string
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return;
  await plugin.app.vault.process(file, (text) =>
    writeNoteRegion(writeNoteRegion(text, key, ""), snapshotMetaKeyFor(key), "")
  );
}

export function bridgeFoldKey(sourcePath: string, key: string): string {
  return `${sourcePath}::bridge:${key}`;
}

export function bridgeFoldState(
  plugin: ChronoAnvilPlugin,
  sourcePath: string,
  key: string
): boolean {
  return (
    plugin.settings.collapsedNoteSections?.[bridgeFoldKey(sourcePath, key)] ===
    true
  );
}

export async function setBridgeFold(
  plugin: ChronoAnvilPlugin,
  sourcePath: string,
  key: string,
  value: boolean
): Promise<void> {
  if (!plugin.settings.collapsedNoteSections) {
    plugin.settings.collapsedNoteSections = {};
  }
  plugin.settings.collapsedNoteSections[bridgeFoldKey(sourcePath, key)] = value;
  await plugin.saveSettings();
}

// Plan, then render, or refuse. The one entry point both directives share, so
// the guard cannot be present on one and forgotten on the other.
function buildBridge(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  direction: BridgeDirection,
  rest: string,
  label: string | null,
  fill: (body: HTMLElement, plan: BridgePlan) => void,
  scope: (plan: BridgePlan) => string[],
  rowsFor: (plan: BridgePlan) => Promise<SnapshotRow[]>,
  // Run before each rebuild and once on unload, for anything a `fill` leaves
  // behind that outlives its element. Only the trend needs it — a Chart.js
  // instance survives the DOM node it drew into — and it is optional rather
  // than required so the notes side is not made to declare an empty one.
  cleanup?: () => void
): HTMLElement | null {
  const host = bridgeHostFacts(plugin, ctx);
  const catalogue = bridgeCatalogue(plugin, otherSurface(host.surface));

  // `bridge-notes:<target> <filters>` — the target is the first token, the rest
  // is query text in the grammar the search box already uses.
  const trimmed = rest.trim();
  const cut = trimmed.search(/\s/);
  const target = cut === -1 ? trimmed : trimmed.slice(0, cut);
  const filters = cut === -1 ? "" : trimmed.slice(cut + 1);

  const planned = planBridge({ direction, target, filters, host, catalogue });

  // Refused at render as well as in the editor — §2.3. A hand-written
  // directive, or one whose target lost its date property after it was written,
  // says why instead of going quiet. A vault outlives the session that
  // configured it.
  if (!planned.ok) return refusalEl(planned.refusal.message);

  const plan = planned.value;
  const key = snapshotKeyFor(direction, plan.target);
  const path = ctx.sourcePath;

  const act = (run: () => Promise<boolean>, done: string) => () => {
    void run().then((ok) => {
      if (ok) notify.ok(done);
    });
  };

  return liveScopedWidget(plugin, ctx, scope(plan), () => {
    const el = createDiv({ cls: "ca-bridge" });
    const body = el.createDiv({ cls: "ca-bridge-body" });

    // The fold's memory, in the two methods `foldableSection` asks for. The
    // KEY is this module's — `bridgeFoldKey` namespaces it under `bridge:` so a
    // bridge and a `header:` bar of the same name in the same note cannot
    // collide — so the store ignores the one handed back and answers about the
    // bridge it was built for.
    const foldStore: FoldStore = {
      isCollapsed: () => bridgeFoldState(plugin, path, key),
      setCollapsed: (_foldKey, value) => {
        void setBridgeFold(plugin, path, key, value);
      },
    };

    // THE FROZEN STATE IS READ FROM THE FILE, ASYNCHRONOUSLY, AND THAT ORDER
    // IS FORCED. LiveWidget's `build` is synchronous by contract; Obsidian has
    // no synchronous vault read; and a snapshot is markdown the reader may have
    // edited by hand between renders, so reading anything cached would be
    // reading a copy of the thing whose edits we exist to notice.
    //
    // So the block draws its shell now and resolves live-or-frozen a tick
    // later. The header is built inside the async step rather than twice,
    // because a header that renders live and then re-renders frozen would flash
    // the wrong state — and "this block is a record, not a view" is exactly the
    // claim that must not flicker.
    void (async () => {
      const file = plugin.app.vault.getAbstractFileByPath(path);
      let region = "";
      let metaText = "";
      if (file instanceof TFile) {
        const raw = await plugin.app.vault.cachedRead(file);
        region = readNoteRegion(raw, key);
        metaText = readNoteRegion(raw, snapshotMetaKeyFor(key));
      }
      const snap = snapshotState(region, metaText);

      // The count comes from what will actually be shown, which is why the
      // frozen branch counts stored LINES rather than a fresh read: a frozen
      // block's count has to agree with its own rows, not with what the vault
      // would say today. Those two disagreeing is the whole reason a snapshot
      // is labelled.
      const frozenRows = snap.frozen
        ? region.split("\n").filter((l) => l.trim()).length
        : null;

      let mode: "cards" | "list" = "cards";
      let fold: FoldableSection | null = null;
      const redrawHeader = (currentMode: "cards" | "list") => {
        // REDRAWN, NOT EMPTIED, because the header now brings the fold wrapper
        // with it. The old wrapper comes out after the body has moved into the
        // new one, so the rows are never off the page and the fold's state is
        // read fresh from the store either way.
        const previous = fold?.wrapper ?? null;
        fold = bridgeHeader(el, plan, label, frozenRows, snap, {
          freeze: act(
            async () => writeSnapshot(plugin, path, key, await rowsFor(plan), false),
            "Bridge frozen."
          ),
          refresh: act(
            async () => writeSnapshot(plugin, path, key, await rowsFor(plan), true),
            "Snapshot refreshed."
          ),
          thaw: act(async () => {
            await clearSnapshot(plugin, path, key);
            return true;
          }, "Bridge is live again."),
          rescoping: isRescopingDashboard(plugin, path),
          mode: currentMode,
          toggleMode: () => {
            mode = mode === "cards" ? "list" : "cards";
            (body as HTMLElement & { toggleMode?: (m: "cards" | "list") => void }).toggleMode?.(mode);
            redrawHeader(mode);
          },
        }, { store: foldStore, key });
        // The body was drawn before the header could be — the frozen read is
        // async and the header must not flash the wrong state — so it MOVES
        // into the frame's body rather than the frame being built around it.
        // That is the same answer `frame: section` gives, and it is what keeps
        // the bar above the rows it titles.
        fold.body.appendChild(body);
        previous?.remove();
      };
      redrawHeader(mode);

      if (snap.frozen && region.trim()) renderFrozen(body, region);
      else fill(body, plan);
    })();

    return el;
  }, cleanup);
}

// ── §4: bridge-notes — reads the index ────────────────────────────────

export function buildBridgeNotesRegion(
  plugin: ChronoAnvilPlugin,
  rest: string,
  label: string | null,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const journalFolders = journalFolderScope(plugin, "all", null);
  return buildBridge(
    plugin,
    ctx,
    "notes",
    rest,
    label,
    (body, plan) => {
      // Async fill rather than an async builder: LiveWidget's `build` is
      // synchronous by contract, and the index read is not. The block draws its
      // header immediately and the rows land when the scan returns — which for
      // a cold index is the same wait `diary-search` already has.
      void (async () => {
        const entries =
          plan.surface === "journal"
            ? await readJournalIndex(plugin, journalFolders)
            : await readIndex(plugin);
        const hits = searchEntries(
          entries.filter((e) => e.kind === plan.target),
          plan.query
        );
        if (hits.length === 0) {
          // "Nothing in this window" is a different statement from a refusal,
          // and it has to read like one. The refusal says the question cannot
          // be asked; this says it was asked and the answer is none.
          emptyLine(
            body,
            `No ${plan.targetLabel} notes dated inside ${plan.window.label}. ` +
              `One appears here as soon as its date falls in this period.`
          );
          return;
        }

        let mode: "cards" | "list" = "cards";
        const renderContent = () => {
          body.empty();
          if (mode === "cards") {
            const cards = body.createDiv({ cls: "ca-bridge-cards" });
            for (const hit of hits) {
              const card = cards.createDiv({ cls: "ca-bridge-card" });
              card.addEventListener("click", (e) => {
                if (!(e.target instanceof HTMLAnchorElement)) {
                  void plugin.app.workspace.openLinkText(hit.entry.path, "");
                }
              });
              const main = card.createDiv({ cls: "ca-bridge-card-main" });
              main.createEl("a", {
                cls: "internal-link ca-bridge-card-title",
                text: hit.entry.title,
                href: hit.entry.path,
              });
              if (hit.entry.tags && hit.entry.tags.length > 0) {
                const meta = main.createDiv({ cls: "ca-bridge-card-meta" });
                for (const tag of hit.entry.tags.slice(0, 3)) {
                  meta.createSpan({ cls: "tag", text: tag.startsWith("#") ? tag : `#${tag}` });
                }
              }
              const right = card.createDiv({ cls: "ca-bridge-card-right" });
              if (hit.entry.openTasks > 0) {
                right.createSpan({
                  cls: "ca-bridge-badge",
                  text: `✓ ${hit.entry.openTasks}`,
                });
              }
              if (hit.entry.iso) {
                right.createSpan({ cls: "ca-bridge-date", text: hit.entry.iso });
              }
            }
          } else {
            const list = body.createEl("ul", { cls: "ca-bridge-list" });
            for (const hit of hits) {
              const row = list.createEl("li", { cls: "ca-bridge-row" });
              row.createEl("a", {
                cls: "internal-link",
                text: hit.entry.title,
                href: hit.entry.path,
              });
              if (hit.entry.iso) {
                row.createSpan({ cls: "ca-bridge-date", text: hit.entry.iso });
              }
            }
          }
        };

        (body as HTMLElement & { toggleMode?: (m: "cards" | "list") => void }).toggleMode = (m) => {
          mode = m;
          renderContent();
        };

        renderContent();
      })();
    },
    (plan) => (plan.surface === "journal" ? journalFolders : diaryFolders(plugin)),
    // What freezing would write. Built from the same read the live block draws
    // from, so a snapshot is the block as it stood — not a second query that
    // could answer differently.
    async (plan) => {
      const entries =
        plan.surface === "journal"
          ? await readJournalIndex(plugin, journalFolders)
          : await readIndex(plugin);
      return searchEntries(
        entries.filter((e) => e.kind === plan.target),
        plan.query
      ).map((hit) => ({
        path: hit.entry.path,
        label: hit.entry.title,
        detail: hit.entry.iso ?? "",
      }));
    }
  );
}

// ── §4: bridge-readings — reads the tracker series ────────────────────

// `bridge-readings:<tracker>[#trend] [filters]`.
//
// A FLAG, NOT A THIRD DIRECTIVE, and 2.57 §4 already wrote the test for that
// decision: `bridge-notes` and `bridge-readings` are two directives because
// "the series lives in a different store from the index, with different
// caching, and a union type would have made that invisible". Different store,
// different directive. A trend and a list of the same readings come out of the
// same `collectPoints` call, so they are one directive and a rendering choice.
//
// `#` because that is the plugin's existing flag suffix — `note:focus#line:`,
// `note:capture#collapse:`, `links:…#diary` — so this adds no grammar. It is
// stripped before `buildBridge` splits the target off, because everything below
// this point is about a tracker called `Mood` and not one called `Mood#trend`.
function readingsFlags(rest: string): { rest: string; trend: boolean } {
  const trimmed = rest.trim();
  const cut = trimmed.search(/\s/);
  const head = cut === -1 ? trimmed : trimmed.slice(0, cut);
  const tail = cut === -1 ? "" : trimmed.slice(cut);
  const hash = head.indexOf("#");
  if (hash === -1) return { rest: trimmed, trend: false };
  const flags = head
    .slice(hash + 1)
    .split("#")
    .map((f) => f.trim().toLowerCase());
  return { rest: head.slice(0, hash) + tail, trend: flags.includes("trend") };
}

export function buildBridgeReadingsRegion(
  plugin: ChronoAnvilPlugin,
  rest: string,
  label: string | null,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const { rest: spec, trend } = readingsFlags(rest);
  // The live Chart.js instance, so a rebuild disposes the one it is replacing.
  // A chart parented into a LiveWidget's subtree is destroyed with the DOM on
  // the next rebuild; the Chart.js object behind it is not, and it keeps its
  // resize listener. `onCleanup` is the channel LiveWidget already provides for
  // exactly this — see `chart-grid.ts`, which holds its teardowns the same way.
  let teardown: ChartTeardown = null;
  return buildBridge(
    plugin,
    ctx,
    "readings",
    spec,
    label,
    (body, plan) => {
      const def = getTracker(plugin, plan.target);
      if (!def) return;
      // Through the chart stack's own reader, not a second walk of the diary
      // folders — §8, one level down. This is also the whole reason §4 keeps
      // two directives rather than one with a mode flag: the series lives in a
      // different store from the index, with different caching, and a union
      // type would have made that invisible.
      const points = pointsInWindow(
        collectPoints(plugin.app, plugin, def),
        { start: plan.window.start, end: plan.window.end }
      );
      if (points.length === 0) {
        emptyLine(
          body,
          `No ${plan.targetLabel} readings logged inside ${plan.window.label}. ` +
            `Log one on a diary entry and it appears here.`
        );
        return;
      }
      if (trend) {
        // THE WINDOW IS PASSED, NOT RE-DERIVED. `core/bridge.ts` has already
        // resolved it, refused on it if it could not be resolved, and named it
        // in the header above this body. Handing `renderTrackerChart` a
        // `ChartRange` instead would ask it to resolve a second window that
        // could disagree with the one the block says it covers — and there is
        // no `ChartRange` that means "the period this note declares" without
        // the note's own `PeriodBounds`, which a journal leaf does not have.
        const chart = body.createDiv({ cls: "ca-bridge-trend" });
        teardown = renderTrackerChart({
          app: plugin.app,
          plugin,
          def,
          type: "line",
          range: "period",
          period: null,
          window: { start: plan.window.start, end: plan.window.end },
          body: chart,
        });
        return;
      }
      const list = body.createEl("ul", { cls: "ca-bridge-list" });
      for (const p of points) {
        const row = list.createEl("li", { cls: "ca-bridge-row" });
        row.createSpan({ cls: "ca-bridge-date", text: p.date });
        row.createSpan({ cls: "ca-bridge-value", text: String(p.value) });
      }
    },
    () => diaryFolders(plugin),
    async (plan) => {
      const def = getTracker(plugin, plan.target);
      if (!def) return [];
      return pointsInWindow(collectPoints(plugin.app, plugin, def), {
        start: plan.window.start,
        end: plan.window.end,
      }).map((pt) => ({ path: null, label: pt.date, detail: String(pt.value) }));
    },
    () => {
      teardown?.();
      teardown = null;
    }
  );
}
