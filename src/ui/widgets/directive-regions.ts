// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The block-level directives: calendars, tables, timelines, summaries — every
// widget that draws a REGION of a note rather than an inline control.
//
// WHAT THESE HAVE IN COMMON, AND WHY THEY LEFT THE SWITCH TOGETHER
//
// Nineteen of the directive switch's forty-six cases carried their whole
// implementation inline: 408 lines of real logic in the body of a single
// method, which is what kept buildFromSpec at 661 lines after every other
// extraction in 2.56.25 had already run.
//
// Three shared properties made them safe to lift as a group:
//
//   1. Each RETURNS from its case rather than assigning `widget` and falling
//      through, so none of them reaches the shared label-wrapping tail. Moving
//      one cannot change how another is labelled.
//   2. Between them they use exactly three things off the class — `app`,
//      `plugin` and `fileOf` — and `app` is reachable as `plugin.app` while
//      `fileOf` is four lines. So they need no host interface at all, just the
//      plugin, unlike the inline controls which take a `deps` object.
//   3. They close over only `kind`, `rest` and `label`, all parsed from the
//      directive string at the top of buildFromSpec, all plain strings.
//
// The switch keeps the routing. What it no longer keeps is the work.
//
// NAMING
//
// Every function here is `build<Kind>Region`, and the suffix is load-bearing
// rather than decorative. Most of these cases delegate to a builder of the
// obvious name — the `links` case calls buildLinks(), the `calendar` case
// calls buildCalendar() — so naming the extracted wrapper after its case would
// shadow the very function it exists to call. The suffix says what these are:
// the directive-level entry point, not the thing that draws.

import { MarkdownPostProcessorContext, TFile, normalizePath } from "obsidian";
import type AlmanacPlugin from "../../main";
import { LiveWidget } from "../livewidget";
import type { VaultArea } from "../../core/links";
import {
  buildJournalBreakdown,
  buildKindTable,
  buildPagesTable,
  buildTagIndex,
  buildTasksTable,
  TasksScope,
  buildTopicStats,
  buildLevelIndex,
  levelScope,
  confidenceKinds,
  confidenceProperty,
  confidenceStats,
} from "../tables";
import { buildLinks } from "../../core/links";
import { buildOnThisDay, buildTimeline } from "../../diary/diary-retrieval";
import { buildJournalSearch } from "../../journals/journal-search";
import { journalFolderScope } from "../../journals/journal";
import { buildJournalsHeader } from "../../journals/journals-header";
import { buildReviewQueue } from "../../review/review-queue";
import { pagesUnder } from "../../core/query";
import { CalendarState, buildCalendar } from "../../diary/calendar";
import { openDayEventMenu } from "../../events/event-ui";
import {
  buildEventsList,
  buildUpcomingEvents,
  DEFAULT_UPCOMING,
} from "../../events/event-widgets";
import { journalTypeOfNote, registeredJournalTypes } from "../../journals/journal";
import { buildJournalsSection } from "../../journals/journals-section";
import { buildCard, buildJournalCards } from "../../journals/journals-cards";
import { queueScope } from "../../review/review-queue";
import { journalTypeNamer } from "../../trackers/entry-trackers";
import { describeSurface, getBuiltinTracker, getTracker } from "../../trackers/trackers";
import { journalChartRefusal } from "../../charts/charts";
import { renderActivityChart, renderJournalTrend } from "../../charts/chart-render";
import type { ChartTeardown } from "../../charts/chart-render";
import { resolvePeriodBounds } from "../../charts/chart-widgets";
import {
  liveScopedWidget,
  liveFileWidget,
  liveDiaryWidget,
} from "./live-widgets";
import {
  PERIOD_FLAG_RE,
  SCOPE_JOURNAL,
  argSpanIn,
  readArg,
  spliceArg,
} from "../../core/directive-grammar";

// A `, period` suffix on a directive means "follow the host note's period"
// rather than a fixed window. It USED TO BE DECLARED HERE, on the argument that
// every directive honouring it is in this file — true until 3.15 gave the
// section editor a reason to find the same argument in the same line. It is now
// `core/directive-grammar.ts`'s, imported above: one table, one test, which is
// what keeps a second copy from growing beside the first.

