#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
#
# Licensed under the GNU Affero General Public License v3.0 or later, with
# attribution and naming terms under its section 7. See LICENSE and
# LICENSING.md.

# One-shot build for the ChronoAnvil plugin.
#
# The sandbox this was refactored in had no network access, so dependencies
# (obsidian types, esbuild, typescript) could not be installed there. Run this
# where npm can reach the registry to produce main.js.
#
#   ./build.sh          # typecheck + production bundle -> main.js
#   ./build.sh dev      # watch/dev build
#   ./build.sh package  # build, then assemble dist/chronoanvil/ for installation
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  echo "▶ Installing dependencies…"
  npm install
fi

if [ "${1:-}" = "dev" ]; then
  echo "▶ Dev build (watch)…"
  npm run dev
elif [ "${1:-}" = "package" ]; then
  echo "▶ Typecheck + production build + package…"
  npm run package
else
  echo "▶ Typecheck + production build…"
  npm run build
  echo "✅ Built main.js"
  ls -la main.js
fi
