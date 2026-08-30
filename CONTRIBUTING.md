# Contributing to ChronoAnvil

Issues and pull requests are welcome.

There are two things to read before you send code: the engineering contract,
and the licensing terms your contribution arrives under. The second one exists
and it is short.

---

## The engineering contract

The test suite is the contract:

```bash
npm install
npm test            # must pass
npm run typecheck   # must be clean
npx eslint src test # must be clean
```

Many tests assert *why* something is written the way it is. If one fails, read
its comment before changing it. A test that explains a decision is not an
obstacle to the change — it is the record of the argument you now need to
answer.

Other expectations:

- Keep the diff to the change. Unrelated reformatting makes review harder.
- New behaviour comes with a test. A bug fix comes with the test that would
  have caught it.
- **A test asserts behaviour by default.** Call the function, build the DOM,
  compose the note, and assert on what came back.
- **A test may assert on source text when the thing it protects is not
  observable at runtime** — that a helper is defined exactly once, that a retired
  word reaches no reader, that a decision recorded in a comment has not been
  quietly reversed. These are real and the suite should keep them. Say which one
  applies, in the test, in a sentence.
- Comments explain reasoning, not mechanics. The code already says what it
  does.
- `npm run package` should still produce a working `dist/chronoanvil/`.

### Keeping a copy of a version

There is no git repository here, so the archives ARE the history: a version that
is packaged and not archived is gone the moment the working tree moves on. Two
of them per version, in the sibling directories `chronoanvil-builds/` (the installable
plugin folder) and `chronoanvil-source/` (the whole tree, minus `node_modules/` and
`dist/`).

```
npm run release      # package, then archive both
npm run archive      # archive what is already in dist/
```

`tools/archive.mjs` does the work, and everything it refuses is worth knowing
about before you reach for `zip` by hand:

- it **anchors every path to the repository**, because the way these archives
  went wrong three times in one session was a `tar` in a subshell that had
  inherited a `cd`, writing a valid 410-byte archive of nothing;
- it **opens each archive after writing it** and checks the files its name
  claims, and **deletes** one that fails — a hollow archive left on disk looks
  exactly like a good one until the day it is the only copy;
- it **refuses a stale `dist/`**, which is the one error reading the archive back
  cannot catch: bump the version, archive, forget to package, and the previous
  build is filed under the new number;
- it **will not overwrite** an existing version's archive without `--force`.

---

## Licensing your contribution

### The short version

By opening a pull request you confirm that you wrote the contribution, or have
the right to submit it, and you grant AhryMX the rights needed to publish and
relicense it as part of ChronoAnvil. **You keep your copyright**, and your
contribution is published under the AGPL-3.0 like the rest of the project.

### Why this is asked

ChronoAnvil is under a single licence — AGPL-3.0 with section 7 attribution terms.
Nothing about today's licensing requires this grant, and it would be dishonest
to imply otherwise.

It is asked because a project with many contributors and no such grant can
never change its licence again. Not to something more restrictive — to anything
at all, including a later GPL, a dual-licence arrangement if the project ever
needs to fund itself, or a relicence forced by a dependency or a legal problem
nobody has foreseen. Getting the grant later means finding every contributor
and asking; getting it now costs a line in a pull request.

The trade is stated plainly rather than buried: you give up nothing you can
name today, and the project keeps an option it would otherwise lose
permanently. If that trade does not appeal, say so — see below.

### The grant

By submitting a contribution to this project, you agree to the following.

1. **Definitions.** "Contribution" means any original work of authorship you
   intentionally submit to the project — code, tests, documentation, assets,
   configuration — through a pull request, patch, issue attachment, or any
   other channel, excluding anything you clearly mark as "Not a Contribution".
   "Project Owner" means AhryMX <contact@ahrymx.dev>, the copyright holder of
   ChronoAnvil.

2. **You keep your copyright.** Nothing here transfers or assigns ownership of
   your Contribution. You remain free to use, publish, license, and relicense
   your own Contribution however you wish, elsewhere and in parallel.

3. **Copyright licence.** You grant the Project Owner a perpetual, worldwide,
   non-exclusive, irrevocable, royalty-free, transferable, sublicensable
   licence to reproduce, prepare derivative works of, publicly display,
   publicly perform, distribute, and otherwise exploit your Contribution and
   such derivative works, **under any licence terms, including the AGPL-3.0
   and any future licence the Project Owner adopts for the project.**

4. **Patent licence.** You grant the Project Owner and every recipient of the
   software a perpetual, worldwide, non-exclusive, irrevocable, royalty-free
   patent licence to make, have made, use, offer to sell, sell, import, and
   otherwise transfer your Contribution, in respect of any patent claim you
   own or control that is necessarily infringed by your Contribution alone or
   by its combination with the project. If you initiate patent litigation
   alleging that the project or a Contribution within it constitutes patent
   infringement, the patent licences granted to you under this section
   terminate as of the date the litigation is filed.

5. **Your representations.** You represent that:
   - each Contribution is your original creation, or you have the right to
     submit it under these terms;
   - you have the legal authority to grant the licences above;
   - if your employer has rights to work you create, you have permission to
     make the Contribution, or your employer has waived those rights, or your
     employer has authorised you to make the Contribution on its behalf;
   - your Contribution does not knowingly infringe anyone's rights and, to
     your knowledge, is free of any third-party claim or encumbrance;
   - you have disclosed any third-party code, and the licence it is under, in
     the pull request.

6. **Third-party material.** Do not paste code from elsewhere without saying
   so. If a Contribution includes third-party material, identify it, its
   source, and its licence in the pull request. Permissively licensed material
   (MIT, BSD, Apache-2.0) is usually fine; copyleft-encumbered material may be
   fine for the project as it stands today but would block any future
   relicence, which is exactly the option this grant exists to keep — so flag
   it rather than merging it quietly.

7. **AI-assisted contributions.** Tooling is fine. You are still responsible
   for the Contribution being yours to give, and for the representations in
   section 5 being true of it. If a tool reproduced substantial third-party
   code, section 6 applies.

8. **No warranty, no obligation.** You provide your Contribution "as is",
   without warranty of any kind. Nothing obliges the Project Owner to accept,
   merge, use, or keep a Contribution, or to compensate you for it.

9. **The public grant is permanent.** Every Contribution accepted into the
   project is published under the AGPL-3.0 as part of ChronoAnvil, and that grant
   to the public is irrevocable in accordance with the AGPL's own terms. A
   future relicence could add terms for future versions; it can never withdraw
   what has already been released.

### If you would rather not grant this

Say so in the pull request. Nothing bad happens. Depending on what the change
is, the outcome is usually one of:

- the change is small or obvious enough that it can be reimplemented
  independently and credited to you in the discussion;
- it is documentation or another artefact where the grant is not needed;
- it is taken as a bug report and fixed separately.

An unflagged contribution is assumed to be under the grant above, which is why
flagging matters more than agreeing.

### Recording agreement

Add this line to your pull request description, or to a commit message trailer:

```
ChronoAnvil-CLA-1.0: I agree to the contribution terms in CONTRIBUTING.md.
Signed-off-by: Your Name <your@email>
```

The `Signed-off-by` line also carries the standard
[Developer Certificate of Origin](https://developercertificate.org/) meaning:
you certify the Contribution is yours to submit.

---

## Reporting a security issue

Do not open a public issue. Email **contact@ahrymx.dev** with the details and a
reproduction, and allow reasonable time for a fix before any disclosure.

---

## Questions about licensing

`LICENSING.md` answers the common ones. Anything it does not:
**contact@ahrymx.dev**.