// The note a directive was rendered into.
//
// Deliberately not core/util's getFile(), which normalises the path first —
// this mirrors the Widgets.fileOf() these bodies were lifted from exactly, so
// the move stays a move. charts/chart-widgets.ts keeps its own copy of the same
// four lines on purpose: charts/ must not import ui/, and sharing one helper is
// not worth pointing a domain folder at the presentation layer.
function fileOfCtx(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): TFile | null {
  const f = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  return f instanceof TFile ? f : null;
}
export function buildLinksRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `links:<ids>` renders the quick-links inline (the form the overview
  // header bars anchor). A trailing `#<area>` modifier —
  // `links:<ids>#diary` — wraps them in a contained bar capped by that
  // vault-area's titlebar, the standalone block a diary entry carries up
  // under the spacer. `#` (not `|`) because buildFromSpec claims `|` for
  // a widget's display label before this switch ever sees the line, and
  // `#modifier` is the codebase's existing directive-modifier idiom
  // (`note:…#line`, `…#collapse`). The area is a VaultArea key ("diary" |
  // "journals"); an unknown token falls back to the plain inline form.
  const hash = rest.indexOf("#");
  const idPart = hash >= 0 ? rest.slice(0, hash) : rest;
  const areaTok = hash >= 0 ? rest.slice(hash + 1).trim() : "";
  const area =
    areaTok === "diary" || areaTok === "journals"
      ? (areaTok as VaultArea)
      : undefined;
  return buildLinks(plugin, ctx, idPart.split(","), area);
}

export function buildCalendarRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // The viewed month is held out here, outside the builder, so the
  // rebuilds below don't yank the user back to the current month while
  // they're browsing (see CalendarState in calendar.ts).
  const state: CalendarState = {};
  // `diary[:N]` is the homepage's whole Diary section in one card:
  // greeting + numbers + destination pills as a header band, then the
  // month grid, then the next N events (2.13.7).
  //
  // ONE SPELLING AS OF 3.11 §7.1. This took a `kind` and also answered to
  // `calendar` (the bare grid) and `calendar:agenda[:N]` (grid plus agenda,
  // no header), under a comment saying both were "still used by the review
  // dashboards". Neither was used by anything: the monthly dashboard draws
  // its day grid and year grid inside `month-summary`, and the weekly,
  // quarterly and yearly dashboards have no calendar at all. The comment was
  // describing an arrangement that predated the dashboards being composed
  // from a catalogue, and nothing failed when it stopped being true because
  // nothing was reading it.
  const n = Number(rest.trim());
  const agenda = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_UPCOMING;
  const eventsPath = normalizePath(plugin.settings.paths.events);
  const diaryPrefix = normalizePath(plugin.settings.paths.diaryDaily) + "/";
  const host = createDiv({ cls: "journal-live-widget" });
  ctx.addChild(
    new LiveWidget(plugin.app, host, {
      build: () =>
        buildCalendar(plugin, {
          state,
          agenda,
          header: true,
          ctx,
          onContext: (iso, evt) =>
            openDayEventMenu(plugin.app, plugin, iso, evt),
        }),
      // Entries move the dots and the heat map; the events note moves the
      // bars and badges. Both have to redraw the grid.
      shouldRefresh: (f) =>
        f.path === eventsPath || f.path.startsWith(diaryPrefix),
    })
  );
  return host;
}

export function buildEventsRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `events` is the manager; `events:upcoming[:N]` is the dashboard list.
  const arg = rest.trim();
  const eventsPath = plugin.settings.paths.events;
  if (arg.startsWith("upcoming")) {
    const n = Number(arg.split(":")[1]);
    const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_UPCOMING;
    return liveFileWidget(plugin, ctx, eventsPath, () =>
      buildUpcomingEvents(plugin, count)
    );
  }
  return liveFileWidget(plugin, ctx, eventsPath, () =>
    buildEventsList(plugin)
  );
}

export function buildOnThisDayRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `on-this-day[:always][:maxYears]` — `always` keeps the empty state
  // visible on a vault too young to have anniversaries yet.
  const args = rest.split(":").map((a) => a.trim()).filter(Boolean);
  const always = args.includes("always");
  const yearsArg = args.find((a) => /^\d+$/.test(a));
  const maxYears = yearsArg ? Number(yearsArg) : undefined;
  return liveDiaryWidget(plugin, ctx, () =>
    buildOnThisDay(plugin, ctx, { always, maxYears })
  );
}

export function buildTimelineRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const n = Number(rest.trim());
  const months = Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
  return liveDiaryWidget(plugin, ctx, () =>
    buildTimeline(plugin, ctx, months)
  );
}

