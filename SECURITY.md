# Security policy

## Reporting a vulnerability

Email **contact@ahrymx.dev** with the subject `Security — ChronoAnvil`.

Please do not open a public issue. A vulnerability in a plugin that reads and
writes files in someone's vault is worth a quiet fix before it is a public one.

Include what you have: what the problem is, how to reproduce it, which version
you saw it in, and what an attacker could do with it. A rough report sent early
is more useful than a polished one sent late.

You should get an acknowledgement within a few days. This is a single-maintainer
project, so please allow reasonable time for a fix before disclosing publicly —
and say in your first email if you have a disclosure deadline in mind, so it can
be planned around rather than discovered.

## Supported versions

The latest release. Fixes go into a new version rather than being backported.

## Scope

ChronoAnvil runs inside Obsidian, with the access Obsidian gives it: your vault's
files. Things worth reporting:

- reading or writing files outside the configured vault paths
- executing content from a note as code
- a crafted note, directive, tracker definition or event entry that causes data
  loss, or that corrupts a file it was not meant to touch
- exfiltrating vault content anywhere off-device

That last one should never happen. ChronoAnvil makes no network requests of its
own, and does not bundle telemetry or analytics. If you find it talking to
anything, that is a serious finding and worth reporting immediately.

Out of scope: vulnerabilities in Obsidian itself (report those to
[Obsidian](https://obsidian.md/security)), and in the bundled MIT dependencies
listed in `NOTICE` — report those upstream, though telling us too is welcome so
the bundled version can be updated.
