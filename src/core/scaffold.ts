// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile, normalizePath } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  createFileEnsuringFolders,
  ensureFolder,
  filesUnder,
  folderNotePath,
  getFile,
  openFile,
  quarterOverviewPath,
  yearOverviewPath,
} from "./util";
import { composeDiaryDashboard } from "../diary/diary-sections";
import { DEFAULT_PATHS } from "./constants";
import { splitEntryFences } from "../trackers/entry-trackers";
import { mergeBannerFences } from "./note-sections";
import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import type { SectionWant } from "./section-model";
import {
  composeEntryTemplate,
  ENTRY_SECTIONS,
  detectEntrySections,
} from "../diary/entry-sections";
import {
  JournalConfig,
  buildJournalType,
  customTemplateFiles,
  journalNotesBase,
  journalTemplateFiles,
} from "../journals/custom-journal";
import { STUDY_JOURNAL, registeredJournalTypes } from "../journals/journal";
import type { JournalType } from "../journals/journal";
import {
  findSection,
  templateTargets,
} from "../journals/journal-sections";
import type { SectionContext } from "../journals/journal-sections";
import { sectionsPresent } from "../journals/journal-plan";
import {
  migrateTrends,
  migrateTrendsHeader,
  migrateTrendsTitle,
} from "../charts/charts";
import { applyLayout, planLayout } from "./layout";
import { RepairOp, repairNote } from "./repair-plan";
import type {
  RepairFileChange,
  RepairGroupId,
  RepairSurvey,
} from "./repair-plan";
import { diffLines, diffText } from "./line-diff";
import type { LineDiff } from "./line-diff";
import { openRepairWindow } from "../ui/repair-modal";
import { modelForSurface } from "../ui/section-insert";
import type { ResolvedSurface } from "../ui/section-insert";
import {
  encodeJournalManifest,
  manifestPathFor,
} from "../journals/journal-manifest";
import { manifestCarriesTracker } from "../journals/journal-import";
import {
  ensureTrendsHeader,
  mergeTrendsSection,
  retitleTrends,
} from "../charts/charts";
import { eventsNoteTemplate } from "../events/eventstore";
import {
  applyDashboardCatchups,
  findDashboardCatchups,
} from "../journals/dashboard-catchup";
import type { DashboardCatchup } from "../journals/dashboard-catchup";
import { composeHomeNote } from "../diary/home-sections";
import { composeDiaryDashboardNote } from "../diary/diary-dashboard-sections";
import { composeJournalsDashboardNote } from "../journals/journals-dashboard-sections";
import { composeSearchNote } from "../diary/search-sections";
import { notify } from "./notify";


// Study's templates, all five composed from the section catalogue.
//
// The dashboards joined in 2.40 (they held no prose) and the three content
// templates in 2.42, once the catalogue could express a markdown heading. The
// argument for keeping the latter as assets — "prose belongs in a markdown
// file, not a string literal in a .ts" — was true, and its cost was that every
// *custom* journal's notes were composed and so got no prose at all. A journal
// type ships no assets, so anything Study could only say in one meant Study
// could say things no other type could.
//
// The list is derived rather than written out: templateTargets(STUDY_JOURNAL)
// already knows every template the type has, and a hardcoded copy is one more
// place for a sixth to be forgotten.
// Retained as the SHAPE Study composes to, which is what the equivalence suite
// checks a preset against. It is no longer a list of files to write: the
// custom-journal loop writes Study's templates now, like every other journal's.
export const STUDY_COMPOSED = templateTargets(STUDY_JOURNAL).map((t) => t.file);

// Every note this plugin ships, paired with the asset it comes from.
//
// One list, read twice: the copy loop creates the missing ones, and
// reconcileLayouts converges the ones that already exist. Two lists is how
// search.md sat on a three-rung scope ladder for a release after the other
// seven were widened — a second enumeration written from the same memory that
// forgot the first.
// A note this plugin ships: either a file in `assets/`, or markdown composed
// from a catalogue.
//
// THE FOUR PERIOD DASHBOARDS ARE COMPOSED AS OF 2.59.3, and their asset files
// are gone. Keeping them would have meant maintaining a second copy of the same
// arrangement plus a test whose only job is to notice the two drifting apart —
// which is the argument STUDY_COMPOSED already made when 2.42 moved Study's
// templates into the catalogue and deleted the files. Composing makes drift
// impossible rather than detectable.
//
// That retires 2.59.2's byte-for-byte diff, and it was never meant to outlive
// this patch: it existed to prove the composition reproduced what shipped,
// which is a migration question and not a standing one. What replaces it is
// the catalogue's own tests, which assert what a dashboard CONTAINS.
export type ShippedNote = { dest: string } & (
  | { asset: string; content?: undefined }
  | { asset?: undefined; content: string }
) & {
  // A TEMPLATE, not a note. Excluded from layout reconciliation: a repair
  // converges the notes a reader keeps, and rewriting the template they compose
  // from would undo a customisation rather than restore one.
  //
  // AN EXPLICIT FLAG AS OF 2.60.1, because the old test was `asset.startsWith
  // ("template-")` — a filename check, which stops answering the moment a
  // template stops being a file. Composed templates have no asset name, so they
  // would have silently become reconcilable: repair would have started
  // rewriting every diary template on every run, which is the one thing this
  // exclusion exists to prevent.
  template?: boolean;
  // Which SECTION SURFACE this note is, where it is one this plugin composes.
  //
  // WHAT IT BUYS, AND WHY IT IS ON THIS TYPE. A note with a surface is
  // reconciled by `repair-plan.ts` through its `SectionModel` instead of by
  // `layout.ts` through directive keywords — see that module's header for the
  // four homepage sections and two dashboard sections the keyword reconciler
  // could not reach, or report. This is the only fact that decides between the
  // two, so it belongs beside `content` and `template` rather than in a second
  // table keyed by path: `shippedNotes` is already the list, and a second
  // enumeration of it is the failure recorded at the top of this file.
  //
  // ABSENT MEANS THE OLD PATH, which is right for the three entries that have
  // one: `staging.md`, `Diary.base` and the documentation README are COPIED
  // from assets and are not composed from any catalogue, so there is no model to
  // ask. The reconcilability predicate already excludes the second of those; the
  // other two keep the keyword reconciler and lose nothing, because neither has
  // a fence holding two directives.
  //
  // AND THIS IS NOT A FOURTH READER OF THAT PREDICATE. It decides which
  // RECONCILER a note gets, not whether it is reconciled at all — the walk still
  // asks the predicate first, and a note it excludes never reaches this field.
  surface?: Exclude<ResolvedSurface, { kind: "managed" }>;
};