// The folder a `level-index` will actually read, for the subscription — or null
// where the argument names nothing this vault has.
//
// ONE RESOLVER, AND THE SECOND ONE IS WHAT 4.16.1 DELETED. This was a narrow
// duplicate of `levelScope`, kept deliberately because it answers only WHERE and
// carries no refusal sentences, and pinned by a test asserting the two spell the
// resolution identically. The pin worked and the design did not: the moment the
// rule grew a second accepted spelling, the duplicate went on prepending a
// journal root to paths that already had one, and the test failed rather than
// the copy staying correct. A duplicate is only narrow while the original is.
//
// So the widget's resolver is the resolver, and this takes the folder off it.
// The sentence it can also return is a refusal to DRAW, which is
// `buildLevelIndex`'s business — here it means the same thing null always meant:
// nothing to subscribe to.
function levelIndexScope(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  argument: string
): string | null {
  const scope = levelScope(plugin, ctx, argument);
  return typeof scope === "string" ? null : scope.folder.path;
}

// What is below this note, live. 4.16 §1.
//
// THE WATCHED SCOPE IS THE INDEXED SCOPE, which is why this resolves the folder
// here rather than taking the host's. `topics-table` watched the note's own
// parent because that is the only folder it could ever describe; a `level-index`
// pointed at another journal would then have watched the wrong tree entirely —
// live in the sense of having a subscription, and stale in the sense that
// matters.
//
// AND IT WATCHES A FOLDER, which `metadataCache` never fires "changed" for — so
// the path predicate is what notices a new subject appearing, exactly as the
// journal cards' own region spells out.
export function buildLevelIndexRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  argument: string
): HTMLElement | null {
  const watched = levelIndexScope(plugin, ctx, argument);
  // NO SCOPE IS STILL A WIDGET, because the refusal is what has to be drawn and
  // a null here would render nothing at all — which is the outcome that reads as
  // the plugin being broken rather than as the line being wrong.
  if (watched === null) return buildLevelIndex(plugin, ctx, argument);
  return liveScopedWidget(plugin, ctx, watched, () =>
    buildLevelIndex(plugin, ctx, argument)
  );
}

export function buildTopicStatsRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // Scope = host note's own folder, matching confidence-summary — a
  // topic index note reads the topic it sits in without being told
  // which one it is. Live, so adding a lesson repaints the band.
  const file = fileOfCtx(plugin, ctx);
  if (!file?.parent) return null;
  return liveScopedWidget(plugin, ctx, file.parent.path, () =>
    buildTopicStats(plugin, ctx)
  );
}

export function buildKindTableRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `kind-table:<kindId>` — the notes of one kind under the host note's
  // own folder. Scope is that folder, the same rule topics-table,
  // topic-stats and confidence-summary use, so the table and the stats
  // band directly above it cannot disagree about what is here — which
  // is exactly what the ```base block this replaces did (see
  // tables.ts::buildKindTable).
  const file = fileOfCtx(plugin, ctx);
  if (!file?.parent) return null;
  const kindId = rest.trim();
  if (!kindId) return null;
  return liveScopedWidget(plugin, ctx, file.parent.path, () =>
    buildKindTable(plugin, ctx, kindId)
  );
}

export function buildPagesTableRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // Scope = the host note's own folder. A promoted note is a folder note,
  // so its pages are its siblings — the same folder rule every other
  // journal rollup uses, reading one level rather than recursively.
  const file = fileOfCtx(plugin, ctx);
  if (!file?.parent) return null;
  return liveScopedWidget(plugin, ctx, file.parent.path, () =>
    buildPagesTable(plugin, ctx)
  );
}

