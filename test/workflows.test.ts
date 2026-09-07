// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── THE WORKFLOWS, SWEPT LIKE ANY OTHER REGISTRATION (5.21) ──────────────
//
// `.github/` had no test until the rolling release arrived, and until then it
// did not need one: a workflow that breaks fails loudly on the next push, in
// front of whoever pushed.
//
// THE ROLLING RELEASE IS THE ONE THAT DOES NOT. It copies two zips out of
// `../archives/` BY FILENAME, and those filenames are built in
// `tools/archive.mjs` from a template literal. Rename the archive and the
// workflow fails — on a release, after the checks have passed, with the tag
// already moved. That is the same shape as the asset registration
// `bundled-assets.test.ts` exists for: two files that must agree, no compiler
// between them, and a failure that arrives at the worst moment rather than the
// first one.
//
// So the claims here are only the cross-file ones. Nothing asserts what a step
// is called or what order the steps are in — that is the workflow's business,
// and a test that pins it is a test that has to be edited every time anyone
// touches YAML.

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { load } from "js-yaml";
import { repoFile } from "./sources";

type Step = {
  id?: string;
  name?: string;
  uses?: string;
  run?: string;
  shell?: string;
  if?: string;
};
type Workflow = { jobs: Record<string, { steps: Step[] }> };

const workflow = (name: string): Workflow =>
  load(repoFile(`.github/workflows/${name}.yml`)) as Workflow;

const steps = (name: string): Step[] =>
  Object.values(workflow(name).jobs).flatMap((j) => j.steps);

const WORKFLOWS = ["ci", "release", "latest"];

const CHECKS = load(repoFile(".github/actions/checks/action.yml")) as {
  runs: { using: string; steps: Step[] };
};

describe("the shared checks action", () => {
  it("is used by every workflow, so a check added to it reaches all three", () => {
    for (const name of WORKFLOWS) {
      expect(
        steps(name).some((s) => s.uses === "./.github/actions/checks"),
        `${name}.yml does not use the shared checks`
      ).toBe(true);
    }
  });

  it("runs the four checks CLAUDE.md names, and no workflow re-spells them", () => {
    // The list is the development cycle's, section 2: version agreement,
    // tests, typecheck, lint. Named here rather than derived, because this is
    // the assertion that would notice one being quietly dropped.
    const ran = CHECKS.runs.steps
      .map((s) => s.run?.trim())
      .filter((r): r is string => !!r);
    for (const cmd of [
      "npm run check:versions",
      "npm test",
      "npm run typecheck",
      "npx eslint src test",
    ]) {
      expect(ran, `the checks action does not run ${cmd}`).toContain(cmd);
    }

    // AND NOWHERE ELSE. A workflow keeping its own copy is the drift the
    // action was extracted to prevent — the copy goes stale silently, because
    // a workflow running fewer steps still goes green.
    for (const name of WORKFLOWS) {
      for (const step of steps(name)) {
        expect(
          ran.includes(step.run?.trim() ?? " "),
          `${name}.yml re-spells a check the shared action runs: ${step.run}`
        ).toBe(false);
      }
    }
  });

  it("declares a shell on every `run`, which a composite action requires", () => {
    // A composite step with `run:` and no `shell:` is not a parse error. It is
    // a runtime failure, on whichever workflow calls it first.
    expect(CHECKS.runs.using).toBe("composite");
    for (const step of CHECKS.runs.steps) {
      if (step.run !== undefined) expect(step.shell).toBe("bash");
    }
  });
});