// Whether a shipped note takes part in layout reconciliation — and so whether
// repair converges its directive lines and the migration walk rewrites them.
//
// ONE PREDICATE, TWO READERS (4.1 §6.1). `reconcileLayouts` and the migration
// walk both used to state these conditions inline, and both stated them
// wrongly in the same way, because both were written from the same memory. The
// three reasons a note is skipped:
//
//   1. IT IS NOT MARKDOWN. There are no directive lines in JSON to converge.
//      This is the guard §6.1 requires and the one that was missing: the old
//      check tested the ASSET's extension, and a COMPOSED entry has no asset,
//      so it skipped the check entirely. Correct for every composed note that
//      has ever existed, because all of them are markdown — a hole rather than
//      a decision, and one nothing stated anywhere the next entry's author
//      would read it. Add `Homepage.canvas` as composed content and repair
//      runs `planLayout` over JSON.
//
//      NOT `template: true`, WHICH WOULD ALSO SKIP IT. That flag means "a
//      template, excluded from reconciliation"; a canvas is not a template, and
//      borrowing the flag to buy the exclusion would put a lie in the data to
//      save a line — and §7.2 needs the flag to keep meaning what it says.
//
//   2. IT IS COPIED FROM A NON-MARKDOWN ASSET. The older guard, kept rather
//      than folded into the first: nothing requires the pair to agree, and a
//      `.md` written from a non-markdown asset is a thing the type permits.
//
//   3. IT IS A TEMPLATE. The flag rather than the filename — see ShippedNote,
//      which says what that cost when it was a filename check.
//
// (1) IS NOT SPECULATIVE, WHICH WAS A SURPRISE. `00 - Infrastructure/Diary.base`
// is shipped today and is not markdown, so the case already exists — it was
// simply reaching the right answer through (2), because that entry has an asset
// whose extension happens to agree with its destination's. The hole is only in
// the COMPOSED half, where there is no asset for (2) to read, and a composed
// non-markdown note is what §6.1 is about. So this guard states the rule the
// code was already relying on, one step before the first entry that would have
// broken it: the failure is silent, and the commit that would introduce it is
// about a canvas rather than about reconciliation.
export function isReconcilable(note: ShippedNote): boolean {
  if (!note.dest.endsWith(".md")) return false;
  if (note.asset != null && !note.asset.endsWith(".md")) return false;
  if (note.template) return false;
  return true;
}

// `extras` is the vault's own additions to each grain's entry template —
// `AlmanacSettings.entrySections`. Defaulted to none rather than made required,
// because the three call sites in this file all have it and the shape of the
// list is a fact about a configured vault, not about what the plugin ships.
//
// `orders` is the other half of the same fact as of 4.29 —
// `AlmanacSettings.entrySectionBand`, which decides the shared band's ORDER
// where `extras` decides its membership. Defaulted for the same reason, and it
// must travel with `extras` everywhere: a caller that passed one and not the
// other would compose a template that differs from the one on disk by a
// reorder, and `surveyDiaryTemplatesDrift` would then offer to undo every save
// the reader had made.
export function shippedNotes(
  p: typeof DEFAULT_PATHS,
  extras: Partial<Record<TrackerClass, readonly SectionWant[]>> = {},
  bands: Partial<Record<TrackerClass, readonly string[]>> = {}
): ShippedNote[] {
  return [
    // COMPOSED AS OF 3.11 §1, and `assets/home.md` is gone with it. The same
    // move 2.59.3 made for the four period dashboards, made for the note that
    // migration left behind — and the prerequisite for the homepage being
    // editable by the section editor at all, which is what §1 is for.
    {
      content: composeHomeNote(p.diaryRoot),
      dest: p.home,
      surface: { kind: "home", diaryRoot: p.diaryRoot },
    },
    // THE TWO FOLDER-NOTE DASHBOARDS, 4.1 §2. `02 - Diary/` and
    // `03 - Journals/` are the two folders a reader spends their whole time
    // inside and neither had a note at its root: the diary had four period
    // dashboards nested under it, the journals root had nothing at all.
    //
    // DERIVED PATHS, NOT CONFIGURED ONES (§2.5, and §11 refuses the settings
    // keys). `folderNotePath(root)` is how this plugin has said "the page about
    // this folder" since 2.57, and deriving them means there is nothing to add
    // to `PATH_LABELS`, `ROOT_CHILDREN`, `remapConfiguredPaths` or the registry
    // mirror — a folder note moves with its folder for free. A settings entry
    // would exist to let a reader point "the diary dashboard" at a note outside
    // the diary folder, which is the thing the folder-note convention prevents.
    {
      content: composeDiaryDashboardNote(),
      dest: folderNotePath(p.diaryRoot),
      surface: { kind: "diary-dashboard" },
    },
    {
      content: composeJournalsDashboardNote(),
      dest: folderNotePath(p.journalsRoot),
      surface: { kind: "journals-dashboard" },
    },
    { asset: "staging.md", dest: `${p.staging}/Staging.md` },
    {
      content: composeDiaryDashboard("weekly"),
      dest: folderNotePath(p.diaryWeekly),
      surface: { kind: "dashboard", ctx: { grain: "weekly" } },
    },
    {
      content: composeDiaryDashboard("monthly"),
      dest: folderNotePath(p.diaryMonthly),
      surface: { kind: "dashboard", ctx: { grain: "monthly" } },
    },
    // COMPOSED AS OF 3.11 §3, and `assets/search.md` is gone with it.
    { content: composeSearchNote(), dest: p.search, surface: { kind: "search" } },
    {
      content: composeDiaryDashboard("quarterly"),
      dest: quarterOverviewPath(p),
      surface: { kind: "dashboard", ctx: { grain: "quarterly" } },
    },
    {
      content: composeDiaryDashboard("yearly"),
      dest: yearOverviewPath(p),
      surface: { kind: "dashboard", ctx: { grain: "yearly" } },
    },
    // The five entry templates, composed from the entry section catalogue
    // rather than copied — the same move 2.59.3 made for the dashboards, and
    // the prerequisite for "add this section to every future daily entry",
    // which is an edit to a template you cannot make to a file the plugin only
    // copies.
    ...TRACKER_CLASSES.map((cls) => ({
      content: composeEntryTemplate(cls, extras[cls] ?? [], bands[cls] ?? []),
      dest: `${p.templatesDiary}/${CLASS_DEFS[cls].templateFile}`,
      template: true,
    })),
    { asset: "diary.base", dest: `${p.infrastructureRoot}/Diary.base` },
    { asset: "documentation.md", dest: `${p.documentation}/README.md` },
  ];
}

// What one note's convergence would change, for the preview and the report.
//
// `RepairOp` RATHER THAN `LayoutOp` SINCE THE SECTION MODEL ARRIVED. Two plan
// sources answer here now — `repairNote` for a composed note, `planLayout` for a
// copied one — and the dialog and the console report want one reader-facing line
// per op and nothing else. `LayoutOp` satisfies `RepairOp` structurally, so the
// keyword path needed no change to keep reporting through this.
export interface LayoutChange {
  dest: string;
  ops: RepairOp[];
  // The literal lines this convergence would change.
  //
  // COMPUTED FROM THE TEXT THE WRITE PRODUCES, not from the ops. `repairNote`
  // already returns the converged text, so diffing it against what is on disk
  // costs one call and cannot describe anything the write will not do — the
  // same property that makes the op list trustworthy, one level more specific.
  diff?: LineDiff;
}

// The folder a shipped note sits in, for the models that resolve a folder
// question against their host. Repair passes no answers, so nothing it does
// depends on this — it is supplied because a model given a wrong host is a model
// that would describe the wrong scope if it were ever asked.
const hostFolderOf = (dest: string): string =>
  dest.split("/").slice(0, -1).join("/");

export class Scaffold {
  constructor(private app: App, private plugin: AlmanacPlugin) {}

  private get paths() {
    return this.plugin.settings.paths;
  }