export function buildJournalChartRegion(
  plugin: AlmanacPlugin,
  kind: string,
  rest: string,
  label: string | null,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `journal-chart:<tracker>[|Label]` — any journal tracker plotted over
  // the dated notes in the host note's folder. Scope = the host's own
  // folder, the same rule topics-table and confidence-summary use, so it
  // reads a subject index (every topic beneath it) or a topic index (just
  // itself) without being told which.
  //
  // `confidence-trend` is the preset spelling of this, kept because it is
  // written into shipped templates and into notes on disk. It was the
  // whole widget until 2.32 and the generalisation is the point: a
  // Reading journal defining "pages read", or a Cooking one defining
  // "difficulty", used to need a new widget written for it. Two spellings
  // rather than a rewrite of the templates, since a directive is content
  // in someone's markdown.
  //
  // NOT part of the chart system, and this is the line that keeps
  // `isChartable` honest rather than bending it. Scope for a journal
  // tracker comes from the *host note*, which chart-ui does not have —
  // it computes chartability once in its constructor with no host in
  // hand. So "can this be charted?" genuinely has different answers in
  // the two places, and journalChartRefusal asks the version this widget
  // can answer: the value-type half of isChartable, plus a surface test
  // against the note rather than against the registry. No spec, no Add
  // Chart entry, no `scopesFor` change.
  const file = fileOfCtx(plugin, ctx);
  if (!file?.parent) return null;
  const folder = file.parent.path;

  const preset = kind === "confidence-trend";
  const trackerId = preset
    ? getBuiltinTracker(plugin, "confidence")?.id ?? "confidence"
    : rest.trim();
  const type = journalTypeOfNote(plugin, ctx.sourcePath);
  const namer = journalTypeNamer(plugin);
  const def = getTracker(plugin, trackerId);
  const refusal = journalChartRefusal(
    def,
    trackerId,
    type?.id ?? null,
    (surface) => describeSurface(surface, namer),
    type?.name
  );

  // The preset spelling stays silent when its built-in has been turned
  // off or renamed: `confidence-trend` sits in every shipped Topic
  // template, so a vault that doesn't rate anything would otherwise show
  // a refusal on every topic page for a widget it never asked for. A
  // hand-written `journal-chart:` is an explicit request and says why it
  // can't be honoured.
  if (refusal != null) {
    if (preset) return null;
    return createDiv({ cls: "journal-widget-error", text: refusal });
  }

  // Titled only when there is something to say. The preset keeps its
  // current appearance — it sits under a `header:🔁 Review` bar in the
  // shipped template and a second title would stutter — while a general
  // `journal-chart:` names its tracker, because a dashboard holding two
  // untitled lines is a dashboard holding two mysteries.
  const title = label ?? (preset ? null : def?.label || trackerId);

  let teardown: ChartTeardown = null;
  return liveScopedWidget(plugin, 
    ctx,
    folder,
    () => {
      const host = createDiv({
        cls: preset
          ? "journal-trend journal-confidence-trend"
          : "journal-trend",
      });
      if (!def) return host;
      if (title) host.createDiv({ cls: "journal-trend-title", text: title });
      teardown = renderJournalTrend({
        app: plugin.app,
        plugin: plugin,
        def,
        folder,
        kinds: confidenceKinds(plugin, ctx.sourcePath, def.id),
        body: host.createDiv({ cls: "journal-chart-body" }),
      });
      return host;
    },
    () => {
      teardown?.();
      teardown = null;
    }
  );
}

export function buildJournalBreakdownRegion(
  plugin: AlmanacPlugin,
  rest: string,
  label: string | null,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `journal-breakdown:<tracker>[|Label]` — the categorical sibling of
  // `journal-chart`. Same folder rule, same refusal path; bars rather
  // than a line, because "which topic is weakest" has no time axis.
  // Live-scoped, so grading a Recall deck anywhere below re-ranks it.
  const file = fileOfCtx(plugin, ctx);
  if (!file?.parent) return null;
  return liveScopedWidget(plugin, ctx, file.parent.path, () =>
    buildJournalBreakdown(plugin, ctx, rest.trim(), label)
  );
}

export function buildReviewQueueRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `review-queue` (host folder) / `review-queue:all` (every journal
  // type) / `review-queue:<folder>`. Live-scoped over whatever it reads,
  // so marking a note reviewed repaints the list with that row gone —
  // the frontmatter write is the only thing that removes a row.
  const file = fileOfCtx(plugin, ctx);
  const hostFolder = file?.parent?.path ?? null;
  const folders = queueScope(plugin, rest, hostFolder);

  // AN EMPTY SCOPE IS AN EMPTY STATE, NOT AN UNKNOWN WIDGET (4.1). This
  // returned null, and a null from a builder makes the dispatcher print
  // `Unknown Almanac widget: review-queue:all` — which is false twice over: the
  // widget is known, and the note is not broken. It is a vault with no journals
  // in it yet.
  //
  // Unreachable until 4.1 and reachable on a new vault ever since. Every note
  // that carried this directive was a journal's own index note, which cannot
  // exist before the journal does, so "no folders in scope" could only mean a
  // hand-written directive pointing nowhere. The journals dashboard is the
  // first page to ship one ABOVE every journal, where a brand-new vault
  // resolves `:all` to nothing and the reader's first sight of the page is a
  // red error.
  //
  // Still no live scope when there is nothing to watch: `liveScopedWidget`
  // subscribes to the folders it is given, and subscribing to none of them is
  // what the widget already does for an unregistered journal. The empty state
  // is drawn once and replaced on the next render after a journal exists.
  if (folders.length === 0) return buildReviewQueue(plugin, rest, ctx, hostFolder);

  return liveScopedWidget(plugin, ctx, folders, () =>
    buildReviewQueue(plugin, rest, ctx, hostFolder)
  );
}