describe("the rolling release", () => {
  // WHAT IT IS, NOT WHO CALLS IT (1.0.0). The mechanics used to be seven steps
  // in `latest.yml`, back when a version bump landing on the default branch was
  // the only thing that ever published one. Under the minor-and-major cadence
  // there are two publishers — `latest.yml` for a patch, `release.yml` for the
  // tagged versions it declines — so the steps moved into a composite action
  // and these claims followed them. Which workflow calls it is asserted below;
  // this block is about the release itself.
  const yml = repoFile(".github/actions/rolling-release/action.yml");

  it("is called by both publishers, and by nothing that re-spells it", () => {
    // The drift this action was extracted to prevent, in the direction it would
    // actually go: a rolling release that still publishes, still goes green,
    // and quietly stops matching the numbered one.
    for (const name of ["release", "latest"]) {
      expect(
        steps(name).some((s) => s.uses === "./.github/actions/rolling-release"),
        `${name}.yml does not use the shared rolling release`
      ).toBe(true);
    }
    for (const name of WORKFLOWS) {
      expect(
        repoFile(`.github/workflows/${name}.yml`),
        `${name}.yml spells out a publish the action already does`
      ).not.toContain("gh release upload latest");
    }
  });

  it("is called only after a build that laid out `dist/`", () => {
    // `tools/archive.mjs` zips `dist/chronoanvil`, which `npm run package`
    // produces and `npm run build` does not — so a caller that built the three
    // loose files and stopped has nothing for the action's first step to zip.
    //
    // THIS IS THE ONE ORDERING CLAIM IN THIS FILE, and the header's rule stands:
    // what is refused there is pinning the order steps happen to be written in.
    // This is not that. It is a step consuming a directory an earlier step
    // creates, and getting it wrong costs the most of any mistake in `.github/`
    // — `release.yml` reaches this tail AFTER `gh release create`, so the
    // numbered release is already published and public when the job dies.
    for (const name of ["release", "latest"]) {
      const all = steps(name);
      const at = all.findIndex(
        (s) => s.uses === "./.github/actions/rolling-release"
      );
      expect(at, `${name}.yml does not call the rolling release`).toBeGreaterThan(-1);
      expect(
        all.slice(0, at).map((s) => s.run?.trim()),
        `${name}.yml calls the rolling release without packaging first`
      ).toContain("npm run package");
    }
  });

  it("declares a shell on every `run`, which a composite action requires", () => {
    // Same failure mode as the checks action: not a parse error, a runtime one,
    // on whichever caller reaches it first.
    const action = load(yml) as { runs: { using: string; steps: Step[] } };
    expect(action.runs.using).toBe("composite");
    for (const step of action.runs.steps) {
      if (step.run !== undefined) expect(step.shell).toBe("bash");
    }
  });

  it("copies the archive names `tools/archive.mjs` actually writes", () => {
    // THE CROSS-FILE CLAIM THIS FILE EXISTS FOR. Both names are template
    // literals in the tool; both are string interpolations in the workflow.
    // Nothing but this connects them.
    const tool = repoFile("tools/archive.mjs");
    expect(tool).toContain("`chronoanvil-${version}-plugin.zip`");
    expect(tool).toContain("`chronoanvil-source-${version}`");

    expect(yml).toContain(
      '"../archives/chronoanvil-builds/chronoanvil-$v-plugin.zip"'
    );
    expect(yml).toContain(
      '"../archives/chronoanvil-source/chronoanvil-source-$v.zip"'
    );

    // And that `$v` is the version the caller passed. The two callers read it
    // from different places — `latest.yml` from the manifest, because a patch
    // has no tag to read one from; `release.yml` from the tag, which its own
    // first steps have already checked against the manifest — so the action
    // takes it as an input and neither spelling leaks in here.
    expect(yml).toContain('v="${{ inputs.version }}"');
    for (const name of ["release", "latest"]) {
      const call = steps(name).find(
        (s) => s.uses === "./.github/actions/rolling-release"
      ) as (Step & { with?: Record<string, string> }) | undefined;
      expect(call?.with?.version, `${name}.yml passes no version`).toBeTruthy();
      expect(call?.with?.token, `${name}.yml passes no token`).toBeTruthy();
    }
  });

  it("passes `--force`, because a re-run meets its own archive", () => {
    // `claim()` refuses to overwrite without it — correct for a working tree,
    // and a re-run of the same commit on a fresh runner would otherwise fail
    // on an archive it wrote itself.
    expect(yml).toMatch(/npm run archive -- --force/);
  });

  it("uploads assets whose names carry no version", () => {
    // What makes `--clobber` a REPLACE. A versioned name would accumulate, and
    // a release claiming to be current would carry a stale build beside the
    // new one.
    const upload = yml.slice(yml.indexOf("gh release upload latest"));
    const assets = upload
      .split(/\s+/)
      .filter((w) => /\.(zip|js|css|json)$/.test(w));
    for (const asset of assets) {
      expect(asset, `${asset} carries a version`).not.toMatch(/\d+\.\d+\.\d+/);
    }
    // The three the installer writes, plus the two zips a person downloads.
    expect(assets).toEqual([
      "main.js",
      "manifest.json",
      "styles.css",
      "chronoanvil-plugin.zip",
      "chronoanvil-source.zip",
    ]);
  });

  it("publishes every name the README hands out as a permanent link", () => {
    // The README writes `releases/download/latest/<name>` down as an address a
    // reader can bookmark. That is only true while this workflow attaches a
    // file under exactly that name — rename one here and the README's link
    // 404s, silently, for everyone but the person who clicks it.
    const links = [
      ...repoFile("README.md").matchAll(
        /releases\/download\/latest\/([\w.-]+)/g
      ),
    ].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    const upload = yml.slice(yml.indexOf("gh release upload latest"));
    for (const name of new Set(links)) {
      expect(upload, `the rolling release publishes no ${name}`).toContain(name);
    }
  });

  it("is a pre-release, so `releases/latest` still means the newest version", () => {
    // GitHub excludes pre-releases from that pointer. Both releases can be
    // "latest" in their own sense only because this one is flagged.
    expect(yml).toContain("--prerelease");
  });

  it("creates or edits rather than deleting, so the link never 404s", () => {
    expect(yml).toContain("gh release view latest");
    expect(yml).toContain("gh release edit latest");
    expect(yml).toContain("gh release create latest");
    expect(yml).not.toContain("gh release delete");
  });

  it("gates on the version rather than on the file that holds it", () => {
    // `paths: [manifest.json]` is the cheap half and cannot tell a bump from a
    // description reword; the gate step is what asks the real question. This
    // one is `latest.yml`'s alone — `release.yml` has a tag and needs no gate.
    const latest = repoFile(".github/workflows/latest.yml");
    const wf = load(latest) as {
      on: { push: { branches: string[]; paths: string[] } };
    };
    expect(wf.on.push.paths).toEqual(["manifest.json"]);
    expect(latest).toContain("github.event.before");
    expect(latest).toContain("fetch-depth: 0");

    // Every step after the gate asks it. A step that forgot to would publish
    // on a push that changed nothing.
    const all = steps("latest");
    const after = all.slice(all.findIndex((s) => s.id === "gate") + 1);
    expect(after.length).toBeGreaterThan(0);
    for (const step of after) {
      expect(step.if, `${step.name} is not gated`).toBe(
        "steps.gate.outputs.changed == 'true'"
      );
    }
  });
});