  // Read one of the plugin's bundled asset files (relative to the plugin dir).
  private async readAsset(name: string): Promise<string | null> {
    const dir = this.plugin.manifest.dir;
    if (!dir) return null;
    const path = normalizePath(`${dir}/assets/${name}`);
    try {
      return await this.app.vault.adapter.read(path);
    } catch (e) {
      console.error(`[Almanac] missing bundled asset: ${name}`, e);
      return null;
    }
  }

  // Move a pre-2.51 homepage onto its new name. Deletable once no vault of
  // mine is still on 2.50 or below.
  //
  // Only fires when `paths.home` is one of the two *defaults*. A vault that has
  // pointed its homepage at a note of its own naming has nothing to migrate,
  // and renaming somebody's file to a name they didn't choose is not a repair.
  // Bring an out-of-date homepage up to the current Diary layout: if the home
  // note doesn't carry the `diary` block, overwrite it with the shipped asset
  // and forget any collapse state saved for its sections (so it opens as one
  // continuous dashboard). A fresh vault never hits this — the file-copy loop
  // has already written the current asset — and a vault already current is a
  // no-op. rebuildJournalHome() runs after this to re-fill the Journals body.
  //
  // The marker is the *current* directive, not an old one. Checking for the
  // absence of a retired name (this used to look for `home-hero`) only ever
  // catches the one layout that name belonged to: once the directive is
  // renamed, every vault on the intermediate layout looks up to date and
  // silently keeps the old page forever. Testing for what the page should
  // contain catches every older layout, including the ones between 2.8 and
  // 2.13.7 that had `home-hero` and `diary-links` as separate blocks.
  // Separate the tracker grid from the entry banner across existing entries (4.20+ format).
  // Both diary folders, because a monthly review gains a banner of its own the
  // moment it has trackers to show. Failures are logged per note and never stop
  // the walk — one unparseable entry shouldn't abort a repair.
  private async splitEntryBanners(): Promise<void> {
    const p = this.paths;
    for (const root of [p.diaryDaily, p.diaryMonthly]) {
      for (const file of filesUnder(this.app, root)) {
        try {
          const original = await this.app.vault.read(file);
          const split = splitEntryFences(original);
          if (split != null) await this.app.vault.modify(file, split);
        } catch (e) {
          console.error(`[Almanac] entry banner migration failed for ${file.path}`, e);
        }
      }
    }
  }

  // One composed page's banner, welded from two fences into one. 4.19.
  //
  // `mergeEntryBanners` ONE METHOD UP IS THE SHAPE THIS COPIES, and deliberately
  // so: read, call a pure function, write only on a non-null answer. That one
  // performed the same merge on an entry in 3.2 — the nav strip and the tracker
  // grid becoming one card — so this is the fourth surface to have it done and
  // the second to have it done by a migration.
  //
  // TAKES A PATH RATHER THAN WALKING A FOLDER, because the caller already has
  // the list: `shippedNotes(...).filter(isReconcilable)` is the set of pages
  // this plugin composes, which is exactly the set that can have a banner. The
  // entry version walks two folders because entries are a reader's files and
  // there is no list of them.
  //
  // ERRORS ARE THE CALLER'S. It runs inside the same `try` as the two Trends
  // migrations, so one page's failure does not stop the others — and a page
  // that throws here is a page left exactly as it was, which is the right
  // outcome for a migration nobody has to run.
  private async weldBanner(path: string): Promise<void> {
    const file = getFile(this.app, path);
    if (!(file instanceof TFile)) return;
    const original = await this.app.vault.read(file);
    const welded = mergeBannerFences(original);
    if (welded != null) await this.app.vault.modify(file, welded);
  }

  // Overwrite the shipped diary assets with the current bundled versions,
  // whether or not they already exist.
  //
  // setupVault() deliberately never overwrites (see the copy loop's `continue`)
  // — which is right for a repair action, but it makes the develop loop for the
  // assets themselves unworkable: edit `template-monthly.md`, run repair, and
  // nothing happens, because `Templates/Monthly Entry.md` is already there.
  // This is the escape hatch. It is destructive by definition, so it is scoped
  // to the four shipped diary assets (never the user's own notes, never the
  // custom-journal templates) and it names each file it replaced in the notice.
  //
  // The overviews are excluded: they hold user chart definitions in their
  // `almanac-charts` regions, so blowing them away costs real work. Templates
  // are the ones under active development and are cheap to lose.
  // The diary equivalent of describeSectionDrift: what would change in an
  // entry template, said in sections rather than in bytes.
  private describeDiaryDrift(
    disk: string,
    shipped: string,
    cls: TrackerClass
  ): string {
    const ctx = { grain: cls };
    const have = detectEntrySections(disk, ctx);
    const want = detectEntrySections(shipped, ctx);
    const gained = want.filter((id) => !have.includes(id));
    const lost = have.filter((id) => !want.includes(id));
    const label = (id: string): string =>
      ENTRY_SECTIONS.find((s) => s.id === id)?.label ?? id;

    const parts: string[] = [];
    if (gained.length) parts.push(`adds ${gained.map(label).join(", ")}`);
    if (lost.length) parts.push(`loses ${lost.map(label).join(", ")}`);
    if (!parts.length) return "same sections, edited in place";
    return parts.join("; ");
  }

  private async surveyDiaryTemplatesDrift(): Promise<{
    items: RepairFileChange[];
    files: { dest: string; content: string }[];
  }> {
    const p = this.paths;
    const extras = this.plugin.settings.entrySections ?? {};
    const bands = this.plugin.settings.entrySectionBand ?? {};
    const items: RepairFileChange[] = [];
    const files: { dest: string; content: string }[] = [];

    for (const cls of TRACKER_CLASSES) {
      const dest = `${p.templatesDiary}/${CLASS_DEFS[cls].templateFile}`;
      const content = composeEntryTemplate(cls, extras[cls] ?? [], bands[cls] ?? []);
      const existing = getFile(this.app, dest);
      if (!existing) continue;
      const disk = await this.app.vault.read(existing);
      if (disk === content) continue;

      const diff = diffText(disk, content);
      const detail = this.describeDiaryDrift(disk, content, cls);
      items.push({
        path: dest,
        label: CLASS_DEFS[cls].templateFile,
        ops: [{ kind: "template", detail }],
        diff,
      });
      files.push({ dest, content });
    }
    return { items, files };
  }

  private async surveyJournalTemplatesDrift(): Promise<{
    items: RepairFileChange[];
    files: { dest: string; content: string }[];
  }> {
    const items: RepairFileChange[] = [];
    const files: { dest: string; content: string }[] = [];
    const jFiles = await this.journalTemplateFiles();

    for (const f of jFiles) {
      const existing = getFile(this.app, f.dest);
      if (!existing) continue;
      const disk = await this.app.vault.read(existing);
      if (disk === f.content) continue;

      const diff = diffText(disk, f.content);
      const detail = this.describeSectionDrift(disk, f.content, f.ctx);
      items.push({
        path: f.dest,
        label: f.label,
        ops: [{ kind: "template", detail }],
        diff,
      });
      files.push({ dest: f.dest, content: f.content });
    }
    return { items, files };
  }

  async surveyTemplatesDrift(): Promise<{
    items: RepairFileChange[];
    files: { dest: string; content: string }[];
  }> {
    const diary = await this.surveyDiaryTemplatesDrift();
    const journal = await this.surveyJournalTemplatesDrift();
    return {
      items: [...diary.items, ...journal.items],
      files: [...diary.files, ...journal.files],
    };
  }