export function buildJournalSearchRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `journal-search` (host folder) / `journal-search:all` (every journal
  // type) / `journal-search:<folder>` — the same scope grammar
  // `review-queue` uses, and literally the same function behind it.
  //
  // NOT live-scoped, unlike almost everything else here. A LiveWidget
  // rebuilds its subtree when a file in scope changes, which would tear
  // out the input mid-keystroke and drop what had been typed — and the
  // widget already re-reads the index each time it is built. `diary-search`
  // is unwrapped for exactly the same reason.
  const file = fileOfCtx(plugin, ctx);
  const hostFolder = file?.parent?.path ?? null;
  return buildJournalSearch(plugin, ctx, rest, hostFolder);
}

export function buildTagIndexRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // `tag-index:<folder>` — folder arg, defaulting to the HOST NOTE'S OWN
  // FOLDER as of 3.11 §6.
  //
  // IT USED TO DEFAULT TO THE CONFIGURED DIARY ROOT, and that made it the only
  // folder-scoped directive in the plugin that did not scope to its host.
  // `tasks-table`, `review-queue` and `journal-search` all read the host's
  // parent when given no argument — "scope is the host note's own folder" is
  // stated three times in this file and once in tables.ts — and this one read
  // a path from settings instead.
  //
  // That was age rather than argument. `tag-index` was written for the
  // homepage and nothing else ever wrote it, and the homepage sits at the
  // vault root, where "the host's own folder" means the whole vault. So a
  // sensible default for one call site became the rule for all of them, and
  // the rule only became visible when 3.11 §6 put the widget on a journal
  // index and found it counting diary tags.
  //
  // THE HOMEPAGE NOW SAYS WHAT IT MEANS. Its catalogue entry emits
  // `tag-index:<diaryRoot>` with the configured path resolved at compose time,
  // so the shipped behaviour is unchanged and is now written down in the note
  // rather than assumed by the renderer.
  let folder = rest.trim();
  if (!folder) {
    const file = fileOfCtx(plugin, ctx);
    if (!file?.parent) return null;
    folder = file.parent.path;
  }
  return liveScopedWidget(plugin, ctx, folder, () =>
    buildTagIndex(plugin, ctx, folder)
  );
}

// Rewrite one `tasks-table` directive's argument in the note it is drawn from.
// 3.18 §5.3.
//
// `argSpanIn` + `spliceArg` RATHER THAN A SECOND PARSER, which is the pair 3.15
// built for exactly this and the reason a scope control needed no grammar of
// its own. The span covers the argument and nothing else, so a `|Label` after
// it, the `,period` suffix and any hand-editing around the line all survive —
// and the `,period` flag is re-appended rather than being carried through the
// splice, because it is not part of the argument the reader is changing.
//
// ONE DIRECTIVE PER NOTE is the assumption, and it is the one `argSpanIn`
// already makes for every other answer written this way. A note with two task
// tables would have the first rewritten; that is a limitation the folder
// control shares and not one this button introduces.
async function setTasksScope(
  plugin: AlmanacPlugin,
  notePath: string,
  next: string
): Promise<void> {
  const file = plugin.app.vault.getAbstractFileByPath(notePath);
  if (!(file instanceof TFile)) return;
  const text = await plugin.app.vault.read(file);
  const lines = text.split("\n");
  const span = argSpanIn(lines, "tasks-table");
  if (!span) return;
  const had = PERIOD_FLAG_RE.test(readArg(lines, span));
  const written = next + (had ? ",period" : "");
  const out = spliceArg(lines, span, written);
  await plugin.app.vault.modify(file, out.join("\n"));
}

