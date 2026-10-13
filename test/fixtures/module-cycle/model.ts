// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSING.md.

// HALF OF THE DEFECT, ON PURPOSE. See `test/module-cycles.test.ts`.
//
// This pair is the shape that broke twenty-five suites in CI: `window.ts`
// reads a binding from `model.ts` AT MODULE LEVEL, and `model.ts` imports a
// value back. Whichever file a runner reaches first decides whether that read
// finds a function or `undefined`. It is here so the sweep that forbids the
// shape can be measured against it — a check nothing has ever failed is not a
// check (memory: `vacuous-sweep-rule`).
//
// NOTHING IN `src/` MAY IMPORT THIS. It throws on import by design.

import { frame } from "./window";

export function word(): string {
  return "word";
}

export const BUILT = frame();