  // Refresh entry templates with diff preview in the repair window (4.23).
  //
  // PARITY WITH REPAIR AND JOURNAL TEMPLATES. The old version overwrote
  // immediately with no confirmation and no diff, so a reader who added
  // custom frontmatter or prose to an entry template lost it with one click.
  // Now it surveys drift, previews exact added and removed lines, and requires
  // confirmation through the standard repair window.
  async refreshTemplates(): Promise<void> {
    const { items, files } = await this.surveyDiaryTemplatesDrift();
    if (items.length === 0) {
      notify.ok("Almanac: diary templates are already current");
      return;
    }

    const survey: RepairSurvey = {
      groups: [
        {
          id: "templates",
          title: "Refresh diary templates",
          blurb:
            "Templates for diary entries that differ from the current composition. Custom edits will be replaced.",
          glyph: "📋",
          noun: "template",
          items,
        },
      ],
    };

    const chosen = await openRepairWindow(this.app, survey);
    if (!chosen || !chosen.has("templates")) return;

    let updated = 0;
    for (const { dest, content } of files) {
      const existing = getFile(this.app, dest);
      if (existing) {
        await this.app.vault.modify(existing, content);
        updated++;
      }
    }
    notify.ok(`Almanac: refreshed ${updated} diary template${updated === 1 ? "" : "s"} ✅`);
  }

  // Every journal template the plugin can generate, paired with the vault path
  // it belongs at: Study's five, plus every custom journal's. One source for
  // both since 2.42 — the section catalogue — so the "shipped version" of any
  // journal template is whatever it composes to.
  private async journalTemplateFiles(): Promise<
    {
      dest: string;
      content: string;
      label: string;
      designed: boolean;
      ctx?: SectionContext;
    }[]
  > {
    const out: {
      dest: string;
      content: string;
      label: string;
      // True for a custom type, whose "shipped version" is not an asset on
      // disk but whatever the section catalogue composes by default. That
      // distinction changes what overwriting one costs, so the confirmation
      // has to know about it.
      designed: boolean;
      // The surface this template is for, so a drift report can say WHICH
      // sections differ rather than only that the bytes do. Optional because
      // a template that isn't in templateTargets — there are none today, but
      // an asset could be added — should degrade to the old message rather
      // than break the command.
      ctx?: SectionContext;
    }[] = [];
    // STUDY'S OWN BRANCH IS GONE (3.20). Every Study template was already
    // COMPOSED rather than copied — "keeping any of them as an asset meant
    // maintaining a second copy of an arrangement plus a test whose only job
    // was to notice the two drifting apart" — so once Study is an ordinary
    // stored journal, the generic loop below composes them by the same call
    // with the same result. The branch was not doing different work; it was
    // doing the same work from a different place.

    for (const cfg of this.plugin.settings.customJournals ?? []) {
      const targets = templateTargets(buildJournalType(cfg));
      for (const tpl of customTemplateFiles(cfg)) {
        out.push({
          dest: `${cfg.templatesFolder}/${tpl.name}`,
          content: tpl.content,
          label: `${cfg.name} / ${tpl.name}`,
          designed: true,
          ctx: targets.find((t) => t.file === tpl.name)?.ctx,
        });
      }
    }
    return out;
  }

  // Create a brand-new journal type's folders and templates.
  //
  // THE ONE MOMENT A DESIGNED TEMPLATE IS WRITTEN. The wizard calls this once,
  // on Create, with the sections chosen per template; from here the files are
  // the user's like every other template, and nothing in the plugin will
  // rewrite them. That is the whole resolution of the collision between a
  // designer and "a journal type's templates are the user's": the designer
  // generates, it never regenerates.
  //
  // Never overwrites, for the same reason setupVault never does — a folder
  // reused for a second journal of the same name would otherwise lose the
  // first one's edited templates. `chosen` is not stored anywhere; the markdown
  // this writes is the only record of it, which is the point.
  // Make an established type's folder match its config again.
  //
  // WHAT THIS IS FOR is the gap that made kinds editable in name only: adding
  // a kind wrote settings, a manifest and a homepage button, and no template —
  // so the first "New Field Note" failed with "field-notes.md missing — run
  // 'Set up / repair vault'". A reader who has just added the kind in a
  // settings window should not then have to be told to run a repair command.
  //
  // WRITES ONLY WHAT IS ABSENT. The same rule createJournalType and setupVault
  // follow, and it matters more here than in either: this runs on a type whose
  // templates a reader has been editing, so a routine that overwrote would
  // undo their work every time they renamed a kind. Adding a section to an
  // existing template is the template editor's job, with a plan and a preview;
  // this one only ever fills in a file that is not there.
  //
  // The `.base` is the exception and is regenerated. It is generated YAML with
  // no reader-owned content and no directives to reconcile, and its views and
  // rating columns are derived from `type.kinds` — so left alone it goes on
  // showing the kinds the type had on the day it was first written. Named in
  // the confirmation rather than done quietly, because a reader may have added
  // a view to it.
  async ensureJournalTemplates(cfg: JournalConfig): Promise<string[]> {
    const written: string[] = [];
    const type = buildJournalType(cfg);

    for (const tpl of customTemplateFiles(cfg)) {
      const dest = `${cfg.templatesFolder}/${tpl.name}`;
      if (getFile(this.app, dest)) continue;
      await ensureFolder(this.app, cfg.templatesFolder);
      await this.app.vault.create(dest, tpl.content);
      written.push(tpl.name);
    }

    // Same path setupVault writes it to — the infrastructure root, not the
    // type's own folder. Two writers of one file that disagreed about where it
    // lives would leave a vault with both.
    const baseName = `${type.name} Notes.base`;
    const basePath = `${this.paths.infrastructureRoot}/${baseName}`;
    const base = journalNotesBase(type, type.root);
    const existing = getFile(this.app, basePath);
    if (!existing) {
      await createFileEnsuringFolders(this.app, basePath, base);
      written.push(baseName);
    } else if ((await this.app.vault.read(existing)) !== base) {
      await this.app.vault.modify(existing, base);
      written.push(baseName);
    }

    return written;
  }

  async createJournalType(
    cfg: JournalConfig,
    chosen?: Map<string, string[]>
  ): Promise<void> {
    await ensureFolder(this.app, cfg.root);
    await ensureFolder(this.app, cfg.templatesFolder);

    const type = buildJournalType(cfg);
    let first: TFile | null = null;
    let written = 0;
    let skipped = 0;
    for (const tpl of journalTemplateFiles(type, chosen)) {
      const dest = `${cfg.templatesFolder}/${tpl.name}`;
      const existing = getFile(this.app, dest);
      if (existing) {
        first ??= existing;
        skipped++;
        continue;
      }
      const file = await createFileEnsuringFolders(this.app, dest, tpl.content);
      first ??= file;
      written++;
    }

    // The definition, written beside the notes it describes. This is what
    // makes the journal survive data.json being replaced and travel when the
    // folder is copied — see journal-import.ts.
    await this.plugin.journalImport.writeManifest(cfg);

    // The real preview, and it is free: the top-level index template is a
    // markdown note like any other, so its widgets render. A live preview
    // inside the wizard would have shown a column of empty states for a
    // journal that did not exist yet, which teaches nothing; this shows the
    // arrangement in the place it will actually be read.
    const note = new Notice(
      skipped
        ? `Almanac: ${cfg.name} created — ${written} template${
            written === 1 ? "" : "s"
          } written, ${skipped} already existed ✅`
        : `Almanac: ${cfg.name} created with ${written} template${
            written === 1 ? "" : "s"
          } ✅ — click to open the first one`,
      8000
    );
    if (first) {
      const target = first;
      note.noticeEl.addEventListener("click", () => {
        void openFile(this.app, target);
      });
    }
  }