export function buildTasksTableRegion(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  // True when the section's header bar is already showing the scope button.
  hostedControls = false
): HTMLElement | null {
  // `tasks-table:<folder>` — collects open Almanac tasks from every note
  // under `<folder>`, grouped by note. Replaces the vault's old
  // ```tasks``` (Tasks-plugin) blocks. The folder arg defaults to the
  // host note's own folder, so a plain `tasks-table` on a folder note
  // scopes to that folder without repeating the path. Live-scoped so
  // ticking a task anywhere under it (or adding one) repaints in place.
  //
  // `tasks-table:<folder>,period` additionally restricts the table to
  // notes dated inside the host dashboard's current week/month. Without
  // it a period dashboard's task list is period-*independent*: the
  // Monthly Overview is one note whose `month-start` the nav buttons
  // rewrite, so the summary above would move while the task list below
  // silently showed every open task ever logged in the folder. That is
  // tolerable for daily tasks, which get ticked; it is not for monthly
  // goals, which accumulate.
  //   tasks-table                          default folder, all tasks
  //   tasks-table:<folder>                 explicit folder, all tasks
  //   tasks-table:,period                  default folder, this period
  //   tasks-table:<folder>,period          explicit folder, this period
  //
  // Two parsing constraints shape this, and both bite silently if missed:
  //
  // Not `|period` — buildFromSpec splits the label off at the first `|`
  // before any directive sees `rest`, so a pipe flag would arrive as a
  // label and the table would render unscoped with no error at all.
  //
  // Not a plain `rest.split(",")` either — the Subject Index template
  // ships `tasks-table:{{folder}}`, and a subject the user named
  // "Reading, Writing" produces a folder path containing a comma. So the
  // flag is matched only as a trailing suffix and stripped; everything
  // left is the folder, commas and all.
  const scopeToPeriod = PERIOD_FLAG_RE.test(rest);
  const arg = rest.replace(PERIOD_FLAG_RE, "").trim();
  const file = fileOfCtx(plugin, ctx);
  const hostFolder = file?.parent?.path ?? null;
  // ROUTED THROUGH THE SHARED SCOPE GRAMMAR SINCE 3.18 (§5.3), where it used to
  // resolve its own folder. `review-queue` and `journal-search` have always gone
  // through `journalFolderScope`, and the three must agree about what a scope
  // word means — a queue and a task table over "the same" subject that disagreed
  // would be a genuinely confusing pair. The suffix is stripped FIRST, so the
  // keyword is read from a bare argument and a folder containing a comma is
  // still a folder.
  //
  // One folder, not many: this widget's live scope is a single subtree, and the
  // two keywords that can name several (`all`, and a `journal` on a note outside
  // every root) resolve to the first or to nothing rather than being flattened
  // into a fake parent.
  const folders = journalFolderScope(plugin, arg, hostFolder);
  const folder = folders[0];
  if (!folder) return null;

  // Whether "This whole journal" is reachable from here. Asked by resolving the
  // keyword rather than by testing the path a second way — the button must not
  // offer a state that would resolve to nothing.
  const inJournal =
    journalFolderScope(plugin, SCOPE_JOURNAL, hostFolder).length > 0;

  // THE SCOPE BUTTON MAY BE HOSTED IN THE SECTION'S HEADER BAR (3.19.2), in
  // which case this widget must not draw a second one inside itself. The bar's
  // copy is built by the block processor and is NOT part of this subtree, which
  // is the whole reason it can live there: `liveScopedWidget` rebuilds
  // everything below on any change under the folder, and a control parented
  // into a header it does not own would be duplicated on every rebuild. The
  // bar's copy stays correct without being rebuilt because cycling writes the
  // directive and the note repaints from source.
  return liveScopedWidget(plugin, ctx, folder, () =>
    // Bounds resolved *inside* the build closure: LiveWidget re-invokes
    // this on any change under the folder, and its scope check already
    // includes the host note (widgets.ts::liveScopedWidget), so a
    // period-nav click re-reads `month-start` and repaints with the new
    // window. Resolving once outside would pin the table to whichever
    // month happened to be selected at first paint.
    buildTasksTable(
      plugin,
      ctx,
      folder,
      scopeToPeriod ? resolvePeriodBounds(plugin, ctx) : null,
      hostedControls
        ? null
        : {
            arg,
            hostFolder,
            inJournal,
            cycle: (next) => {
              void setTasksScope(plugin, ctx.sourcePath, next);
            },
          }
    )
  );
}

