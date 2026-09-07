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
// THE ROLLING RELEASE IS THE ONE THAT DOES NOT. `latest.yml` copies two zips
// out of `../archives/` BY FILENAME, and those filenames are built in
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
  const yml = repoFile(".github/workflows/latest.yml");

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

    // And that `$v` is the manifest version the gate read, not a tag: this
    // workflow has no tag to read one from.
    expect(yml).toContain('v="${{ steps.gate.outputs.version }}"');
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
    // description reword; the gate step is what asks the real question.
    const wf = load(yml) as {
      on: { push: { branches: string[]; paths: string[] } };
    };
    expect(wf.on.push.paths).toEqual(["manifest.json"]);
    expect(yml).toContain("github.event.before");
    expect(yml).toContain("fetch-depth: 0");

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
    expect(repoFile(".github/workflows/latest.yml")).toContain(
      "main.js manifest.json styles.css"
    );
  });
});