  // Bring a journal type's templates up to the current shipped shape.
  //
  // setupVault() writes a template only when it is missing and never
  // overwrites, which is the right rule for a file the user owns — a journal
  // type's templates are explicitly theirs to edit (see TrackerDef
  // .showInTemplate) — and the wrong rule for a vault that predates a template
  // change. A vault set up before 2.27 still carries `slider:confidence` in its
  // Lesson template and writes every new lesson without a managed tracker
  // region, and nothing in the plugin will ever tell it so.
  //
  // The fix is consent rather than policy: report exactly which files differ,
  // name them, and rewrite only on confirmation. Silently overwriting an edited
  // template is precisely what the never-overwrite rule exists to prevent, so
  // this asks instead of deciding.
  //
  // Deliberately all-or-nothing per run rather than per file: a per-file prompt
  // for eight templates is a worse experience than one list, and the list is
  // the information that matters — if it names a file you have edited, cancel.
  // What differs between a template on disk and the one the catalogue would
  // compose, said in sections rather than in bytes.
  //
  // The old message was "these differ from the versions this release ships",
  // which is true of a file whose only change is a renamed header and equally
  // true of one that has lost three sections — and the button beneath it
  // overwrites either. Naming the sections is what turns the scariest control
  // in the plugin into a legible one.
  //
  // Read-only. Nothing here writes, and it deliberately shares parseSections
  // with the eventual editor so the preview cannot drift from the action: the
  // same property previewRepair states for dashboards.
  private describeSectionDrift(
    disk: string,
    shipped: string,
    ctx?: SectionContext
  ): string {
    if (!ctx) return "edited";
    const have = sectionsPresent(disk, ctx);
    const want = sectionsPresent(shipped, ctx);
    const gained = want.filter((id) => !have.includes(id));
    const lost = have.filter((id) => !want.includes(id));
    const label = (id: string): string => findSection(id)?.label ?? id;

    const parts: string[] = [];
    if (gained.length) parts.push(`adds ${gained.map(label).join(", ")}`);
    if (lost.length) parts.push(`loses ${lost.map(label).join(", ")}`);
    // Same sections, different bytes: a retitled header, a reworded field, a
    // widget added by hand. Worth distinguishing, because overwriting it costs
    // edits rather than structure.
    if (!parts.length) return "same sections, edited in place";
    return parts.join("; ");
  }

  // What "Refresh journal templates" would change, without changing it.
  //
  // The journal-side twin of previewRepair, and it reports the same way — a
  // Notice for the glance and console.info for the copy-paste — because a
  // reader comparing the two should not have to learn a second shape.
  async previewJournalTemplates(): Promise<void> {
    const files = await this.journalTemplateFiles();
    if (files.length === 0) {
      new Notice("Almanac: no journals are enabled.");
      return;
    }

    const lines: string[] = [];
    for (const f of files) {
      const existing = getFile(this.app, f.dest);
      if (!existing) {
        lines.push(`${f.label} — missing, would be created`);
        continue;
      }
      const disk = await this.app.vault.read(existing);
      if (disk === f.content) continue;
      lines.push(
        `${f.label} — ${this.describeSectionDrift(disk, f.content, f.ctx)}`
      );
    }

    if (!lines.length) {
      notify.ok("Almanac: journal templates are already current");
      return;
    }
    console.info(`[Almanac] journal templates differ:\n  ${lines.join("\n  ")}`);
    new Notice(
      `Almanac: ${lines.length} journal template(s) differ —\n${lines.join("\n")}`,
      15000
    );
  }

  async refreshJournalTemplates(): Promise<void> {
    const journalFiles = await this.journalTemplateFiles();
    if (journalFiles.length === 0) {
      new Notice("Almanac: no journals are enabled.");
      return;
    }

    const { items, files } = await this.surveyJournalTemplatesDrift();
    if (items.length === 0) {
      notify.ok("Almanac: journal templates are already current");
      return;
    }

    const survey: RepairSurvey = {
      groups: [
        {
          id: "templates",
          title: "Refresh journal templates",
          blurb:
            "Templates for journal notes that differ from the current composition. Custom edits will be replaced.",
          glyph: "📋",
          noun: "template",
          items,
        },
      ],
    };

    const chosen = await openRepairWindow(this.app, survey);
    if (!chosen || !chosen.has("templates")) return;

    let updated = 0;
    for (const { dest, content } of files) {
      const existing = getFile(this.app, dest);
      if (existing) {
        await this.app.vault.modify(existing, content);
        updated++;
      } else {
        await createFileEnsuringFolders(this.app, dest, content);
        updated++;
      }
    }
    notify.ok(`Almanac: refreshed ${updated} journal template${updated === 1 ? "" : "s"} ✅`);
  }

  // Create all folders + any missing files. Never overwrites existing notes,
  // so it doubles as a "repair" action.

  // Converge every shipped note that already exists on the layout this release
  // ships. The half of "repair" that was missing.
  //
  // `setupVault`'s copy loop never overwrites — correctly, since these are
  // user-editable notes holding user charts and prose — but that rule was the
  // entire policy, so an asset change reached only vaults that did not yet have
  // the note. This adds the other half without weakening the rule: layout.ts
  // reconciles *directives*, so a block the plugin ships is inserted or updated
  // and everything it doesn't recognise is left exactly where the user put it.
  //
  // `dryRun` returns the same plan the write would apply, which is the point of
  // planning separately from applying: the preview cannot drift from the action
  // because it *is* the action, minus the write.
  //
  // Templates and `.base` files are excluded — a template is copied wholesale
  // at entry-creation time and has its own refresh command, and a `.base` is
  // YAML with no directives to reconcile.
  async reconcileLayouts(dryRun = false): Promise<LayoutChange[]> {
    const out: LayoutChange[] = [];
    for (const note of shippedNotes(
      this.paths,
      this.plugin.settings.entrySections,
      this.plugin.settings.entrySectionBand
    )) {
      const { asset, dest } = note;
      if (!isReconcilable(note)) continue;
      const file = getFile(this.app, dest);
      if (!file) continue; // the copy loop's job, not this one

      const shipped =
        note.content ?? (asset == null ? null : await this.readAsset(asset));
      if (shipped == null) continue; // readAsset already logged it

      const current = await this.app.vault.read(file);

      // A COMPOSED NOTE GOES THROUGH ITS SECTION MODEL. `repair-plan.ts` says
      // why at length; the short of it is that `layout.ts` can only insert the
      // first directive of a fence, and both composers weld several sections
      // into one — so the homepage's whole top row and each dashboard's
      // masthead were unreachable, and skipped without a word in the plan.
      //
      // ONE CALL FOR BOTH HALVES, which is what `previewRepair`'s property asks
      // for and what the pair below could only promise: the dry run and the
      // write come back from the same call, so there is no second code path for
      // them to disagree on.
      if (note.surface) {
        const { model } = modelForSurface(note.surface, hostFolderOf(dest));
        const { ops, next } = repairNote(model, current, shipped);
        if (!ops.length) continue;
        out.push({
          dest,
          ops,
          diff: next == null ? undefined : diffText(current, next),
        });
        if (dryRun) continue;
        if (next == null) {
          console.error(`[Almanac] repair plan/apply disagreed for ${dest}`);
          continue;
        }
        await this.app.vault.modify(file, next);
        continue;
      }

      const ops = planLayout(current.split("\n"), shipped.split("\n"));
      if (!ops.length) continue;
      const converged = applyLayout(current.split("\n"), shipped.split("\n"));
      out.push({
        dest,
        ops,
        diff:
          converged == null
            ? undefined
            : diffLines(current.split("\n"), converged),
      });

      if (dryRun) continue;
      const next = converged;
      // Null here would mean plan and apply disagreed, which is a bug rather
      // than a no-op — planLayout found work and applyLayout found none.
      if (next == null) {
        console.error(`[Almanac] layout plan/apply disagreed for ${dest}`);
        continue;
      }
      await this.app.vault.modify(file, next.join("\n"));
    }
    return out;
  }