// The scope a `tasks-table:` directive resolves to, for a caller that wants the
// CONTROL without the table — the block processor hosting the button in the
// section's header bar.
//
// SHARED WITH THE REGION RATHER THAN RE-DERIVED, because the two must agree
// about what the current scope is or the button would announce a state the
// table is not in. The parsing constraints are the region's and are subtle
// enough already: a trailing `,period` suffix stripped before the keyword is
// read, and a folder that may legitimately contain a comma.
export function tasksScopeFor(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): TasksScope | null {
  const arg = rest.replace(PERIOD_FLAG_RE, "").trim();
  const file = fileOfCtx(plugin, ctx);
  const hostFolder = file?.parent?.path ?? null;
  if (!journalFolderScope(plugin, arg, hostFolder)[0]) return null;
  return {
    arg,
    hostFolder,
    inJournal: journalFolderScope(plugin, SCOPE_JOURNAL, hostFolder).length > 0,
    cycle: (next) => {
      void setTasksScope(plugin, ctx.sourcePath, next);
    },
  };
}

export function buildActivityChartRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // Study-subject activity: tasks across the host note's own folder,
  // bucketed by each note's `date`, drawn as three month heatmaps per
  // quarter with quarter-stepping navigation.
  // Scope = the subject folder (the host is its folder note), so it
  // aggregates every topic/lesson beneath it — the same reach the old
  // `folder:` tracker block had. Live-scoped so logging a lesson
  // refreshes it.
  const file = fileOfCtx(plugin, ctx);
  if (!file?.parent) return null;
  const scope = file.parent.path;
  // The quarter being browsed lives out here, not in the widget: the
  // LiveWidget rebuilds this whole subtree whenever anything under the
  // subject folder changes, so state held inside `build` would reset on
  // every edit — ticking a task would yank you back to the current quarter
  // mid-browse. This closure outlives the rebuilds, so the view stays put.
  let quarter: string | undefined;
  let handle: { destroy: () => void } | null = null;
  return liveScopedWidget(plugin, 
    ctx,
    scope,
    () => {
      const stats = confidenceStats(
        pagesUnder(plugin.app, scope),
        confidenceProperty(plugin),
        confidenceKinds(plugin, ctx.sourcePath, confidenceProperty(plugin))
      );
      const rendered = renderActivityChart({
        app: plugin.app,
        scopeFolder: scope,
        initialQuarter: quarter,
        confidence: stats
          ? { avg: stats.avg, count: stats.count }
          : null,
        onQuarterChange: (q) => {
          quarter = q;
        },
      });
      handle = rendered;
      return rendered.el;
    },
    () => {
      handle?.destroy();
      handle = null;
    }
  );
}

export function buildJournalsRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // The whole Journals section in one card — hero band, per-type header
  // rows, subject groups, topic rows — the way `diary` is the whole
  // Diary section in one card. Before 2.13.9 this was a run of generated
  // markdown blocks, which Obsidian renders as separate siblings and so
  // could never be one continuous object.
  //
  // Live over every registered type's root, and over vault *paths* as
  // well as file contents: this section's shape is folders, and the
  // metadataCache "changed" event never fires for a folder — so without
  // shouldRefreshPath, New Subject would leave the list stale until the
  // note was re-rendered.
  const roots = registeredJournalTypes(plugin).map((t) =>
    t.root
  );
  const prefixes = roots.map((r) => normalizePath(r) + "/");
  const inScope = (path: string) =>
    path === ctx.sourcePath || prefixes.some((p) => path.startsWith(p));
  const host = createDiv({ cls: "journal-live-widget" });
  // The Refresh control needs a handle on the widget that owns it, and
  // the widget needs the builder that draws that control — so the two
  // close over each other. Safe: `build` runs on load, after the
  // constructor has returned.
  const live: LiveWidget = new LiveWidget(plugin.app, host, {
    build: () =>
      buildJournalsSection(plugin, ctx, () => {
        // Normalise an older homepage to the one-fence layout, then
        // repaint from disk regardless — the folders may have changed
        // under us (synced in, edited outside Obsidian).
        void plugin.journals
          .rebuildJournalHome()
          .then(() => live.refresh());
      }),
    shouldRefresh: (f) => inScope(f.path),
    shouldRefreshPath: inScope,
  });
  ctx.addChild(live);
  // Turning Study off, or adding a custom journal, changes what this
  // section contains without touching a file it watches. The settings
  // tab signals on close; unsubscribing rides on the widget's own
  // teardown.
  live.register(
    plugin.onJournalTypesChanged(() => live.refresh())
  );
  return host;
}

