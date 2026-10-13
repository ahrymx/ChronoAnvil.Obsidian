// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSING.md.

// THE OTHER HALF. See `model.ts` beside this file.
//
// `KEYS` is the line that matters: a module-level call into the cyclic partner,
// exactly as `STATE_KEYS` in `ui/diary-link-window.ts` called `stateWord` from
// `diary/diary-link.ts`.

import { word } from "./model";

export function frame(): string {
  return "frame";
}

export const KEYS: string[] = [word()];