  // Every registered journal's index surfaces that are short of a table, by
  // type — the type is what `applyDashboardCatchups` needs to find them again.
  //
  // READ-ONLY, like everything else the confirmation is built from.
  private async findCatchups(): Promise<
    { type: JournalType; pending: DashboardCatchup[] }[]
  > {
    const out: { type: JournalType; pending: DashboardCatchup[] }[] = [];
    for (const type of registeredJournalTypes(this.plugin)) {
      try {
        const pending = await findDashboardCatchups(this.app, type);
        if (pending.length) out.push({ type, pending });
      } catch (e) {
        // One unreadable journal should not abort a repair, which is the rule
        // `mergeEntryBanners` and the Trends walk both already follow.
        console.error(`[Almanac] catch-up scan failed for ${type.name}`, e);
      }
    }
    return out;
  }

  // `previewRepair` IS GONE, AND THE WINDOW IS WHY (4.18.1 §7).
  //
  // It printed what `reconcileLayouts` would change, as a Notice, and it had
  // had no caller since §9.3 folded the preview into the command as a confirm
  // step. Dead code is one thing; this had also become WRONG. It described
  // itself as "what a repair would change" while knowing about one of the four
  // groups repair actually runs, so the one number it printed was a quarter of
  // the answer — and the next reader to wire it to a button would have shipped
  // that.
  //
  // The window replaces it completely and is strictly more than it was: four
  // groups instead of one, the literal lines instead of a summary, and a choice
  // instead of a report. `surveyRepair` is the read-only half now, and it is the
  // half the window renders.

  // What a repair would create, without creating it.
  //
  // SPLIT OUT OF `setupVault`'S BODY so one enumeration answers both questions.
  // The window needs to say what will be added and the write needs to add it,
  // and those being two walks over the same rules is the failure this file's own
  // header records about `shippedNotes` — "a second enumeration written from the
  // same memory that forgot the first".
  private async planCreate(): Promise<{
    folders: string[];
    files: { dest: string; content: string }[];
    missingAssets: number;
  }> {
    const p = this.paths;
    const folders = [
      p.staging,
      // All five grains. Each holds that period's entries; the four above daily
      // also hold their dashboard as a folder note, which the file list writes.
      p.diaryDaily,
      p.diaryWeekly,
      p.diaryMonthly,
      p.diaryQuarterly,
      p.diaryYearly,
      p.templatesDiary,
      p.documentation,
      p.attachments,
      // The journals root is the area folder — a custom journal lives under it
      // too, so it is not Study's to create or to skip.
      p.journalsRoot,
    ];
    // Study's root and templates folder are its config's now, created by the
    // custom-journal loop below like every other journal's (3.20).
    for (const cfg of this.plugin.settings.customJournals) {
      folders.push(cfg.root, cfg.templatesFolder);
    }

    const files: { dest: string; content: string }[] = [];
    let missingAssets = 0;

    // Every registered journal type gets an all-notes .base, generated from the
    // type. Was a Study-only asset hardcoding `03 - Journals`, the columns
    // `subject`/`topic` and one view per Study kind — so the vault-wide "every
    // journal note" table existed for Study and for nothing else.
    for (const type of registeredJournalTypes(this.plugin)) {
      const dest = `${p.infrastructureRoot}/${type.name} Notes.base`;
      if (getFile(this.app, dest)) continue;
      files.push({ dest, content: journalNotesBase(type, type.root) });
    }

    for (const note of shippedNotes(
      p,
      this.plugin.settings.entrySections,
      this.plugin.settings.entrySectionBand
    )) {
      const { asset, dest } = note;
      if (getFile(this.app, dest)) continue; // don't overwrite
      const content =
        note.content ?? (asset == null ? null : await this.readAsset(asset));
      if (content == null) {
        missingAssets++;
        continue;
      }
      files.push({ dest, content });
    }

    // Custom journals' default templates. These have no bundled assets — the
    // content is generated from the type's config.
    for (const cfg of this.plugin.settings.customJournals) {
      for (const tpl of customTemplateFiles(cfg)) {
        const dest = `${cfg.templatesFolder}/${tpl.name}`;
        if (getFile(this.app, dest)) continue;
        files.push({ dest, content: tpl.content });
      }
    }

    // Every custom journal's manifest, where it is missing or has drifted. A
    // journal defined before manifests existed gains one here, which is what
    // makes repair the answer for a vault whose journals are registered but
    // unexportable.
    //
    // SURVEYED RATHER THAN ALWAYS-RUN, unlike every other caller of
    // `writeManifest`. That method compares before writing and so is already a
    // no-op when nothing changed — but "already a no-op" is not something a
    // window can show, and a group that quietly does work it did not list is the
    // thing this whole window exists to stop.
    for (const cfg of this.plugin.settings.customJournals ?? []) {
      const dest = manifestPathFor(cfg.root);
      const content = encodeJournalManifest(
        cfg,
        this.plugin.settings.trackers.filter((t) =>
          manifestCarriesTracker(t, cfg.id)
        )
      );
      const existing = getFile(this.app, dest);
      if (existing && (await this.app.vault.read(existing)) === content) continue;
      files.push({ dest, content });
    }

    // The special-events note, through the store's own definition of what a
    // fresh one contains rather than from a bundled asset.
    if (this.plugin.settings.eventsEnabled && !getFile(this.app, p.events)) {
      files.push({ dest: p.events, content: eventsNoteTemplate() });
    }

    return { folders, files, missingAssets };
  }