// One card per journal, as a grid. 4.2 §1 — see `journals-cards.ts` for what
// "just the frame" was allowed to include and what it refused to draw.
//
// LIVE ON THE SAME SCOPE AS `buildJournalsRegion`, and for the same reason it
// spells out: this grid's shape is FOLDERS, and `metadataCache` never fires
// "changed" for a folder — so without `shouldRefreshPath` a new subject would
// leave every card's count stale until the note was re-rendered. It also has to
// watch each journal's own index note, which the root prefixes already cover,
// because that note's frontmatter is where a card's banner comes from.
export function buildJournalCardsRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const prefixes = registeredJournalTypes(plugin).map(
    (t) => normalizePath(t.root) + "/"
  );
  const inScope = (path: string) =>
    path === ctx.sourcePath || prefixes.some((p) => path.startsWith(p));
  const host = createDiv({ cls: "journal-live-widget" });
  const live: LiveWidget = new LiveWidget(plugin.app, host, {
    build: () => buildJournalCards(plugin, ctx),
    shouldRefresh: (f) => inScope(f.path),
    shouldRefreshPath: inScope,
  });
  ctx.addChild(live);
  // Adding a journal or turning Study off changes what this grid contains
  // without touching a file it watches — the same signal `buildJournalsRegion`
  // subscribes to, unsubscribed by the widget's own teardown.
  live.register(plugin.onJournalTypesChanged(() => live.refresh()));
  return host;
}

// One named journal as a card. 4.15 §4.
//
// THE SAME CARD `journals:cards` DRAWS, from the same builder — see `buildCard`,
// which was made exported for this and otherwise untouched. What is different is
// only how many and which: that grid is every journal in registration order, and
// this is one the reader picked, so a page can hold two side by side or three of
// the six a vault has.
//
// LIVE ON ONE ROOT RATHER THAN ALL OF THEM, which is the one place this departs
// from the grid's scope and the departure is the point: a card watching every
// journal's tree would repaint six cards' worth of change into one card that
// shows none of it. The reason the grid watches folders at all carries across
// unchanged — `metadataCache` never fires "changed" for a folder, so a new
// subject would leave the count stale without `shouldRefreshPath`.
//
// REFUSES BY LISTING, on `bridgeRefusal`'s precedent: a bare `journal-card`, a
// misspelled id and a journal deleted in Settings since the line was written are
// all the same question — "which journal?" — and all three get the answer, which
// is what this vault actually has. A blank card would look like the widget
// failing.
export function buildJournalCardRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  id: string
): HTMLElement | null {
  const wanted = id.trim();
  const types = registeredJournalTypes(plugin);
  const type = types.find((t) => t.id === wanted);
  if (!type) {
    const have = types.map((t) => t.id);
    return createDiv({
      cls: "journal-widget-error",
      text: !have.length
        ? "journal-card needs a journal, and this vault has none — turn on Study or add one in Settings → Almanac → Journals."
        : !wanted
          ? `journal-card needs a journal id — one of: ${have.join(", ")}.`
          : `No journal called "${wanted}". This vault has: ${have.join(", ")}.`,
    });
  }
  const prefix = normalizePath(type.root) + "/";
  const inScope = (path: string) =>
    path === ctx.sourcePath || path.startsWith(prefix);
  const host = createDiv({ cls: "journal-live-widget" });
  const live: LiveWidget = new LiveWidget(plugin.app, host, {
    // RE-RESOLVED PER BUILD, not captured: renaming a journal in Settings or
    // turning Study off changes what this id means, and the refusal above is
    // the honest thing to draw when it stops meaning anything.
    build: () => {
      const now = registeredJournalTypes(plugin).find((t) => t.id === wanted);
      return now
        ? buildCard(plugin, ctx, now)
        : createDiv({
            cls: "journal-widget-error",
            text: `No journal called "${wanted}" any more — it was renamed or removed in Settings.`,
          });
    },
    shouldRefresh: (f) => inScope(f.path),
    shouldRefreshPath: inScope,
  });
  ctx.addChild(live);
  live.register(plugin.onJournalTypesChanged(() => live.refresh()));
  return host;
}

export function buildJournalsHeaderRegion(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  // The Journals section's hero band: at-a-glance numbers plus a
  // 53-week activity strip across every registered journal. Scoped
  // live to all of those roots at once, so adding a lesson under any of
  // them repaints the strip without a manual refresh.
  //
  // The roots are read per build rather than captured: enabling Study or
  // adding a custom journal in Settings changes the set, and the home
  // page is re-rendered on that change.
  const roots = registeredJournalTypes(plugin).map((t) =>
    t.root
  );
  return liveScopedWidget(plugin, ctx, roots, () =>
    buildJournalsHeader(plugin)
  );
}