describe("the versioned release", () => {
  it("still tags with the bare version Obsidian resolves", () => {
    const wf = load(repoFile(".github/workflows/release.yml")) as {
      on: { push: { tags: string[] } };
    };
    // Never `v5.2.0`. The community installer looks for the bare number.
    expect(wf.on.push.tags).toEqual(["[0-9]+.[0-9]+.[0-9]+"]);
  });

  it("attaches the three files the installer writes, loose", () => {
    expect(repoFile(".github/workflows/release.yml")).toContain(
      "main.js manifest.json styles.css"
    );
    // The rolling release publishes them under the same names, so a reader who
    // follows either link installs the same way.
    expect(repoFile(".github/actions/rolling-release/action.yml")).toContain(
      "main.js manifest.json styles.css"
    );
  });
});

describe("the release cadence", () => {
  // ── MINOR AND MAJOR ARE RELEASES; A PATCH IS NOT (1.0.0) ────────────────
  //
  // The policy has two halves that fail at different moments, and both are
  // swept here so that a reader changing one finds the other. `release.yml`
  // refuses a tag whose patch component is not zero, and `versions.json` --
  // the file Obsidian's installer resolves a build through -- lists only what
  // may be released. Neither implies the other: a patch could be hand-added to
  // the ledger without any tag existing, and a patch tag could be pushed at a
  // ledger that has never heard of it.

  // THE TWO PREDICATES, PULLED OUT OF THE FILES AND RUN. Both blocks below use
  // these rather than reading the YAML for a string, and the reason is one
  // version number: `1.0.10`. It ends in a zero, does not end in `.0`, and is a
  // patch -- so `case "$tag" in *.0)` gets it right by accident, `[ "${tag%0}"
  // != "$tag" ]` gets it wrong, and NO assertion that only reads the script can
  // tell those two apart. Running them can. These are the only tests in this
  // suite that start a process, and that is what buys.
  //
  // FOUND BY WHAT THEY DO, NOT BY THEIR NAMES. The header on this file says
  // nothing here pins a step's name or its position, and that still holds: the
  // release gate is the step that reads the ref name and asks for the component
  // after the last dot; the rolling gate is the line that compares that same
  // component against zero. Rename either, move either, and this still finds it.

  const releaseGate = steps("release").find(
    (step) =>
      step.run?.includes("GITHUB_REF_NAME") && step.run.includes("${tag##*.}")
  );

  // `latest.yml`'s gate cannot be executed whole -- it reads `manifest.json` and
  // interpolates `${{ github.event.before }}`, which is not bash. Its patch
  // question is one line and is the half under test, so that line is what comes
  // out: whatever this workflow compares against `"0"`, run for real.
  const rollingGuard = /if \[ "([^"]+)" = "0" \]; then/.exec(
    repoFile(".github/workflows/latest.yml")
  )?.[1];

  const bash = (script: string, env: Record<string, string>): boolean => {
    try {
      execFileSync("bash", ["-euo", "pipefail", "-c", script], {
        // The release gate writes its refusal to `$GITHUB_STEP_SUMMARY`. A run
        // on a workstation has no such file, and a step that fell over on the
        // write rather than on the version would pass for the wrong reason.
        env: { ...process.env, GITHUB_STEP_SUMMARY: "/dev/null", ...env },
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  };

  // Does `release.yml` cut a numbered release for this version?
  const releases = (v: string): boolean =>
    bash(releaseGate!.run!, { GITHUB_REF_NAME: v });

  // Does `latest.yml` move the rolling release for this version?
  const rolls = (v: string): boolean =>
    bash(`now="$NOW"; if [ "${rollingGuard}" = "0" ]; then exit 1; fi`, {
      NOW: v,
    });

  const MINORS = ["1.0.0", "1.1.0", "1.10.0", "2.0.0", "10.0.0"];
  const PATCHES = ["1.0.1", "1.0.10", "1.1.2", "0.0.7", "2.3.11"];

  it("refuses a patch tag, and runs the release for a minor or a major", () => {
    expect(releaseGate?.run, "release.yml has no step reading the patch component")
      .toBeTruthy();
    for (const v of MINORS) expect(releases(v), `${v} should release`).toBe(true);
    for (const v of PATCHES)
      expect(releases(v), `${v} should be refused`).toBe(false);
  });

  it("hands every version to exactly one publisher of the rolling release", () => {
    // THE PROPERTY THAT IS EASY TO LOSE AND SILENT WHEN LOST. `latest.yml`
    // declines a minor because `release.yml` publishes it off the tag; if that
    // tail were ever dropped, or if the two gates were adjusted independently
    // and stopped meeting, the three `releases/download/latest/` addresses the
    // README hands out would serve the previous minor's last patch build --
    // a real build, downloading fine, silently a version old. Nothing about
    // that fails a workflow: both jobs go green having each decided, correctly
    // by their own lights, that it was the other one's turn.
    //
    // So the claim is a partition, and both halves of it bite: NOT BOTH (which
    // would race two jobs to force-move one tag) and NOT NEITHER.
    expect(rollingGuard, "latest.yml has no patch guard").toBeTruthy();
    for (const v of [...MINORS, ...PATCHES]) {
      const publishers = [releases(v), rolls(v)].filter(Boolean).length;
      expect(publishers, `${v} is published by ${publishers} workflows`).toBe(1);
    }
    // And which one, so a partition that held while being exactly backwards
    // still fails here.
    for (const v of MINORS) expect(rolls(v), `${v} rolls from latest.yml`).toBe(false);
    for (const v of PATCHES) expect(rolls(v), `${v} does not roll`).toBe(true);
  });

  it("keeps the broad tag pattern, so a patch tag is answered rather than dropped", () => {
    // The half a narrowed `[0-9]+.[0-9]+.0` trigger would have taken away. A
    // workflow that never starts leaves nothing on the Actions page, which is
    // indistinguishable from one that started and decided to do nothing -- so
    // the pattern stays broad and the step above does the deciding. The exact
    // pattern is pinned one describe down, for the other reason: the bare
    // number is what the community installer resolves.
    const wf = load(repoFile(".github/workflows/release.yml")) as {
      on: { push: { tags: string[] } };
    };
    for (const pattern of wf.on.push.tags) {
      expect(pattern, "the trigger no longer matches a patch tag").not.toMatch(
        /\.0"?$/
      );
    }
  });

  it("lists no patch version in the ledger", () => {
    // `versions.json` is what a store install resolves a build through, so a
    // patch key in it advertises a version that has no release behind it --
    // `release.yml` would have refused the tag. The other direction is already
    // covered: the release requires its tag to be IN the ledger.
    const versions = JSON.parse(repoFile("versions.json")) as Record<
      string,
      string
    >;
    expect(Object.keys(versions).length).toBeGreaterThan(0);
    for (const v of Object.keys(versions)) {
      expect(v, `versions.json lists ${v}, which is a patch version`).toMatch(
        /^\d+\.\d+\.0$/
      );
    }
  });
});