  // Which notes the three format migrations would rewrite, without rewriting one.
  //
  // EVERY MIGRATION HAS A PURE HALF ALREADY — `mergeEntryFences`,
  // `mergeTrendsSection`, `ensureTrendsHeader` and `mergeBannerFences` are all
  // text-in, text-or-null-out — so the dry run is the migration with the write
  // taken off, which is the same property `repairNote` has and for the same
  // reason.
  private async planMigrations(): Promise<RepairFileChange[]> {
    const out: RepairFileChange[] = [];
    const p = this.paths;

    for (const root of [p.diaryDaily, p.diaryMonthly]) {
      for (const file of filesUnder(this.app, root)) {
        try {
          const original = await this.app.vault.read(file);
          const split = splitEntryFences(original);
          if (split == null || split === original) continue;
          out.push({
            path: file.path,
            label: file.basename,
            ops: [{ kind: "migrate", detail: "separate the tracker grid from the entry banner" }],
            diff: diffText(original, split),
          });
        } catch (e) {
          console.error(`[Almanac] entry banner scan failed for ${file.path}`, e);
        }
      }
    }

    for (const dash of shippedNotes(p).filter(isReconcilable).map((f) => f.dest)) {
      const file = getFile(this.app, dash);
      if (!file) continue;
      try {
        const original = await this.app.vault.read(file);
        // THE SAME ORDER THE WRITE USES, applied to the text rather than to the
        // file — the merge first, so the second call finds nothing to do on a
        // two-block note. Running them the other way round would title the fence
        // and then merge a second title onto it.
        const merged = mergeTrendsSection(original.split("\n"))?.join("\n") ?? original;
        const titled = ensureTrendsHeader(merged.split("\n"))?.join("\n") ?? merged;
        // AND THE TITLE'S SPELLING, FOURTH IN THE SAME CHAIN (4.26). Last of the
        // three Trends steps because it is the only one that assumes a title is
        // already there: the merge writes the current spelling when it folds, and
        // `ensureTrendsHeader` writes it when it titles an untitled fence, so
        // running before either would leave this nothing to do and then let them
        // put the right words in anyway. After both, the only titles left are the
        // ones a note arrived with.
        const respelled = retitleTrends(titled.split("\n"))?.join("\n") ?? titled;
        // AND THE BANNER WELD, THIRD, EXACTLY AS THE WRITE RUNS IT (4.19).
        //
        // CHAINED ON THE SAME TEXT RATHER THAN SCANNED SEPARATELY, because the
        // two migrations touch one file and a reader reads one diff. Two entries
        // for one page would be two rows in the window offering to change the
        // same note, and the second diff would be computed against a text the
        // first had not been applied to — a preview that could not happen.
        const welded = mergeBannerFences(respelled) ?? respelled;
        if (welded === original) continue;
        // ONE OP PER MIGRATION THAT ACTUALLY FIRED. `ops` is a list precisely so
        // a file can report more than one, and a page that only needs the weld
        // must not be labelled with the Trends sentence — the window's rows are
        // what a reader decides on.
        const ops: RepairOp[] = [];
        if (titled !== original) {
          ops.push({
            kind: "migrate",
            detail: "bring the Trends section up to the self-titled layout",
          });
        }
        if (respelled !== titled) {
          ops.push({
            kind: "migrate",
            detail: "spell the Trends heading the way this version writes it",
          });
        }
        if (welded !== respelled) {
          ops.push({
            kind: "migrate",
            detail: "weld the page's name and its navigation row into one banner",
          });
        }
        out.push({
          path: dash,
          label: dash.split("/").pop() ?? dash,
          ops,
          diff: diffText(original, welded),
        });
      } catch (e) {
        console.error(`[Almanac] Trends scan failed for ${dash}`, e);
      }
    }

    return out;
  }

  // Everything a repair would do, in the four groups the window offers.
  //
  // READ-ONLY, AND IT IS THE WHOLE OF WHAT THE WINDOW KNOWS. Every group is
  // computed by the code that will do the work, minus the write — the property
  // `previewRepair` stated for one of the four and which now holds for all of
  // them. Nothing here is a summary of a plan computed elsewhere.
  async surveyRepair(): Promise<{
    survey: RepairSurvey;
    byType: { type: JournalType; pending: DashboardCatchup[] }[];
    create: Awaited<ReturnType<Scaffold["planCreate"]>>;
    templates: { dest: string; content: string }[];
  }> {
    const create = await this.planCreate();
    const pages = await this.reconcileLayouts(true);
    const byType = await this.findCatchups();
    const migrations = await this.planMigrations();
    const templatesDrift = await this.surveyTemplatesDrift();

    const survey: RepairSurvey = {
      groups: [
        {
          id: "create",
          title: "Create what's missing",
          blurb:
            "Folders, pages and templates that aren't there yet. Never overwrites anything you already have.",
          glyph: "📁",
          noun: "item",
          items: [
            ...create.folders
              .filter((f) => !this.app.vault.getAbstractFileByPath(f))
              .map((f) => ({
                path: f,
                label: f,
                ops: [{ kind: "create", detail: "create this folder" }],
              })),
            ...create.files.map((f) => ({
              path: f.dest,
              label: f.dest.split("/").pop() ?? f.dest,
              ops: [
                {
                  kind: "create",
                  detail: getFile(this.app, f.dest)
                    ? "refresh this generated file"
                    : "create this file",
                },
              ],
            })),
          ],
        },
        {
          id: "pages",
          title: "Update pages to this release",
          blurb:
            "The pages this plugin ships gain the blocks this release adds, and lose any widget it retired. Anything you added or moved is left where it is.",
          glyph: "📄",
          noun: "note",
          items: pages.map((c) => ({
            path: c.dest,
            label: c.dest.split("/").pop() ?? c.dest,
            ops: c.ops,
            diff: c.diff,
          })),
        },
        {
          id: "journals",
          title: "Catch up journal index notes",
          blurb:
            "Index notes and their templates gain a table for any note type added since they were written. Only the missing tables — nothing already in them is touched.",
          glyph: "📚",
          noun: "note",
          items: byType.flatMap((g) =>
            g.pending.map((c) => ({
              // LABELLED BY PATH: one index note per subject makes identically
              // named files the common case here rather than an edge one.
              path: c.file.path,
              label: c.label,
              ops: c.ops.map((o) => ({
                kind: o.kind,
                detail: `${o.label} — ${o.detail}`,
              })),
            }))
          ),
        },
        {
          id: "migrations",
          title: "Run format migrations",
          blurb:
            "Notes written by an older release, brought up to the shape this one reads: entry banners separated from their tracker grid, Trends sections given their title, page names welded to their navigation row.",
          glyph: "🔧",
          noun: "note",
          items: migrations,
        },
        {
          id: "templates",
          title: "Update templates to this release",
          blurb:
            "Templates for diary entries and journal notes that differ from the versions this release composes. Edits you made to these templates will be replaced; existing notes created from them are never touched.",
          glyph: "📋",
          noun: "template",
          items: templatesDrift.items,
        },
      ],
    };

    return { survey, byType, create, templates: templatesDrift.files };
  }

  async setupVault(): Promise<void> {
    // THE WINDOW IS THE PLAN, AND NOW IT IS ALSO THE CHOICE.
    //
    // `preview-repair` was once a separate command, then §9.3 folded it into
    // this one as a confirm step, on the argument that the preview is this
    // action minus the write and so cannot be a second thing. That argument
    // stands and this is its next step: four groups of work with genuinely
    // different risk were behind one button, so a reader who wanted the safe
    // half had to accept the rest or none of it.
    //
    // AND IT ALWAYS OPENS (4.18.2), which is the end of a rule that moved twice.
    //
    // It began as "open only when a note would be REWRITTEN", which was right
    // for a bare confirm: a dialog that appears to say there is nothing to
    // confirm is how a reader learns to dismiss confirm dialogs without reading
    // them. 4.18.1 widened it to "open whenever anything is pending", because a
    // window naming forty files it will create is not that dialog. The last case
    // left was a current vault, which reported itself in a notice instead.
    //
    // WHY THE NOTICE WAS THE WRONG ANSWER. A notice is the same words with less
    // standing: it appears in the corner, it leaves on its own, and it arrives
    // in the one place a reader cannot ask it anything. And this command is not
    // only run to fix a known problem — it is run to ASK, which makes "nothing
    // is wrong" an answer to the question rather than a reason to stay silent.
    // A reader who invoked repair and got a corner toast has to decide whether
    // the command ran at all; the window that says the same thing, in the place
    // the answer was going to appear, cannot be missed and cannot be doubted.
    //
    // The window earns this because it is not a confirm — it is a report that
    // can also act. `RepairModal` draws the empty case as an empty state and
    // offers one button that closes it, so nothing dead is drawn and there is no
    // yes/no to answer.
    const { survey, byType, create, templates } = await this.surveyRepair();

    const chosen = await openRepairWindow(this.app, survey);
    if (!chosen || chosen.size === 0) return;

    await this.applyRepair(survey, chosen, byType, create, templates);
  }

  // Do the groups the reader ticked, and nothing else.
  private async applyRepair(
    survey: RepairSurvey,
    chosen: Set<RepairGroupId>,
    byType: { type: JournalType; pending: DashboardCatchup[] }[],
    create: Awaited<ReturnType<Scaffold["planCreate"]>>,
    templates: { dest: string; content: string }[] = []
  ): Promise<void> {
    const parts: string[] = [];
    let created = 0;

    if (chosen.has("create")) {
      for (const folder of create.folders) await ensureFolder(this.app, folder);
      for (const { dest, content } of create.files) {
        const existing = getFile(this.app, dest);
        // A MANIFEST IS THE ONE ENTRY THAT MAY ALREADY EXIST — `planCreate`
        // lists it when it has drifted, and every other entry is listed only
        // when absent. So this writes rather than skips, and the never-overwrite
        // rule is kept where it belongs: in what gets LISTED.
        if (existing) await this.app.vault.modify(existing, content);
        else await createFileEnsuringFolders(this.app, dest, content);
        created++;
      }
      if (created > 0) parts.push(`created ${created} file(s)`);
    }

    if (chosen.has("pages")) {
      // Converge every existing shipped page on this release (2.53). This
      // replaced upgradeHomeForHero, which detected an out-of-date homepage
      // with two hand-written regexes and then replaced the note *wholesale* —
      // losing any chart, prose or widget the user had added to it.
      // Reconciliation needs no detection list (the diff is the detection) and
      // writes only what it owns.
      const reconciled = await this.reconcileLayouts();
      if (reconciled.length > 0) {
        parts.push(`updated ${reconciled.length} page(s)`);
        console.info(
          `[Almanac] repair updated:\n  ` +
            reconciled
              .map(
                (c) =>
                  `${c.dest.split("/").pop()} — ${c.ops.map((o) => o.detail).join(", ")}`
              )
              .join("\n  ")
        );
      }

      // Populate the homepage's journal sections for every registered type
      // (Study + custom). Grouped with the pages rather than with the journals:
      // it writes to the HOMEPAGE, which is one of the pages this group is
      // about, and a reader who declined page writes has declined this one too.
      await this.plugin.journals.rebuildJournalHome();
    }

    if (chosen.has("journals")) {
      // Through `applyDashboardCatchups`, which re-reads and re-plans each file
      // rather than trusting the survey — the reader has been looking at a
      // window in between, and a write built on a stale read is how an accepted
      // plan silently reverts an edit made in another pane.
      let caughtUp = 0;
      for (const { type, pending } of byType) {
        try {
          caughtUp += await applyDashboardCatchups(
            this.app,
            type,
            pending.map((c) => c.file)
          );
        } catch (e) {
          console.error(`[Almanac] catch-up failed for ${type.name}`, e);
        }
      }
      if (caughtUp > 0) {
        parts.push(`listed note types on ${caughtUp} index note(s)`);
      }
    }

    if (chosen.has("templates")) {
      let updatedTemplates = 0;
      for (const { dest, content } of templates) {
        const existing = getFile(this.app, dest);
        if (existing) {
          await this.app.vault.modify(existing, content);
          updatedTemplates++;
        }
      }
      if (updatedTemplates > 0) parts.push(`updated ${updatedTemplates} template(s)`);
    }

    if (chosen.has("migrations")) {
      // Separate each existing entry's tracker fence from its entry banner (4.20+).
      await this.splitEntryBanners();

      // Converge each shipped page's Trends & Statistics section on the 2.1
      // self-titled layout. User charts are preserved verbatim.
      //
      // THE SAME PREDICATE AS `reconcileLayouts`, not a second copy of it (4.1
      // §6.1). This walk used to restate the guards inline and had the identical
      // hole for the identical reason: its filter tested the ASSET's extension,
      // and a composed entry has no asset to test.
      for (const dash of shippedNotes(this.paths)
        .filter(isReconcilable)
        .map((f) => f.dest)) {
        try {
          // ORDER MATTERS, AND IS THE WHOLE REASON THESE ARE TWO CALLS. The
          // merge runs first so the second call finds nothing to do on a
          // two-block note; the other way round would title the fence and then
          // merge a second title onto it.
          await migrateTrends(this.app, dash);
          await migrateTrendsHeader(this.app, dash);
          // THIRD, AND THE DRY RUN CHAINS THEM IN THIS ORDER TOO (4.26). The
          // first two put a title on the fence where there was none; this one
          // only ever changes words that are already there, so it must run
          // after both or it would find nothing and then be overtaken.
          await migrateTrendsTitle(this.app, dash);
          // AND THE BANNER'S TWO FENCES BECOME ONE (4.19).
          //
          // THIRD IN THE ORDER, AND INDEPENDENT OF THE OTHER TWO. Those converge
          // the Trends section at the foot of the page; this welds the page's
          // name to its navigation row at the top, and the two touch no common
          // line. It runs last only because a migration added later runs later,
          // which keeps the list readable as a history.
          //
          // WHY IT IS HERE AND NOT IN `reconcileLayouts`. Repair is additive: it
          // may add a section this release ships and the note lacks, and
          // `repairNote` throws on a `move` op rather than performing one.
          // Welding is a move. `layout.ts` names this exact escape — *"ship it as
          // a one-off migration next to migrateTrends"* — and this is where
          // `migrateTrends` is.
          //
          // AND IT IS OPT-IN, which matters more than usual. The `migrations`
          // group is ticked separately in the repair window, so a reader who
          // wants their two blocks left alone simply does not tick it — and
          // nothing else in this release writes to their notes.
          await this.weldBanner(dash);
        } catch (e) {
          console.error(`[Almanac] Trends migration failed for ${dash}`, e);
        }
      }
      const migrated = survey.groups.find((g) => g.id === "migrations")?.items.length ?? 0;
      if (migrated > 0) parts.push(`migrated ${migrated} note(s)`);
    }



    // The summary names what happened per group. Created and updated are
    // different facts — the old one counted created files and, finding none,
    // said "everything already in place", which on a stale vault was a lie.
    if (create.missingAssets > 0 && chosen.has("create")) {
      new Notice(
        `Almanac setup finished with ${create.missingAssets} bundled asset(s) missing — check the console.`
      );
    } else if (parts.length === 0) {
      notify.ok("Almanac: nothing to do");
    } else {
      new Notice(`Almanac: ${parts.join(", ")} ✅`);
    }
  }
}
